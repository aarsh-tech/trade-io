import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';
import { DailyScalperConfig } from './dto/strategy.dto';

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
  config: DailyScalperConfig;
  brokerAccountId: string;
  isPaperTrade: boolean;
  futureSymbol: string | null;
  futureExchange: string;

  // Open position tracking
  positionSide: 'CE' | 'PE' | null;
  optionSymbol: string | null;
  entryOptionPrice: number | null;
  positionQty: number;
  entryOrderId: string | null;

  // Daily tracker
  tradesPlacedToday: number;
  totalPnlToday: number;
  lastSignalBarTime: number; // ts of last signal bar to prevent duplicate entries
  isStopLossTrailed?: boolean; // tracks if trailing SL is locked to breakeven
  logs: string[];
}

// ─── Indicator Calculators ───────────────────────────────────────────────────

function calcRSI(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 50;
  const changes = candles.slice(1).map((c, i) => c.close - candles[i].close);
  const recent = changes.slice(-period);
  const gains = recent.filter(d => d > 0).reduce((s, d) => s + d, 0) / period;
  const losses = recent.filter(d => d < 0).reduce((s, d) => s + Math.abs(d), 0) / period;
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function calcEMA(candles: Candle[], period: number): number[] {
  if (candles.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [candles[0].close];
  for (let i = 1; i < candles.length; i++) {
    ema.push(candles[i].close * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcVWAP(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  let cumPV = 0, cumV = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumV += c.volume;
  }
  return cumV === 0 ? candles[candles.length - 1].close : cumPV / cumV;
}

@Injectable()
export class DailyScalperEngine {
  private readonly logger = new Logger(DailyScalperEngine.name);
  private readonly running = new Map<string, StrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

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

    const config: DailyScalperConfig = JSON.parse(strategy.config);
    const execution = await this.prisma.strategyExecution.create({ data: { strategyId, status: 'RUNNING' } });
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: true } });

    const state: StrategyState = {
      executionId: execution.id,
      config,
      brokerAccountId: brokerAccount.id,
      isPaperTrade: strategy.isPaperTrade,
      futureSymbol: null,
      futureExchange: 'NFO',
      positionSide: null,
      optionSymbol: null,
      entryOptionPrice: null,
      positionQty: 0,
      entryOrderId: null,
      tradesPlacedToday: 0,
      totalPnlToday: 0,
      lastSignalBarTime: 0,
      logs: [],
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Daily Scalper strategy started — ${config.symbol} | Target: ₹${config.dailyTargetRs} | Max Loss: ₹${config.dailyMaxLossRs}`);

    // Tick every 15 seconds for high precision exit tracking and candle updates
    const timer = setInterval(
      () => this.tick(strategyId).catch(e => this.logger.error(e)),
      15_000,
    );
    this.timers.set(strategyId, timer);
    this.tick(strategyId).catch(e => this.logger.error(e));
    return { executionId: execution.id };
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

  private async stopWithStatus(strategyId: string, status: 'COMPLETED' | 'STOPPED', logReason: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      clearInterval(this.timers.get(strategyId));
      this.timers.delete(strategyId);
      this.running.delete(strategyId);
      this.log(state, logReason);
      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { status, stoppedAt: new Date(), logs: JSON.stringify(state.logs) },
      });
    }
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: false } });
  }

  isRunning(strategyId: string) { return this.running.has(strategyId); }
  getLogs(strategyId: string): string[] { return this.running.get(strategyId)?.logs ?? []; }

  getState(strategyId: string) {
    const s = this.running.get(strategyId);
    if (!s) return null;
    return {
      symbol: s.config.symbol,
      optionSymbol: s.optionSymbol,
      entryPrice: s.entryOptionPrice,
      side: s.positionSide,
      tradesToday: s.tradesPlacedToday,
      pnlToday: s.totalPnlToday,
    };
  }

  // ─── Core Tick Loop ─────────────────────────────────────────────────────────

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const h = ist.getHours();
    const m = ist.getMinutes();
    const hhmm = h * 60 + m;

    const MARKET_OPEN = 9 * 60 + 15;
    const MARKET_CLOSE = 15 * 60 + 30;

    // Reset daily counters before market opens
    if (hhmm < MARKET_OPEN) {
      this.resetDailyCounters(state);
      return;
    }

    // Stop checking after market closes
    if (hhmm >= MARKET_CLOSE) {
      if (state.positionSide && state.optionSymbol) {
        await this.forceExitAll(state, 'MARKET_CLOSE_EXIT');
      }
      return;
    }

    // ── Check Daily Profit & Loss Targets ────────────────────────────────────
    if (state.totalPnlToday >= state.config.dailyTargetRs) {
      this.log(state, `🎯 Daily Profit Target of ₹${state.config.dailyTargetRs} met! Net P&L: ₹${state.totalPnlToday.toFixed(0)}. Halting trading today to secure profits.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'COMPLETED', `🎯 Auto-Stopped: Daily Profit Target Met`);
      return;
    }

    if (state.totalPnlToday <= -state.config.dailyMaxLossRs) {
      this.log(state, `🛑 Daily Max Loss of ₹${state.config.dailyMaxLossRs} hit! Net P&L: ₹${state.totalPnlToday.toFixed(0)}. Halting trading today to protect capital.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'STOPPED', `🛑 Auto-Stopped: Daily Max Loss Hit`);
      return;
    }

    // Fetch broker account & client
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account?.accessToken) {
      this.log(state, '⚠ No active broker session');
      return;
    }

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    // Resolve underlying index future symbol
    if (!state.futureSymbol) {
      try {
        const resolved = await this.resolveFuture(client, state.config.symbol);
        state.futureSymbol = resolved.symbol;
        state.futureExchange = resolved.exchange;
        this.log(state, `🔎 Resolved Index Future: ${state.futureExchange}:${state.futureSymbol}`);
      } catch (e) {
        this.log(state, `❌ Future resolve failed: ${e.message}`);
        return;
      }
    }

    // ── Check Active Open Position ──────────────────────────────────────────
    if (state.positionSide && state.optionSymbol) {
      await this.monitorOpenPosition(state, kite);
      await this.persistLogs(state);
      return; // Skip new entry searches while in a trade
    }

    // ── Settle Period (Skip first 15 minutes of market opening noise) ─────────
    const minutesSinceOpen = hhmm - MARKET_OPEN;
    if (minutesSinceOpen < 15) {
      this.log(state, `⏳ Waiting for opening volatility to settle (${minutesSinceOpen}/15 mins)`);
      await this.persistLogs(state);
      return;
    }

    // ── Mid-day Time Filter (Skip trading between 11:30 AM and 01:30 PM IST) ──
    const MID_DAY_START = 11 * 60 + 30; // 11:30 AM (690 minutes)
    const MID_DAY_END = 13 * 60 + 30;   // 01:30 PM (810 minutes)
    if (hhmm >= MID_DAY_START && hhmm < MID_DAY_END) {
      this.log(state, `⏳ Skipping trading during low-volume mid-day period (11:30 AM - 01:30 PM IST)`);
      await this.persistLogs(state);
      return;
    }

    // ── Check Max Daily Trade Cap ───────────────────────────────────────────
    if (state.tradesPlacedToday >= state.config.maxTradesPerDay) {
      this.log(state, `⛔ Max daily trade cap (${state.config.maxTradesPerDay}) reached.`);
      await this.persistLogs(state);
      return;
    }

    // ── Fetch 3-min Candles and Calculate Indicators ────────────────────────
    try {
      const candles = await this.fetchCandles3min(client, state.futureSymbol, state.futureExchange, ist);
      if (candles.length < 20) {
        this.log(state, `⚠ Not enough historical bars to calculate 9-EMA and 14-RSI (${candles.length}/20)`);
        await this.persistLogs(state);
        return;
      }

      const ema9 = calcEMA(candles, 9);
      const vwap = calcVWAP(candles);
      const rsi = calcRSI(candles, 14);

      const n = candles.length - 1;
      const latestCandle = candles[n];
      const latestClose = latestCandle.close;
      const latestEma = ema9[n];
      const latestRsi = rsi;

      // Prevent entry on same bar twice
      const currentBarTime = new Date(latestCandle.date).getTime();
      if (currentBarTime === state.lastSignalBarTime) {
        return;
      }

      this.log(state, `📊 Spot Future: ₹${latestClose.toFixed(2)} | 9-EMA: ₹${latestEma.toFixed(2)} | VWAP: ₹${vwap.toFixed(2)} | RSI: ${latestRsi.toFixed(1)}`);

      // ── Entry Conditions (Optimized: RSI momentum filter at 55 / 45) ────────
      const bullishEntry = latestClose > latestEma && latestClose > vwap && latestRsi > 55;

      const bearishEntry = latestClose < latestEma && latestClose < vwap && latestRsi < 45;

      if (bullishEntry) {
        this.log(state, `🟢 Bullish Signal Triggered! Spot above 9-EMA & VWAP, RSI: ${latestRsi.toFixed(1)}`);
        state.lastSignalBarTime = currentBarTime;
        await this.enterOptionPosition(strategyId, state, client, account, 'CE', latestClose);
      } else if (bearishEntry) {
        this.log(state, `🔴 Bearish Signal Triggered! Spot below 9-EMA & VWAP, RSI: ${latestRsi.toFixed(1)}`);
        state.lastSignalBarTime = currentBarTime;
        await this.enterOptionPosition(strategyId, state, client, account, 'PE', latestClose);
      }

    } catch (e) {
      this.log(state, `❌ Candle/Indicator processing error: ${e.message}`);
    }

    await this.persistLogs(state);
  }

  // ─── Entry & Position Management ──────────────────────────────────────────

  private async enterOptionPosition(
    strategyId: string,
    state: StrategyState,
    client: any,
    account: any,
    side: 'CE' | 'PE',
    indexPrice: number
  ) {
    try {
      const kite = client['kite'];
      const underlying = this.resolveUnderlyingName(state.config.symbol);
      const step = this.getStrikeStep(state.config.symbol);
      const exchange = underlying === 'SENSEX' ? 'BFO' : 'NFO';
      const segment = underlying === 'SENSEX' ? 'BFO-OPT' : 'NFO-OPT';

      // Determine ATM Strike
      const atmStrike = Math.round(indexPrice / step) * step;

      // Fetch near-expiry instruments
      const instruments = await client.getInstruments(exchange);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const options = instruments.filter((i: any) =>
        i.name === underlying && i.instrument_type === side && i.segment === segment
      );
      if (options.length === 0) {
        this.log(state, `❌ No option contracts found for ${underlying} on ${side} side`);
        return;
      }

      const uniqueExpiries = Array.from(new Set(options.map((i: any) => i.expiry)));
      const sortedExpiries = uniqueExpiries
        .map(e => new Date(e as any))
        .filter(e => e >= today)
        .sort((a, b) => a.getTime() - b.getTime());

      if (sortedExpiries.length === 0) {
        this.log(state, '❌ No active expiries found');
        return;
      }

      const nearExpiry = options.find((i: any) => new Date(i.expiry as any).getTime() === sortedExpiries[0].getTime())?.expiry;

      // Select ATM Strike Option Contract
      const selectedOption = options.find((i: any) => i.expiry === nearExpiry && Number(i.strike) === atmStrike);
      if (!selectedOption) {
        this.log(state, `❌ ATM Option for strike ${atmStrike} expiry ${nearExpiry} not found.`);
        return;
      }

      const optionSymbol = selectedOption.tradingsymbol;
      const optKey = `${exchange}:${optionSymbol}`;

      // Fetch current price (LTP) of the option contract
      const ltpData = await kite.getLTP([optKey]);
      let optionLTP = ltpData[optKey]?.last_price;
      if (!optionLTP || optionLTP <= 0) {
        this.log(state, `❌ Option LTP not available for ${optionSymbol}`);
        return;
      }

      optionLTP = this.roundTick(optionLTP);

      // Verify Capital Constraints
      const lotSize = this.getLotSize(state.config.symbol);
      const qty = (state.config.lots ?? 1) * lotSize;
      const totalPremiumCost = optionLTP * qty;
      const capitalLimit = state.config.capital ?? 20000;

      if (totalPremiumCost > capitalLimit) {
        this.log(state, `⚠️ Capital check failed! Trade cost ₹${totalPremiumCost.toFixed(0)} exceeds limit of ₹${capitalLimit}. Skipping trade.`);
        return;
      }

      this.log(state, `📋 Enqueueing order: Buy ${qty} shares of ATM ${optionSymbol} @ limit ₹${optionLTP} (Est. Cost: ₹${totalPremiumCost.toFixed(0)})`);

      const params: OrderParams = {
        symbol: optionSymbol,
        exchange,
        side: 'BUY',
        orderType: 'MARKET', // Fast execution for options scalping
        product: state.config.product as any ?? 'MIS',
        qty,
        price: 0,
      };

      let orderId: string;
      if (state.isPaperTrade) {
        orderId = `PAPER_SC_${Date.now().toString(36).toUpperCase()}`;
        this.log(state, `📝 PAPER TRADE — simulated order ${orderId}`);
      } else {
        orderId = await client.placeOrder(params);
      }

      // Record state
      state.positionSide = side;
      state.optionSymbol = optionSymbol;
      state.entryOptionPrice = optionLTP;
      state.positionQty = qty;
      state.entryOrderId = orderId;
      state.tradesPlacedToday++;
      state.isStopLossTrailed = false;

      await this.trackOrderInDB(state, account, params, orderId, strategyId);
      this.log(state, `✅ Position opened: Buy ATM ${side} option ${optionSymbol} at avg price ₹${optionLTP}`);

    } catch (e) {
      this.log(state, `❌ Order entry failed: ${e.message}`);
    }
  }

  private async monitorOpenPosition(state: StrategyState, kite: any) {
    if (!state.optionSymbol || !state.entryOptionPrice) return;

    try {
      const underlying = this.resolveUnderlyingName(state.config.symbol);
      const exchange = underlying === 'SENSEX' ? 'BFO' : 'NFO';
      const key = `${exchange}:${state.optionSymbol}`;

      const ltpData = await kite.getLTP([key]);
      const currentPrice = ltpData[key]?.last_price;
      if (!currentPrice) return;

      const entryPrice = state.entryOptionPrice;

      // Determine points target and SL limits
      let targetPts = state.config.targetPoints;
      let stopLossPts = state.config.stopLossPoints;

      if (!targetPts || !stopLossPts) {
        const u = state.config.symbol.toUpperCase();
        if (u.includes('BANK')) {
          targetPts = targetPts ?? 20;
          stopLossPts = stopLossPts ?? 15;
        } else if (u.includes('SENSEX')) {
          targetPts = targetPts ?? 30;
          stopLossPts = stopLossPts ?? 20;
        } else {
          targetPts = targetPts ?? 10; // Nifty 50 default
          stopLossPts = stopLossPts ?? 7;
        }
      }

      // Check if we need to trigger Breakeven Trailing SL (Option premium gain is >= 50% of target points)
      const breakevenTrigger = targetPts / 2;
      const pnlPerShare = currentPrice - entryPrice;
      const netPnl = pnlPerShare * state.positionQty;

      if (!state.isStopLossTrailed && pnlPerShare >= breakevenTrigger) {
        state.isStopLossTrailed = true;
        this.log(state, `🔒 Trailing Stop Loss to Cost (Breakeven) activated! Current Price: ₹${currentPrice.toFixed(2)} | Cost: ₹${entryPrice.toFixed(2)}`);
      }

      const currentSLPts = state.isStopLossTrailed ? 0 : stopLossPts;
      const currentSLPx = entryPrice - currentSLPts;

      this.log(state, `👀 Live option monitoring — ${state.optionSymbol}: ₹${currentPrice.toFixed(2)} | Entry: ₹${entryPrice.toFixed(2)} | Target: +${targetPts} pts (₹${(entryPrice + targetPts).toFixed(2)}) | SL: ${state.isStopLossTrailed ? 'Breakeven' : `-${stopLossPts} pts`} (₹${currentSLPx.toFixed(2)}) | P&L: ₹${netPnl.toFixed(0)}`);

      // 1. Target Profit Hit
      if (pnlPerShare >= targetPts) {
        this.log(state, `🎯 TARGET HIT! Option premium ₹${currentPrice.toFixed(2)} >= target ₹${(entryPrice + targetPts).toFixed(2)}. Exiting.`);
        await this.exitPosition(state, currentPrice, 'TARGET');
      }
      // 2. Stop Loss Hit (Normal SL or Trailed Breakeven SL)
      else if (pnlPerShare <= -currentSLPts) {
        this.log(state, `🛑 STOP LOSS HIT! Option premium ₹${currentPrice.toFixed(2)} <= stop-loss ₹${currentSLPx.toFixed(2)}. Exiting.`);
        await this.exitPosition(state, currentPrice, 'SL');
      }
      // 3. Absolute low price safeguard
      else if (currentPrice <= 1) {
        this.log(state, `⚠️ Safeguard trigger: Premium dropped below ₹1. Cutting loss to prevent total erosion.`);
        await this.exitPosition(state, currentPrice, 'SAFEGUARD');
      }

    } catch (e) {
      this.log(state, `⚠ Error during open position monitoring: ${e.message}`);
    }
  }

  private async exitPosition(state: StrategyState, exitPrice: number, reason: string) {
    if (!state.optionSymbol) return;

    try {
      const underlying = this.resolveUnderlyingName(state.config.symbol);
      const exchange = underlying === 'SENSEX' ? 'BFO' : 'NFO';
      const qty = state.positionQty;
      const exitPx = this.roundTick(exitPrice);
      const pnl = (exitPx - state.entryOptionPrice!) * qty;

      this.log(state, `📤 Placing exit market order for ${state.optionSymbol} | Qty: ${qty} | Avg Price: ₹${exitPx}`);

      const params: OrderParams = {
        symbol: state.optionSymbol,
        exchange,
        side: 'SELL',
        orderType: 'MARKET',
        product: state.config.product as any ?? 'MIS',
        qty,
        price: 0,
      };

      let orderId: string;
      if (state.isPaperTrade) {
        orderId = `PAPER_EXIT_${Date.now().toString(36).toUpperCase()}`;
        this.log(state, `📝 PAPER TRADE — simulated exit order ${orderId}`);
      } else {
        const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
        const client = this.factory.createClient(account!);
        orderId = await client.placeOrder(params);
      }

      state.totalPnlToday += pnl;

      // Track order in DB
      const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
      await this.trackOrderInDB(state, account!, params, orderId, state.executionId);

      this.log(state, `⏹ Position Closed (${reason}) | P&L on Trade: ₹${pnl.toFixed(0)} | Total P&L Today: ₹${state.totalPnlToday.toFixed(0)}`);

      // Reset state variables
      state.positionSide = null;
      state.optionSymbol = null;
      state.entryOptionPrice = null;
      state.positionQty = 0;
      state.entryOrderId = null;

    } catch (e) {
      this.log(state, `❌ Failed to execute position exit: ${e.message}`);
    }
  }

  private async forceExitAll(state: StrategyState, reason: string) {
    if (!state.optionSymbol || !state.entryOptionPrice) return;
    try {
      const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
      const client = this.factory.createClient(account!);
      const kite = client['kite'];
      const exchange = this.resolveUnderlyingName(state.config.symbol) === 'SENSEX' ? 'BFO' : 'NFO';
      const key = `${exchange}:${state.optionSymbol}`;

      const ltpData = await kite.getLTP([key]);
      const currentPrice = ltpData[key]?.last_price || state.entryOptionPrice;

      await this.exitPosition(state, currentPrice, reason);
    } catch (e) {
      this.log(state, `❌ Force exit execution failed: ${e.message}`);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async resolveFuture(client: any, symbol: string): Promise<{ symbol: string; exchange: string }> {
    const upper = symbol.toUpperCase().trim();
    const isSensex = upper === 'SENSEX' || upper === 'BSE SENSEX';
    const exchange = isSensex ? 'BFO' : 'NFO';
    const segment = isSensex ? 'BFO-FUT' : 'NFO-FUT';
    const underlying = this.resolveUnderlyingName(symbol);

    const instruments = await client.getInstruments(exchange);
    const futures = instruments.filter((i: any) =>
      i.name === underlying && i.instrument_type === 'FUT' && i.segment === segment
    );
    if (futures.length === 0) throw new Error(`No future contracts found for underlying index ${symbol}`);
    futures.sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    return { symbol: futures[0].tradingsymbol, exchange };
  }

  private resolveUnderlyingName(symbol: string): string {
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
    return 50; // Nifty 50 defaults to 50
  }

  private getLotSize(symbol: string): number {
    const u = symbol.toUpperCase();
    if (u.includes('BANK')) return 30;
    if (u.includes('SENSEX')) return 20;
    if (u.includes('FIN')) return 60;
    if (u.includes('MIDCAP') || u.includes('MIDCP')) return 120;
    return 65; // Nifty 50 default
  }

  private async fetchCandles3min(client: any, symbol: string, exchange: string, ist: Date): Promise<Candle[]> {
    const from = new Date(ist);
    from.setHours(9, 15, 0, 0); // Always start from market open of current day
    const to = new Date(ist);

    const data = await client.getHistoricalData(symbol, exchange, '3minute', from, to);
    return (data || []).map((c: any) => ({
      date: new Date(c.date),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }

  private roundTick(price: number): number {
    return Math.round(price / 0.05) * 0.05;
  }

  private log(state: StrategyState, msg: string) {
    const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const logMessage = `[${ts}] ${msg}`;
    state.logs.push(logMessage);
    this.logger.log(`[${state.executionId}] ${msg}`);
  }

  private async persistLogs(state: StrategyState) {
    await this.prisma.strategyExecution.update({
      where: { id: state.executionId },
      data: { logs: JSON.stringify(state.logs.slice(-250)) },
    });
  }

  private resetDailyCounters(state: StrategyState) {
    state.positionSide = null;
    state.optionSymbol = null;
    state.entryOptionPrice = null;
    state.positionQty = 0;
    state.entryOrderId = null;
    state.tradesPlacedToday = 0;
    state.totalPnlToday = 0;
    state.lastSignalBarTime = 0;
    state.futureSymbol = null;
    state.isStopLossTrailed = false;
  }

  private async trackOrderInDB(state: StrategyState, account: any, params: OrderParams, orderId: string, strategyId: string) {
    try {
      await this.prisma.order.create({
        data: {
          userId: account.userId,
          brokerAccountId: account.id,
          executionId: state.executionId,
          symbol: params.symbol,
          exchange: params.exchange,
          side: params.side as any,
          orderType: params.orderType as any,
          productType: params.product as any,
          qty: params.qty,
          price: params.price ?? null,
          triggerPrice: null,
          brokerOrderId: orderId,
          status: state.isPaperTrade ? 'COMPLETE' : 'OPEN',
          isPaperTrade: state.isPaperTrade,
        } as any,
      });
    } catch (e) {
      this.log(state, `⚠️ Failed to log transaction in DB: ${e.message}`);
    }
  }
}
