import { Injectable, Logger } from '@nestjs/common';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';
import { resolveIndex } from '../brokers/instrument-store';
import { withKiteRetry } from '../brokers/kite-errors';
import { strategyEvents } from '../common/events';
import { loadResumableLogs, MAX_ENGINE_LOGS, pushEngineLog } from '../common/utils/engine-log';
import { TickerService } from '../market/ticker.service';
import { OrderGateway } from '../order-gateway/order-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { getCompletedBrokerExitDetails, getLiveBrokerPosition, isSafeToExit, safeCancelPendingOrders } from './broker-position-guard';
import { EmaVwapCrossoverConfig } from './dto/strategy.dto';
import { countTodaysTradesForEntry, findOpenPosition, PositionUnknownError, protectionNotice, recoverTodaysTrades } from './position-recovery';
import { logSignal } from './signal-logger';
import { calculateEMA, calculateVWAP, Candle, filterClosedCandles, findLatestEmaVwapCrossToday, getIstDateStr, getIstHhmm, isInsideCandle } from './emavwap-signals';
import { getInstrumentTickSize, getTopCandidateStocks, globalTickSizeMap, roundToInstrumentTick } from './smart-stock-picker';

interface StockSetup {
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
}

interface StrategyState {
  strategyId: string;
  executionId: string;
  config: EmaVwapCrossoverConfig;
  userId: string;
  brokerAccountId: string;
  isPaperTrade: boolean;
  lastEma: number | null;
  lastVwap: number | null;
  waitingForConfirmation: 'LONG' | 'SHORT' | null;
  confirmationHigh: number | null;
  confirmationLow: number | null;
  invalidationPrice: number | null;
  setupTimestamp: number | null;
  setupType?: 'DIRECT' | 'INSIDE_CANDLE' | 'OPEN_LOW_DRIVE' | 'OPEN_HIGH_DRIVE' | 'TREND_BREAKDOWN' | 'TREND_BREAKOUT' | 'PULLBACK_REJECTION';
  cooldownSymbols?: Map<string, number>;
  invalidatedCrossoverTime?: number | null;
  entryPrice: number | null;
  entryTime?: Date | null;
  stopLossPrice: number | null;
  targetPrice: number | null;
  entryOrderId?: string | null;
  executedQty?: number;
  slOrderId: string | null;
  targetOrderId: string | null;
  entryTriggered: 'LONG' | 'SHORT' | null;
  tradesPlacedToday: number;
  logs: string[];
  tickerUnsubscribe?: () => void;
  realtimeActive?: boolean;
  lastPnlLogTime?: number;
  lastEmitTime?: number;
  lastTickTime?: number;
  lastTickStartTime?: number;
  lastDbPersistTime?: number;
  lastPersistedLogCount?: number;
  hasLoggedOpeningWindow?: boolean;
  /** 1m auto mode: the scanner was warmed once during 09:15-09:16 so the first real scan is fast. */
  hasWarmedOpeningScan?: boolean;
  lastFallbackLogTime?: number;
  currentLtp?: number;
  currentPnlRs?: number;
  currentPnlPct?: number;
  peakPnlRs?: number;
  isTrailingEma?: boolean;
  isParabolicActive?: boolean;
  reEntryEligible?: boolean;
  reEntrySwingPrice?: number | null;
  /** Direction of the trade that armed re-entry. The consumer only implements a bullish (LONG)
   *  continuation, so re-entry must never fire for a SHORT-direction exit. */
  reEntryDirection?: 'LONG' | 'SHORT' | null;
  /** The stock whose exit armed re-entry; its swing price means nothing for any other stock. */
  reEntrySymbol?: string | null;
  reEntryCountToday?: number;
  isAutoMode?: boolean;
  activeSymbol?: string | null;
  dailyRealizedPnlRs?: number;
  dailyTargetLocked?: boolean;
  lastBrokerSlTrigger?: number;
  lastBrokerSlModifyTime?: number;
  lastSlArmRetryTime?: number;
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
  /** Fibonacci ladder of today's opening 5m candle for the open position (reference only). */
  fibLevels?: FibLevels | null;
  /** Earliest ms for the next refreshFibLevels candle fetch. */
  fibRetryAt?: number;
  partialTargetPrice?: number | null;
  partialBooked?: boolean;
  partialAttempts?: number;
  initialStopPrice?: number;   // the entry's structural stop (1R for the profit lock)
  profitLockStep?: number;     // PROFIT_LOCK_STEPS reached so far
  isBookingPartial?: boolean;
  /** First tick (ms) at which price was beyond the stop while the broker SL had not filled. */
  slBreachAt?: number | null;
  /** Close (ms) of the candle on which the pending setup was detected; setup validity is counted from here. */
  setupArmedAt?: number | null;
  /** Symbols the broker refused for a new entry (e.g. MIS blocked), with the time (ms) until which they are skipped. */
  rejectedSymbols?: Map<string, number>;
}

/** Live: price beyond the stop this long without the exchange SL filling → market exit (same as the options engine). */
const SL_BREACH_GRACE_MS = 3000;

/** Auto mode: how many of the scanner's top-ranked stocks are checked for a setup on every scan (config `scanDepth`). */
const DEFAULT_SCAN_DEPTH = 20;
const MAX_SCAN_DEPTH = 25;
/** Widest stop allowed, % of entry (maxStopPct). The 2-year backtest did better the tighter this was (2.2% -> 1.0%). */
const DEFAULT_MAX_STOP_PCT = 2.2;
const MIN_STOP_PCT = 0.85;
/**
 * Profit lock for the 15-EMA ride (config.profitLock, default on): [reached R, stop moved to R]. 2-year 5m backtest (₹30k,
 * 1 trade/day, 1.2% stop): +₹31.7k vs +₹22.6k with the stop left at the entry stop, better in both years (8 Oct 2026).
 */
const PROFIT_LOCK_STEPS: ReadonlyArray<readonly [number, number]> = [[1.5, 0.5], [3, 2]];
/** Sessions in the daily ATR (from the volume-history download). */
const ATR_SESSIONS = 10;
/** Fibonacci ratios marked on the opening 5m candle (0 = its far end, 1 = the end in the trade's direction). */
const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.414, 1.618, 2, 2.272, 2.414, 2.618];

/**
 * Fibonacci ladder of today's opening 5m candle (09:15-09:20), drawn in the open position's direction: for a long 0 is
 * the candle's low and 1 its high, for a short 0 is its high and 1 its low; ratios above 1 extend beyond it.
 * Reference only: no order, stop or exit uses these levels (backtest: price turns at them no more often than elsewhere).
 */
interface FibLevels {
  anchor0: number;
  anchor1: number;
  levels: { ratio: number; price: number }[];
  /** The opening candle was still forming when this was computed (entry before 09:20); refreshed once it closes. */
  provisional: boolean;
}
/** Candles checked per batch: matches Kite's 3 req/s historical limit, so queued calls never sit past their timeout. */
const SCAN_BATCH_SIZE = 3;
/** A candle's final values are published a moment after it closes (the 1m rescan waits 2s for the same reason). */
const CLOSED_CANDLE_SETTLE_MS = 2000;

