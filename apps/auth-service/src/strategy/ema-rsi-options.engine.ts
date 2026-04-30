import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';

// ─── Strategy config ──────────────────────────────────────────────────────────
export interface EmaRsiOptionsConfig {
  symbol: string;          // 'NIFTY 50' | 'BANKNIFTY' | 'SENSEX'
  exchange: string;        // 'NSE' | 'BSE'
  instrumentType: string;  // 'INDEX' | 'STOCK'
  emaFast: number;         // 9
  emaSlow: number;         // 21
  rsiPeriod: number;       // 14
  rsiEntryMin: number;     // 45
  rsiEntryMax: number;     // 65
  lots: number;            // 1
  stopLossRs: number;      // 500
  targetRs: number;        // 500
  maxTradesPerDay: number; // 2
  product: string;         // MIS
  startAfterMin: number;   // 25
}

// ─── Runtime state ────────────────────────────────────────────────────────────
interface Candle { date: Date; open: number; high: number; low: number; close: number; volume: number; }

interface StrategyState {
  executionId: string;
  config: EmaRsiOptionsConfig;
  brokerAccountId: string;
  isPaperTrade: boolean;
  futureSymbol: string | null;
  futureExchange: string;
  // Open position tracking
  positionSide: 'CALL' | 'PUT' | null;
  optionSymbol: string | null;     // Also used for STOCK symbol
  entryOptionPrice: number | null; // Also used for STOCK entry price
  positionQty: number;
  entryOrderId: string | null;
  tradesPlacedToday: number;
  lastSignalBar: number;   // bar index of last signal (prevent duplicate)
  logs: string[];
}

