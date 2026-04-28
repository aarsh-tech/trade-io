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
  // Future symbol being watched (e.g. NIFTY24APRFUT)
  futureSymbol: string | null;
  // Exchange for the resolved future (NFO for NSE, BFO for BSE/SENSEX)
  futureExchange: string;
  // 15-min reference candle (9:15–9:30) of the FUTURE
  refHigh: number | null;
  refLow: number | null;
  refCandleSet: boolean;
  // Confirmation candle tracking
  signalCandleHigh: number | null;
  signalCandleLow: number | null;
  waitingForConfirmation: 'LONG' | 'SHORT' | null;
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

    if (!strategy) {
      throw new Error('Strategy not found');
    }

    let brokerAccount = strategy.brokerAccount;
    if (!brokerAccount) {
      // Fallback: Find any active broker account for the user
      brokerAccount = await this.prisma.brokerAccount.findFirst({
        where: { userId: strategy.userId, isActive: true },
      });
      if (!brokerAccount) {
        throw new Error('No active broker account found to fetch market data. Please connect a broker.');
      }
      
      // Auto-link it to the strategy for future
      await this.prisma.strategy.update({
        where: { id: strategyId },
        data: { brokerAccountId: brokerAccount.id },
      });
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
      futureSymbol: null,
      futureExchange: 'NFO', // Default; overridden during symbol resolution
      refHigh: null,
      refLow: null,
      refCandleSet: false,
      signalCandleHigh: null,
      signalCandleLow: null,
      waitingForConfirmation: null,
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

    // Clean up in-memory state if the engine was actually running
    if (state) {
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
    }

    // Always update isActive in DB — handles the case where the server
    // restarted after auto-start (running map is cleared but DB still
    // has isActive=true, so the Stop button would silently do nothing).
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
    const kite = client['kite'];

    // ── Step 0: Resolve Future Symbol if not set ─────────────────────────────
    if (!state.futureSymbol) {
      try {
        const resolved = await this.findFutureSymbol(kite, config.symbol);
        state.futureSymbol = resolved.symbol;
        state.futureExchange = resolved.exchange;
        this.log(state, `🔎 Resolved Future: ${state.futureExchange}:${state.futureSymbol}`);
      } catch (err) {
        this.log(state, `❌ Failed to resolve Future: ${err.message}`);
        return;
      }
    }

    // ── Step 1: Fetch 15-min Future candles to get reference range ────────────
    if (!state.refCandleSet) {
      if (hhmm < 9 * 60 + 30) {
        this.log(state, `⏳ Waiting for 15-min Future range (${this.formatTime(ist)})`);
        return;
      }

      try {
        const candles15 = await this.fetchCandlesForSymbol(kite, state.futureSymbol, '15minute', ist, state.futureExchange);
        if (candles15.length === 0) {
          this.log(state, '⚠ No Future 15-min candles received');
          return;
        }

        const ref = candles15[0];
        state.refHigh = ref.high;
        state.refLow = ref.low;
        state.refCandleSet = true;
        this.log(state, `📊 FUTURE Range Set — H: ₹${ref.high} | L: ₹${ref.low}`);
      } catch (err) {
        this.log(state, `❌ 15-min Future Error: ${err.message}`);
        return;
      }
    }

    // ── Step 2: Skip if already traded today ──────────────────────────────────
    if (state.entryTriggered) return;
    if (state.tradesPlacedToday >= config.maxTradesPerDay) return;

    // ── Step 3: Check for Signal / Confirmation ───────────────────────────────
    try {
      const futureKey = `${state.futureExchange}:${state.futureSymbol}`;
      const ltpData = await kite.getLTP([futureKey]);
      const currentFuturePrice = ltpData[futureKey]?.last_price;
      
      if (!currentFuturePrice) return;

      // CASE A: We are waiting for the High of the Signal candle to be broken
      if (state.waitingForConfirmation) {
        if (state.waitingForConfirmation === 'LONG' && currentFuturePrice > state.signalCandleHigh!) {
          this.log(state, `🚀 Triggered! Future ${currentFuturePrice} broke Signal High ${state.signalCandleHigh}`);
          await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', currentFuturePrice);
          return;
        }
        if (state.waitingForConfirmation === 'SHORT' && currentFuturePrice < state.signalCandleLow!) {
          this.log(state, `🚀 Triggered! Future ${currentFuturePrice} broke Signal Low ${state.signalCandleLow}`);
          await this.placeBreakoutTrade(strategyId, state, client, account, 'SELL', currentFuturePrice);
          return;
        }
        return; // Still waiting for break
      }

      // CASE B: Waiting for a 5-min candle to CLOSE above/below the 15-min range
      const candles5 = await this.fetchCandlesForSymbol(kite, state.futureSymbol, '5minute', ist, state.futureExchange);
      if (candles5.length < 2) return;

      const lastClosed = candles5[candles5.length - 2];
      const { refHigh, refLow } = state;

      // LONG SIGNAL: 5-min Close > 15-min Future High
      if (lastClosed.close > refHigh!) {
        state.waitingForConfirmation = 'LONG';
        state.signalCandleHigh = lastClosed.high + 1; // High of the 5-min candle + 1
        this.log(state, `🔔 SIGNAL: 5-min close (${lastClosed.close}) > Ref High. Waiting for break of ₹${state.signalCandleHigh}`);
      }
      // SHORT SIGNAL: 5-min Close < 15-min Future Low
      else if (lastClosed.close < refLow!) {
        state.waitingForConfirmation = 'SHORT';
        state.signalCandleLow = lastClosed.low - 1; // Low of the 5-min candle - 1
        this.log(state, `🔔 SIGNAL: 5-min close (${lastClosed.close}) < Ref Low. Waiting for break of ₹${state.signalCandleLow}`);
      }

    } catch (err) {
      this.log(state, `❌ Tick error: ${err.message}`);
    }

    await this.persistLogs(state);
  }

  private async findFutureSymbol(kite: any, baseSymbol: string): Promise<{ symbol: string; exchange: string }> {
    const upperSymbol = baseSymbol.toUpperCase().trim();

    // ── SENSEX futures trade on BSE's BFO exchange ──
    const isSensex = upperSymbol === 'SENSEX' || upperSymbol === 'BSE SENSEX';
    const exchange = isSensex ? 'BFO' : 'NFO';
    const segment  = isSensex ? 'BFO-FUT' : 'NFO-FUT';

    // Normalise to the underlying name used in the instruments dump
    let underlying: string;
    if (isSensex) {
      underlying = 'SENSEX';
    } else if (upperSymbol.includes('NIFTY BANK') || upperSymbol.includes('BANKNIFTY')) {
      underlying = 'BANKNIFTY';
    } else if (upperSymbol.includes('NIFTY 50') || upperSymbol === 'NIFTY50' || upperSymbol === 'NIFTY') {
      underlying = 'NIFTY';
    } else if (upperSymbol.includes('NIFTY MIDCAP') || upperSymbol.includes('MIDCAP')) {
      underlying = 'MIDCPNIFTY';
    } else if (upperSymbol.includes('FINNIFTY') || upperSymbol.includes('FIN NIFTY')) {
      underlying = 'FINNIFTY';
    } else {
      underlying = upperSymbol; // stock futures
    }

    const instruments = await kite.getInstruments(exchange);
    const futures = instruments.filter((i: any) =>
      i.name === underlying && i.instrument_type === 'FUT' && i.segment === segment
    );

    if (futures.length === 0) {
      throw new Error(`No ${exchange} future found for '${baseSymbol}' (searched as '${underlying}')`);
    }

    // Sort by expiry ascending → pick nearest (current-month)
    const sorted = futures.sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    return { symbol: sorted[0].tradingsymbol, exchange };
  }

  private async fetchCandlesForSymbol(kite: any, symbol: string, interval: string, ist: Date, exchange = 'NFO'): Promise<Candle[]> {
    const from = new Date(ist); from.setHours(9, 15, 0, 0);
    const to = new Date(ist);

    const instruments = await kite.getInstruments(exchange);
    const found = instruments.find((i: any) => i.tradingsymbol === symbol);
    if (!found) throw new Error(`Token not found for ${symbol} on ${exchange}`);

    const data = await kite.getHistoricalData(found.instrument_token, interval, from, to, false);
    return (data || []).map((c: any) => ({
      date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume
    }));
  }


  // ─── Place Entry + SL + Target orders (all LIMIT) ────────────────────────────

  private async placeBreakoutTrade(
    strategyId: string,
    state: StrategyState,
    client: any,
    account: any,
    side: 'BUY' | 'SELL', // This is the SIGNAL side (BUY for high breakout, SELL for low breakout)
    triggerPrice: number, // Spot price at breakout
  ) {
    const { config, executionId } = state;
    const kite = client['kite'];

    let tradingSymbol = config.symbol;
    let tradingExchange = config.exchange;
    let finalSide: 'BUY' | 'SELL' = 'BUY'; // We usually BUY options for both directions

    // ─── OPTION TRADING LOGIC ────────────────────────────────────────────────
    if (config.instrumentType === 'INDEX' || config.symbol.includes('NIFTY')) {
      this.log(state, `🔍 Detecting best ATM option for ${config.symbol} breakout...`);
      try {
        const optionType = side === 'BUY' ? 'CE' : 'PE';
        const optionSymbol = await this.findOptionSymbol(kite, config.symbol, triggerPrice, optionType);
        if (optionSymbol) {
          tradingSymbol = optionSymbol;
          tradingExchange = 'NFO';
          finalSide = 'BUY'; // Always buying the option (Call for up, Put for down)
          this.log(state, `🎯 Selected Option: ${tradingSymbol} (Type: ${optionType})`);
          
          // Fetch Option LTP to calculate entry/SL/Target
          const quotes = await kite.getLTP([`NFO:${tradingSymbol}`]);
          const optionLtp = quotes[`NFO:${tradingSymbol}`]?.last_price;
          if (optionLtp) {
             this.log(state, `💰 Option LTP: ₹${optionLtp}`);
             // Re-calculate prices based on Option Premium
             // If user wants ₹1000 SL on 1 lot (50 qty), SL is 20 points from entry
             const entryPrice = this.roundTick(optionLtp);
             const slPrice = this.roundTick(entryPrice - (config.stopLossRs / config.qty));
             const targetPrice = this.roundTick(entryPrice + (config.targetRs / config.qty));

             await this.executeOrders(strategyId, state, client, account, tradingSymbol, tradingExchange, finalSide, entryPrice, slPrice, targetPrice);
             return;
          }
        }
      } catch (err) {
        this.log(state, `❌ Option Selection Error: ${err.message}. Falling back to equity.`);
      }
    }

    // ─── DEFAULT EQUITY/INDEX LOGIC ──────────────────────────────────────────
    const entryPrice = this.roundTick(triggerPrice);
    const slPrice =
      side === 'BUY'
        ? this.roundTick(entryPrice - config.stopLossRs / config.qty)
        : this.roundTick(entryPrice + config.stopLossRs / config.qty);
    const targetPrice =
      side === 'BUY'
        ? this.roundTick(entryPrice + config.targetRs / config.qty)
        : this.roundTick(entryPrice - config.targetRs / config.qty);

    await this.executeOrders(strategyId, state, client, account, tradingSymbol, tradingExchange, side, entryPrice, slPrice, targetPrice);
  }

  private async executeOrders(
    strategyId: string,
    state: StrategyState,
    client: any,
    account: any,
    symbol: string,
    exchange: string,
    side: 'BUY' | 'SELL',
    entryPrice: number,
    slPrice: number,
    targetPrice: number
  ) {
    const { config, executionId } = state;

    this.log(state, `📋 Placing orders for ${symbol} — Entry: ₹${entryPrice} | SL: ₹${slPrice} | Target: ₹${targetPrice}`);

    // 1. Entry Order
    const entryParams: OrderParams = {
      symbol, exchange, side,
      orderType: 'LIMIT',
      product: config.product as any,
      qty: config.qty,
      price: entryPrice,
    };

    let entryOrderId: string;
    try {
      entryOrderId = state.isPaperTrade 
        ? `PAPER_${Math.random().toString(36).substring(7).toUpperCase()}`
        : await client.placeOrder(entryParams);
      this.log(state, `✅ Entry placed: ${entryOrderId}`);
    } catch (err) {
      this.log(state, `❌ Entry FAILED: ${err.message}`);
      return;
    }
    await this.trackOrder(state, account, executionId, entryParams, entryOrderId, strategyId);

    // 2. SL Order
    const exitSide = side === 'BUY' ? 'SELL' : 'BUY';
    const slParams: OrderParams = {
      symbol, exchange, side: exitSide,
      orderType: 'SL',
      product: config.product as any,
      qty: config.qty,
      price: slPrice,
      triggerPrice: slPrice,
    };
    let slOrderId = state.isPaperTrade ? 'PAPER_SL' : await client.placeOrder(slParams).catch(e => { this.log(state, `❌ SL Failed: ${e.message}`); return 'FAILED'; });
    await this.trackOrder(state, account, executionId, slParams, slOrderId, strategyId);

    // 3. Target Order
    const targetParams: OrderParams = {
      symbol, exchange, side: exitSide,
      orderType: 'LIMIT',
      product: config.product as any,
      qty: config.qty,
      price: targetPrice,
    };
    let targetOrderId = state.isPaperTrade ? 'PAPER_TARGET' : await client.placeOrder(targetParams).catch(e => { this.log(state, `❌ Target Failed: ${e.message}`); return 'FAILED'; });
    await this.trackOrder(state, account, executionId, targetParams, targetOrderId, strategyId);

    state.entryTriggered = side === 'BUY' ? 'LONG' : 'SHORT';
    state.entryOrderId = entryOrderId;
    state.slOrderId = slOrderId;
    state.targetOrderId = targetOrderId;
    state.tradesPlacedToday += 1;
  }

  private async findOptionSymbol(kite: any, baseSymbol: string, spotPrice: number, type: 'CE' | 'PE'): Promise<string | null> {
    const instruments: any[] = await kite.getInstruments('NFO');
    const underlying = baseSymbol.includes('NIFTY 50') ? 'NIFTY' : baseSymbol.includes('BANK') ? 'BANKNIFTY' : baseSymbol.toUpperCase();
    
    // 1. Filter for current underlying and type
    const options = instruments.filter(i => 
      i.name === underlying && 
      i.instrument_type === type &&
      i.segment === 'NFO-OPT'
    );

    if (options.length === 0) return null;

    // 2. Find closest expiry
    const expiries = Array.from(new Set(options.map(i => i.expiry))).sort();
    const nearestExpiry = expiries[0];

    // 3. Find ATM Strike (rounding to 50 for Nifty, 100 for BankNifty)
    const step = underlying === 'NIFTY' ? 50 : 100;
    const atmStrike = Math.round(spotPrice / step) * step;

    // 4. Find the exact instrument
    const match = options.find(i => i.expiry === nearestExpiry && Number(i.strike) === atmStrike);
    return match ? match.tradingsymbol : null;
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