@Injectable()
export class EmaVwapCrossoverEngine {
  private readonly logger = new Logger(EmaVwapCrossoverEngine.name);
  private readonly running = new Map<string, StrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  /**
   * expiresAt: reuse limit for callers that read the still-forming candle (30s, never past a candle close).
   * closedUntil: reuse limit for callers that only read closed candles (the scanner): the next candle close, provided the
   * fetch came after the last close had settled. 0 = no such reuse.
   */
  private readonly candleCache = new Map<string, { candles: Candle[]; expiresAt: number; closedUntil: number }>();
  /** Per-stock volume history: same-clock-time 5m volumes of the previous 10 sessions (loaded once per stock per day). */
  private readonly volumeBaselines = new Map<string, { dateStr: string; slots: Map<number, number[]>; retryAfter?: number }>();
  /** Per-stock daily ATR% over the previous ATR_SESSIONS sessions, built from the same download as the volume history. */
  private readonly dailyAtrBySymbol = new Map<string, { dateStr: string; atrPct: number; sessions: number }>();
  /** Symbols the instrument master had no tick size for, so ensureTickSize doesn't rescan the master every tick. */
  private readonly tickSizeMisses = new Set<string>();

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
    // Stock intraday only. Indices (and their options) are traded by the EMA-VWAP Options engine.
    if (resolveIndex(config.symbol || '') || /^BSE SENSEX$/i.test((config.symbol || '').trim())) {
      throw new Error(`EMA-VWAP Crossover trades stocks only. ${config.symbol} is an index — use the EMA-VWAP Options strategy for index options.`);
    }
    // Older configs may still carry the option-buying switch; this engine always trades the stock itself.
    const ignoredOptionSwitch = config.isOptionBuyingOnly === true;
    config.isOptionBuyingOnly = false;
    // FULL target mode = one volatility-based target with the exchange-side LIMIT order, no trailing and no EMA candle exit
    // (reuses the fixed-target machinery). PARTIAL / QUICK keep trend-riding (15-EMA candle-close exit) for the runner;
    // EMA rides the whole position on it.
    if (!config.exitExactAtTarget && (config.targetMode ?? 'FULL') === 'FULL') {
      config.enableProfitFloor = false;
      config.enableEmaCandleExit = false;
    }
    // A RUNNING row still open here means the previous run never stopped cleanly (process crash,
    // memory-cap restart, redeploy) — recover its console history before superseding it, so a
    // restart mid-session doesn't wipe the log the user is watching.
    const resumedLogs = await loadResumableLogs(this.prisma, strategyId);
    await this.prisma.strategyExecution.updateMany({
      where: { strategyId, status: 'RUNNING' },
      data: { status: 'STOPPED', stoppedAt: new Date() },
    });
    const execution = await this.prisma.strategyExecution.create({ data: { strategyId, status: 'RUNNING' } });

    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: true } });

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

    // ── Recover today's executed trades and realized P&L (broker order book for live) ──
    // The in-memory counter dies with the process, so a restart must rebuild it from what actually
    // filled; otherwise a restart after a trade lets the strategy trade again past maxTradesPerDay.
    const day = await recoverTodaysTrades({
      prisma: this.prisma,
      factory: this.factory,
      strategyId,
      isPaper: strategy.isPaperTrade,
      brokerAccount: strategy.brokerAccount,
    });
    const recoveredTradesToday = day.trades;
    const recoveredRealizedPnlRs = day.realizedPnlRs;

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
      tradesPlacedToday: recoveredTradesToday,
      dailyRealizedPnlRs: recoveredRealizedPnlRs,
      dailyTargetLocked: recoveredDailyTargetLocked,
      logs: resumedLogs,
      isAutoMode: config.symbol === 'AUTO' || config.symbol?.startsWith('AUTO'),
      activeSymbol: (config.symbol === 'AUTO' || config.symbol?.startsWith('AUTO')) ? null : config.symbol,
      peakPnlRs: 0,
      isTrailingEma: false,
    };

    this.running.set(strategyId, state);
    if (resumedLogs.length > 0) {
      this.log(state, `🔁 Engine reconnected — resuming console from the interrupted session (${config.symbol}:${config.exchange}, ${strategy.isPaperTrade ? 'PAPER TRADING' : 'LIVE TRADING'})`);
    } else {
      this.log(state, `▶ Strategy started — ${config.symbol}:${config.exchange} | Mode: ${strategy.isPaperTrade ? 'PAPER TRADING' : 'LIVE TRADING'}`);
    }
    if (ignoredOptionSwitch) this.log(state, `ℹ Option buying is not used here — this engine trades ${config.symbol} itself (MIS). Index options run in the EMA-VWAP Options strategy.`);
    this.log(state, `💰 Detected Trading Capital: ₹${detectedCapital.toLocaleString('en-IN')}${liveMarginDetected ? ' (Live Zerodha Margin)' : (strategy.isPaperTrade ? ' [Paper Trading Mode]' : ' [Default / Configured]')}`);

    if (recoveredTradesToday > 0 || recoveredRealizedPnlRs !== 0) {
      this.log(state, `📊 [STATE RECOVERY] Restored today's historical state: ${recoveredTradesToday}/${config.maxTradesPerDay} trades executed | Realized P&L: ₹${recoveredRealizedPnlRs.toFixed(2)}${recoveredDailyTargetLocked ? ' (Daily Limit Locked)' : ''} [${day.source === 'BROKER' ? 'Zerodha order book' : 'saved orders'}]`);
    }

    // ── Open-position recovery after power cut / restart (LIVE from broker, PAPER from saved orders) ──
    // Runs before the completion checks below so a restart with an open position never
    // "completes" the strategy and leaves that position unmanaged.
    const recoveredPosition = await this.recoverOpenPosition(state, strategy.brokerAccount);
    // An adopted position is a trade this strategy opened today, whatever the order records say.
    if (recoveredPosition && state.tradesPlacedToday < 1) state.tradesPlacedToday = 1;

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
        accept: (sym) => state.isAutoMode || sym === config.symbol || sym.startsWith(config.symbol),
      });
      if (!pos) return false;

      const entryAvg = pos.avgPrice;
      const riskPerSh = entryAvg * 0.01;
      const isLong = pos.side === 'LONG';

      state.activeSymbol = pos.symbol;
      if (pos.exchange) state.config.exchange = pos.exchange;
      // The held product (e.g. NRML after an MIS-rejection fallback) drives exit orders and the position-row match.
      if (pos.product) (state.config as any).product = pos.product;
      state.partialBooked = true; // unknown whether a partial was already booked before the restart: never book again
      state.partialTargetPrice = null;
      state.entryTriggered = pos.side;
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
    await this.stopWithStatus(strategyId, 'STOPPED', '⏹ Strategy stopped by user');
  }

  /**
   * Safe shutdown. A live position is NEVER left unprotected:
   *  1. If a live position is open, flatten it first (protective orders stay in place until flat).
   *  2. Only cancel SL/target orders once the position is confirmed flat.
   *  3. If flatten fails, leave the broker-side SL order active and warn loudly.
   */
  private async stopWithStatus(strategyId: string, status: 'COMPLETED' | 'STOPPED', logReason: string): Promise<void> {
    const state = this.running.get(strategyId);
    // An entry may still be in flight (order placed, position flag not set yet). Stopping now would remove the
    // engine while the broker fills, leaving a live position that nothing monitors. Let the placement finish first.
    if (state?.isPlacingTrade) {
      const deadline = Date.now() + 20_000;
      while (state.isPlacingTrade && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
    }
    if (state) {
      this.log(state, logReason);
      let client: any = null;
      if (!state.isPaperTrade) {
        try {
          const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
          if (account?.accessToken) client = this.factory.createClient(account);
        } catch (e: any) {
          this.log(state, `⚠ Could not create broker client during shutdown: ${e?.message || e}`);
        }
      }

      let stillOpen = false;
      if (!state.isPaperTrade && state.entryTriggered) {
        if (client) {
          this.log(state, `🧯 Position still open on shutdown — squaring off before stopping.`);
          try {
            const px = state.currentLtp || state.entryPrice || 0;
            await this.exitPosition(state, client, px, 'FORCE_CLOSE');
          } catch (e: any) {
            this.log(state, `❌ Shutdown square-off failed: ${e?.message || e}`);
          }
          stillOpen = !!state.entryTriggered;
        } else {
          stillOpen = true;
        }
        if (stillOpen) {
          this.log(state, `🚨 POSITION NOT CONFIRMED FLAT. Broker-side stop-loss order is left ACTIVE. Verify and close manually in Kite if needed.`);
        }
      }

      this.stopRealtimeMonitor(state);
      clearInterval(this.timers.get(strategyId));
      this.timers.delete(strategyId);
      this.running.delete(strategyId);

      if (client && !state.isPaperTrade && !stillOpen && (state.slOrderId || state.targetOrderId)) {
        try {
          await this.cancelBrokerOrderSafe(client, state.slOrderId);
          await this.cancelBrokerOrderSafe(client, state.targetOrderId);
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
    // A day's normal end (COMPLETED) keeps autoStart so the strategy runs again next session; any stop clears it.
    const data = status === 'COMPLETED' ? { isActive: false } : { isActive: false, autoStart: false };
    await this.prisma.strategy.update({ where: { id: strategyId }, data });
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
    const isLong = s.entryTriggered === 'LONG';
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
      optionSymbol: null, // kept for the UI payload shape; this engine never holds an option
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
      fibLevels: s.entryTriggered ? s.fibLevels ?? null : null,
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
    const symbol = state.activeSymbol || state.config.symbol;
    const exchange = state.config.exchange;

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
    if (getIstHhmm(now) < 9 * 60 + 20) return;

    this.log(state, `🔍 Running catch-up for today's data...`);
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    try {
      if (state.config.symbol === 'AUTO') {
        const excluded = this.excludedSymbols(state);
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

              const closedCCandles = filterClosedCandles(cCandles, now, 5);
              if (closedCCandles.length < 2) return;

              const cEmas = calculateEMA(closedCCandles, emaPeriod);
              const cVwaps = calculateVWAP(closedCCandles, state.config.vwapSource || 'close');

              await this.ensureVolumeBaseline(client, candidate.symbol, candidate.exchange, now);
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

      const candles = await this.fetchCandles(client, scanConfig, '5minute', now);
      const emaPeriod = state.config.emaPeriod || 15;
      if (candles.length < emaPeriod + 2) return;

      const emas = calculateEMA(candles, emaPeriod);
      const vwaps = calculateVWAP(candles, state.config.vwapSource || 'close');

      const todayStr = getIstDateStr(now);

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
          const isLong = state.entryTriggered === 'LONG';
          const currentEma = emas[i];
          const isTrailingEnabled = state.config.enableProfitFloor !== false;

          const pnlPoints = isLong
            ? (currentCandle.close - state.entryPrice!)
            : (state.entryPrice! - currentCandle.close);
          const pnlRs = pnlPoints * state.config.qty;
          const targetThresholdRs = state.config.targetRs || 500;

          const isHitTarget = isLong ? (currentCandle.high >= state.targetPrice!) : (currentCandle.low <= state.targetPrice!);
          const isHitSL = isLong ? (currentCandle.low <= state.stopLossPrice!) : (currentCandle.high >= state.stopLossPrice!);

          // 0. 15-EMA candle-close mode: hard structural SL intrabar, otherwise exit only when a 5m candle CLOSES across the 15-EMA
          const emaCandleMode = isTrailingEnabled && !state.config.exitExactAtTarget && state.config.enableEmaCandleExit !== false;
          if (emaCandleMode) {
            if (isHitSL) {
              const slExit = state.stopLossPrice!;
              const slPnl = (isLong ? (slExit - state.entryPrice!) : (state.entryPrice! - slExit)) * state.config.qty;
              this.log(state, `🛑 (Catch-up) Structural Stop Loss Hit at ₹${slExit.toFixed(2)} on ${this.formatTime(currentCandle.date)} | Final P&L: ₹${slPnl.toFixed(2)}`);
              await this.exitPositionHistorical(state, slExit, currentCandle.date);
              continue;
            }
            const closedAcrossEma = isLong ? (currentCandle.close < currentEma) : (currentCandle.close > currentEma);
            if (closedAcrossEma) {
              const emaExit = currentCandle.close;
              const emaPnl = (isLong ? (emaExit - state.entryPrice!) : (state.entryPrice! - emaExit)) * state.config.qty;
              this.log(state, `📈 (Catch-up) 5m candle closed ${isLong ? 'below' : 'above'} 15-EMA @ ₹${emaExit.toFixed(2)} (EMA: ₹${currentEma.toFixed(2)}) on ${this.formatTime(currentCandle.date)} | Final Realized P&L: ₹${emaPnl.toFixed(2)}`);
              await this.exitPositionHistorical(state, emaExit, currentCandle.date);
              continue;
            }
          }

          // 1. Check if Target 1 reached -> Activate EMA(15) Line Trailing SL
          if ((pnlRs >= targetThresholdRs || isHitTarget) && !state.isTrailingEma && isTrailingEnabled && !emaCandleMode) {
            state.isTrailingEma = true;
            state.stopLossPrice = currentEma;
            this.log(state, `📈 (Catch-up) Target 1 reached on ${this.formatTime(currentCandle.date)} (Target: ₹${state.targetPrice?.toFixed(2)}, P&L: ₹${pnlRs.toFixed(2)})! Activated EMA(15) Line Trailing SL @ ₹${currentEma.toFixed(2)} — riding trend...`);
          }

          // 2. If EMA Trailing is Active: Exit ONLY when candle CLOSE crosses EMA(15) line
          if (state.isTrailingEma) {
            state.stopLossPrice = currentEma;
            const isCrossedEma = isLong ? (currentCandle.close < currentEma) : (currentCandle.close > currentEma);

            if (isCrossedEma) {
              const exitPrice = currentCandle.close;
              const finalPnl = (isLong ? (exitPrice - state.entryPrice!) : (state.entryPrice! - exitPrice)) * state.config.qty;
              this.log(state, `📈 (Catch-up) Candle closed across EMA(15) line @ ₹${exitPrice.toFixed(2)} (EMA: ₹${currentEma.toFixed(2)}) on ${this.formatTime(currentCandle.date)} | Final Realized P&L: ₹${finalPnl.toFixed(2)}`);
              await this.exitPositionHistorical(state, exitPrice, currentCandle.date);
              continue;
            }
          } else {
            // 3. Before Target 1: Check Standard Initial SL or Fixed Target (if trailing disabled)
            if (isHitSL) {
              const exitPrice = state.stopLossPrice!;
              const finalPnl = (isLong ? (exitPrice - state.entryPrice!) : (state.entryPrice! - exitPrice)) * state.config.qty;
              this.log(state, `🛑 (Catch-up) Stop Loss Hit at ₹${exitPrice.toFixed(2)} on ${this.formatTime(currentCandle.date)} | Final P&L: ₹${finalPnl.toFixed(2)}`);
              await this.exitPositionHistorical(state, exitPrice, currentCandle.date);
              continue;
            }

            if (isHitTarget && !isTrailingEnabled) {
              const exitPrice = state.targetPrice!;
              const finalPnl = (isLong ? (exitPrice - state.entryPrice!) : (state.entryPrice! - exitPrice)) * state.config.qty;
              this.log(state, `🎯 (Catch-up) Target Hit at ₹${exitPrice.toFixed(2)} on ${this.formatTime(currentCandle.date)} | Final P&L: ₹${finalPnl.toFixed(2)}`);
              await this.exitPositionHistorical(state, exitPrice, currentCandle.date);
              continue;
            }
          }

          // 4. 3:05 PM EOD Mandatory Square Off (Intraday RMS Safe Exit)
          const candleHhmm = getIstHhmm(currentCandle.date);
          if (candleHhmm >= 15 * 60 + 5) {
            const exitPrice = currentCandle.close;
            const finalPnl = (isLong ? (exitPrice - state.entryPrice!) : (state.entryPrice! - exitPrice)) * state.config.qty;
            this.log(state, `⏰ (Catch-up) 3:05 PM EOD Cutoff reached on ${this.formatTime(currentCandle.date)}! Position squared off at ₹${exitPrice.toFixed(2)} | Final Realized P&L: ₹${finalPnl.toFixed(2)}`);
            await this.exitPositionHistorical(state, exitPrice, currentCandle.date);
            continue;
          }
          continue;
        }

        if (state.tradesPlacedToday >= state.config.maxTradesPerDay) {
          this.log(state, `⛔ Catch-up: Max daily trade cap (${state.config.maxTradesPerDay}) reached.`);
          break;
        }

        // Only trigger catch-up trades if the crossover is from TODAY's candles
        const candleDateStr = getIstDateStr(currentCandle.date);
        if (candleDateStr !== todayStr) continue;

        // Dual Entry Catch-up Scanning (Direct Crossover Breakout + Inside Candle Pullback)
        const mother = candles[i - 1];
        const baby = candles[i];
        const motherDateStr = getIstDateStr(mother.date);
        const babyDateStr = getIstDateStr(baby.date);
        const isInside = motherDateStr === todayStr && babyDateStr === todayStr && isInsideCandle(mother, baby);
        const details = this.getLatestCrossoverTodayDetails(i, candles, emas, vwaps);

        if (details !== null) {
          const isBullish = details.trend === 'LONG';
          const crossoverCandle = candles[details.crossoverIdx];
          const isFreshCrossover = (i - details.crossoverIdx) <= 1;

          let triggerHigh: number | null = null;
          let triggerLow: number | null = null;
          let setupType = '';

          if (isInside) {
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
                  this.log(state, `🚀 (Catch-up) Found past LONG Breakout (${setupType}) at ${this.formatTime(new Date(checkCandle.date))}!`);
                  await this.placeTrade(state, client, 'BUY', triggerHigh, new Date(checkCandle.date), triggerLow, triggerHigh);
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
                  this.log(state, `🚀 (Catch-up) Found past SHORT Breakout (${setupType}) at ${this.formatTime(new Date(checkCandle.date))}!`);
                  await this.placeTrade(state, client, 'SELL', triggerLow, new Date(checkCandle.date), triggerLow, triggerHigh);
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
        const lastClose = lastCandle.close;
        const isLong = state.entryTriggered === 'LONG';
        const pnl = (isLong
          ? (lastClose - state.entryPrice!)
          : (state.entryPrice! - lastClose)) * state.config.qty;
        const lastCandleTime = this.formatTime(lastCandle.date);
        this.log(state, `📊 (Catch-up) Position remains OPEN | Last candle: ${lastCandleTime} | Symbol: ${state.activeSymbol || state.config.symbol} | Entry: ₹${state.entryPrice?.toFixed(2)} | Target: ₹${state.targetPrice?.toFixed(2)} | SL: ₹${state.stopLossPrice?.toFixed(2)} | Close Price: ₹${lastClose.toFixed(2)} | P&L: ₹${pnl.toFixed(2)}. Live monitoring will take over.`);
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
      const isAfterMarket = getIstHhmm(now) >= 15 * 60 + 30;
      if (isAfterMarket && !state.entryTriggered) {
        this.log(state, `⏹ Market closed. Strategy auto-stopped (after-hours review only).`);
        await this.persistLogs(state);
        await this.stopWithStatus(state.strategyId, 'COMPLETED', `⏹ Auto-stopped: Market hours ended. Day review complete.`);
        return;
      }

      await this.persistLogs(state);
    } catch (err: any) {
      this.log(state, `⚠ Catch-up failed: ${err.message}`);
      await this.persistLogs(state);
    }
  }

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;
    if (state.isProcessingTick) {
      const elapsedSinceTick = Date.now() - (state.lastTickStartTime || 0);
      // Never release the lock while an entry is being placed: a second tick would race the placement.
      // The first auto-mode scan alone can take ~40s, so the threshold is well above that.
      if (elapsedSinceTick > 60_000 && !state.isPlacingTrade) {
        this.log(state, `⚠️ [WATCHDOG RECOVERY] Previous market tick stalled (>60s). Forcibly resetting execution lock to maintain continuous trading.`);
        state.isProcessingTick = false;
      } else {
        return;
      }
    }
    state.isProcessingTick = true;
    state.lastTickStartTime = Date.now();

    try {
      const now = new Date();
      const hhmm = getIstHhmm(now);
      if (hhmm < 9 * 60 + 15 || hhmm >= 15 * 60 + 30) return;

      const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
      if (!account || !account.accessToken) return;

      const client = this.factory.createClient(account);
      const { config } = state;
      const kite = client['kite'];

      // ── Check Max Daily Trade Cap ───────────────────────────────────────────
      // Gated on !state.entryTriggered: a position that was just opened already counts toward
      // tradesPlacedToday, so this must not force-close it — it only blocks NEW entries once the
      // current position (if any) has naturally exited via its own SL/target.
      if (!state.entryTriggered && !state.isPlacingTrade && state.tradesPlacedToday >= config.maxTradesPerDay) {
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
        await this.refreshFibLevels(state, client, now);
        // Auto-sync with broker: If position for activeSymbol was closed at broker, sync state immediately
        // Gated on !state.isExiting so this doesn't race with a concurrent exitPosition() call (e.g. from the
        // realtime websocket monitor) doing its own accounting for the same position at the same time.
        // Gated on a filled quantity: while the LIMIT entry is still working with nothing filled the broker is flat by
        // definition, and reading that as "closed" would book a phantom P&L and leave the entry order live at Zerodha.
        if (!state.isPaperTrade && kite && kite.getPositions && !state.isPlacingTrade && !state.isExiting && (state.executedQty || 0) > 0) {
          state.isExiting = true;
          try {
            const symbolToMonitor = state.activeSymbol || config.symbol;
            let brokerStatus = await getLiveBrokerPosition(kite, symbolToMonitor, this.logger, this.brokerMatch(state));
            if (!brokerStatus.isOpen) {
              // The positions book can lag a fresh fill by a moment: confirm "flat" with a second read before reconciling.
              await new Promise(r => setTimeout(r, 1500));
              brokerStatus = await getLiveBrokerPosition(kite, symbolToMonitor, this.logger, this.brokerMatch(state));
            }
            if (!brokerStatus.isOpen) {
              this.log(state, `ℹ [BROKER SYNC] Position for ${symbolToMonitor} is CLOSED on Zerodha (Net Qty: 0). Reconciling strategy state and cancelling pending broker orders.`);
              await safeCancelPendingOrders(kite, client, [state.slOrderId, state.targetOrderId, state.entryOrderId], this.logger);
              this.stopRealtimeMonitor(state);

              const exitSide: 'BUY' | 'SELL' = state.entryTriggered === 'LONG' ? 'SELL' : 'BUY';
              const exitDetails = await getCompletedBrokerExitDetails(kite, symbolToMonitor, state.slOrderId, state.targetOrderId, exitSide, this.logger, this.brokerMatch(state));

              let actualExitPrice = exitDetails.exitPrice;
              if (!actualExitPrice || actualExitPrice <= 0) {
                actualExitPrice = state.stopLossPrice || state.entryPrice || 0;
              }
              const exitOrderId = exitDetails.orderId;
              const exitQty = exitDetails.filledQty > 0 ? exitDetails.filledQty : (state.executedQty || config.qty);

              // 1. Record exit order in DB
              await this.trackOrderInDB(state, exitSide, symbolToMonitor, config.exchange, exitQty, actualExitPrice, exitOrderId, undefined, (exitDetails.orderType as any) || 'SL');

              // 2. Compute trade PnL
              const isLong = state.entryTriggered === 'LONG';
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
              state.entryPrice = null;
              state.entryTime = null;
              state.stopLossPrice = null;
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
              state.isTrailingEma = false;
              state.initialStopPrice = undefined;
              state.profitLockStep = 0;

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
          } finally {
            // Always release the lock: either the position is still open (normal monitoring
            // continues below) or state.entryTriggered was already cleared above — either way,
            // a stuck `true` here would permanently block every future exitPosition() call.
            state.isExiting = false;
          }
        }

        try {
          const candleSymbol = state.activeSymbol || config.symbol;
          const candleExchange = config.exchange;
          const testConfig = { ...config, symbol: candleSymbol, exchange: candleExchange };
          const cCandles = await this.fetchCandles(client, testConfig as any, '5minute', now);
          if (cCandles && cCandles.length >= 2) {
            const closedCCandles = filterClosedCandles(cCandles, now, 5);
            if (closedCCandles.length >= 2) {
              const lastClosedIdx = closedCCandles.length - 1;
              const lastClosedCandle = closedCCandles[lastClosedIdx];
              const cEmas = calculateEMA(closedCCandles, config.emaPeriod || 15);
              const cVwaps = calculateVWAP(closedCCandles, config.vwapSource || 'close');
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
                  const isLong = state.entryTriggered === 'LONG';
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
      const currentHhmm = getIstHhmm(now);
      // Auto mode may have moved on to another stock since the exit: drop the re-entry rather than compare that
      // stock's price with the old stock's swing high.
      if (state.reEntryEligible && state.reEntrySymbol && (state.activeSymbol || config.symbol) !== state.reEntrySymbol) {
        this.log(state, `🔁 Re-entry for ${state.reEntrySymbol} dropped — the scanner moved to ${state.activeSymbol}.`);
        state.reEntryEligible = false;
        state.reEntryDirection = null;
        state.reEntrySymbol = null;
      }
      if (config.enableTrendReEntry !== false && state.reEntryEligible && state.reEntryDirection === 'LONG' && state.reEntrySwingPrice && !state.entryTriggered && (state.reEntryCountToday || 0) < 1 && currentHhmm < 15 * 60) {
        try {
          const candleSymbol = state.activeSymbol || config.symbol;
          const candleExchange = config.exchange;
          const testConfig = { ...config, symbol: candleSymbol, exchange: candleExchange };
          const cCandles = await this.fetchCandles(client, testConfig as any, '5minute', now);
          if (cCandles && cCandles.length >= 2) {
            const lastCandle = cCandles[cCandles.length - 1];
            const cEmas = calculateEMA(cCandles, config.emaPeriod || 15);
            const cVwaps = calculateVWAP(cCandles, config.vwapSource || 'close');
            const curEma = cEmas[cCandles.length - 1];
            const curVwap = cVwaps[cCandles.length - 1];

            if (curEma && curVwap && lastCandle.close > curEma && lastCandle.close > curVwap && lastCandle.close > state.reEntrySwingPrice) {
              this.log(state, `🔥 [TREND RE-ENTRY TRIGGERED] ${candleSymbol} re-claimed ${config.emaPeriod || 15}-EMA & VWAP and broke swing high (₹${state.reEntrySwingPrice.toFixed(2)}) @ ₹${lastCandle.close.toFixed(2)}! Entering Trend Continuation Leg 2.`);
              state.reEntryEligible = false;
              state.reEntryDirection = null;
              state.reEntrySymbol = null;
              state.reEntryCountToday = (state.reEntryCountToday || 0) + 1;
              // No trigger time: that marks a catch-up replay, which would book a paper fill instead of a live order.
              await this.placeTrade(state, client, 'BUY', lastCandle.close, undefined, Math.min(lastCandle.low, curEma), state.reEntrySwingPrice);
              await this.persistLogs(state);
              return;
            }
          }
        } catch (err: any) {
          this.logger.debug?.(`Re-entry evaluation notice: ${err.message}`);
        }
      }

      // ── Opening Range Formation & Noise Filter Window: no entries until the first entry candle has closed ──
      // 5m entries: 09:15-09:20. 1m entries: 09:15-09:16.
      const entryTf = this.getEntryTf(config);
      if (currentHhmm < 9 * 60 + 15 + entryTf.minutes) {
        if (!state.hasLoggedOpeningWindow) {
          state.hasLoggedOpeningWindow = true;
          const startsAt = entryTf.minutes === 1 ? '09:16' : '09:20';
          this.log(state, `⏳ [09:15 - ${startsAt} AM OBSERVATION WINDOW] Opening ${entryTf.minutes}m candle forming. Establishing Opening Range (ORH/ORL), VWAP & Institutional Volume baseline. Execution begins @ ${startsAt} AM sharp.`);
          await this.persistLogs(state);
        }
        // Auto mode: the first scan of the day loads volume history for ~40 stocks (15-40s at Kite's 3 req/s), plus each
        // checked stock's own same-time volume baseline. Load both once now, inside the opening window, so the first
        // entry scan only fetches the few new names and can enter at once.
        if (state.isAutoMode && !state.hasWarmedOpeningScan && now.getSeconds() >= 20) {
          state.hasWarmedOpeningScan = true;
          const excluded = this.excludedSymbols(state);
          const scanDepth = this.getScanDepth(config);
          const warm = await getTopCandidateStocks(kite, config.targetRs, config.stopLossRs, this.logger, (config as any).maxCapital, Math.max(15, scanDepth), excluded, (config as any).minStockPrice || 30)
            .catch((e: any) => { this.logger.debug?.(`Opening scan warm-up failed: ${e?.message}`); return []; });
          const shortlist = warm.slice(0, scanDepth);
          for (let i = 0; i < shortlist.length; i += SCAN_BATCH_SIZE) {
            await Promise.allSettled(shortlist.slice(i, i + SCAN_BATCH_SIZE).map(c => this.ensureVolumeBaseline(client, c.symbol, c.exchange, now, entryTf.interval)));
          }
        }
        return;
      }

      // ── Auto-Mode Multi-Stock Scanning ──────────────────────────────────────
      // Allow continuous scanning if no position is open. If waiting for confirmation on an idle setup (>= 1 entry candle without trigger), evaluate other active leaders!
      // Idle = a whole entry candle has passed since the setup was detected (its candle closed) without a trigger.
      const setupArmedAt = state.setupArmedAt ?? (state.setupTimestamp ? state.setupTimestamp + entryTf.minutes * 60 * 1000 : null);
      const isIdleWaiting = !!(state.waitingForConfirmation && setupArmedAt && (now.getTime() - setupArmedAt >= entryTf.minutes * 60 * 1000));
      if (state.isAutoMode && !state.entryTriggered && (!state.waitingForConfirmation || isIdleWaiting) && !state.isPlacingTrade) {
        const nowMs = Date.now();
        // Throttle auto-scanning to at most once every 30 seconds to respect Zerodha 3 req/sec rate limit.
        // 1m entries also rescan as soon as a new 1m candle has closed (2s grace for Kite to publish it), so a
        // 09:16 setup is seen at ~09:16:02 instead of up to 30s later.
        const isNewEntryCandle = entryTf.minutes === 1 && !!state.lastAutoScanTime
          && Math.floor(state.lastAutoScanTime / 60_000) !== Math.floor(nowMs / 60_000) && now.getSeconds() >= 2;
        if (!state.lastAutoScanTime || (nowMs - state.lastAutoScanTime) >= 30_000 || isNewEntryCandle) {
          state.lastAutoScanTime = nowMs;
          const excluded = this.excludedSymbols(state);
          const scanDepth = this.getScanDepth(config);
          const candidates = await getTopCandidateStocks(kite, config.targetRs, config.stopLossRs, this.logger, (config as any).maxCapital, Math.max(15, scanDepth), excluded, (config as any).minStockPrice || 30);
          const activeSetups: Array<{ candidate: any; details: any }> = [];

          // Check the top `scanDepth` momentum leaders for a setup; the best-scoring one with a setup is traded.
          // Closed candles are reused until the next candle closes, so after the first scan of a candle this costs no
          // history calls. Batches of 3 match Kite's 3 req/s historical limit (the central limiter does the pacing).
          const evaluated = candidates.slice(0, scanDepth);
          for (let i = 0; i < evaluated.length; i += SCAN_BATCH_SIZE) {
            await Promise.allSettled(evaluated.slice(i, i + SCAN_BATCH_SIZE).map(async (candidate) => {
              try {
                const testConfig = { ...config, symbol: candidate.symbol, exchange: candidate.exchange };
                const cCandles = await this.fetchCandles(client, testConfig as any, entryTf.interval, now, undefined, undefined, { closedOnly: true });
                const emaPeriod = config.emaPeriod || 15;
                if (!cCandles || cCandles.length < emaPeriod + 2) return;
                const closedCCandles = filterClosedCandles(cCandles, now, entryTf.minutes);
                if (closedCCandles.length < 2) return;
                const cEmas = calculateEMA(closedCCandles, emaPeriod);
                const cVwaps = calculateVWAP(closedCCandles, config.vwapSource || 'close');
                await this.ensureVolumeBaseline(client, candidate.symbol, candidate.exchange, now, entryTf.interval);
                const setup = this.evaluateStockSetup(closedCCandles, cEmas, cVwaps, now, config, candidate.symbol, { interval: entryTf.interval });
                if (setup) {
                  activeSetups.push({
                    candidate: { ...candidate, score: candidate.score + setup.scoreBoost },
                    details: setup,
                  });
                }
              } catch (candErr: any) {
                this.logger.debug?.(`Candidate evaluation error for ${candidate.symbol}: ${candErr?.message}`);
              }
            }));
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
            logSignal('SCAN', state.strategyId, { top: candidates.slice(0, 10).map(c => ({ s: c.symbol, score: c.score, trend: c.trend, dayChg: +c.dayChangePct.toFixed(2), fromOpen: +c.changeFromOpenPct.toFixed(2), turnoverCr: +c.turnoverCr.toFixed(1), rvol: c.rvol !== undefined ? +c.rvol.toFixed(2) : null })) });
            const topList = candidates.slice(0, 4).map(c => `${c.symbol} (Score: ${c.score}, ${c.dayChangePct >= 0 ? '+' : ''}${c.dayChangePct.toFixed(1)}%)`).join(', ');
            const currentLeader = activeSetups.length > 0 ? activeSetups[0].candidate.symbol : (candidates[0]?.symbol || 'None');
            const setupDesc = candidates.length === 0
              ? '⚠ Scanner universe came back empty — Zerodha instrument/quote fetch likely failed or rate-limited; will retry next scan'
              : (activeSetups.length > 0 ? activeSetups[0].details.description : 'Monitoring 5m candles for breakout/breakdown trigger');
            this.log(state, `📡 [SCANNER HEARTBEAT] Scanned Nifty 500 & F&O leaders | Leaders: [${topList}] | Checked top ${evaluated.length} for setups (${activeSetups.length} active) | Tracking: [${currentLeader}] — ${setupDesc}`);
          }
        }
      }

      // Auto mode has no real symbol until the scanner picks one. The first scan can take longer than a tick
      // and is throttled to once per 30s, so ticks that arrive meanwhile must wait instead of asking Kite for
      // candles of the placeholder "AUTO" (which logged "Instrument token not found for AUTO").
      if (state.isAutoMode && !state.activeSymbol) return;

      const activeSym = state.activeSymbol || config.symbol;
      const scanConfig = { ...config, symbol: activeSym };

      await this.ensureTickSize(client, activeSym, config.exchange);

      const candles = await this.fetchCandles(client, scanConfig, entryTf.interval, now);
      if (candles.length < 2) return;

      // ── Filter for closed candles only ─────────────────────────────────────
      const closedCandles = filterClosedCandles(candles, now, entryTf.minutes);
      if (closedCandles.length < 2) return;

      // Don't scan for signals if the last closed candle is from a previous day
      const lastClosedDate = getIstDateStr(closedCandles[closedCandles.length - 1].date);
      const todayDate = getIstDateStr(now);
      if (lastClosedDate !== todayDate) return;

      const emas = calculateEMA(closedCandles, config.emaPeriod || 15);
      const vwaps = calculateVWAP(closedCandles, config.vwapSource || 'close');

      const lastIdx = closedCandles.length - 1, prevIdx = closedCandles.length - 2;
      const currEma = emas[lastIdx], prevEma = emas[prevIdx];
      const currVwap = vwaps[lastIdx], prevVwap = vwaps[prevIdx];

      if (currEma === null || prevEma === null || currVwap === null || prevVwap === null) return;

      // ── Confirmation / Breakout Check ──────────────────────────────────────
      if (state.waitingForConfirmation) {
        // Fast-pivot timeout: Allow max 2 entry candles for standard breakout/pullback setups, or 4 for opening drive
        const maxWaitCandles = (state.setupType === 'OPEN_LOW_DRIVE' || state.setupType === 'OPEN_HIGH_DRIVE') ? 4 : 2;
        const timeframeMs = entryTf.minutes * 60 * 1000;
        // Counted from the close of the candle the setup was detected on, so "2 candles" really means the next two
        // candles (a crossover found one or two candles late gets its full window instead of expiring at once).
        const armedAt = state.setupArmedAt ?? (state.setupTimestamp! + timeframeMs);
        const elapsed = now.getTime() - armedAt;
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

        const checkSymbol = activeSym;
        const checkExchange = config.exchange;
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
              await this.placeTrade(state, client, 'BUY', ltp, undefined, invPrice, confHigh);
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
              await this.placeTrade(state, client, 'SELL', ltp, undefined, confLow, invPrice);
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
          const rangeStr = this.formatCandleRange(closedCandles[lastIdx].date, entryTf.minutes);
          const closeTimeStr = this.formatCandleCloseTime(closedCandles[lastIdx].date, entryTf.minutes);
          const currEma = emas[lastIdx];
          const currVwap = vwaps[lastIdx];
          const closedCandle = closedCandles[lastIdx];
          this.log(state, `[${targetSym}] 🔍 ${entryTf.minutes}m Candle [${rangeStr}] closed at ${closeTimeStr} | Close: ₹${closedCandle.close.toFixed(2)} (H: ₹${closedCandle.high.toFixed(2)}, L: ₹${closedCandle.low.toFixed(2)}) | 15-EMA: ₹${currEma?.toFixed(2)}, VWAP: ₹${currVwap?.toFixed(2)}`);

          if (!state.waitingForConfirmation) {
            await this.ensureVolumeBaseline(client, targetSym, config.exchange, now, entryTf.interval);
            // 1m entries keep the 5m stop: the swing-shelf SL is built from 5m candles, including the one still
            // forming, so it exists from 09:16 even though the first 5m candle only closes at 09:20.
            let slCandles: Candle[] | undefined;
            if (entryTf.minutes === 1) {
              slCandles = await this.fetchCandles(client, scanConfig, '5minute', now)
                .catch(() => undefined);
            }
            const setup = this.evaluateStockSetup(closedCandles, emas, vwaps, now, config, targetSym, { interval: entryTf.interval, slCandles });
            const setupTimeMs = setup?.candleTime.getTime();
            const isAlreadyInvalidated = state.invalidatedCrossoverTime === setupTimeMs;

            if (setup && !isAlreadyInvalidated) {
              logSignal('SETUP', state.strategyId, { symbol: targetSym, trend: setup.trend, setupType: setup.setupType, trigger: setup.triggerHigh ?? setup.triggerLow, slPrice: setup.slPrice, scoreBoost: setup.scoreBoost, close: closedCandle.close, ema: currEma, vwap: currVwap, entryTf: entryTf.interval, paper: !!state.isPaperTrade });
              const checkSymbol = targetSym;
              const checkExchange = config.exchange;
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
                state.setupArmedAt = closedCandle.date.getTime() + entryTf.minutes * 60 * 1000;
                this.log(state, `[${targetSym}] 🚀 Detected ${setup.description}! Trigger High: ₹${(setup.triggerHigh || 0).toFixed(2)}, SL (${setup.slNote}): ₹${setup.slPrice.toFixed(2)}. Monitoring for trigger...`);

                // Instant execution check if already at/above trigger high:
                if (ltp && setup.triggerHigh && ltp >= setup.triggerHigh) {
                  this.log(state, `[${targetSym}] 🎯 Instant LONG Entry Triggered! ${setup.description} @ LTP ₹${ltp.toFixed(2)}`);
                  state.waitingForConfirmation = null;
                  state.confirmationHigh = null;
                  state.invalidationPrice = null;
                  state.setupTimestamp = null;
                  state.setupType = undefined;
                  await this.placeTrade(state, client, 'BUY', ltp, undefined, setup.slPrice, setup.triggerHigh);
                }
              } else if (setup.trend === 'SHORT') {
                state.waitingForConfirmation = 'SHORT';
                state.setupType = setup.setupType;
                state.confirmationHigh = null;
                state.confirmationLow = setup.triggerLow;
                state.invalidationPrice = setup.slPrice;
                state.setupTimestamp = setupTimeMs!;
                state.setupArmedAt = closedCandle.date.getTime() + entryTf.minutes * 60 * 1000;
                this.log(state, `[${targetSym}] 🚀 Detected ${setup.description}! Trigger Low: ₹${(setup.triggerLow || 0).toFixed(2)}, SL (${setup.slNote}): ₹${setup.slPrice.toFixed(2)}. Monitoring for trigger...`);

                // Instant execution check if already at/below trigger low:
                if (ltp && setup.triggerLow && ltp <= setup.triggerLow) {
                  this.log(state, `[${targetSym}] 🎯 Instant SHORT Entry Triggered! ${setup.description} @ LTP ₹${ltp.toFixed(2)}`);
                  state.waitingForConfirmation = null;
                  state.confirmationLow = null;
                  state.invalidationPrice = null;
                  state.setupTimestamp = null;
                  state.setupType = undefined;
                  await this.placeTrade(state, client, 'SELL', ltp, undefined, setup.triggerLow, setup.slPrice);
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

  private async placeTrade(state: StrategyState, client: any, side: 'BUY' | 'SELL', triggerPrice: number, triggerTime?: Date, motherLow?: number, motherHigh?: number) {
    const { config } = state;
    if (!this.running.has(state.strategyId)) {
      this.logger.warn(`[ABORT] Strategy ${state.strategyId} has been stopped. Aborting trade placement.`);
      return;
    }
    if (state.entryTriggered || state.isPlacingTrade) {
      this.log(state, `⛔ Strategy already has an active open position (${state.entryTriggered}) or order in-flight. Skipping 2nd trade.`);
      return;
    }
    if (!triggerTime) {
      const rejectedSym = state.activeSymbol || config.symbol;
      const blockedUntil = state.rejectedSymbols?.get(rejectedSym);
      if (blockedUntil && Date.now() < blockedUntil) {
        this.log(state, `⏭ ${rejectedSym}: skipping ${side} — Zerodha refused an entry in this stock earlier (blocked until ${this.formatTime(new Date(blockedUntil))}).`);
        return;
      }
    }
    // Setups may trigger at ANY time of the session. The only limits: an optional user-set entryCutoffTime, and a hard
    // technical stop at 15:00 IST because every position is force-squared-off at 15:05 (an entry after 15:00 could only pay costs).
    if (!triggerTime) {
      const nowHhmm = getIstHhmm(new Date());
      let cutoffHhmm = 15 * 60;
      const userCutoff = (config as any).entryCutoffTime;
      if (userCutoff) {
        const [cH, cM] = String(userCutoff).split(':').map((v: string) => parseInt(v, 10));
        if (Number.isFinite(cH)) cutoffHhmm = Math.min(cutoffHhmm, cH * 60 + (Number.isFinite(cM) ? cM : 0));
      }
      if (nowHhmm >= cutoffHhmm) {
        this.log(state, `⏱ Entry window closed (${Math.floor(cutoffHhmm / 60)}:${String(cutoffHhmm % 60).padStart(2, '0')} IST). Skipping ${side} signal.`);
        return;
      }
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
      // Hard daily cap: re-count today's trades from Zerodha's order book (paper: saved orders) before every entry.
      // The in-memory counter can be lost or wrong after a restart; this count cannot. Unreadable = no entry.
      if (!triggerTime) {
        const tradesToday = await countTodaysTradesForEntry({ prisma: this.prisma, factory: this.factory, strategyId: state.strategyId, brokerAccountId: state.brokerAccountId, isPaper: state.isPaperTrade });
        if (tradesToday === null) {
          this.log(state, `⛔ Could not verify today's trade count (Zerodha and DB unreadable) — skipping this ${side} to stay within the ${config.maxTradesPerDay}-trade limit.`);
          return;
        }
        if (tradesToday >= config.maxTradesPerDay) {
          state.tradesPlacedToday = Math.max(state.tradesPlacedToday, tradesToday);
          this.log(state, `⛔ Daily trade limit reached: ${tradesToday}/${config.maxTradesPerDay} trades already taken today (re-checked against Zerodha / saved orders). Skipping trade.`);
          return;
        }
      }

      const isHistorical = !!triggerTime;
      const kite = client['kite'];

      // Optional NIFTY 50 alignment gate (OFF by default: individual stocks often move independently of the index).
      // It was previously documented as default-on but never called; it now only runs when explicitly enabled.
      if (!isHistorical && (config as any).enableMarketTrendFilter === true) {
        const align = await this.checkMarketTrendAlignment(client, side === 'BUY' ? 'LONG' : 'SHORT');
        if (!align.isAligned) {
          this.log(state, `🧭 Market filter: skipping ${side} — ${align.reason}`);
          return;
        }
      }

      const symbol = state.activeSymbol || config.symbol, exchange = config.exchange, finalSide: 'BUY' | 'SELL' = side;
      const product = (config as any).product ?? 'MIS';
      this.log(state, `📈 Equity mode — trading ${exchange}:${symbol} directly`);
      await this.ensureTickSize(client, symbol, exchange);
      const symTickSize = getInstrumentTickSize(symbol, triggerPrice);
      const entry = this.roundTick(triggerPrice, symbol);
      let sl: number;
      let tgt: number;

      const maxRiskThresholdRs = config.stopLossRs && config.stopLossRs > 0 ? config.stopLossRs : 500;
      const maxStopPct = this.getMaxStopPct(config);

      if (finalSide === 'BUY') {
        // True Structural Swing Shelf SL: Place comfortably below entry/swing shelf low with breathing buffer
        let rawSl: number;
        if (motherLow && motherLow < entry) {
          const buffer = Math.max(symTickSize * 4, motherLow * 0.002);
          rawSl = motherLow <= (entry - buffer) ? (motherLow - buffer) : (entry - buffer);
        } else {
          rawSl = entry - Math.max(symTickSize * 10, entry * 0.011);
        }
        // Strict Intraday Equity SL boundaries: Max maxStopPct of entry price (default 2.2%, accommodating true mother low/day low), Min 0.85% breathing distance
        const maxAllowedDist = Math.max(symTickSize * 15, entry * maxStopPct / 100);
        const minBreathingDist = Math.max(symTickSize * 8, entry * Math.min(MIN_STOP_PCT, maxStopPct) / 100);
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
        // Strict Intraday Equity SL boundaries: Max maxStopPct of entry price (default 2.2%, accommodating true mother high/day high), Min 0.85% breathing distance
        const maxAllowedDist = Math.max(symTickSize * 15, entry * maxStopPct / 100);
        const minBreathingDist = Math.max(symTickSize * 8, entry * Math.min(MIN_STOP_PCT, maxStopPct) / 100);
        const boundedSl = Math.max(entry + minBreathingDist, Math.min(rawSl, entry + maxAllowedDist));
        sl = this.roundTick(boundedSl, symbol);
        if (sl <= entry) sl = this.roundTick(entry + symTickSize * 5, symbol);
        const risk = Math.max(symTickSize, Math.abs(sl - entry));
        tgt = config.enableProfitFloor !== false ? this.roundTick(entry - risk * 2.0, symbol) : this.roundTick(entry - risk * 1.5, symbol);
      }

      let logicalTargetInfo: { targetPrice: number; targetReason: string; fib1272: number; fib1618: number; pdh: number | null; pdl: number | null; pdc: number | null } | null = null;
      let stockMetrics: { dailyAtrPct: number; dynamicExhaustionPct: number; dynamicOpeningCapPct: number; dynamicExtensionPct: number; dynamicParabolicPct: number } | null = null;
      state.fibLevels = null;
      state.fibRetryAt = 0;

      try {
        const histCandles = await this.fetchCandles(client, config, '5minute', triggerTime || new Date(), symbol, exchange);
        if (histCandles && histCandles.length > 0) {
          stockMetrics = this.calculateDynamicStockMetrics(histCandles, triggerTime || new Date(), symbol);
          state.dailyAtrPct = stockMetrics.dailyAtrPct;
          state.dynamicParabolicPct = stockMetrics.dynamicParabolicPct;

          logicalTargetInfo = this.calculateLogicalTarget(
            histCandles,
            entry,
            sl,
            finalSide,
            symbol,
            triggerTime || new Date()
          );

          tgt = logicalTargetInfo.targetPrice;
          state.logicalTargetReason = logicalTargetInfo.targetReason;
          state.pdh = logicalTargetInfo.pdh ?? undefined;
          state.pdl = logicalTargetInfo.pdl ?? undefined;
          state.pdc = logicalTargetInfo.pdc ?? undefined;
          state.fibLevels = this.calculateOpeningFib(histCandles, finalSide === 'BUY' ? 'LONG' : 'SHORT', triggerTime || new Date(), symbol);
        }
      } catch (targetErr: any) {
        this.log(state, `⚠ Historical candles for logical target fetch notice: ${targetErr.message}`);
      }

      // ── Volatility-based target (equity; FULL / PARTIAL / QUICK modes) ────────────
      const targetMode = this.getTargetMode(config);
      if (targetMode !== 'FIXED_RS') {
        const vt = this.calculateVolatilityTarget(entry, sl, finalSide, targetMode, config, state.dailyAtrPct, symbol);
        tgt = vt.targetPrice;
        state.logicalTargetReason = vt.reason;
        this.log(state, `🎯 [TARGET MODE: ${targetMode}] ${vt.reason}`);
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
        const sessionAtr = this.dailyAtrBySymbol.get(symbol);
        const atrStr = stockMetrics
          ? `${stockMetrics.dailyAtrPct.toFixed(2)}% (${sessionAtr && sessionAtr.dateStr === getIstDateStr(triggerTime || new Date()) ? `${sessionAtr.sessions} sessions` : 'last 2-3 sessions'})`
          : 'N/A';
        // Reference levels only: the target itself is the [TARGET MODE] line above (the Fibonacci/PDC levels are not used for exits).
        this.log(
          state,
          `📐 [KEY LEVELS] PDH: ${pdhStr} | PDL: ${pdlStr} | PDC: ${pdcStr} | Daily ATR: ${atrStr} | Stop: ₹${sl.toFixed(2)} (${((Math.abs(entry - sl) / entry) * 100).toFixed(2)}% from entry, max ${this.getMaxStopPct(config)}%)`
        );
      }

      if (state.fibLevels) this.log(state, this.formatFibLog(state.fibLevels));

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
        const isFuture = Boolean(symbol.endsWith('FUT') || exchange === 'NFO' || exchange === 'BFO');
        if ((config as any).allowNrmlFallback === true && isRejectedOrFailed && finalSide === 'BUY' && !isFuture && usedProduct === 'MIS') {
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
              this.blockRejectedSymbol(state, symbol, rejectReason);
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
                  this.blockRejectedSymbol(state, symbol, `${rejectReason} / NRML: ${nrmlOrder.status_message || status}`);
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
              this.blockRejectedSymbol(state, symbol, `${rejectReason} / NRML: ${nrmlErr.message}`);
              return;
            }
          }
        }

        if (isRejectedOrFailed) {
          if (!initialOrderError && entryId) {
            state.tradesPlacedToday = Math.max(0, state.tradesPlacedToday - 1);
          }
          this.blockRejectedSymbol(state, symbol, rejectReason);
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
            ? this.roundTick(sl + symTickSize * 3, symbol)
            : this.roundTick(sl - symTickSize * 3, symbol);
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
            const rideNote = this.getTargetMode(config) === 'EMA'
              ? `no target order — exits on a 5m candle close across the 15-EMA, the stop, or 15:05 (₹${tgtPrice.toFixed(2)} is a reference level only)`
              : `part books at ₹${tgtPrice.toFixed(2)}, the rest rides the 15-EMA candle-close exit`;
            this.log(state, `💡 Trend Trailing Mode active — SL placed at broker for ${state.executedQty} shares (Trigger: ₹${slTriggerPrice.toFixed(2)}, Limit: ₹${slLimitPrice.toFixed(2)}); ${rideNote}.`);
          }
        } else {
          this.log(state, `⏳ Entry order pending execution. Stop Loss order will be placed as soon as initial shares fill.`);
        }
      }

      state.entryTriggered = side === 'BUY' ? 'LONG' : 'SHORT';
      state.stopLossPrice = sl;
      state.initialStopPrice = sl;
      state.profitLockStep = 0;
      state.targetPrice = tgt;
      const placedMode = this.getTargetMode(config);
      state.partialTargetPrice = (placedMode === 'PARTIAL' || placedMode === 'QUICK') ? tgt : null;
      state.partialBooked = false;
      state.partialAttempts = 0;
      state.isBookingPartial = false;
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
      const symTickSize = getInstrumentTickSize(symbol, state.stopLossPrice);
      const isLong = state.entryTriggered === 'LONG';
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

      // Never loosen the exchange stop: only tighten (raise for longs / lower for shorts).
      if (state.lastBrokerSlTrigger !== undefined && (isLong ? triggerPrice < state.lastBrokerSlTrigger : triggerPrice > state.lastBrokerSlTrigger)) {
        return;
      }

      const k = kite || client?.['kite'] || client;
      let modifyError: any = null;
      if (client && client.modifyOrder) {
        await client.modifyOrder(state.slOrderId, { triggerPrice, price }).catch((e: any) => { modifyError = e; });
      } else if (k && k.modifyOrder) {
        await k.modifyOrder('regular', state.slOrderId, { trigger_price: triggerPrice, price }).catch((e: any) => { modifyError = e; });
      } else {
        return;
      }
      state.lastBrokerSlModifyTime = now;
      if (modifyError) {
        // Do NOT record as synced — next tick retries. Broker keeps the previous (safe, looser) stop meanwhile.
        this.logger.warn(`Broker SL modify failed (will retry): ${modifyError.message}`);
        return;
      }
      state.lastBrokerSlTrigger = triggerPrice;
      this.log(state, `🛡 Synced Trailing SL to Zerodha Exchange (${state.slOrderId}) -> Trigger: ₹${triggerPrice.toFixed(2)}, Limit: ₹${price.toFixed(2)}`);
    } catch (e: any) {
      this.logger.warn(`Failed to update broker SL order: ${e.message}`);
    }
  }

  private async startRealtimeMonitor(state: StrategyState, client: any) {
    if (!state.entryTriggered) return;
    // Never leave an older listener running: it would keep writing its own symbol's price into this trade's state.
    if (state.tickerUnsubscribe) this.stopRealtimeMonitor(state);

    const symbol = state.activeSymbol || state.config.symbol;
    const exchange = state.config.exchange;
    // A paper position recovered after a restart without a Zerodha login has no client: it is still adopted and
    // watched (prices arrive once a session exists); only live-order calls need `kite`.
    const kite = client?.['kite'] ?? null;

    // Dynamically subscribe the traded symbol to the WebSocket
    try {
      await this.tickerService.subscribeSymbol(state.brokerAccountId, symbol);
      this.log(state, `📡 Live tracking activated for ${exchange}:${symbol}`);
    } catch (e: any) {
      this.log(state, `⚠ WebSocket subscribe notice: ${e.message}. Polling active.`);
    }

    state.lastPnlLogTime = 0;
    state.realtimeActive = true;
    let isExiting = false;

    const unsubscribe = this.tickerService.registerListener(async (ticks) => {
      // Process ticks for our symbol (or exchange prefixed symbol)
      // Exchange-prefixed key first: the bare key can carry another exchange's price (BSE listing of the same stock).
      const currentPrice = ticks[`${exchange || 'NSE'}:${symbol}`] || ticks[symbol];
      if (!currentPrice || !state.entryTriggered || isExiting || state.isExiting) return;

      const now = Date.now();
      state.lastTickTime = now;
      state.currentLtp = currentPrice;
      // Live entry still working with nothing filled: no position yet. The poll monitor's fill sync arms the stop on the
      // first fill and cancels the entry after 15s; exit rules must not fire on an order that never filled.
      if (!state.isPaperTrade && !((state.executedQty || 0) > 0)) return;

      const isLong = state.entryTriggered === 'LONG';
      const activeQty = state.executedQty || state.config.qty;
      const pnlPoints = isLong ? (currentPrice - state.entryPrice!) : (state.entryPrice! - currentPrice);
      const pnlRs = pnlPoints * activeQty;
      const pnlPct = state.entryPrice ? (pnlPoints / state.entryPrice) * 100 : 0;

      state.currentPnlRs = pnlRs;
      state.currentPnlPct = pnlPct;
      state.peakPnlRs = Math.max(state.peakPnlRs || 0, pnlRs);

      // ── 1. 3:05 PM IST Mandatory EOD Cutoff (Exits safely before Zerodha 3:12 PM RMS) ──
      // Only the listener's own flag is set here: exitPosition() takes state.isExiting itself and ignores the call
      // when it is already set, which would leave the position open with the lock stuck.
      const currentHhmm = getIstHhmm(new Date());
      if (currentHhmm >= 15 * 60 + 5 && state.entryTriggered) {
        if (isExiting || state.isExiting) return;
        isExiting = true;
        this.log(state, `⏰ 3:05 PM Intraday EOD Cutoff reached! Auto-squaring off position (Current P&L: ₹${pnlRs.toFixed(2)}) to avoid Zerodha RMS penalty charges...`);
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
        await this.persistLogs(state);
        return;
      }

      // ── 1.05 Intraday Stagnation Exit (Time Stop for Chop Traps like LODHA; config.stagnationMinutes, default 35, 0 = off) ──
      const stagnationMs = this.getStagnationMs(state.config);
      if (stagnationMs !== null && state.entryTime && state.entryTriggered) {
        const entryDurationMs = now - new Date(state.entryTime).getTime();
        // Held for the stagnation window and still within 0.25% of entry (stagnant dead chop)
        if (entryDurationMs >= stagnationMs && Math.abs(pnlPct) < 0.25) {
          if (isExiting || state.isExiting) return;
          isExiting = true;
          this.log(
            state,
            `⏱ [STAGNATION EXIT] ${symbol} has remained flat (< 0.25% move) for ${Math.round(stagnationMs / 60000)}+ mins. Auto-squaring off near breakeven (P&L: ₹${pnlRs.toFixed(2)}) to liberate margin for active momentum leaders!`
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
          if (isHybridEnabled && state.lastEma) {
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

      // ── 1.9 Partial profit booking (PARTIAL / QUICK target modes) ─────────────
      if (this.isPartialBookingDue(state, currentPrice)) {
        await this.bookPartial(state, client, kite, currentPrice);
      }

      // ── 1.95 Profit lock (EMA ride mode): +1.5R → stop to +0.5R, +3R → stop to +2R ──
      await this.applyProfitLock(state, client, kite, symbol, currentPrice);

      // ── 2. Uncapped Trend Rider: 15-EMA & VWAP Dynamic Trailing ───────────────
      const entryPrice = state.entryPrice || currentPrice;
      const moveFromEntryPct = entryPrice > 0 ? (isLong ? (currentPrice - entryPrice) / entryPrice : (entryPrice - currentPrice) / entryPrice) * 100 : 0;
      const isTrailingEnabled = state.config.enableProfitFloor !== false && !state.config.exitExactAtTarget;
      const isTarget1Reached = isLong ? (currentPrice >= state.targetPrice!) : (currentPrice <= state.targetPrice!);

      // ── 2.1 Parabolic Mode & VWAP Profit-Lock (TTML Spike Protection) ──────────
      const parabolicThreshold = state.dynamicParabolicPct || 2.5;
      const isParabolicTrigger = moveFromEntryPct >= parabolicThreshold;
      if (this.isTickTrailExitEnabled(state) && state.config.enableParabolicVwapLock !== false && isParabolicTrigger) {
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
      if (this.isTickTrailExitEnabled(state) && state.lastEma && state.lastVwap) {
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
      if (this.isTickTrailExitEnabled(state) && state.isTrailingEma) {
        let dynamicTrailingSl: number | null = null;
        if (state.lastEma && state.lastVwap) {
          dynamicTrailingSl = isLong ? Math.max(state.lastEma, state.lastVwap) : Math.min(state.lastEma, state.lastVwap);
        } else if (state.lastEma) {
          dynamicTrailingSl = state.lastEma;
        } else if (state.lastVwap) {
          dynamicTrailingSl = state.lastVwap;
        }

        if (dynamicTrailingSl !== null) {
          // Ratchet only: a stored stop-loss may tighten but never loosen.
          const existingSl = state.stopLossPrice;
          if (existingSl == null || (isLong ? dynamicTrailingSl > existingSl : dynamicTrailingSl < existingSl)) {
            state.stopLossPrice = dynamicTrailingSl;
          }
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
        const isSlBreached = isLong ? currentPrice <= state.stopLossPrice! : currentPrice >= state.stopLossPrice!;
        // The target only counts when a broker target order exists (FULL / fixed-₹ modes). Trend-riding modes have none, and
        // price can sit beyond their reference target for hours: polling the order book on every tick there is wasted calls.
        const isPastTarget = !!state.targetOrderId && (isLong ? currentPrice >= state.targetPrice! : currentPrice <= state.targetPrice!);
        const isNearBoundary = isSlBreached || isPastTarget;
        if (!isSlBreached) state.slBreachAt = null;

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
          } catch (e: any) {
            this.logger.error(`[RT] Order check error: ${e.message}`);
          }
          // Gap through the stop: the exchange SL is a LIMIT a few ticks past its trigger, so a fast move can jump
          // the limit and leave it unfilled. If price stays beyond the SL for the grace period, exit at market.
          if (isSlBreached) {
            if (!state.slBreachAt) {
              state.slBreachAt = now;
            } else if (now - state.slBreachAt >= SL_BREACH_GRACE_MS) {
              this.log(state, `🛑 ${symbol} ₹${currentPrice.toFixed(2)} has been beyond the SL ₹${state.stopLossPrice!.toFixed(2)} for ${Math.round((now - state.slBreachAt) / 1000)}s and the broker SL has not filled — exiting at market.`);
              state.slBreachAt = null;
              this.stopRealtimeMonitor(state);
              await this.exitPosition(state, client, currentPrice, 'SL');
              await this.persistLogs(state);
              return;
            }
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

  /**
   * Zerodha refused a new entry in this stock. MIS blocked for the stock (or another product restriction) holds all
   * day, so it is skipped until tomorrow; any other refusal (margin, a transient RMS rule) skips it for 15 minutes.
   * Applies to the scanner (auto mode) and to placeTrade (any mode), so the same refused order is not sent again.
   */
  private blockRejectedSymbol(state: StrategyState, symbol: string, reason: string) {
    if (!symbol) return;
    const allDay = /\bMIS\b|blocked|not allowed|product/i.test(reason || '');
    const until = allDay
      ? new Date(`${getIstDateStr(new Date())}T23:59:59.999+05:30`).getTime()
      : Date.now() + 15 * 60 * 1000;
    if (!state.rejectedSymbols) state.rejectedSymbols = new Map();
    state.rejectedSymbols.set(symbol, until);
    this.log(state, `⏸ ${symbol} skipped ${allDay ? 'for the rest of the day' : 'for 15 minutes'} after Zerodha refused the entry${reason ? ` (${reason})` : ''}.`);
  }

  /** The strategy's own Zerodha position row: its exchange and product (a manual CNC/BSE trade in the stock is another row). */
  private brokerMatch(state: StrategyState): { exchange: string; product: string } {
    return { exchange: state.config.exchange || 'NSE', product: (state.config as any).product ?? 'MIS' };
  }

  /** Symbols the scanner must not pick: post-exit / expired-setup cooldowns and broker-refused stocks. */
  private excludedSymbols(state: StrategyState): Set<string> {
    const out = new Set<string>(state.cooldownSymbols?.keys() || []);
    const nowMs = Date.now();
    for (const [sym, until] of state.rejectedSymbols ?? []) {
      if (nowMs < until) out.add(sym);
      else state.rejectedSymbols!.delete(sym);
    }
    return out;
  }

  /**
   * Cancels whatever is left of a working entry order and syncs the filled quantity and price from the order book.
   * FILLED: shares are held, go on with the exit. UNFILLED: nothing filled, the entry is forgotten (not a trade).
   * UNCONFIRMED: the order book could not confirm the entry is final; the position stays active and is retried.
   */
  private async settlePendingEntry(state: StrategyState, client: any): Promise<'FILLED' | 'UNFILLED' | 'UNCONFIRMED'> {
    const kite = client['kite'];
    const entryId = state.entryOrderId!;
    const FINAL = ['COMPLETE', 'CANCELLED', 'REJECTED'];
    const read = async (): Promise<any | null> => {
      const orders: any[] | null = await kite.getOrders().catch(() => null);
      return orders?.find((o: any) => o.order_id === entryId) ?? null;
    };

    let order = await read();
    if (order && !FINAL.includes(order.status)) {
      this.log(state, `⏳ Entry order ${entryId} is still ${order.status} (${Number(order.filled_quantity) || 0}/${order.quantity} filled) — cancelling the rest before the exit.`);
      await this.cancelBrokerOrderSafe(client, entryId);
      for (let i = 0; i < 4 && !FINAL.includes(order.status); i++) {
        await new Promise(r => setTimeout(r, 500));
        order = (await read()) ?? order;
      }
    }

    if (!order) {
      if ((state.executedQty || 0) > 0) return 'FILLED';
      this.log(state, `⚠ Entry order ${entryId} not found in the order book — checking again on the next poll before exiting.`);
      return 'UNCONFIRMED';
    }

    const filled = Number(order.filled_quantity) || 0;
    if (filled > (state.executedQty || 0)) {
      state.executedQty = filled;
      if (Number(order.average_price) > 0) state.entryPrice = Number(order.average_price);
    }
    if (!FINAL.includes(order.status)) {
      this.log(state, `⚠ Entry order ${entryId} is still ${order.status} after the cancel request — keeping the position active and retrying on the next poll.`);
      return 'UNCONFIRMED';
    }
    if ((state.executedQty || 0) > 0) {
      state.config.qty = state.executedQty!;
      return 'FILLED';
    }
    this.clearUnfilledEntry(state);
    this.log(state, `ℹ Entry order ${entryId} ${order.status} with nothing filled — no position to exit, not counted as a trade (${state.tradesPlacedToday}/${state.config.maxTradesPerDay}).`);
    return 'UNFILLED';
  }

  /** Forgets an entry that was cancelled with nothing filled: no position, and it does not count toward maxTradesPerDay. */
  private clearUnfilledEntry(state: StrategyState) {
    this.stopRealtimeMonitor(state);
    state.tradesPlacedToday = Math.max(0, state.tradesPlacedToday - 1);
    state.entryTriggered = null;
    state.entryOrderId = null;
    state.executedQty = 0;
    state.entryPrice = null;
    state.entryTime = null;
    state.stopLossPrice = null;
    state.targetPrice = null;
    state.slOrderId = null;
    state.targetOrderId = null;
    state.setupTimestamp = null;
    state.partialTargetPrice = null;
    state.partialBooked = false;
    state.currentLtp = undefined;
    state.currentPnlRs = 0;
    state.peakPnlRs = 0;
    state.isTrailingEma = false;
    state.initialStopPrice = undefined;
    state.profitLockStep = 0;
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

    const symbol = state.activeSymbol || state.config.symbol;
    const exchange = state.config.exchange;
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
            const exitSide = state.entryTriggered === 'LONG' ? 'SELL' : 'BUY';
            if (state.slOrderId) {
              try {
                await kite.modifyOrder('regular', state.slOrderId, { quantity: state.executedQty });
                this.log(state, `🔄 Modified broker SL order (${state.slOrderId}) quantity to ${state.executedQty} shares`);
              } catch (modErr: any) {
                this.log(state, `⚠ Failed to modify SL order qty: ${modErr.message}`);
              }
            } else if (state.stopLossPrice) {
              const symTickSize = getInstrumentTickSize(symbol, state.entryPrice || 0);
              const slLimitPrice = exitSide === 'BUY'
                ? this.roundTick(state.stopLossPrice + symTickSize * 3, symbol)
                : this.roundTick(state.stopLossPrice - symTickSize * 3, symbol);
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

          // The entry ended (rejected by the exchange/RMS after the first check, or cancelled outside the engine) with
          // nothing filled: there is no position. Forget it instead of waiting on it for the rest of the day.
          if ((status === 'REJECTED' || status === 'CANCELLED') && filled === 0 && !((state.executedQty || 0) > 0)) {
            const reason = entryOrder.status_message || status;
            const sym = state.activeSymbol || state.config.symbol;
            this.clearUnfilledEntry(state);
            this.log(state, `❌ Entry order ${entryOrder.order_id} ${status} with nothing filled${reason ? `: ${reason}` : ''} — not counted as a trade (${state.tradesPlacedToday}/${state.config.maxTradesPerDay}).`);
            if (status === 'REJECTED') this.blockRejectedSymbol(state, sym, reason);
            return;
          }

          // Timeout check: If entry order is >15s old and still OPEN / partial, cancel remainder
          const orderAgeMs = Date.now() - (state.setupTimestamp || 0);
          if (orderAgeMs > 15000 && (status === 'OPEN' || status === 'TRIGGER PENDING')) {
            if (filled === 0) {
              this.log(state, `⏳ Entry order ${state.entryOrderId} unfilled after 15s timeout. Cancelling order...`);
              await this.cancelBrokerOrderSafe(client, state.entryOrderId);
              // The cancel can lose a race with a fill, so check the order again before forgetting the position.
              const after = ((await kite.getOrders().catch(() => [])) as any[]).find((o: any) => o.order_id === state.entryOrderId);
              const filledAfter = Number(after?.filled_quantity) || 0;
              if (filledAfter > 0) {
                state.executedQty = filledAfter;
                if (Number(after.average_price) > 0) state.entryPrice = Number(after.average_price);
                this.log(state, `📈 Entry order filled ${filledAfter} share(s) while it was being cancelled — keeping the position; the stop-loss is armed on this check.`);
              } else if (after && (after.status === 'CANCELLED' || after.status === 'REJECTED')) {
                this.clearUnfilledEntry(state);
                this.log(state, `ℹ Entry order cancelled with nothing filled — not counted as a trade (${state.tradesPlacedToday}/${state.config.maxTradesPerDay}).`);
                return;
              } else {
                this.log(state, `⚠ Entry order ${state.entryOrderId} is still ${after?.status ?? 'unconfirmed'} after the cancel request — checking again on the next poll.`);
                return;
              }
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

    // ── 0b. Missing Stop-Loss Safety Net (retry if broker SL was never armed) ──
    // Unlike the partial-fill sync above (gated on executedQty < config.qty), this runs on
    // every poll regardless of fill completeness, so a fully-filled entry whose initial SL
    // placement failed still gets a broker-side stop instead of running unprotected forever.
    if (!state.isPaperTrade && kite && state.entryTriggered && (state.executedQty || 0) > 0 &&
      (!state.slOrderId || state.slOrderId === 'FAILED') && state.stopLossPrice &&
      (Date.now() - (state.lastSlArmRetryTime || 0) > 5000)) {
      state.lastSlArmRetryTime = Date.now();
      try {
        const exitSideRetry = state.entryTriggered === 'LONG' ? 'SELL' : 'BUY';
        const symTickSizeRetry = getInstrumentTickSize(symbol, state.entryPrice || 0);
        const slLimitPriceRetry = exitSideRetry === 'BUY'
          ? this.roundTick(state.stopLossPrice + symTickSizeRetry * 3, symbol)
          : this.roundTick(state.stopLossPrice - symTickSizeRetry * 3, symbol);
        const slTriggerPriceRetry = this.roundTick(state.stopLossPrice, symbol);
        const retrySlOrderId = await this.placeOrder(state, {
          symbol,
          exchange,
          product: state.config.product ?? 'MIS',
          qty: state.executedQty!,
          side: exitSideRetry,
          orderType: 'SL',
          price: slLimitPriceRetry,
          triggerPrice: slTriggerPriceRetry,
          intent: 'PROTECTIVE'
        }).catch((e: any) => { this.log(state, `❌ SL retry failed: ${e.message}`); return null; });
        if (retrySlOrderId) {
          state.slOrderId = retrySlOrderId;
          this.log(state, `🛡 Re-armed missing Stop Loss at broker (${state.executedQty} shares) after earlier placement failure: Trigger ₹${slTriggerPriceRetry.toFixed(2)} | OrderId: ${retrySlOrderId}`);
        } else {
          this.log(state, `⚠ Position still has NO broker-side Stop Loss protection — will retry again next poll.`);
        }
      } catch (e: any) {
        this.log(state, `⚠ SL retry attempt error: ${e.message}`);
      }
    }

    // ── 1. 3:05 PM Mandatory EOD Cutoff ──────────────────────────────────────
    const currentHhmm = getIstHhmm(new Date());
    if (currentHhmm >= 15 * 60 + 5 && state.entryTriggered) {
      let exitPrice = state.currentLtp || state.entryPrice || 0;
      try {
        const ltpData = await kite.getLTP([key]);
        if (ltpData[key]?.last_price) exitPrice = ltpData[key].last_price;
      } catch { }

      const isLong = state.entryTriggered === 'LONG';
      const activeQty = state.executedQty || state.config.qty;
      const finalPnl = (isLong ? (exitPrice - state.entryPrice!) : (state.entryPrice! - exitPrice)) * activeQty;

      this.log(state, `⏰ 3:05 PM Mandatory Intraday EOD Cutoff reached! Auto-squaring off position (Current P&L: ₹${finalPnl.toFixed(2)}) to avoid Zerodha RMS charges...`);
      this.stopRealtimeMonitor(state);
      await this.exitPosition(state, client, exitPrice, 'FORCE_CLOSE');
      await this.persistLogs(state);
      return;
    }

    // Entry still working with nothing filled (live): no position to manage yet. Step 0 above syncs fills and cancels
    // the entry after 15s; the 15:05 cutoff above settles it through exitPosition().
    if (!state.isPaperTrade && !((state.executedQty || 0) > 0)) return;

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
      } catch (e: any) {
        this.log(state, `⚠ LTP API check notice for ${symbol}: ${e.message}`);
      }
    }

    if (!currentPrice) {
      this.log(state, `⏳ Waiting for live price tick for ${symbol}...`);
      return;
    }

    const isLong = state.entryTriggered === 'LONG';
    const activeQty = state.executedQty || state.config.qty;
    const pnlPoints = isLong ? (currentPrice - state.entryPrice!) : (state.entryPrice! - currentPrice);
    const pnlRs = pnlPoints * activeQty;
    const pnlPct = state.entryPrice ? (pnlPoints / state.entryPrice) * 100 : 0;

    state.currentPnlRs = pnlRs;
    state.currentPnlPct = pnlPct;
    state.peakPnlRs = Math.max(state.peakPnlRs || 0, pnlRs);

    // Stagnation time-stop (config.stagnationMinutes). The websocket listener runs it on every tick; while the feed is silent
    // it runs here on the polled price instead, so it keeps working through a feed reconnect.
    const stagnationMs = this.getStagnationMs(state.config);
    if (isWebSocketStale && stagnationMs !== null && state.entryTime && Date.now() - new Date(state.entryTime).getTime() >= stagnationMs && Math.abs(pnlPct) < 0.25) {
      this.log(state, `⏱ [STAGNATION EXIT] ${symbol} has remained flat (< 0.25% move) for ${Math.round(stagnationMs / 60000)}+ mins. Auto-squaring off near breakeven (P&L: ₹${pnlRs.toFixed(2)}) to liberate margin for active momentum leaders!`);
      if (!state.cooldownSymbols) state.cooldownSymbols = new Map();
      state.cooldownSymbols.set(symbol, Date.now() + 30 * 60 * 1000);
      this.stopRealtimeMonitor(state);
      await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
      await this.persistLogs(state);
      return;
    }

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
        if (isHybridEnabled && state.lastEma) {
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

    // ── Partial profit booking (PARTIAL / QUICK target modes) ────────────────
    if (this.isPartialBookingDue(state, currentPrice)) {
      await this.bookPartial(state, client, kite, currentPrice);
    }

    // ── Profit lock (EMA ride mode) ──────────────────────────────────────────
    await this.applyProfitLock(state, client, kite, symbol, currentPrice);

    // ── Uncapped Trend Rider: 15-EMA & VWAP Dynamic Trailing ─────────────────
    // Check Target 1 / Dynamic VWAP & EMA Trailing
    if ((pnlRs >= targetThresholdRs || isTarget1Reached) && !state.isTrailingEma && isTrailingEnabled && this.isTickTrailExitEnabled(state)) {
      state.isTrailingEma = true;
      this.log(state, `📈 Target 1 reached (Target: ₹${state.targetPrice?.toFixed(2)}, P&L: ₹${pnlRs.toFixed(2)})! Activated Dynamic VWAP & 15-EMA Trailing SL — riding trend...`);
      if (state.targetOrderId && !state.isPaperTrade) {
        await this.cancelBrokerOrderSafe(client, state.targetOrderId);
        state.targetOrderId = null;
      }
    }

    if (state.isTrailingEma && !state.config.exitExactAtTarget && this.isTickTrailExitEnabled(state)) {
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
      } catch (e: any) {
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

    // A LIMIT entry may still be working at the broker (nothing or only part filled). Settle it first: cancel what is
    // left and take the real filled quantity, so no order is left behind that could open a position nobody manages.
    if (!state.isPaperTrade && state.entryOrderId && client?.['kite'] && (state.executedQty || 0) < (state.config.qty || 0)) {
      let settled: 'FILLED' | 'UNFILLED' | 'UNCONFIRMED' = 'UNCONFIRMED';
      try {
        settled = await this.settlePendingEntry(state, client);
      } catch (e: any) {
        this.log(state, `⚠ Could not settle the working entry order: ${e?.message || e}`);
      }
      if (settled !== 'FILLED') {
        state.isExiting = false;
        if (settled === 'UNCONFIRMED' && state.entryTriggered) this.startRealtimeMonitor(state, client).catch(() => { });
        return;
      }
    }

    const { config } = state;
    const symbol = state.activeSymbol || config.symbol;
    const exchange = config.exchange;
    const cachedEntryPrice = state.entryPrice || exitPrice;
    const cachedEntryTriggered = state.entryTriggered;
    const isLong = cachedEntryTriggered === 'LONG';
    const exitSide = cachedEntryTriggered === 'LONG' ? 'SELL' : 'BUY';
    const qty = state.executedQty || config.qty;

    // Stop WebSocket monitoring before exit
    this.stopRealtimeMonitor(state);

    try {
      let exitOrderId = '';
      let exitOrderType: 'MARKET' | 'LIMIT' | 'SL' = 'MARKET';
      let actualExitPrice = exitPrice;
      let orphanQtyLeft = 0; // >0 when the broker still holds shares after every exit attempt failed
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
                const isLong = state.entryTriggered === 'LONG';
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
                const isLong = state.entryTriggered === 'LONG';
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
            let exitSafety = await isSafeToExit(kite, symbol, exitSide, this.logger, this.brokerMatch(state));
            for (let attempt = 0; attempt < 3 && exitSafety.unknown; attempt++) {
              await new Promise(r => setTimeout(r, 700));
              exitSafety = await isSafeToExit(kite, symbol, exitSide, this.logger, this.brokerMatch(state));
            }
            if (exitSafety.unknown) {
              // Unreadable is not flat: keep the position, re-arm its stop (below) and retry the exit on the next tick.
              isManuallyClosed = true;
              orphanQtyLeft = remainingQtyToExit;
              this.log(state, `⚠ Zerodha positions for ${symbol} could not be read — exit not sent yet.`);
            } else if (!exitSafety.safe) {
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
            const finalPos = await getLiveBrokerPosition(kite, symbol, this.logger, this.brokerMatch(state));
            // A filled exit can take a moment to reach the positions book; a second exit then would reverse the position.
            const exitFilled = finalPos.isOpen && finalPos.netQty !== 0 && exitOrderType === 'MARKET' && !!exitOrderId
              && ((await kite.getOrders().catch(() => [])) as any[]).some((o: any) => o.order_id === exitOrderId && o.status === 'COMPLETE');
            if (exitFilled) {
              this.log(state, `ℹ Exit order ${exitOrderId} is COMPLETE; the positions book has not caught up yet — no second exit sent.`);
            } else if (finalPos.isOpen && finalPos.netQty !== 0) {
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
                orphanQtyLeft = 0;
                if (!exitOrderId) exitOrderId = emergencyOrderId;
              } else {
                orphanQtyLeft = orphanQty;
              }
            }
          } catch (guardErr: any) {
            this.logger.warn(`Fail-safe position zeroing check notice: ${guardErr.message}`);
          }
        }
      }

      // Never orphan a live position: if the broker still holds shares because every exit attempt failed, keep the
      // position ACTIVE (state intact), re-arm the exchange stop-loss we cancelled above, and let the monitor retry next tick.
      if (!state.isPaperTrade && orphanQtyLeft > 0) {
        this.log(state, `🚨 Exit NOT completed — ${orphanQtyLeft} shares of ${symbol} are still open at the broker. Keeping the position active and re-arming the exchange stop-loss; exit will be retried on the next tick.`);
        state.executedQty = orphanQtyLeft;
        if (state.stopLossPrice) {
          try {
            const tickSz = getInstrumentTickSize(symbol, state.stopLossPrice);
            const trig = this.roundTick(state.stopLossPrice, symbol);
            const lim = this.roundTick(exitSide === 'SELL' ? trig - tickSz * 3 : trig + tickSz * 3, symbol);
            state.slOrderId = await this.placeOrder(state, {
              symbol, exchange, product: config.product ?? 'MIS', qty: orphanQtyLeft, side: exitSide,
              orderType: 'SL', price: lim, triggerPrice: trig, intent: 'PROTECTIVE'
            }).catch((e: any) => { this.log(state, `❌ Could not re-arm exchange SL: ${e.message}`); return null; });
            state.lastBrokerSlTrigger = state.slOrderId ? trig : undefined;
          } catch (reArmErr: any) {
            this.log(state, `❌ SL re-arm error: ${reArmErr.message}`);
          }
        }
        this.startRealtimeMonitor(state, client).catch(() => { });
        return;
      }

      await this.trackOrderInDB(state, exitSide, symbol, exchange, qty, actualExitPrice, exitOrderId, undefined, exitOrderType);

      let tradePnl = 0;
      if (cachedEntryPrice && cachedEntryPrice > 0 && actualExitPrice > 0 && cachedEntryTriggered) {
        tradePnl = (isLong ? (actualExitPrice - cachedEntryPrice) : (cachedEntryPrice - actualExitPrice)) * qty;
      }
      state.dailyRealizedPnlRs = (state.dailyRealizedPnlRs || 0) + tradePnl;
      logSignal('EXIT', state.strategyId, { symbol, side: isLong ? 'LONG' : 'SHORT', entry: cachedEntryPrice, exit: actualExitPrice, qty, pnlRs: +tradePnl.toFixed(2), reason, trailing: !!state.isTrailingEma, paper: !!state.isPaperTrade });

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

      if (config.enableTrendReEntry !== false && !shouldStopStrategy && (state.reEntryCountToday || 0) < 1 && (reason === 'TARGET' || state.isTrailingEma) && isLong) {
        // Re-entry only ever fires as a BUY (bullish EMA/VWAP reclaim) below, so only arm it for a
        // LONG-direction exit — arming it here for a SHORT would let a bearish trade's exit trigger
        // an unrelated, wrong-direction BUY with real capital.
        state.reEntryEligible = true;
        state.reEntryDirection = 'LONG';
        state.reEntrySymbol = symbol;
        state.reEntrySwingPrice = state.currentLtp || actualExitPrice;
        this.log(state, `🔁 [RE-ENTRY ARMED] ${symbol} exited trend trail. If price reclaims 15-EMA and breaks swing high (₹${(state.reEntrySwingPrice || 0).toFixed(2)}) with VWAP support, Leg 2 Re-Entry will execute!`);
      }

      state.entryTriggered = null;
      state.entryPrice = null;
      state.entryTime = null;
      state.stopLossPrice = null;
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
      state.isTrailingEma = false;
      state.initialStopPrice = undefined;
      state.profitLockStep = 0;
      state.partialTargetPrice = null;
      state.partialBooked = false;
      state.isBookingPartial = false;

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
    } catch (e: any) {
      this.log(state, `❌ Exit execution failed: ${e.message}`);
      // The market exit order may already have gone through at the broker before this error hit
      // (e.g. a DB blip while recording the fill) — check broker truth rather than trusting our
      // own in-memory flag, so a real closed position doesn't sit "open" in our state forever with
      // its P&L silently dropped from the daily loss/target ("One-and-Done") tracking.
      if (!state.isPaperTrade && client && client['kite']) {
        try {
          const kite = client['kite'];
          await new Promise(r => setTimeout(r, 600));
          const finalPos = await getLiveBrokerPosition(kite, symbol, this.logger, this.brokerMatch(state));
          if (!finalPos.isOpen || finalPos.netQty === 0) {
            const approxExitPrice = state.currentLtp || exitPrice || cachedEntryPrice;
            const tradePnl = (cachedEntryPrice > 0 && approxExitPrice > 0)
              ? (isLong ? (approxExitPrice - cachedEntryPrice) : (cachedEntryPrice - approxExitPrice)) * qty
              : 0;
            state.dailyRealizedPnlRs = (state.dailyRealizedPnlRs || 0) + tradePnl;
            this.log(state, `⚠ [RECOVERY] Confirmed ${symbol} is flat at the broker despite the error above. Reconciling state with an approximate exit price ₹${approxExitPrice.toFixed(2)} (Trade P&L: ₹${tradePnl.toFixed(2)}). Verify the actual fill price in Zerodha's order book.`);

            state.entryTriggered = null;
            state.entryPrice = null;
            state.entryTime = null;
            state.stopLossPrice = null;
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
            state.isTrailingEma = false;
            state.initialStopPrice = undefined;
            state.profitLockStep = 0;
            state.partialTargetPrice = null;
            state.partialBooked = false;
            state.isBookingPartial = false;

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

            strategyEvents.emit('strategy.update', {
              strategyId: state.strategyId,
              logs: state.logs,
              state: this.getState(state.strategyId),
            });
            await this.persistLogs(state);
            if (shouldStopStrategy) {
              this.log(state, stopReason);
              await this.stopWithStatus(state.strategyId, 'COMPLETED', stopReason);
            }
          } else {
            this.log(state, `🚨 [UNRESOLVED] ${symbol} still shows ${finalPos.netQty} shares open at the broker after the exit error. Re-arming exchange stop-loss and keeping the position ACTIVE for retry on the next tick.`);
            state.executedQty = Math.abs(finalPos.netQty);
            if (state.stopLossPrice) {
              try {
                const tickSz = getInstrumentTickSize(symbol, state.stopLossPrice);
                const trig = this.roundTick(state.stopLossPrice, symbol);
                const lim = this.roundTick(exitSide === 'SELL' ? trig - tickSz * 3 : trig + tickSz * 3, symbol);
                state.slOrderId = await this.placeOrder(state, {
                  symbol, exchange, product: config.product ?? 'MIS', qty: state.executedQty, side: exitSide,
                  orderType: 'SL', price: lim, triggerPrice: trig, intent: 'PROTECTIVE'
                }).catch((slErr: any) => { this.log(state, `❌ Could not re-arm exchange SL: ${slErr.message}`); return null; });
                state.lastBrokerSlTrigger = state.slOrderId ? trig : undefined;
              } catch (reArmErr: any) {
                this.log(state, `❌ SL re-arm error: ${reArmErr.message}`);
              }
            }
            this.startRealtimeMonitor(state, client).catch(() => { });
          }
        } catch (reconcileErr: any) {
          this.log(state, `⚠ Post-error broker reconciliation check failed: ${reconcileErr.message}. Position state left ACTIVE — the next tick's broker-sync check will retry.`);
        }
      }
    } finally {
      state.isExiting = false;
    }
  }

  private async exitPositionHistorical(state: StrategyState, exitPrice: number, timestamp: Date) {
    const { config } = state;
    const symbol = state.activeSymbol || config.symbol;
    const exchange = config.exchange;
    const exitSide = state.entryTriggered === 'LONG' ? 'SELL' : 'BUY';
    const qty = config.qty;

    // Stop WebSocket monitoring if active
    this.stopRealtimeMonitor(state);

    try {
      const exitOrderId = `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`;
      // Track exit order in DB (Historical catchup does not exhaust live trade cap)
      await this.trackOrderInDB(state, exitSide, symbol, exchange, qty, exitPrice, exitOrderId, timestamp);

      const cachedEntryPrice = state.entryPrice || exitPrice;
      const cachedEntryTriggered = state.entryTriggered;
      const isLong = cachedEntryTriggered === 'LONG';
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
      state.entryPrice = null;
      state.stopLossPrice = null;
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
      state.isTrailingEma = false;
      state.initialStopPrice = undefined;
      state.profitLockStep = 0;
    } catch (e: any) {
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

      await this.orderGateway.recordEngineOrder({
        userId: exec.strategy.userId,
        accountId: state.brokerAccountId,
        strategyId: exec.strategyId,
        executionId: state.executionId,
        symbol,
        exchange,
        side,
        orderType,
        product: (state.config as any).product ?? 'MIS',
        qty,
        price,
        brokerOrderId: orderId,
        status: 'COMPLETE',
        isPaper: state.isPaperTrade,
        createdAt,
      });
    } catch (e: any) {
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
    const todayStr = getIstDateStr(now);

    const dayMap = new Map<string, { high: number; low: number; close: number; dateStr: string }>();
    for (const c of candles) {
      const dStr = getIstDateStr(c.date);
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

  /** Fibonacci ladder of today's opening 5m candle (any candle interval: the 09:15-09:20 bars are merged). null = no such candle yet. */
  private calculateOpeningFib(candles: Candle[], side: 'LONG' | 'SHORT', now: Date, symbol: string): FibLevels | null {
    const todayStr = getIstDateStr(now);
    let high = -Infinity, low = Infinity;
    for (const c of candles) {
      if (getIstDateStr(c.date) !== todayStr) continue;
      const hhmm = getIstHhmm(c.date);
      if (hhmm < 9 * 60 + 15 || hhmm >= 9 * 60 + 20) continue;
      high = Math.max(high, c.high);
      low = Math.min(low, c.low);
    }
    if (!(high > low)) return null;
    const anchor0 = side === 'LONG' ? low : high;
    const anchor1 = side === 'LONG' ? high : low;
    return {
      anchor0,
      anchor1,
      levels: FIB_RATIOS.map(ratio => ({ ratio, price: this.roundTick(anchor0 + ratio * (anchor1 - anchor0), symbol) })),
      provisional: getIstHhmm(now) < 9 * 60 + 20,
    };
  }

  private formatFibLog(fib: FibLevels): string {
    const ladder = fib.levels.filter(l => l.ratio >= 0.5).map(l => `${l.ratio} ₹${l.price.toFixed(2)}`).join(' | ');
    return `📏 [FIB LEVELS] Opening 5m candle 0 = ₹${fib.anchor0.toFixed(2)}, 1 = ₹${fib.anchor1.toFixed(2)}${fib.provisional ? ' (candle still forming)' : ''} → ${ladder} — reference only, no exits use them`;
  }

  /** Fills in the Fibonacci ladder for an open position that has none (restart recovery) or got it before the opening candle closed. */
  private async refreshFibLevels(state: StrategyState, client: any, now: Date) {
    if (!state.entryTriggered || (state.fibLevels && !state.fibLevels.provisional)) return;
    if (state.fibLevels?.provisional && getIstHhmm(now) < 9 * 60 + 20) return;
    if (Date.now() < (state.fibRetryAt ?? 0)) return;
    state.fibRetryAt = Date.now() + 60_000;
    const symbol = state.activeSymbol || state.config.symbol;
    try {
      const candles = await this.fetchCandles(client, state.config, '5minute', now, symbol, state.config.exchange);
      const fib = this.calculateOpeningFib(candles, state.entryTriggered, now, symbol);
      if (fib) {
        state.fibLevels = fib;
        if (!fib.provisional) this.log(state, this.formatFibLog(fib));
      }
    } catch (err: any) {
      this.logger.debug?.(`Fib levels fetch for ${symbol}: ${err?.message}`);
    }
  }

  /**
   * Daily ATR% plus the volatility-scaled limits derived from it. The ATR is the stock's average (high - low) / open over the
   * previous ATR_SESSIONS sessions when ensureVolumeBaseline has loaded them today; otherwise the prior days inside `candles`
   * (the 5-calendar-day fetch, only 2-3 sessions).
   */
  private calculateDynamicStockMetrics(candles: Candle[], now: Date, symbol?: string): {
    dailyAtrPct: number;
    dynamicExhaustionPct: number;
    dynamicOpeningCapPct: number;
    dynamicExtensionPct: number;
    dynamicParabolicPct: number;
  } {
    if (!candles || candles.length === 0) {
      return { dailyAtrPct: 2.5, dynamicExhaustionPct: 5.5, dynamicOpeningCapPct: 2.0, dynamicExtensionPct: 8.5, dynamicParabolicPct: 2.5 };
    }
    const todayStr = getIstDateStr(now);
    const dayMap = new Map<string, { high: number; low: number; open: number }>();
    for (const c of candles) {
      const dStr = getIstDateStr(c.date);
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
    const sessionAtr = symbol ? this.dailyAtrBySymbol.get(symbol) : undefined;
    if (sessionAtr && sessionAtr.dateStr === todayStr) {
      dailyAtrPct = sessionAtr.atrPct;
    } else if (pastDays.length > 0) {
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

  /**
   * `closedOnly`: the caller drops the still-forming candle (filterClosedCandles), so a copy fetched after the last
   * candle close settled stays valid until the next close. This keeps a 20-stock scan at ~20 history calls per candle
   * instead of 20 per 30-second scan.
   */
  private async fetchCandles(client: any, config: any, interval: string, now: Date, symbol?: string, exchange?: string, opts?: { closedOnly?: boolean }): Promise<Candle[]> {
    const sym = symbol || config.symbol;
    const exch = exchange || config.exchange;
    const cacheKey = `${exch}:${sym}:${interval}`;
    const cached = this.candleCache.get(cacheKey);
    if (cached && Date.now() < (opts?.closedOnly ? Math.max(cached.expiresAt, cached.closedUntil) : cached.expiresAt)) {
      return cached.candles;
    }

    const istDateStr = getIstDateStr(now);
    const from = new Date(`${istDateStr}T09:15:00.000+05:30`);
    from.setDate(from.getDate() - 5); // Go back 5 days to ensure enough historical candles
    const isMinute = interval === 'minute';
    // 1m: ~3 sessions (1,200 bars) so daily ATR, PDH/PDL and the same-time volume fallback see the prior days, as 250 5m bars do.
    const keepBars = isMinute ? 1200 : 250;
    const timeoutMs = isMinute ? 5000 : 3500;
    try {
      const fetchPromise = client.getHistoricalData(sym, exch, interval, from, now);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout fetching candles for ${sym} (${interval}) after ${timeoutMs}ms`)), timeoutMs)
      );
      const data = await Promise.race([fetchPromise, timeoutPromise]) as any;
      const candles = (data || []).slice(-keepBars).map((c: any) => ({ date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
      // Never serve a cached copy across a candle boundary: the cached last candle was still forming, and
      // filterClosedCandles would treat that partial candle as closed once the boundary has passed.
      // (Expiry is the close itself: a copy read even 1s after it would hand the partial candle on as closed.)
      const barMs = (isMinute ? 1 : parseInt(interval, 10) || 0) * 60_000;
      const nowMs = Date.now();
      const lastBoundaryMs = barMs > 0 ? Math.floor(nowMs / barMs) * barMs : 0;
      const nextBoundaryMs = barMs > 0 ? lastBoundaryMs + barMs : Infinity;
      const closedUntil = barMs > 0 && nowMs - lastBoundaryMs >= CLOSED_CANDLE_SETTLE_MS ? nextBoundaryMs : 0;
      this.candleCache.set(cacheKey, { candles, expiresAt: Math.min(nowMs + 30_000, nextBoundaryMs), closedUntil });
      return candles;
    } catch (err: any) {
      if (cached?.candles?.length) {
        this.logger.warn(`[CANDLE_FALLBACK] Failed to fetch fresh candles for ${sym}: ${err.message}. Using cached candles.`);
        return cached.candles;
      }
      throw err;
    }
  }

  private roundTick(p: number, symbol?: string): number {
    const tickSize = getInstrumentTickSize(symbol || '', p);
    return roundToInstrumentTick(p, tickSize);
  }

  /**
   * Loads a stock's exchange tick size from the shared instrument master. AUTO mode gets tick sizes from the scanner;
   * a single configured stock would otherwise be priced on a price-tier guess, which Kite rejects when it is wrong.
   */
  private async ensureTickSize(client: any, symbol: string, exchange: string): Promise<void> {
    const key = (symbol || '').toUpperCase().trim();
    if (!key || globalTickSizeMap.has(key) || this.tickSizeMisses.has(key) || !client?.getInstruments) return;
    try {
      const instruments = await client.getInstruments(exchange || 'NSE');
      const inst = instruments.find((i: any) => i.tradingsymbol === key);
      if (inst?.tick_size && Number(inst.tick_size) > 0) globalTickSizeMap.set(key, Number(inst.tick_size));
      else this.tickSizeMisses.add(key);
    } catch (err: any) {
      this.logger.debug?.(`Tick size lookup failed for ${exchange}:${key}: ${err?.message}`);
    }
  }

  /**
   * Setup detection + volume-confirmation gate.
   * Every setup (long or short) must be confirmed by a volume spike on its signal candle. The spike is judged against
   * THAT STOCK's own history (same clock-time candle, previous 10 sessions), so a noisy stock needs a bigger spike than a
   * calm one (dynamic). Runs on every newly closed entry candle, so volume is re-checked continuously.
   * `interval` is the timeframe of `candles` (its volume baseline is kept per timeframe); `slCandles` (5m) makes the
   * stop-loss come from 5m structure when `candles` are 1m.
   */
  private evaluateStockSetup(
    candles: Candle[],
    emas: (number | null)[],
    vwaps: (number | null)[],
    now: Date,
    config: EmaVwapCrossoverConfig,
    symbol?: string,
    tf: { interval?: 'minute' | '5minute'; slCandles?: Candle[] } = {}
  ): StockSetup | null {
    const setup = this.evaluateStockSetupRaw(candles, emas, vwaps, now, config, symbol, tf.slCandles);
    if (!setup) return null;
    if (config.enableRvolVolumeFilter === false) return setup;
    const symKey = this.volumeBaselineKey(symbol ?? config.symbol, tf.interval ?? '5minute');
    const opts = {
      dynamic: config.enableDynamicVolume !== false,
      minZ: config.minVolumeZ && config.minVolumeZ > 0 ? config.minVolumeZ : 1.5,
      rvolFloor: config.minRvolFloor && config.minRvolFloor > 0 ? config.minRvolFloor : 1.5,
      minRvol: config.minRvol && config.minRvol > 0 ? config.minRvol : 2.5,
      trailingRvol: config.trailingRvolFloor && config.trailingRvolFloor > 0 ? config.trailingRvolFloor : 1.3,
    };
    const vol = this.checkVolumeConfirmation(candles, setup.candleIdx, opts, this.volumeBaselines.get(symKey)?.slots);
    if (!vol.isVolumeValid) {
      this.logger.debug?.(`[VOLUME GATE] ${symKey} ${setup.setupType} ${setup.trend} rejected: RVOL ${vol.rvol.toFixed(2)}x${vol.z !== undefined ? ` z=${vol.z.toFixed(2)}` : ''} (${vol.basis})`);
      return null;
    }
    if (vol.basis === 'own-history') setup.description += ` [Vol ${vol.rvol.toFixed(1)}x, z=${(vol.z ?? 0).toFixed(1)} vs own history]`;
    else if (vol.basis !== 'none') setup.description += ` [Vol ${vol.rvol.toFixed(1)}x ${vol.basis === 'time-of-day' ? 'same-time avg' : 'recent avg'}]`;
    return setup;
  }

  private volumeBaselineKey(symbol: string, interval: 'minute' | '5minute'): string {
    return `${symbol}:${interval}`;
  }

  /** Loads (once per stock per day per timeframe) the same-clock-time candle volumes of the previous 10 sessions for the dynamic volume gate. */
  private async ensureVolumeBaseline(client: any, symbol: string, exchange: string, now: Date, interval: 'minute' | '5minute' = '5minute'): Promise<void> {
    if (!symbol || !client?.getHistoricalData) return;
    const todayStr = getIstDateStr(now);
    const key = this.volumeBaselineKey(symbol, interval);
    const cached = this.volumeBaselines.get(key);
    if (cached && cached.dateStr === todayStr && (!cached.retryAfter || Date.now() < cached.retryAfter)) return;
    try {
      const dayStart = new Date(`${todayStr}T09:15:00.000+05:30`);
      const from = new Date(dayStart.getTime() - 16 * 24 * 3600 * 1000);
      const to = new Date(dayStart.getTime() - 60 * 1000); // previous sessions only
      // 16 days of 1m bars is ~4,000 candles, so it gets a longer timeout than the 5m history.
      const timeoutMs = interval === 'minute' ? 8000 : 4000;
      const data = await Promise.race([
        client.getHistoricalData(symbol, exchange, interval, from, to),
        new Promise((_, reject) => setTimeout(() => reject(new Error('volume-history timeout')), timeoutMs)),
      ]) as any[];
      const byDay = new Map<string, Map<number, number>>();
      const dayRange = new Map<string, { open: number; high: number; low: number }>();
      for (const c of data || []) {
        const d = new Date(c.date);
        const dStr = getIstDateStr(d);
        if (dStr >= todayStr) continue;
        const r = dayRange.get(dStr);
        if (!r) dayRange.set(dStr, { open: c.open, high: c.high, low: c.low });
        else { r.high = Math.max(r.high, c.high); r.low = Math.min(r.low, c.low); }
        if (!(c.volume > 0)) continue;
        if (!byDay.has(dStr)) byDay.set(dStr, new Map());
        byDay.get(dStr)!.set(getIstHhmm(d), c.volume);
      }
      const recentDays = Array.from(byDay.keys()).sort().slice(-10);
      const slots = new Map<number, number[]>();
      for (const dStr of recentDays) {
        for (const [slot, v] of byDay.get(dStr)!) {
          if (!slots.has(slot)) slots.set(slot, []);
          slots.get(slot)!.push(v);
        }
      }
      this.volumeBaselines.set(key, { dateStr: todayStr, slots });
      const ranges = Array.from(dayRange.keys()).sort().slice(-ATR_SESSIONS)
        .map(dStr => dayRange.get(dStr)!)
        .filter(r => r.open > 0 && r.high >= r.low)
        .map(r => ((r.high - r.low) / r.open) * 100);
      if (ranges.length >= 3) {
        const atrPct = Math.max(1.2, Math.min(10.0, ranges.reduce((a, b) => a + b, 0) / ranges.length));
        this.dailyAtrBySymbol.set(symbol, { dateStr: todayStr, atrPct, sessions: ranges.length });
      }
    } catch (err: any) {
      this.logger.debug?.(`Volume baseline unavailable for ${symbol} (${interval}): ${err?.message}. Using 3-session fallback.`);
      this.volumeBaselines.set(key, { dateStr: todayStr, slots: new Map(), retryAfter: Date.now() + 10 * 60 * 1000 });
    }
  }

  private evaluateStockSetupRaw(
    candles: Candle[],
    emas: (number | null)[],
    vwaps: (number | null)[],
    now: Date,
    config: EmaVwapCrossoverConfig,
    symbol?: string,
    slCandles?: Candle[]
  ): StockSetup | null {
    if (!candles || candles.length < 2) return null;
    const todayStr = getIstDateStr(now);
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
      if (getIstDateStr(candles[i].date) === todayStr) {
        todayCandles.push({ candle: candles[i], idx: i });
      }
    }
    if (todayCandles.length === 0) return null;

    const firstDayCandle = todayCandles[0].candle;
    const dayOpen = firstDayCandle.open;
    const dayHigh = Math.max(...todayCandles.map(tc => tc.candle.high));
    const dayLow = Math.min(...todayCandles.map(tc => tc.candle.low));
    const moveFromOpenPct = dayOpen > 0 ? ((currCandle.close - dayOpen) / dayOpen) * 100 : 0;

    // Calculate Dynamic Stock Volatility & Adaptive Metrics from Zerodha multi-day candles
    const metrics = this.calculateDynamicStockMetrics(candles, now, symbol || config.symbol);
    const { pdh, pdl } = this.extractPdhPdlPdc(candles, now);

    // Calculate Dynamic Average Candle Range (ATR/ACR) over last 10 candles
    const recentCandles = candles.slice(Math.max(0, lastIdx - 9), lastIdx + 1);
    const avgCandleRangePct = recentCandles.reduce((sum, c) => sum + (((c.high - c.low) / (c.close || 1)) * 100), 0) / Math.max(1, recentCandles.length);
    // Dynamic max distance from 15-EMA scales with stock's recent volatility (0.75% to 2.20%)
    const dynamicMaxEmaDistPct = Math.max(0.75, Math.min(2.20, avgCandleRangePct * 1.8));

    // ── Structural Swing Shelf & Dynamic Breathing Space ────────────────────────
    // Look back at the last 3 to 6 candles of today's price action to find the genuine consolidation shelf/base.
    // 1m entries pass `slCandles` (5m, including the forming one) so the shelf and buffer, and with them the stop,
    // are exactly the 5m structure: 3-6 five-minute candles, not 3-6 minutes.
    const slToday = (slCandles ?? []).filter(c => getIstDateStr(c.date) === todayStr);
    const useSlCandles = slToday.length > 0;
    const shelfSource = useSlCandles ? slToday : todayCandles.map(tc => tc.candle);
    const shelfLookback = Math.min(6, Math.max(3, shelfSource.length));
    // Clamp at 0: with fewer than 3 candles a negative start would slice from the END and keep only the last candle.
    const shelfCandles = shelfSource.slice(Math.max(0, shelfSource.length - shelfLookback));
    const shelfLow = Math.min(...shelfCandles.map(c => c.low));
    const shelfHigh = Math.max(...shelfCandles.map(c => c.high));

    // Dynamic volatility buffer based on instrument tick size and ATR (of the SL timeframe's last 10 candles)
    const targetSym = symbol || config.symbol;
    const symTick = getInstrumentTickSize(targetSym, currCandle.close);
    const slRecentCandles = useSlCandles ? slCandles!.slice(-10) : recentCandles;
    const slAvgRangePct = slRecentCandles.reduce((sum, c) => sum + (((c.high - c.low) / (c.close || 1)) * 100), 0) / Math.max(1, slRecentCandles.length);
    const volatilityBuffer = Math.max(symTick * 4, currCandle.close * (slAvgRangePct * 0.01 * 0.35));
    // Intraday breathing boundaries: Min 0.85% (prevents noise stops), capped at maxStopPct (default 2.2%) to accommodate true day low/mother low
    const maxStopPct = this.getMaxStopPct(config);
    const minBreathingDist = Math.max(symTick * 8, currCandle.close * Math.min(MIN_STOP_PCT, maxStopPct) / 100);
    const maxBreathingDist = Math.max(symTick * 15, currCandle.close * maxStopPct / 100);

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
    const crossoverDetails = this.getLatestCrossoverTodayDetails(lastIdx, candles, emas, vwaps, symbol || config.symbol);
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

    // Setup types disabled by default on backtest evidence (TREND_BREAKOUT: -0.14R over 1,727 trades, negative in both halves).
    const disabledSetups = new Set<string>((config as any)?.disabledSetupTypes ?? ['TREND_BREAKOUT']);

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
    if (isUptrend && todayCandles.length >= 2 && !disabledSetups.has('TREND_BREAKOUT')) {
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

    if (isUptrend && todayCandles.length >= 2 && !disabledSetups.has('TREND_BREAKOUT')) {
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
    const isInside = isInsideCandle(mother, baby);
    if (isInside && (isUptrend || isDowntrend)) {
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

  private formatTime(d: Date) { return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }); }
  private log(state: StrategyState, msg: string) {
    const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    pushEngineLog(state.logs, `[${ts}] ${msg}`);
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
          data: { logs: JSON.stringify(state.logs.slice(-MAX_ENGINE_LOGS)) },
        });
      }

      strategyEvents.emit('strategy.update', {
        strategyId: state.strategyId,
        logs: state.logs,
        state: this.getState(state.strategyId),
      });
    } catch { }
  }
  private getLatestCrossoverTodayDetails(idx: number, candles: Candle[], emas: (number | null)[], vwaps: (number | null)[], symbol?: string): { trend: 'LONG' | 'SHORT'; crossoverIdx: number; ema: number; vwap: number; crossoverTime: Date } | null {
    const todayStr = getIstDateStr(candles[idx].date);
    const cross = findLatestEmaVwapCrossToday(idx, candles, emas, vwaps);
    const latestCrossover = cross?.trend ?? null;
    const crossoverIdx = cross?.crossoverIdx ?? -1;

    // Return the crossover only if the trend is still valid at the current candle
    if (latestCrossover !== null && crossoverIdx !== -1) {
      const currentEma = emas[idx], currentVwap = vwaps[idx];
      const currentCandle = candles[idx];
      if (currentEma === null || currentVwap === null) return null;

      // Dynamic Volatility Exhaustion Guard: Scaled to stock's actual Daily ATR%
      const metrics = this.calculateDynamicStockMetrics(candles, new Date(), symbol);
      let firstDayCandle: Candle | null = null;
      for (let k = 0; k < candles.length; k++) {
        if (getIstDateStr(candles[k].date) === todayStr) {
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

      // LONG: Nifty should not be selling off (block below -0.10% from open)
      // SHORT: Nifty should not be rallying (block above +0.10% from open)
      // Threshold tightened from 0.25% to 0.10% based on the backtest bucketing (against-market trades: -0.11R).
      if (trend === 'LONG' && changePct < -0.10) {
        return {
          isAligned: false,
          niftyLtp: ltp,
          niftyOpen: open,
          changePct,
          reason: `NIFTY 50 is bearish (${changePct.toFixed(2)}% from Open: ₹${open.toFixed(1)} -> LTP: ₹${ltp.toFixed(1)})`
        };
      }

      if (trend === 'SHORT' && changePct > 0.10) {
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

  /**
   * Volume confirmation for a signal candle.
   * 1) DYNAMIC (preferred): compare with the stock's OWN same-clock-time volumes over the previous 10 sessions (needs >= 6):
   *    pass when z-score of ln(volume) >= minZ AND relative volume >= rvolFloor. A calm stock passes with a smaller multiple,
   *    a noisy stock needs a much bigger spike (a z=2 spike ranges from ~3x to ~17x across stocks).
   * 2) FALLBACK (no history): same-time average of the previous <= 3 sessions in the loaded candles, static minRvol.
   * 3) Last resort: average of the last 10 candles of the day (needs >= 3), gated by trailingRvol instead of
   *    minRvol — this baseline is the same trending day's own recent candles, so it's already inflated by the
   *    move being checked and can never show a large multiple; a lower, separate floor avoids blocking genuine
   *    steady-building trend continuation. With no usable baseline at all the gate fails open.
   */
  private checkVolumeConfirmation(
    candles: Candle[],
    idx: number,
    opts: { dynamic: boolean; minZ: number; rvolFloor: number; minRvol: number; trailingRvol: number },
    baseline?: Map<number, number[]>
  ): { isVolumeValid: boolean; rvol: number; z?: number; basis: 'own-history' | 'time-of-day' | 'trailing' | 'none'; volume: number; baseline: number } {
    const sig = candles?.[idx];
    if (!sig) return { isVolumeValid: true, rvol: 1, basis: 'none', volume: 0, baseline: 0 };
    const volume = sig.volume || 0;
    const dayStr = getIstDateStr(sig.date);
    const slot = getIstHhmm(sig.date);

    if (opts.dynamic && baseline && volume > 0) {
      const hist = baseline.get(slot);
      if (hist && hist.length >= 6) {
        const mean = hist.reduce((x, y) => x + y, 0) / hist.length;
        const logs = hist.map(v => Math.log(v));
        const lm = logs.reduce((x, y) => x + y, 0) / logs.length;
        const sd = Math.max(0.2, Math.sqrt(logs.reduce((x, y) => x + (y - lm) ** 2, 0) / (logs.length - 1)));
        const rvol = mean > 0 ? volume / mean : 1;
        const z = (Math.log(volume) - lm) / sd;
        return { isVolumeValid: z >= opts.minZ && rvol >= opts.rvolFloor, rvol, z, basis: 'own-history', volume, baseline: mean };
      }
    }

    let sum = 0, n = 0;
    const seenDays = new Set<string>();
    for (let k = idx - 1; k >= 0 && n < 3; k--) {
      const d = getIstDateStr(candles[k].date);
      if (d === dayStr || seenDays.has(d)) continue;
      if (getIstHhmm(candles[k].date) === slot && candles[k].volume > 0) {
        seenDays.add(d);
        sum += candles[k].volume;
        n++;
      }
    }
    if (n >= 2) {
      const base = sum / n;
      const rvol = base > 0 ? volume / base : 1;
      return { isVolumeValid: rvol >= opts.minRvol, rvol, basis: 'time-of-day', volume, baseline: base };
    }

    sum = 0; n = 0;
    for (let k = idx - 1; k >= 0 && n < 10 && getIstDateStr(candles[k].date) === dayStr; k--) {
      if (candles[k].volume > 0) { sum += candles[k].volume; n++; }
    }
    if (n >= 3) {
      const base = sum / n;
      const rvol = base > 0 ? volume / base : 1;
      return { isVolumeValid: rvol >= opts.trailingRvol, rvol, basis: 'trailing', volume, baseline: base };
    }
    return { isVolumeValid: true, rvol: 1, basis: 'none', volume, baseline: 0 };
  }

  /**
   * Candles used to FIND entries (5m by default, or 1m). Whatever this returns, the stop-loss is
   * placed on 5m structure and the 15-EMA trend exit runs on 5m candle closes.
   */
  private getEntryTf(config: EmaVwapCrossoverConfig): { interval: 'minute' | '5minute'; minutes: 1 | 5 } {
    return config.entryTimeframe === '1min'
      ? { interval: 'minute', minutes: 1 }
      : { interval: '5minute', minutes: 5 };
  }

  /** Auto mode: how many top-ranked stocks are checked for a setup on each scan (default 20, at most 25). */
  private getScanDepth(config: EmaVwapCrossoverConfig): number {
    const n = Math.floor(Number(config.scanDepth));
    return Number.isFinite(n) && n >= 1 ? Math.min(MAX_SCAN_DEPTH, n) : DEFAULT_SCAN_DEPTH;
  }

  /** Widest structural stop, % of entry (config.maxStopPct, default 2.2, kept within 0.85-5). */
  private getMaxStopPct(config: EmaVwapCrossoverConfig): number {
    const v = Number(config.maxStopPct);
    return Number.isFinite(v) && v > 0 ? Math.max(MIN_STOP_PCT, Math.min(5, v)) : DEFAULT_MAX_STOP_PCT;
  }

  /** Which exit-target mode applies. FIXED_RS = the ₹ target/SL mode. */
  private getTargetMode(config: EmaVwapCrossoverConfig): 'FIXED_RS' | 'FULL' | 'PARTIAL' | 'QUICK' | 'EMA' {
    if (config.exitExactAtTarget) return 'FIXED_RS';
    const m = config.targetMode;
    return m === 'PARTIAL' || m === 'QUICK' || m === 'EMA' ? m : 'FULL';
  }

  /** Stagnation time-stop in ms: close a trade still within 0.25% of entry after this long. null = off (stagnationMinutes 0). */
  private getStagnationMs(config: EmaVwapCrossoverConfig): number | null {
    const raw = config.stagnationMinutes as unknown;
    const m = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(m) || m < 0) return 35 * 60 * 1000;
    return m === 0 ? null : m * 60 * 1000;
  }

  /**
   * Volatility-scaled first target.
   *  FULL / PARTIAL: 0.5 x the stock's daily ATR% (its typical daily range), kept between 0.5R and 2R of the structural stop.
   *  QUICK: a small fixed R multiple (default 0.5R) that is reached about half of the time.
   *  EMA: computed like FULL for the logs only; nothing exits there, the whole position rides the 15-EMA candle-close exit.
   * Backtest (545 stocks, 2y): the old PDC/PDH/Fibonacci target sat ~1.7R away and was hit only ~10% of the time.
   */
  private calculateVolatilityTarget(
    entry: number, sl: number, side: 'BUY' | 'SELL', mode: 'FULL' | 'PARTIAL' | 'QUICK' | 'EMA',
    config: EmaVwapCrossoverConfig, dailyAtrPct: number | undefined, symbol: string
  ): { targetPrice: number; reason: string } {
    const tick = getInstrumentTickSize(symbol, entry);
    const risk = Math.max(tick * 4, Math.abs(entry - sl));
    let dist: number;
    let reason: string;
    if (mode === 'QUICK') {
      const r = config.quickTargetR && config.quickTargetR > 0 ? config.quickTargetR : 0.5;
      dist = risk * r;
      reason = `Quick target ${r}R (+₹${dist.toFixed(2)}/sh)`;
    } else {
      const atr = dailyAtrPct && dailyAtrPct > 0 ? dailyAtrPct : 2.5;
      const mult = config.targetAtrMultiple && config.targetAtrMultiple > 0 ? config.targetAtrMultiple : 0.5;
      const raw = entry * (atr / 100) * mult;
      dist = Math.min(risk * 2, Math.max(risk * 0.5, raw));
      reason = `${mult} x daily ATR (${atr.toFixed(2)}%) = +₹${raw.toFixed(2)}/sh, bounded to ${(dist / risk).toFixed(2)}R (+₹${dist.toFixed(2)}/sh)`;
      if (mode === 'EMA') reason += ' — reference only: no target exit, the whole position rides the 15-EMA candle-close exit';
    }
    dist = Math.max(dist, tick * 3);
    const targetPrice = this.roundTick(side === 'BUY' ? entry + dist : entry - dist, symbol);
    return { targetPrice, reason };
  }

  private isPartialBookingDue(state: StrategyState, price: number): boolean {
    if (state.partialBooked || state.isBookingPartial || !state.partialTargetPrice || !state.entryTriggered || !price) return false;
    if (state.config.exitExactAtTarget) return false;
    return state.entryTriggered === 'LONG' ? price >= state.partialTargetPrice : price <= state.partialTargetPrice;
  }

  /**
   * Books part of the position at the first target, then leaves the runner to the 15-EMA candle-close exit / structural stop.
   * Live safety order: (1) confirm the broker position, (2) shrink the exchange stop-loss to the remaining quantity FIRST
   * (a stop larger than the position could reverse it), (3) market-exit the partial, (4) undo (1)-(2) on failure.
   */
  private async bookPartial(state: StrategyState, client: any, kite: any, price: number) {
    state.isBookingPartial = true;
    try {
      const config = state.config;
      const symbol = state.activeSymbol || config.symbol;
      const exchange = config.exchange;
      const isLong = state.entryTriggered === 'LONG';
      const exitSide: 'BUY' | 'SELL' = isLong ? 'SELL' : 'BUY';
      const totalQty = state.executedQty || config.qty;
      const frac = Math.min(0.9, Math.max(0.1, config.partialBookFraction && config.partialBookFraction > 0 ? config.partialBookFraction : 0.5));
      const qtyPartial = Math.floor(totalQty * frac);
      const remaining = totalQty - qtyPartial;

      if (qtyPartial < 1 || remaining < 1) {
        state.partialBooked = true;
        this.log(state, `ℹ [PARTIAL BOOKING] Position of ${totalQty} share(s) is too small to split — running the full position with the 15-EMA candle-close exit.`);
        return;
      }
      state.partialAttempts = (state.partialAttempts || 0) + 1;
      if (state.partialAttempts > 3) {
        state.partialBooked = true;
        this.log(state, `⚠ [PARTIAL BOOKING] Gave up after 3 failed attempts — running the full position with the 15-EMA candle-close exit.`);
        return;
      }

      let orderId = `PAPER_PARTIAL_${Math.random().toString(36).substring(7).toUpperCase()}`;
      let fillPrice = price;
      if (!state.isPaperTrade) {
        if (!kite) return;
        const safety = await isSafeToExit(kite, symbol, exitSide, this.logger, this.brokerMatch(state));
        if (!safety.safe || (safety.brokerQty && Math.abs(safety.brokerQty) < totalQty)) {
          state.partialBooked = true;
          this.log(state, `ℹ [PARTIAL BOOKING] Skipped: broker position (${safety.brokerQty ?? 0}) does not match the expected ${totalQty} share(s).`);
          return;
        }
        const hasSl = !!state.slOrderId && state.slOrderId !== 'FAILED';
        if (hasSl) {
          try {
            await kite.modifyOrder('regular', state.slOrderId, { quantity: remaining });
          } catch (modErr: any) {
            this.log(state, `⚠ [PARTIAL BOOKING] Could not shrink the exchange SL to ${remaining} share(s) (${modErr.message}); nothing sold, will retry.`);
            return;
          }
        }
        try {
          orderId = await this.placeOrder(state, { symbol, exchange, product: config.product ?? 'MIS', qty: qtyPartial, side: exitSide, orderType: 'MARKET', intent: 'EXIT' });
        } catch (ordErr: any) {
          this.log(state, `❌ [PARTIAL BOOKING] Market order failed (${ordErr.message}). Restoring the exchange SL to ${totalQty} share(s).`);
          if (hasSl) await kite.modifyOrder('regular', state.slOrderId, { quantity: totalQty }).catch((e: any) => this.log(state, `🚨 Could not restore SL quantity: ${e.message}`));
          return;
        }
        try {
          await new Promise(r => setTimeout(r, 500));
          const orders = await kite.getOrders();
          const o = orders.find((x: any) => x.order_id === orderId);
          if (o && Number(o.average_price) > 0) fillPrice = Number(o.average_price);
        } catch { /* keep LTP as the fill estimate */ }
      }

      await this.trackOrderInDB(state, exitSide, symbol, exchange, qtyPartial, fillPrice, orderId, undefined, 'MARKET');
      const entry = state.entryPrice || fillPrice;
      const partialPnl = (isLong ? (fillPrice - entry) : (entry - fillPrice)) * qtyPartial;
      state.dailyRealizedPnlRs = (state.dailyRealizedPnlRs || 0) + partialPnl;
      state.executedQty = remaining;
      state.config.qty = remaining;
      state.entryOrderId = null; // entry-fill sync must not restore the sold quantity
      state.partialBooked = true;
      logSignal('EXIT', state.strategyId, { symbol, side: isLong ? 'LONG' : 'SHORT', entry, exit: fillPrice, qty: qtyPartial, remaining, partial: true, pnlRs: +partialPnl.toFixed(2), reason: 'PARTIAL_TARGET', paper: !!state.isPaperTrade });
      this.log(state, `💰 [PARTIAL BOOKED] ${qtyPartial}/${totalQty} share(s) of ${symbol} at ₹${fillPrice.toFixed(2)} (first target ₹${(state.partialTargetPrice || 0).toFixed(2)}) | Locked P&L: +₹${partialPnl.toFixed(2)} | Runner: ${remaining} share(s) ride the 15-EMA candle-close exit`);

      if (config.partialMoveSlToBreakeven !== false && state.entryPrice) {
        const tick = getInstrumentTickSize(symbol, price);
        const be = this.roundTick(isLong ? state.entryPrice + tick * 2 : state.entryPrice - tick * 2, symbol);
        const better = isLong ? be > (state.stopLossPrice || 0) : be < (state.stopLossPrice || Infinity);
        if (better) {
          state.stopLossPrice = be;
          this.log(state, `🛡 [PARTIAL BOOKED] Runner stop moved to break-even ₹${be.toFixed(2)}`);
          await this.updateBrokerSlSafe(client, kite, state, symbol);
        }
      }
    } catch (err: any) {
      this.log(state, `⚠ [PARTIAL BOOKING] error: ${err.message}`);
    } finally {
      state.isBookingPartial = false;
    }
  }

  /**
   * Profit lock (config.profitLock, default on; 15-EMA ride mode only). R = the entry's structural stop distance. Once
   * price is +1.5R the stop moves to +0.5R, at +3R to +2R (PROFIT_LOCK_STEPS). The stop only tightens and the 15-EMA
   * candle-close exit is unchanged. Re-syncs the exchange stop on every call until it matches (the modify is
   * rate-limited and can fail); that is a no-op once synced.
   */
  private async applyProfitLock(state: StrategyState, client: any, kite: any, symbol: string, price: number) {
    if (state.config.profitLock === false || this.getTargetMode(state.config) !== 'EMA') return;
    const entry = state.entryPrice;
    if (!entry || !state.stopLossPrice || !price) return;
    const isLong = state.entryTriggered === 'LONG';
    if (state.initialStopPrice == null) {
      // Position adopted after a restart: its stop is the entry stop only while it is still on the loss side.
      if (isLong ? state.stopLossPrice >= entry : state.stopLossPrice <= entry) return;
      state.initialStopPrice = state.stopLossPrice;
    }
    const risk = Math.abs(entry - state.initialStopPrice);
    if (!(risk > 0)) return;
    const move = isLong ? price - entry : entry - price;
    const done = state.profitLockStep || 0;
    let step = done;
    while (step < PROFIT_LOCK_STEPS.length && move >= PROFIT_LOCK_STEPS[step][0] * risk) step++;
    if (step > done) {
      state.profitLockStep = step;
      const [reachedR, lockR] = PROFIT_LOCK_STEPS[step - 1];
      const lockSl = this.roundTick(isLong ? entry + risk * lockR : entry - risk * lockR, symbol);
      if (isLong ? lockSl > state.stopLossPrice : lockSl < state.stopLossPrice) {
        state.stopLossPrice = lockSl;
        const qty = state.executedQty || state.config.qty;
        const lockedRs = (isLong ? lockSl - entry : entry - lockSl) * qty;
        this.log(state, `🔒 [PROFIT LOCK] ${symbol} reached +${reachedR}R @ ₹${price.toFixed(2)} — stop moved to +${lockR}R ₹${lockSl.toFixed(2)}, locking +₹${lockedRs.toFixed(2)}. The 15-EMA close exit still applies.`);
      }
    }
    if (state.profitLockStep) await this.updateBrokerSlSafe(client, kite, state, symbol);
  }

  /**
   * Intra-candle (tick) trailing exits on the 15-EMA/VWAP lines. OFF by default: in the 15-EMA trend-riding mode the
   * exit is a 5m candle CLOSE across the 15-EMA (long: close below, short: close above), so wicks are ignored, and
   * the structural stop-loss stays as the only intrabar exit. Never active in Fixed Target mode.
   */
  private isTickTrailExitEnabled(state: StrategyState): boolean {
    return !state.config.exitExactAtTarget && (state.config as any).enableTickTrailExit === true;
  }
}
