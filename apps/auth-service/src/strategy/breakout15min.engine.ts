import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { Breakout15MinConfig } from './dto/strategy.dto';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';

// ─── Candle shape returned by Zerodha KiteConnect ─────────────────────────────
interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── Per-strategy runtime state ───────────────────────────────────────────────
interface StrategyState {
  executionId: string;
  config: Breakout15MinConfig;
  brokerAccountId: string;
  isPaperTrade: boolean;
  // 15-min reference candle (9:15–9:30)
  refHigh: number | null;
  refLow: number | null;
  refCandleSet: boolean;
  // Entry tracking
  entryTriggered: 'LONG' | 'SHORT' | null;
  entryOrderId: string | null;
  slOrderId: string | null;
  targetOrderId: string | null;
  tradesPlacedToday: number;
  logs: string[];
}

@Injectable()
export class Breakout15MinEngine {
  private readonly logger = new Logger(Breakout15MinEngine.name);

  // strategyId → state
  private readonly running = new Map<string, StrategyState>();
  // strategyId → interval handle
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) { }

  // ─── Public API ──────────────────────────────────────────────────────────────

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) {
      return { executionId: this.running.get(strategyId)!.executionId };
    }

    const strategy = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
      include: { brokerAccount: true },
    });

    if (!strategy || !strategy.brokerAccount) {
      throw new Error('Strategy or broker account not found');
    }

    const config: Breakout15MinConfig = JSON.parse(strategy.config);

    const execution = await this.prisma.strategyExecution.create({
      data: { strategyId, status: 'RUNNING' },
    });

    await this.prisma.strategy.update({
      where: { id: strategyId },
      data: { isActive: true },
    });

    const state: StrategyState = {
      executionId: execution.id,
      config,
      brokerAccountId: strategy.brokerAccountId!,
      isPaperTrade: (strategy as any).isPaperTrade,
      refHigh: null,
      refLow: null,
      refCandleSet: false,
      entryTriggered: null,
      entryOrderId: null,
      slOrderId: null,
      targetOrderId: null,
      tradesPlacedToday: 0,
      logs: [],
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Strategy started — ${config.symbol}:${config.exchange}`);

    // Poll every 60 seconds (aligned to candle checks)
    const timer = setInterval(
      () => this.tick(strategyId).catch((err) => this.logger.error(err)),
      60_000,
    );
    this.timers.set(strategyId, timer);

    // Run immediately on start
    this.tick(strategyId).catch((err) => this.logger.error(err));

    return { executionId: execution.id };
  }

  async stop(strategyId: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (!state) return;

    clearInterval(this.timers.get(strategyId));
    this.timers.delete(strategyId);
    this.running.delete(strategyId);

    this.log(state, '⏹ Strategy stopped by user');

    await this.prisma.strategyExecution.update({
      where: { id: state.executionId },
      data: {
        status: 'STOPPED',
        stoppedAt: new Date(),
        logs: JSON.stringify(state.logs),
      },
    });

    await this.prisma.strategy.update({
      where: { id: strategyId },
      data: { isActive: false },
    });
  }

  isRunning(strategyId: string) {
    return this.running.has(strategyId);
  }

  getLogs(strategyId: string): string[] {
    return this.running.get(strategyId)?.logs ?? [];
  }

  // ─── Core tick (runs every minute) ───────────────────────────────────────────

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    const now = new Date();
    const ist = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
    );
    const hhmm = ist.getHours() * 60 + ist.getMinutes();

    // Market closed — skip
    if (hhmm < 9 * 60 + 15 || hhmm >= 15 * 60 + 30) {
      // Reset state at market open for next day
      if (hhmm < 9 * 60 + 15) this.resetDailyState(state);
      return;
    }

    const account = await this.prisma.brokerAccount.findUnique({
      where: { id: state.brokerAccountId },
    });
    if (!account || !account.accessToken) {
      this.log(state, '⚠ No active broker session — skipping tick');
      return;
    }

    const client = this.factory.createClient(account);
    const { config } = state;

    // ── Step 1: Fetch 15-min candles to get reference candle ─────────────────
    if (!state.refCandleSet) {
      // Wait until after 9:30 so the first 15-min candle is complete
      if (hhmm < 9 * 60 + 30) {
        this.log(state, `⏳ Waiting for first 15-min candle to complete (${this.formatTime(ist)})`);
        return;
      }

      try {
        const candles15 = await this.fetchCandles(
          client,
          config,
          '15minute',
          ist,
        );
        if (candles15.length === 0) {
          this.log(state, '⚠ No 15-min candles received');
          return;
        }

        // First candle of the day = 9:15 candle
        const ref = candles15[0];
        state.refHigh = ref.high;
        state.refLow = ref.low;
        state.refCandleSet = true;
        this.log(
          state,
          `📊 Reference candle set — H: ₹${ref.high} | L: ₹${ref.low} (${this.formatTime(new Date(ref.date))})`,
        );
        await this.persistLogs(state);
      } catch (err) {
        this.log(state, `❌ Failed to fetch 15-min candles: ${err.message}`);
        return;
      }
    }

    // ── Step 2: Already traded today or limits reached ────────────────────────
    if (state.entryTriggered) {
      this.log(state, `ℹ Trade already placed today (${state.entryTriggered}) — monitoring`);
      return;
    }

    if (state.tradesPlacedToday >= config.maxTradesPerDay) {
      this.log(state, '🚫 Max trades per day reached — skipping');
      return;
    }

    // ── Step 3: Fetch 5-min candles, check last closed candle ────────────────
    try {
      const candles5 = await this.fetchCandles(client, config, '5minute', ist);
      if (candles5.length < 2) return; // Need at least 1 closed candle

      // Last completed 5-min candle (index -2, as index -1 is forming)
      const lastClosed = candles5[candles5.length - 2];

      this.log(
        state,
        `🕯 Last 5-min candle — O:${lastClosed.open} H:${lastClosed.high} L:${lastClosed.low} C:${lastClosed.close} @ ${this.formatTime(new Date(lastClosed.date))}`,
      );

      const { refHigh, refLow } = state;

      // ── LONG: 5-min candle closed ABOVE the 15-min high ──────────────────
      if (lastClosed.close > refHigh!) {
        this.log(
          state,
          `🟢 LONG signal! Close ${lastClosed.close} > 15-min High ${refHigh}`,
        );
        await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', lastClosed.close);
      }
      // ── SHORT: 5-min candle closed BELOW the 15-min low ──────────────────
      else if (lastClosed.close < refLow!) {
        this.log(
          state,
          `🔴 SHORT signal! Close ${lastClosed.close} < 15-min Low ${refLow}`,
        );
        await this.placeBreakoutTrade(strategyId, state, client, account, 'SELL', lastClosed.close);
      } else {
        this.log(
          state,
          `⏸ No signal — price ${lastClosed.close} within range [${refLow}, ${refHigh}]`,
        );
      }
    } catch (err) {
      this.log(state, `❌ Tick error: ${err.message}`);
    }

    await this.persistLogs(state);
  }

  // ─── Place Entry + SL + Target orders (all LIMIT) ────────────────────────────

  private async placeBreakoutTrade(
    strategyId: string,
    state: StrategyState,
    client: any,
    account: any,
    side: 'BUY' | 'SELL',
    triggerPrice: number,
  ) {
    const { config, executionId } = state;

    // Round to 0.05 (tick size for NSE)
    const entryPrice = this.roundTick(triggerPrice);
    const slPrice =
      side === 'BUY'
        ? this.roundTick(entryPrice - config.stopLossRs / config.qty)
        : this.roundTick(entryPrice + config.stopLossRs / config.qty);
    const targetPrice =
      side === 'BUY'
        ? this.roundTick(entryPrice + config.targetRs / config.qty)
        : this.roundTick(entryPrice - config.targetRs / config.qty);

    this.log(
      state,
      `📋 Placing orders — Entry: ₹${entryPrice} | SL: ₹${slPrice} | Target: ₹${targetPrice} | Qty: ${config.qty}`,
    );

    // ── Entry Order (LIMIT) ───────────────────────────────────────────────────
    const entryParams: OrderParams = {
      symbol: config.symbol,
      exchange: config.exchange,
      side,
      orderType: 'LIMIT',
      product: config.product as any,
      qty: config.qty,
      price: entryPrice,
    };

    let entryOrderId: string;
    try {
      if (state.isPaperTrade) {
        entryOrderId = `PAPER_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        this.log(state, `📝 [PAPER] Entry order simulated — ID: ${entryOrderId}`);
      } else {
        entryOrderId = await client.placeOrder(entryParams);
        this.log(state, `✅ Entry order placed — ID: ${entryOrderId}`);
      }
    } catch (err) {
      this.log(state, `❌ Entry order FAILED: ${err.message}`);
      return;
    }

    // Track in DB
    await this.trackOrder(state, account, executionId, entryParams, entryOrderId, strategyId);

    // ── Stop Loss Order (SL-LIMIT) ────────────────────────────────────────────
    const slSide = side === 'BUY' ? 'SELL' : 'BUY';
    const slParams: OrderParams = {
      symbol: config.symbol,
      exchange: config.exchange,
      side: slSide,
      orderType: 'SL',
      product: config.product as any,
      qty: config.qty,
      price: slPrice,
      triggerPrice: slPrice,
    };

    let slOrderId: string;
    try {
      if (state.isPaperTrade) {
        slOrderId = `PAPER_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        this.log(state, `🛡 [PAPER] SL order simulated — ID: ${slOrderId} @ ₹${slPrice}`);
      } else {
        slOrderId = await client.placeOrder(slParams);
        this.log(state, `🛡 SL order placed — ID: ${slOrderId} @ ₹${slPrice}`);
      }
    } catch (err) {
      this.log(state, `❌ SL order FAILED: ${err.message}`);
      slOrderId = 'FAILED';
    }

    await this.trackOrder(state, account, executionId, slParams, slOrderId, strategyId);

    // ── Target Order (LIMIT) ──────────────────────────────────────────────────
    const targetParams: OrderParams = {
      symbol: config.symbol,
      exchange: config.exchange,
      side: slSide,
      orderType: 'LIMIT',
      product: config.product as any,
      qty: config.qty,
      price: targetPrice,
    };

    let targetOrderId: string;
    try {
      if (state.isPaperTrade) {
        targetOrderId = `PAPER_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        this.log(state, `🎯 [PAPER] Target order simulated — ID: ${targetOrderId} @ ₹${targetPrice}`);
      } else {
        targetOrderId = await client.placeOrder(targetParams);
        this.log(state, `🎯 Target order placed — ID: ${targetOrderId} @ ₹${targetPrice}`);
      }
    } catch (err) {
      this.log(state, `❌ Target order FAILED: ${err.message}`);
      targetOrderId = 'FAILED';
    }

    await this.trackOrder(state, account, executionId, targetParams, targetOrderId, strategyId);

    // ── Update state ──────────────────────────────────────────────────────────
    state.entryTriggered = side === 'BUY' ? 'LONG' : 'SHORT';
    state.entryOrderId = entryOrderId;
    state.slOrderId = slOrderId;
    state.targetOrderId = targetOrderId;
    state.tradesPlacedToday += 1;

    this.log(state, `🏁 All 3 orders placed for ${state.entryTriggered} trade`);
  }

  // ─── Fetch historical candles via Zerodha KiteConnect ────────────────────────

  private async fetchCandles(
    client: any,
    config: Breakout15MinConfig,
    interval: '15minute' | '5minute',
    ist: Date,
  ): Promise<Candle[]> {
    // Today's market session
    const from = new Date(ist);
    from.setHours(9, 15, 0, 0);
    const to = new Date(ist);

    // Use Zerodha's historical API via kite.getHistoricalData
    const kite = client['kite']; // access internal kite instance
    if (!kite) throw new Error('KiteConnect instance not accessible');

    // Zerodha needs instrument_token — look it up from cached instruments
    // For indices we use their specific tokens
    const token = await this.resolveInstrumentToken(kite, config);

    const data = await kite.getHistoricalData(token, interval, from, to, false);
    // data is array of { date, open, high, low, close, volume }
    return (data || []).map((c: any) => ({
      date: new Date(c.date),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }

  private async resolveInstrumentToken(
    kite: any,
    config: Breakout15MinConfig,
  ): Promise<number> {
    // Well-known index tokens for Zerodha
    const indexTokens: Record<string, number> = {
      'NIFTY 50': 256265,
      'NIFTY50': 256265,
      'BANKNIFTY': 260105,
      'BANK NIFTY': 260105,
      'SENSEX': 265,
      'NIFTY MIDCAP 50': 288009,
    };

    const upperSymbol = config.symbol.toUpperCase().trim();
    if (indexTokens[upperSymbol]) return indexTokens[upperSymbol];

    // For stocks — fetch instruments and find token
    const instruments: any[] = await kite.getInstruments(config.exchange);
    const found = instruments.find(
      (i: any) =>
        i.tradingsymbol === upperSymbol && i.instrument_type === 'EQ',
    );
    if (!found) throw new Error(`Instrument token not found for ${config.symbol}`);
    return found.instrument_token;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  private roundTick(price: number, tick = 0.05): number {
    return Math.round(price / tick) * tick;
  }

  private formatTime(d: Date): string {
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  private log(state: StrategyState, msg: string) {
    const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const entry = `[${ts}] ${msg}`;
    state.logs.push(entry);
    this.logger.log(`[${state.executionId}] ${msg}`);
  }

  private async persistLogs(state: StrategyState) {
    await this.prisma.strategyExecution.update({
      where: { id: state.executionId },
      data: { logs: JSON.stringify(state.logs.slice(-200)) }, // keep last 200 entries
    });
  }

  private async trackOrder(
    state: StrategyState,
    account: any,
    executionId: string,
    params: OrderParams,
    brokerOrderId: string,
    strategyId: string,
  ) {
    try {
      await this.prisma.order.create({
        data: {
          userId: account.userId,
          brokerAccountId: account.id,
          executionId,
          symbol: params.symbol,
          exchange: params.exchange,
          side: params.side as any,
          orderType: params.orderType as any,
          productType: params.product as any,
          qty: params.qty,
          price: params.price ?? null,
          triggerPrice: params.triggerPrice ?? null,
          brokerOrderId,
          status: state.isPaperTrade ? 'COMPLETE' : 'OPEN',
          isPaperTrade: state.isPaperTrade,
        } as any,
      });
    } catch (err) {
      this.log(state, `⚠ DB order tracking failed: ${err.message}`);
    }
  }

  private resetDailyState(state: StrategyState) {
    state.refHigh = null;
    state.refLow = null;
    state.refCandleSet = false;
    state.entryTriggered = null;
    state.entryOrderId = null;
    state.slOrderId = null;
    state.targetOrderId = null;
    state.tradesPlacedToday = 0;
  }
}