// ─── RSI calculator ───────────────────────────────────────────────────────────
function calcRSI(candles: Candle[], period: number): number {
  if (candles.length < period + 1) return 50;
  const changes = candles.slice(1).map((c, i) => c.close - candles[i].close);
  const recent = changes.slice(-period);
  const gains = recent.filter(d => d > 0).reduce((s, d) => s + d, 0) / period;
  const losses = recent.filter(d => d < 0).reduce((s, d) => s + Math.abs(d), 0) / period;
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

// ─── EMA calculator ───────────────────────────────────────────────────────────
function calcEMA(candles: Candle[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema = [candles[0].close];
  for (let i = 1; i < candles.length; i++) {
    ema.push(candles[i].close * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

// ─── VWAP (from 9:15 AM) ─────────────────────────────────────────────────────
function calcVWAP(candles: Candle[]): number {
  let cumPV = 0, cumV = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumV += c.volume;
  }
  return cumV === 0 ? candles[candles.length - 1].close : cumPV / cumV;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

import { autoSelectStock } from './smart-stock-picker';

@Injectable()
export class EmaRsiOptionsEngine {
  private readonly logger = new Logger(EmaRsiOptionsEngine.name);
  private readonly running = new Map<string, StrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) { }

  // ── Public API ──────────────────────────────────────────────────────────────

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) {
      return { executionId: this.running.get(strategyId)!.executionId };
    }

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

    const config: EmaRsiOptionsConfig = JSON.parse(strategy.config);
    const execution = await this.prisma.strategyExecution.create({ data: { strategyId, status: 'RUNNING' } });
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: true } });

    const state: StrategyState = {
      executionId: execution.id,
      config,
      brokerAccountId: brokerAccount.id,
      isPaperTrade: (strategy as any).isPaperTrade,
      futureSymbol: null,
      futureExchange: 'NFO',
      positionSide: null,
      optionSymbol: null,
      entryOptionPrice: null,
      positionQty: 0,
      entryOrderId: null,
      tradesPlacedToday: 0,
      lastSignalBar: -99,
      logs: [],
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ EMA-RSI Options strategy started — ${config.symbol}`);

    // Run every 5 minutes
    const timer = setInterval(
      () => this.tick(strategyId).catch(e => this.logger.error(e)),
      5 * 60_000,
    );
    this.timers.set(strategyId, timer);
    this.tick(strategyId).catch(e => this.logger.error(e));
    return { executionId: execution.id };
  }

  async stop(strategyId: string): Promise<void> {
    const state = this.running.get(strategyId);

    // Clean up in-memory state if the engine was actually running
    if (state) {
      clearInterval(this.timers.get(strategyId));
      this.timers.delete(strategyId);
      this.running.delete(strategyId);
      this.log(state, '⏹ Strategy stopped');
      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { status: 'STOPPED', stoppedAt: new Date(), logs: JSON.stringify(state.logs) },
      });
    }

    // Always update isActive in DB — handles the case where the server
    // restarted after auto-start (running map is cleared but DB still
    // has isActive=true, so the Stop button would silently do nothing).
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: false } });
  }

  isRunning(strategyId: string) { return this.running.has(strategyId); }
  getLogs(strategyId: string): string[] { return this.running.get(strategyId)?.logs ?? []; }

  getState(strategyId: string) {
    const s = this.running.get(strategyId);
    if (!s) return null;
    return {
      futureSymbol: s.futureSymbol,
      optionSymbol: s.optionSymbol,
      entryPrice: s.entryOptionPrice,
      side: s.positionSide,
      tradesToday: s.tradesPlacedToday,
    };
  }

  // ── Main tick ────────────────────────────────────────────────────────────────

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const h = ist.getHours();
    const m = ist.getMinutes();
    const hhmm = h * 60 + m;

    // Market hours: 9:15 – 15:25 (stop 5 min before close)
    if (hhmm < 9 * 60 + 15 || hhmm >= 15 * 60 + 25) {
      if (hhmm < 9 * 60 + 15) this.resetDay(state);
      return;
    }

    // Skip the first N minutes (noise / fake moves)
    const marketMinutes = hhmm - (9 * 60 + 15);
    if (marketMinutes < (state.config.startAfterMin ?? 25)) {
      this.log(state, `⏳ Waiting for market to settle (${marketMinutes}/${state.config.startAfterMin}min)`);
      return;
    }

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account?.accessToken) { this.log(state, '⚠ No active broker session'); return; }

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    // ── Step 0: Resolve future (only for INDEX) ──────────────────────────────
    if (!state.futureSymbol) {
      if (state.config.instrumentType === 'INDEX') {
        try {
          const resolved = await this.resolveFuture(kite, state.config.symbol);
          state.futureSymbol = resolved.symbol;
          state.futureExchange = resolved.exchange;
          this.log(state, `🔎 Resolved: ${state.futureExchange}:${state.futureSymbol}`);
        } catch (e) {
          this.log(state, `❌ Future resolve failed: ${e.message}`); return;
        }
      } else {
        // STOCK — Trade directly
        if (state.config.symbol === 'AUTO') {
          try {
            const pick = await autoSelectStock(kite, state.config.targetRs, state.config.stopLossRs, this.logger);
            state.futureSymbol = pick.symbol;
            state.futureExchange = pick.exchange;
            this.log(state, `🎯 Auto-Selected Stock: ${state.futureSymbol} (via Smart Pick)`);
          } catch (e) {
            state.futureSymbol = 'RELIANCE';
            state.futureExchange = 'NSE';
            this.log(state, `Auto-Select fallback: ${state.futureSymbol}`);
          }
        } else {
          state.futureSymbol = state.config.symbol;
          state.futureExchange = state.config.exchange;
        }
      }
    }

    // ── Step 1: Check open position SL/Target ────────────────────────────────
    if (state.positionSide && state.optionSymbol) {
      await this.monitorPosition(state, kite);
      return; // only one trade at a time
    }

    // ── Step 2: Check max trades ──────────────────────────────────────────────
    if (state.tradesPlacedToday >= state.config.maxTradesPerDay) {
      this.log(state, `⛔ Max ${state.config.maxTradesPerDay} trades reached today`); return;
    }

    // ── Step 3: Fetch 5-min candles, calculate indicators ────────────────────
    try {
      const candles = await this.fetch5min(kite, state.futureSymbol, state.futureExchange, ist);
      if (candles.length < 22) { this.log(state, '⚠ Not enough 5-min bars yet'); return; }

      const emaFastArr = calcEMA(candles, state.config.emaFast ?? 9);
      const emaSlowArr = calcEMA(candles, state.config.emaSlow ?? 21);
      const vwap = calcVWAP(candles);
      const rsi = calcRSI(candles, state.config.rsiPeriod ?? 14);

      const n = candles.length - 1;
      const prevFast = emaFastArr[n - 1];
      const prevSlow = emaSlowArr[n - 1];
      const currFast = emaFastArr[n];
      const currSlow = emaSlowArr[n];
      const price = candles[n].close;

      const rsiMin = state.config.rsiEntryMin ?? 45;
      const rsiMax = state.config.rsiEntryMax ?? 65;

      // ── BULLISH: EMA fast crosses above slow + RSI in range + above VWAP ───
      const bullishCross = prevFast <= prevSlow && currFast > currSlow;
      const bullishRSI = rsi >= rsiMin && rsi <= rsiMax;
      const aboveVWAP = price > vwap;

      // ── BEARISH: EMA fast crosses below slow + RSI in inverted range + below VWAP ──
      const bearishCross = prevFast >= prevSlow && currFast < currSlow;
      const bearishRSI = rsi >= (100 - rsiMax) && rsi <= (100 - rsiMin);
      const belowVWAP = price < vwap;

      this.log(state, `📊 Price:₹${price.toFixed(2)} | EMA9:${currFast.toFixed(2)} EMA21:${currSlow.toFixed(2)} | RSI:${rsi.toFixed(1)} | VWAP:₹${vwap.toFixed(2)}`);

      if (n === state.lastSignalBar) { this.log(state, '⏭ Already acted on this bar'); return; }

      if (bullishCross && bullishRSI && aboveVWAP) {
        this.log(state, `✅ BULLISH SIGNAL — EMA cross✓ RSI ${rsi.toFixed(1)}✓ Above VWAP✓`);
        state.lastSignalBar = n;
        await this.enterTrade(strategyId, state, kite, client, account, 'CALL', price);
      } else if (bearishCross && bearishRSI && belowVWAP) {
        this.log(state, `✅ BEARISH SIGNAL — EMA cross✓ RSI ${rsi.toFixed(1)}✓ Below VWAP✓`);
        state.lastSignalBar = n;
        await this.enterTrade(strategyId, state, kite, client, account, 'PUT', price);
      }

    } catch (e) {
      this.log(state, `❌ Tick error: ${e.message}`);
    }

    await this.persistLogs(state);
  }

  // ── Monitor open position for SL/Target ──────────────────────────────────────

  private async monitorPosition(state: StrategyState, kite: any) {
    if (!state.optionSymbol || !state.entryOptionPrice) return;

    try {
      const isIndex = state.config.instrumentType === 'INDEX';
      const optExchange = isIndex ? (state.futureExchange === 'BFO' ? 'BFO' : 'NFO') : state.futureExchange;
      const key = `${optExchange}:${state.optionSymbol}`;
      const ltp = await kite.getLTP([key]);
      const currentPrice = ltp[key]?.last_price;
      if (!currentPrice) return;

      let pnlRs = 0;
      if (isIndex) {
        // Options: Always LONG CE or PE
        pnlRs = (currentPrice - state.entryOptionPrice) * state.positionQty;
      } else {
        // Stocks: LONG for CALL signal, SHORT for PUT signal
        if (state.positionSide === 'CALL') {
          pnlRs = (currentPrice - state.entryOptionPrice) * state.positionQty;
        } else {
          pnlRs = (state.entryOptionPrice - currentPrice) * state.positionQty;
        }
      }

      this.log(state, `👀 ${state.positionSide} ${state.optionSymbol}: ₹${currentPrice.toFixed(2)} (P&L: ₹${pnlRs.toFixed(2)})`);

      if (pnlRs <= -state.config.stopLossRs) {
        this.log(state, `🛑 SL HIT — Exiting at ₹${currentPrice.toFixed(2)}`);
        await this.exitPosition(state, currentPrice, 'SL');
      } else if (pnlRs >= state.config.targetRs) {
        this.log(state, `🎯 TARGET HIT — Exiting at ₹${currentPrice.toFixed(2)}`);
        await this.exitPosition(state, currentPrice, 'TARGET');
      }
    } catch (e) {
      this.log(state, `⚠ Monitor error: ${e.message}`);
    }
  }

  // ── Enter trade (buy ATM option or stock) ──────────────────────────────────

  private async enterTrade(
    strategyId: string, state: StrategyState, kite: any, client: any, account: any,
    side: 'CALL' | 'PUT', indexPrice: number,
  ) {
    try {
      const isIndex = state.config.instrumentType === 'INDEX';
      let tradingSymbol = state.config.symbol;
      let tradingExchange = state.config.exchange;
      let entryPx = indexPrice; // default for stock
      let tradeSide: 'BUY' | 'SELL' = side === 'CALL' ? 'BUY' : 'SELL';

      if (isIndex) {
        const optExchange = state.futureExchange === 'BFO' ? 'BFO' : 'NFO';
        const optSymbol = await this.findATMOption(kite, state.config.symbol, indexPrice, side === 'CALL' ? 'CE' : 'PE');
        if (!optSymbol) { this.log(state, `❌ No ATM ${side} option found`); return; }

        const key = `${optExchange}:${optSymbol}`;
        const ltp = await kite.getLTP([key]);
        const optLTP = ltp[key]?.last_price;
        if (!optLTP || optLTP <= 0) { this.log(state, `❌ Option LTP not available for ${optSymbol}`); return; }

        tradingSymbol = optSymbol;
        tradingExchange = optExchange;
        entryPx = optLTP;
        tradeSide = 'BUY'; // Always buy options
      }

      const lotSize = isIndex ? this.getLotSize(state.config.symbol) : 1;
      let qty = (state.config.lots ?? 1) * lotSize;
      
      // Dynamic Quantity Calculation for Auto-Selected Stocks
      if (state.config.symbol === 'AUTO' && !isIndex) {
         const expectedMove = entryPx * 0.015;
         qty = Math.ceil(state.config.targetRs / expectedMove);
         this.log(state, `🧮 Auto Qty Calculated: ${qty} shares (to earn ₹${state.config.targetRs} on a 1.5% move)`);
      }

      entryPx = this.roundTick(entryPx);

      this.log(state, `📋 ${tradeSide} ${tradingSymbol} | LTP ₹${entryPx} | SL ₹${state.config.stopLossRs} | Target ₹${state.config.targetRs} | Qty ${qty}`);

      const params: OrderParams = {
        symbol: tradingSymbol, exchange: tradingExchange,
        side: tradeSide, orderType: 'MARKET',
        product: state.config.product as any ?? 'MIS', qty, price: 0,
      };

      let orderId: string;
      if (state.isPaperTrade) {
        orderId = `PAPER_${Date.now().toString(36).toUpperCase()}`;
        this.log(state, `📝 PAPER TRADE — simulated order ${orderId}`);
      } else {
        orderId = await client.placeOrder(params);
      }

      // Store position
      state.positionSide = side; // 'CALL'/'PUT' representing the signal direction
      state.optionSymbol = tradingSymbol;
      state.entryOptionPrice = entryPx;
      state.positionQty = qty;
      state.entryOrderId = orderId;
      state.tradesPlacedToday++;

      await this.trackOrder(state, account, params, orderId, strategyId);
    } catch (e) {
      this.log(state, `❌ Entry failed: ${e.message}`);
    }
  }

  // ── Exit position ─────────────────────────────────────────────────────────────

  private async exitPosition(state: StrategyState, exitPx: number, reason: 'SL' | 'TARGET') {
    let profit = 0;
    const isIndex = state.config.instrumentType === 'INDEX';
    if (isIndex) {
      profit = (exitPx - state.entryOptionPrice!) * state.positionQty;
    } else {
      if (state.positionSide === 'CALL') {
        profit = (exitPx - state.entryOptionPrice!) * state.positionQty;
      } else {
        profit = (state.entryOptionPrice! - exitPx) * state.positionQty;
      }
    }

    this.log(state, `📤 Exit — Reason: ${reason} | P&L: ${profit >= 0 ? '+' : ''}₹${profit.toFixed(0)}`);
    // Reset position
    state.positionSide = null;
    state.optionSymbol = null;
    state.entryOptionPrice = null;
    state.positionQty = 0;
    state.entryOrderId = null;
  }

  // ── Find ATM option ───────────────────────────────────────────────────────────

  private async findATMOption(kite: any, baseSymbol: string, spotPrice: number, type: 'CE' | 'PE'): Promise<string | null> {
    const isSensex = baseSymbol.toUpperCase().includes('SENSEX');
    const exchange = isSensex ? 'BFO' : 'NFO';
    const underlying = this.resolveUnderlying(baseSymbol);
    const step = this.getStrikeStep(baseSymbol);

    const instruments = await kite.getInstruments(exchange);
    const options = instruments.filter((i: any) =>
      i.name === underlying && i.instrument_type === type && (isSensex ? i.segment === 'BFO-OPT' : i.segment === 'NFO-OPT')
    );
    if (options.length === 0) return null;

    const expiries = Array.from(new Set(options.map((i: any) => i.expiry))).sort() as string[];
    const nearExpiry = expiries[0];
    const atmStrike = Math.round(spotPrice / step) * step;

    // Try ATM, then ±1 step
    for (const strike of [atmStrike, atmStrike + step, atmStrike - step]) {
      const match = options.find((i: any) => i.expiry === nearExpiry && Number(i.strike) === strike);
      if (match) return match.tradingsymbol;
    }
    return null;
  }

  private async fetch5min(kite: any, symbol: string, exchange: string, ist: Date): Promise<Candle[]> {
    const from = new Date(ist); from.setHours(9, 15, 0, 0);
    const to = new Date(ist);

    let token = 0;
    const indexTokens: Record<string, number> = { 'NIFTY 50': 256265, 'BANKNIFTY': 260105, 'SENSEX': 265 };

    const instruments = await kite.getInstruments(exchange);
    const found = instruments.find((i: any) => i.tradingsymbol === symbol);

    if (!found) {
      if (indexTokens[symbol.toUpperCase()]) token = indexTokens[symbol.toUpperCase()];
      else throw new Error(`Token not found for ${symbol} on ${exchange}`);
    } else {
      token = found.instrument_token;
    }

    const data = await kite.getHistoricalData(token, '5minute', from, to, false);
    return (data || []).map((c: any) => ({
      date: new Date(c.date), open: c.open, high: c.high,
      low: c.low, close: c.close, volume: c.volume,
    }));
  }

  // ── Resolve future symbol ─────────────────────────────────────────────────────

  private async resolveFuture(kite: any, symbol: string): Promise<{ symbol: string; exchange: string }> {
    const upper = symbol.toUpperCase().trim();
    const isSensex = upper === 'SENSEX' || upper === 'BSE SENSEX';
    const exchange = isSensex ? 'BFO' : 'NFO';
    const segment = isSensex ? 'BFO-FUT' : 'NFO-FUT';
    const underlying = this.resolveUnderlying(symbol);

    const instruments = await kite.getInstruments(exchange);
    const futures = instruments.filter((i: any) =>
      i.name === underlying && i.instrument_type === 'FUT' && i.segment === segment
    );
    if (futures.length === 0) throw new Error(`No ${exchange} future for ${symbol}`);
    futures.sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    return { symbol: futures[0].tradingsymbol, exchange };
  }

  private resolveUnderlying(symbol: string): string {
    const u = symbol.toUpperCase().trim();
    if (u === 'SENSEX' || u === 'BSE SENSEX') return 'SENSEX';
    if (u.includes('BANK') && u.includes('NIFTY')) return 'BANKNIFTY';
    if (u.includes('NIFTY 50') || u === 'NIFTY50' || u === 'NIFTY') return 'NIFTY';
    if (u.includes('MIDCAP')) return 'MIDCPNIFTY';
    if (u.includes('FIN')) return 'FINNIFTY';
    return u;
  }

  private getStrikeStep(symbol: string): number {
    const u = symbol.toUpperCase();
    if (u.includes('BANK')) return 100;
    if (u.includes('SENSEX')) return 100;
    if (u.includes('FIN')) return 50;
    return 50; // Nifty 50
  }

  private getLotSize(symbol: string): number {
    const u = symbol.toUpperCase();
    if (u.includes('BANK')) return 15;
    if (u.includes('SENSEX')) return 10;
    if (u.includes('FIN')) return 40;
    return 75; // Nifty 50
  }

  private roundTick(price: number, tick = 0.05): number {
    return Math.round(price / tick) * tick;
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
      data: { logs: JSON.stringify(state.logs.slice(-200)) },
    });
  }

  private resetDay(state: StrategyState) {
    state.positionSide = null;
    state.optionSymbol = null;
    state.entryOptionPrice = null;
    state.positionQty = 0;
    state.entryOrderId = null;
    state.tradesPlacedToday = 0;
    state.lastSignalBar = -99;
    state.futureSymbol = null;
  }

  private async trackOrder(state: StrategyState, account: any, params: OrderParams, orderId: string, strategyId: string) {
    try {
      await this.prisma.order.create({
        data: {
          userId: account.userId, brokerAccountId: account.id,
          executionId: state.executionId,
          symbol: params.symbol, exchange: params.exchange,
          side: params.side as any, orderType: params.orderType as any,
          productType: params.product as any, qty: params.qty,
          price: params.price ?? null, triggerPrice: null,
          brokerOrderId: orderId,
          status: state.isPaperTrade ? 'COMPLETE' : 'OPEN',
          isPaperTrade: state.isPaperTrade,
        } as any,
      });
    } catch (e) {
      this.log(state, `⚠ Order tracking failed: ${e.message}`);
    }
  }
}
