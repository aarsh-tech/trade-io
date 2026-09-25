import { Injectable, Logger } from '@nestjs/common';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { withKiteRetry } from '../brokers/kite-errors';
import { OrderGateway } from '../order-gateway/order-gateway.service';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';
import { strategyEvents } from '../common/events';
import { TickerService } from '../market/ticker.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmaVwapCrossoverConfig } from './dto/strategy.dto';
import { findOpenPosition, protectionNotice, PositionUnknownError } from './position-recovery';
import { getInstrumentTickSize, getTopCandidateStocks, roundToInstrumentTick } from './smart-stock-picker';
import { getLiveBrokerPosition, isSafeToExit, safeCancelPendingOrders, getCompletedBrokerExitDetails } from './broker-position-guard';

interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StrategyState {
  strategyId: string;
  executionId: string;
  config: EmaVwapCrossoverConfig;
  userId: string;
  brokerAccountId: string;
  isPaperTrade: boolean;
  futureSymbol: string | null;
  futureExchange: string;
  lastEma: number | null;
  lastVwap: number | null;
  waitingForConfirmation: 'LONG' | 'SHORT' | null;
  confirmationHigh: number | null;
  confirmationLow: number | null;
  invalidationPrice: number | null;
  setupTimestamp: number | null;
  setupType?: 'DIRECT' | 'INSIDE_CANDLE' | 'OPEN_LOW_DRIVE' | 'OPEN_HIGH_DRIVE' | 'TREND_BREAKDOWN' | 'TREND_BREAKOUT' | 'PULLBACK_REJECTION' | 'OPEN_1MIN_MOMENTUM';
  cooldownSymbols?: Map<string, number>;
  invalidatedCrossoverTime?: number | null;
  entryPrice: number | null;
  entryTime?: Date | null;
  stopLossPrice: number | null;
  spotStopLossPrice?: number | null;
  targetPrice: number | null;
  entryOrderId?: string | null;
  executedQty?: number;
  slOrderId: string | null;
  targetOrderId: string | null;
  entryTriggered: 'LONG' | 'SHORT' | null;
  optionSymbol: string | null;
  tradesPlacedToday: number;
  logs: string[];
  lastProcessedTimestamp?: number;
  tickerUnsubscribe?: () => void;
  realtimeActive?: boolean;
  lastPnlLogTime?: number;
  lastEmitTime?: number;
  lastTickTime?: number;
  lastTickStartTime?: number;
  lastDbPersistTime?: number;
  lastPersistedLogCount?: number;
  hasLoggedOpeningWindow?: boolean;
  lastFallbackLogTime?: number;
  currentLtp?: number;
  currentPnlRs?: number;
  currentPnlPct?: number;
  peakPnlRs?: number;
  lockedProfitRs?: number;
  isCostLocked?: boolean;
  isHalfTargetLocked?: boolean;
  isTrailingEma?: boolean;
  isParabolicActive?: boolean;
  emaWarningCandle?: {
    date: Date;
    low: number;
    high: number;
    close: number;
  } | null;
  reEntryEligible?: boolean;
  reEntrySwingPrice?: number | null;
  reEntryCountToday?: number;
  isAutoMode?: boolean;
  activeSymbol?: string | null;
  dailyRealizedPnlRs?: number;
  dailyTargetLocked?: boolean;
  lastBrokerSlTrigger?: number;
  lastBrokerSlModifyTime?: number;
  isProcessingTick?: boolean;
  isPlacingTrade?: boolean;
  isExiting?: boolean;
  lastAutoScanTime?: number;
  last5mHeartbeatTime?: number;
  lastProcessedTimestampBySymbol?: Map<string, number>;
  dailyAtrPct?: number;
  dynamicParabolicPct?: number;
  logicalTargetReason?: string;
  pdh?: number | null;
  pdl?: number | null;
  pdc?: number | null;
}

