import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { Breakout15MinConfig } from './dto/strategy.dto';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';
import { autoSelectStock } from './smart-stock-picker';

interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StrategyState {
  executionId: string;
  config: Breakout15MinConfig;
  brokerAccountId: string;
  isPaperTrade: boolean;
  futureSymbol: string | null;
  futureExchange: string;
  refHigh: number | null;
  refLow: number | null;
  refCandleSet: boolean;
  entryTriggered: 'LONG' | 'SHORT' | null;
  optionSymbol: string | null;
  entryOrderId: string | null;
  slOrderId: string | null;
  targetOrderId: string | null;
  tradesPlacedToday: number;
  logs: string[];
}


@Injectable()
export class Breakout15MinEngine {
  private readonly logger = new Logger(Breakout15MinEngine.name);
  private readonly running = new Map<string, StrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) { }

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) return { executionId: this.running.get(strategyId)!.executionId };

    const strategy = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
      include: { brokerAccount: true },
    });
    if (!strategy) throw new Error('Strategy not found');

    let brokerAccount = strategy.brokerAccount;
    if (!brokerAccount) {
      brokerAccount = await this.prisma.brokerAccount.findFirst({
        where: { userId: strategy.userId, isActive: true },
      });
      if (!brokerAccount) throw new Error('No active broker account found');
      await this.prisma.strategy.update({ where: { id: strategyId }, data: { brokerAccountId: brokerAccount.id } });
    }

    const config: Breakout15MinConfig = JSON.parse(strategy.config);
    const execution = await this.prisma.strategyExecution.create({ data: { strategyId, status: 'RUNNING' } });

    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: true } });

    const state: StrategyState = {
      executionId: execution.id,
      config,
      brokerAccountId: strategy.brokerAccountId!,
      isPaperTrade: (strategy as any).isPaperTrade,
      // For STOCK type, we trade the equity directly — no future needed
      futureSymbol: config.instrumentType === 'STOCK' ? config.symbol : null,
      futureExchange: config.instrumentType === 'STOCK' ? config.exchange : 'NFO',
      refHigh: null,
      refLow: null,
      refCandleSet: false,
      entryTriggered: null,
      optionSymbol: null,
      entryOrderId: null,
      slOrderId: null,
      targetOrderId: null,
      tradesPlacedToday: 0,
      logs: [],
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Strategy started — ${config.symbol}:${config.exchange}`);
    await this.persistLogs(state);

    const timer = setInterval(() => this.tick(strategyId).catch(e => this.logger.error(e)), 60_000);
    this.timers.set(strategyId, timer);

    // Run catch-up first, then start ticking
    this.initialCatchup(strategyId).then(() => {
      this.tick(strategyId).catch(e => this.logger.error(e));
    }).catch(e => this.logger.error(`Catch-up error: ${e.message}`));

    return { executionId: execution.id };
  }

  /**
   * Scans today's historical data to see if a breakout already happened before the engine was started.
   */
  private async initialCatchup(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    const now = new Date();
    const hhmm = this.getIstHhmm(now);

    // Only catch up if we are past 9:30 AM IST
    if (hhmm < 9 * 60 + 30) return;

    this.log(state, `🔍 Running initial catch-up for today's data...`);

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    try {
      // 1. Resolve Tradable Asset (Index Future or Equity Stock)
      if (!state.futureSymbol) {
        if (state.config.instrumentType === 'INDEX' || state.config.symbol.toUpperCase().includes('NIFTY')) {
          const res = await this.findFutureSymbol(kite, state.config.symbol);
          state.futureSymbol = res.symbol;
          state.futureExchange = res.exchange;
        } else if (state.config.symbol === 'AUTO') {
          const pick = await autoSelectStock(kite, state.config.targetRs, state.config.stopLossRs, this.logger);
          state.futureSymbol = pick.symbol;
          state.futureExchange = pick.exchange;
          this.log(state, `🎯 Auto-Selected Stock: ${state.futureSymbol} (via Smart Pick)`);
        } else {
          state.futureSymbol = state.config.symbol;
          state.futureExchange = state.config.exchange;
        }
      }

      // 2. Set Reference Range
      const candles15 = await this.fetchCandlesForSymbol(kite, state.futureSymbol, '15minute', now, state.futureExchange);
      if (candles15.length === 0) return;

      const ref = candles15[0];
      state.refHigh = ref.high;
      state.refLow = ref.low;
      state.refCandleSet = true;
      this.log(state, `📊 (Catch-up) Reference Range Set — H: ₹${ref.high} | L: ₹${ref.low}`);

      // 3. Scan 5-min candles for breakout
      const candles5 = await this.fetchCandlesForSymbol(kite, state.futureSymbol, '5minute', now, state.futureExchange);
      const breakoutCandidates = candles5.filter(c => this.getIstHhmm(new Date(c.date)) >= 9 * 60 + 30);

      for (const candle of breakoutCandidates) {
        if (state.entryTriggered) break;

        // Check if this candle is closed (at least 5 mins passed since its start)
        const candleStart = new Date(candle.date).getTime();
        if ((now.getTime() - candleStart) < 5 * 60 * 1000) continue;

        if (candle.close > state.refHigh!) {
          this.log(state, `🚀 (Catch-up) Found past BREAKOUT! 5-min candle (${this.formatTime(new Date(candle.date))}) closed at ₹${candle.close} > ₹${state.refHigh}`);
          await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', candle.close);
        } else if (candle.close < state.refLow!) {
          this.log(state, `🚀 (Catch-up) Found past BREAKOUT! 5-min candle (${this.formatTime(new Date(candle.date))}) closed at ₹${candle.close} < ₹${state.refLow}`);
          await this.placeBreakoutTrade(strategyId, state, client, account, 'SELL', candle.close);
        }
      }

      if (!state.entryTriggered) {
        this.log(state, `✅ Catch-up complete. No past breakouts found today.`);
      }
      await this.persistLogs(state);
    } catch (err) {
      this.log(state, `⚠ Catch-up failed: ${err.message}`);
      await this.persistLogs(state);
    }
  }

  async stop(strategyId: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      clearInterval(this.timers.get(strategyId));
      this.timers.delete(strategyId);
      this.running.delete(strategyId);
      this.log(state, '⏹ Strategy stopped by user');
      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { status: 'STOPPED', stoppedAt: new Date(), logs: JSON.stringify(state.logs) },
      });
    }
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: false } });
  }

  isRunning(strategyId: string): boolean {
    return this.running.has(strategyId);
  }

  getLogs(strategyId: string): string[] {
    return this.running.get(strategyId)?.logs || [];
  }

  getState(strategyId: string) {
    const s = this.running.get(strategyId);
    if (!s) return null;
    return {
      refHigh: s.refHigh,
      refLow: s.refLow,
      entryTriggered: s.entryTriggered,
      optionSymbol: s.optionSymbol,
      futureSymbol: s.futureSymbol,
      tradesToday: s.tradesPlacedToday,
    };
  }

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    const now = new Date();
    const hhmm = this.getIstHhmm(now);

    if (hhmm < 9 * 60 + 15 || hhmm >= 15 * 60 + 30) {
      if (hhmm < 9 * 60 + 15) this.resetDailyState(state);
      return;
    }

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'];
    const { config } = state;

    if (!state.futureSymbol) {
      if (state.config.instrumentType === 'INDEX' || state.config.symbol.toUpperCase().includes('NIFTY')) {
        try {
          const res = await this.findFutureSymbol(kite, config.symbol);
          state.futureSymbol = res.symbol;
          state.futureExchange = res.exchange;
          this.log(state, `🔎 Resolved Future: ${state.futureExchange}:${state.futureSymbol}`);
        } catch (err) { this.log(state, `❌ Resolve Error: ${err.message}`); return; }
      } else if (config.symbol === 'AUTO') {
        try {
          const pick = await autoSelectStock(kite, config.targetRs, config.stopLossRs, this.logger);
          state.futureSymbol = pick.symbol;
          state.futureExchange = pick.exchange;
          this.log(state, `🎯 Auto-Selected Stock: ${state.futureExchange}:${state.futureSymbol}`);
        } catch (err) { this.log(state, `❌ Auto-Select Error: ${err.message}`); return; }
      } else {
        state.futureSymbol = config.symbol;
        state.futureExchange = config.exchange;
        this.log(state, `📈 Equity Stock: ${config.exchange}:${config.symbol}`);
      }
    }

    if (!state.refCandleSet) {
      if (hhmm < 9 * 60 + 30) {
        this.log(state, `⏳ Waiting for 15-min Future range (Current: ${this.formatTime(now)})`);
        return;
      }
      try {
        const candles15 = await this.fetchCandlesForSymbol(kite, state.futureSymbol, '15minute', now, state.futureExchange);
        if (candles15.length > 0) {
          const ref = candles15[0];
          state.refHigh = ref.high;
          state.refLow = ref.low;
          state.refCandleSet = true;
          this.log(state, `📊 FUTURE Range Set — H: ₹${ref.high} | L: ₹${ref.low}`);
        }
      } catch (err) { this.log(state, `❌ 15-min error: ${err.message}`); return; }
    }

    if (state.entryTriggered || state.tradesPlacedToday >= config.maxTradesPerDay) return;

    try {
      const futureKey = `${state.futureExchange}:${state.futureSymbol}`;
      const ltpData = await kite.getLTP([futureKey]);
      const currentPrice = ltpData[futureKey]?.last_price;
      if (!currentPrice) return;

      const candles5 = await this.fetchCandlesForSymbol(kite, state.futureSymbol, '5minute', now, state.futureExchange);
      const breakoutCandidates = candles5.filter(c => this.getIstHhmm(new Date(c.date)) >= 9 * 60 + 30);
      if (breakoutCandidates.length === 0) return;

      const lastCandle = breakoutCandidates[breakoutCandidates.length - 1];
      const isClosed = (now.getTime() - new Date(lastCandle.date).getTime()) >= 5 * 60 * 1000;
      const target = isClosed ? lastCandle : (breakoutCandidates.length > 1 ? breakoutCandidates[breakoutCandidates.length - 2] : null);
      if (!target) return;

      if (hhmm % 5 === 0 && !state.logs.some(l => l.includes(`Scanning for breakout`) && l.includes(`LTP: ₹${currentPrice}`))) {
        this.log(state, `👀 Scanning for breakout (LTP: ₹${currentPrice}) — Range: ${state.refLow} to ${state.refHigh}`);
      }

      if (target.close > state.refHigh!) {
        this.log(state, `🚀 BREAKOUT! 5-min (${this.formatTime(new Date(target.date))}) closed at ₹${target.close} > ₹${state.refHigh}`);
        await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', currentPrice);
      } else if (target.close < state.refLow!) {
        this.log(state, `🚀 BREAKOUT! 5-min (${this.formatTime(new Date(target.date))}) closed at ₹${target.close} < ₹${state.refLow}`);
        await this.placeBreakoutTrade(strategyId, state, client, account, 'SELL', currentPrice);
      }
    } catch (err) { this.log(state, `❌ Tick error: ${err.message}`); }

    // ─── Paper/Real Trade Monitoring ─────────────────────────────────────────────
    if (state.entryTriggered) {
      if (state.isPaperTrade) {
        await this.monitorPaperTrade(state, kite);
      } else {
        await this.monitorRealTrade(state, client);
      }
    }

    await this.persistLogs(state);
  }

  private async monitorPaperTrade(state: StrategyState, kite: any) {
    if (!state.entryTriggered) return;

    try {
      const orders = await this.prisma.order.findMany({
        where: { executionId: state.executionId, isPaperTrade: true, status: 'OPEN' }
      });
      if (orders.length === 0) return;

      const symbol = orders[0].symbol;
      const exchange = orders[0].exchange;
      const quotes = await kite.getLTP([`${exchange}:${symbol}`]);
      const ltp = quotes[`${exchange}:${symbol}`]?.last_price;
      if (!ltp) return;

      for (const order of orders) {
        if (order.orderType === 'SL') {
          const hit = order.side === 'SELL' ? (ltp <= order.triggerPrice!) : (ltp >= order.triggerPrice!);
          if (hit) {
            this.log(state, `🔴 PAPER SL HIT! ${symbol} at ₹${ltp} (Trigger: ₹${order.triggerPrice})`);
            await this.closePaperTrade(state, 'SL_HIT', ltp);
            break;
          }
        } else if (order.orderType === 'LIMIT' && order.brokerOrderId.includes('TARGET')) {
          const hit = order.side === 'SELL' ? (ltp >= order.price!) : (ltp <= order.price!);
          if (hit) {
            this.log(state, `🟢 PAPER TARGET HIT! ${symbol} at ₹${ltp} (Target: ₹${order.price})`);
            await this.closePaperTrade(state, 'TARGET_HIT', ltp);
            break;
          }
        }
      }
    } catch (err) {
      this.logger.error(`Paper monitor error: ${err.message}`);
    }
  }

  private async monitorRealTrade(state: StrategyState, client: any) {
    if (!state.entryTriggered) return;

    try {
      const orders = await this.prisma.order.findMany({
        where: { executionId: state.executionId, isPaperTrade: false, status: 'OPEN' }
      });
      if (orders.length === 0) return;

      for (const order of orders) {
        if (order.brokerOrderId.includes('PAPER')) continue;
        
        const brokerOrder = await client.getOrder(order.brokerOrderId);
        if (brokerOrder.status === 'COMPLETE') {
          const reason = order.orderType === 'SL' ? 'SL HIT' : 'TARGET HIT';
          const sideEmoji = order.orderType === 'SL' ? '🔴' : '🟢';
          const fillPrice = brokerOrder.average_price || brokerOrder.price;
          
          this.log(state, `${sideEmoji} REAL TRADE EXIT: ${reason} at ₹${fillPrice}`);
          
          // Update order in DB
          await this.prisma.order.update({
            where: { id: order.id },
            data: { status: 'COMPLETE', price: fillPrice }
          });

          // Cancel other pending orders (SL or Target)
          const otherOrders = orders.filter(o => o.id !== order.id);
          for (const other of otherOrders) {
            await client.cancelOrder(other.brokerOrderId).catch(() => {});
            await this.prisma.order.update({ where: { id: other.id }, data: { status: 'CANCELLED' } });
          }

          state.entryTriggered = null;
          this.log(state, `🏁 Trade cycle complete.`);
          break;
        } else if (brokerOrder.status === 'REJECTED' || brokerOrder.status === 'CANCELLED') {
          this.log(state, `⚠ Order ${order.brokerOrderId} was ${brokerOrder.status}`);
          await this.prisma.order.update({ where: { id: order.id }, data: { status: brokerOrder.status } });
        }
      }
    } catch (err) {
      this.logger.error(`Real trade monitor error: ${err.message}`);
    }
  }

  private async closePaperTrade(state: StrategyState, reason: string, price: number) {
    await this.prisma.order.updateMany({
      where: { executionId: state.executionId, isPaperTrade: true, status: 'OPEN' },
      data: { status: 'COMPLETE', price }
    });
    this.log(state, `🏁 Paper trade closed (${reason}) at ₹${price}`);
    state.entryTriggered = null; // Allow more trades if maxTradesPerDay not reached
  }

  private async findFutureSymbol(kite: any, baseSymbol: string): Promise<{ symbol: string; exchange: string }> {
    const upperSymbol = baseSymbol.toUpperCase().trim();
    const isSensex = upperSymbol === 'SENSEX' || upperSymbol === 'BSE SENSEX';
    const exchange = isSensex ? 'BFO' : 'NFO';
    const segment = isSensex ? 'BFO-FUT' : 'NFO-FUT';
    let underlying = isSensex ? 'SENSEX' : upperSymbol.includes('BANK') ? 'BANKNIFTY' : (upperSymbol.includes('NIFTY 50') || upperSymbol === 'NIFTY') ? 'NIFTY' : upperSymbol.includes('FIN') ? 'FINNIFTY' : upperSymbol.includes('MID') ? 'MIDCPNIFTY' : upperSymbol;

    const instruments = await kite.getInstruments(exchange);
    const futures = instruments.filter((i: any) => i.name === underlying && i.instrument_type === 'FUT' && i.segment === segment);
    if (futures.length === 0) throw new Error(`No ${exchange} future for ${baseSymbol}`);
    const sorted = futures.sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    return { symbol: sorted[0].tradingsymbol, exchange };
  }

  private async fetchCandlesForSymbol(kite: any, symbol: string, interval: string, now: Date, exchange = 'NFO'): Promise<Candle[]> {
    const istDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    const from = new Date(`${istDateStr} 09:15:00 GMT+0530`);
    const instruments = await kite.getInstruments(exchange);
    const found = instruments.find((i: any) => i.tradingsymbol === symbol);
    if (!found) throw new Error(`Token not found for ${symbol}`);
    const data = await kite.getHistoricalData(found.instrument_token, interval, from, now, false);
    return (data || []).map((c: any) => ({ date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
  }

  private getIstHhmm(date: Date): number {
    const istStr = date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: false });
    const parts = istStr.split(':').map(Number);
    return parts[0] * 60 + (parts[1] || 0);
  }

  private async placeBreakoutTrade(strategyId: string, state: StrategyState, client: any, account: any, side: 'BUY' | 'SELL', triggerPrice: number) {
    const { config } = state;
    const kite = client['kite'];
    let symbol = config.symbol, exchange = config.exchange, finalSide: 'BUY' | 'SELL' = side;

    // Try to find an option ONLY for INDEX or NIFTY symbols (User wants equity for stocks)
    const isIndex = config.instrumentType === 'INDEX' || config.symbol.toUpperCase().includes('NIFTY') || config.symbol.toUpperCase().includes('SENSEX');

    if (isIndex) {
      try {
        const optionType = side === 'BUY' ? 'CE' : 'PE';
        const optSym = await this.findOptionSymbol(kite, state, triggerPrice, optionType);
        if (optSym) {
          symbol = optSym; exchange = 'NFO'; finalSide = 'BUY';
          const quotes = await kite.getLTP([`NFO:${symbol}`]);
          const ltp = quotes[`NFO:${symbol}`]?.last_price;
          if (ltp) {
            this.log(state, `💡 Selected Option LTP: ₹${ltp} (Underlying: ₹${triggerPrice.toFixed(2)})`);
            const entry = this.roundTick(ltp);
            const sl = this.roundTick(entry - (config.stopLossRs / config.qty));
            const tgt = this.roundTick(entry + (config.targetRs / config.qty));
            await this.executeOrders(strategyId, state, client, account, symbol, exchange, finalSide, entry, sl, tgt);
            return;
          }
        }
      } catch (err) { this.log(state, `❌ Option error: ${err.message}`); }
    }

    // Fallback: trade the spot/future directly
    const entry = this.roundTick(triggerPrice);
    const sl = side === 'BUY' ? this.roundTick(entry - config.stopLossRs / config.qty) : this.roundTick(entry + config.stopLossRs / config.qty);
    const tgt = side === 'BUY' ? this.roundTick(entry + config.targetRs / config.qty) : this.roundTick(entry - config.targetRs / config.qty);

    if (isIndex) {
      this.log(state, `⚠ Falling back to ${symbol} (Spot/Future) as no suitable option was found.`);
    }
    await this.executeOrders(strategyId, state, client, account, symbol, exchange, side, entry, sl, tgt);
  }

  private async executeOrders(strategyId: string, state: StrategyState, client: any, account: any, symbol: string, exchange: string, side: 'BUY' | 'SELL', entry: number, sl: number, tgt: number) {
    const { config, executionId } = state;
    this.log(state, `📋 Placing: ${symbol} — Entry: ₹${entry.toFixed(2)} | SL: ₹${sl.toFixed(2)} | Target: ₹${tgt.toFixed(2)}`);

    const entryId = state.isPaperTrade ? `PAPER_${Math.random().toString(36).substring(7).toUpperCase()}` : await client.placeOrder({ symbol, exchange, side, orderType: 'LIMIT', product: config.product, qty: config.qty, price: entry });
    this.log(state, `✅ Entry: ${entryId}`);
    await this.trackOrder(state, account, executionId, { symbol, exchange, side, orderType: 'LIMIT', product: config.product, qty: config.qty, price: entry }, entryId, strategyId);

    const exitSide = side === 'BUY' ? 'SELL' : 'BUY';
    const slId = state.isPaperTrade ? `PAPER_SL_${Math.random().toString(36).substring(7).toUpperCase()}` : await client.placeOrder({ symbol, exchange, side: exitSide, orderType: 'SL', product: config.product, qty: config.qty, price: sl, triggerPrice: sl }).catch(e => 'FAILED');
    await this.trackOrder(state, account, executionId, { symbol, exchange, side: exitSide, orderType: 'SL', product: config.product, qty: config.qty, price: sl, triggerPrice: sl }, slId, strategyId);

    const tgtId = state.isPaperTrade ? `PAPER_TARGET_${Math.random().toString(36).substring(7).toUpperCase()}` : await client.placeOrder({ symbol, exchange, side: exitSide, orderType: 'LIMIT', product: config.product, qty: config.qty, price: tgt }).catch(e => 'FAILED');
    await this.trackOrder(state, account, executionId, { symbol, exchange, side: exitSide, orderType: 'LIMIT', product: config.product, qty: config.qty, price: tgt }, tgtId, strategyId);

    state.entryTriggered = side === 'BUY' ? 'LONG' : 'SHORT';
    state.optionSymbol = symbol;
    state.tradesPlacedToday += 1;
  }

  private async findOptionSymbol(kite: any, state: StrategyState, spotPrice: number, type: 'CE' | 'PE'): Promise<string | null> {
    const { config } = state;
    const upper = config.symbol.toUpperCase().trim();

    // ─── Resolve the canonical underlying name for NFO instruments ───────────
    let underlying: string;
    if (upper.includes('BANKNIFTY') || upper === 'BANKNIFTY') underlying = 'BANKNIFTY';
    else if (upper === 'NIFTY 50' || upper === 'NIFTY') underlying = 'NIFTY';
    else if (upper.includes('FINNIFTY')) underlying = 'FINNIFTY';
    else if (upper.includes('MIDCPNIFTY')) underlying = 'MIDCPNIFTY';
    else if (upper.includes('SENSEX')) underlying = 'SENSEX';
    else underlying = upper; // For stocks, use the symbol directly (e.g. RELIANCE, TCS)

    const exchange = underlying === 'SENSEX' ? 'BFO' : 'NFO';
    const segment = underlying === 'SENSEX' ? 'BFO-OPT' : 'NFO-OPT';

    const instruments = await kite.getInstruments(exchange);
    const options = instruments.filter((i: any) => i.name === underlying && i.instrument_type === type && i.segment === segment);

    if (options.length === 0) {
      this.log(state, `⚠ No ${type} options found for ${underlying} on ${exchange}. Check if stock options are available.`);
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allExpiries = Array.from(new Set(options.map((i: any) => i.expiry)));
    const sortedExpiries = allExpiries
      .map(e => new Date(e as any))
      .filter(e => e >= today)
      .sort((a, b) => a.getTime() - b.getTime());

    if (sortedExpiries.length === 0) {
      this.log(state, `❌ No future expiries found for ${underlying}.`);
      return null;
    }

    const nearestExpiryDate = sortedExpiries[0];
    // Re-match the string/date to filter options
    const nearestExpiry = options.find((i: any) => new Date(i.expiry as any).getTime() === nearestExpiryDate.getTime())?.expiry;

    const filteredOptions = options.filter((i: any) => i.expiry === nearestExpiry);
    this.log(state, `📋 Found ${filteredOptions.length} ${type} options for ${underlying} (expiry: ${nearestExpiryDate.toDateString()})`);

    // ─── Option 1: Premium Range Selection (batched LTP calls) ───────────────
    if (config.minPremium && config.maxPremium) {
      this.log(state, `🔍 Searching for ${type} option in premium range ₹${config.minPremium} - ₹${config.maxPremium}...`);

      // ── Batch in chunks of 200 to avoid Zerodha's 500-symbol silent limit ──
      const allSymbols = filteredOptions.map((i: any) => `${exchange}:${i.tradingsymbol}`);
      const CHUNK = 200;
      const quotes: Record<string, any> = {};
      for (let i = 0; i < allSymbols.length; i += CHUNK) {
        const chunk = allSymbols.slice(i, i + CHUNK);
        try {
          const res = await kite.getLTP(chunk);
          Object.assign(quotes, res);
        } catch (e) {
          this.log(state, `⚠ LTP batch ${Math.floor(i / CHUNK) + 1} failed: ${e.message}`);
        }
      }

      let bestMatch: string | null = null;
      let minDiff = Infinity;
      const targetPremium = (config.minPremium + config.maxPremium) / 2;

      for (const opt of filteredOptions) {
        const key = `${exchange}:${opt.tradingsymbol}`;
        const ltp = quotes[key]?.last_price;
        if (ltp && ltp >= config.minPremium && ltp <= config.maxPremium) {
          const diff = Math.abs(ltp - targetPremium);
          if (diff < minDiff) {
            minDiff = diff;
            bestMatch = opt.tradingsymbol;
          }
        }
      }

      if (bestMatch) {
        this.log(state, `🎯 Found ${bestMatch} within premium range.`);
        return bestMatch;
      }
      this.log(state, `⚠ No option found in range ₹${config.minPremium}-₹${config.maxPremium}. Falling back to ATM.`);
    }

    // ─── Option 2: Default ATM Strike ────────────────────────────────────────
    // Strike step: NIFTY/FINNIFTY=50, MIDCPNIFTY=25, BANKNIFTY/stocks=100 (stocks vary — round to nearest)
    const isIndex = ['NIFTY', 'FINNIFTY'].includes(underlying);
    const isMid = underlying === 'MIDCPNIFTY';
    const step = isIndex ? 50 : isMid ? 25 : 100;
    const atmStrike = Math.round(spotPrice / step) * step;
    const match = filteredOptions.find((i: any) => Number(i.strike) === atmStrike);

    if (match) {
      this.log(state, `🎯 Selected ATM Strike: ${match.tradingsymbol} (Strike: ${match.strike})`);
      return match.tradingsymbol;
    }

    // ─── Option 3: Closest available strike (handles stock options with odd steps) ─
    let closestOpt: any = null;
    let closestDiff = Infinity;
    for (const opt of filteredOptions) {
      const diff = Math.abs(Number(opt.strike) - spotPrice);
      if (diff < closestDiff) { closestDiff = diff; closestOpt = opt; }
    }
    if (closestOpt) {
      this.log(state, `🎯 Using closest strike: ${closestOpt.tradingsymbol} (Strike: ${closestOpt.strike}, diff: ₹${closestDiff.toFixed(0)})`);
      return closestOpt.tradingsymbol;
    }

    return null;
  }

  private roundTick(price: number, tick = 0.05) { return Math.round(price / tick) * tick; }
  private formatTime(d: Date) { return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
  private log(state: StrategyState, msg: string) { const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); state.logs.push(`[${ts}] ${msg}`); this.logger.log(`[${state.executionId}] ${msg}`); }
  private async persistLogs(state: StrategyState) { await this.prisma.strategyExecution.update({ where: { id: state.executionId }, data: { logs: JSON.stringify(state.logs.slice(-200)) } }); }
  private async trackOrder(state: StrategyState, account: any, executionId: string, params: any, brokerOrderId: string, strategyId: string) {
    try {
      const isEntry = !brokerOrderId.includes('SL') && !brokerOrderId.includes('TARGET');
      await this.prisma.order.create({
        data: {
          userId: account.userId,
          brokerAccountId: account.id,
          executionId,
          symbol: params.symbol,
          exchange: params.exchange,
          side: params.side,
          orderType: params.orderType,
          productType: params.product,
          qty: params.qty,
          price: params.price ?? null,
          triggerPrice: params.triggerPrice ?? null,
          brokerOrderId,
          status: state.isPaperTrade ? (isEntry ? 'COMPLETE' : 'OPEN') : 'OPEN',
          isPaperTrade: state.isPaperTrade
        } as any
      });
    } catch (err) { this.log(state, `⚠ DB track failed: ${err.message}`); }
  }
  private resetDailyState(state: StrategyState) { state.refHigh = null; state.refLow = null; state.refCandleSet = false; state.entryTriggered = null; state.optionSymbol = null; state.tradesPlacedToday = 0; }
}
