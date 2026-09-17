import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { GammaBlastExpiryConfig } from './dto/strategy.dto';
import { strategyEvents } from '../common/events';
import { TickerService } from '../market/ticker.service';
import { getLiveBrokerPosition, isSafeToExit, safeCancelPendingOrders } from './broker-position-guard';

interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OptionQuoteInfo {
  tradingsymbol: string;
  strike: number;
  type: 'CE' | 'PE';
  ltp: number;
  oi: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  close: number;
}

interface GammaStrategyState {
  strategyId: string;
  executionId: string;
  config: GammaBlastExpiryConfig;
  brokerAccountId: string;
  isPaperTrade: boolean;
  activeUnderlying: 'NIFTY' | 'SENSEX';
  activeExchange: 'NFO' | 'BFO';
  futureSymbol?: string;
  futureExchange?: 'NFO' | 'BFO';
  lotSize: number;
  lots: number;
  targetQty: number;
  executedQty?: number;
  entryOrderId?: string | null;
  entryPrice?: number | null;
  initialSlPrice?: number | null;
  stopLossPrice?: number | null;
  targetPrice?: number | null;
  peakPrice?: number | null;
  slOrderId?: string | null;
  entryTriggered?: 'CALL_BLAST' | 'PUT_BLAST' | null;
  optionSymbol?: string | null;
  tradesPlacedToday: number;
  winningTradesToday: number;
  dailyRealizedPnlRs: number;
  dailyTargetLocked: boolean;
  logs: string[];
  lastProcessedTimestamp?: number;
  tickerUnsubscribe?: () => void;
  realtimeActive?: boolean;
  lastPnlLogTime?: number;
  lastTickTime?: number;
  lastEmitTime?: number;
  currentLtp?: number;
  currentPnlRs?: number;
  currentPnlPct?: number;
  peakPnlRs?: number;
  isCostLocked?: boolean;
  is2xLocked?: boolean;
  is3xLocked?: boolean;
  is5xLocked?: boolean;
  isPartialExited?: boolean;
  isHighConvictionTrade?: boolean;
  rangeHigh?: number | null;
  rangeLow?: number | null;
  rangeVwap?: number | null;
  orh?: number | null;
  orl?: number | null;
  atmPcr?: number | null;
  bias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null;
  hasLoggedStandby?: boolean;
  liveSpotPrice?: number;
  liveFuturePrice?: number;
  spotSymbol?: string;
  candlesCache?: Candle[];
  lastCandleFetchTime?: number;
  lastStatusLogTime?: number;
  globalTickerUnsubscribe?: () => void;
  lastQuotesCache?: { quotes: any; timestamp: number };
}