@Injectable()
export class EmaVwapCrossoverEngine {
  private readonly logger = new Logger(EmaVwapCrossoverEngine.name);
  private readonly running = new Map<string, StrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly candleCache = new Map<string, { candles: Candle[]; expiresAt: number }>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
    private tickerService: TickerService,
    private orderGateway: OrderGateway,
  ) { }

  /** All broker orders go through the OrderGateway (kill switch, limits, tagging, DB record). */
  private async placeOrder(state: StrategyState, params: OrderParams): Promise<string> {
    const placed = await this.orderGateway.place(state.userId, state.brokerAccountId, params, {
      strategyId: state.strategyId,
      executionId: state.executionId,
    });
    return placed.orderId;
  }

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) return { executionId: this.running.get(strategyId)!.executionId };

    const strategy = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
      include: { brokerAccount: true },
    });
    if (!strategy) throw new Error('Strategy not found');

    const config: EmaVwapCrossoverConfig = JSON.parse(strategy.config);
    await this.prisma.strategyExecution.updateMany({
      where: { strategyId, status: 'RUNNING' },
      data: { status: 'STOPPED', stoppedAt: new Date() },
    });
    const execution = await this.prisma.strategyExecution.create({ data: { strategyId, status: 'RUNNING' } });

    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: true } });

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const todayStart = new Date(`${todayStr}T00:00:00.000+05:30`);
    const completedOrdersCount = await this.prisma.order.count({
      where: {
        execution: { strategyId },
        createdAt: { gte: todayStart },
        status: 'COMPLETE',
        isPaperTrade: false
      }
    }).catch(() => 0);

    let detectedCapital = (config as any).maxCapital;
    let liveMarginDetected = false;

    if (strategy.brokerAccount?.accessToken) {
      try {
        const client = this.factory.createClient(strategy.brokerAccount);
        const kite = client['kite'] || client;
        const liveMargins = await (kite.getMargins ? kite.getMargins() : client.getMargins?.()).catch(() => null);
        const liveCash = liveMargins?.equity?.available?.live_balance
          ?? liveMargins?.equity?.available?.cash
          ?? liveMargins?.equity?.net
          ?? liveMargins?.available?.live_balance
          ?? liveMargins?.available?.cash
          ?? liveMargins?.net;
        if (liveCash && liveCash > 0) {
          detectedCapital = Number(liveCash);
          liveMarginDetected = true;
        }
      } catch (err: any) {
        this.logger.debug?.(`Capital detection error on start: ${err?.message}`);
      }
    }

    if (!detectedCapital || detectedCapital <= 0) {
      detectedCapital = 15000;
    }
    (config as any).maxCapital = detectedCapital;

    // ── Recover today's executed trades and realized P&L from DB ──────────
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const todayOrders = await this.prisma.order.findMany({
      where: {
        strategyId,
        createdAt: { gte: todayMidnight },
        status: 'COMPLETE',
      },
      orderBy: { createdAt: 'asc' },
    }).catch(() => []);

    const symbolOrders: Record<string, any[]> = {};
    for (const o of todayOrders) {
      if (!symbolOrders[o.symbol]) symbolOrders[o.symbol] = [];
      symbolOrders[o.symbol].push(o);
    }

    let recoveredTradesToday = 0;
    let recoveredRealizedPnlRs = 0;

    for (const sym of Object.keys(symbolOrders)) {
      const symList = symbolOrders[sym];
      let pos = 0;
      let cost = 0;

      for (const o of symList) {
        const p = o.price || o.avgPrice || 0;
        if (pos === 0) {
          recoveredTradesToday++;
        }
        if (o.side === 'BUY') {
          pos += o.qty;
          cost -= p * o.qty;
        } else {
          pos -= o.qty;
          cost += p * o.qty;
        }
        if (pos === 0) {
          recoveredRealizedPnlRs += cost;
          cost = 0;
        }
      }
    }

    const targetThresholdRs = config.targetRs && config.targetRs > 0 ? config.targetRs : 500;
    const maxRiskRs = config.stopLossRs && config.stopLossRs > 0 ? config.stopLossRs : (targetThresholdRs * 1.5);
    let recoveredDailyTargetLocked = false;
    if (config.enableDailyPnLLock !== false) {
      if (recoveredRealizedPnlRs >= targetThresholdRs || recoveredRealizedPnlRs <= -maxRiskRs) {
        recoveredDailyTargetLocked = true;
      }
    }

    const state: StrategyState = {
      strategyId,
      executionId: execution.id,
      config,
      userId: strategy.userId,
      brokerAccountId: strategy.brokerAccountId!,
      isPaperTrade: strategy.isPaperTrade,
      futureSymbol: null,
      futureExchange: 'NFO',
      lastEma: null,
      lastVwap: null,
      waitingForConfirmation: null,
      confirmationHigh: null,
      confirmationLow: null,
      invalidationPrice: null,
      setupTimestamp: null,
      entryPrice: null,
      stopLossPrice: null,
      targetPrice: null,
      slOrderId: null,
      targetOrderId: null,
      entryTriggered: null,
      optionSymbol: null,
      tradesPlacedToday: recoveredTradesToday,
      dailyRealizedPnlRs: recoveredRealizedPnlRs,
      dailyTargetLocked: recoveredDailyTargetLocked,
      logs: [],
      lastProcessedTimestamp: 0,
      isAutoMode: config.symbol === 'AUTO' || config.symbol?.startsWith('AUTO'),
      activeSymbol: (config.symbol === 'AUTO' || config.symbol?.startsWith('AUTO')) ? null : config.symbol,
      peakPnlRs: 0,
      lockedProfitRs: 0,
      isTrailingEma: false,
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Strategy started — ${config.symbol}:${config.exchange} | Mode: ${strategy.isPaperTrade ? 'PAPER TRADING' : 'LIVE TRADING'}`);
    this.log(state, `💰 Detected Trading Capital: ₹${detectedCapital.toLocaleString('en-IN')}${liveMarginDetected ? ' (Live Zerodha Margin)' : (strategy.isPaperTrade ? ' [Paper Trading Mode]' : ' [Default / Configured]')}`);

    if (recoveredTradesToday > 0 || recoveredRealizedPnlRs !== 0) {
      this.log(state, `📊 [STATE RECOVERY] Restored today's historical state: ${recoveredTradesToday}/${config.maxTradesPerDay} trades executed | Realized P&L: ₹${recoveredRealizedPnlRs.toFixed(2)}${recoveredDailyTargetLocked ? ' (Daily Limit Locked)' : ''}`);
    }

    // ── Open-position recovery after power cut / restart (LIVE from broker, PAPER from saved orders) ──
    // Runs before the completion checks below so a restart with an open position never
    // "completes" the strategy and leaves that position unmanaged.
    const recoveredPosition = await this.recoverOpenPosition(state, strategy.brokerAccount);

    // If max trades already reached or daily limit locked, immediately stop and do NOT trade
    if (!recoveredPosition && recoveredTradesToday >= config.maxTradesPerDay) {
      this.log(state, `⛔ Max daily trade cap (${config.maxTradesPerDay}) already reached for today. Strategy completed.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'COMPLETED', `⛔ Auto-Stopped: Max daily trade cap reached`);
      return { executionId: execution.id };
    }

    if (!recoveredPosition && recoveredDailyTargetLocked) {
      this.log(state, `🔒 Daily Profit/Loss limit already reached today (₹${recoveredRealizedPnlRs.toFixed(2)}). Strategy completed.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'COMPLETED', `🔒 Auto-Stopped: Daily limit locked`);
      return { executionId: execution.id };
    }

    await this.persistLogs(state); // Persist immediately so UI shows "Started" and capital

    const timer = setInterval(() => this.tick(strategyId).catch(e => this.logger.error(e)), 4_000);
    this.timers.set(strategyId, timer);

    if (strategy.isPaperTrade) {
      this.initialCatchup(strategyId).then(() => {
        this.tick(strategyId).catch(e => this.logger.error(e));
      }).catch(e => this.logger.error(`Catch-up error: ${e.message}`));
    } else {
      this.tick(strategyId).catch(e => this.logger.error(e));
    }

    return { executionId: execution.id };
  }

  private async recoverOpenPosition(state: StrategyState, brokerAccount: any): Promise<boolean> {
    try {
      const config = state.config;
      const pos = await findOpenPosition({
        prisma: this.prisma,
        factory: this.factory,
        strategyId: state.strategyId,
        executionId: state.executionId,
        isPaper: state.isPaperTrade,
        brokerAccount,
        accept: (sym) => state.isAutoMode || sym === config.symbol || sym.startsWith(config.symbol) || /(CE|PE)$/.test(sym),
      });
      if (!pos) return false;

      const isOption = /(CE|PE)$/.test(pos.symbol);
      const entryAvg = pos.avgPrice;
      const riskPerSh = entryAvg * 0.01;
      const isLong = pos.side === 'LONG';

      state.activeSymbol = pos.symbol;
      state.optionSymbol = isOption ? pos.symbol : null;
      // For options the position is always a bought CE/PE; the signal direction follows the option type.
      state.entryTriggered = isOption ? (pos.symbol.endsWith('PE') ? 'SHORT' : 'LONG') : pos.side;
      state.executedQty = pos.qty;
      state.config.qty = pos.qty;
      state.entryPrice = entryAvg;
      state.entryTime = new Date();
      state.setupTimestamp = Date.now();
      state.slOrderId = pos.slOrderId;
      state.targetOrderId = pos.targetOrderId;
      state.stopLossPrice = pos.slPrice ?? (isLong ? entryAvg - riskPerSh : entryAvg + riskPerSh);
      const risk = Math.abs(entryAvg - state.stopLossPrice) || riskPerSh;
      state.targetPrice = pos.targetPrice ?? (isLong ? entryAvg + risk * 1.5 : entryAvg - risk * 1.5);

      this.log(state, `🔄 [${pos.isPaper ? 'PAPER' : 'POWER'} RECOVERY] Reconnected to active position: ${pos.symbol} (${pos.qty} qty ${pos.side} @ Avg ₹${entryAvg.toFixed(2)}) | SL: ₹${state.stopLossPrice.toFixed(2)}${pos.slOrderId ? ` [OrderId: ${pos.slOrderId}]` : ''} | Target: ₹${state.targetPrice.toFixed(2)}`);
      this.log(state, `📡 Resumed live real-time tracking & dynamic trailing seamlessly!`);

      const notice = protectionNotice(pos);
      if (notice) this.log(state, notice);

      const client = brokerAccount?.accessToken ? this.factory.createClient(brokerAccount) : null;
      await this.startRealtimeMonitor(state, client);
      return true;
    } catch (err: any) {
      if (err instanceof PositionUnknownError) {
        await this.stopWithStatus(state.strategyId, 'STOPPED', `🛑 Start aborted: ${err.message}`);
        throw err;
      }
      this.logger.warn(`Position recovery failed for ${state.strategyId}: ${err?.message}`);
      return false;
    }
  }

  private async cancelBrokerOrderSafe(client: any, orderId: string | null) {
    if (!orderId || orderId.startsWith('PAPER_') || orderId === 'FAILED') return;
    try {
      await client.cancelOrder(orderId);
      this.logger.log(`Cancelled opposing/stray order: ${orderId}`);
    } catch (err: any) {
      this.logger.debug?.(`Cancel order ${orderId} notice: ${err?.message || err}`);
    }
  }

  async stop(strategyId: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      this.stopRealtimeMonitor(state);
      clearInterval(this.timers.get(strategyId));
      this.timers.delete(strategyId);
      this.running.delete(strategyId);
      this.log(state, '⏹ Strategy stopped by user');

      if (!state.isPaperTrade && (state.slOrderId || state.targetOrderId)) {
        try {
          const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
          if (account?.accessToken) {
            const client = this.factory.createClient(account);
            await this.cancelBrokerOrderSafe(client, state.slOrderId);
            await this.cancelBrokerOrderSafe(client, state.targetOrderId);
          }
        } catch { }
      }

      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { status: 'STOPPED', stoppedAt: new Date(), logs: JSON.stringify(state.logs) },
      });
      strategyEvents.emit('strategy.update', {
        strategyId: state.strategyId,
        logs: state.logs,
        state: this.getState(state.strategyId),
      });
    }
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: false, autoStart: false } });
  }

  private async stopWithStatus(strategyId: string, status: 'COMPLETED' | 'STOPPED', logReason: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      this.stopRealtimeMonitor(state);
      clearInterval(this.timers.get(strategyId));
      this.timers.delete(strategyId);
      this.running.delete(strategyId);
      this.log(state, logReason);

      if (!state.isPaperTrade && (state.slOrderId || state.targetOrderId)) {
        try {
          const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
          if (account?.accessToken) {
            const client = this.factory.createClient(account);
            await this.cancelBrokerOrderSafe(client, state.slOrderId);
            await this.cancelBrokerOrderSafe(client, state.targetOrderId);
          }
        } catch { }
      }

      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { status, stoppedAt: new Date(), logs: JSON.stringify(state.logs) },
      });
      strategyEvents.emit('strategy.update', {
        strategyId: state.strategyId,
        logs: state.logs,
        state: this.getState(state.strategyId),
      });
    }
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: false, autoStart: false } });
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
    const isOptionTrade = !!(s.config.isOptionBuyingOnly && s.optionSymbol);
    const isLong = isOptionTrade || s.entryTriggered === 'LONG';
    const ltp = s.currentLtp || s.entryPrice || 0;
    const entry = s.entryPrice || 0;
    const pnlPoints = entry > 0 && ltp > 0 ? (isLong ? (ltp - entry) : (entry - ltp)) : 0;
    const currentQty = Math.abs(s.executedQty || s.config.qty);
    const calculatedPnlRs = pnlPoints * currentQty;
    const calculatedPnlPct = entry > 0 ? (pnlPoints / entry) * 100 : 0;

    return {
      entryTriggered: s.entryTriggered,
      tradesToday: s.tradesPlacedToday,
      activeSymbol: s.activeSymbol || s.config.symbol,
      optionSymbol: s.optionSymbol || null,
      entryPrice: s.entryPrice,
      currentLtp: s.currentLtp || s.entryPrice,
      stopLossPrice: s.stopLossPrice,
      targetPrice: s.targetPrice,
      pnlRs: s.currentPnlRs !== undefined && s.currentPnlRs !== 0 ? s.currentPnlRs : calculatedPnlRs,
      pnlPct: s.currentPnlPct !== undefined && s.currentPnlPct !== 0 ? s.currentPnlPct : calculatedPnlPct,
      peakPnlRs: s.peakPnlRs ?? 0,
      qty: currentQty,
      executedQty: currentQty,
      targetQty: s.config.qty,
      entryOrderId: s.entryOrderId,
      isTrailingEma: s.isTrailingEma ?? false,
      lastEma: s.lastEma,
      isPaperTrade: s.isPaperTrade,
      dailyRealizedPnlRs: s.dailyRealizedPnlRs ?? 0,
      dailyTargetLocked: s.dailyTargetLocked ?? false,
      dailyAtrPct: s.dailyAtrPct,
      logicalTargetReason: s.logicalTargetReason,
      pdh: s.pdh,
      pdl: s.pdl,
      pdc: s.pdc,
    };
  }

  async squareOff(strategyId: string): Promise<{ success: boolean; message: string }> {
    const state = this.running.get(strategyId);
    if (!state) return { success: false, message: 'Strategy is not running' };
    if (!state.entryTriggered || state.isExiting) {
      return { success: false, message: state.isExiting ? 'Exit order is already in progress' : 'No active open position to square off' };
    }

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    const client = account?.accessToken ? this.factory.createClient(account) : null;
    const symbol = state.optionSymbol || state.activeSymbol || state.config.symbol;
    const exchange = state.optionSymbol ? 'NFO' : (state.futureSymbol ? state.futureExchange : state.config.exchange);

    let exitPrice = state.currentLtp || state.entryPrice || 0;
    if (client && !state.isPaperTrade) {
      try {
        const ltpData = await client['kite'].getLTP([`${exchange}:${symbol}`]);
        exitPrice = ltpData[`${exchange}:${symbol}`]?.last_price || exitPrice;
      } catch { }
    }

    this.log(state, `⚡ Manual Instant Square-Off requested by user @ ₹${exitPrice.toFixed(2)}`);
    await this.exitPosition(state, client, exitPrice, 'FORCE_CLOSE');
    await this.persistLogs(state);
    return { success: true, message: `Position squared off at ₹${exitPrice.toFixed(2)}` };
  }

  private async initialCatchup(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;
    if (state.entryTriggered) {
      this.log(state, `ℹ Active live position already recovered from Zerodha. Skipping historical catchup.`);
      return;
    }
    if (!state.isPaperTrade) {
      this.log(state, `⚡ Live trading active — initializing directly for real-time market execution.`);
      return;
    }
    const now = new Date();
    if (this.getIstHhmm(now) < 9 * 60 + 20) return;

    this.log(state, `🔍 Running catch-up for today's data...`);
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    try {
      if (state.config.symbol === 'AUTO') {
        const excluded = new Set(state.cooldownSymbols?.keys() || []);
        const candidates = await getTopCandidateStocks(kite, state.config.targetRs, state.config.stopLossRs, this.logger, (state.config as any).maxCapital, 25, excluded, (state.config as any).minStockPrice || 30);
        this.log(state, `🚀 Multi-Stock Momentum Scanner: Scanning top Zerodha liquid leaders for active setups...`);

        const activeSetups: Array<{ candidate: any; details: any }> = [];

        // Scan candidate stocks concurrently in batches of 5
        for (let i = 0; i < candidates.length; i += 5) {
          const batch = candidates.slice(i, i + 5);
          await Promise.allSettled(batch.map(async (candidate) => {
            try {
              const testConfig = { ...state.config, symbol: candidate.symbol, exchange: candidate.exchange };
              const cCandles = await this.fetchCandles(client, testConfig as any, '5minute', now);
              const emaPeriod = state.config.emaPeriod || 15;
              if (!cCandles || cCandles.length < emaPeriod + 2) return;

              const closedCCandles = this.filterClosedCandles(cCandles, now, 5);
              if (closedCCandles.length < 2) return;

              const cEmas = this.calculateEMA(closedCCandles, emaPeriod);
              const cVwaps = this.calculateVWAP(closedCCandles, state.config.vwapSource || 'close');

              const setup = this.evaluateStockSetup(closedCCandles, cEmas, cVwaps, now, state.config, candidate.symbol);
              if (setup) {
                activeSetups.push({
                  candidate: { ...candidate, score: candidate.score + setup.scoreBoost },
                  details: setup,
                });
              }
            } catch { }
          }));
          await new Promise(r => setTimeout(r, 80));
        }

        if (activeSetups.length > 0) {
          activeSetups.sort((a, b) => b.candidate.score - a.candidate.score);
          const best = activeSetups[0];
          this.log(state, `🎯 Auto-Selected #1 Stock with Active Setup: [${best.candidate.symbol}] (Score: ${best.candidate.score}, Qty: ${best.candidate.qty}) — ${best.details.description}`);
          this.log(state, `📋 Detected Setups: ${activeSetups.map(s => `${s.candidate.symbol} (${s.details.trend}: ${s.details.setupType})`).join(', ')}`);
          state.activeSymbol = best.candidate.symbol;
          state.config.exchange = best.candidate.exchange;
          state.config.qty = best.candidate.qty;
        } else if (candidates.length > 0) {
          const fallback = candidates[0];
          this.log(state, `ℹ Top momentum leader [${fallback.symbol}] assigned for live monitoring (Qty: ${fallback.qty})`);
          state.activeSymbol = fallback.symbol;
          state.config.exchange = fallback.exchange;
          state.config.qty = fallback.qty;
        }
      }

      const activeSym = state.activeSymbol || state.config.symbol;
      const scanConfig = { ...state.config, symbol: activeSym };

      const upper = activeSym.toUpperCase().trim();
      const isIndex = upper.includes('NIFTY') || upper.includes('BANKNIFTY') || upper.includes('FINNIFTY') || upper.includes('MIDCPNIFTY') || upper.includes('SENSEX');
      if (isIndex && !state.futureSymbol) {
        const res = await this.findFutureSymbol(client, activeSym);
        state.futureSymbol = res.symbol;
        state.futureExchange = res.exchange;
        this.log(state, `Resolved future contract for index: ${state.futureExchange}:${state.futureSymbol}`);
      }

      const candles = await this.fetchCandles(client, scanConfig, '5minute', now, state.futureSymbol || undefined, state.futureSymbol ? state.futureExchange : undefined);
      const emaPeriod = state.config.emaPeriod || 15;
      if (candles.length < emaPeriod + 2) return;

      const emas = this.calculateEMA(candles, emaPeriod);
      const vwaps = this.calculateVWAP(candles, state.config.vwapSource || 'close');

      const todayStr = this.getIstDateStr(now);
      let optionCandles: Candle[] = [];
      let optionCandleSymbol = '';

      // Track all detected setups for day summary
      const detectedSetups: Array<{
        trend: string; setupType: string; time: Date;
        triggerHigh: number; triggerLow: number;
        ema: number; vwap: number;
        outcome: 'BREAKOUT' | 'INVALIDATED' | 'EXPIRED' | 'PENDING';
      }> = [];



      for (let i = emaPeriod + 1; i < candles.length; i++) {
        const currentCandle = candles[i];

        if (state.entryTriggered) {
          const candleTimeMs = currentCandle.date.getTime();
          let currentOptionPriceLow = 0;
          let currentOptionPriceHigh = 0;
          let hasOptionData = false;
          let optCandle: Candle | undefined = undefined;

          if (state.optionSymbol) {
            if (optionCandleSymbol !== state.optionSymbol) {
              const exchange = state.optionSymbol.includes('-') || state.optionSymbol.startsWith('NIFTY') || state.optionSymbol.startsWith('BANKNIFTY') ? 'NFO' : state.config.exchange;
              const rawData = await client.getHistoricalData(state.optionSymbol, exchange, '5minute', new Date(state.setupTimestamp || currentCandle.date), now);
              optionCandles = (rawData || []).map((c: any) => ({
                date: new Date(c.date),
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume
              }));
              optionCandleSymbol = state.optionSymbol;
            }

            optCandle = optionCandles.find(c => c.date.getTime() === candleTimeMs);
            if (optCandle) {
              currentOptionPriceLow = optCandle.low;
              currentOptionPriceHigh = optCandle.high;
              hasOptionData = true;
            }
          } else {
            currentOptionPriceLow = currentCandle.low;
            currentOptionPriceHigh = currentCandle.high;
            hasOptionData = true;
          }

          if (hasOptionData) {
            const isOptionTrade = !!(state.config.isOptionBuyingOnly && state.optionSymbol);
            const isShortPosition = state.entryTriggered === 'SHORT' && !isOptionTrade;
            const isLong = !isShortPosition;
            const currentEma = emas[i];
            const isTrailingEnabled = state.config.enableProfitFloor !== false;

            // P&L based on current option candle close (or index candle close if trading equity/futures)
            const currentEvalClose = (state.optionSymbol && optCandle) ? optCandle.close : currentCandle.close;
            const pnlPoints = isLong
              ? (currentEvalClose - state.entryPrice!)
              : (state.entryPrice! - currentEvalClose);
            const pnlRs = pnlPoints * state.config.qty;
            const targetThresholdRs = state.config.targetRs || 500;

            const isHitTarget = isOptionTrade
              ? (currentOptionPriceHigh >= state.targetPrice!)
              : (isLong ? (currentCandle.high >= state.targetPrice!) : (currentCandle.low <= state.targetPrice!));

            const isHitSL = isOptionTrade
              ? (currentOptionPriceLow <= state.stopLossPrice!)
              : (isLong ? (currentCandle.low <= state.stopLossPrice!) : (currentCandle.high >= state.stopLossPrice!));

            // 1. Check if Target 1 reached -> Activate EMA(15) Line Trailing SL
            if ((pnlRs >= targetThresholdRs || isHitTarget) && !state.isTrailingEma && isTrailingEnabled) {
              state.isTrailingEma = true;
              state.stopLossPrice = currentEma;
              this.log(state, `📈 (Catch-up) Target 1 reached on ${this.formatTime(currentCandle.date)} (Target: ₹${state.targetPrice?.toFixed(2)}, P&L: ₹${pnlRs.toFixed(2)})! Activated EMA(15) Line Trailing SL @ ₹${currentEma.toFixed(2)} — riding trend...`);
            }

            // 2. If EMA Trailing is Active: Exit ONLY when candle CLOSE crosses EMA(15) line
            if (state.isTrailingEma) {
              state.stopLossPrice = currentEma;
              const isCrossedEma = (state.entryTriggered === 'LONG') ? (currentCandle.close < currentEma) : (currentCandle.close > currentEma);

              if (isCrossedEma) {
                const exitPrice = (state.optionSymbol && optCandle) ? optCandle.close : currentCandle.close;
                const finalPnl = (isLong ? (exitPrice - state.entryPrice!) : (state.entryPrice! - exitPrice)) * state.config.qty;
                this.log(state, `📈 (Catch-up) Candle closed across EMA(15) line @ ₹${exitPrice.toFixed(2)} (EMA: ₹${currentEma.toFixed(2)}) on ${this.formatTime(currentCandle.date)} | Final Realized P&L: ₹${finalPnl.toFixed(2)}`);
                await this.exitPositionHistorical(state, client, exitPrice, 'TARGET', currentCandle.date);
                optionCandles = []; optionCandleSymbol = '';
                continue;
              }
            } else {
              // 3. Before Target 1: Check Standard Initial SL or Fixed Target (if trailing disabled)
              if (isHitSL) {
                const exitPrice = (state.optionSymbol && optCandle) ? state.stopLossPrice! : state.stopLossPrice!;
                const finalPnl = (isLong ? (exitPrice - state.entryPrice!) : (state.entryPrice! - exitPrice)) * state.config.qty;
                this.log(state, `🛑 (Catch-up) Stop Loss Hit at ₹${exitPrice.toFixed(2)} on ${this.formatTime(currentCandle.date)} | Final P&L: ₹${finalPnl.toFixed(2)}`);
                await this.exitPositionHistorical(state, client, exitPrice, 'SL', currentCandle.date);
                optionCandles = []; optionCandleSymbol = '';
                continue;
              }

              if (isHitTarget && !isTrailingEnabled) {
                const exitPrice = (state.optionSymbol && optCandle) ? state.targetPrice! : state.targetPrice!;
                const finalPnl = (isLong ? (exitPrice - state.entryPrice!) : (state.entryPrice! - exitPrice)) * state.config.qty;
                this.log(state, `🎯 (Catch-up) Target Hit at ₹${exitPrice.toFixed(2)} on ${this.formatTime(currentCandle.date)} | Final P&L: ₹${finalPnl.toFixed(2)}`);
                await this.exitPositionHistorical(state, client, exitPrice, 'TARGET', currentCandle.date);
                optionCandles = []; optionCandleSymbol = '';
                continue;
              }
            }

            // 4. 3:05 PM EOD Mandatory Square Off (Intraday RMS Safe Exit)
            const candleHhmm = this.getIstHhmm(currentCandle.date);
            if (candleHhmm >= 15 * 60 + 5) {
              const exitPrice = (state.optionSymbol && optCandle) ? optCandle.close : currentCandle.close;
              const finalPnl = (isLong ? (exitPrice - state.entryPrice!) : (state.entryPrice! - exitPrice)) * state.config.qty;
              this.log(state, `⏰ (Catch-up) 3:05 PM EOD Cutoff reached on ${this.formatTime(currentCandle.date)}! Position squared off at ₹${exitPrice.toFixed(2)} | Final Realized P&L: ₹${finalPnl.toFixed(2)}`);
              await this.exitPositionHistorical(state, client, exitPrice, 'TARGET', currentCandle.date);
              optionCandles = []; optionCandleSymbol = '';
              continue;
            }
          }
          continue;
        }

        if (state.tradesPlacedToday >= state.config.maxTradesPerDay) {
          this.log(state, `⛔ Catch-up: Max daily trade cap (${state.config.maxTradesPerDay}) reached.`);
          break;
        }

        // Only trigger catch-up trades if the crossover is from TODAY's candles
        const candleDateStr = this.getIstDateStr(currentCandle.date);
        if (candleDateStr !== todayStr) continue;

        // Dual Entry Catch-up Scanning (Direct Crossover Breakout + Inside Candle Pullback)
        const mother = candles[i - 1];
        const baby = candles[i];
        const motherDateStr = this.getIstDateStr(mother.date);
        const babyDateStr = this.getIstDateStr(baby.date);
        const isInsideCandle = motherDateStr === todayStr && babyDateStr === todayStr && baby.high <= mother.high && baby.low >= mother.low;
        const details = this.getLatestCrossoverTodayDetails(i, candles, emas, vwaps);

        if (details !== null) {
          const isBullish = details.trend === 'LONG';
          const crossoverCandle = candles[details.crossoverIdx];
          const isFreshCrossover = (i - details.crossoverIdx) <= 1;

          let triggerHigh: number | null = null;
          let triggerLow: number | null = null;
          let setupType = '';

          if (isInsideCandle) {
            if (isBullish && baby.close >= details.vwap * 0.998) {
              triggerHigh = mother.high;
              triggerLow = mother.low;
              setupType = 'Inside Candle Pullback';
            } else if (!isBullish && baby.close <= details.vwap * 1.002) {
              triggerHigh = mother.high;
              triggerLow = mother.low;
              setupType = 'Inside Candle Pullback';
            }
          } else if (isFreshCrossover && i === details.crossoverIdx) {
            if (details.trend === 'LONG') {
              triggerHigh = crossoverCandle.high;
              triggerLow = Math.min(crossoverCandle.low, details.vwap);
            } else {
              triggerHigh = Math.max(crossoverCandle.high, details.vwap);
              triggerLow = crossoverCandle.low;
            }
            setupType = 'Direct Crossover Breakout';
          }

          if (triggerHigh !== null && triggerLow !== null) {
            const setupInfo = {
              trend: details.trend, setupType, time: new Date(baby.date),
              triggerHigh, triggerLow,
              ema: details.ema, vwap: details.vwap,
              outcome: 'PENDING' as 'BREAKOUT' | 'INVALIDATED' | 'EXPIRED' | 'PENDING',
            };
            detectedSetups.push(setupInfo);

            this.log(
              state,
              `🔍 Detected ${details.trend} (${setupType}) at ${this.formatTime(new Date(baby.date))} (EMA: ₹${details.ema.toFixed(2)}, VWAP: ₹${details.vwap.toFixed(2)}) — Trigger High: ₹${triggerHigh.toFixed(2)}, Low: ₹${triggerLow.toFixed(2)}`
            );

            // Scan subsequent candles (up to 12 candles / 1 hour) to see if breakout happened
            let breakoutFound = false;
            let setupInvalidated = false;

            for (let j = i + 1; j < Math.min(i + 13, candles.length); j++) {
              const checkCandle = candles[j];

              if (isBullish) {
                if (checkCandle.high > triggerHigh) {
                  if (state.config.isOptionBuyingOnly) {
                    const optSym = await this.findOptionSymbol(client, state, triggerHigh, 'CE', new Date(checkCandle.date));
                    if (optSym) {
                      const optCandles = await client.getHistoricalData(optSym, 'NFO', '5minute', new Date(baby.date.getTime() - 5 * 60 * 1000), new Date(checkCandle.date.getTime() + 5 * 60 * 1000));
                      const mOpt = optCandles?.find((c: any) => new Date(c.date).getTime() === baby.date.getTime());
                      const cOpt = optCandles?.find((c: any) => new Date(c.date).getTime() === checkCandle.date.getTime());
                      if (mOpt && cOpt && cOpt.high <= mOpt.high) {
                        continue;
                      }
                    }
                  }
                  this.log(state, `🚀 (Catch-up) Found past LONG Breakout (${setupType}) at ${this.formatTime(new Date(checkCandle.date))}!`);
                  await this.placeTrade(state, client, account, 'BUY', triggerHigh, new Date(checkCandle.date), new Date(baby.date), triggerLow, triggerHigh);
                  i = j; // Skip to breakout candle index
                  breakoutFound = true;
                  setupInfo.outcome = 'BREAKOUT';
                  break;
                }
                if (checkCandle.low < triggerLow) {
                  this.log(state, `❌ (Catch-up) Setup invalidated at ${this.formatTime(new Date(checkCandle.date))} (Price fell below SL ₹${triggerLow.toFixed(2)})`);
                  setupInvalidated = true;
                  setupInfo.outcome = 'INVALIDATED';
                  break;
                }
              } else {
                if (checkCandle.low < triggerLow) {
                  if (state.config.isOptionBuyingOnly) {
                    const optSym = await this.findOptionSymbol(client, state, triggerLow, 'PE', new Date(checkCandle.date));
                    if (optSym) {
                      const optCandles = await client.getHistoricalData(optSym, 'NFO', '5minute', new Date(baby.date.getTime() - 5 * 60 * 1000), new Date(checkCandle.date.getTime() + 5 * 60 * 1000));
                      const mOpt = optCandles?.find((c: any) => new Date(c.date).getTime() === baby.date.getTime());
                      const cOpt = optCandles?.find((c: any) => new Date(c.date).getTime() === checkCandle.date.getTime());
                      if (mOpt && cOpt && cOpt.high <= mOpt.high) {
                        continue;
                      }
                    }
                  }
                  this.log(state, `🚀 (Catch-up) Found past SHORT Breakout (${setupType}) at ${this.formatTime(new Date(checkCandle.date))}!`);
                  await this.placeTrade(state, client, account, 'SELL', triggerLow, new Date(checkCandle.date), new Date(baby.date), triggerLow, triggerHigh);
                  i = j; // Skip to breakout candle index
                  breakoutFound = true;
                  setupInfo.outcome = 'BREAKOUT';
                  break;
                }
                if (checkCandle.high > triggerHigh) {
                  this.log(state, `❌ (Catch-up) Setup invalidated at ${this.formatTime(new Date(checkCandle.date))} (Price rose above SL ₹${triggerHigh.toFixed(2)})`);
                  setupInvalidated = true;
                  setupInfo.outcome = 'INVALIDATED';
                  break;
                }
              }
            }

            if (!breakoutFound && !setupInvalidated) {
              this.log(state, `⏳ (Catch-up) Setup expired without breakout above ₹${triggerHigh.toFixed(2)}`);
              setupInfo.outcome = 'EXPIRED';
            }
          }
        }
      }

      if (state.entryTriggered) {
        const lastCandle = candles[candles.length - 1];
        const lastOptClose = (state.optionSymbol && optionCandles.length > 0)
          ? optionCandles[optionCandles.length - 1].close
          : lastCandle.close;
        const isOptionTrade = !!(state.config.isOptionBuyingOnly && state.optionSymbol);
        const isLong = isOptionTrade || state.entryTriggered === 'LONG';
        const pnl = (isLong
          ? (lastOptClose - state.entryPrice!)
          : (state.entryPrice! - lastOptClose)) * state.config.qty;
        const lastCandleTime = this.formatTime(lastCandle.date);
        this.log(state, `📊 (Catch-up) Position remains OPEN | Last candle: ${lastCandleTime} | Symbol: ${state.optionSymbol || state.activeSymbol || state.config.symbol} | Entry: ₹${state.entryPrice?.toFixed(2)} | Target: ₹${state.targetPrice?.toFixed(2)} | SL: ₹${state.stopLossPrice?.toFixed(2)} | Close Price: ₹${lastOptClose.toFixed(2)} | P&L: ₹${pnl.toFixed(2)}. Live monitoring will take over.`);
      }
      if (!state.entryTriggered) this.log(state, `✅ Catch-up complete. No past signals found.`);

      // ── Day Summary with detected setups ──────────────────────────────────
      const lastCandle = candles[candles.length - 1];
      const lastEma = emas[candles.length - 1];
      const lastVwap = vwaps[candles.length - 1];
      this.log(state, `📈 Day Summary — ${state.config.symbol} | Close: ₹${lastCandle.close.toFixed(2)} | EMA(${emaPeriod}): ₹${lastEma?.toFixed(2) || 'N/A'} | VWAP: ₹${lastVwap?.toFixed(2) || 'N/A'}`);

      if (detectedSetups.length > 0) {
        this.log(state, `📋 Setups detected today: ${detectedSetups.length}`);
        for (const setup of detectedSetups) {
          const isBuy = setup.trend === 'LONG';
          const entry = isBuy ? setup.triggerHigh : setup.triggerLow;
          const sl = isBuy ? setup.triggerLow : setup.triggerHigh;
          const risk = Math.abs(entry - sl);
          const target = isBuy ? entry + risk * 1.5 : entry - risk * 1.5;
          const outcomeEmoji = setup.outcome === 'BREAKOUT' ? '🚀' : setup.outcome === 'INVALIDATED' ? '❌' : setup.outcome === 'EXPIRED' ? '⏳' : '⏸';
          this.log(state, `  ${outcomeEmoji} ${setup.trend} (${setup.setupType}) at ${this.formatTime(setup.time)} — Entry: ₹${entry.toFixed(2)} | SL: ₹${sl.toFixed(2)} | Target (1:1.5): ₹${target.toFixed(2)} | Outcome: ${setup.outcome}`);
        }
      } else {
        this.log(state, `📋 No setups detected today.`);
      }

      // ── Auto-stop after market hours ───────────────────────────────────────
      const isAfterMarket = this.getIstHhmm(now) >= 15 * 60 + 30;
      if (isAfterMarket && !state.entryTriggered) {
        this.log(state, `⏹ Market closed. Strategy auto-stopped (after-hours review only).`);
        await this.persistLogs(state);
        await this.stopWithStatus(state.strategyId, 'COMPLETED', `⏹ Auto-stopped: Market hours ended. Day review complete.`);
        return;
      }

      await this.persistLogs(state);
    } catch (err) {
      this.log(state, `⚠ Catch-up failed: ${err.message}`);
      await this.persistLogs(state);
    }
  }

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;
    if (state.isProcessingTick) {
      const elapsedSinceTick = Date.now() - (state.lastTickStartTime || 0);
      if (elapsedSinceTick > 15_000) {
        this.log(state, `⚠️ [WATCHDOG RECOVERY] Previous market tick stalled (>15s). Forcibly resetting execution lock to maintain continuous trading.`);
        state.isProcessingTick = false;
      } else {
        return;
      }
    }
    state.isProcessingTick = true;
    state.lastTickStartTime = Date.now();

    try {
      const now = new Date();
      const hhmm = this.getIstHhmm(now);
      if (hhmm < 9 * 60 + 15 || hhmm >= 15 * 60 + 30) return;

      const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
      if (!account || !account.accessToken) return;

      const client = this.factory.createClient(account);
      const { config } = state;
      const kite = client['kite'];

      // ── Check Max Daily Trade Cap ───────────────────────────────────────────
      if (state.tradesPlacedToday >= config.maxTradesPerDay) {
        this.log(state, `⛔ Max daily trade cap (${config.maxTradesPerDay}) reached.`);
        await this.persistLogs(state);
        await this.stopWithStatus(strategyId, 'COMPLETED', `⛔ Auto-Stopped: Max daily trade cap reached`);
        return;
      }

      // ── Clean up expired cooldown symbols ──────────────────────────────────
      if (state.cooldownSymbols && state.cooldownSymbols.size > 0) {
        const nowMs = now.getTime();
        for (const [sym, expiry] of state.cooldownSymbols.entries()) {
          if (nowMs >= expiry) {
            state.cooldownSymbols.delete(sym);
            this.log(state, `🔄 Cooldown expired for [${sym}] — eligible for live scanning again.`);
          }
        }
      }

      // ── Phase 3: Monitor Active Position (Strict Single-Stock Policy) ────────
      if (state.entryTriggered) {
        // Auto-sync with broker: If position for activeSymbol was closed at broker, sync state immediately
        if (!state.isPaperTrade && kite && kite.getPositions && !state.isPlacingTrade) {
          try {
            const symbolToMonitor = state.optionSymbol || state.activeSymbol || config.symbol;
            const brokerStatus = await getLiveBrokerPosition(kite, symbolToMonitor, this.logger);
            if (!brokerStatus.isOpen) {
              this.log(state, `ℹ [BROKER SYNC] Position for ${symbolToMonitor} is CLOSED on Zerodha (Net Qty: 0). Reconciling strategy state and cancelling pending broker orders.`);
              await safeCancelPendingOrders(kite, client, [state.slOrderId, state.targetOrderId], this.logger);
              this.stopRealtimeMonitor(state);

              const isOptionTrade = !!(config.isOptionBuyingOnly && state.optionSymbol);
              const exitSide: 'BUY' | 'SELL' = isOptionTrade ? 'SELL' : (state.entryTriggered === 'LONG' ? 'SELL' : 'BUY');
              const exitDetails = await getCompletedBrokerExitDetails(kite, symbolToMonitor, state.slOrderId, state.targetOrderId, exitSide, this.logger);

              let actualExitPrice = exitDetails.exitPrice;
              if (!actualExitPrice || actualExitPrice <= 0) {
                actualExitPrice = state.stopLossPrice || state.entryPrice || 0;
              }
              const exitOrderId = exitDetails.orderId;
              const exitQty = exitDetails.filledQty > 0 ? exitDetails.filledQty : (state.executedQty || config.qty);

              // 1. Record exit order in DB
              await this.trackOrderInDB(state, exitSide, symbolToMonitor, config.exchange, exitQty, actualExitPrice, exitOrderId, undefined, (exitDetails.orderType as any) || 'SL');

              // 2. Compute trade PnL
              const isLong = isOptionTrade || state.entryTriggered === 'LONG';
              let tradePnl = 0;
              if (state.entryPrice && state.entryPrice > 0 && actualExitPrice > 0) {
                tradePnl = (isLong ? (actualExitPrice - state.entryPrice) : (state.entryPrice - actualExitPrice)) * exitQty;
              }
              state.dailyRealizedPnlRs = (state.dailyRealizedPnlRs || 0) + tradePnl;

              this.log(state, `🛑 [BROKER EXIT CONFIRMED] ${symbolToMonitor} exit on Zerodha via ${exitDetails.orderType} (${exitOrderId}) @ ₹${actualExitPrice.toFixed(2)} | Trade P&L: ₹${tradePnl.toFixed(2)} | Today Realized: ₹${state.dailyRealizedPnlRs.toFixed(2)} (Trade ${state.tradesPlacedToday}/${config.maxTradesPerDay})`);

              // 3. Put symbol on cooldown for at least 45 minutes
              if (!state.cooldownSymbols) state.cooldownSymbols = new Map();
              state.cooldownSymbols.set(symbolToMonitor, Date.now() + 45 * 60 * 1000);

              // 4. Check One-and-Done daily PnL and trade limits
              const targetThresholdRs = config.targetRs && config.targetRs > 0 ? config.targetRs : 500;
              const maxRiskRs = config.stopLossRs && config.stopLossRs > 0 ? config.stopLossRs : (targetThresholdRs * 1.5);

              let shouldStopStrategy = false;
              let stopReason = '';

              if (config.enableDailyPnLLock !== false) {
                if (state.dailyRealizedPnlRs >= targetThresholdRs) {
                  state.dailyTargetLocked = true;
                  shouldStopStrategy = true;
                  stopReason = `🎯 Daily Profit Target Reached (+₹${state.dailyRealizedPnlRs.toFixed(2)})! 'One-and-Done' Rule Active — Trading safely locked for the day.`;
                } else if (state.dailyRealizedPnlRs <= -maxRiskRs) {
                  state.dailyTargetLocked = true;
                  shouldStopStrategy = true;
                  stopReason = `🛑 Daily Max Loss Limit Reached (₹${state.dailyRealizedPnlRs.toFixed(2)})! 'One-and-Done' Rule Active — Trading safely locked for the day to preserve capital.`;
                }
              }

              if (!shouldStopStrategy && state.tradesPlacedToday >= config.maxTradesPerDay) {
                shouldStopStrategy = true;
                stopReason = `⛔ Max daily trade cap (${config.maxTradesPerDay}) reached. Auto-stopping strategy for today.`;
              }

              state.entryTriggered = null;
              state.optionSymbol = null;
              state.entryPrice = null;
              state.entryTime = null;
              state.stopLossPrice = null;
              state.spotStopLossPrice = null;
              state.targetPrice = null;
              state.slOrderId = null;
              state.targetOrderId = null;
              state.executedQty = 0;
              state.waitingForConfirmation = null;
              state.confirmationHigh = null;
              state.confirmationLow = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
              state.setupType = undefined;
              state.peakPnlRs = 0;
              state.lockedProfitRs = 0;
              state.isTrailingEma = false;

              strategyEvents.emit('strategy.update', {
                strategyId: state.strategyId,
                logs: state.logs,
                state: this.getState(state.strategyId),
              });
              await this.persistLogs(state);

              if (shouldStopStrategy) {
                this.log(state, stopReason);
                await this.persistLogs(state);
                await this.stopWithStatus(state.strategyId, 'COMPLETED', stopReason);
              }
              return;
            }
          } catch (syncErr: any) {
            this.logger.debug?.(`Broker sync notice: ${syncErr.message}`);
          }
        }

        try {
          const candleSymbol = state.activeSymbol || config.symbol;
          const candleExchange = state.futureSymbol ? state.futureExchange : config.exchange;
          const testConfig = { ...config, symbol: candleSymbol, exchange: candleExchange };
          const cCandles = await this.fetchCandles(client, testConfig as any, '5minute', now);
          if (cCandles && cCandles.length >= 2) {
            const closedCCandles = this.filterClosedCandles(cCandles, now, 5);
            if (closedCCandles.length >= 2) {
              const lastClosedIdx = closedCCandles.length - 1;
              const lastClosedCandle = closedCCandles[lastClosedIdx];
              const cEmas = this.calculateEMA(closedCCandles, config.emaPeriod || 15);
              const cVwaps = this.calculateVWAP(closedCCandles, config.vwapSource || 'close');
              const currEma = cEmas[lastClosedIdx];
              const currVwap = cVwaps[lastClosedIdx];
              state.lastEma = currEma;
              state.lastVwap = currVwap;

              // ── 15-EMA Structural Candle Exit Rule ──────────────────────────────────
              // In Exact Target mode, the trader has armed exact broker Target & Stop Loss orders.
              // We do not prematurely kill the trade on minor candle noise unless explicitly opted in.
              const shouldRunEmaCandleExit = config.exitExactAtTarget
                ? config.enableEmaCandleExit === true
                : config.enableEmaCandleExit !== false;

              if (shouldRunEmaCandleExit && currEma !== null && state.entryPrice && (state.entryTime || state.setupTimestamp)) {
                const entryTimeMs = (state.entryTime ? state.entryTime.getTime() : state.setupTimestamp) || 0;
                const candleTimeMs = lastClosedCandle.date.getTime();
                const candleCloseTimeMs = candleTimeMs + 5 * 60 * 1000;
                // Only evaluate candles that finished strictly after our trade entry
                if (candleCloseTimeMs > entryTimeMs + 2 * 60 * 1000) {
                  const isLong = (config.isOptionBuyingOnly && state.optionSymbol) || state.entryTriggered === 'LONG';
                  const isEmaBreached = isLong
                    ? (lastClosedCandle.close < currEma)
                    : (lastClosedCandle.close > currEma);

                  if (isEmaBreached) {
                    const dirStr = isLong ? 'below' : 'above';
                    this.log(
                      state,
                      `🛑 [15-EMA STRUCTURAL CANDLE EXIT] Confirmed 5m candle [${this.formatCandleRange(lastClosedCandle.date, 5)}] closed ${dirStr} 15-EMA! Close: ₹${lastClosedCandle.close.toFixed(2)} vs 15-EMA: ₹${currEma.toFixed(2)}. Technical structure invalidated — immediately squaring off position.`
                    );
                    await safeCancelPendingOrders(kite, client, [state.slOrderId, state.targetOrderId], this.logger);
                    this.stopRealtimeMonitor(state);
                    await this.exitPosition(state, client, lastClosedCandle.close, 'SL');
                    await this.persistLogs(state);
                    return;
                  }
                }
              }
            }
          }
        } catch (e: any) {
          this.logger.debug?.(`Open position candle analysis error: ${e.message}`);
        }

        await this.monitorPosition(state, client, kite);
        await this.persistLogs(state);
        return;
      }

      // ── Trend Continuation Re-Entry (Catch Leg 2 on EMA Re-Claim) ────────────
      const currentHhmm = this.getIstHhmm(now);
      if (config.enableTrendReEntry !== false && state.reEntryEligible && state.reEntrySwingPrice && !state.entryTriggered && (state.reEntryCountToday || 0) < 1 && currentHhmm <= (13 * 60 + 30)) {
        try {
          const candleSymbol = state.activeSymbol || config.symbol;
          const candleExchange = state.futureSymbol ? state.futureExchange : config.exchange;
          const testConfig = { ...config, symbol: candleSymbol, exchange: candleExchange };
          const cCandles = await this.fetchCandles(client, testConfig as any, '5minute', now);
          if (cCandles && cCandles.length >= 2) {
            const lastCandle = cCandles[cCandles.length - 1];
            const cEmas = this.calculateEMA(cCandles, config.emaPeriod || 15);
            const cVwaps = this.calculateVWAP(cCandles, config.vwapSource || 'close');
            const curEma = cEmas[cCandles.length - 1];
            const curVwap = cVwaps[cCandles.length - 1];

            if (curEma && curVwap && lastCandle.close > curEma && lastCandle.close > curVwap && lastCandle.close > state.reEntrySwingPrice) {
              this.log(state, `🔥 [TREND RE-ENTRY TRIGGERED] ${candleSymbol} re-claimed ${config.emaPeriod || 15}-EMA & VWAP and broke swing high (₹${state.reEntrySwingPrice.toFixed(2)}) @ ₹${lastCandle.close.toFixed(2)}! Entering Trend Continuation Leg 2.`);
              state.reEntryEligible = false;
              state.reEntryCountToday = (state.reEntryCountToday || 0) + 1;
              await this.placeTrade(state, client, account, 'BUY', lastCandle.close, now, now, Math.min(lastCandle.low, curEma), state.reEntrySwingPrice);
              await this.persistLogs(state);
              return;
            }
          }
        } catch (err: any) {
          this.logger.debug?.(`Re-entry evaluation notice: ${err.message}`);
        }
      }

      // ── 09:15 to 09:20 AM: Opening Range (ORB) Formation & Noise Filter Window ─────────────
      if (currentHhmm < 9 * 60 + 20) {
        if (!state.hasLoggedOpeningWindow) {
          state.hasLoggedOpeningWindow = true;
          this.log(state, `⏳ [09:15 - 09:20 AM OBSERVATION WINDOW] Opening 5m candle forming. Filtering opening whipsaws and establishing Opening Range (ORH/ORL), VWAP & Institutional Volume baseline. Execution begins @ 09:20 AM sharp.`);
          await this.persistLogs(state);
        }
        return;
      }

      // ── Auto-Mode Multi-Stock Scanning ──────────────────────────────────────
      // Allow continuous scanning if no position is open. If waiting for confirmation on an idle setup (>= 5 mins / 1 candle without trigger), evaluate other active leaders!
      const isIdleWaiting = !!(state.waitingForConfirmation && state.setupTimestamp && (now.getTime() - state.setupTimestamp >= 5 * 60 * 1000));
      if (state.isAutoMode && !state.entryTriggered && (!state.waitingForConfirmation || isIdleWaiting) && !state.isPlacingTrade) {
        const nowMs = Date.now();
        // Throttle auto-scanning to at most once every 30 seconds to respect Zerodha 3 req/sec rate limit
        if (!state.lastAutoScanTime || (nowMs - state.lastAutoScanTime) >= 30_000) {
          state.lastAutoScanTime = nowMs;
          const excluded = new Set(state.cooldownSymbols?.keys() || []);
          const candidates = await getTopCandidateStocks(kite, config.targetRs, config.stopLossRs, this.logger, (config as any).maxCapital, 15, excluded, (config as any).minStockPrice || 30);
          const activeSetups: Array<{ candidate: any; details: any }> = [];

          // Evaluate top 4 momentum leaders sequentially with a 150ms throttle delay to prevent rate limit
          for (const candidate of candidates.slice(0, 4)) {
            try {
              const testConfig = { ...config, symbol: candidate.symbol, exchange: candidate.exchange };
              const cCandles = await this.fetchCandles(client, testConfig as any, '5minute', now);
              const emaPeriod = config.emaPeriod || 15;
              if (cCandles && cCandles.length >= emaPeriod + 2) {
                const closedCCandles = this.filterClosedCandles(cCandles, now, 5);
                if (closedCCandles.length >= 2) {
                  const cEmas = this.calculateEMA(closedCCandles, emaPeriod);
                  const cVwaps = this.calculateVWAP(closedCCandles, config.vwapSource || 'close');
                  const setup = this.evaluateStockSetup(closedCCandles, cEmas, cVwaps, now, config, candidate.symbol);
                  if (setup) {
                    activeSetups.push({
                      candidate: { ...candidate, score: candidate.score + setup.scoreBoost },
                      details: setup,
                    });
                  }
                }
              }
            } catch (candErr: any) {
              this.logger.debug?.(`Candidate evaluation error for ${candidate.symbol}: ${candErr?.message}`);
            }
            // Throttle between candidates to stay strictly below Zerodha's 3 req/sec limit
            await new Promise(r => setTimeout(r, 150));
          }

          if (activeSetups.length > 0) {
            activeSetups.sort((a, b) => b.candidate.score - a.candidate.score);
            const best = activeSetups[0];

            // If we are currently waiting on an idle setup, switch if the new leader has a fresh high-priority setup
            const shouldSwitch = !state.waitingForConfirmation || (best.candidate.symbol !== state.activeSymbol && best.candidate.score > 2300);
            if (shouldSwitch) {
              if (state.waitingForConfirmation && state.activeSymbol !== best.candidate.symbol) {
                this.log(state, `🔄 Pivoting from idle setup [${state.activeSymbol}] -> Active breakout leader [${best.candidate.symbol}] (Score: ${best.candidate.score})`);
                state.waitingForConfirmation = null;
                state.confirmationHigh = null;
                state.confirmationLow = null;
                state.invalidationPrice = null;
                state.setupTimestamp = null;
                state.setupType = undefined;
              }
              if (state.activeSymbol !== best.candidate.symbol) {
                this.log(state, `🎯 Live Auto-Selected Stock with Active Setup: [${best.candidate.symbol}] (Score: ${best.candidate.score}, Qty: ${best.candidate.qty}) — ${best.details.description}`);
              }
              state.activeSymbol = best.candidate.symbol;
              config.exchange = best.candidate.exchange;
              config.qty = best.candidate.qty;
            }
          } else if (candidates.length > 0 && !state.waitingForConfirmation) {
            const fallback = candidates[0];
            const isDifferentSymbol = state.activeSymbol !== fallback.symbol;
            const isHeartbeatElapsed = (nowMs - (state.lastFallbackLogTime || 0) >= 60_000);
            if (isDifferentSymbol || isHeartbeatElapsed) {
              state.lastFallbackLogTime = nowMs;
              this.log(state, `🎯 Top Momentum Stock: [${fallback.symbol}] (Score: ${fallback.score}, Trend: ${fallback.trend}, Qty: ${fallback.qty})`);
            }
            state.activeSymbol = fallback.symbol;
            config.exchange = fallback.exchange;
            config.qty = fallback.qty;
          }

          // ── Active Scanner Heartbeat (every 60 seconds) ─────────────────────────
          if (!state.last5mHeartbeatTime || (nowMs - state.last5mHeartbeatTime >= 60_000)) {
            state.last5mHeartbeatTime = nowMs;
            const topList = candidates.slice(0, 4).map(c => `${c.symbol} (Score: ${c.score}, ${c.dayChangePct >= 0 ? '+' : ''}${c.dayChangePct.toFixed(1)}%)`).join(', ');
            const currentLeader = activeSetups.length > 0 ? activeSetups[0].candidate.symbol : (candidates[0]?.symbol || 'None');
            const setupDesc = activeSetups.length > 0 ? activeSetups[0].details.description : 'Monitoring 5m candles for breakout/breakdown trigger';
            this.log(state, `📡 [SCANNER HEARTBEAT] Scanned Nifty 500 & F&O leaders | Leaders: [${topList}] | Tracking: [${currentLeader}] — ${setupDesc}`);
          }
        }
      }

      const activeSym = state.activeSymbol || config.symbol;
      const scanConfig = { ...config, symbol: activeSym };

      const upper = activeSym.toUpperCase().trim();
      const isIndex = upper.includes('NIFTY') || upper.includes('BANKNIFTY') || upper.includes('FINNIFTY') || upper.includes('MIDCPNIFTY') || upper.includes('SENSEX');
      if (isIndex && !state.futureSymbol) {
        const res = await this.findFutureSymbol(client, activeSym);
        state.futureSymbol = res.symbol;
        state.futureExchange = res.exchange;
        this.log(state, `Resolved future contract for index: ${state.futureExchange}:${state.futureSymbol}`);
      }

      const candles = await this.fetchCandles(client, scanConfig, '5minute', now, state.futureSymbol || undefined, state.futureSymbol ? state.futureExchange : undefined);
      if (candles.length < 2) return;

      // ── Filter for closed candles only ─────────────────────────────────────
      const closedCandles = this.filterClosedCandles(candles, now, 5);
      if (closedCandles.length < 2) return;

      // Don't scan for signals if the last closed candle is from a previous day
      const lastClosedDate = this.getIstDateStr(closedCandles[closedCandles.length - 1].date);
      const todayDate = this.getIstDateStr(now);
      if (lastClosedDate !== todayDate) return;

      const emas = this.calculateEMA(closedCandles, config.emaPeriod || 15);
      const vwaps = this.calculateVWAP(closedCandles, config.vwapSource || 'close');

      const lastIdx = closedCandles.length - 1, prevIdx = closedCandles.length - 2;
      const currEma = emas[lastIdx], prevEma = emas[prevIdx];
      const currVwap = vwaps[lastIdx], prevVwap = vwaps[prevIdx];

      if (currEma === null || prevEma === null || currVwap === null || prevVwap === null) return;

      // ── Confirmation / Breakout Check ──────────────────────────────────────
      if (state.waitingForConfirmation) {
        // Fast-pivot timeout: Allow max 2 candles (10m) for standard breakout/pullback setups, or 4 for opening drive
        const maxWaitCandles = (state.setupType === 'OPEN_LOW_DRIVE' || state.setupType === 'OPEN_HIGH_DRIVE') ? 4 : 2;
        const timeframeMs = 5 * 60 * 1000;
        const elapsed = now.getTime() - state.setupTimestamp!;
        if (elapsed > maxWaitCandles * timeframeMs) {
          this.log(state, `⏳ Setup on [${activeSym}] expired (${maxWaitCandles} candles passed without trigger). Resetting.`);
          if (state.isAutoMode && activeSym) {
            if (!state.cooldownSymbols) state.cooldownSymbols = new Map();
            state.cooldownSymbols.set(activeSym, now.getTime() + 15 * 60 * 1000);
            this.log(state, `⏸ [${activeSym}] placed on 15m cooldown to allow scanning other active leaders.`);
          }
          state.invalidatedCrossoverTime = state.setupTimestamp;
          state.waitingForConfirmation = null;
          state.confirmationHigh = null;
          state.confirmationLow = null;
          state.invalidationPrice = null;
          state.setupTimestamp = null;
          state.setupType = undefined;
          return;
        }

        const checkSymbol = state.futureSymbol || activeSym;
        const checkExchange = state.futureSymbol ? state.futureExchange : config.exchange;
        const ltpData = await kite.getLTP([`${checkExchange}:${checkSymbol}`]);
        const ltp = ltpData[`${checkExchange}:${checkSymbol}`]?.last_price;

        if (ltp) {
          if (state.waitingForConfirmation === 'LONG') {
            const isTriggered = state.confirmationHigh && ltp >= state.confirmationHigh;
            if (isTriggered) {
              this.log(state, `[${activeSym}] 🎯 LONG Entry Triggered! Breakout above ₹${state.confirmationHigh!.toFixed(2)} (${state.setupType}) @ LTP ₹${ltp.toFixed(2)}`);
              const invPrice = state.invalidationPrice ?? undefined;
              const confHigh = state.confirmationHigh ?? undefined;
              state.waitingForConfirmation = null;
              state.confirmationHigh = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
              state.setupType = undefined;
              await this.placeTrade(state, client, account, 'BUY', ltp, undefined, undefined, invPrice, confHigh);
            } else if (state.invalidationPrice && ltp < state.invalidationPrice) {
              this.log(state, `[${activeSym}] ❌ Setup invalidated! LTP ₹${ltp.toFixed(2)} broke below SL level ₹${state.invalidationPrice.toFixed(2)}`);
              if (state.isAutoMode && activeSym) {
                if (!state.cooldownSymbols) state.cooldownSymbols = new Map();
                state.cooldownSymbols.set(activeSym, now.getTime() + 15 * 60 * 1000);
                this.log(state, `⏸ [${activeSym}] placed on 15m cooldown to allow scanning other active leaders.`);
              }
              state.invalidatedCrossoverTime = state.setupTimestamp;
              state.waitingForConfirmation = null;
              state.confirmationHigh = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
              state.setupType = undefined;
            }
          } else if (state.waitingForConfirmation === 'SHORT') {
            const isTriggered = state.confirmationLow && ltp <= state.confirmationLow;
            if (isTriggered) {
              this.log(state, `[${activeSym}] 🎯 SHORT Entry Triggered! Breakdown below ₹${state.confirmationLow!.toFixed(2)} (${state.setupType}) @ LTP ₹${ltp.toFixed(2)}`);
              const confLow = state.confirmationLow ?? undefined;
              const invPrice = state.invalidationPrice ?? undefined;
              state.waitingForConfirmation = null;
              state.confirmationLow = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
              state.setupType = undefined;
              await this.placeTrade(state, client, account, 'SELL', ltp, undefined, undefined, confLow, invPrice);
            } else if (state.invalidationPrice && ltp > state.invalidationPrice) {
              this.log(state, `[${activeSym}] ❌ Setup invalidated! LTP ₹${ltp.toFixed(2)} broke above SL level ₹${state.invalidationPrice.toFixed(2)}`);
              if (state.isAutoMode && activeSym) {
                if (!state.cooldownSymbols) state.cooldownSymbols = new Map();
                state.cooldownSymbols.set(activeSym, now.getTime() + 15 * 60 * 1000);
                this.log(state, `⏸ [${activeSym}] placed on 15m cooldown to allow scanning other active leaders.`);
              }
              state.invalidatedCrossoverTime = state.setupTimestamp;
              state.waitingForConfirmation = null;
              state.confirmationLow = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
              state.setupType = undefined;
            }
          }
        }
      }

      // ── New Candle Analysis & Multi-Pattern Setup Detection ────────────────
      if (!state.entryTriggered) {
        if (!state.lastProcessedTimestampBySymbol) {
          state.lastProcessedTimestampBySymbol = new Map<string, number>();
        }
        const lastClosedCandleTime = closedCandles[lastIdx].date.getTime();
        const targetSym = state.activeSymbol || config.symbol;
        const lastProcessedForSym = state.lastProcessedTimestampBySymbol.get(targetSym) || 0;

        if (lastClosedCandleTime > lastProcessedForSym) {
          state.lastProcessedTimestampBySymbol.set(targetSym, lastClosedCandleTime);
          state.lastProcessedTimestamp = lastClosedCandleTime;
          const rangeStr = this.formatCandleRange(closedCandles[lastIdx].date, 5);
          const closeTimeStr = this.formatCandleCloseTime(closedCandles[lastIdx].date, 5);
          const currEma = emas[lastIdx];
          const currVwap = vwaps[lastIdx];
          const closedCandle = closedCandles[lastIdx];
          this.log(state, `[${targetSym}] 🔍 5m Candle [${rangeStr}] closed at ${closeTimeStr} | Close: ₹${closedCandle.close.toFixed(2)} (H: ₹${closedCandle.high.toFixed(2)}, L: ₹${closedCandle.low.toFixed(2)}) | 15-EMA: ₹${currEma?.toFixed(2)}, VWAP: ₹${currVwap?.toFixed(2)}`);

          if (!state.waitingForConfirmation) {
            const setup = this.evaluateStockSetup(closedCandles, emas, vwaps, now, config, targetSym);
            const setupTimeMs = setup?.candleTime.getTime();
            const isAlreadyInvalidated = state.invalidatedCrossoverTime === setupTimeMs;

            if (setup && !isAlreadyInvalidated) {
              const checkSymbol = state.futureSymbol || targetSym;
              const checkExchange = state.futureSymbol ? state.futureExchange : config.exchange;
              const ltpData = await withKiteRetry(() => kite.getLTP([`${checkExchange}:${checkSymbol}`]), 2).catch((e: any) => {
                this.log(state, `[${targetSym}] ⚠ LTP unavailable for instant-entry check: ${e.message}`);
                return null;
              });
              const ltp = ltpData?.[`${checkExchange}:${checkSymbol}`]?.last_price;

              if (setup.trend === 'LONG') {
                state.waitingForConfirmation = 'LONG';
                state.setupType = setup.setupType;
                state.confirmationHigh = setup.triggerHigh;
                state.confirmationLow = null;
                state.invalidationPrice = setup.slPrice;
                state.setupTimestamp = setupTimeMs!;
                this.log(state, `[${targetSym}] 🚀 Detected ${setup.description}! Trigger High: ₹${(setup.triggerHigh || 0).toFixed(2)}, SL (${setup.slNote}): ₹${setup.slPrice.toFixed(2)}. Monitoring for trigger...`);

                // Instant execution check if already at/above trigger high:
                if (ltp && setup.triggerHigh && ltp >= setup.triggerHigh) {
                  this.log(state, `[${targetSym}] 🎯 Instant LONG Entry Triggered! ${setup.description} @ LTP ₹${ltp.toFixed(2)}`);
                  state.waitingForConfirmation = null;
                  state.confirmationHigh = null;
                  state.invalidationPrice = null;
                  state.setupTimestamp = null;
                  state.setupType = undefined;
                  await this.placeTrade(state, client, account, 'BUY', ltp, undefined, undefined, setup.slPrice, setup.triggerHigh);
                }
              } else if (setup.trend === 'SHORT') {
                state.waitingForConfirmation = 'SHORT';
                state.setupType = setup.setupType;
                state.confirmationHigh = null;
                state.confirmationLow = setup.triggerLow;
                state.invalidationPrice = setup.slPrice;
                state.setupTimestamp = setupTimeMs!;
                this.log(state, `[${targetSym}] 🚀 Detected ${setup.description}! Trigger Low: ₹${(setup.triggerLow || 0).toFixed(2)}, SL (${setup.slNote}): ₹${setup.slPrice.toFixed(2)}. Monitoring for trigger...`);

                // Instant execution check if already at/below trigger low:
                if (ltp && setup.triggerLow && ltp <= setup.triggerLow) {
                  this.log(state, `[${targetSym}] 🎯 Instant SHORT Entry Triggered! ${setup.description} @ LTP ₹${ltp.toFixed(2)}`);
                  state.waitingForConfirmation = null;
                  state.confirmationLow = null;
                  state.invalidationPrice = null;
                  state.setupTimestamp = null;
                  state.setupType = undefined;
                  await this.placeTrade(state, client, account, 'SELL', ltp, undefined, undefined, setup.triggerLow, setup.slPrice);
                }
              }
            } else if (!setup) {
              const isDowntrend = currEma !== null && currVwap !== null && (closedCandle.close <= currVwap && closedCandle.close <= currEma);
              const isUptrend = currEma !== null && currVwap !== null && (closedCandle.close >= currVwap && closedCandle.close >= currEma);
              const trendLabel = isDowntrend ? 'SHORT' : isUptrend ? 'LONG' : (closedCandle.close >= currVwap || closedCandle.close >= currEma) ? 'BULLISH_BIAS' : (closedCandle.close <= currVwap || closedCandle.close <= currEma) ? 'BEARISH_BIAS' : 'NEUTRAL';
              this.log(state, `[${targetSym}] ℹ Evaluated Trend: ${trendLabel} | 15-EMA: ₹${currEma?.toFixed(2)}, VWAP: ₹${currVwap?.toFixed(2)} | Waiting for clean trigger/pullback...`);
            }
          }
        }
      }
    } catch (err: any) {
      this.log(state, `❌ Tick error: ${err.message}`);
    } finally {
      state.isProcessingTick = false;
    }
    await this.persistLogs(state);
  }

  private async placeTrade(state: StrategyState, client: any, account: any, side: 'BUY' | 'SELL', triggerPrice: number, triggerTime?: Date, motherTime?: Date, motherLow?: number, motherHigh?: number) {
    const { config } = state;
    if (!this.running.has(state.strategyId)) {
      this.logger.warn(`[ABORT] Strategy ${state.strategyId} has been stopped. Aborting trade placement.`);
      return;
    }
    if (state.entryTriggered || state.isPlacingTrade) {
      this.log(state, `⛔ Strategy already has an active open position (${state.entryTriggered}) or order in-flight. Skipping 2nd trade.`);
      return;
    }
    state.isPlacingTrade = true;

    try {
      if (!this.running.has(state.strategyId)) {
        this.logger.warn(`[ABORT] Strategy ${state.strategyId} has been stopped. Aborting trade placement.`);
        return;
      }
      if (state.dailyTargetLocked && config.enableDailyPnLLock !== false) {
        this.log(state, `🔒 Daily Trading Lock active (Realized P&L: ₹${(state.dailyRealizedPnlRs || 0).toFixed(2)}). Skipping trade placement.`);
        return;
      }
      if (state.tradesPlacedToday >= config.maxTradesPerDay) {
        this.log(state, `⛔ Daily trade limit reached (${state.tradesPlacedToday}/${config.maxTradesPerDay}). Skipping trade.`);
        return;
      }

      const isHistorical = !!triggerTime;
      const kite = client['kite'];
      let symbol = state.activeSymbol || config.symbol, exchange = config.exchange, finalSide: 'BUY' | 'SELL' = side;
      const product = (config as any).product ?? 'MIS';
      let optionMotherLow: number | null = null;
      let isOption = false;

      if (config.isOptionBuyingOnly) {
        const type = side === 'BUY' ? 'CE' : 'PE';
        const optSym = await this.findOptionSymbol(client, state, triggerPrice, type, triggerTime);
        if (optSym) {
          isOption = true;
          symbol = optSym; exchange = 'NFO'; finalSide = 'BUY';
          if (triggerTime && motherTime) {
            try {
              const optCandles = await client.getHistoricalData(symbol, exchange, '5minute', new Date(motherTime.getTime() - 5 * 60 * 1000), new Date(motherTime.getTime() + 5 * 60 * 1000));
              const motherOptCandle = optCandles.find((c: any) => new Date(c.date).getTime() === motherTime.getTime());
              if (motherOptCandle) {
                // Breakout entry is at the high of the mother option candle (option breakout level)
                triggerPrice = motherOptCandle.high;
                optionMotherLow = motherOptCandle.low;
                this.log(state, `💡 Selected Option Breakout Entry Price: ₹${triggerPrice.toFixed(2)} (High of Mother Option Candle), SL: ₹${optionMotherLow.toFixed(2)} (Low of Mother Option Candle)`);
              } else {
                const histPrice = await this.getHistoricalOptionPrice(client, symbol, exchange, triggerTime);
                if (histPrice !== null) triggerPrice = histPrice;
              }
            } catch {
              const histPrice = await this.getHistoricalOptionPrice(client, symbol, exchange, triggerTime);
              if (histPrice !== null) triggerPrice = histPrice;
            }
          } else {
            const q = await kite.getLTP([`NFO:${symbol}`]);
            if (q[`NFO:${symbol}`]?.last_price) triggerPrice = q[`NFO:${symbol}`].last_price;
          }
        } else {
          this.log(state, `⚠ No option found. Trading equity directly.`);
        }
      } else {
        this.log(state, `📈 Equity mode — trading ${exchange}:${symbol} directly`);
      }

      const symTickSize = isOption ? 0.05 : getInstrumentTickSize(symbol, triggerPrice);
      const entry = this.roundTick(triggerPrice, symbol);
      let sl: number;
      let tgt: number;

      const maxRiskThresholdRs = config.stopLossRs && config.stopLossRs > 0 ? config.stopLossRs : 500;

      if (isOption) {
        sl = optionMotherLow !== null ? this.roundTick(optionMotherLow, symbol) : this.roundTick(entry - (maxRiskThresholdRs / config.qty), symbol);
        const optionRisk = Math.max(0.50, Math.abs(entry - sl));
        tgt = this.roundTick(entry + optionRisk * 1.5, symbol);
        state.spotStopLossPrice = side === 'BUY' ? motherLow : motherHigh;
      } else {
        if (finalSide === 'BUY') {
          // True Structural Swing Shelf SL: Place comfortably below entry/swing shelf low with breathing buffer
          let rawSl: number;
          if (motherLow && motherLow < entry) {
            const buffer = Math.max(symTickSize * 4, motherLow * 0.002);
            rawSl = motherLow <= (entry - buffer) ? (motherLow - buffer) : (entry - buffer);
          } else {
            rawSl = entry - Math.max(symTickSize * 10, entry * 0.011);
          }
          // Strict Intraday Equity SL boundaries: Max 2.20% of entry price (accommodating true mother low/day low), Min 0.85% breathing distance
          const maxAllowedDist = Math.max(symTickSize * 15, entry * 0.022);
          const minBreathingDist = Math.max(symTickSize * 8, entry * 0.0085);
          const boundedSl = Math.min(entry - minBreathingDist, Math.max(rawSl, entry - maxAllowedDist));
          sl = this.roundTick(boundedSl, symbol);
          if (sl >= entry) sl = this.roundTick(entry - symTickSize * 5, symbol);
          const risk = Math.max(symTickSize, Math.abs(entry - sl));
          tgt = config.enableProfitFloor !== false ? this.roundTick(entry + risk * 2.0, symbol) : this.roundTick(entry + risk * 1.5, symbol);
        } else {
          // True Structural Swing Shelf SL: Place comfortably above entry/swing shelf high with breathing buffer
          let rawSl: number;
          if (motherHigh && motherHigh > entry) {
            const buffer = Math.max(symTickSize * 4, motherHigh * 0.002);
            rawSl = motherHigh >= (entry + buffer) ? (motherHigh + buffer) : (entry + buffer);
          } else {
            rawSl = entry + Math.max(symTickSize * 10, entry * 0.011);
          }
          // Strict Intraday Equity SL boundaries: Max 2.20% of entry price (accommodating true mother high/day high), Min 0.85% breathing distance
          const maxAllowedDist = Math.max(symTickSize * 15, entry * 0.022);
          const minBreathingDist = Math.max(symTickSize * 8, entry * 0.0085);
          const boundedSl = Math.max(entry + minBreathingDist, Math.min(rawSl, entry + maxAllowedDist));
          sl = this.roundTick(boundedSl, symbol);
          if (sl <= entry) sl = this.roundTick(entry + symTickSize * 5, symbol);
          const risk = Math.max(symTickSize, Math.abs(sl - entry));
          tgt = config.enableProfitFloor !== false ? this.roundTick(entry - risk * 2.0, symbol) : this.roundTick(entry - risk * 1.5, symbol);
        }
      }

      let logicalTargetInfo: { targetPrice: number; targetReason: string; fib1272: number; fib1618: number; pdh: number | null; pdl: number | null; pdc: number | null } | null = null;
      let stockMetrics: { dailyAtrPct: number; dynamicExhaustionPct: number; dynamicOpeningCapPct: number; dynamicExtensionPct: number; dynamicParabolicPct: number } | null = null;

      if (!isOption) {
        try {
          const histCandles = await this.fetchCandles(client, config, '5minute', triggerTime || new Date(), symbol, exchange);
          if (histCandles && histCandles.length > 0) {
            stockMetrics = this.calculateDynamicStockMetrics(histCandles, triggerTime || new Date());
            state.dailyAtrPct = stockMetrics.dailyAtrPct;
            state.dynamicParabolicPct = stockMetrics.dynamicParabolicPct;

            logicalTargetInfo = this.calculateLogicalTarget(
              histCandles,
              entry,
              sl,
              finalSide,
              config.targetRs || 500,
              symbol,
              triggerTime || new Date()
            );

            tgt = logicalTargetInfo.targetPrice;
            state.logicalTargetReason = logicalTargetInfo.targetReason;
            state.pdh = logicalTargetInfo.pdh ?? undefined;
            state.pdl = logicalTargetInfo.pdl ?? undefined;
            state.pdc = logicalTargetInfo.pdc ?? undefined;
          }
        } catch (targetErr: any) {
          this.log(state, `⚠ Historical candles for logical target fetch notice: ${targetErr.message}`);
        }
      }

      const riskPerShare = Math.max(symTickSize, Math.abs(entry - sl));
      const targetPerShare = Math.max(symTickSize, Math.abs(tgt - entry));
      const targetThresholdRs = config.targetRs && config.targetRs > 0 ? config.targetRs : 500;

      // Dynamically query exact live available free capital from Zerodha Kite margin API
      let liveCash = (config as any).maxCapital || 15000;
      if (client && !state.isPaperTrade && !isHistorical) {
        try {
          const liveMargins = await (kite.getMargins ? kite.getMargins() : client.getMargins?.()).catch(() => null);
          const freeCash = liveMargins?.equity?.available?.live_balance
            ?? liveMargins?.equity?.available?.cash
            ?? liveMargins?.equity?.net
            ?? liveMargins?.available?.live_balance
            ?? liveMargins?.available?.cash
            ?? liveMargins?.net;
          if (freeCash && freeCash > 0) {
            liveCash = Number(freeCash);
            this.log(state, `💰 Live Zerodha Equity Margin detected: ₹${liveCash.toLocaleString('en-IN')}`);
          }
        } catch (mErr: any) {
          this.logger.debug?.(`Live margin fetch error: ${mErr?.message}`);
        }
      }

      // Apply User's Max Capital cap if set, and reserve 15% cash cushion
      const userMaxCapital = (config as any).maxCapital;
      const marginBudget = liveCash * 0.85; // 15% safety buffer for fees/slippage
      const deployableCapital = userMaxCapital && userMaxCapital > 0 ? Math.min(userMaxCapital, marginBudget) : marginBudget;

      let finalQty = 1;

      if (isOption) {
        // ── Option Intraday Mode (Requires 100% upfront premium & whole lot size) ──
        let lotSize = 1;
        try {
          const instruments = await client.getInstruments(exchange);
          const optInst = instruments.find((i: any) => i.tradingsymbol === symbol);
          lotSize = optInst?.lot_size ?? 1;
        } catch { }

        const costPerLot = entry * lotSize;
        const affordableLots = Math.floor(deployableCapital / costPerLot);

        if (affordableLots < 1) {
          this.log(
            state,
            `❌ Margin Check: 1 lot of ${symbol} requires ₹${costPerLot.toFixed(2)} (${lotSize} qty @ ₹${entry.toFixed(2)}), but tradeable margin is ₹${deployableCapital.toFixed(2)}. Skipping trade.`
          );
          return;
        }

        const configuredLots = config.lots && config.lots > 0
          ? config.lots
          : Math.max(1, Math.round((config.qty || lotSize) / lotSize));
        const lotsToTrade = Math.min(configuredLots, affordableLots);

        if (configuredLots > affordableLots) {
          this.log(
            state,
            `⚠️ Margin Allocation: Configured ${configuredLots} lots, but live available margin allows ${affordableLots} lot(s). Auto-scaled down to ${lotsToTrade} lot(s).`
          );
        }

        finalQty = lotsToTrade * lotSize;
        state.config.qty = finalQty;
        config.qty = finalQty;
        const potentialMaxLossRs = finalQty * riskPerShare;
        this.log(
          state,
          `⚖ Dynamic Option Sizing: ${lotsToTrade} lot(s) = ${finalQty} shares (Cost: ₹${(costPerLot * lotsToTrade).toFixed(2)} | Max Potential Loss: ₹${potentialMaxLossRs.toFixed(2)} | Target Profit: ₹${(finalQty * targetPerShare).toFixed(2)} | Cash Reserve: ₹${(liveCash - costPerLot * lotsToTrade).toFixed(2)})`
        );
      } else {
        // ── Equity Stock MIS Mode (Strict Risk-Based Sizing) ──
        const marginPerShare = entry / 5;
        const affordableQty = Math.floor(deployableCapital / marginPerShare);

        if (affordableQty < 1) {
          this.log(
            state,
            `❌ Margin Check: Buying 1 share of ${symbol} at ₹${entry.toFixed(2)} exceeds tradeable margin ₹${deployableCapital.toFixed(2)}. Skipping trade.`
          );
          return;
        }

        // 1. Strict Risk-Based Quantity: Sized directly from user's Stop Loss (e.g. ₹500)
        const maxAllowedRisk = config.stopLossRs && config.stopLossRs > 0 ? config.stopLossRs : 500;
        const riskAllowedQty = Math.floor(maxAllowedRisk / riskPerShare);

        if (riskAllowedQty < 1) {
          this.log(
            state,
            `❌ Risk Limit Exceeded: ${symbol} @ ₹${entry.toFixed(2)} with SL ₹${sl.toFixed(2)} has risk/share of ₹${riskPerShare.toFixed(2)}. Even 1 share exceeds your configured ₹${maxAllowedRisk} Stop Loss limit. Trade rejected to preserve capital.`
          );
          return;
        }

        // 2. Dynamic Capital Allocation Cap: Deploy up to 50% of available Zerodha margin
        // Balances healthy position size to reach ₹500 target on realistic 1% moves while maintaining a 50% cash buffer
        const capitalAllocationFraction = 0.50; // 50% allocation per trade (5x MIS)
        const tradeCapitalBudget = liveCash * capitalAllocationFraction;
        const capitalAllowedQty = Math.max(1, Math.floor((tradeCapitalBudget * 5) / entry));

        // Final quantity is strictly the MINIMUM of Risk-Allowed Qty, Capital-Allowed Qty, and Affordable Qty
        finalQty = Math.max(1, Math.min(riskAllowedQty, capitalAllowedQty, affordableQty));

        // Final Safety Check: Potential loss must never exceed configured stop loss Rs
        if (finalQty * riskPerShare > maxAllowedRisk && finalQty > 1) {
          finalQty = Math.max(1, Math.floor(maxAllowedRisk / riskPerShare));
        }

        state.config.qty = finalQty;
        config.qty = finalQty;
        const potentialMaxLossRs = finalQty * riskPerShare;
        const deployedMargin = (finalQty * entry) / 5;
        const capitalPct = ((deployedMargin / liveCash) * 100).toFixed(1);

        this.log(
          state,
          `⚖ Strict Risk-Based Position Sizing (5x MIS): ${finalQty} shares | Risk/sh: ₹${riskPerShare.toFixed(2)} | Max Potential Loss: ₹${potentialMaxLossRs.toFixed(2)} [Capped to User SL: ₹${maxAllowedRisk}] | Required Margin: ₹${deployedMargin.toFixed(0)} (${capitalPct}% of ₹${liveCash.toLocaleString('en-IN')}) | Target Move: ₹${targetPerShare.toFixed(2)} -> Target Profit: ₹${(finalQty * targetPerShare).toFixed(2)}`
        );
      }

      // If user enabled "Exit Exact at Target", calibrate exact target and SL distances to match rupee amounts
      if (config.exitExactAtTarget && finalQty > 0) {
        const exactTargetDistance = targetThresholdRs / finalQty;
        const exactSlDistance = maxRiskThresholdRs / finalQty;
        tgt = this.roundTick(finalSide === 'BUY' ? entry + exactTargetDistance : entry - exactTargetDistance, symbol);
        const rupeeCapSl = this.roundTick(finalSide === 'BUY' ? entry - exactSlDistance : entry + exactSlDistance, symbol);

        // ── DYNAMIC TECHNICAL STOP LOSS GUARD ─────────────────────────────────────
        // Never push the Stop Loss further than the chart's structural invalidation point!
        // The rupee SL is a maximum loss ceiling (cap), while structural SL protects technical invalidation.
        const structuralSl = sl;
        sl = finalSide === 'BUY' ? Math.max(structuralSl, rupeeCapSl) : Math.min(structuralSl, rupeeCapSl);
        const actualRiskPerShare = Math.abs(entry - sl);
        const actualRiskRs = actualRiskPerShare * finalQty;
        this.log(
          state,
          `🎯 [EXACT TARGET MODE] Target: ₹${tgt.toFixed(2)} (+₹${targetThresholdRs}) | Dynamic Structural SL: ₹${sl.toFixed(2)} (Risk: ₹${actualRiskRs.toFixed(2)} | ₹${actualRiskPerShare.toFixed(2)}/sh, Cap: -₹${maxRiskThresholdRs})`
        );
      } else if (logicalTargetInfo) {
        const pdhStr = logicalTargetInfo.pdh ? `₹${logicalTargetInfo.pdh.toFixed(2)}` : 'N/A';
        const pdlStr = logicalTargetInfo.pdl ? `₹${logicalTargetInfo.pdl.toFixed(2)}` : 'N/A';
        const pdcStr = logicalTargetInfo.pdc ? `₹${logicalTargetInfo.pdc.toFixed(2)}` : 'N/A';
        const atrStr = stockMetrics ? `${stockMetrics.dailyAtrPct.toFixed(2)}%` : 'N/A';
        this.log(
          state,
          `🎯 [LOGICAL TARGET & FIBONACCI CONFLUENCE] Target: ₹${tgt.toFixed(2)} (${logicalTargetInfo.targetReason}) | Fib 1.272: ₹${logicalTargetInfo.fib1272.toFixed(2)} | Fib 1.618: ₹${logicalTargetInfo.fib1618.toFixed(2)} | PDH: ${pdhStr} | PDL: ${pdlStr} | PDC: ${pdcStr} | 5-Day ATR: ${atrStr}`
        );
      }

      this.log(state, `📋 Placing: ${symbol} — Target Qty: ${state.config.qty} | Entry: ₹${entry.toFixed(2)} | SL: ₹${sl.toFixed(2)} | Target: ₹${tgt.toFixed(2)}${config.exitExactAtTarget ? ' (Fixed Exact Target Mode)' : ''}`);
      if (!this.running.has(state.strategyId)) {
        this.log(state, `🛑 Engine stopped prior to order dispatch. Aborting entry order for ${symbol}.`);
        return;
      }
      const limitPrice = finalSide === 'BUY'
        ? this.roundTick(entry + symTickSize * 2, symbol)
        : this.roundTick(entry - symTickSize * 2, symbol);

      let entryId: string | null = null;
      let usedProduct = product;
      let executedQty = config.qty;
      let actualEntryPrice = entry;

      if (state.isPaperTrade || isHistorical) {
        entryId = `PAPER_${Math.random().toString(36).substring(7).toUpperCase()}`;
        this.log(state, `✅ Entry Order (LIMIT @ ₹${limitPrice.toFixed(2)}): ${entryId}`);
        state.entryOrderId = entryId;
        state.tradesPlacedToday++;
        this.log(state, `📊 Trade count updated: ${state.tradesPlacedToday}/${config.maxTradesPerDay} trades placed today.`);
      } else {
        let initialOrderError: string | null = null;
        try {
          entryId = await this.placeOrder(state, { symbol, exchange, product: usedProduct, qty: config.qty, side: finalSide, orderType: 'LIMIT', price: limitPrice, intent: 'ENTRY' });
          this.log(state, `✅ Entry Order (LIMIT @ ₹${limitPrice.toFixed(2)}): ${entryId}`);
          state.entryOrderId = entryId;
          state.tradesPlacedToday++;
          this.log(state, `📊 Trade count updated: ${state.tradesPlacedToday}/${config.maxTradesPerDay} trades placed today.`);
        } catch (placeErr: any) {
          initialOrderError = placeErr?.message || 'Order placement failed';
          this.log(state, `⚠ Initial Entry order placement error with ${usedProduct}: ${initialOrderError}`);
        }

        let isRejectedOrFailed = !!initialOrderError;
        let rejectReason = initialOrderError || '';

        if (entryId && client && kite) {
          await new Promise(r => setTimeout(r, 600));
          try {
            const orders = await kite.getOrders();
            const entryOrder = orders.find((o: any) => o.order_id === entryId);
            if (entryOrder) {
              const filled = Number(entryOrder.filled_quantity) || 0;
              const status = entryOrder.status;
              if (filled > 0) {
                executedQty = filled;
                if (entryOrder.average_price && Number(entryOrder.average_price) > 0) {
                  actualEntryPrice = Number(entryOrder.average_price);
                }
                this.log(state, `📊 Broker Entry Status: ${status} | Executed: ${executedQty}/${config.qty} shares @ Avg ₹${actualEntryPrice.toFixed(2)}`);
              } else if (status === 'REJECTED' || status === 'CANCELLED') {
                isRejectedOrFailed = true;
                rejectReason = entryOrder.status_message || 'Order rejected by broker';
                this.log(state, `❌ Entry order ${entryId} was ${status}: ${rejectReason}`);
              } else {
                this.log(state, `⏳ Entry order ${entryId} is ${status} (0 filled so far). Monitoring for fills...`);
                executedQty = 0;
              }
            }
          } catch (e: any) {
            this.log(state, `⚠ Order status verification notice: ${e.message}`);
          }
        }

        // ── NRML FALLBACK FOR BUY MOMENTUM RALLIES ─────────────────────────────────
        // If Zerodha RMS rejects MIS on non-F&O cash equities (e.g. WHIRLPOOL, OLAELEC, BIKAJI, ELECON),
        // fallback to NRML (Normal / Delivery 1x) so the momentum rally trade is NOT missed!
        const isFuture = Boolean(state.futureSymbol || symbol.endsWith('FUT') || (!isOption && (exchange === 'NFO' || exchange === 'BFO')));
        if (isRejectedOrFailed && finalSide === 'BUY' && !isOption && !isFuture && usedProduct === 'MIS') {
          const lowerReject = rejectReason.toLowerCase();
          const isMisIssue = lowerReject.includes('mis') || lowerReject.includes('blocked') || lowerReject.includes('product') || lowerReject.includes('margin') || lowerReject.includes('rms') || lowerReject.includes('rule');
          if (isMisIssue) {
            this.log(state, `💡 Zerodha RMS rejected MIS for ${symbol} ("${rejectReason}"). Evaluating Cash Equity NRML fallback to trade momentum rally...`);

            const riskPerShare = Math.max(Math.abs(entry - sl), symTickSize * 2);
            const maxAllowedRisk = config.stopLossRs && config.stopLossRs > 0 ? config.stopLossRs : 500;
            const riskAllowedQty = Math.floor(maxAllowedRisk / riskPerShare);
            const nrmlAffordableQty = Math.floor(liveCash / entry);
            const nrmlBudgetQty = Math.floor((liveCash * 0.85) / entry);
            const nrmlQty = Math.max(1, Math.min(riskAllowedQty, nrmlAffordableQty, nrmlBudgetQty));

            if (nrmlAffordableQty < 1 || liveCash < entry) {
              this.log(state, `❌ NRML Fallback aborted: Available cash ₹${liveCash.toFixed(2)} is insufficient to buy 1 share of ${symbol} at ₹${entry.toFixed(2)}.`);
              if (entryId) state.tradesPlacedToday = Math.max(0, state.tradesPlacedToday - 1);
              return;
            }

            usedProduct = 'NRML';
            config.product = 'NRML';
            state.config.product = 'NRML';
            config.qty = nrmlQty;
            state.config.qty = nrmlQty;
            executedQty = nrmlQty;

            this.log(state, `🔄 Retrying entry order with NRML (Cash Equity / Delivery): ${nrmlQty} shares @ ₹${limitPrice.toFixed(2)} (Required Capital: ₹${(nrmlQty * entry).toFixed(2)})`);

            try {
              entryId = await this.placeOrder(state, { symbol, exchange, product: 'NRML', qty: nrmlQty, side: 'BUY', orderType: 'LIMIT', price: limitPrice, intent: 'ENTRY' });
              this.log(state, `✅ NRML Entry Order placed (LIMIT @ ₹${limitPrice.toFixed(2)}): ${entryId}`);
              state.entryOrderId = entryId;
              if (initialOrderError) {
                state.tradesPlacedToday++;
              }

              // Verify NRML order fill
              await new Promise(r => setTimeout(r, 600));
              const ordersRetry = await kite.getOrders();
              const nrmlOrder = ordersRetry.find((o: any) => o.order_id === entryId);
              if (nrmlOrder) {
                const filled = Number(nrmlOrder.filled_quantity) || 0;
                const status = nrmlOrder.status;
                if (filled > 0) {
                  executedQty = filled;
                  if (nrmlOrder.average_price && Number(nrmlOrder.average_price) > 0) {
                    actualEntryPrice = Number(nrmlOrder.average_price);
                  }
                  this.log(state, `📊 Broker Entry Status (NRML): ${status} | Executed: ${executedQty}/${nrmlQty} shares @ Avg ₹${actualEntryPrice.toFixed(2)}`);
                } else if (status === 'REJECTED' || status === 'CANCELLED') {
                  this.log(state, `❌ NRML Entry order ${entryId} was ${status}: ${nrmlOrder.status_message || 'Order rejected by broker'}`);
                  state.tradesPlacedToday = Math.max(0, state.tradesPlacedToday - 1);
                  return;
                } else {
                  this.log(state, `⏳ NRML Entry order ${entryId} is ${status} (0 filled so far). Monitoring for fills...`);
                  executedQty = 0;
                }
              }
              isRejectedOrFailed = false;
            } catch (nrmlErr: any) {
              this.log(state, `❌ NRML Fallback order failed: ${nrmlErr.message}`);
              if (!initialOrderError) state.tradesPlacedToday = Math.max(0, state.tradesPlacedToday - 1);
              return;
            }
          }
        }

        if (isRejectedOrFailed) {
          if (!initialOrderError && entryId) {
            state.tradesPlacedToday = Math.max(0, state.tradesPlacedToday - 1);
          }
          return;
        }
      }

      state.executedQty = executedQty;
      state.entryPrice = actualEntryPrice;

      // Track order in DB
      await this.trackOrderInDB(state, finalSide, symbol, exchange, executedQty > 0 ? executedQty : config.qty, actualEntryPrice, entryId || `ORDER_${Date.now()}`, triggerTime);

      const exitSide = finalSide === 'BUY' ? 'SELL' : 'BUY';
      let slOrderId: string | null = null;
      let targetOrderId: string | null = null;
      if (!state.isPaperTrade && !isHistorical) {
        if (state.executedQty > 0) {
          const slLimitPrice = exitSide === 'BUY'
            ? this.roundTick(isOption ? sl * 1.02 : sl + symTickSize * 3, symbol)
            : this.roundTick(isOption ? sl * 0.98 : sl - symTickSize * 3, symbol);
          const slTriggerPrice = this.roundTick(sl, symbol);
          const tgtPrice = this.roundTick(tgt, symbol);

          slOrderId = await this.placeOrder(state, {
            symbol,
            exchange,
            product: usedProduct,
            qty: state.executedQty,
            side: exitSide,
            orderType: 'SL',
            price: slLimitPrice,
            triggerPrice: slTriggerPrice,
            intent: 'PROTECTIVE'
          }).catch((e: any) => { this.log(state, `❌ SL Failed: ${e.message}`); return null; });

          if (slOrderId) {
            this.log(state, `🛡 Stop Loss Armed at broker (${state.executedQty} shares): Trigger ₹${slTriggerPrice.toFixed(2)}, Limit ₹${slLimitPrice.toFixed(2)} | OrderId: ${slOrderId}`);
          }
          if (config.enableProfitFloor === false || config.exitExactAtTarget) {
            targetOrderId = await this.placeOrder(state, { symbol, exchange, product: usedProduct, qty: state.executedQty, side: exitSide, orderType: 'LIMIT', price: tgtPrice, intent: 'EXIT' })
              .catch((e: any) => { this.log(state, `❌ Target Failed: ${e.message}`); return null; });
            if (targetOrderId) {
              this.log(state, `🎯 Broker LIMIT Target Armed (${state.executedQty} shares @ ₹${tgtPrice.toFixed(2)}) | OrderId: ${targetOrderId}`);
            }
          } else {
            this.log(state, `💡 Trend Trailing Mode active — SL placed at broker for ${state.executedQty} shares (Trigger: ₹${slTriggerPrice.toFixed(2)}, Limit: ₹${slLimitPrice.toFixed(2)}), Target 1 (₹${tgtPrice.toFixed(2)}) will activate dynamic 15-EMA Trailing SL to ride full trend.`);
          }
        } else {
          this.log(state, `⏳ Entry order pending execution. Stop Loss order will be placed as soon as initial shares fill.`);
        }
      }

      state.entryTriggered = side === 'BUY' ? 'LONG' : 'SHORT';
      state.optionSymbol = isOption ? symbol : null;
      state.stopLossPrice = sl;
      state.targetPrice = tgt;
      state.slOrderId = slOrderId;
      state.targetOrderId = targetOrderId;
      state.setupTimestamp = triggerTime ? triggerTime.getTime() : Date.now();
      state.entryTime = triggerTime || new Date();

      if (!state.isPaperTrade && !isHistorical && state.executedQty > 0 && !slOrderId) {
        this.log(state, `⚠ Warning: Failed to place SL order at broker. Active monitoring will try to exit if needed.`);
      }

      // Start real-time WebSocket monitoring for live trades (not historical catch-up)
      if (!isHistorical && state.entryTriggered) {
        await this.startRealtimeMonitor(state, client);
      }
    } catch (err: any) {
      this.log(state, `❌ Placement failed: ${err.message}`);
    } finally {
      state.isPlacingTrade = false;
    }
  }

  // ── Real-Time Position Monitoring ──────────────────────────────────────────

  private async updateBrokerSlSafe(client: any, kite: any, state: StrategyState, symbol: string) {
    if (state.isPaperTrade || !state.slOrderId || state.slOrderId === 'FAILED' || !state.stopLossPrice) return;
    try {
      const symTickSize = state.optionSymbol ? 0.05 : getInstrumentTickSize(symbol, state.stopLossPrice);
      const isLong = (state.config.isOptionBuyingOnly && state.optionSymbol) || state.entryTriggered === 'LONG';
      const triggerPrice = this.roundTick(state.stopLossPrice, symbol);
      const price = this.roundTick(isLong ? triggerPrice - symTickSize * 3 : triggerPrice + symTickSize * 3, symbol);

      // Only modify broker order if trigger price has changed by at least 1 tick
      if (state.lastBrokerSlTrigger !== undefined && Math.abs(triggerPrice - state.lastBrokerSlTrigger) < symTickSize) {
        return;
      }

      // Rate limit order modifications to at most once per 2 seconds to respect broker limits
      const now = Date.now();
      if (state.lastBrokerSlModifyTime && (now - state.lastBrokerSlModifyTime) < 2000) {
        return;
      }

      const k = kite || client?.['kite'] || client;
      if (client && client.modifyOrder) {
        await client.modifyOrder(state.slOrderId, {
          triggerPrice: triggerPrice,
          price: price,
        }).catch((e: any) => {
          this.logger.warn(`Broker SL modify notice: ${e.message}`);
        });
        state.lastBrokerSlTrigger = triggerPrice;
        state.lastBrokerSlModifyTime = now;
        this.log(state, `🛡 Synced Trailing SL to Zerodha Exchange (${state.slOrderId}) -> Trigger: ₹${triggerPrice.toFixed(2)}, Limit: ₹${price.toFixed(2)}`);
      } else if (k && k.modifyOrder) {
        await k.modifyOrder('regular', state.slOrderId, {
          trigger_price: triggerPrice,
          price: price,
        }).catch((e: any) => {
          this.logger.warn(`Broker SL modify notice: ${e.message}`);
        });
        state.lastBrokerSlTrigger = triggerPrice;
        state.lastBrokerSlModifyTime = now;
        this.log(state, `🛡 Synced Trailing SL to Zerodha Exchange (${state.slOrderId}) -> Trigger: ₹${triggerPrice.toFixed(2)}, Limit: ₹${price.toFixed(2)}`);
      }
    } catch (e: any) {
      this.logger.warn(`Failed to update broker SL order: ${e.message}`);
    }
  }

  private async startRealtimeMonitor(state: StrategyState, client: any) {
    if (!state.entryTriggered) return;

    const symbol = state.optionSymbol || state.activeSymbol || state.config.symbol;
    const exchange = state.optionSymbol ? 'NFO' : (state.futureSymbol ? state.futureExchange : state.config.exchange);
    const kite = client['kite'];

    // Dynamically subscribe the traded symbol to the WebSocket
    try {
      await this.tickerService.subscribeSymbol(state.brokerAccountId, symbol);
      this.log(state, `📡 Live tracking activated for ${exchange}:${symbol}`);
    } catch (e) {
      this.log(state, `⚠ WebSocket subscribe notice: ${e.message}. Polling active.`);
    }

    state.lastPnlLogTime = 0;
    state.realtimeActive = true;
    let isExiting = false;

    const unsubscribe = this.tickerService.registerListener(async (ticks) => {
      // Process ticks for our symbol (or exchange prefixed symbol)
      const currentPrice = ticks[symbol] || ticks[`${exchange}:${symbol}`] || ticks[`NSE:${symbol}`];
      if (!currentPrice || !state.entryTriggered || isExiting || state.isExiting) return;

      const now = Date.now();
      state.lastTickTime = now;
      state.currentLtp = currentPrice;

      const isOptionTrade = !!(state.config.isOptionBuyingOnly && state.optionSymbol);
      const isLong = isOptionTrade || state.entryTriggered === 'LONG';
      const activeQty = state.executedQty || state.config.qty;
      const pnlPoints = isLong ? (currentPrice - state.entryPrice!) : (state.entryPrice! - currentPrice);
      const pnlRs = pnlPoints * activeQty;
      const pnlPct = state.entryPrice ? (pnlPoints / state.entryPrice) * 100 : 0;

      state.currentPnlRs = pnlRs;
      state.currentPnlPct = pnlPct;
      state.peakPnlRs = Math.max(state.peakPnlRs || 0, pnlRs);

      // ── 1. 3:05 PM IST Mandatory EOD Cutoff (Exits safely before Zerodha 3:12 PM RMS) ──
      const currentHhmm = this.getIstHhmm(new Date());
      if (currentHhmm >= 15 * 60 + 5 && state.entryTriggered) {
        if (isExiting || state.isExiting) return;
        isExiting = true;
        state.isExiting = true;
        this.log(state, `⏰ 3:05 PM Intraday EOD Cutoff reached! Auto-squaring off position (Current P&L: ₹${pnlRs.toFixed(2)}) to avoid Zerodha RMS penalty charges...`);
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
        await this.persistLogs(state);
        return;
      }

      // ── 1.05 35-Minute Intraday Stagnation Exit (Time Stop for Chop Traps like LODHA) ────
      if (state.entryTime && state.entryTriggered) {
        const entryDurationMs = now - new Date(state.entryTime).getTime();
        // If position has been held for >= 35 minutes and has made < 0.25% move (stagnant dead chop)
        if (entryDurationMs >= 35 * 60 * 1000 && Math.abs(pnlPct) < 0.25) {
          if (isExiting || state.isExiting) return;
          isExiting = true;
          state.isExiting = true;
          this.log(
            state,
            `⏱ [STAGNATION EXIT] ${symbol} has remained flat (< 0.25% move) for 35+ mins. Auto-squaring off near breakeven (P&L: ₹${pnlRs.toFixed(2)}) to liberate margin for active momentum leaders!`
          );
          if (!state.cooldownSymbols) state.cooldownSymbols = new Map();
          state.cooldownSymbols.set(symbol, now + 30 * 60 * 1000); // 30 min cooldown
          this.stopRealtimeMonitor(state);
          await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
          await this.persistLogs(state);
          return;
        }
      }

      // ── 1.1 EXACT TARGET / STOP LOSS EXIT (Guaranteed Fixed Target Exit) ─────
      const exactTargetRs = state.config.targetRs && state.config.targetRs > 0 ? state.config.targetRs : 500;
      const exactStopLossRs = state.config.stopLossRs && state.config.stopLossRs > 0 ? state.config.stopLossRs : 500;

      if (state.config.exitExactAtTarget) {
        if (pnlRs >= exactTargetRs) {
          if (isExiting) return;
          isExiting = true;
          this.log(
            state,
            `🎯 [EXACT TARGET EXIT] Position reached exact target profit (+₹${pnlRs.toFixed(2)} >= ₹${exactTargetRs})! Immediately squaring off position.`
          );
          if (state.slOrderId) await this.cancelBrokerOrderSafe(client, state.slOrderId);
          if (state.targetOrderId) await this.cancelBrokerOrderSafe(client, state.targetOrderId);
          this.stopRealtimeMonitor(state);
          await this.exitPosition(state, client, currentPrice, 'TARGET');
          await this.persistLogs(state);
          return;
        }

        if (pnlRs <= -exactStopLossRs) {
          if (isExiting) return;
          isExiting = true;
          this.log(
            state,
            `🛑 [EXACT STOP LOSS EXIT] Position reached exact stop loss limit (-₹${Math.abs(pnlRs).toFixed(2)} <= -₹${exactStopLossRs})! Immediately squaring off position.`
          );
          if (state.slOrderId) await this.cancelBrokerOrderSafe(client, state.slOrderId);
          if (state.targetOrderId) await this.cancelBrokerOrderSafe(client, state.targetOrderId);
          this.stopRealtimeMonitor(state);
          await this.exitPosition(state, client, currentPrice, 'SL');
          await this.persistLogs(state);
          return;
        }

        // ── 1.2 DYNAMIC BREAK-EVEN & PROFIT PROTECTION (Exact Target Mode) ──
        // When position gains >= 50% of the target profit (e.g. >= +₹250 on ₹500 target),
        // trail Stop Loss to Break-Even (Entry Price) to eliminate all downside risk!
        if (state.entryPrice && state.peakPnlRs >= exactTargetRs * 0.48) {
          const symTick = getInstrumentTickSize(symbol, currentPrice);
          const breakEvenPrice = this.roundTick(isLong ? state.entryPrice + symTick * 2 : state.entryPrice - symTick * 2, symbol);
          const needsSlAdvance = isLong ? (breakEvenPrice > (state.stopLossPrice || 0)) : (breakEvenPrice < (state.stopLossPrice || Infinity));
          if (needsSlAdvance) {
            state.stopLossPrice = breakEvenPrice;
            state.isTrailingEma = true;
            this.log(
              state,
              `🛡 [BREAK-EVEN PROFIT PROTECTION] Peak P&L reached +₹${state.peakPnlRs.toFixed(2)} (>= 50% of ₹${exactTargetRs} target)! Advancing SL to Break-Even (₹${breakEvenPrice.toFixed(2)}) to lock out risk.`
            );
            await this.updateBrokerSlSafe(client, kite, state, symbol);
          }

          // ── 1.3 HYBRID BUFFERED 15-EMA & VWAP TRAILING IN PROFIT (Option B) ──
          // When Exact Target Mode is active and Break-Even is locked:
          // As price approaches target and 15-EMA & VWAP advance above Break-Even into profit,
          // dynamically trail the broker Stop Loss order behind 15-EMA (with 0.30% noise buffer) & VWAP.
          // This locks in intermediate gains (+₹500 to +₹800) if the stock reverses before reaching the exact target,
          // while the 0.30% buffer ensures 10-paise candle wicks do NOT trigger premature stopouts!
          const isHybridEnabled = (state.config as any).enableHybridTrailing !== false;
          if (isHybridEnabled && state.lastEma && !isOptionTrade) {
            const emaBuffer = state.lastEma * 0.0030; // 0.30% noise buffer
            const bufferedEma = isLong ? (state.lastEma - emaBuffer) : (state.lastEma + emaBuffer);

            // Resilient trend support: take the safer/lower support line (for long) to avoid false wick triggers
            let trendSupport = bufferedEma;
            if (state.lastVwap && state.lastVwap > 0) {
              trendSupport = isLong ? Math.min(bufferedEma, state.lastVwap) : Math.max(bufferedEma, state.lastVwap);
            }

            // Advance SL ONLY if trend support has climbed strictly into PROFIT beyond Break-Even
            const isTrailBeyondBreakEven = isLong ? (trendSupport > breakEvenPrice) : (trendSupport < breakEvenPrice);
            if (isTrailBeyondBreakEven) {
              const roundedTrailSl = this.roundTick(trendSupport, symbol);
              const isBetterSl = isLong ? (roundedTrailSl > (state.stopLossPrice || 0)) : (roundedTrailSl < (state.stopLossPrice || Infinity));
              if (isBetterSl) {
                state.stopLossPrice = roundedTrailSl;
                state.isTrailingEma = true;
                const lockedProfitRs = (isLong ? (roundedTrailSl - state.entryPrice) : (state.entryPrice - roundedTrailSl)) * activeQty;
                this.log(
                  state,
                  `📈 [HYBRID 15-EMA/VWAP TRAIL] Dynamic trend support advanced to ₹${roundedTrailSl.toFixed(2)} (in profit with 0.30% noise buffer)! Trailing broker SL to lock +₹${lockedProfitRs.toFixed(2)} gain.`
                );
                await this.updateBrokerSlSafe(client, kite, state, symbol);
              }
            }
          }
        }
      }

      // ── 2. Uncapped Trend Rider: 15-EMA & VWAP Dynamic Trailing ───────────────
      const entryPrice = state.entryPrice || currentPrice;
      const moveFromEntryPct = entryPrice > 0 ? (isLong ? (currentPrice - entryPrice) / entryPrice : (entryPrice - currentPrice) / entryPrice) * 100 : 0;
      const isTrailingEnabled = state.config.enableProfitFloor !== false && !state.config.exitExactAtTarget;
      const isTarget1Reached = isLong ? (currentPrice >= state.targetPrice!) : (currentPrice <= state.targetPrice!);

      // ── 2.1 Parabolic Mode & VWAP Profit-Lock (TTML Spike Protection) ──────────
      const parabolicThreshold = state.dynamicParabolicPct || 2.5;
      const isParabolicTrigger = moveFromEntryPct >= parabolicThreshold;
      if (!state.config.exitExactAtTarget && state.config.enableParabolicVwapLock !== false && isParabolicTrigger && !isOptionTrade) {
        if (!state.isParabolicActive) {
          state.isParabolicActive = true;
          this.log(state, `🚀 [PARABOLIC MOMENTUM ACTIVE] Stock surged +${moveFromEntryPct.toFixed(2)}% (Dynamic ATR Threshold: ${parabolicThreshold}%)! Dynamic floor transferred to Session VWAP (₹${(state.lastVwap || 0).toFixed(2)}) to lock peak gains.`);
        }
        if (state.lastVwap) {
          const roundedVwap = this.roundTick(state.lastVwap, symbol);
          if (isLong ? (roundedVwap > (state.stopLossPrice || 0)) : (roundedVwap < (state.stopLossPrice || Infinity))) {
            state.stopLossPrice = roundedVwap;
            await this.updateBrokerSlSafe(client, kite, state, symbol);
          }
          // If price closes/drops below VWAP in Parabolic mode, exit immediately!
          const isVwapCrossed = isLong ? (currentPrice < state.lastVwap) : (currentPrice > state.lastVwap);
          if (isVwapCrossed) {
            if (isExiting) return;
            isExiting = true;
            this.log(state, `🎯 [PARABOLIC VWAP LOCK EXIT] ${symbol} crossed Session VWAP @ ₹${currentPrice.toFixed(2)} (VWAP: ₹${state.lastVwap.toFixed(2)})! Exiting to protect morning surge gains (+${moveFromEntryPct.toFixed(2)}%).`);
            this.stopRealtimeMonitor(state);
            await this.exitPosition(state, client, currentPrice, 'TARGET');
            await this.persistLogs(state);
            return;
          }
        }
      }

      // ── 2.2 Uncapped 15-EMA & VWAP Trend Riding (Holds through wicks, ignores 50-paise noise) ──
      if (!state.config.exitExactAtTarget && !isOptionTrade && state.lastEma && state.lastVwap) {
        const trendSupport = isLong ? Math.max(state.lastEma, state.lastVwap) : Math.min(state.lastEma, state.lastVwap);

        // If trend support rises into profit, trail SL along with the 15-EMA / VWAP
        const isSupportInProfit = isLong ? (trendSupport > entryPrice) : (trendSupport < entryPrice);
        if (isSupportInProfit) {
          const newTrailSl = this.roundTick(trendSupport, symbol);
          if (isLong ? (newTrailSl > (state.stopLossPrice || 0)) : (newTrailSl < (state.stopLossPrice || Infinity))) {
            state.stopLossPrice = newTrailSl;
            state.isTrailingEma = true;
            this.log(state, `📈 [15-EMA / VWAP TRAIL] Dynamic trend support advanced to ₹${newTrailSl.toFixed(2)} (in profit)! Trailing SL to lock structural gains...`);
            await this.updateBrokerSlSafe(client, kite, state, symbol);
          }
        }

        // 0.30% Noise Buffer Filter around 15-EMA while above VWAP (CHENNPETRO Fakeout Protection)
        const isAboveVwap = isLong ? (currentPrice > state.lastVwap) : (currentPrice < state.lastVwap);
        const emaBuffer = (state.config.enableTwoCandleEmaConfirmation !== false && isAboveVwap) ? (state.lastEma * 0.0030) : 0;
        const effectiveEmaTrail = isLong ? (state.lastEma - emaBuffer) : (state.lastEma + emaBuffer);

        // Exit ONLY when true trend breakdown occurs (VWAP loss or confirmed EMA buffer breach)
        const isVwapBroken = isLong ? (currentPrice < state.lastVwap) : (currentPrice > state.lastVwap);
        const isEmaBufferBroken = isLong ? (currentPrice < effectiveEmaTrail) : (currentPrice > effectiveEmaTrail);
        const isTrendBroken = (isVwapBroken && isSupportInProfit) || (isEmaBufferBroken && isSupportInProfit && !isAboveVwap);

        if (isTrendBroken) {
          if (isExiting) return;
          isExiting = true;
          this.log(state, `📈 [TREND EXHAUSTION EXIT] ${symbol} confirmed trend breakdown @ ₹${currentPrice.toFixed(2)} (EMA: ₹${state.lastEma.toFixed(2)}, VWAP: ₹${state.lastVwap.toFixed(2)}) | Captured Move: ${moveFromEntryPct.toFixed(2)}% | Realized P&L: ₹${pnlRs.toFixed(2)}`);
          this.stopRealtimeMonitor(state);
          await this.exitPosition(state, client, currentPrice, 'TARGET');
          await this.persistLogs(state);
          return;
        }
      }

      // 15-EMA & VWAP Dynamic Trailing check if configured
      if (!state.config.exitExactAtTarget && state.isTrailingEma && !isOptionTrade) {
        let dynamicTrailingSl: number | null = null;
        if (state.lastEma && state.lastVwap) {
          dynamicTrailingSl = isLong ? Math.max(state.lastEma, state.lastVwap) : Math.min(state.lastEma, state.lastVwap);
        } else if (state.lastEma) {
          dynamicTrailingSl = state.lastEma;
        } else if (state.lastVwap) {
          dynamicTrailingSl = state.lastVwap;
        }

        if (dynamicTrailingSl !== null) {
          state.stopLossPrice = dynamicTrailingSl;
          const isCrossed = isLong ? (currentPrice < dynamicTrailingSl) : (currentPrice > dynamicTrailingSl);
          if (isCrossed) {
            if (isExiting) return;
            isExiting = true;
            this.log(state, `📈 Price crossed Trailing SL line @ ₹${currentPrice.toFixed(2)} (Trailing Level: ₹${dynamicTrailingSl.toFixed(2)}) | Realized P&L: ₹${pnlRs.toFixed(2)}`);
            this.stopRealtimeMonitor(state);
            await this.exitPosition(state, client, currentPrice, 'TARGET');
            await this.persistLogs(state);
            return;
          }
        }
      }

      // ── 3. Check SL / Target (Paper Trade & Live Boundary) ──────────────────
      if (state.isPaperTrade) {
        const isHitSL = isLong ? (currentPrice <= state.stopLossPrice!) : (currentPrice >= state.stopLossPrice!);

        if (!state.isTrailingEma && isHitSL) {
          if (isExiting) return;
          isExiting = true;
          this.log(state, `🛑 Stop Loss Hit at ₹${currentPrice.toFixed(2)} | P&L: ₹${pnlRs.toFixed(2)}`);
          this.stopRealtimeMonitor(state);
          await this.exitPosition(state, client, currentPrice, 'SL');
          await this.persistLogs(state);
          return;
        }
        if (!isTrailingEnabled && isTarget1Reached) {
          if (isExiting) return;
          isExiting = true;
          this.log(state, `🎯 Fixed Target Hit at ₹${currentPrice.toFixed(2)} | P&L: ₹${pnlRs.toFixed(2)}`);
          this.stopRealtimeMonitor(state);
          await this.exitPosition(state, client, currentPrice, 'TARGET');
          await this.persistLogs(state);
          return;
        }
      } else {
        const isNearBoundary = isLong
          ? (currentPrice <= state.stopLossPrice! || currentPrice >= state.targetPrice!)
          : (currentPrice >= state.stopLossPrice! || currentPrice <= state.targetPrice!);

        if (isNearBoundary) {
          if (isExiting) return;
          isExiting = true;
          try {
            const orders = await kite.getOrders();
            const slOrder = orders.find((o: any) => o.order_id === state.slOrderId);
            const targetOrder = orders.find((o: any) => o.order_id === state.targetOrderId);

            if (slOrder?.status === 'COMPLETE') {
              const avgPrice = Number(slOrder.average_price) || state.stopLossPrice!;
              this.log(state, `🛑 SL Order filled at ₹${avgPrice.toFixed(2)}`);
              if (state.targetOrderId) await client.cancelOrder(state.targetOrderId).catch(() => { });
              this.stopRealtimeMonitor(state);
              await this.exitPosition(state, client, avgPrice, 'SL');
              await this.persistLogs(state);
              return;
            } else if (targetOrder?.status === 'COMPLETE') {
              const avgPrice = Number(targetOrder.average_price) || state.targetPrice!;
              this.log(state, `🎯 Target Order filled at ₹${avgPrice.toFixed(2)}`);
              if (state.slOrderId) await client.cancelOrder(state.slOrderId).catch(() => { });
              this.stopRealtimeMonitor(state);
              await this.exitPosition(state, client, avgPrice, 'TARGET');
              await this.persistLogs(state);
              return;
            }
          } catch (e) {
            this.logger.error(`[RT] Order check error: ${e.message}`);
          }
          isExiting = false;
        }
      }

      // ── Real-Time WebSocket State Broadcast (500ms throttle for UI live updates) ──
      if (now - (state.lastEmitTime || 0) >= 500) {
        state.lastEmitTime = now;
        strategyEvents.emit('strategy.update', {
          strategyId: state.strategyId,
          logs: state.logs,
          state: this.getState(state.strategyId),
        });
      }

      // ── Throttled Live P&L Logging (every 60 seconds) ───────────────────────
      if (now - (state.lastPnlLogTime || 0) >= 60000) {
        state.lastPnlLogTime = now;
        const sign = pnlRs >= 0 ? '+' : '';
        const pctSign = pnlPct >= 0 ? '+' : '';
        this.log(state, `📊 [LIVE P&L] ${symbol}: ₹${currentPrice.toFixed(2)} | Entry: ₹${state.entryPrice!.toFixed(2)} | SL: ₹${state.stopLossPrice!.toFixed(2)} | Tgt: ₹${state.targetPrice!.toFixed(2)} | P&L: ${sign}₹${pnlRs.toFixed(2)} (${pctSign}${pnlPct.toFixed(2)}%) | Executed Qty: ${activeQty} | Peak: +₹${state.peakPnlRs?.toFixed(2) || '0.00'}${state.isTrailingEma ? ' (15-EMA Trailing)' : ''}`);
        await this.persistLogs(state);
      }
    });

    state.tickerUnsubscribe = unsubscribe;
  }

  private stopRealtimeMonitor(state: StrategyState) {
    if (state.tickerUnsubscribe) {
      state.tickerUnsubscribe();
      state.tickerUnsubscribe = undefined;
      state.realtimeActive = false;
      this.log(state, `📡 Live tracking stopped`);
    }
  }

  // ── Robust Position Monitor (Poll + WebSocket Fallback Safety Net) ─────────

  private async monitorPosition(state: StrategyState, client: any, kite: any) {
    if (!state.entryTriggered) return;

    const symbol = state.optionSymbol || state.activeSymbol || state.config.symbol;
    const exchange = state.optionSymbol ? 'NFO' : (state.futureSymbol ? state.futureExchange : state.config.exchange);
    const key = `${exchange}:${symbol}`;

    // ── 0. Partial Fill & Pending Order Sync with Broker ──────────────────────
    if (!state.isPaperTrade && kite && state.entryOrderId && (state.executedQty || 0) < state.config.qty) {
      try {
        const orders = await kite.getOrders();
        const entryOrder = orders.find((o: any) => o.order_id === state.entryOrderId);
        if (entryOrder) {
          const filled = Number(entryOrder.filled_quantity) || 0;
          const status = entryOrder.status;
          if (filled > (state.executedQty || 0)) {
            const prevQty = state.executedQty || 0;
            state.executedQty = filled;
            if (entryOrder.average_price && Number(entryOrder.average_price) > 0) {
              state.entryPrice = Number(entryOrder.average_price);
            }
            this.log(state, `📈 Partial fill sync: executed shares increased from ${prevQty} to ${state.executedQty}/${state.config.qty} @ Avg ₹${state.entryPrice!.toFixed(2)}`);

            // Sync broker SL order quantity
            const exitSide = (state.config.isOptionBuyingOnly && state.optionSymbol) ? 'SELL' : (state.entryTriggered === 'LONG' ? 'SELL' : 'BUY');
            if (state.slOrderId) {
              try {
                await kite.modifyOrder('regular', state.slOrderId, { quantity: state.executedQty });
                this.log(state, `🔄 Modified broker SL order (${state.slOrderId}) quantity to ${state.executedQty} shares`);
              } catch (modErr: any) {
                this.log(state, `⚠ Failed to modify SL order qty: ${modErr.message}`);
              }
            } else if (state.stopLossPrice) {
              const isOption = !!(state.config.isOptionBuyingOnly && state.optionSymbol);
              const symTickSize = isOption ? 0.05 : getInstrumentTickSize(symbol, state.entryPrice || 0);
              const slLimitPrice = exitSide === 'BUY'
                ? this.roundTick(isOption ? state.stopLossPrice * 1.02 : state.stopLossPrice + symTickSize * 3, symbol)
                : this.roundTick(isOption ? state.stopLossPrice * 0.98 : state.stopLossPrice - symTickSize * 3, symbol);
              const slTriggerPrice = this.roundTick(state.stopLossPrice, symbol);
              state.slOrderId = await this.placeOrder(state, {
                symbol,
                exchange,
                product: state.config.product ?? 'MIS',
                qty: state.executedQty,
                side: exitSide,
                orderType: 'SL',
                price: slLimitPrice,
                triggerPrice: slTriggerPrice,
                intent: 'PROTECTIVE'
              }).catch((e: any) => { this.log(state, `❌ SL Failed: ${e.message}`); return null; });
              if (state.slOrderId) {
                this.log(state, `🛡 Armed SL order (${state.slOrderId}) for ${state.executedQty} shares @ Trigger ₹${slTriggerPrice.toFixed(2)}`);
              }
            }

            // Sync broker Target order quantity (Fixed Target / Exact Target mode)
            if (state.config.enableProfitFloor === false || state.config.exitExactAtTarget) {
              if (state.targetOrderId) {
                try {
                  await kite.modifyOrder('regular', state.targetOrderId, { quantity: state.executedQty });
                  this.log(state, `🔄 Modified broker Target order (${state.targetOrderId}) quantity to ${state.executedQty} shares`);
                } catch (tgtModErr: any) {
                  this.log(state, `⚠ Failed to modify Target order qty: ${tgtModErr.message}`);
                }
              } else if (state.targetPrice) {
                const tgtPrice = this.roundTick(state.targetPrice, symbol);
                state.targetOrderId = await this.placeOrder(state, {
                  symbol,
                  exchange,
                  product: state.config.product ?? 'MIS',
                  qty: state.executedQty,
                  side: exitSide,
                  orderType: 'LIMIT',
                  price: tgtPrice,
                  intent: 'EXIT'
                }).catch((e: any) => { this.log(state, `❌ Target Failed: ${e.message}`); return null; });
                if (state.targetOrderId) {
                  this.log(state, `🎯 Broker LIMIT Target Armed (${state.executedQty} shares @ ₹${tgtPrice.toFixed(2)}) | OrderId: ${state.targetOrderId}`);
                }
              }
            }
          }

          // Timeout check: If entry order is >15s old and still OPEN / partial, cancel remainder
          const orderAgeMs = Date.now() - (state.setupTimestamp || 0);
          if (orderAgeMs > 15000 && (status === 'OPEN' || status === 'TRIGGER PENDING')) {
            if (filled === 0) {
              this.log(state, `⏳ Entry order ${state.entryOrderId} unfilled after 15s timeout. Cancelling order...`);
              await this.cancelBrokerOrderSafe(client, state.entryOrderId);
              state.entryTriggered = null;
              state.entryOrderId = null;
              return;
            } else {
              this.log(state, `⏳ Cancelling remaining unfilled entry quantity (${state.config.qty - filled} shares) after 15s timeout. Active position locked at ${filled} shares.`);
              await this.cancelBrokerOrderSafe(client, state.entryOrderId);
            }
          }
        }
      } catch (err: any) {
        this.log(state, `⚠ Entry order fill sync notice: ${err.message}`);
      }
    }

    // ── 1. 3:05 PM Mandatory EOD Cutoff ──────────────────────────────────────
    const currentHhmm = this.getIstHhmm(new Date());
    if (currentHhmm >= 15 * 60 + 5 && state.entryTriggered) {
      let exitPrice = state.currentLtp || state.entryPrice || 0;
      try {
        const ltpData = await kite.getLTP([key]);
        if (ltpData[key]?.last_price) exitPrice = ltpData[key].last_price;
      } catch { }

      const isLong = (state.config.isOptionBuyingOnly && state.optionSymbol) || state.entryTriggered === 'LONG';
      const activeQty = state.executedQty || state.config.qty;
      const finalPnl = (isLong ? (exitPrice - state.entryPrice!) : (state.entryPrice! - exitPrice)) * activeQty;

      this.log(state, `⏰ 3:05 PM Mandatory Intraday EOD Cutoff reached! Auto-squaring off position (Current P&L: ₹${finalPnl.toFixed(2)}) to avoid Zerodha RMS charges...`);
      this.stopRealtimeMonitor(state);
      await this.exitPosition(state, client, exitPrice, 'FORCE_CLOSE');
      await this.persistLogs(state);
      return;
    }

    // ── 2. Fresh LTP Resolution (API fallback if WebSocket has no tick in >3.5s) ──
    const isWebSocketStale = !state.lastTickTime || (Date.now() - state.lastTickTime > 3500);
    let currentPrice = state.currentLtp;

    if (isWebSocketStale || !currentPrice) {
      try {
        const ltpData = await kite.getLTP([key]);
        if (ltpData[key]?.last_price) {
          currentPrice = ltpData[key].last_price;
          state.currentLtp = currentPrice;
          state.lastTickTime = Date.now();
        }
      } catch (e) {
        this.log(state, `⚠ LTP API check notice for ${symbol}: ${e.message}`);
      }
    }

    if (!currentPrice) {
      this.log(state, `⏳ Waiting for live price tick for ${symbol}...`);
      return;
    }

    const isOptionTrade = !!(state.config.isOptionBuyingOnly && state.optionSymbol);
    const isLong = isOptionTrade || state.entryTriggered === 'LONG';
    const activeQty = state.executedQty || state.config.qty;
    const pnlPoints = isLong ? (currentPrice - state.entryPrice!) : (state.entryPrice! - currentPrice);
    const pnlRs = pnlPoints * activeQty;
    const pnlPct = state.entryPrice ? (pnlPoints / state.entryPrice) * 100 : 0;

    state.currentPnlRs = pnlRs;
    state.currentPnlPct = pnlPct;
    state.peakPnlRs = Math.max(state.peakPnlRs || 0, pnlRs);

    const targetThresholdRs = state.config.targetRs || 500;
    const isTarget1Reached = isLong ? (currentPrice >= state.targetPrice!) : (currentPrice <= state.targetPrice!);
    const isTrailingEnabled = state.config.enableProfitFloor !== false && !state.config.exitExactAtTarget;

    // Periodic fallback P&L logging (only if real-time websocket monitor isn't running)
    const nowMs = Date.now();
    if (!state.realtimeActive && (nowMs - (state.lastPnlLogTime || 0) >= 60000)) {
      state.lastPnlLogTime = nowMs;
      const sign = pnlRs >= 0 ? '+' : '';
      const pctSign = pnlPct >= 0 ? '+' : '';
      this.log(state, `📊 [LIVE P&L] ${symbol}: ₹${currentPrice.toFixed(2)} | Entry: ₹${state.entryPrice!.toFixed(2)} | SL: ₹${state.stopLossPrice!.toFixed(2)} | Tgt: ₹${state.targetPrice!.toFixed(2)} | P&L: ${sign}₹${pnlRs.toFixed(2)} (${pctSign}${pnlPct.toFixed(2)}%) | Executed Qty: ${activeQty} | Peak: +₹${state.peakPnlRs.toFixed(2)}${state.isTrailingEma ? ' (15-EMA Trailing Active)' : ''}`);
    }

    // ── Exact Target / Stop Loss Exit & Hybrid Trailing (Fallback Polling Monitor) ──
    const exactTargetRs = state.config.targetRs && state.config.targetRs > 0 ? state.config.targetRs : 500;
    const exactStopLossRs = state.config.stopLossRs && state.config.stopLossRs > 0 ? state.config.stopLossRs : 500;

    if (state.config.exitExactAtTarget) {
      if (pnlRs >= exactTargetRs) {
        this.log(state, `🎯 [EXACT TARGET EXIT - MONITOR] Target profit (+₹${pnlRs.toFixed(2)} >= ₹${exactTargetRs}) reached! Squaring off position.`);
        if (state.slOrderId) await this.cancelBrokerOrderSafe(client, state.slOrderId);
        if (state.targetOrderId) await this.cancelBrokerOrderSafe(client, state.targetOrderId);
        await this.exitPosition(state, client, currentPrice, 'TARGET');
        await this.persistLogs(state);
        return;
      }
      if (pnlRs <= -exactStopLossRs) {
        this.log(state, `🛑 [EXACT STOP LOSS EXIT - MONITOR] Stop loss (-₹${Math.abs(pnlRs).toFixed(2)} <= -₹${exactStopLossRs}) hit! Squaring off position.`);
        if (state.slOrderId) await this.cancelBrokerOrderSafe(client, state.slOrderId);
        if (state.targetOrderId) await this.cancelBrokerOrderSafe(client, state.targetOrderId);
        await this.exitPosition(state, client, currentPrice, 'SL');
        await this.persistLogs(state);
        return;
      }

      // Dynamic Break-Even Protection (at 50% target)
      if (state.entryPrice && state.peakPnlRs >= exactTargetRs * 0.48) {
        const symTick = getInstrumentTickSize(symbol, currentPrice);
        const breakEvenPrice = this.roundTick(isLong ? state.entryPrice + symTick * 2 : state.entryPrice - symTick * 2, symbol);
        const needsSlAdvance = isLong ? (breakEvenPrice > (state.stopLossPrice || 0)) : (breakEvenPrice < (state.stopLossPrice || Infinity));
        if (needsSlAdvance) {
          state.stopLossPrice = breakEvenPrice;
          state.isTrailingEma = true;
          this.log(state, `🛡 [BREAK-EVEN PROFIT PROTECTION] Advancing SL to Break-Even (₹${breakEvenPrice.toFixed(2)}) to lock out risk.`);
          await this.updateBrokerSlSafe(client, kite, state, symbol);
        }

        // Option B: Hybrid 15-EMA & VWAP Trailing with 0.30% Noise Buffer
        const isHybridEnabled = (state.config as any).enableHybridTrailing !== false;
        if (isHybridEnabled && state.lastEma && !isOptionTrade) {
          const emaBuffer = state.lastEma * 0.0030;
          const bufferedEma = isLong ? (state.lastEma - emaBuffer) : (state.lastEma + emaBuffer);
          let trendSupport = bufferedEma;
          if (state.lastVwap && state.lastVwap > 0) {
            trendSupport = isLong ? Math.min(bufferedEma, state.lastVwap) : Math.max(bufferedEma, state.lastVwap);
          }
          const isTrailBeyondBreakEven = isLong ? (trendSupport > breakEvenPrice) : (trendSupport < breakEvenPrice);
          if (isTrailBeyondBreakEven) {
            const roundedTrailSl = this.roundTick(trendSupport, symbol);
            const isBetterSl = isLong ? (roundedTrailSl > (state.stopLossPrice || 0)) : (roundedTrailSl < (state.stopLossPrice || Infinity));
            if (isBetterSl) {
              state.stopLossPrice = roundedTrailSl;
              state.isTrailingEma = true;
              const lockedProfitRs = (isLong ? (roundedTrailSl - state.entryPrice) : (state.entryPrice - roundedTrailSl)) * activeQty;
              this.log(state, `📈 [HYBRID 15-EMA/VWAP TRAIL] Dynamic trend support advanced to ₹${roundedTrailSl.toFixed(2)} (in profit with 0.30% noise buffer)! Trailing broker SL to lock +₹${lockedProfitRs.toFixed(2)} gain.`);
              await this.updateBrokerSlSafe(client, kite, state, symbol);
            }
          }
        }
      }
    }

    // ── Intraday Multi-Stage Profit Ratchet & Breakeven Protection ───────────
    // ── Uncapped Trend Rider: 15-EMA & VWAP Dynamic Trailing ─────────────────
    const entryPrice = state.entryPrice || currentPrice;
    const moveFromEntryPct = entryPrice > 0 ? (isLong ? (currentPrice - entryPrice) / entryPrice : (entryPrice - currentPrice) / entryPrice) * 100 : 0;

    // Check Target 1 / Dynamic VWAP & EMA Trailing
    if ((pnlRs >= targetThresholdRs || isTarget1Reached) && !state.isTrailingEma && isTrailingEnabled) {
      state.isTrailingEma = true;
      this.log(state, `📈 Target 1 reached (Target: ₹${state.targetPrice?.toFixed(2)}, P&L: ₹${pnlRs.toFixed(2)})! Activated Dynamic VWAP & 15-EMA Trailing SL — riding trend...`);
      if (state.targetOrderId && !state.isPaperTrade) {
        await this.cancelBrokerOrderSafe(client, state.targetOrderId);
        state.targetOrderId = null;
      }
    }

    if (state.isTrailingEma && !isOptionTrade) {
      let dynamicTrailingSl: number | null = null;
      if (state.lastEma && state.lastVwap) {
        dynamicTrailingSl = isLong ? Math.max(state.lastEma, state.lastVwap) : Math.min(state.lastEma, state.lastVwap);
      } else if (state.lastEma) {
        dynamicTrailingSl = state.lastEma;
      } else if (state.lastVwap) {
        dynamicTrailingSl = state.lastVwap;
      }

      if (dynamicTrailingSl !== null) {
        const roundedSl = this.roundTick(dynamicTrailingSl, symbol);
        const isBetterSl = isLong ? (roundedSl > (state.stopLossPrice || 0)) : (roundedSl < (state.stopLossPrice || Infinity));
        if (isBetterSl) {
          state.stopLossPrice = roundedSl;
          // Synchronize trailing SL order to Zerodha exchange so profits are protected even during power cuts!
          await this.updateBrokerSlSafe(client, kite, state, symbol);
        }

        const isCrossed = isLong ? (currentPrice < roundedSl) : (currentPrice > roundedSl);
        if (isCrossed) {
          this.log(state, `📈 Price crossed Trailing SL line @ ₹${currentPrice.toFixed(2)} (Trailing Level: ₹${roundedSl.toFixed(2)}) | Realized P&L: ₹${pnlRs.toFixed(2)}`);
          await this.exitPosition(state, client, currentPrice, 'TARGET');
          await this.persistLogs(state);
          return;
        }
      }
    } else {
      const isHitSL = isLong ? (currentPrice <= state.stopLossPrice!) : (currentPrice >= state.stopLossPrice!);
      if (isHitSL) {
        this.log(state, `🛑 Stop Loss Hit at ₹${currentPrice.toFixed(2)} | Final P&L: ₹${pnlRs.toFixed(2)}`);
        await this.exitPosition(state, client, currentPrice, 'SL');
        await this.persistLogs(state);
        return;
      } else if (!isTrailingEnabled && isTarget1Reached) {
        this.log(state, `🎯 Fixed Target Hit at ₹${currentPrice.toFixed(2)} | Final P&L: ₹${pnlRs.toFixed(2)}`);
        await this.exitPosition(state, client, currentPrice, 'TARGET');
        await this.persistLogs(state);
        return;
      }
    }

    // Live order check at broker
    if (!state.isPaperTrade) {
      try {
        const orders = await kite.getOrders();
        const slOrder = orders.find((o: any) => o.order_id === state.slOrderId);
        const targetOrder = orders.find((o: any) => o.order_id === state.targetOrderId);

        if (slOrder && slOrder.status === 'COMPLETE') {
          const avgPrice = Number(slOrder.average_price) || state.stopLossPrice!;
          this.log(state, `🛑 Stop Loss Order filled at ₹${avgPrice.toFixed(2)}`);
          if (state.targetOrderId) await client.cancelOrder(state.targetOrderId).catch(() => { });
          await this.exitPosition(state, client, avgPrice, 'SL');
          await this.persistLogs(state);
        } else if (targetOrder && targetOrder.status === 'COMPLETE') {
          const avgPrice = Number(targetOrder.average_price) || state.targetPrice!;
          this.log(state, `🎯 Target Order filled at ₹${avgPrice.toFixed(2)}`);
          if (state.slOrderId) await client.cancelOrder(state.slOrderId).catch(() => { });
          await this.exitPosition(state, client, avgPrice, 'TARGET');
          await this.persistLogs(state);
        } else if (slOrder && (slOrder.status === 'REJECTED' || slOrder.status === 'CANCELLED')) {
          this.log(state, `⚠ Stop Loss order was ${slOrder.status}! Checking position status.`);
          if (state.targetOrderId) await client.cancelOrder(state.targetOrderId).catch(() => { });
          await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
          await this.persistLogs(state);
        }
      } catch (e) {
        this.log(state, `⚠ Position monitor order status check notice: ${e.message}`);
      }
    }
  }

  private async exitPosition(state: StrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET' | 'FORCE_CLOSE') {
    if (state.isExiting) {
      this.log(state, `ℹ Exit already in progress for ${state.activeSymbol || state.config.symbol}. Ignoring duplicate exit call (${reason}).`);
      return;
    }
    state.isExiting = true;

    const { config } = state;
    const symbol = state.optionSymbol || state.activeSymbol || config.symbol;
    const exchange = state.optionSymbol ? 'NFO' : (state.futureSymbol ? state.futureExchange : config.exchange);
    const cachedEntryPrice = state.entryPrice || exitPrice;
    const cachedEntryTriggered = state.entryTriggered;
    const isLong = (config.isOptionBuyingOnly && state.optionSymbol) || cachedEntryTriggered === 'LONG';
    const exitSide = (config.isOptionBuyingOnly && state.optionSymbol) ? 'SELL' : (cachedEntryTriggered === 'LONG' ? 'SELL' : 'BUY');
    const qty = state.executedQty || config.qty;

    // Stop WebSocket monitoring before exit
    this.stopRealtimeMonitor(state);

    try {
      let exitOrderId = '';
      let exitOrderType: 'MARKET' | 'LIMIT' | 'SL' = 'MARKET';
      let actualExitPrice = exitPrice;
      if (state.isPaperTrade) {
        exitOrderId = `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`;
      } else {
        const kite = client['kite'];
        let isAlreadyFilledAtBroker = false;
        let brokerFilledQty = 0;

        // Check if SL or Target already executed at broker
        if (kite && (state.slOrderId || state.targetOrderId)) {
          try {
            const orders = await kite.getOrders();
            const slOrder = orders.find((o: any) => o.order_id === state.slOrderId);
            const targetOrder = orders.find((o: any) => o.order_id === state.targetOrderId);

            if (reason === 'SL' && (slOrder?.status === 'COMPLETE' || Number(slOrder?.filled_quantity) > 0)) {
              const slFilled = Number(slOrder.filled_quantity) || 0;
              if (slOrder.average_price && Number(slOrder.average_price) > 0) {
                actualExitPrice = Number(slOrder.average_price);
              }
              exitOrderId = state.slOrderId!;
              exitOrderType = 'SL';
              await this.cancelBrokerOrderSafe(client, state.targetOrderId);

              if (slFilled >= qty) {
                isAlreadyFilledAtBroker = true;
                const isLong = (state.config.isOptionBuyingOnly && state.optionSymbol) || state.entryTriggered === 'LONG';
                const realizedPnl = (isLong ? (actualExitPrice - (state.entryPrice || 0)) : ((state.entryPrice || 0) - actualExitPrice)) * qty;
                const slippage = actualExitPrice - exitPrice;
                this.log(state, `🛑 Confirmed Broker SL Order executed: ${exitOrderId} @ ₹${actualExitPrice.toFixed(2)} | Realized P&L: ₹${realizedPnl.toFixed(2)}${slippage !== 0 ? ` (Execution Slippage: ${slippage > 0 ? '+' : ''}₹${slippage.toFixed(2)}/sh)` : ''}`);
              } else {
                brokerFilledQty = slFilled;
                this.log(state, `⚠ Broker SL Order (${exitOrderId}) only filled ${slFilled}/${qty} shares @ Avg ₹${actualExitPrice.toFixed(2)}. Remaining ${qty - slFilled} shares will be squared off at market!`);
              }
            } else if (reason === 'TARGET' && (targetOrder?.status === 'COMPLETE' || Number(targetOrder?.filled_quantity) > 0)) {
              const tgtFilled = Number(targetOrder.filled_quantity) || 0;
              if (targetOrder.average_price && Number(targetOrder.average_price) > 0) {
                actualExitPrice = Number(targetOrder.average_price);
              }
              exitOrderId = state.targetOrderId!;
              exitOrderType = 'LIMIT';
              await this.cancelBrokerOrderSafe(client, state.slOrderId);

              if (tgtFilled >= qty) {
                isAlreadyFilledAtBroker = true;
                const isLong = (state.config.isOptionBuyingOnly && state.optionSymbol) || state.entryTriggered === 'LONG';
                const realizedPnl = (isLong ? (actualExitPrice - (state.entryPrice || 0)) : ((state.entryPrice || 0) - actualExitPrice)) * qty;
                this.log(state, `🎯 Confirmed Broker Target Order executed: ${exitOrderId} @ ₹${actualExitPrice.toFixed(2)} | Realized P&L: ₹${realizedPnl.toFixed(2)}`);
              } else {
                brokerFilledQty = tgtFilled;
                this.log(state, `⚠ Broker Target Order (${exitOrderId}) only filled ${tgtFilled}/${qty} shares @ Avg ₹${actualExitPrice.toFixed(2)}. Remaining ${qty - tgtFilled} shares will be squared off at market!`);
              }
            }
          } catch (e: any) {
            this.log(state, `⚠ Order status verification notice: ${e.message}`);
          }
        }

        if (!isAlreadyFilledAtBroker) {
          // Cancel both pending SL and Target orders before placing guaranteed market exit
          await this.cancelBrokerOrderSafe(client, state.slOrderId);
          await this.cancelBrokerOrderSafe(client, state.targetOrderId);

          const remainingQtyToExit = Math.max(1, qty - brokerFilledQty);

          // Capital Wipeout Guard: Check if position is already closed or if exit order would reverse position
          let isManuallyClosed = false;
          let marketExitQty = remainingQtyToExit;
          try {
            const exitSafety = await isSafeToExit(kite, symbol, exitSide, this.logger);
            if (!exitSafety.safe) {
              isManuallyClosed = true;
              this.log(state, `ℹ [AUTO-SYNC] ${symbol} was already squared off on Zerodha (Broker Qty: ${exitSafety.brokerQty}). Skipping duplicate exit order to prevent unintended naked position.`);
            } else if (exitSafety.brokerQty && Math.abs(exitSafety.brokerQty) > 0) {
              // Strictly exit only what remains at the broker to prevent reversing position
              marketExitQty = Math.min(remainingQtyToExit, Math.abs(exitSafety.brokerQty));
            }
          } catch (posErr: any) {
            this.log(state, `⚠ Position sync check notice: ${posErr.message}`);
          }

          if (!isManuallyClosed && marketExitQty > 0) {
            try {
              exitOrderId = await this.placeOrder(state, {
                symbol,
                exchange,
                product: config.product ?? 'MIS',
                qty: marketExitQty,
                side: exitSide,
                orderType: 'MARKET',
                intent: 'EXIT'
              });
              exitOrderType = 'MARKET';
              this.log(state, `✅ Live Market Exit Order placed (${reason}) for ${marketExitQty} shares: ${exitOrderId}`);
            } catch (err: any) {
              this.log(state, `❌ Live Market Exit Order failed (${reason}): ${err.message}`);
            }
          }
        }

        // ── Fail-Safe Broker Position Flattener ──────────────────────
        // Ensure absolutely no leftover orphan shares remain open at Zerodha
        if (kite && kite.getPositions && !state.isPaperTrade) {
          try {
            await new Promise(r => setTimeout(r, 600)); // Allow exchange match to settle
            const finalPos = await getLiveBrokerPosition(kite, symbol, this.logger);
            if (finalPos.isOpen && finalPos.netQty !== 0) {
              const orphanSide = finalPos.netQty > 0 ? 'SELL' : 'BUY';
              const orphanQty = Math.abs(finalPos.netQty);
              this.log(state, `🚨 [FAIL-SAFE SAFETY NET] Detected ${orphanQty} orphaned shares still open at Zerodha! Executing emergency market square-off order to flatten position completely...`);
              const emergencyOrderId = await this.placeOrder(state, {
                symbol,
                exchange,
                product: config.product ?? 'MIS',
                qty: orphanQty,
                side: orphanSide,
                orderType: 'MARKET',
                intent: 'EXIT'
              }).catch((e: any) => {
                this.log(state, `❌ Emergency square-off failed: ${e.message}`);
                return null;
              });
              if (emergencyOrderId) {
                this.log(state, `🛡 Emergency square-off executed successfully (${orphanSide} ${orphanQty} shares): ${emergencyOrderId}`);
              }
            }
          } catch (guardErr: any) {
            this.logger.warn(`Fail-safe position zeroing check notice: ${guardErr.message}`);
          }
        }
      }

      await this.trackOrderInDB(state, exitSide, symbol, exchange, qty, actualExitPrice, exitOrderId, undefined, exitOrderType);

      let tradePnl = 0;
      if (cachedEntryPrice && cachedEntryPrice > 0 && actualExitPrice > 0 && cachedEntryTriggered) {
        tradePnl = (isLong ? (actualExitPrice - cachedEntryPrice) : (cachedEntryPrice - actualExitPrice)) * qty;
      }
      state.dailyRealizedPnlRs = (state.dailyRealizedPnlRs || 0) + tradePnl;

      // Cooldown symbol for at least 45 minutes to prevent rapid re-entry
      if (!state.cooldownSymbols) state.cooldownSymbols = new Map();
      state.cooldownSymbols.set(symbol, Date.now() + 45 * 60 * 1000);

      const targetThresholdRs = config.targetRs && config.targetRs > 0 ? config.targetRs : 500;
      const maxRiskRs = config.stopLossRs && config.stopLossRs > 0 ? config.stopLossRs : (targetThresholdRs * 1.5);

      let shouldStopStrategy = false;
      let stopReason = '';

      if (config.enableDailyPnLLock !== false) {
        if (state.dailyRealizedPnlRs >= targetThresholdRs) {
          state.dailyTargetLocked = true;
          shouldStopStrategy = true;
          stopReason = `🎯 Daily Profit Target Reached (+₹${state.dailyRealizedPnlRs.toFixed(2)})! 'One-and-Done' Rule Active — Trading safely locked for the day to protect profits.`;
          this.log(state, stopReason);
        } else if (state.dailyRealizedPnlRs <= -maxRiskRs) {
          state.dailyTargetLocked = true;
          shouldStopStrategy = true;
          stopReason = `🛑 Daily Max Loss Limit Reached (₹${state.dailyRealizedPnlRs.toFixed(2)})! 'One-and-Done' Rule Active — Trading safely locked for the day to preserve capital.`;
          this.log(state, stopReason);
        }
      }

      if (!shouldStopStrategy && state.tradesPlacedToday >= config.maxTradesPerDay) {
        shouldStopStrategy = true;
        stopReason = `⛔ Max daily trade cap (${config.maxTradesPerDay}) reached. Auto-stopping strategy for today.`;
        this.log(state, stopReason);
      }

      if (config.enableTrendReEntry !== false && !shouldStopStrategy && (state.reEntryCountToday || 0) < 1 && (reason === 'TARGET' || state.isTrailingEma)) {
        state.reEntryEligible = true;
        state.reEntrySwingPrice = state.currentLtp || actualExitPrice;
        this.log(state, `🔁 [RE-ENTRY ARMED] ${symbol} exited trend trail. If price reclaims 15-EMA and breaks swing high (₹${(state.reEntrySwingPrice || 0).toFixed(2)}) with VWAP support, Leg 2 Re-Entry will execute!`);
      }

      state.entryTriggered = null;
      state.optionSymbol = null;
      state.entryPrice = null;
      state.entryTime = null;
      state.stopLossPrice = null;
      state.spotStopLossPrice = null;
      state.targetPrice = null;
      state.slOrderId = null;
      state.targetOrderId = null;
      state.waitingForConfirmation = null;
      state.confirmationHigh = null;
      state.confirmationLow = null;
      state.invalidationPrice = null;
      state.setupTimestamp = null;
      state.setupType = undefined;
      state.peakPnlRs = 0;
      state.lockedProfitRs = 0;
      state.isTrailingEma = false;

      this.stopRealtimeMonitor(state);
      strategyEvents.emit('strategy.update', {
        strategyId: state.strategyId,
        logs: state.logs,
        state: this.getState(state.strategyId),
      });

      if (shouldStopStrategy) {
        await this.persistLogs(state);
        await this.stopWithStatus(state.strategyId, 'COMPLETED', stopReason);
      }
    } catch (e) {
      this.log(state, `❌ Exit execution failed: ${e.message}`);
    } finally {
      state.isExiting = false;
    }
  }

  private async exitPositionHistorical(state: StrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET', timestamp: Date) {
    const { config } = state;
    const symbol = state.optionSymbol || state.activeSymbol || config.symbol;
    const exchange = state.optionSymbol ? 'NFO' : (state.futureSymbol ? state.futureExchange : config.exchange);
    const exitSide = (config.isOptionBuyingOnly && state.optionSymbol) ? 'SELL' : (state.entryTriggered === 'LONG' ? 'SELL' : 'BUY');
    const qty = config.qty;

    // Stop WebSocket monitoring if active
    this.stopRealtimeMonitor(state);

    try {
      const exitOrderId = `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`;
      // Track exit order in DB (Historical catchup does not exhaust live trade cap)
      await this.trackOrderInDB(state, exitSide, symbol, exchange, qty, exitPrice, exitOrderId, timestamp);

      const cachedEntryPrice = state.entryPrice || exitPrice;
      const cachedEntryTriggered = state.entryTriggered;
      const isLong = (config.isOptionBuyingOnly && state.optionSymbol) || cachedEntryTriggered === 'LONG';
      let tradePnl = 0;
      if (cachedEntryPrice && cachedEntryPrice > 0 && exitPrice > 0 && cachedEntryTriggered) {
        tradePnl = (isLong ? (exitPrice - cachedEntryPrice) : (cachedEntryPrice - exitPrice)) * qty;
      }
      state.dailyRealizedPnlRs = (state.dailyRealizedPnlRs || 0) + tradePnl;

      const targetThresholdRs = config.targetRs && config.targetRs > 0 ? config.targetRs : 500;
      const maxRiskRs = config.stopLossRs && config.stopLossRs > 0 ? config.stopLossRs : (targetThresholdRs * 1.5);

      if (config.enableDailyPnLLock !== false) {
        if (state.dailyRealizedPnlRs >= targetThresholdRs) {
          state.dailyTargetLocked = true;
          this.log(state, `🎯 (Catch-up) Daily Profit Target Reached (+₹${state.dailyRealizedPnlRs.toFixed(2)})! 'One-and-Done' Rule Active — Trading locked for the day.`);
        } else if (state.dailyRealizedPnlRs <= -maxRiskRs) {
          state.dailyTargetLocked = true;
          this.log(state, `🛑 (Catch-up) Daily Max Loss Limit Reached (₹${state.dailyRealizedPnlRs.toFixed(2)})! 'One-and-Done' Rule Active — Trading locked for the day.`);
        }
      }

      state.entryTriggered = null;
      state.optionSymbol = null;
      state.entryPrice = null;
      state.stopLossPrice = null;
      state.spotStopLossPrice = null;
      state.targetPrice = null;
      state.slOrderId = null;
      state.targetOrderId = null;
      state.waitingForConfirmation = null;
      state.confirmationHigh = null;
      state.confirmationLow = null;
      state.invalidationPrice = null;
      state.setupTimestamp = null;
      state.setupType = undefined;
      state.peakPnlRs = 0;
      state.lockedProfitRs = 0;
      state.isTrailingEma = false;
    } catch (e) {
      this.log(state, `❌ Historical exit failed: ${e.message}`);
    }
  }

  private async trackOrderInDB(
    state: StrategyState,
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
        include: { strategy: true }
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
          productType: (state.config as any).product ?? 'MIS',
          qty,
          filledQty: qty,
          price,
          avgPrice: price,
          status: 'COMPLETE',
          brokerOrderId: orderId,
          isPaperTrade: state.isPaperTrade,
          ...(createdAt ? { createdAt } : {}),
        } as any
      });
    } catch (e) {
      this.logger.error(`Failed to track order in DB: ${e.message}`);
    }
  }

  private extractPdhPdlPdc(candles: Candle[], now: Date): {
    pdh: number | null;
    pdl: number | null;
    pdc: number | null;
    swingHigh5D: number | null;
    swingLow5D: number | null;
  } {
    if (!candles || candles.length === 0) return { pdh: null, pdl: null, pdc: null, swingHigh5D: null, swingLow5D: null };
    const todayStr = this.getIstDateStr(now);

    const dayMap = new Map<string, { high: number; low: number; close: number; dateStr: string }>();
    for (const c of candles) {
      const dStr = this.getIstDateStr(c.date);
      if (dStr === todayStr) continue; // Exclude today
      const existing = dayMap.get(dStr);
      if (!existing) {
        dayMap.set(dStr, { high: c.high, low: c.low, close: c.close, dateStr: dStr });
      } else {
        existing.high = Math.max(existing.high, c.high);
        existing.low = Math.min(existing.low, c.low);
        existing.close = c.close; // Latest close
      }
    }

    const pastDays = Array.from(dayMap.values());
    if (pastDays.length === 0) return { pdh: null, pdl: null, pdc: null, swingHigh5D: null, swingLow5D: null };

    pastDays.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    const prevDay = pastDays[pastDays.length - 1];

    const pdh = prevDay.high;
    const pdl = prevDay.low;
    const pdc = prevDay.close;

    const swingHigh5D = Math.max(...pastDays.map(d => d.high));
    const swingLow5D = Math.min(...pastDays.map(d => d.low));

    return { pdh, pdl, pdc, swingHigh5D, swingLow5D };
  }

  private calculateDynamicStockMetrics(candles: Candle[], now: Date): {
    dailyAtrPct: number;
    dynamicExhaustionPct: number;
    dynamicOpeningCapPct: number;
    dynamicExtensionPct: number;
    dynamicParabolicPct: number;
  } {
    if (!candles || candles.length === 0) {
      return { dailyAtrPct: 2.5, dynamicExhaustionPct: 5.5, dynamicOpeningCapPct: 2.0, dynamicExtensionPct: 8.5, dynamicParabolicPct: 2.5 };
    }
    const todayStr = this.getIstDateStr(now);
    const dayMap = new Map<string, { high: number; low: number; open: number }>();
    for (const c of candles) {
      const dStr = this.getIstDateStr(c.date);
      if (dStr === todayStr) continue;
      const existing = dayMap.get(dStr);
      if (!existing) {
        dayMap.set(dStr, { high: c.high, low: c.low, open: c.open });
      } else {
        existing.high = Math.max(existing.high, c.high);
        existing.low = Math.min(existing.low, c.low);
      }
    }
    const pastDays = Array.from(dayMap.values());
    let dailyAtrPct = 2.5;
    if (pastDays.length > 0) {
      const ranges = pastDays.map(d => d.open > 0 ? ((d.high - d.low) / d.open) * 100 : 0).filter(r => r > 0);
      if (ranges.length > 0) {
        dailyAtrPct = ranges.reduce((a, b) => a + b, 0) / ranges.length;
      }
    }
    dailyAtrPct = Math.max(1.2, Math.min(10.0, dailyAtrPct));

    const dynamicExhaustionPct = parseFloat(Math.max(3.0, Math.min(12.0, dailyAtrPct * 1.35)).toFixed(2));
    const dynamicOpeningCapPct = parseFloat(Math.max(1.2, Math.min(3.5, dailyAtrPct * 0.40)).toFixed(2));
    const dynamicExtensionPct = parseFloat(Math.max(4.5, Math.min(14.0, dailyAtrPct * 1.60)).toFixed(2));
    const dynamicParabolicPct = parseFloat(Math.max(1.8, Math.min(5.0, dailyAtrPct * 0.45)).toFixed(2));

    return { dailyAtrPct, dynamicExhaustionPct, dynamicOpeningCapPct, dynamicExtensionPct, dynamicParabolicPct };
  }

  private calculateLogicalTarget(
    candles: Candle[],
    entry: number,
    sl: number,
    side: 'BUY' | 'SELL',
    targetRs: number,
    symbol?: string,
    now: Date = new Date()
  ): {
    targetPrice: number;
    targetReason: string;
    fib1272: number;
    fib1618: number;
    pdh: number | null;
    pdl: number | null;
    pdc: number | null;
  } {
    const symTick = getInstrumentTickSize(symbol || '', entry);
    const risk = Math.max(symTick * 4, Math.abs(entry - sl));
    const { pdh, pdl, pdc, swingHigh5D, swingLow5D } = this.extractPdhPdlPdc(candles, now);

    const baseRange = Math.max(risk, entry * 0.008);

    if (side === 'BUY') {
      const fib1272 = this.roundTick(entry + baseRange * 1.272, symbol);
      const fib1618 = this.roundTick(entry + baseRange * 1.618, symbol);

      let targetPrice = fib1618;
      let targetReason = `Fibonacci 1.618 Golden Ratio Expansion`;

      if (pdc && pdc > entry && (pdc - entry) >= risk * 1.1) {
        const pdcTarget = this.roundTick(pdc * 0.9990, symbol);
        if (pdcTarget > entry) {
          targetPrice = pdcTarget;
          targetReason = `Previous Day Close (PDC: ₹${pdc.toFixed(2)}) Gap-Fill Magnet`;
        }
      } else if (pdh && pdh > entry && (pdh - entry) >= risk * 1.2) {
        const pdhTarget = this.roundTick(pdh * 0.9990, symbol);
        if (pdhTarget > entry) {
          targetPrice = pdhTarget;
          targetReason = `Previous Day High (PDH: ₹${pdh.toFixed(2)}) Resistance Shelf`;
        }
      } else {
        if (swingHigh5D && swingHigh5D > entry && (swingHigh5D - entry) >= risk * 1.3 && (swingHigh5D - entry) <= baseRange * 2.2) {
          targetPrice = this.roundTick(swingHigh5D * 0.9990, symbol);
          targetReason = `5-Day Swing High (₹${swingHigh5D.toFixed(2)}) Multi-Day S/R`;
        } else {
          targetPrice = fib1618;
          targetReason = `Fibonacci 1.618 Golden Ratio Expansion (+₹${(fib1618 - entry).toFixed(2)})`;
        }
      }

      const minTarget = this.roundTick(entry + risk * 1.2, symbol);
      if (targetPrice < minTarget) {
        targetPrice = minTarget;
        targetReason = `1:1.2 Minimum Structural R:R Target`;
      }

      return { targetPrice, targetReason, fib1272, fib1618, pdh, pdl, pdc };
    } else {
      const fib1272 = this.roundTick(entry - baseRange * 1.272, symbol);
      const fib1618 = this.roundTick(entry - baseRange * 1.618, symbol);

      let targetPrice = fib1618;
      let targetReason = `Fibonacci 1.618 Golden Ratio Expansion`;

      if (pdc && pdc < entry && (entry - pdc) >= risk * 1.1) {
        const pdcTarget = this.roundTick(pdc * 1.0010, symbol);
        if (pdcTarget < entry) {
          targetPrice = pdcTarget;
          targetReason = `Previous Day Close (PDC: ₹${pdc.toFixed(2)}) Gap-Fill Magnet`;
        }
      } else if (pdl && pdl < entry && (entry - pdl) >= risk * 1.2) {
        const pdlTarget = this.roundTick(pdl * 1.0010, symbol);
        if (pdlTarget < entry) {
          targetPrice = pdlTarget;
          targetReason = `Previous Day Low (PDL: ₹${pdl.toFixed(2)}) Support Floor`;
        }
      } else {
        if (swingLow5D && swingLow5D < entry && (entry - swingLow5D) >= risk * 1.3 && (entry - swingLow5D) <= baseRange * 2.2) {
          targetPrice = this.roundTick(swingLow5D * 1.0010, symbol);
          targetReason = `5-Day Swing Low (₹${swingLow5D.toFixed(2)}) Multi-Day S/R`;
        } else {
          targetPrice = fib1618;
          targetReason = `Fibonacci 1.618 Golden Ratio Expansion (-₹${(entry - fib1618).toFixed(2)})`;
        }
      }

      const minTarget = this.roundTick(entry - risk * 1.2, symbol);
      if (targetPrice > minTarget) {
        targetPrice = minTarget;
        targetReason = `1:1.2 Minimum Structural R:R Target`;
      }

      return { targetPrice, targetReason, fib1272, fib1618, pdh, pdl, pdc };
    }
  }

  private calculateEMA(candles: Candle[], period: number) {
    const emas: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period) return emas;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += candles[i].close;
    let prev = sum / period; emas[period - 1] = prev;
    const mult = 2 / (period + 1);
    for (let i = period; i < candles.length; i++) {
      const ema = (candles[i].close - prev) * mult + prev;
      emas[i] = ema; prev = ema;
    }
    return emas;
  }

  private getIstDateStr(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  }

  private formatCandleRange(d: Date, intervalMin: number = 5): string {
    const startStr = d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    const endDate = new Date(d.getTime() + intervalMin * 60 * 1000);
    const endStr = endDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    return `${startStr} - ${endStr}`;
  }

  private formatCandleCloseTime(d: Date, intervalMin: number = 5): string {
    const endDate = new Date(d.getTime() + intervalMin * 60 * 1000);
    return endDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  private filterClosedCandles(candles: Candle[], now: Date, intervalMin: number = 5): Candle[] {
    if (!candles || candles.length === 0) return [];
    const latestCandle = candles[candles.length - 1];
    const isClosed = (now.getTime() - latestCandle.date.getTime()) >= intervalMin * 60 * 1000;
    return isClosed ? candles : candles.slice(0, -1);
  }

  private calculateVWAP(candles: Candle[], vwapSource: 'close' | 'hlc3' = 'close') {
    const vwaps: (number | null)[] = new Array(candles.length).fill(null);
    let cpv = 0, cv = 0;
    let lastDateStr = '';
    for (let i = 0; i < candles.length; i++) {
      const dateStr = this.getIstDateStr(candles[i].date);
      if (dateStr !== lastDateStr) {
        // Reset VWAP accumulation at the start of each new day
        cpv = 0;
        cv = 0;
        lastDateStr = dateStr;
      }
      const price = vwapSource === 'close' ? candles[i].close : (candles[i].high + candles[i].low + candles[i].close) / 3;
      cpv += price * candles[i].volume;
      cv += candles[i].volume;
      vwaps[i] = cv === 0 ? candles[i].close : cpv / cv;
    }
    return vwaps;
  }

  private async fetchCandles(client: any, config: any, interval: string, now: Date, symbol?: string, exchange?: string): Promise<Candle[]> {
    const sym = symbol || config.symbol;
    const exch = exchange || config.exchange;
    const cacheKey = `${exch}:${sym}:${interval}`;
    const cached = this.candleCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.candles;
    }

    const istDateStr = this.getIstDateStr(now);
    const from = new Date(`${istDateStr}T09:15:00.000+05:30`);
    from.setDate(from.getDate() - 5); // Go back 5 days to ensure enough historical candles
    try {
      const fetchPromise = client.getHistoricalData(sym, exch, interval, from, now);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout fetching candles for ${sym} (${interval}) after 3500ms`)), 3500)
      );
      const data = await Promise.race([fetchPromise, timeoutPromise]) as any;
      const candles = (data || []).slice(-250).map((c: any) => ({ date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
      this.candleCache.set(cacheKey, { candles, expiresAt: Date.now() + 30_000 });
      return candles;
    } catch (err: any) {
      if (cached?.candles?.length) {
        this.logger.warn(`[CANDLE_FALLBACK] Failed to fetch fresh candles for ${sym}: ${err.message}. Using cached candles.`);
        return cached.candles;
      }
      throw err;
    }
  }

  private async getHistoricalOptionPrice(client: any, symbol: string, exchange: string, timestamp: Date): Promise<number | null> {
    try {
      const from = new Date(timestamp.getTime() - 10 * 60 * 1000);
      const to = new Date(timestamp.getTime() + 10 * 60 * 1000);
      const data = await client.getHistoricalData(symbol, exchange, '5minute', from, to);
      if (!data || data.length === 0) return null;

      const targetTimeMs = timestamp.getTime();
      const match = data.find((c: any) => new Date(c.date).getTime() === targetTimeMs);
      if (match) {
        return match.close;
      }

      let closest = data[0];
      let minDiff = Math.abs(new Date(closest.date).getTime() - targetTimeMs);
      for (const c of data) {
        const diff = Math.abs(new Date(c.date).getTime() - targetTimeMs);
        if (diff < minDiff) {
          minDiff = diff;
          closest = c;
        }
      }
      return closest.close;
    } catch (e) {
      this.logger.error(`Error getting historical option price for ${symbol} at ${timestamp.toISOString()}: ${e.message}`);
      return null;
    }
  }

  private async findOptionSymbol(client: any, state: StrategyState, spotPrice: number, type: 'CE' | 'PE', triggerTime?: Date): Promise<string | null> {
    const { config } = state;
    const upper = config.symbol.toUpperCase().trim();
    const isIndex = upper.includes('NIFTY') || upper.includes('BANKNIFTY') || upper.includes('FINNIFTY') || upper.includes('MIDCPNIFTY') || upper.includes('SENSEX');

    if (!isIndex) return null; // No options for stocks in EMA-VWAP

    let underlying: string;
    if (upper.includes('BANKNIFTY') || upper === 'BANKNIFTY') underlying = 'BANKNIFTY';
    else if (upper === 'NIFTY 50' || upper === 'NIFTY') underlying = 'NIFTY';
    else if (upper.includes('FINNIFTY')) underlying = 'FINNIFTY';
    else if (upper.includes('MIDCPNIFTY')) underlying = 'MIDCPNIFTY';
    else if (upper.includes('SENSEX')) underlying = 'SENSEX';
    else underlying = upper;

    const exchange = underlying === 'SENSEX' ? 'BFO' : 'NFO';
    const segment = underlying === 'SENSEX' ? 'BFO-OPT' : 'NFO-OPT';

    const instruments = await client.getInstruments(exchange);
    const options = instruments.filter((i: any) => i.name === underlying && i.instrument_type === type && i.segment === segment);
    if (options.length === 0) {
      this.log(state, `⚠ No ${type} options found for ${underlying}`);
      return null;
    }

    const todayStr = this.getIstDateStr(new Date());

    const getExpiryStr = (expiry: any): string => {
      if (!expiry) return '';
      const d = new Date(expiry);
      if (isNaN(d.getTime())) return '';
      return this.getIstDateStr(d);
    };

    const uniqueExpiries = Array.from(new Set(options.map((i: any) => getExpiryStr(i.expiry))))
      .filter(exp => exp !== '' && exp >= todayStr);

    const sortedExpiries = uniqueExpiries.sort();

    if (sortedExpiries.length === 0) {
      this.log(state, `❌ No future expiries found for ${underlying}.`);
      return null;
    }

    const nearestExpiry = sortedExpiries[0];

    const filteredOptions = options.filter((i: any) => getExpiryStr(i.expiry) === nearestExpiry);

    // ── Option 1: Premium range (batched LTP or historical candles) ────────────────────
    if (config.minPremium && config.maxPremium) {
      this.log(state, `🔍 Searching ${type} in premium range ₹${config.minPremium}-₹${config.maxPremium}...`);
      const step = (underlying === 'NIFTY' || underlying === 'FINNIFTY') ? 50 : underlying === 'MIDCPNIFTY' ? 25 : 100;
      const atm = Math.round(spotPrice / step) * step;
      const candidateStrikes = [atm, atm + step, atm - step, atm + 2 * step, atm - 2 * step, atm + 3 * step, atm - 3 * step, atm + 4 * step, atm - 4 * step];

      if (triggerTime) {
        for (const strike of candidateStrikes) {
          const opt = filteredOptions.find((i: any) => Number(i.strike) === strike);
          if (!opt) continue;

          const price = await this.getHistoricalOptionPrice(client, opt.tradingsymbol, exchange, triggerTime);
          if (price !== null && price >= config.minPremium && price <= config.maxPremium) {
            this.log(state, `🎯 Found ${opt.tradingsymbol} in premium range (historical check)`);
            return opt.tradingsymbol;
          }
        }
        this.log(state, `⚠ No option in range. Falling back to ATM.`);
      } else {
        const allSymbols = filteredOptions.map((i: any) => `${exchange}:${i.tradingsymbol}`);
        const quotes: Record<string, any> = {};
        for (let i = 0; i < allSymbols.length; i += 200) {
          try { Object.assign(quotes, await client.getLTP(allSymbols.slice(i, i + 200))); }
          catch (e) { this.log(state, `⚠ LTP batch failed: ${e.message}`); }
        }

        for (const strike of candidateStrikes) {
          const opt = filteredOptions.find((i: any) => Number(i.strike) === strike);
          if (!opt) continue;

          const ltp = quotes[`${exchange}:${opt.tradingsymbol}`]?.last_price;
          if (ltp && ltp >= config.minPremium && ltp <= config.maxPremium) {
            this.log(state, `🎯 Found ${opt.tradingsymbol} in premium range`);
            return opt.tradingsymbol;
          }
        }
        this.log(state, `⚠ No option in range. Falling back to ATM.`);
      }
    }

    // ── Option 2: ATM strike ─────────────────────────────────────────
    const step = (underlying === 'NIFTY' || underlying === 'FINNIFTY') ? 50 : underlying === 'MIDCPNIFTY' ? 25 : 100;
    const atm = Math.round(spotPrice / step) * step;
    const match = filteredOptions.find((i: any) => Number(i.strike) === atm);
    if (match) { this.log(state, `🎯 ATM Strike: ${match.tradingsymbol}`); return match.tradingsymbol; }

    // ── Option 3: Closest available strike (handles stocks & odd steps) ──────
    let closest: any = null, closestD = Infinity;
    for (const opt of filteredOptions) {
      const d = Math.abs(Number(opt.strike) - spotPrice);
      if (d < closestD) { closestD = d; closest = opt; }
    }
    if (closest) { this.log(state, `🎯 Closest strike: ${closest.tradingsymbol}`); return closest.tradingsymbol; }
    return null;
  }

  private getIstHhmm(date: Date): number {
    const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
    const istDate = new Date(utcMs + (330 * 60000));
    return istDate.getHours() * 60 + istDate.getMinutes();
  }

  private roundTick(p: number, symbol?: string): number {
    const tickSize = getInstrumentTickSize(symbol || '', p);
    return roundToInstrumentTick(p, tickSize);
  }

  private async checkInstantOpeningTrigger(state: StrategyState, client: any, kite: any, account: any, now: Date): Promise<boolean> {
    const hhmm = this.getIstHhmm(now);
    // Active between 09:15:30 and 09:19:00 (Allow 30s for opening ticks to settle before firing!)
    if (hhmm < 9 * 60 + 15 || hhmm > 9 * 60 + 19) return false;
    const currentSeconds = now.getSeconds();
    if (hhmm === 9 * 60 + 15 && currentSeconds < 30) return false;
    if (state.entryTriggered || state.waitingForConfirmation) return false;

    try {
      // 0. Query overall Market Sentiment (NIFTY 50 Direction)
      let marketBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      try {
        const n50 = await kite.getQuote(['NSE:NIFTY 50']).catch(() => null);
        const q = n50?.['NSE:NIFTY 50'];
        if (q?.last_price && q?.ohlc?.open) {
          const changeFromOpen = ((q.last_price - q.ohlc.open) / q.ohlc.open) * 100;
          if (changeFromOpen >= 0.08) marketBias = 'BULLISH';
          else if (changeFromOpen <= -0.08) marketBias = 'BEARISH';
        }
      } catch { }

      const excluded = new Set(state.cooldownSymbols?.keys() || []);
      const candidates = await getTopCandidateStocks(kite, state.config.targetRs, state.config.stopLossRs, this.logger, (state.config as any).maxCapital, 12, excluded, (state.config as any).minStockPrice || 30);
      if (candidates.length === 0) return false;

      // Sort candidates to align with Market Bias
      const prioritizedCandidates = candidates.slice(0, 8).sort((a, b) => {
        if (marketBias === 'BULLISH') {
          if (a.trend === 'LONG' && b.trend !== 'LONG') return -1;
          if (b.trend === 'LONG' && a.trend !== 'LONG') return 1;
        } else if (marketBias === 'BEARISH') {
          if (a.trend === 'SHORT' && b.trend !== 'SHORT') return -1;
          if (b.trend === 'SHORT' && a.trend !== 'SHORT') return 1;
        }
        return b.score - a.score;
      });

      for (const candidate of prioritizedCandidates) {
        const { open, high, low, ltp, changeFromOpenPct, symbol, exchange, qty, trend } = candidate;
        if (!open || !ltp || open <= 0) continue;

        const diffHighOpenPct = (high - open) / open;
        const diffOpenLowPct = (open - low) / open;

        // Bullish Open=Low Drive or Immediate Opening Surge
        const isBullishOpenDrive = (candidate.isOpenLow || diffOpenLowPct <= 0.0020) && (changeFromOpenPct >= 0.22);
        const isImmediateSurge = (changeFromOpenPct >= 0.38) && (ltp >= high * 0.998);

        // Bearish Open=High Drive or Immediate Opening Crash
        const isBearishOpenDrive = (candidate.isOpenHigh || diffHighOpenPct <= 0.0020) && (changeFromOpenPct <= -0.22);
        const isImmediateCrash = (changeFromOpenPct <= -0.38) && (ltp <= low * 1.002);

        // 1. If Candidate or Market is Bullish, evaluate BUY setup first!
        if ((trend === 'LONG' || marketBias === 'BULLISH') && (isBullishOpenDrive || isImmediateSurge) && marketBias !== 'BEARISH') {
          state.activeSymbol = symbol;
          state.config.exchange = exchange;
          state.config.qty = qty;
          const slPrice = Math.max(Math.min(low, open * 0.997), ltp * 0.988);
          const reason = isBullishOpenDrive ? `Open=Low Opening Drive Breakout` : `Immediate Opening Velocity Surge (+${changeFromOpenPct.toFixed(2)}%)`;
          this.log(state, `[${symbol}] 🚀 Instant 09:15 AM Bullish Opening Triggered! ${reason} (Market: ${marketBias}) | Open: ₹${open.toFixed(2)}, Low: ₹${low.toFixed(2)}, SL: ₹${slPrice.toFixed(2)} @ LTP ₹${ltp.toFixed(2)}`);
          await this.placeTrade(state, client, account, 'BUY', ltp, undefined, undefined, slPrice, high);
          return true;
        }

        // 2. If Candidate or Market is Bearish, evaluate SELL setup!
        if ((trend === 'SHORT' || marketBias === 'BEARISH') && (isBearishOpenDrive || isImmediateCrash) && marketBias !== 'BULLISH') {
          state.activeSymbol = symbol;
          state.config.exchange = exchange;
          state.config.qty = qty;
          const slPrice = Math.min(Math.max(high, open * 1.003), ltp * 1.012);
          const reason = isBearishOpenDrive ? `Open=High Opening Drive Breakdown` : `Immediate Opening Velocity Crash (${changeFromOpenPct.toFixed(2)}%)`;
          this.log(state, `[${symbol}] 🚀 Instant 09:15 AM Bearish Opening Triggered! ${reason} (Market: ${marketBias}) | Open: ₹${open.toFixed(2)}, High: ₹${high.toFixed(2)}, SL: ₹${slPrice.toFixed(2)} @ LTP ₹${ltp.toFixed(2)}`);
          await this.placeTrade(state, client, account, 'SELL', ltp, undefined, undefined, low, slPrice);
          return true;
        }

        // 3. Neutral Market: Trigger whichever side has confirmed structural drive
        if (isBullishOpenDrive || isImmediateSurge) {
          state.activeSymbol = symbol;
          state.config.exchange = exchange;
          state.config.qty = qty;
          const slPrice = Math.max(Math.min(low, open * 0.997), ltp * 0.988);
          const reason = isBullishOpenDrive ? `Open=Low Opening Drive Breakout` : `Immediate Opening Velocity Surge (+${changeFromOpenPct.toFixed(2)}%)`;
          this.log(state, `[${symbol}] 🚀 Instant 09:15 AM Bullish Opening Triggered! ${reason} | Open: ₹${open.toFixed(2)}, Low: ₹${low.toFixed(2)}, SL: ₹${slPrice.toFixed(2)} @ LTP ₹${ltp.toFixed(2)}`);
          await this.placeTrade(state, client, account, 'BUY', ltp, undefined, undefined, slPrice, high);
          return true;
        }

        if (isBearishOpenDrive || isImmediateCrash) {
          state.activeSymbol = symbol;
          state.config.exchange = exchange;
          state.config.qty = qty;
          const slPrice = Math.min(Math.max(high, open * 1.003), ltp * 1.012);
          const reason = isBearishOpenDrive ? `Open=High Opening Drive Breakdown` : `Immediate Opening Velocity Crash (${changeFromOpenPct.toFixed(2)}%)`;
          this.log(state, `[${symbol}] 🚀 Instant 09:15 AM Bearish Opening Triggered! ${reason} | Open: ₹${open.toFixed(2)}, High: ₹${high.toFixed(2)}, SL: ₹${slPrice.toFixed(2)} @ LTP ₹${ltp.toFixed(2)}`);
          await this.placeTrade(state, client, account, 'SELL', ltp, undefined, undefined, low, slPrice);
          return true;
        }
      }
    } catch (e: any) {
      this.logger.debug?.(`Instant opening trigger check error: ${e.message}`);
    }
    return false;
  }

  private evaluateStockSetup(
    candles: Candle[],
    emas: (number | null)[],
    vwaps: (number | null)[],
    now: Date,
    config: EmaVwapCrossoverConfig,
    symbol?: string
  ): {
    trend: 'LONG' | 'SHORT';
    setupType: 'DIRECT' | 'INSIDE_CANDLE' | 'OPEN_LOW_DRIVE' | 'OPEN_HIGH_DRIVE' | 'TREND_BREAKDOWN' | 'TREND_BREAKOUT' | 'PULLBACK_REJECTION';
    triggerHigh: number | null;
    triggerLow: number | null;
    slPrice: number;
    invalidationPrice: number;
    slNote: string;
    candleTime: Date;
    candleIdx: number;
    scoreBoost: number;
    description: string;
  } | null {
    if (!candles || candles.length < 2) return null;
    const todayStr = this.getIstDateStr(now);
    const lastIdx = candles.length - 1;
    const prevIdx = candles.length - 2;

    const currCandle = candles[lastIdx];
    const prevCandle = candles[prevIdx];
    const currEma = emas[lastIdx];
    const prevEma = emas[prevIdx];
    const currVwap = vwaps[lastIdx];
    const prevVwap = vwaps[prevIdx];

    if (currEma === null || prevEma === null || currVwap === null || prevVwap === null) return null;

    // Filter today's closed candles
    const todayCandles: { candle: Candle; idx: number }[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (this.getIstDateStr(candles[i].date) === todayStr) {
        todayCandles.push({ candle: candles[i], idx: i });
      }
    }
    if (todayCandles.length === 0) return null;

    const firstDayCandle = todayCandles[0].candle;
    const dayOpen = firstDayCandle.open;
    const dayHigh = Math.max(...todayCandles.map(tc => tc.candle.high));
    const dayLow = Math.min(...todayCandles.map(tc => tc.candle.low));
    const dayRangePct = dayOpen > 0 ? ((dayHigh - dayLow) / dayOpen) * 100 : 0;
    const moveFromOpenPct = dayOpen > 0 ? ((currCandle.close - dayOpen) / dayOpen) * 100 : 0;

    // Calculate Dynamic Stock Volatility & Adaptive Metrics from Zerodha multi-day candles
    const metrics = this.calculateDynamicStockMetrics(candles, now);
    const { pdh, pdl, pdc } = this.extractPdhPdlPdc(candles, now);

    // Calculate Dynamic Average Candle Range (ATR/ACR) over last 10 candles
    const recentCandles = candles.slice(Math.max(0, lastIdx - 9), lastIdx + 1);
    const avgCandleRangePct = recentCandles.reduce((sum, c) => sum + (((c.high - c.low) / (c.close || 1)) * 100), 0) / Math.max(1, recentCandles.length);
    // Dynamic max distance from 15-EMA scales with stock's recent volatility (0.75% to 2.20%)
    const dynamicMaxEmaDistPct = Math.max(0.75, Math.min(2.20, avgCandleRangePct * 1.8));

    // ── Structural Swing Shelf & Dynamic Breathing Space ────────────────────────
    // Look back at the last 3 to 6 candles of today's price action to find the genuine consolidation shelf/base
    const shelfLookback = Math.min(6, Math.max(3, todayCandles.length));
    const shelfCandles = todayCandles.slice(todayCandles.length - shelfLookback);
    const shelfLow = Math.min(...shelfCandles.map(tc => tc.candle.low));
    const shelfHigh = Math.max(...shelfCandles.map(tc => tc.candle.high));

    // Dynamic volatility buffer based on instrument tick size and ATR
    const targetSym = symbol || config.symbol;
    const symTick = getInstrumentTickSize(targetSym, currCandle.close);
    const volatilityBuffer = Math.max(symTick * 4, currCandle.close * (avgCandleRangePct * 0.01 * 0.35));
    // Intraday breathing boundaries: Min 0.85% (prevents noise stops), capped at 2.20% to accommodate true day low/mother low
    const minBreathingDist = Math.max(symTick * 8, currCandle.close * 0.0085);
    const maxBreathingDist = Math.max(symTick * 15, currCandle.close * 0.022);

    const getSwingShelfSl = (dir: 'LONG' | 'SHORT', candleExtreme: number): number => {
      if (dir === 'LONG') {
        // Anchor below the lower of the true day low, swing shelf low, or immediate candle low with buffer.
        // If the day's swing low (e.g. 1140 for DRREDDY) is within structural breathing boundary (<= 1.45%),
        // anchoring right below day low provides the most resilient invalidation level with zero noise stopouts!
        const trueSwingLow = (dayLow > 0 && (currCandle.close - dayLow) <= maxBreathingDist)
          ? Math.min(dayLow, shelfLow, candleExtreme)
          : Math.min(shelfLow, candleExtreme);
        const rawDistance = currCandle.close - (trueSwingLow - volatilityBuffer);
        const slDistance = Math.min(maxBreathingDist, Math.max(minBreathingDist, rawDistance));
        return this.roundTick(currCandle.close - slDistance, targetSym);
      } else {
        // Anchor above the higher of the true day high, swing shelf high, or immediate candle high with buffer
        const trueSwingHigh = (dayHigh > 0 && (dayHigh - currCandle.close) <= maxBreathingDist)
          ? Math.max(dayHigh, shelfHigh, candleExtreme)
          : Math.max(shelfHigh, candleExtreme);
        const rawDistance = (trueSwingHigh + volatilityBuffer) - currCandle.close;
        const slDistance = Math.min(maxBreathingDist, Math.max(minBreathingDist, rawDistance));
        return this.roundTick(currCandle.close + slDistance, targetSym);
      }
    };

    // ── 1. Pattern 1 (TOP PRIORITY): Fresh 5m EMA-VWAP Crossover (The IFCI Trade Setup) ──
    // Enters when price/15-EMA cleanly crosses and confirms across VWAP with tight structural SL
    const crossoverDetails = this.getLatestCrossoverTodayDetails(lastIdx, candles, emas, vwaps);
    if (crossoverDetails && (lastIdx - crossoverDetails.crossoverIdx) <= 2) {
      const cCandle = candles[crossoverDetails.crossoverIdx];
      const isLong = crossoverDetails.trend === 'LONG';
      const slPrice = getSwingShelfSl(crossoverDetails.trend, isLong ? cCandle.low : cCandle.high);
      return {
        trend: crossoverDetails.trend,
        setupType: 'DIRECT',
        triggerHigh: isLong ? cCandle.high : null,
        triggerLow: isLong ? null : cCandle.low,
        slPrice,
        invalidationPrice: slPrice,
        slNote: 'Swing Shelf Crossover SL',
        candleTime: cCandle.date,
        candleIdx: crossoverDetails.crossoverIdx,
        scoreBoost: 500, // Top priority: highest precision setup
        description: `Fresh 5m 15-EMA / VWAP ${crossoverDetails.trend} Crossover Confirmation`
      };
    }

    // ── 2. Pattern 2 (TOP PRIORITY AT OPEN): Opening 5M Range & VWAP Breakdown / Breakout (The 09:20 Candle Setup) ──
    // Triggers at 09:25 AM (closing of the 09:20 candle) when price breaks the opening 5m candle range
    // and closes firmly across both VWAP & 15-EMA (e.g. OFSS morning waterfall breakdown).
    if (todayCandles.length >= 2 && todayCandles.length <= 8) {
      const orh = firstDayCandle.high;
      const orl = firstDayCandle.low;

      // Opening Range Breakdown (Bearish)
      if (currCandle.close < currCandle.open && currCandle.close <= currVwap && currCandle.close <= currEma) {
        const brokeOpeningLow = currCandle.low <= orl * 1.002 || currCandle.close < orl;
        const rejectedFromHigh = dayHigh > 0 && ((dayHigh - currCandle.close) / dayHigh) >= 0.015;
        const distFromEmaPct = ((currEma - currCandle.close) / currCandle.close) * 100;
        const notOverExtended = distFromEmaPct <= Math.max(4.0, dynamicMaxEmaDistPct * 2.0) && Math.abs(moveFromOpenPct) <= metrics.dynamicExtensionPct;

        if ((brokeOpeningLow || rejectedFromHigh) && notOverExtended) {
          const tightSl = getSwingShelfSl('SHORT', Math.max(currCandle.high, currVwap));
          return {
            trend: 'SHORT',
            setupType: 'OPEN_HIGH_DRIVE',
            triggerHigh: null,
            triggerLow: currCandle.low,
            slPrice: tightSl,
            invalidationPrice: tightSl,
            slNote: 'Opening Range Breakdown High SL',
            candleTime: currCandle.date,
            candleIdx: lastIdx,
            scoreBoost: 520, // Top priority: early session leader setup
            description: `Opening 5m Range & VWAP Breakdown below ₹${currCandle.low.toFixed(2)} (ORH: ₹${orh.toFixed(2)}, ORL: ₹${orl.toFixed(2)})`
          };
        }
      }

      // Opening Range Breakout (Bullish)
      if (currCandle.close > currCandle.open && currCandle.close >= currVwap && currCandle.close >= currEma) {
        const brokeOpeningHigh = currCandle.high >= orh * 0.998 || currCandle.close > orh;
        const bouncedFromLow = dayLow > 0 && ((currCandle.close - dayLow) / dayLow) >= 0.015;
        const distFromEmaPct = ((currCandle.close - currEma) / currCandle.close) * 100;
        const notOverExtended = distFromEmaPct <= Math.max(4.0, dynamicMaxEmaDistPct * 2.0) && moveFromOpenPct <= metrics.dynamicExtensionPct;

        if ((brokeOpeningHigh || bouncedFromLow) && notOverExtended) {
          const tightSl = getSwingShelfSl('LONG', Math.min(currCandle.low, currVwap));
          return {
            trend: 'LONG',
            setupType: 'OPEN_LOW_DRIVE',
            triggerHigh: currCandle.high,
            triggerLow: null,
            slPrice: tightSl,
            invalidationPrice: tightSl,
            slNote: 'Opening Range Breakout Low SL',
            candleTime: currCandle.date,
            candleIdx: lastIdx,
            scoreBoost: 520, // Top priority: early session leader setup
            description: `Opening 5m Range & VWAP Breakout above ₹${currCandle.high.toFixed(2)} (ORH: ₹${orh.toFixed(2)}, ORL: ₹${orl.toFixed(2)})`
          };
        }
      }
    }

    // ── 3. Pattern 3 (TOP PRIORITY): VWAP / 15-EMA Pullback Rejection (Best Systematic Entry with Tight SL) ──
    const isDowntrend = currCandle.close <= currVwap && currCandle.close <= currEma;
    const isUptrend = currCandle.close >= currVwap && currCandle.close >= currEma;

    if (isDowntrend && todayCandles.length >= 3) {
      const touchedEma = prevCandle.high >= prevEma * 0.998 || currCandle.high >= currEma * 0.998;
      const isBearishRejection = currCandle.close < currCandle.open && currCandle.close < currEma;
      if (touchedEma && isBearishRejection) {
        const tightSl = getSwingShelfSl('SHORT', currCandle.high);
        return {
          trend: 'SHORT',
          setupType: 'PULLBACK_REJECTION',
          triggerHigh: null,
          triggerLow: currCandle.low,
          slPrice: tightSl,
          invalidationPrice: tightSl,
          slNote: 'Swing Shelf Pullback High SL',
          candleTime: currCandle.date,
          candleIdx: lastIdx,
          scoreBoost: 450, // Top priority: highest win-rate entry
          description: `High-Probability 15-EMA Pullback Rejection below ₹${currCandle.low.toFixed(2)} (SL: ₹${tightSl.toFixed(2)})`
        };
      }
    }

    if (isUptrend && todayCandles.length >= 3) {
      const touchedEma = prevCandle.low <= prevEma * 1.002 || currCandle.low <= currEma * 1.002;
      const isBullishBounce = currCandle.close > currCandle.open && currCandle.close > currEma;
      if (touchedEma && isBullishBounce) {
        const tightSl = getSwingShelfSl('LONG', currCandle.low);
        return {
          trend: 'LONG',
          setupType: 'PULLBACK_REJECTION',
          triggerHigh: currCandle.high,
          triggerLow: null,
          slPrice: tightSl,
          invalidationPrice: tightSl,
          slNote: 'Swing Shelf Pullback Low SL',
          candleTime: currCandle.date,
          candleIdx: lastIdx,
          scoreBoost: 450, // Top priority: highest win-rate entry
          description: `High-Probability 15-EMA Pullback Bounce above ₹${currCandle.high.toFixed(2)} (SL: ₹${tightSl.toFixed(2)})`
        };
      }
    }

    // ── Helper: Measure consecutive expanding candles without pullback to 15-EMA ──
    const getConsecutiveCandlesCount = (dir: 'LONG' | 'SHORT'): number => {
      let count = 0;
      for (let i = todayCandles.length - 1; i >= 0; i--) {
        const c = todayCandles[i].candle;
        const cEma = emas[todayCandles[i].idx];
        if (dir === 'LONG') {
          const isBullish = c.close >= c.open;
          const touchedEma = cEma !== null && c.low <= cEma * 1.002;
          if (touchedEma && count > 0) break;
          if (isBullish) count++;
          else break;
        } else {
          const isBearish = c.close <= c.open;
          const touchedEma = cEma !== null && c.high >= cEma * 0.998;
          if (touchedEma && count > 0) break;
          if (isBearish) count++;
          else break;
        }
      }
      return count;
    };

    // Volume baseline for breakout confirmation
    const totalTodayVol = todayCandles.reduce((s, tc) => s + (tc.candle.volume || 0), 0);
    const avgTodayVol = totalTodayVol / Math.max(1, todayCandles.length);
    const hasVolumeSurge = (currCandle.volume || 0) >= avgTodayVol * 1.15;

    // ── 3. Pattern 3: Confirmed Trend Breakdown & Day Low Break (With Anti-Chasing & Volatility Filters) ──
    if (isDowntrend && todayCandles.length >= 2) {
      const priorLows = todayCandles.slice(0, -1).map(tc => tc.candle.low);
      const priorLow = priorLows.length > 0 ? Math.min(...priorLows) : currCandle.low;
      const distFromEmaPct = ((currEma - currCandle.close) / currCandle.close) * 100;

      // Anti-chasing safety filter:
      // 1. Dynamic ATR-based EMA stretch limit (allow up to 3.8% distance)
      // 2. Dynamic max move from open scaled to stock's actual Daily ATR%
      const isOverExtended = distFromEmaPct > Math.max(3.8, dynamicMaxEmaDistPct * 2.0) || Math.abs(moveFromOpenPct) > metrics.dynamicExtensionPct;

      if (!isOverExtended && (currCandle.low <= priorLow * 1.003 || moveFromOpenPct <= -1.0)) {
        // Swing Shelf SL: Anchored above shelf high with volatility breathing room
        const tightSl = getSwingShelfSl('SHORT', currCandle.high);
        const pdlTag = (pdl && currCandle.low <= pdl) ? ` [Below PDL: ₹${pdl.toFixed(2)}]` : '';
        return {
          trend: 'SHORT',
          setupType: 'TREND_BREAKDOWN',
          triggerHigh: null,
          triggerLow: Math.min(priorLow, currCandle.low),
          slPrice: tightSl,
          invalidationPrice: tightSl,
          slNote: 'Day Low Breakdown SL (Swing Shelf)',
          candleTime: currCandle.date,
          candleIdx: lastIdx,
          scoreBoost: 350 + Math.round(Math.abs(moveFromOpenPct) * 40) + (hasVolumeSurge ? 80 : 0) + (pdl && currCandle.low <= pdl ? 120 : 0),
          description: `Intraday Trend Breakdown below Day Low ₹${priorLow.toFixed(2)} (Day Move: ${moveFromOpenPct.toFixed(2)}%)${hasVolumeSurge ? ' [Vol Surge]' : ''}${pdlTag}`
        };
      }
    }

    // ── 4. Pattern 4: Confirmed Trend Breakout & Day High Break (With Anti-Chasing & Volatility Filters) ──
    if (isUptrend && todayCandles.length >= 2) {
      const priorHighs = todayCandles.slice(0, -1).map(tc => tc.candle.high);
      const priorHigh = priorHighs.length > 0 ? Math.max(...priorHighs) : currCandle.high;
      const distFromEmaPct = ((currCandle.close - currEma) / currCandle.close) * 100;

      // Anti-chasing safety filter:
      const isOverExtended = distFromEmaPct > Math.max(3.8, dynamicMaxEmaDistPct * 2.0) || moveFromOpenPct > metrics.dynamicExtensionPct;

      if (!isOverExtended && (currCandle.high >= priorHigh * 0.997 || moveFromOpenPct >= 1.0)) {
        // Swing Shelf SL: Anchored below shelf low with volatility breathing room
        const tightSl = getSwingShelfSl('LONG', currCandle.low);
        const pdhTag = (pdh && currCandle.high >= pdh) ? ` [Above PDH: ₹${pdh.toFixed(2)}]` : '';
        return {
          trend: 'LONG',
          setupType: 'TREND_BREAKOUT',
          triggerHigh: Math.max(priorHigh, currCandle.high),
          triggerLow: null,
          slPrice: tightSl,
          invalidationPrice: tightSl,
          slNote: 'Day High Breakout SL (Swing Shelf)',
          candleTime: currCandle.date,
          candleIdx: lastIdx,
          scoreBoost: 350 + Math.round(moveFromOpenPct * 40) + (hasVolumeSurge ? 80 : 0) + (pdh && currCandle.high >= pdh ? 120 : 0),
          description: `Intraday Trend Breakout above Day High ₹${priorHigh.toFixed(2)} (Day Move: +${moveFromOpenPct.toFixed(2)}%)${hasVolumeSurge ? ' [Vol Surge]' : ''}${pdhTag}`
        };
      }
    }

    // ── 5. Pattern 5: Established Trend Continuation Breakdown / Breakout ──
    // When a momentum leader (e.g. OFSS) is strongly trending below 15-EMA & VWAP, enter on breakdown below current candle low
    if (isDowntrend && todayCandles.length >= 2) {
      const distFromEmaPct = ((currEma - currCandle.close) / currCandle.close) * 100;
      if (distFromEmaPct <= Math.max(4.0, dynamicMaxEmaDistPct * 2.0) && Math.abs(moveFromOpenPct) <= metrics.dynamicExtensionPct) {
        const tightSl = getSwingShelfSl('SHORT', Math.max(currCandle.high, currEma));
        return {
          trend: 'SHORT',
          setupType: 'TREND_BREAKDOWN',
          triggerHigh: null,
          triggerLow: currCandle.low,
          slPrice: tightSl,
          invalidationPrice: tightSl,
          slNote: '15-EMA Trend Continuation SL',
          candleTime: currCandle.date,
          candleIdx: lastIdx,
          scoreBoost: 320 + (hasVolumeSurge ? 60 : 0),
          description: `15-EMA Trend Continuation Breakdown below ₹${currCandle.low.toFixed(2)} (SL: ₹${tightSl.toFixed(2)})${hasVolumeSurge ? ' [Vol Surge]' : ''}`
        };
      }
    }

    if (isUptrend && todayCandles.length >= 2) {
      const distFromEmaPct = ((currCandle.close - currEma) / currCandle.close) * 100;
      if (distFromEmaPct <= Math.max(4.0, dynamicMaxEmaDistPct * 2.0) && moveFromOpenPct <= metrics.dynamicExtensionPct) {
        const tightSl = getSwingShelfSl('LONG', Math.min(currCandle.low, currEma));
        return {
          trend: 'LONG',
          setupType: 'TREND_BREAKOUT',
          triggerHigh: currCandle.high,
          triggerLow: null,
          slPrice: tightSl,
          invalidationPrice: tightSl,
          slNote: '15-EMA Trend Continuation SL',
          candleTime: currCandle.date,
          candleIdx: lastIdx,
          scoreBoost: 320 + (hasVolumeSurge ? 60 : 0),
          description: `15-EMA Trend Continuation Breakout above ₹${currCandle.high.toFixed(2)} (SL: ₹${tightSl.toFixed(2)})${hasVolumeSurge ? ' [Vol Surge]' : ''}`
        };
      }
    }


    // ── 6. Pattern 6: Inside Candle Pullback ──
    const mother = prevCandle;
    const baby = currCandle;
    const isInsideCandle = baby.high <= mother.high && baby.low >= mother.low;
    if (isInsideCandle && (isUptrend || isDowntrend)) {
      const trend = isUptrend ? 'LONG' : 'SHORT';
      const isLong = trend === 'LONG';
      const tightSl = getSwingShelfSl(trend, isLong ? mother.low : mother.high);
      return {
        trend,
        setupType: 'INSIDE_CANDLE',
        triggerHigh: isLong ? mother.high : null,
        triggerLow: isLong ? null : mother.low,
        slPrice: tightSl,
        invalidationPrice: tightSl,
        slNote: 'Inside Candle Swing Shelf SL',
        candleTime: baby.date,
        candleIdx: lastIdx,
        scoreBoost: 180,
        description: `Inside Candle Pullback Breakout (${trend})`
      };
    }

    return null;
  }

  private checkOpenDriveSetup(candles: Candle[], vwaps: (number | null)[], now: Date): { trend: 'LONG' | 'SHORT'; setupType: 'OPEN_LOW_DRIVE' | 'OPEN_HIGH_DRIVE'; triggerHigh: number; triggerLow: number; invalidationPrice: number; slNote: string; candleIdx: number; candleTime: Date } | null {
    if (!candles || candles.length === 0) return null;
    const todayStr = this.getIstDateStr(now);

    let firstIdx = -1;
    for (let k = 0; k < candles.length; k++) {
      if (this.getIstDateStr(candles[k].date) === todayStr) {
        firstIdx = k;
        break;
      }
    }
    if (firstIdx === -1) return null;

    const firstCandle = candles[firstIdx];
    const firstCandleHhmm = this.getIstHhmm(firstCandle.date);
    // Opening 5m candle starts at 09:15 AM
    if (firstCandleHhmm !== 9 * 60 + 15) return null;

    const vwap = vwaps[firstIdx];
    const open = firstCandle.open;
    const high = firstCandle.high;
    const low = firstCandle.low;
    const close = firstCandle.close;

    const candleRangePct = open > 0 ? ((high - low) / open) * 100 : 0;
    // Anti-chasing safety filter:
    // Scale opening candle range limit to stock's actual Daily ATR%
    const metrics = this.calculateDynamicStockMetrics(candles, now);
    if (candleRangePct > metrics.dynamicOpeningCapPct) {
      return null;
    }

    // 1. Open = Low Drive (Bullish Buy setup)
    // Low within 0.25% of Open (or equal) + Green candle
    const lowOpenDiffPct = Math.abs(open - low) / open;
    const isGreen = close > open;
    const isOpenLow = lowOpenDiffPct <= 0.0025 && isGreen;

    if (isOpenLow) {
      // True structural Stop Loss below Opening Candle Low with buffer (capped to 1.2% max)
      const buffer = Math.max(0.10, low * 0.0035);
      const maxSlDist = open * 0.012;
      const slPrice = Math.max(low - buffer, open - maxSlDist);
      const slNote = 'Day Low Buffer';

      return {
        trend: 'LONG',
        setupType: 'OPEN_LOW_DRIVE',
        triggerHigh: high,
        triggerLow: slPrice,
        invalidationPrice: low,
        slNote,
        candleIdx: firstIdx,
        candleTime: new Date(firstCandle.date),
      };
    }

    // 2. Open = High Drive (Bearish Sell setup)
    // High within 0.25% of Open (or equal) + Red candle
    const highOpenDiffPct = Math.abs(high - open) / open;
    const isRed = close < open;
    const isOpenHigh = highOpenDiffPct <= 0.0025 && isRed;

    if (isOpenHigh) {
      // True structural Stop Loss above Opening Candle High with buffer (capped to 1.2% max)
      const buffer = Math.max(0.10, high * 0.0035);
      const maxSlDist = open * 0.012;
      const slPrice = Math.min(high + buffer, open + maxSlDist);
      const slNote = 'Day High Buffer';

      return {
        trend: 'SHORT',
        setupType: 'OPEN_HIGH_DRIVE',
        triggerHigh: slPrice, // Adaptive SL
        triggerLow: low,
        invalidationPrice: high, // Absolute candle high
        slNote,
        candleIdx: firstIdx,
        candleTime: new Date(firstCandle.date),
      };
    }

    return null;
  }

  private formatTime(d: Date) { return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }); }
  private log(state: StrategyState, msg: string) {
    const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    state.logs.push(`[${ts}] ${msg}`);
    if (state.logs.length > 300) {
      state.logs = state.logs.slice(-200);
    }
    this.logger.log(`[${state.executionId}] ${msg}`);
  }
  private async persistLogs(state: StrategyState) {
    try {
      const now = Date.now();
      const logsChanged = state.logs.length !== (state.lastPersistedLogCount || 0);
      const timeSinceDb = now - (state.lastDbPersistTime || 0);

      if (logsChanged || timeSinceDb >= 15000) {
        state.lastPersistedLogCount = state.logs.length;
        state.lastDbPersistTime = now;
        await this.prisma.strategyExecution.update({
          where: { id: state.executionId },
          data: { logs: JSON.stringify(state.logs.slice(-500)) },
        });
      }

      strategyEvents.emit('strategy.update', {
        strategyId: state.strategyId,
        logs: state.logs,
        state: this.getState(state.strategyId),
      });
    } catch { }
  }
  private async findFutureSymbol(client: any, baseSymbol: string): Promise<{ symbol: string; exchange: string }> {
    const upperSymbol = baseSymbol.toUpperCase().trim();
    const isSensex = upperSymbol === 'SENSEX' || upperSymbol === 'BSE SENSEX';
    const exchange = isSensex ? 'BFO' : 'NFO';
    const segment = isSensex ? 'BFO-FUT' : 'NFO-FUT';
    let underlying = isSensex ? 'SENSEX' : upperSymbol.includes('BANK') ? 'BANKNIFTY' : (upperSymbol.includes('NIFTY 50') || upperSymbol === 'NIFTY') ? 'NIFTY' : upperSymbol.includes('FIN') ? 'FINNIFTY' : upperSymbol.includes('MID') ? 'MIDCPNIFTY' : upperSymbol;

    const instruments = await client.getInstruments(exchange);
    const futures = instruments.filter((i: any) => i.name === underlying && i.instrument_type === 'FUT' && i.segment === segment);
    if (futures.length === 0) throw new Error(`No ${exchange} future for ${baseSymbol}`);
    const sorted = futures.sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    return { symbol: sorted[0].tradingsymbol, exchange };
  }

  private getLatestCrossoverTodayDetails(idx: number, candles: Candle[], emas: (number | null)[], vwaps: (number | null)[]): { trend: 'LONG' | 'SHORT'; crossoverIdx: number; ema: number; vwap: number; crossoverTime: Date } | null {
    let latestCrossover: 'LONG' | 'SHORT' | null = null;
    let crossoverIdx = -1;
    const todayStr = this.getIstDateStr(candles[idx].date);

    for (let k = 1; k <= idx; k++) {
      const candleDateStr = this.getIstDateStr(candles[k].date);
      if (candleDateStr !== todayStr) continue;

      const prevDateStr = this.getIstDateStr(candles[k - 1].date);
      if (prevDateStr !== todayStr) continue;

      const prevEma = emas[k - 1], currEma = emas[k];
      const prevVwap = vwaps[k - 1], currVwap = vwaps[k];
      if (prevEma === null || currEma === null || prevVwap === null || currVwap === null) continue;

      const candle = candles[k];

      // LONG Crossover: 15-EMA crosses ABOVE VWAP + Candle MUST be bullish & close ABOVE VWAP & 15-EMA
      if (prevEma <= prevVwap && currEma > currVwap && candle.close >= currVwap && candle.close >= currEma && candle.close >= candle.open) {
        latestCrossover = 'LONG';
        crossoverIdx = k;
      }
      // SHORT Crossover: 15-EMA crosses BELOW VWAP + Candle MUST be bearish & close BELOW VWAP & 15-EMA
      else if (prevEma >= prevVwap && currEma < currVwap && candle.close <= currVwap && candle.close <= currEma && candle.close <= candle.open) {
        latestCrossover = 'SHORT';
        crossoverIdx = k;
      }
    }

    // Return the crossover only if the trend is still valid at the current candle
    if (latestCrossover !== null && crossoverIdx !== -1) {
      const currentEma = emas[idx], currentVwap = vwaps[idx];
      const currentCandle = candles[idx];
      if (currentEma === null || currentVwap === null) return null;

      // Dynamic Volatility Exhaustion Guard: Scaled to stock's actual Daily ATR%
      const metrics = this.calculateDynamicStockMetrics(candles, new Date());
      let firstDayCandle: Candle | null = null;
      for (let k = 0; k < candles.length; k++) {
        if (this.getIstDateStr(candles[k].date) === todayStr) {
          firstDayCandle = candles[k];
          break;
        }
      }
      if (firstDayCandle && firstDayCandle.open > 0) {
        const moveFromOpenPct = (Math.abs(currentCandle.close - firstDayCandle.open) / firstDayCandle.open) * 100;
        if (moveFromOpenPct > metrics.dynamicExhaustionPct) {
          return null; // Move is exhausted relative to stock's daily volatility; avoid entering at extreme extended prices
        }
      }

      // Long trend is valid only if EMA > VWAP AND current candle close hasn't collapsed below VWAP
      const longValid = latestCrossover === 'LONG' && currentEma > currentVwap && currentCandle.close >= (currentVwap * 0.998);
      // Short trend is valid only if EMA < VWAP AND current candle close hasn't surged above VWAP
      const shortValid = latestCrossover === 'SHORT' && currentEma < currentVwap && currentCandle.close <= (currentVwap * 1.002);

      if (longValid || shortValid) {
        return {
          trend: latestCrossover,
          crossoverIdx,
          ema: emas[crossoverIdx]!,
          vwap: vwaps[crossoverIdx]!,
          crossoverTime: new Date(candles[crossoverIdx].date),
        };
      }
    }

    return null;
  }

  private async checkMarketTrendAlignment(
    client: any,
    trend: 'LONG' | 'SHORT'
  ): Promise<{ isAligned: boolean; niftyLtp?: number; niftyOpen?: number; changePct?: number; reason?: string }> {
    try {
      const kite = client['kite'];
      if (!kite) return { isAligned: true };

      const quotes = await kite.getQuote(['NSE:NIFTY 50']);
      const nifty = quotes?.['NSE:NIFTY 50'];
      if (!nifty || !nifty.last_price || !nifty.ohlc?.open) {
        return { isAligned: true };
      }

      const ltp = nifty.last_price;
      const open = nifty.ohlc.open;
      const changePct = ((ltp - open) / open) * 100;

      // LONG: Nifty should not be in strong selloff (change >= -0.25% from open)
      // SHORT: Nifty should not be in strong bull rally (change <= +0.25% from open)
      if (trend === 'LONG' && changePct < -0.25) {
        return {
          isAligned: false,
          niftyLtp: ltp,
          niftyOpen: open,
          changePct,
          reason: `NIFTY 50 is bearish (${changePct.toFixed(2)}% from Open: ₹${open.toFixed(1)} -> LTP: ₹${ltp.toFixed(1)})`
        };
      }

      if (trend === 'SHORT' && changePct > 0.25) {
        return {
          isAligned: false,
          niftyLtp: ltp,
          niftyOpen: open,
          changePct,
          reason: `NIFTY 50 is bullish (+${changePct.toFixed(2)}% from Open: ₹${open.toFixed(1)} -> LTP: ₹${ltp.toFixed(1)})`
        };
      }

      return { isAligned: true, niftyLtp: ltp, niftyOpen: open, changePct };
    } catch {
      return { isAligned: true };
    }
  }

  private checkRvolFilter(candles: Candle[], candleIdx: number): { isVolumeValid: boolean; rvol: number; volume: number; avgVolume: number } {
    if (!candles || candleIdx < 0 || candleIdx >= candles.length) {
      return { isVolumeValid: true, rvol: 1, volume: 0, avgVolume: 0 };
    }

    const currentCandle = candles[candleIdx];
    const volume = currentCandle.volume || 0;

    const startIdx = Math.max(0, candleIdx - 10);
    let pastSum = 0;
    let pastCount = 0;
    for (let k = startIdx; k < candleIdx; k++) {
      if (candles[k].volume && candles[k].volume > 0) {
        pastSum += candles[k].volume;
        pastCount++;
      }
    }

    const avgVolume = pastCount > 0 ? (pastSum / pastCount) : volume;
    const rvol = avgVolume > 0 ? (volume / avgVolume) : 1;
    const isVolumeValid = rvol >= 1.15 || volume >= 5000;
    return { isVolumeValid, rvol, volume, avgVolume };
  }
}