@Injectable()
export class GammaBlastExpiryEngine {
  private readonly logger = new Logger(GammaBlastExpiryEngine.name);
  private readonly running = new Map<string, GammaStrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
    private tickerService: TickerService,
  ) { }

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) {
      return { executionId: this.running.get(strategyId)!.executionId };
    }

    const strategy = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
      include: { brokerAccount: true },
    });
    if (!strategy) throw new Error('Strategy not found');

    // Clean up any stale/orphaned 'RUNNING' executions for this strategy in DB
    await this.prisma.strategyExecution.updateMany({
      where: { strategyId, status: 'RUNNING' },
      data: { status: 'STOPPED', stoppedAt: new Date() },
    });

    const config: GammaBlastExpiryConfig = JSON.parse(strategy.config);
    const execution = await this.prisma.strategyExecution.create({
      data: { strategyId, status: 'RUNNING' },
    });

    await this.prisma.strategy.update({
      where: { id: strategyId },
      data: { isActive: true },
    });

    // Detect Today's Expiry Day (Tuesday = NIFTY, Thursday = SENSEX)
    const now = new Date();
    const istHhmm = this.getIstHhmm(now);
    const dayOfWeek = this.getIstDayOfWeek(now); // 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri

    let underlying: 'NIFTY' | 'SENSEX' = 'NIFTY';
    let exchange: 'NFO' | 'BFO' = 'NFO';

    if (config.symbol === 'SENSEX' || (config.symbol === 'AUTO' && (dayOfWeek === 4 || dayOfWeek === 5))) {
      underlying = 'SENSEX';
      exchange = 'BFO';
    } else {
      underlying = 'NIFTY';
      exchange = 'NFO';
    }

    const defaultLotSize = underlying === 'NIFTY' ? 65 : 20;
    const lots = config.lots || 1;
    const targetQty = lots * defaultLotSize;

    const state: GammaStrategyState = {
      strategyId,
      executionId: execution.id,
      config,
      brokerAccountId: strategy.brokerAccountId!,
      isPaperTrade: strategy.isPaperTrade,
      activeUnderlying: underlying,
      activeExchange: exchange,
      lotSize: defaultLotSize,
      lots,
      targetQty,
      executedQty: 0,
      tradesPlacedToday: 0,
      winningTradesToday: 0,
      dailyRealizedPnlRs: 0,
      dailyTargetLocked: false,
      logs: [],
      peakPrice: 0,
      peakPnlRs: 0,
      isCostLocked: false,
      is2xLocked: false,
      is3xLocked: false,
      is5xLocked: false,
      isPartialExited: false,
      isHighConvictionTrade: false,
    };

    state.spotSymbol = underlying === 'SENSEX' ? 'BSE:SENSEX' : 'NSE:NIFTY 50';

    if (strategy.brokerAccount?.accessToken) {
      try {
        const client = this.factory.createClient(strategy.brokerAccount);
        const res = await this.findFutureSymbol(client, underlying);
        state.futureSymbol = res.symbol;
        state.futureExchange = res.exchange as any;

        // Subscribe to real-time WebSocket ticks for Spot & Future
        await this.tickerService.subscribeSymbol(state.brokerAccountId, state.spotSymbol);
        if (state.futureSymbol) {
          await this.tickerService.subscribeSymbol(state.brokerAccountId, state.futureSymbol);
        }
      } catch (e: any) {
        this.logger.warn(`Future symbol resolution / ticker subscription error: ${e?.message || e}`);
      }
    }

    // Register WebSocket tick listener for real-time price streaming (eliminates 5-second REST calls)
    const globalTickerUnsubscribe = this.tickerService.registerListener((ticks) => {
      const spotKey = state.spotSymbol;
      const futKey = state.futureSymbol ? `${state.futureExchange}:${state.futureSymbol}` : null;
      if (spotKey && ticks[spotKey]) {
        state.liveSpotPrice = ticks[spotKey];
      }
      if (futKey && ticks[futKey]) {
        state.liveFuturePrice = ticks[futKey];
      } else if (state.futureSymbol && ticks[state.futureSymbol]) {
        state.liveFuturePrice = ticks[state.futureSymbol];
      }
    });
    state.globalTickerUnsubscribe = globalTickerUnsubscribe;

    const effectiveStartTime = config.startTime || '09:20';
    const effectiveEndTime = config.endTime || '15:25';

    this.running.set(strategyId, state);
    this.log(state, `▶ Gamma Blast (Professional Expiry Scalper) Started! Mode: ${strategy.isPaperTrade ? 'PAPER TRADING' : 'LIVE TRADING'}`);
    this.log(state, `🎯 Active Tracking Contract: ${state.futureSymbol ? `${state.futureExchange}:${state.futureSymbol} (Future)` : `${underlying} (${exchange})`} | Lot Size: ${defaultLotSize} (${lots} Lot = ${targetQty} Qty)`);
    this.log(state, `⏰ Execution Window: ${effectiveStartTime} – ${effectiveEndTime} IST (Continuous Full-Day Scalper: Morning ORB, Midday Consolidation & Afternoon Gamma)`);
    this.log(state, `💎 Strike Selection: ADAPTIVE (Morning: ATM/1-strike ITM with Delta ~0.50 | Afternoon: Near-OTM High-Gamma Leverage)`);

    // ── Live Crash / Power Recovery on Startup (Safe Strategy-Owned Only) ──
    if (!strategy.isPaperTrade && strategy.brokerAccount?.accessToken) {
      try {
        const client = this.factory.createClient(strategy.brokerAccount);
        const kite = client['kite'] || client;
        if (kite && kite.getPositions) {
          // Safety verification: Only recover positions that belong to an existing completed BUY order by THIS strategy
          const recentStrategyOrder = await this.prisma.order.findFirst({
            where: {
              strategyId,
              status: 'COMPLETE',
              side: 'BUY',
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
            orderBy: { createdAt: 'desc' },
          });

          if (recentStrategyOrder) {
            const positionsData = await kite.getPositions().catch(() => null);
            const netPositions = positionsData?.net || [];
            const openPos = netPositions.find((p: any) =>
              Number(p.quantity) > 0 &&
              p.tradingsymbol === recentStrategyOrder.symbol
            );

            if (openPos) {
              const absQty = Math.abs(Number(openPos.quantity));
              const entryAvg = Number(openPos.average_price) || Number(openPos.buy_price) || 0;
              const sym = openPos.tradingsymbol;
              const isCall = sym.endsWith('CE');

              state.optionSymbol = sym;
              state.entryTriggered = isCall ? 'CALL_BLAST' : 'PUT_BLAST';
              state.executedQty = absQty;
              state.entryPrice = entryAvg;
              state.initialSlPrice = entryAvg * (1 - (config.initialSlPct || 50) / 100);
              state.stopLossPrice = state.initialSlPrice;
              state.peakPrice = entryAvg;

              const orders = await (kite.getOrders ? kite.getOrders() : []).catch(() => []);
              const openOrders = (orders || []).filter((o: any) => o.tradingsymbol === sym && (o.status === 'TRIGGER PENDING' || o.status === 'OPEN'));
              const slOrder = openOrders.find((o: any) => o.order_type === 'SL' || o.order_type === 'SL-M');

              if (slOrder) {
                state.slOrderId = slOrder.order_id;
                state.stopLossPrice = Number(slOrder.trigger_price) || state.initialSlPrice;
              }

              this.log(state, `🔄 [POWER RECOVERY] Reconnected to active strategy-owned option position: ${sym} (${absQty} Qty @ Avg ₹${entryAvg.toFixed(2)}) | SL: ₹${state.stopLossPrice?.toFixed(2)}`);
              await this.startRealtimeMonitor(state, client);
            }
          }
        }
      } catch (e: any) {
        this.logger.debug?.(`Position recovery notice: ${e.message}`);
      }
    }

    await this.persistLogs(state);

    this.initialCatchup(strategyId).then(() => {
      this.logger.log(`Initial catchup completed for Gamma Blast strategy ${strategyId}`);
    }).catch(err => {
      this.logger.error(`Initial catchup failed: ${err?.message || err}`);
    });

    const timer = setInterval(() => this.tick(strategyId).catch(e => this.logger.error(e)), 5_000);
    this.timers.set(strategyId, timer);

    return { executionId: execution.id };
  }

  async stop(strategyId: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      this.stopRealtimeMonitor(state);
      if (state.globalTickerUnsubscribe) {
        state.globalTickerUnsubscribe();
        state.globalTickerUnsubscribe = undefined;
      }
      clearInterval(this.timers.get(strategyId));
      this.timers.delete(strategyId);
      this.running.delete(strategyId);
      this.log(state, '⏹ Gamma Blast Strategy stopped by user');

      if (!state.isPaperTrade && state.slOrderId) {
        try {
          const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
          if (account?.accessToken) {
            const client = this.factory.createClient(account);
            await client.cancelOrder(state.slOrderId).catch(() => { });
          }
        } catch { }
      }

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

  getState(strategyId: string): any {
    const s = this.running.get(strategyId);
    if (!s) return null;
    return {
      strategyId: s.strategyId,
      executionId: s.executionId,
      activeUnderlying: s.activeUnderlying,
      activeExchange: s.activeExchange,
      optionSymbol: s.optionSymbol,
      entryTriggered: s.entryTriggered,
      entryPrice: s.entryPrice,
      stopLossPrice: s.stopLossPrice,
      peakPrice: s.peakPrice,
      currentLtp: s.currentLtp,
      pnlRs: s.currentPnlRs ?? 0,
      pnlPct: s.currentPnlPct ?? 0,
      peakPnlRs: s.peakPnlRs ?? 0,
      executedQty: s.executedQty || s.targetQty,
      targetQty: s.targetQty,
      lots: s.lots,
      lotSize: s.lotSize,
      isPaperTrade: s.isPaperTrade,
      dailyRealizedPnlRs: s.dailyRealizedPnlRs ?? 0,
      dailyTargetLocked: s.dailyTargetLocked ?? false,
      is2xLocked: s.is2xLocked,
      is3xLocked: s.is3xLocked,
      is5xLocked: s.is5xLocked,
      rangeHigh: s.rangeHigh,
      rangeLow: s.rangeLow,
      rangeVwap: s.rangeVwap,
      atmPcr: s.atmPcr,
      bias: s.bias,
    };
  }

  async squareOff(strategyId: string): Promise<{ success: boolean; message: string }> {
    const state = this.running.get(strategyId);
    if (!state) return { success: false, message: 'Strategy is not running' };
    if (!state.entryTriggered) return { success: false, message: 'No active open position to square off' };

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    const client = account?.accessToken ? this.factory.createClient(account) : null;
    const exitPrice = state.currentLtp || state.entryPrice || 0;

    this.log(state, `⚡ Manual Instant Square-Off requested @ ₹${exitPrice.toFixed(2)}`);
    await this.exitPosition(state, client, exitPrice, 'MANUAL_CLOSE');
    await this.persistLogs(state);
    return { success: true, message: `Position squared off at ₹${exitPrice.toFixed(2)}` };
  }

  // ── Catch-Up Historical Session Replay ──────────────────────────────────

  private async initialCatchup(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;
    const now = new Date();

    this.log(state, `🔍 Running catch-up for Gamma Blast (CAS Expiry Special)...`);
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) {
      this.log(state, `⚠️ Catch-up skipped: No active broker account or access token found. Please authenticate your broker in Broker Settings.`);
      await this.persistLogs(state);
      return;
    }

    const client = this.factory.createClient(account);
    const kite = client['kite'] || client;

    try {
      const underlying = state.activeUnderlying;
      const exchange = state.activeExchange;

      // 1. Resolve Current Month Future Contract
      if (!state.futureSymbol) {
        const res = await this.findFutureSymbol(client, underlying);
        state.futureSymbol = res.symbol;
        state.futureExchange = res.exchange as any;
      }

      const futureKey = `${state.futureExchange}:${state.futureSymbol}`;
      this.log(state, `🎯 Active Tracking Contract: ${futureKey} (Current Month Future)`);

      // 2. Fetch 3-min Future Candles (Past 5 days to cover weekend/aftermarket)
      const candles = await this.fetchFutureCandles(client, state.futureSymbol!, state.futureExchange || exchange, now);
      if (!candles || candles.length < 10) {
        this.log(state, `⚠️ Catch-up: Insufficient historical candles fetched for ${futureKey} (got ${candles?.length || 0}). Standing by.`);
        await this.persistLogs(state);
        return;
      }

      // Determine target session date: strictly evaluate TODAY's candles to prevent simulating yesterday's expired session
      const todayStr = this.getIstDateStr(now);
      const todayCandlesCheck = candles.filter(c => this.getIstDateStr(c.date) === todayStr);

      if (todayCandlesCheck.length < 5) {
        this.log(state, `ℹ Catch-up: ${todayCandlesCheck.length} candles today (${todayStr}). Standing by for live market execution from ${state.config.startTime || '09:20'} AM.`);
        await this.persistLogs(state);
        return;
      }

      const targetSessionDateStr = todayStr;
      const sessionCandles = todayCandlesCheck;

      this.log(state, `📊 Catch-up analyzing Future session ${targetSessionDateStr} (${sessionCandles.length} 3m candles)...`);

      // 3. Fetch Instruments & Filter Weekly Option Chain
      const instruments = await client.getInstruments(exchange).catch(() => []);
      const segment = exchange === 'BFO' ? 'BFO-OPT' : 'NFO-OPT';
      const optInstruments = (instruments || []).filter((i: any) =>
        i.name === underlying &&
        i.segment === segment
      );

      const expiries = Array.from(new Set(optInstruments.map((i: any) => this.getIstDateStr(new Date(i.expiry))))).sort();
      const targetExpiry = expiries.find(e => e >= targetSessionDateStr) || expiries[0];
      const weeklyOptions = optInstruments.filter((i: any) => this.getIstDateStr(new Date(i.expiry)) === targetExpiry);

      if (weeklyOptions.length > 0 && weeklyOptions[0]?.lot_size) {
        state.lotSize = weeklyOptions[0].lot_size;
        state.targetQty = state.lots * state.lotSize;
      }

      const [startH, startM] = (state.config.startTime || '09:20').split(':').map(Number);
      const startHhmm = startH * 60 + startM;
      const endHhmm = 15 * 60 + 29; // Hold and trail positions through 15:25–15:30 closing candle
      const strikeStep = underlying === 'NIFTY' ? 50 : 100;
      const minPrem = underlying === 'NIFTY' ? 8 : 15;
      const maxPrem = underlying === 'NIFTY' ? 18 : 30;

      const optHistoryCache = new Map<string, any[]>();
      let catchupTradePlaced = 0;
      let catchupPnl = 0;
      let inCatchupPosition = false;
      let catchupOptSymbol: string | null = null;
      let catchupEntryPrice = 0;
      let catchupSlPrice = 0;
      let catchupPeakPrice = 0;
      let catchupOptCandles: Candle[] = [];
      let catchupOptEmas: (number | null)[] = [];
      let isCostLocked = false;
      let is2x = false;
      let is3x = false;

      for (let i = 4; i < sessionCandles.length; i++) {
        const c = sessionCandles[i];
        const candleHhmm = this.getIstHhmm(c.date);

        // Manage active catchup position with REAL option candles
        if (inCatchupPosition && catchupOptSymbol) {
          const optCandleIdx = catchupOptCandles.findIndex((oc: Candle) => oc.date.getTime() === c.date.getTime());
          const currentOptCandle = optCandleIdx !== -1 ? catchupOptCandles[optCandleIdx] : null;
          const candleHigh = currentOptCandle ? currentOptCandle.high : catchupEntryPrice;
          const candleLow = currentOptCandle ? currentOptCandle.low : catchupEntryPrice;
          const candleClose = currentOptCandle ? currentOptCandle.close : catchupEntryPrice;

          if (candleHigh > catchupPeakPrice) {
            catchupPeakPrice = candleHigh;
          }

          // 1. Check EOD Cutoff (Default 03:05 PM)
          if (candleHhmm >= endHhmm) {
            const exitPrice = candleClose;
            const pnl = (exitPrice - catchupEntryPrice) * state.targetQty;
            catchupPnl += pnl;
            this.log(state, `⏰ (Catch-up) ${state.config.endTime || '15:05'} Hard Cutoff Reached! Auto-squared off ${catchupOptSymbol} @ ₹${exitPrice.toFixed(2)} on ${this.formatTime(c.date)} | P&L: ${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)}`);
            await this.trackOrderInDB(state, 'SELL', catchupOptSymbol, exchange, state.targetQty, exitPrice, `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`, c.date, 'MARKET');
            inCatchupPosition = false;
            catchupOptSymbol = null;
            continue;
          }

          // 2. Ratchet Multiplier Profit Trailing
          // 1.4x Gain -> Trail SL to COST + ₹0.50 (Risk-Free Early!)
          const costMultiple = state.config.costLockMultiple || 1.4;
          if (candleHigh >= catchupEntryPrice * costMultiple && !isCostLocked) {
            isCostLocked = true;
            const costSl = this.roundTick(catchupEntryPrice + 0.50);
            if (costSl > catchupSlPrice) {
              catchupSlPrice = costSl;
            }
            this.log(state, `🚀 (Catch-up) ${costMultiple}X GAIN HIT on ${this.formatTime(c.date)}! Option hit ₹${candleHigh.toFixed(2)} (${(candleHigh / catchupEntryPrice).toFixed(1)}x). SL Trailed to COST (₹${catchupSlPrice.toFixed(2)}) — ZERO RISK!`);
          }

          // 2.0x Multiplier -> Lock +50% Profit (1.5x of entry)
          const profit2xMultiple = state.config.profitLock2xMultiple || 2.0;
          if (candleHigh >= catchupEntryPrice * profit2xMultiple && !is2x) {
            is2x = true;
            const lock50 = this.roundTick(catchupEntryPrice * 1.50);
            if (lock50 > catchupSlPrice) {
              catchupSlPrice = lock50;
            }
            this.log(state, `🎯 (Catch-up) 2X MULTIPLIER HIT on ${this.formatTime(c.date)}! Option hit ₹${candleHigh.toFixed(2)} (${(candleHigh / catchupEntryPrice).toFixed(1)}x). SL LOCKED at +50% Profit (₹${catchupSlPrice.toFixed(2)})!`);
          }

          // 3. Continuous High-Water Mark Dynamic Peak Trailing
          if (state.config.enablePeakTrailing !== false) {
            if (catchupPeakPrice >= catchupEntryPrice * 2.0 && catchupPeakPrice < catchupEntryPrice * 3.0) {
              const peakTrail = this.roundTick(catchupPeakPrice * 0.75); // 25% max pullback buffer from peak
              if (peakTrail > catchupSlPrice) {
                catchupSlPrice = peakTrail;
              }
            } else if (catchupPeakPrice >= catchupEntryPrice * 3.0 && catchupPeakPrice < catchupEntryPrice * 4.0) {
              const peakTrail = this.roundTick(catchupPeakPrice * 0.80); // 20% max pullback buffer from peak
              if (peakTrail > catchupSlPrice) {
                catchupSlPrice = peakTrail;
              }
            } else if (catchupPeakPrice >= catchupEntryPrice * 4.0) {
              const peakTrail = this.roundTick(catchupPeakPrice * 0.85); // 15% max pullback buffer from peak
              if (peakTrail > catchupSlPrice) {
                catchupSlPrice = peakTrail;
              }
            }
          }

          // 4. 15 EMA Option Trend Exhaustion Exit Check
          if (state.config.enableEmaExit !== false && optCandleIdx !== -1 && catchupOptEmas[optCandleIdx] !== null) {
            const optEma = catchupOptEmas[optCandleIdx];
            if (optEma && catchupPeakPrice >= catchupEntryPrice * 1.3 && candleClose < optEma) {
              const exitPrice = candleClose;
              const pnl = (exitPrice - catchupEntryPrice) * state.targetQty;
              catchupPnl += pnl;
              this.log(state, `📉 (Catch-up) 15 EMA Option Exit Triggered on ${this.formatTime(c.date)}! Candle Closed @ ₹${exitPrice.toFixed(2)} below 15 EMA (₹${optEma.toFixed(2)}) | Peak was ₹${catchupPeakPrice.toFixed(2)} | Trade Profit: ${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)}`);
              await this.trackOrderInDB(state, 'SELL', catchupOptSymbol, exchange, state.targetQty, exitPrice, `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`, c.date, 'MARKET');
              inCatchupPosition = false;
              catchupOptSymbol = null;
              continue;
            }
          }

          // 5. 5x Jackpot Target Hit -> Take Profit
          if (candleHigh >= catchupEntryPrice * 5.0) {
            const exitPrice = this.roundTick(catchupEntryPrice * 5.0);
            const pnl = (exitPrice - catchupEntryPrice) * state.targetQty;
            catchupPnl += pnl;
            this.log(state, `🎯 (Catch-up) 5X JACKPOT TARGET ACHIEVED on ${this.formatTime(c.date)} @ ₹${exitPrice.toFixed(2)} (High: ₹${candleHigh.toFixed(2)})! Trade Profit: +₹${pnl.toFixed(2)}`);
            await this.trackOrderInDB(state, 'SELL', catchupOptSymbol, exchange, state.targetQty, exitPrice, `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`, c.date, 'MARKET');
            inCatchupPosition = false;
            catchupOptSymbol = null;
            continue;
          }

          // 6. Stop Loss Hit Check
          if (candleLow <= catchupSlPrice) {
            const exitPrice = catchupSlPrice;
            const pnl = (exitPrice - catchupEntryPrice) * state.targetQty;
            catchupPnl += pnl;
            this.log(state, `🛑 (Catch-up) Stop Loss Hit on ${this.formatTime(c.date)} @ ₹${exitPrice.toFixed(2)} (Floor: ₹${catchupSlPrice.toFixed(2)}, Peak: ₹${catchupPeakPrice.toFixed(2)}) | Trade Result: ${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)}`);
            await this.trackOrderInDB(state, 'SELL', catchupOptSymbol, exchange, state.targetQty, exitPrice, `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`, c.date, 'MARKET');
            inCatchupPosition = false;
            catchupOptSymbol = null;
            continue;
          }

          continue;
        }

        // Only scan within configured time window
        if (candleHhmm < startHhmm || candleHhmm > endHhmm) continue;
        if (catchupTradePlaced >= (state.config.maxTradesPerDay || 2)) break;

        // Calculate compression range on Future candles up to current candle
        const candlesUpToNow = sessionCandles.slice(0, i + 1);
        const rangeData = this.calculateCompressionRange(candlesUpToNow, c.date, state.config.startTime || '13:00');
        if (!rangeData) continue;

        const currentFuture = c.close;
        const currentFutureHigh = c.high;
        const currentFutureLow = c.low;

        const atmStrike = Math.round(currentFuture / strikeStep) * strikeStep;
        let signalType: 'CALL_BLAST' | 'PUT_BLAST' | null = null;
        let selectedOptType: 'CE' | 'PE' = 'CE';

        if (currentFutureHigh >= rangeData.high && currentFuture >= rangeData.vwap) {
          signalType = 'CALL_BLAST';
          selectedOptType = 'CE';
        } else if (currentFutureLow <= rangeData.low && currentFuture <= rangeData.vwap) {
          signalType = 'PUT_BLAST';
          selectedOptType = 'PE';
        }

        if (signalType) {
          // Dynamic OTM strike selection matching the target premium range
          const otmOffset = underlying === 'SENSEX' ? 7 : 3;
          const preferredStrike = selectedOptType === 'CE' ? (atmStrike + (strikeStep * otmOffset)) : (atmStrike - (strikeStep * otmOffset));
          const matchingOpt = weeklyOptions.find((o: any) => Number(o.strike) === preferredStrike && o.instrument_type === selectedOptType)
            || weeklyOptions.find((o: any) => o.instrument_type === selectedOptType)
            || weeklyOptions[0];
          const optSymbol = matchingOpt?.tradingsymbol || `${underlying}${targetSessionDateStr.replace(/-/g, '').slice(2)}${preferredStrike}${selectedOptType}`;

          // Fetch REAL historical option candles from Kite for the entire session (cached)
          let rawOptData = optHistoryCache.get(optSymbol);
          if (!rawOptData) {
            const sessionFrom = new Date(`${targetSessionDateStr}T09:15:00.000+05:30`);
            const sessionTo = new Date(`${targetSessionDateStr}T15:30:00.000+05:30`);
            rawOptData = await client.getHistoricalData(optSymbol, exchange, '3minute', sessionFrom, sessionTo).catch(() => []);
            optHistoryCache.set(optSymbol, rawOptData || []);
          }

          const entryOptCandle = (rawOptData || []).find((oc: any) => new Date(oc.date).getTime() === c.date.getTime()) || rawOptData[0];
          const actualEntryPrice = entryOptCandle ? Number(entryOptCandle.open || entryOptCandle.close) : ((minPrem + maxPrem) / 2);
          const initialSl = this.roundTick(actualEntryPrice * (1 - (state.config.initialSlPct || 50) / 100));

          this.log(state, `🚀 (Catch-up) [GAMMA BLAST SIGNAL - ${signalType === 'CALL_BLAST' ? 'CALL' : 'PUT'}] on ${this.formatTime(c.date)}! Future: ₹${currentFuture.toFixed(2)} broke Range ${signalType === 'CALL_BLAST' ? 'High' : 'Low'} (₹${(signalType === 'CALL_BLAST' ? rangeData.high : rangeData.low).toFixed(2)})`);
          this.log(state, `🎯 (Catch-up) Triggered 1-Lot Entry: ${exchange}:${optSymbol} @ Real Mkt ₹${actualEntryPrice.toFixed(2)} | Qty: ${state.targetQty} | Initial SL: ₹${initialSl.toFixed(2)} (Max Risk: ₹${((actualEntryPrice - initialSl) * state.targetQty).toFixed(2)})`);

          const orderId = `PAPER_GAMMA_${Math.random().toString(36).substring(7).toUpperCase()}`;
          await this.trackOrderInDB(state, 'BUY', optSymbol, exchange, state.targetQty, actualEntryPrice, orderId, c.date, 'LIMIT');

          const optCandleObjs: Candle[] = (rawOptData || []).map((oc: any) => ({
            date: new Date(oc.date),
            open: Number(oc.open),
            high: Number(oc.high),
            low: Number(oc.low),
            close: Number(oc.close),
            volume: Number(oc.volume || 1),
          }));

          inCatchupPosition = true;
          catchupOptSymbol = optSymbol;
          catchupEntryPrice = actualEntryPrice;
          catchupSlPrice = initialSl;
          catchupPeakPrice = actualEntryPrice;
          catchupOptCandles = optCandleObjs;
          catchupOptEmas = this.calculateEMA(optCandleObjs, state.config.emaPeriod || 15);
          catchupTradePlaced++;
          isCostLocked = false;
          is2x = false;
          is3x = false;
        }
      }

      state.dailyRealizedPnlRs = (state.dailyRealizedPnlRs || 0) + catchupPnl;
      this.log(state, `✅ Catch-up complete for Gamma Blast. Evaluated ${sessionCandles.length} candles for session (${targetSessionDateStr}). Realized P&L: ₹${state.dailyRealizedPnlRs.toFixed(2)}`);
      await this.persistLogs(state);
    } catch (err: any) {
      this.log(state, `⚠️ Catch-up notice: ${err?.message || err}`);
      await this.persistLogs(state);
    }
  }

  // ── Core Periodic Evaluation Loop ──────────────────────────────────────────

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) {
      if (!state.lastTickTime || (Date.now() - state.lastTickTime > 60000)) {
        state.lastTickTime = Date.now();
        this.log(state, `⚠️ Broker access token is missing or expired. Please link/login your broker in Broker Settings.`);
        await this.persistLogs(state);
      }
      return;
    }

    const client = this.factory.createClient(account);
    const kite = client['kite'] || client;
    const now = new Date();
    const hhmm = this.getIstHhmm(now);
    const currentSeconds = now.getSeconds();

    const [endH, endM] = (state.config.endTime || '15:25').split(':').map(Number);
    const endHhmm = endH * 60 + endM;

    // ── 1. Hard Mandatory EOD Square-Off & Standby ──────────────
    // Auto square-off at 15:29:30 IST (on the 15:25–15:30 closing candle right before market close)
    const isSquareOffTime = hhmm > 15 * 60 + 29 || (hhmm === 15 * 60 + 29 && currentSeconds >= 30) || hhmm >= 15 * 60 + 30;
    const isMarketClosed = hhmm >= 15 * 60 + 30 || hhmm < 9 * 60 + 15;

    if (isSquareOffTime && state.entryTriggered) {
      const exitPrice = state.currentLtp || state.entryPrice || 0;
      this.log(state, `⏰ 15:29:30 IST Closing Candle Reached! Auto-squaring off position @ ₹${exitPrice.toFixed(2)} to secure profits before CAS close...`);
      await this.exitPosition(state, client, exitPrice, 'TIME_CUTOFF');
      await this.persistLogs(state);
      return;
    }

    if (isMarketClosed) {
      if (!state.hasLoggedStandby) {
        state.hasLoggedStandby = true;
        this.log(state, `🌙 Market is currently closed (09:15 AM – 15:30 IST). Strategy is standing by for the next session.`);
        await this.persistLogs(state);
      }
      return;
    }

    state.hasLoggedStandby = false; // Reset flag when inside active trading hours

    // If position is active, monitorPosition safety net handles it (holds and trails through 15:25–15:29)
    if (state.entryTriggered) {
      // Auto-sync with broker: If option position was closed manually on Zerodha, reconcile state immediately
      if (!state.isPaperTrade && kite && kite.getPositions && state.optionSymbol) {
        try {
          const brokerStatus = await getLiveBrokerPosition(kite, state.optionSymbol, this.logger);
          if (!brokerStatus.isOpen) {
            this.log(state, `ℹ [BROKER SYNC] Option position for ${state.optionSymbol} is CLOSED on Zerodha (Net Qty: 0). Auto-syncing state and cancelling broker SL.`);
            await safeCancelPendingOrders(kite, client, [state.slOrderId], this.logger);
            this.stopRealtimeMonitor(state);

            state.entryTriggered = null;
            state.optionSymbol = null;
            state.entryPrice = null;
            state.stopLossPrice = null;
            state.slOrderId = null;
            state.executedQty = undefined;
            state.peakPrice = 0;
            state.isCostLocked = false;
            state.is2xLocked = false;
            state.is3xLocked = false;
            state.is5xLocked = false;
            state.isPartialExited = false;
            state.isHighConvictionTrade = false;

            strategyEvents.emit('strategy.update', {
              strategyId: state.strategyId,
              logs: state.logs,
              state: this.getState(state.strategyId),
            });
            await this.persistLogs(state);
            return;
          }
        } catch (syncErr: any) {
          this.logger.debug?.(`Gamma blast broker sync notice: ${syncErr.message}`);
        }
      }

      await this.monitorPosition(state, client, kite);
      await this.persistLogs(state);
      return;
    }

    // Check daily lock / max trades
    if (state.dailyTargetLocked) return;
    if (state.tradesPlacedToday >= (state.config.maxTradesPerDay || 2)) return;

    // ── 2. Time Window Check (Active between startTime and endTime) ───────────
    const [startH, startM] = (state.config.startTime || '09:20').split(':').map(Number);
    const startHhmm = startH * 60 + startM;

    if (hhmm < startHhmm) {
      const minutesLeft = startHhmm - hhmm;
      if (!state.lastTickTime || (Date.now() - state.lastTickTime > 60000)) {
        state.lastTickTime = Date.now();
        this.log(state, `⏳ [09:15-09:20 OBSERVATION] Initial 5m candle forming baseline. Full Day Scalper active @ 09:20 AM.`);
        await this.persistLogs(state);
      }
      return;
    }

    // Beyond configured entry window (default 15:25), do not open new trades
    if (hhmm > endHhmm) {
      return; // Past configured endTime, wait for active position or 15:30 close
    }

    // ── 3. Range Compression & Confluence Trigger Evaluation ──────────────────
    try {
      await this.evaluateGammaBreakout(state, client, kite, now);
      await this.persistLogs(state);
    } catch (e: any) {
      this.logger.error(`Gamma evaluation error: ${e.message}`);
    }
  }

  // ── Auto-Adaptive Strike Selection (Daypart-Aware) ─────────────────────────

  private autoSelectGammaStrike(
    optionQuotes: OptionQuoteInfo[],
    type: 'CE' | 'PE',
    atmStrike: number,
    underlying: 'NIFTY' | 'SENSEX',
    config: GammaBlastExpiryConfig,
    now: Date,
    isExpiryDay: boolean = false
  ): OptionQuoteInfo | null {
    const strikeStep = underlying === 'NIFTY' ? 50 : 100;

    // ── STRICT HIGH-DELTA ATM & ITM ONLY (Zero Cheap Options Policy) ──
    // Cheap OTM options are completely removed. Focuses exclusively on high-delta ATM (Delta ~0.50)
    // or 1-strike ITM (Delta ~0.55–0.65) with deep liquidity, tight spreads, and instant 1:1 index tracking.
    const minPremiumThreshold = underlying === 'NIFTY'
      ? (config.minPremiumNifty ?? 30)
      : (config.minPremiumSensex ?? 50);

    // 1. Primary: Exact ATM Strike with solid premium
    const atmCandidate = optionQuotes.find(o => o.type === type && o.strike === atmStrike && o.ltp >= minPremiumThreshold);
    if (atmCandidate) return atmCandidate;

    // 2. Secondary: 1-Strike In-The-Money (ITM) — Higher Delta (0.55–0.65), real intrinsic value, zero theta trap
    const itmStrike = type === 'CE' ? atmStrike - strikeStep : atmStrike + strikeStep;
    const itmCandidate = optionQuotes.find(o => o.type === type && o.strike === itmStrike && o.ltp >= minPremiumThreshold);
    if (itmCandidate) return itmCandidate;

    // 3. Fallback: 2-Strike In-The-Money (ITM) — Deep In-The-Money (Delta ~0.70)
    const deepItmStrike = type === 'CE' ? atmStrike - (strikeStep * 2) : atmStrike + (strikeStep * 2);
    const deepItmCandidate = optionQuotes.find(o => o.type === type && o.strike === deepItmStrike && o.ltp >= minPremiumThreshold);
    if (deepItmCandidate) return deepItmCandidate;

    // 4. Safe Fallback: ATM candidate (never pick cheap OTM)
    const fallbackAtm = optionQuotes.find(o => o.type === type && o.strike === atmStrike && o.ltp > 0);
    if (fallbackAtm) return fallbackAtm;

    return null;
  }

  // ── Confluence & Live Option Chain Analysis ────────────────────────────────

  private async evaluateGammaBreakout(state: GammaStrategyState, client: any, kite: any, now: Date) {
    const underlying = state.activeUnderlying;
    const exchange = state.activeExchange;

    // 1. Resolve Future Contract if not already cached
    if (!state.futureSymbol) {
      const res = await this.findFutureSymbol(client, underlying);
      state.futureSymbol = res.symbol;
      state.futureExchange = res.exchange as any;
      if (state.futureSymbol) {
        this.tickerService.subscribeSymbol(state.brokerAccountId, state.futureSymbol).catch(() => {});
      }
    }

    // 2. Fetch Future 3m candles for Range Compression calculation (Cached/throttled to save API calls)
    let candles = state.candlesCache;
    const lastFetch = state.lastCandleFetchTime || 0;
    if (!candles || candles.length < 10 || (Date.now() - lastFetch > 60000)) {
      candles = await this.fetchFutureCandles(client, state.futureSymbol!, state.futureExchange || exchange, now);
      if (candles && candles.length >= 10) {
        state.candlesCache = candles;
        state.lastCandleFetchTime = Date.now();
      }
    }
    if (!candles || candles.length < 10) return;

    // Blend live WebSocket tick into latest candle for zero-latency breakout detection
    const liveFut = state.liveFuturePrice;
    if (liveFut && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      lastCandle.close = liveFut;
      if (liveFut > lastCandle.high) lastCandle.high = liveFut;
      if (liveFut < lastCandle.low) lastCandle.low = liveFut;
    }

    // Calculate compression range on Future based on configured window
    const rangeData = this.calculateCompressionRange(candles, now, state.config.startTime || '09:20');
    if (!rangeData) return;

    state.rangeHigh = rangeData.high;
    state.rangeLow = rangeData.low;
    state.rangeVwap = rangeData.vwap;
    state.orh = rangeData.orh;
    state.orl = rangeData.orl;

    const currentFuture = candles[candles.length - 1].close;
    const currentFutureHigh = candles[candles.length - 1].high;
    const currentFutureLow = candles[candles.length - 1].low;

    // 3. Fetch Instruments & Filter Today's Weekly Option Chain
    // Use client.getInstruments (has 6h in-memory cache) to eliminate redundant API calls
    const instruments = await client.getInstruments(exchange);
    const segment = exchange === 'BFO' ? 'BFO-OPT' : 'NFO-OPT';
    const optInstruments = instruments.filter((i: any) =>
      i.name === underlying &&
      i.segment === segment
    );
    if (optInstruments.length === 0) return;

    // Find nearest weekly expiry date
    const expiries = Array.from(new Set(optInstruments.map((i: any) => this.getIstDateStr(new Date(i.expiry))))).sort();
    const todayStr = this.getIstDateStr(now);
    const targetExpiry = expiries.find(e => e >= todayStr) || expiries[0];
    const isExpiryDay = (targetExpiry === todayStr);

    const weeklyOptions = optInstruments.filter((i: any) => this.getIstDateStr(new Date(i.expiry)) === targetExpiry);
    if (weeklyOptions.length === 0) return;

    // Update authoritative lot size
    if (weeklyOptions[0]?.lot_size) {
      state.lotSize = weeklyOptions[0].lot_size;
      state.targetQty = state.lots * state.lotSize;
    }

    // 4. Resolve ATM Strike directly from Running FUTURE Price (matches tradable Futures breakout levels)
    const runningFuturePrice = state.liveFuturePrice || currentFuture;
    const strikeStep = underlying === 'NIFTY' ? 50 : 100;
    const atmStrike = Math.round(runningFuturePrice / strikeStep) * strikeStep;

    // Dynamic OTM candidate strikes: scan up to 15 strikes OTM for SENSEX, 10 strikes for NIFTY
    const maxOtmStrikes = underlying === 'SENSEX' ? 15 : 10;
    const candidateStrikes: number[] = [];
    for (let s = atmStrike - (strikeStep * maxOtmStrikes); s <= atmStrike + (strikeStep * maxOtmStrikes); s += strikeStep) {
      candidateStrikes.push(s);
    }

    const targetOptionSymbols: string[] = [];
    const symMap = new Map<string, any>();

    for (const strike of candidateStrikes) {
      const ce = weeklyOptions.find((i: any) => Number(i.strike) === strike && i.instrument_type === 'CE');
      const pe = weeklyOptions.find((i: any) => Number(i.strike) === strike && i.instrument_type === 'PE');
      if (ce) {
        const key = `${exchange}:${ce.tradingsymbol}`;
        targetOptionSymbols.push(key);
        symMap.set(key, { ...ce, type: 'CE', strike });
      }
      if (pe) {
        const key = `${exchange}:${pe.tradingsymbol}`;
        targetOptionSymbols.push(key);
        symMap.set(key, { ...pe, type: 'PE', strike });
      }
    }

    if (targetOptionSymbols.length === 0) return;

    // Cache batch quotes for 10 seconds to avoid hitting Kite rate limits
    let quotes: any = null;
    const quotesCache = state.lastQuotesCache;
    if (quotesCache && (Date.now() - quotesCache.timestamp < 10000)) {
      quotes = quotesCache.quotes;
    } else {
      quotes = await kite.getQuote(targetOptionSymbols).catch(() => null);
      if (quotes) {
        state.lastQuotesCache = { quotes, timestamp: Date.now() };
      }
    }
    if (!quotes) return;

    // Compute Live Call OI vs Put OI & ATM PCR
    let totalCallOi = 0;
    let totalPutOi = 0;
    const optionQuotes: OptionQuoteInfo[] = [];

    for (const key of targetOptionSymbols) {
      const q = quotes[key];
      const inst = symMap.get(key);
      if (!q || !inst) continue;

      const oi = q.oi || 0;
      const ltp = q.last_price || 0;
      const volume = q.volume || 0;
      const ohlc = q.ohlc || {};

      if (inst.type === 'CE') totalCallOi += oi;
      if (inst.type === 'PE') totalPutOi += oi;

      optionQuotes.push({
        tradingsymbol: inst.tradingsymbol,
        strike: inst.strike,
        type: inst.type,
        ltp,
        oi,
        volume,
        high: ohlc.high || ltp,
        low: ohlc.low || ltp,
        open: ohlc.open || ltp,
        close: ohlc.close || ltp,
      });
    }

    const pcr = totalCallOi > 0 ? (totalPutOi / totalCallOi) : 1.0;
    state.atmPcr = Number(pcr.toFixed(2));

    // Determine 15-EMA on Future Candles
    const futureEmas = this.calculateEMA(candles, state.config.emaPeriod || 15);
    const currentEma = futureEmas[futureEmas.length - 1] || rangeData.vwap;

    const isAboveVwap = currentFuture > rangeData.vwap;
    const isAboveEma = currentFuture > currentEma;
    const isBelowVwap = currentFuture < rangeData.vwap;
    const isBelowEma = currentFuture < currentEma;

    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (isAboveVwap && isAboveEma) {
      bias = 'BULLISH';
    } else if (isBelowVwap && isBelowEma) {
      bias = 'BEARISH';
    }
    state.bias = bias;

    // Periodic Live Scanner Heartbeat Status Logging (Every 60s - Eliminates Dead Silence!)
    const nowMs = Date.now();
    const hhmm = this.getIstHhmm(now);
    if (!state.lastStatusLogTime || (nowMs - state.lastStatusLogTime) >= 60000) {
      state.lastStatusLogTime = nowMs;
      const phaseStr = hhmm < (11 * 60 + 30)
        ? 'Phase 1: Morning ORB'
        : (hhmm < (13 * 60 + 30) ? 'Phase 2: Midday Consolidation' : 'Phase 3: Afternoon Momentum');
      const dayTypeStr = isExpiryDay ? 'EXPIRY DAY' : 'DAILY SCALPER';
      this.log(
        state,
        `🔍 [${dayTypeStr} - ${phaseStr.toUpperCase()}] ${underlying} Fut: ₹${currentFuture.toFixed(2)} (ATM: ${atmStrike}) | VWAP: ₹${rangeData.vwap.toFixed(2)} | 15-EMA: ₹${currentEma.toFixed(2)} | ORH: ₹${rangeData.orh.toFixed(2)} | ORL: ₹${rangeData.orl.toFixed(2)} | Channel [₹${rangeData.low.toFixed(2)} - ₹${rangeData.high.toFixed(2)}] | Bias: ${bias} | PCR: ${state.atmPcr ?? 'N/A'}`
      );
      await this.persistLogs(state);
    }

    // ── 5. Multi-Phase Trigger Execution Check (Professional Price Action Scalper) ──
    const isPhase1 = hhmm < (11 * 60 + 30);
    const isPhase2 = hhmm >= (11 * 60 + 30) && hhmm < (13 * 60 + 30);
    const isPhase3 = hhmm >= (13 * 60 + 30);

    let isCallBreakout = false;
    let isPutBreakout = false;
    let setupReason = '';

    if (isPhase1 && state.config.enableOrbMorningTrigger !== false) {
      if (bias === 'BULLISH' && (currentFutureHigh >= rangeData.orh || currentFutureHigh >= rangeData.high)) {
        isCallBreakout = true;
        setupReason = `Morning Opening Drive broke ORH (₹${rangeData.orh.toFixed(2)})`;
      } else if (bias === 'BEARISH' && (currentFutureLow <= rangeData.orl || currentFutureLow <= rangeData.low)) {
        isPutBreakout = true;
        setupReason = `Morning Opening Drive broke ORL (₹${rangeData.orl.toFixed(2)})`;
      }
    } else if (isPhase2 && state.config.enableMiddayBreakout !== false) {
      if (bias === 'BULLISH' && currentFutureHigh >= rangeData.high) {
        isCallBreakout = true;
        setupReason = `Midday Consolidation Channel broke High (₹${rangeData.high.toFixed(2)})`;
      } else if (bias === 'BEARISH' && currentFutureLow <= rangeData.low) {
        isPutBreakout = true;
        setupReason = `Midday Consolidation Channel broke Low (₹${rangeData.low.toFixed(2)})`;
      }
    } else if (isPhase3) {
      if (bias === 'BULLISH' && currentFutureHigh >= rangeData.high) {
        isCallBreakout = true;
        setupReason = isExpiryDay
          ? `Afternoon Gamma Blast broke Range High (₹${rangeData.high.toFixed(2)})`
          : `Afternoon Momentum Extension broke Range High (₹${rangeData.high.toFixed(2)})`;
      } else if (bias === 'BEARISH' && currentFutureLow <= rangeData.low) {
        isPutBreakout = true;
        setupReason = isExpiryDay
          ? `Afternoon Gamma Blast broke Range Low (₹${rangeData.low.toFixed(2)})`
          : `Afternoon Momentum Breakdown broke Range Low (₹${rangeData.low.toFixed(2)})`;
      }
    }

    if (isCallBreakout) {
      const eligibleCe = this.autoSelectGammaStrike(optionQuotes, 'CE', atmStrike, underlying, state.config, now, isExpiryDay);
      if (eligibleCe && eligibleCe.ltp > 0) {
        const isHighConviction = (pcr >= 1.05 || totalCallOi < totalPutOi) && (eligibleCe.volume >= 1500 || eligibleCe.oi >= 8000);
        this.log(state, `🚀 [SCALPER SIGNAL - CALL] ${underlying} ${setupReason} @ Fut ₹${currentFuture.toFixed(2)} | PCR: ${pcr.toFixed(2)}${isHighConviction ? ' | High-Conviction A+ Setup' : ''}`);
        this.log(state, `🎯 Auto-Selected Strike: ${eligibleCe.tradingsymbol} @ ₹${eligibleCe.ltp.toFixed(2)} (OI: ${(eligibleCe.oi / 1000).toFixed(0)}k, Vol: ${(eligibleCe.volume / 1000).toFixed(0)}k)`);
        await this.placeGammaTrade(state, client, kite, eligibleCe.tradingsymbol, eligibleCe.ltp, 'CALL_BLAST', isHighConviction);
        return;
      }
    }

    if (isPutBreakout) {
      const eligiblePe = this.autoSelectGammaStrike(optionQuotes, 'PE', atmStrike, underlying, state.config, now, isExpiryDay);
      if (eligiblePe && eligiblePe.ltp > 0) {
        const isHighConviction = (pcr <= 0.95 || totalPutOi < totalCallOi) && (eligiblePe.volume >= 1500 || eligiblePe.oi >= 8000);
        this.log(state, `🚀 [SCALPER SIGNAL - PUT] ${underlying} ${setupReason} @ Fut ₹${currentFuture.toFixed(2)} | PCR: ${pcr.toFixed(2)}${isHighConviction ? ' | High-Conviction A+ Setup' : ''}`);
        this.log(state, `🎯 Auto-Selected Strike: ${eligiblePe.tradingsymbol} @ ₹${eligiblePe.ltp.toFixed(2)} (OI: ${(eligiblePe.oi / 1000).toFixed(0)}k, Vol: ${(eligiblePe.volume / 1000).toFixed(0)}k)`);
        await this.placeGammaTrade(state, client, kite, eligiblePe.tradingsymbol, eligiblePe.ltp, 'PUT_BLAST', isHighConviction);
        return;
      }
    }
  }

  // ── Trade Entry & Sizing ───────────────────────────────────────────────────

  private async placeGammaTrade(
    state: GammaStrategyState,
    client: any,
    kite: any,
    symbol: string,
    entryPrice: number,
    type: 'CALL_BLAST' | 'PUT_BLAST',
    isHighConviction: boolean = false
  ) {
    const exchange = state.activeExchange;
    const baseLots = state.lots || state.config.lots || 1;
    const maxConvictionLots = state.config.maxConvictionLots || 3;
    const shouldBoost = isHighConviction && state.config.enableHighConvictionBoost !== false;
    let targetLots = shouldBoost ? Math.max(baseLots, maxConvictionLots) : baseLots;

    // ── Live Capital & Available Margin Safety Check ────────────────────────
    if (!state.isPaperTrade && client.getMargins) {
      try {
        const margins = await client.getMargins().catch(() => null);
        const availableCash = margins?.equity?.available?.live_balance
          ?? margins?.equity?.available?.cash
          ?? margins?.equity?.net
          ?? 0;

        if (availableCash > 0) {
          const costPerLot = (entryPrice + 0.50) * state.lotSize;
          const requiredCapital = costPerLot * targetLots;

          if (availableCash < requiredCapital) {
            // Dynamically scale down to the maximum affordable lots
            const affordableLots = Math.floor((availableCash * 0.95) / costPerLot);
            if (affordableLots < 1) {
              this.log(state, `⚠️ [MARGIN INSUFFICIENT] Available Margin: ₹${availableCash.toFixed(2)}, but 1 Lot requires ₹${costPerLot.toFixed(2)}. Trade skipped safely to avoid broker rejection.`);
              return;
            }
            this.log(state, `⚠️ [MARGIN AUTO-ADJUSTMENT] Desired: ${targetLots} Lots (Requires ₹${requiredCapital.toFixed(2)}), but available margin is ₹${availableCash.toFixed(2)}. Dynamically adjusted down to ${affordableLots} Lots.`);
            targetLots = affordableLots;
          } else {
            this.log(state, `💰 [MARGIN VERIFIED] Available: ₹${availableCash.toFixed(2)} | Required for ${targetLots} Lots: ₹${requiredCapital.toFixed(2)} (Sufficient ✓)`);
          }
        }
      } catch (marginErr: any) {
        this.logger.warn(`Pre-trade margin check warning: ${marginErr.message}`);
      }
    }

    const lots = targetLots;
    const qty = lots * state.lotSize;
    state.executedQty = qty;
    state.isHighConvictionTrade = shouldBoost && lots > baseLots;
    state.isPartialExited = false;

    // 1. Calculate Stop Loss: User Points (e.g. 25 pts) OR Rupee budget (e.g. ₹500) OR percentage (50%)
    let slPoints = state.config.stopLossPoints;
    if (!slPoints && state.config.stopLossRs && state.config.stopLossRs > 0) {
      slPoints = state.config.stopLossRs / qty;
    }
    const defaultSlPct = state.config.initialSlPct || 50;
    let initialSl = slPoints
      ? this.roundTick(entryPrice - slPoints)
      : this.roundTick(entryPrice * (1 - defaultSlPct / 100));

    // Cap SL to stopLossRs budget if specified
    if (state.config.stopLossRs && state.config.stopLossRs > 0) {
      const maxSlPoints = state.config.stopLossRs / qty;
      const rupeeSl = this.roundTick(entryPrice - maxSlPoints);
      if (rupeeSl > 0) {
        initialSl = Math.max(initialSl, rupeeSl);
      }
    }

    // 2. Calculate Target: User Points (e.g. 45-50 pts) OR Rupee Target (e.g. ₹1,000)
    let tgtPoints = state.config.targetPoints;
    if (!tgtPoints && state.config.targetRs && state.config.targetRs > 0) {
      tgtPoints = state.config.targetRs / qty;
    }
    if (tgtPoints && tgtPoints > 0) {
      state.targetPrice = this.roundTick(entryPrice + tgtPoints);
    }

    const product = state.config.product || 'NRML';
    const effectiveRiskPts = (entryPrice - initialSl).toFixed(1);
    const maxRiskRs = ((entryPrice - initialSl) * qty).toFixed(2);
    const targetMovePts = state.targetPrice ? (state.targetPrice - entryPrice).toFixed(1) : null;
    const targetGainRs = targetMovePts ? (Number(targetMovePts) * qty).toFixed(2) : null;

    if (shouldBoost && lots > baseLots) {
      this.log(state, `🔥 [HIGH-CONVICTION A+ BOOST] Range Breakout + Volume Surge + OI Confluence verified! Scaled size to ${lots} Lots (${qty} shares)! Initial SL: ₹${initialSl.toFixed(2)} (-${effectiveRiskPts} pts, Max Risk: ₹${maxRiskRs})`);
    } else {
      this.log(state, `📋 Placing ${lots}-Lot Order: ${exchange}:${symbol} | Qty: ${qty} | Entry: ₹${entryPrice.toFixed(2)} | Initial SL: ₹${initialSl.toFixed(2)} (-${effectiveRiskPts} pts, Max Risk: ₹${maxRiskRs})${state.targetPrice ? ` | Target: ₹${state.targetPrice.toFixed(2)} (+${targetMovePts} pts, Target Gain: ₹${targetGainRs})` : ''}`);
    }

    try {
      const limitPrice = this.roundTick(entryPrice + 0.50);
      const entryId = state.isPaperTrade
        ? `PAPER_GAMMA_${Math.random().toString(36).substring(7).toUpperCase()}`
        : await client.placeOrder({
          symbol,
          exchange,
          product,
          qty,
          side: 'BUY',
          orderType: 'LIMIT',
          price: limitPrice,
        });

      state.entryOrderId = entryId;
      state.optionSymbol = symbol;
      state.entryTriggered = type;
      state.entryPrice = entryPrice;
      state.initialSlPrice = initialSl;
      state.stopLossPrice = initialSl;
      state.peakPrice = entryPrice;
      state.executedQty = qty;

      this.log(state, `✅ Entry Order placed (${entryId}) for ${qty} Qty @ Limit ₹${limitPrice.toFixed(2)}`);

      // Track in DB
      await this.trackOrderInDB(state, 'BUY', symbol, exchange, qty, entryPrice, entryId);

      // Arm broker SL Trigger Order for Live trades
      if (!state.isPaperTrade) {
        const slTrigger = this.roundTick(initialSl);
        const slLimit = this.roundTick(initialSl * 0.90);
        const slOrderId = await client.placeOrder({
          symbol,
          exchange,
          product,
          qty,
          side: 'SELL',
          orderType: 'SL',
          price: slLimit,
          triggerPrice: slTrigger,
        }).catch((e: any) => { this.log(state, `❌ SL Order notice: ${e.message}`); return null; });

        state.slOrderId = slOrderId;
        if (slOrderId) {
          this.log(state, `🛡 Broker SL Armed: Trigger ₹${slTrigger.toFixed(2)}, Limit ₹${slLimit.toFixed(2)} [OrderId: ${slOrderId}]`);
        }
      }

      // Start sub-second WebSocket ticker monitor
      await this.startRealtimeMonitor(state, client);
    } catch (err: any) {
      this.log(state, `❌ Gamma Trade Placement failed: ${err.message}`);
    }
  }

  // ── Zero-Latency Sub-Second Ratchet Trailing ───────────────────────────────

  private async startRealtimeMonitor(state: GammaStrategyState, client: any) {
    if (!state.entryTriggered || !state.optionSymbol) return;

    const symbol = state.optionSymbol;
    const exchange = state.activeExchange;
    const key = `${exchange}:${symbol}`;

    try {
      await this.tickerService.subscribeSymbol(state.brokerAccountId, symbol);
      this.log(state, `📡 Sub-Second Ticker stream activated for ${key}`);
    } catch (e: any) {
      this.log(state, `⚠ WebSocket notice: ${e.message}`);
    }

    state.realtimeActive = true;
    let isExiting = false;

    const unsubscribe = this.tickerService.registerListener(async (ticks) => {
      const currentPrice = ticks[symbol] || ticks[key];
      if (!currentPrice || !state.entryTriggered || isExiting) return;

      const now = Date.now();
      state.lastTickTime = now;
      state.currentLtp = currentPrice;

      const entry = state.entryPrice || currentPrice;
      const qty = state.executedQty || state.targetQty;
      const pnlRs = (currentPrice - entry) * qty;
      const pnlPct = ((currentPrice - entry) / entry) * 100;

      state.currentPnlRs = pnlRs;
      state.currentPnlPct = pnlPct;
      state.peakPnlRs = Math.max(state.peakPnlRs || 0, pnlRs);
      state.peakPrice = Math.max(state.peakPrice || entry, currentPrice);

      const peak = state.peakPrice;
      const multiple = currentPrice / entry;

      // ── Hard Target & Max Loss Check ───────────────────────────────────────
      const pnlPoints = currentPrice - entry;

      // 0a. Target Hit Exit (Points or Rupee Target)
      const isTargetPointsHit = state.config.targetPoints && pnlPoints >= state.config.targetPoints;
      const isTargetPriceHit = state.targetPrice && currentPrice >= state.targetPrice;
      const isTargetRsHit = state.config.targetRs && state.config.targetRs > 0 && pnlRs >= state.config.targetRs;

      if (isTargetPointsHit || isTargetPriceHit || isTargetRsHit) {
        if (state.config.exitExactAtTarget || pnlPct >= 100) {
          if (isExiting) return;
          isExiting = true;
          this.log(state, `🎯 [TARGET REACHED] Position achieved target (+${pnlPoints.toFixed(1)} pts | +₹${pnlRs.toFixed(2)})! Booking profit @ ₹${currentPrice.toFixed(2)}.`);
          this.stopRealtimeMonitor(state);
          await this.exitPosition(state, client, currentPrice, 'TARGET');
          await this.persistLogs(state);
          return;
        }
      }

      // 0b. Hard Max Loss Stop Exit
      const isSlPointsHit = state.config.stopLossPoints && (entry - currentPrice) >= state.config.stopLossPoints;
      const isSlPriceHit = state.stopLossPrice && currentPrice <= state.stopLossPrice;
      const isSlRsHit = state.config.stopLossRs && state.config.stopLossRs > 0 && pnlRs <= -Math.abs(state.config.stopLossRs);

      if (isSlPointsHit || isSlPriceHit || isSlRsHit) {
        if (isExiting) return;
        isExiting = true;
        const reason = (state.is2xLocked || state.is3xLocked || state.is5xLocked || state.isCostLocked) ? 'TARGET' : 'SL';
        this.log(state, `🛑 [STOP LOSS TRIGGERED] Exit triggered @ ₹${currentPrice.toFixed(2)} (${pnlPoints >= 0 ? '+' : ''}${pnlPoints.toFixed(1)} pts | P&L: ₹${pnlRs.toFixed(2)}). Squaring off.`);
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, reason);
        await this.persistLogs(state);
        return;
      }

      // ── Ratchet Trailing Logic ──────────────────────────────────────────────

      // 1. Milestone 1: Breakeven / Cost Lock (Halfway to Target)
      // Locks SL to Cost when either:
      //  a) Option reaches 50% of target points (e.g. +25 pts on a 50 pt target)
      //  b) Position makes 50% of rupee target (e.g. +₹500 on ₹1,000 target)
      //  c) Option gains +25% or hits costLockMultiple
      const costMultiple = state.config.costLockMultiple || 1.4;
      const target50Pts = state.config.targetPoints ? state.config.targetPoints * 0.50 : null;
      const target50Pct = (state.config.targetRs && state.config.targetRs > 0) ? state.config.targetRs * 0.50 : null;
      const shouldLockCost = !state.isCostLocked && (
        peak >= entry * costMultiple ||
        (target50Pts !== null && (peak - entry) >= target50Pts) ||
        (target50Pct !== null && (state.peakPnlRs || 0) >= target50Pct) ||
        (peak >= entry * 1.25)
      );

      if (shouldLockCost) {
        state.isCostLocked = true;
        const newSl = this.roundTick(entry + 0.50);
        state.stopLossPrice = Math.max(state.stopLossPrice || 0, newSl);
        this.log(state, `🛡 [BREAK-EVEN RISK-FREE] Peak: ₹${peak.toFixed(2)} (+${(peak - entry).toFixed(1)} pts / +₹${(state.peakPnlRs || 0).toFixed(2)} P&L)! Trailing SL locked to Cost (₹${state.stopLossPrice.toFixed(2)}) — Trade is 100% Risk-Free!`);
      }

      // 2. Milestone 2: 2x Spike (e.g. ₹18.00 -> ₹36.00) -> Lock SL at +50% Profit (₹27.00)
      const profit2xMultiple = state.config.profitLock2xMultiple || 2.0;
      if (peak >= entry * profit2xMultiple && !state.is2xLocked) {
        state.is2xLocked = true;
        const newSl = this.roundTick(entry * 1.50);
        state.stopLossPrice = Math.max(state.stopLossPrice || 0, newSl);
        this.log(state, `🎯 [2X GAMMA BLAST] Peak: ₹${peak.toFixed(2)} (${(peak / entry).toFixed(1)}x)! Trailing SL LOCKED at +50% Profit (₹${state.stopLossPrice.toFixed(2)})!`);

        // ── 50% Partial Profit Booking (Scales out half if holding >= 2 lots) ──
        const activeQty = state.executedQty || state.targetQty;
        if (state.config.enablePartialProfitBooking !== false && !state.isPartialExited && activeQty >= state.lotSize * 2) {
          state.isPartialExited = true;
          const partialQty = Math.floor((activeQty / 2) / state.lotSize) * state.lotSize;
          if (partialQty > 0) {
            await this.partialExitPosition(state, client, currentPrice, partialQty, '2X_PARTIAL_PROFIT');
          }
        }
      }

      // 3. Continuous High-Water Mark Dynamic Peak Trailing
      if (state.config.enablePeakTrailing !== false) {
        if (peak >= entry * 2.0 && peak < entry * 3.0) {
          const peakTrailSl = this.roundTick(peak * 0.75); // 25% pullback buffer
          if (peakTrailSl > (state.stopLossPrice || 0)) {
            state.stopLossPrice = peakTrailSl;
          }
        } else if (peak >= entry * 3.0 && peak < entry * 4.0) {
          const peakTrailSl = this.roundTick(peak * 0.80); // 20% pullback buffer
          if (peakTrailSl > (state.stopLossPrice || 0)) {
            state.stopLossPrice = peakTrailSl;
          }
        } else if (peak >= entry * 4.0) {
          const peakTrailSl = this.roundTick(peak * 0.85); // 15% pullback buffer
          if (peakTrailSl > (state.stopLossPrice || 0)) {
            state.stopLossPrice = peakTrailSl;
          }
        }
      }

      // 4. Expiry Parabolic Profit Harvest Safeguard (15:24+ IST)
      // On expiry day, deep OTM gamma blast options lose all value after 15:25.
      // If the trade has exploded by >= 2.0x, lock in massive profits before the 15:27 post-expiry collapse!
      const istNow = new Date();
      const istHhmm = this.getIstHhmm(istNow);
      if (istHhmm >= 15 * 60 + 24 && peak >= entry * 2.0 && !isExiting) {
        isExiting = true;
        this.log(state, `⏰ [15:24 IST EXPIRY HARVEST] Locking peak gamma blast profits (+${pnlPct.toFixed(1)}%) @ ₹${currentPrice.toFixed(2)} before closing collapse!`);
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, 'TARGET');
        await this.persistLogs(state);
        return;
      }

      // ── Exit Check ─────────────────────────────────────────────────────────
      if (currentPrice <= (state.stopLossPrice || 0)) {
        if (isExiting) return;
        isExiting = true;
        const reason = (state.is2xLocked || state.is3xLocked || state.is5xLocked || state.isCostLocked) ? 'TARGET' : 'SL';
        this.log(state, `🛑 Trailing Stop hit @ ₹${currentPrice.toFixed(2)} (Floor: ₹${state.stopLossPrice?.toFixed(2)}, Peak: ₹${peak.toFixed(2)}) | Realized P&L: ₹${pnlRs.toFixed(2)}`);
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, reason);
        await this.persistLogs(state);
        return;
      }

      // Throttle broadcast for UI live updates (500ms)
      if (now - (state.lastEmitTime || 0) >= 500) {
        state.lastEmitTime = now;
        strategyEvents.emit('strategy.update', {
          strategyId: state.strategyId,
          logs: state.logs,
          state: this.getState(state.strategyId),
        });
      }

      // Throttled logging every 10s
      if (now - (state.lastPnlLogTime || 0) >= 10000) {
        state.lastPnlLogTime = now;
        const sign = pnlRs >= 0 ? '+' : '';
        this.log(state, `📊 [LIVE GAMMA] ${symbol}: ₹${currentPrice.toFixed(2)} (${multiple.toFixed(2)}x) | Entry: ₹${entry.toFixed(2)} | Trail SL: ₹${state.stopLossPrice?.toFixed(2)} | Peak: ₹${peak.toFixed(2)} | P&L: ${sign}₹${pnlRs.toFixed(2)} (${sign}${pnlPct.toFixed(1)}%)`);
        await this.persistLogs(state);
      }
    });

    state.tickerUnsubscribe = unsubscribe;
  }

  private stopRealtimeMonitor(state: GammaStrategyState) {
    if (state.tickerUnsubscribe) {
      state.tickerUnsubscribe();
      state.tickerUnsubscribe = undefined;
      state.realtimeActive = false;
    }
  }

  private async monitorPosition(state: GammaStrategyState, client: any, kite: any) {
    if (!state.entryTriggered || !state.optionSymbol) return;

    const symbol = state.optionSymbol;
    const exchange = state.activeExchange;
    const key = `${exchange}:${symbol}`;

    // Safety LTP check if WebSocket is quiet
    let currentPrice = state.currentLtp;
    if (!currentPrice || (state.lastTickTime && Date.now() - state.lastTickTime > 4000)) {
      try {
        const ltpData = await kite.getLTP([key]);
        if (ltpData[key]?.last_price) {
          currentPrice = ltpData[key].last_price;
          state.currentLtp = currentPrice;
        }
      } catch { }
    }

    if (!currentPrice) return;

    const entry = state.entryPrice || currentPrice;
    const qty = state.executedQty || state.targetQty;
    const pnlRs = (currentPrice - entry) * qty;

    // 1. Stop Loss Hit Check
    if (currentPrice <= (state.stopLossPrice || 0)) {
      this.log(state, `🛑 Position Monitor: Trailing SL triggered @ ₹${currentPrice.toFixed(2)} (Floor: ₹${state.stopLossPrice?.toFixed(2)}, Peak: ₹${state.peakPrice?.toFixed(2)}) | P&L: ₹${pnlRs.toFixed(2)}`);
      await this.exitPosition(state, client, currentPrice, 'SL');
      await this.persistLogs(state);
      return;
    }

    // 2. 15 EMA Option Trend Exhaustion Exit Check
    if (state.config.enableEmaExit !== false && (state.peakPrice || 0) >= entry * 1.3) {
      try {
        const from = new Date(Date.now() - (60 * 60 * 1000)); // Last 60 mins
        const optCandles = await client.getHistoricalData(symbol, exchange, '3minute', from, new Date()).catch(() => []);
        if (optCandles && optCandles.length >= (state.config.emaPeriod || 15)) {
          const candleObjs: Candle[] = optCandles.map((oc: any) => ({
            date: new Date(oc.date),
            open: Number(oc.open),
            high: Number(oc.high),
            low: Number(oc.low),
            close: Number(oc.close),
            volume: Number(oc.volume || 1),
          }));
          const emas = this.calculateEMA(candleObjs, state.config.emaPeriod || 15);
          const lastClosedCandle = candleObjs[candleObjs.length - 2] || candleObjs[candleObjs.length - 1];
          const lastClosedEma = emas[emas.length - 2] || emas[emas.length - 1];

          if (lastClosedEma && lastClosedCandle.close < lastClosedEma) {
            this.log(state, `📉 [15 EMA TRAIL EXIT] Option candle closed @ ₹${lastClosedCandle.close.toFixed(2)} below 15 EMA (₹${lastClosedEma.toFixed(2)}) | Securing Profit @ ₹${currentPrice.toFixed(2)} (Peak: ₹${state.peakPrice?.toFixed(2)})`);
            await this.exitPosition(state, client, currentPrice, 'EMA_TRAIL');
            await this.persistLogs(state);
            return;
          }
        }
      } catch { }
    }

    // 3. Underlying Future 15-EMA & VWAP Trend Exhaustion Exit Check (Same as Nifty Engine)
    if (state.futureSymbol && (state.peakPrice || 0) >= entry * 1.3) {
      try {
        const futCandles = await this.fetchFutureCandles(client, state.futureSymbol, state.futureExchange || exchange, new Date());
        if (futCandles && futCandles.length >= 15) {
          const futEmas = this.calculateEMA(futCandles, state.config.emaPeriod || 15);
          const futVwaps = this.calculateVWAP(futCandles, 'hlc3');

          const lastIdx = futCandles.length - 1;
          const isClosed = (Date.now() - futCandles[lastIdx].date.getTime()) >= 3 * 60 * 1000;
          const evalIdx = isClosed ? lastIdx : lastIdx - 1;

          if (evalIdx >= 14) {
            const evalCandle = futCandles[evalIdx];
            const evalEma = futEmas[evalIdx];
            const evalVwap = futVwaps[evalIdx];

            if (evalEma !== null && evalVwap !== null) {
              if (state.entryTriggered === 'CALL_BLAST') {
                // Call trade: if future candle closes below both 15-EMA and VWAP, institutional rally has broken down!
                if (evalCandle.close < evalEma && evalCandle.close < evalVwap) {
                  this.log(state, `📉 [FUTURE EMA/VWAP BREAKDOWN EXIT] ${state.activeUnderlying} Future closed @ ₹${evalCandle.close.toFixed(2)} below 15-EMA (₹${evalEma.toFixed(2)}) & VWAP (₹${evalVwap.toFixed(2)})! Securing Runner Profit @ ₹${currentPrice.toFixed(2)} (Peak: ₹${state.peakPrice?.toFixed(2)})`);
                  await this.exitPosition(state, client, currentPrice, 'FUT_EMA_VWAP_EXIT');
                  await this.persistLogs(state);
                  return;
                }
              } else if (state.entryTriggered === 'PUT_BLAST') {
                // Put trade: if future candle closes above both 15-EMA and VWAP, institutional fall has reversed!
                if (evalCandle.close > evalEma && evalCandle.close > evalVwap) {
                  this.log(state, `📈 [FUTURE EMA/VWAP REVERSAL EXIT] ${state.activeUnderlying} Future closed @ ₹${evalCandle.close.toFixed(2)} above 15-EMA (₹${evalEma.toFixed(2)}) & VWAP (₹${evalVwap.toFixed(2)})! Securing Runner Profit @ ₹${currentPrice.toFixed(2)} (Peak: ₹${state.peakPrice?.toFixed(2)})`);
                  await this.exitPosition(state, client, currentPrice, 'FUT_EMA_VWAP_EXIT');
                  await this.persistLogs(state);
                  return;
                }
              }
            }
          }
        }
      } catch (futErr: any) {
        this.log(state, `⚠ Future EMA/VWAP monitor notice: ${futErr.message}`);
      }
    }
  }

  private async partialExitPosition(state: GammaStrategyState, client: any, exitPrice: number, partialQty: number, reason: string) {
    const symbol = state.optionSymbol || state.config.symbol;
    const exchange = state.activeExchange;

    try {
      let exitOrderId = '';
      if (state.isPaperTrade) {
        exitOrderId = `PAPER_PARTIAL_${Math.random().toString(36).substring(7).toUpperCase()}`;
      } else {
        // Cancel pending broker SL order to avoid mismatch
        if (state.slOrderId) {
          await client.cancelOrder(state.slOrderId).catch(() => { });
        }

        exitOrderId = await client.placeOrder({
          symbol,
          exchange,
          product: state.config.product || 'NRML',
          qty: partialQty,
          side: 'SELL',
          orderType: 'MARKET',
        });
        this.log(state, `✅ Partial Market Exit Order Placed (${reason}): ${exitOrderId} for ${partialQty} Qty`);

        // Re-arm broker SL for remaining quantity
        const remainingQty = (state.executedQty || state.targetQty) - partialQty;
        if (remainingQty > 0 && state.stopLossPrice) {
          const slTrigger = this.roundTick(state.stopLossPrice);
          const slLimit = this.roundTick(slTrigger * 0.90);
          state.slOrderId = await client.placeOrder({
            symbol,
            exchange,
            product: state.config.product || 'NRML',
            qty: remainingQty,
            side: 'SELL',
            orderType: 'SL',
            price: slLimit,
            triggerPrice: slTrigger,
          }).catch(() => null);

          if (state.slOrderId) {
            this.log(state, `🛡 Re-armed Broker SL for remaining ${remainingQty} Qty: Trigger ₹${slTrigger.toFixed(2)} [OrderId: ${state.slOrderId}]`);
          }
        }
      }

      await this.trackOrderInDB(state, 'SELL', symbol, exchange, partialQty, exitPrice, exitOrderId, undefined, 'MARKET');

      const entry = state.entryPrice || exitPrice;
      const bookedPnl = (exitPrice - entry) * partialQty;
      state.dailyRealizedPnlRs = (state.dailyRealizedPnlRs || 0) + bookedPnl;
      state.executedQty = (state.executedQty || state.targetQty) - partialQty;

      this.log(state, `💰 [50% PARTIAL PROFIT SECURED] Sold ${partialQty} shares @ ₹${exitPrice.toFixed(2)} | Realized: +₹${bookedPnl.toFixed(2)} | 100% Principal Recovered! Remaining ${state.executedQty} shares trailing risk-free!`);
    } catch (e: any) {
      this.log(state, `⚠ Partial exit notice: ${e.message}`);
    }
  }

  private async exitPosition(state: GammaStrategyState, client: any, exitPrice: number, reason: string) {
    const symbol = state.optionSymbol || state.config.symbol;
    const exchange = state.activeExchange;
    const qty = state.executedQty || state.targetQty;

    this.stopRealtimeMonitor(state);

    try {
      let exitOrderId = '';
      if (state.isPaperTrade) {
        exitOrderId = `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`;
      } else {
        // Cancel pending broker SL order
        if (state.slOrderId) {
          await client.cancelOrder(state.slOrderId).catch(() => { });
        }

        // Capital Wipeout Guard: Verify broker net quantity before placing exit order
        const kite = client['kite'];
        let isManuallyClosed = false;
        try {
          const exitSafety = await isSafeToExit(kite, symbol, 'SELL', this.logger);
          if (!exitSafety.safe) {
            isManuallyClosed = true;
            this.log(state, `ℹ [AUTO-SYNC] ${symbol} was already squared off on Zerodha (Broker Qty: ${exitSafety.brokerQty}). Skipping duplicate exit order to prevent unintended short.`);
          }
        } catch (posErr: any) {
          this.log(state, `⚠ Position sync check notice: ${posErr.message}`);
        }

        if (!isManuallyClosed) {
          exitOrderId = await client.placeOrder({
            symbol,
            exchange,
            product: state.config.product || 'NRML',
            qty,
            side: 'SELL',
            orderType: 'MARKET',
          });
          this.log(state, `✅ Live Market Exit Order Placed (${reason}): ${exitOrderId}`);
        }
      }

      await this.trackOrderInDB(state, 'SELL', symbol, exchange, qty, exitPrice, exitOrderId, undefined, 'MARKET');
      state.tradesPlacedToday++;

      const entry = state.entryPrice || exitPrice;
      const tradePnl = (exitPrice - entry) * qty;
      state.dailyRealizedPnlRs = (state.dailyRealizedPnlRs || 0) + tradePnl;

      if (tradePnl > 0) state.winningTradesToday++;
      if (state.winningTradesToday >= (state.config.maxWinsPerDay || 1)) {
        state.dailyTargetLocked = true;
        this.log(state, `🏆 Daily Profit Discipline: Reached ${state.winningTradesToday} winning trade(s)! Daily goal achieved. Locking strategy for today to protect capital.`);
      }
      if (state.config.targetRs && state.dailyRealizedPnlRs >= state.config.targetRs) {
        state.dailyTargetLocked = true;
        this.log(state, `🎯 Daily Target Discipline: Reached ₹${state.dailyRealizedPnlRs.toFixed(2)} (>= ₹${state.config.targetRs})! Locking strategy for today.`);
      }
      if (state.config.stopLossRs && state.dailyRealizedPnlRs <= -Math.abs(state.config.stopLossRs)) {
        state.dailyTargetLocked = true;
        this.log(state, `🛑 Daily Max Loss Shield: Realized ₹${state.dailyRealizedPnlRs.toFixed(2)} (<= -₹${state.config.stopLossRs})! Locking strategy for today to protect capital.`);
      }

      this.log(state, `🎉 Trade Closed (${reason}) @ ₹${exitPrice.toFixed(2)} | P&L: ${tradePnl >= 0 ? '+' : ''}₹${tradePnl.toFixed(2)} | Total Today: ₹${state.dailyRealizedPnlRs.toFixed(2)}`);

      this.stopRealtimeMonitor(state);
      state.entryTriggered = null;
      state.optionSymbol = null;
      state.entryPrice = null;
      state.stopLossPrice = null;
      state.slOrderId = null;
      state.peakPrice = 0;
      state.isCostLocked = false;
      state.is2xLocked = false;
      state.is3xLocked = false;
      state.is5xLocked = false;
      state.isPartialExited = false;
      state.isHighConvictionTrade = false;

      strategyEvents.emit('strategy.update', {
        strategyId: state.strategyId,
        logs: state.logs,
        state: this.getState(state.strategyId),
      });
    } catch (e: any) {
      this.log(state, `❌ Exit failed: ${e.message}`);
    }
  }

  // ── Helper Utilities ───────────────────────────────────────────────────────

  private calculateEMA(candles: Candle[], period: number): (number | null)[] {
    const emas: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period) return emas;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += candles[i].close;
    let prev = sum / period;
    emas[period - 1] = prev;
    const mult = 2 / (period + 1);
    for (let i = period; i < candles.length; i++) {
      const ema = (candles[i].close - prev) * mult + prev;
      emas[i] = ema;
      prev = ema;
    }
    return emas;
  }

  private calculateVWAP(candles: Candle[], vwapSource: 'close' | 'hlc3' = 'hlc3'): (number | null)[] {
    const vwaps: (number | null)[] = new Array(candles.length).fill(null);
    let cpv = 0, cv = 0;
    let lastDateStr = '';
    for (let i = 0; i < candles.length; i++) {
      const dateStr = this.getIstDateStr(candles[i].date);
      if (dateStr !== lastDateStr) {
        cpv = 0; cv = 0; lastDateStr = dateStr;
      }
      const price = vwapSource === 'close' ? candles[i].close : (candles[i].high + candles[i].low + candles[i].close) / 3;
      cpv += price * (candles[i].volume || 1);
      cv += (candles[i].volume || 1);
      vwaps[i] = cv === 0 ? candles[i].close : cpv / cv;
    }
    return vwaps;
  }

  private formatTime(d: Date): string {
    return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  private async findFutureSymbol(client: any, baseSymbol: string): Promise<{ symbol: string; exchange: string }> {
    const upperSymbol = baseSymbol.toUpperCase().trim();
    const isSensex = upperSymbol === 'SENSEX' || upperSymbol === 'BSE SENSEX';
    const exchange = isSensex ? 'BFO' : 'NFO';
    const segment = isSensex ? 'BFO-FUT' : 'NFO-FUT';
    const underlying = isSensex ? 'SENSEX' : (upperSymbol.includes('BANK') ? 'BANKNIFTY' : 'NIFTY');

    const instruments = await client.getInstruments(exchange);
    const futures = instruments.filter((i: any) => i.name === underlying && i.instrument_type === 'FUT' && i.segment === segment);
    if (futures.length === 0) throw new Error(`No ${exchange} future found for ${baseSymbol}`);
    const sorted = futures.sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    return { symbol: sorted[0].tradingsymbol, exchange };
  }

  private async fetchFutureCandles(client: any, symbol: string, exchange: string, now: Date): Promise<Candle[]> {
    try {
      const from = new Date(now.getTime() - (5 * 24 * 60 * 60 * 1000));
      const data = await client.getHistoricalData(symbol, exchange, '3minute', from, now);
      return (data || []).map((c: any) => ({
        date: new Date(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 1000,
      }));
    } catch {
      return [];
    }
  }

  private calculateCompressionRange(candles: Candle[], now: Date, startTimeStr: string = '09:20'): { high: number; low: number; vwap: number; orh: number; orl: number } | null {
    if (candles.length === 0) return null;

    const todayStr = this.getIstDateStr(now);
    const todayCandles = candles.filter(c => this.getIstDateStr(c.date) === todayStr);
    const evalCandles = todayCandles.length >= 2 ? todayCandles : candles.slice(-20);

    // 1. Opening Range High / Low (first two 3m candles of session: 09:15 - 09:21)
    let orh = -Infinity;
    let orl = Infinity;
    const openingCandles = evalCandles.filter(c => {
      const hhmm = this.getIstHhmm(c.date);
      return hhmm >= 9 * 60 + 15 && hhmm <= 9 * 60 + 21;
    });

    for (const c of (openingCandles.length > 0 ? openingCandles : evalCandles.slice(0, 2))) {
      if (c.high > orh) orh = c.high;
      if (c.low < orl) orl = c.low;
    }

    // 2. Rolling compression channel (last 8-10 3m candles = ~25 to 30 mins)
    const rollingCandles = evalCandles.length >= 8 ? evalCandles.slice(-10) : evalCandles;
    let high = -Infinity;
    let low = Infinity;
    for (const c of rollingCandles) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
    }

    // 3. Cumulative Session VWAP across all today's candles
    let sumPv = 0;
    let sumV = 0;
    for (const c of evalCandles) {
      const typical = (c.high + c.low + c.close) / 3;
      sumPv += typical * (c.volume || 1);
      sumV += (c.volume || 1);
    }
    const vwap = sumV > 0 ? (sumPv / sumV) : evalCandles[evalCandles.length - 1].close;

    return {
      high: high === -Infinity ? evalCandles[evalCandles.length - 1].close : high,
      low: low === Infinity ? evalCandles[evalCandles.length - 1].close : low,
      vwap,
      orh: orh === -Infinity ? high : orh,
      orl: orl === Infinity ? low : orl,
    };
  }

  private async trackOrderInDB(
    state: GammaStrategyState,
    side: 'BUY' | 'SELL',
    symbol: string,
    exchange: string,
    qty: number,
    price: number,
    orderId: string,
    createdAt?: Date,
    orderType: 'MARKET' | 'LIMIT' | 'SL' = 'LIMIT'
  ) {
    try {
      const exec = await this.prisma.strategyExecution.findUnique({
        where: { id: state.executionId },
        include: { strategy: true },
      });
      if (!exec) return;

      await this.prisma.order.create({
        data: {
          userId: exec.strategy.userId,
          brokerAccountId: state.brokerAccountId,
          strategyId: exec.strategyId,
          executionId: state.executionId,
          symbol,
          exchange,
          side: side as any,
          orderType: orderType as any,
          productType: (state.config as any).product || 'NRML',
          qty,
          filledQty: qty,
          price,
          avgPrice: price,
          status: 'COMPLETE',
          brokerOrderId: orderId,
          isPaperTrade: state.isPaperTrade,
          ...(createdAt ? { createdAt } : {}),
        },
      });
    } catch { }
  }

  private getIstHhmm(date: Date): number {
    const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
    const istDate = new Date(utcMs + (330 * 60000));
    return istDate.getHours() * 60 + istDate.getMinutes();
  }

  private getIstDayOfWeek(date: Date): number {
    const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
    const istDate = new Date(utcMs + (330 * 60000));
    return istDate.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  }

  private getIstDateStr(date: Date): string {
    const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
    const istDate = new Date(utcMs + (330 * 60000));
    const y = istDate.getFullYear();
    const m = String(istDate.getMonth() + 1).padStart(2, '0');
    const d = String(istDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private roundTick(p: number): number {
    return Math.round(p * 20) / 20; // 0.05 tick size for options
  }

  private log(state: GammaStrategyState, message: string) {
    const timeStr = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const formatted = `[${timeStr}] ${message}`;
    state.logs.push(formatted);
    if (state.logs.length > 500) state.logs.shift();
    this.logger.log(`[Strategy ${state.strategyId.slice(0, 8)}] ${formatted}`);
  }

  private async persistLogs(state: GammaStrategyState) {
    try {
      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { logs: JSON.stringify(state.logs) },
      });
    } catch { }
  }
}
