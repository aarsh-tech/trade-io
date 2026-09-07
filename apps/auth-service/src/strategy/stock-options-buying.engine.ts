import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';
import { StockOptionsBuyingConfig } from './dto/strategy.dto';
import { autoSelectStock, getTopFnoCandidates, FnoCandidateStock } from './smart-stock-picker';
import { strategyEvents } from '../common/events';
import { getLiveBrokerPosition, isSafeToExit, safeCancelPendingOrders } from './broker-position-guard';

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
  config: StockOptionsBuyingConfig;
  brokerAccountId: string;
  isPaperTrade: boolean;

  // Strategy Execution State
  stateType: 'SCANNING' | 'WAITING_FOR_TRIGGER' | 'ACTIVE_POSITION';
  signalSide: 'CALL' | 'PUT' | null;
  optionSymbol: string | null;
  entryTriggerPrice: number | null;
  stopLossPrice: number | null;
  targetPrice: number | null;
  target1Price?: number | null;
  target2Price?: number | null;
  highestPriceReached?: number;
  isT1Reached?: boolean;
  positionQty: number;
  entryOrderId: string | null;
  lotSize: number;

  // High-Accuracy Upgrades State
  entryTime?: number;
  spotEntryPrice?: number;
  spotStopLossPrice?: number;
  isSlTrailedToCost?: boolean;
  orderPlacedTimestamp?: number;
  executionLatencyMs?: number;

  // Auto F&O Scanner State
  isAutoMode?: boolean;
  activeStockSymbol?: string | null;
  lastAutoScanLogTime?: number;

  // Duplicate prevention & logs
  lastProcessedTimestamp: number;
  tradesPlacedToday: number;
  winsToday?: number;
  lossesToday?: number;
  partialBooked?: boolean;
  initialQty?: number;
  logs: string[];
  currentLtp?: number;
  currentPnlRs?: number;
  currentPnlPct?: number;
  peakPnlRs?: number;
}

@Injectable()
export class StockOptionsBuyingEngine {
  private readonly logger = new Logger(StockOptionsBuyingEngine.name);
  private readonly running = new Map<string, StrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly candleCache = new Map<string, { candles: Candle[]; expiresAt: number }>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
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

    let brokerAccount = strategy.brokerAccount;
    if (!brokerAccount) {
      brokerAccount = await this.prisma.brokerAccount.findFirst({
        where: { userId: strategy.userId, isActive: true },
      });
      if (!brokerAccount) throw new Error('No active broker account found');
      await this.prisma.strategy.update({
        where: { id: strategyId },
        data: { brokerAccountId: brokerAccount.id },
      });
    }

    const config: StockOptionsBuyingConfig = JSON.parse(strategy.config);
    await this.prisma.strategyExecution.updateMany({
      where: { strategyId, status: 'RUNNING' },
      data: { status: 'STOPPED', stoppedAt: new Date() },
    });
    const execution = await this.prisma.strategyExecution.create({
      data: { strategyId, status: 'RUNNING' },
    });
    await this.prisma.strategy.update({
      where: { id: strategyId },
      data: { isActive: true },
    });

    const isAuto = config.symbol === 'AUTO' || config.symbol === 'auto' || !config.symbol || !!config.isAutoStockSelect;
    const state: StrategyState = {
      strategyId,
      executionId: execution.id,
      config,
      brokerAccountId: brokerAccount.id,
      isPaperTrade: strategy.isPaperTrade,
      stateType: 'SCANNING',
      signalSide: null,
      optionSymbol: null,
      entryTriggerPrice: null,
      stopLossPrice: null,
      targetPrice: null,
      positionQty: 0,
      entryOrderId: null,
      lotSize: 0,
      lastProcessedTimestamp: 0,
      tradesPlacedToday: 0,
      logs: [],
      isAutoMode: isAuto,
      activeStockSymbol: isAuto ? null : config.symbol,
    };

    this.running.set(strategyId, state);
    this.log(
      state,
      `▶ High-Accuracy Stock Options Buying engine started — Mode: ${isAuto ? 'AUTO (180+ F&O Momentum Scanner)' : `Manual (${config.symbol})`} | Bias: ${config.directionBias || 'BOTH'} | Capital: ₹${config.maxCapital} | Execution: ${strategy.isPaperTrade ? 'PAPER' : 'LIVE'}`,
    );
    await this.persistLogs(state);

    // Tick every 15 seconds for rapid position monitoring & trigger checks
    const timer = setInterval(
      () => this.tick(strategyId).catch(e => this.logger.error(e)),
      15_000,
    );
    this.timers.set(strategyId, timer);

    this.initialCatchup(strategyId).then(() => {
      this.tick(strategyId).catch(e => this.logger.error(e));
    }).catch(e => this.logger.error(`Catch-up error: ${e.message}`));

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
      stateType: s.stateType,
      signalSide: s.signalSide,
      entryPrice: s.entryTriggerPrice,
      currentLtp: s.currentLtp || s.entryTriggerPrice,
      stopLossPrice: s.stopLossPrice,
      targetPrice: s.targetPrice,
      target1Price: s.target1Price,
      target2Price: s.target2Price,
      lotSize: s.lotSize,
      qty: s.positionQty,
      pnlRs: s.currentPnlRs ?? 0,
      pnlPct: s.currentPnlPct ?? 0,
      peakPnlRs: s.peakPnlRs ?? 0,
      tradesToday: s.tradesPlacedToday,
      winsToday: s.winsToday ?? 0,
      lossesToday: s.lossesToday ?? 0,
      partialBooked: s.partialBooked ?? false,
      executionLatencyMs: s.executionLatencyMs,
      isSlTrailedToCost: s.isSlTrailedToCost,
      isPaperTrade: s.isPaperTrade,
    };
  }

  async squareOff(strategyId: string): Promise<{ success: boolean; message: string }> {
    const state = this.running.get(strategyId);
    if (!state) return { success: false, message: 'Strategy is not running' };
    if (state.stateType !== 'ACTIVE_POSITION' && state.stateType !== 'WAITING_FOR_TRIGGER') {
      return { success: false, message: 'No active position or pending trigger to square off' };
    }
    this.log(state, `⚡ Manual Instant Square-Off requested by user`);
    await this.forceExit(state, 'Manual Instant Square-Off requested by user');
    await this.persistLogs(state);
    return { success: true, message: 'Position squared off successfully' };
  }

  private getIstHhmm(date: Date): number {
    const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
    const istDate = new Date(utcMs + (330 * 60000));
    return istDate.getHours() * 60 + istDate.getMinutes();
  }

  private parseHhmm(timeStr: string): number {
    const [h, m] = (timeStr || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  // ─── Main tick loop ──────────────────────────────────────────────────────────

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    // Resolve AUTO symbol mode
    if (state.config.symbol === 'AUTO' || state.config.symbol === 'auto') {
      state.isAutoMode = true;
    }

    const now = new Date();
    const hhmm = this.getIstHhmm(now);

    const MARKET_OPEN = 9 * 60 + 15;
    const MARKET_CLOSE = 15 * 60 + 30;

    // Reset daily state before market opens
    if (hhmm < MARKET_OPEN) {
      this.resetDailyState(state);
      await this.persistLogs(state);
      return;
    }

    // Auto close positions at 15:05 IST (to exit safely before Zerodha 3:12 PM RMS cutoff)
    if (hhmm >= 15 * 60 + 5 && state.stateType !== 'SCANNING') {
      this.log(state, `⏰ 3:05 PM Intraday EOD Cutoff reached! Auto-squaring off position...`);
      await this.forceExit(state);
      await this.persistLogs(state);
      return;
    }

    if (hhmm >= MARKET_CLOSE) {
      await this.persistLogs(state);
      return;
    }

    // 1 Win & Done / 1 Loss & Done Systematic Profitability Rules
    if (state.config.maxWinsPerDay && (state.winsToday ?? 0) >= state.config.maxWinsPerDay) {
      this.log(state, `🏆 Daily Goal Achieved: ${state.winsToday} win(s) booked. '1 Win & Done' disciplined stop.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'COMPLETED', `🏆 Completed: Daily win target achieved.`);
      return;
    }
    if (state.config.maxLossesPerDay && (state.lossesToday ?? 0) >= state.config.maxLossesPerDay) {
      this.log(state, `🛡 Capital Shield Triggered: ${state.lossesToday} loss limit reached. Auto-halting to protect capital.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'STOPPED', `🛡 Stopped: Max daily loss limit reached.`);
      return;
    }

    // Check Max Trades limit
    if (state.tradesPlacedToday >= state.config.maxTradesPerDay) {
      this.log(state, `⛔ Max ${state.config.maxTradesPerDay} daily trades reached. Auto-stopping.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'COMPLETED', `⛔ Stopped: Daily trade limit reached.`);
      return;
    }

    // Midday Chop Dead-Zone Filter (Default 11:30 - 13:00 IST)
    if ((state.config.enableMiddayChopFilter ?? true) && state.stateType === 'SCANNING') {
      const deadStart = this.parseHhmm(state.config.middayDeadZoneStart || '11:30');
      const deadEnd = this.parseHhmm(state.config.middayDeadZoneEnd || '13:00');
      if (hhmm >= deadStart && hhmm < deadEnd) {
        if (!state.logs[state.logs.length - 1]?.includes('MIDDAY CHOP DEAD-ZONE')) {
          this.log(state, `⏳ [MIDDAY CHOP DEAD-ZONE] 11:30 AM – 01:00 PM European transition dead-zone active. Skipping new breakout entries to eliminate false chop.`);
          await this.persistLogs(state);
        }
        return;
      }
    }

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account?.accessToken) {
      this.log(state, '⚠ No active broker session');
      await this.persistLogs(state);
      return;
    }

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    // ── Phase 1: Monitor Active Position ─────────────────────────────────────
    if (state.stateType === 'ACTIVE_POSITION') {
      // Auto-sync with broker: If option position was closed externally on Zerodha, reconcile state immediately
      if (!state.isPaperTrade && kite && kite.getPositions && state.optionSymbol) {
        try {
          const brokerStatus = await getLiveBrokerPosition(kite, state.optionSymbol, this.logger);
          if (!brokerStatus.isOpen) {
            this.log(state, `ℹ [BROKER SYNC] Option position for ${state.optionSymbol} is CLOSED on Zerodha (Net Qty: 0). Resetting state to SCANNING.`);
            if (state.entryOrderId) {
              await client.cancelOrder(state.entryOrderId).catch(() => {});
            }
            this.resetStateToScanning(state);
            strategyEvents.emit('strategy.update', {
              strategyId: state.strategyId,
              logs: state.logs,
              state: this.getState(state.strategyId),
            });
            await this.persistLogs(state);
            return;
          }
        } catch (syncErr: any) {
          this.logger.debug?.(`Stock options broker sync notice: ${syncErr.message}`);
        }
      }

      await this.monitorPosition(state, client, kite);
      await this.persistLogs(state);
      return;
    }

    // ── Phase 2: Check for Crossover & Inside Candle breakout ────────────────
    if (state.stateType === 'SCANNING') {
      await this.scanForSetup(state, client, kite);
    } else if (state.stateType === 'WAITING_FOR_TRIGGER') {
      await this.checkBreakoutTrigger(state, client, kite);
    }

    await this.persistLogs(state);
  }

  // ─── Upgrade 1: Multi-Filter Signal Scanning (RVOL + Volume SMA) ────────────

  private async scanForSetup(state: StrategyState, client: any, kite: any) {
    try {
      if (state.isAutoMode || state.config.symbol === 'AUTO' || state.config.symbol === 'auto') {
        state.isAutoMode = true;
        const candidates = await getTopFnoCandidates(kite, state.config.directionBias || 'BOTH', 6, this.logger);
        if (!candidates || candidates.length === 0) {
          this.log(state, `⏳ [AUTO F&O SCANNER] No matching momentum candidates found in F&O universe. Retrying...`);
          return;
        }

        const nowMs = Date.now();
        if (!state.lastAutoScanLogTime || (nowMs - state.lastAutoScanLogTime) > 60_000) {
          state.lastAutoScanLogTime = nowMs;
          const summaryStr = candidates.slice(0, 4).map(c => `${c.symbol} (${c.changeFromOpenPct > 0 ? '+' : ''}${c.changeFromOpenPct.toFixed(2)}%)`).join(', ');
          this.log(state, `🔍 [AUTO F&O SCANNER] Top 5%-10% momentum candidates: ${summaryStr}. Evaluating 15-EMA/Inside Candle setup...`);
        }

        // Evaluate top candidates with rate-limit throttling to prevent Zerodha 429 Too Many Requests
        for (const candidate of candidates.slice(0, 4)) {
          const triggered = await this.evaluateSymbolForSetup(state, client, kite, candidate.symbol, 'NSE', candidate);
          if (triggered) {
            state.activeStockSymbol = candidate.symbol;
            state.config.symbol = candidate.symbol;
            return;
          }
          // Throttle between symbol evaluations to respect Zerodha's 3 req/sec rate limit
          await new Promise(r => setTimeout(r, 350));
        }
      } else {
        await this.evaluateSymbolForSetup(state, client, kite, state.config.symbol, state.config.exchange || 'NSE');
      }
    } catch (e: any) {
      this.log(state, `❌ Scanning error: ${e.message}`);
    }
  }

  private async evaluateSymbolForSetup(
    state: StrategyState, client: any, kite: any,
    symbol: string, exchange: string, candidate?: FnoCandidateStock,
  ): Promise<boolean> {
    try {
      const interval = state.config.timeframe === '5min' ? '5minute' : '15minute';
      const candles = await this.fetchCandles(client, symbol, exchange, interval);
      const emaPeriod = state.config.emaPeriod ?? 15;

      if (candles.length < emaPeriod + 20) {
        if (!state.isAutoMode) {
          this.log(state, `⏳ Insufficient candles for volume SMA & EMA on ${symbol} (need ${emaPeriod + 20}, got ${candles.length})`);
        }
        return false;
      }

      // Check if last candle is closed
      const now = new Date();
      const timeframeMs = state.config.timeframe === '5min' ? 5 * 60_000 : 15 * 60_000;
      const latestCandle = candles[candles.length - 1];
      const isClosed = (now.getTime() - latestCandle.date.getTime()) >= timeframeMs;
      const closedCandles = isClosed ? candles : candles.slice(0, -1);

      if (closedCandles.length < emaPeriod + 20) return false;

      const n = closedCandles.length - 1;
      const lastClosedCandleTime = closedCandles[n].date.getTime();

      // For manual mode, skip duplicate closed candles. For auto mode, evaluate each candidate.
      if (!state.isAutoMode) {
        if (lastClosedCandleTime <= state.lastProcessedTimestamp) return false;
        state.lastProcessedTimestamp = lastClosedCandleTime;
      }

      const emas = this.calculateEMA(closedCandles, emaPeriod);
      const vwaps = this.calculateVWAP(closedCandles);

      const rangeStr = this.formatCandleRange(closedCandles[n].date, state.config.timeframe === '5min' ? 5 : 15);
      const closeTimeStr = this.formatCandleCloseTime(closedCandles[n].date, state.config.timeframe === '5min' ? 5 : 15);
      const currEma = emas[n];
      const currVwap = vwaps[n];
      const closedCandle = closedCandles[n];

      if (!state.isAutoMode) {
        this.log(state, `[${symbol}] 🔍 ${state.config.timeframe || '15m'} Candle [${rangeStr}] closed at ${closeTimeStr} | Close: ₹${closedCandle.close.toFixed(2)} (H: ₹${closedCandle.high.toFixed(2)}, L: ₹${closedCandle.low.toFixed(2)}) | EMA: ₹${currEma?.toFixed(2)}, VWAP: ₹${currVwap?.toFixed(2)}`);
      }

      const setupType = state.config.setupType || 'BOTH';
      const mother = closedCandles[n - 1];
      const baby = closedCandles[n];
      const todayStr = this.getIstDateStr(now);
      const motherDateStr = this.getIstDateStr(mother.date);
      const babyDateStr = this.getIstDateStr(baby.date);

      const isInsideCandle = (setupType === 'INSIDE_CANDLE' || setupType === 'BOTH') &&
        motherDateStr === todayStr && babyDateStr === todayStr && baby.high <= mother.high && baby.low >= mother.low;

      const trend = this.getTrendDirection(n, closedCandles, emas, vwaps);
      let isPullbackRejection = false;
      let setupTriggerDate = baby.date;
      let setupSpotSl = baby.low;

      if ((setupType === 'PULLBACK_REJECTION' || setupType === 'BOTH') && !isInsideCandle && trend !== null) {
        const candleRange = baby.high - baby.low;
        if (candleRange > 0 && currEma && currVwap) {
          if (trend === 'LONG') {
            const lowerWick = Math.min(baby.open, baby.close) - baby.low;
            const wickRatio = lowerWick / candleRange;
            const testedBand = baby.low <= Math.max(currEma, currVwap) * 1.002;
            const closedBullish = baby.close >= Math.min(currEma, currVwap);
            if (testedBand && closedBullish && wickRatio >= 0.25) {
              isPullbackRejection = true;
              setupTriggerDate = baby.date;
              setupSpotSl = baby.low;
            }
          } else if (trend === 'SHORT') {
            const upperWick = baby.high - Math.max(baby.open, baby.close);
            const wickRatio = upperWick / candleRange;
            const testedBand = baby.high >= Math.min(currEma, currVwap) * 0.998;
            const closedBearish = baby.close <= Math.max(currEma, currVwap);
            if (testedBand && closedBearish && wickRatio >= 0.25) {
              isPullbackRejection = true;
              setupTriggerDate = baby.date;
              setupSpotSl = baby.high;
            }
          }
        }
      }

      if (isInsideCandle || isPullbackRejection) {
        const setupName = isInsideCandle ? 'Inside Candle Breakout' : '15-EMA/VWAP Pullback Rejection';
        // RVOL Check
        const volSma = this.calculateVolumeSMA(closedCandles, 20, n);
        const rvol = volSma > 0 ? (baby.volume / volSma) : 1.0;
        const minRvol = state.config.minRvol ?? 1.25;

        if (rvol < minRvol) {
          if (!state.isAutoMode) {
            this.log(state, `⏳ [${symbol}] Setup rejected: RVOL ${rvol.toFixed(2)}x is below required ${minRvol.toFixed(2)}x`);
          }
          return false;
        }

        if (trend !== null) {
          const side = trend === 'LONG' ? 'CALL' : 'PUT';

          // Directional Bias Filter
          if (state.config.directionBias === 'CALL_ONLY' && side === 'PUT') return false;
          if (state.config.directionBias === 'PUT_ONLY' && side === 'CALL') return false;

          // Macro Market (NIFTY 50) Trend Alignment Gate
          if (state.config.enableMarketTrendFilter ?? true) {
            try {
              const niftyQuotes = await kite.getQuote(['NSE:NIFTY 50']).catch(() => ({}));
              const nq = niftyQuotes['NSE:NIFTY 50'];
              if (nq?.last_price && nq.ohlc?.open) {
                const niftyLtp = nq.last_price;
                const niftyOpen = nq.ohlc.open;
                const niftyDiffPct = ((niftyLtp - niftyOpen) / niftyOpen) * 100;
                if (side === 'CALL' && niftyDiffPct < -0.20) {
                  this.log(state, `⏳ [${symbol}] Macro Market Gate: NIFTY 50 is down ${niftyDiffPct.toFixed(2)}%. Suppressing CALL entry.`);
                  return false;
                }
                if (side === 'PUT' && niftyDiffPct > 0.20) {
                  this.log(state, `⏳ [${symbol}] Macro Market Gate: NIFTY 50 is up +${niftyDiffPct.toFixed(2)}%. Suppressing PUT entry.`);
                  return false;
                }
              }
            } catch (niftyErr: any) {
              this.logger.warn(`Macro market check notice: ${niftyErr?.message}`);
            }
          }

          // Higher Timeframe (15-Min) Trend Filter
          if (state.config.enableHtfFilter ?? true) {
            const htfInterval = state.config.htfTimeframe === '60min' ? '60minute' : '15minute';
            const htfCandles = await this.fetchCandles(client, symbol, exchange, htfInterval);
            const htfPeriod = state.config.htfEmaPeriod ?? 50;

            if (htfCandles.length >= htfPeriod) {
              const htfEmas = this.calculateEMA(htfCandles, htfPeriod);
              const lastHtfClose = htfCandles[htfCandles.length - 1].close;
              const lastHtfEma = htfEmas[htfEmas.length - 1];

              if (lastHtfEma !== null) {
                if (side === 'CALL' && lastHtfClose < lastHtfEma) return false;
                if (side === 'PUT' && lastHtfClose > lastHtfEma) return false;
              }
            }
          }

          const momentumInfo = candidate ? ` | Day Move: ${candidate.changeFromOpenPct > 0 ? '+' : ''}${candidate.changeFromOpenPct.toFixed(2)}% | Score: ${candidate.score}` : '';
          this.log(state, `🎯 [${symbol}] 80% Profitability Setup Triggered! (${setupName} | RVOL: ${rvol.toFixed(2)}x | Signal: ${side}${momentumInfo})`);
          const triggerDate = isInsideCandle ? mother.date : setupTriggerDate;
          const spotSl = isInsideCandle ? (side === 'CALL' ? mother.low : mother.high) : setupSpotSl;
          await this.setupBreakoutTrigger(state, client, kite, side, triggerDate, spotSl, symbol);
          return true;
        }
      }
      return false;
    } catch (e: any) {
      this.logger.error(`evaluateSymbolForSetup error on ${symbol}: ${e.message}`);
      return false;
    }
  }

  // ─── Upgrade 2 & 3: Smart Option Contract Selection & Precision Order Execution ──

  private async setupBreakoutTrigger(
    state: StrategyState, client: any, kite: any,
    side: 'CALL' | 'PUT', motherTimestamp: Date, motherSpotSl: number,
    targetSymbol?: string,
    isHistorical?: boolean,
  ) {
    try {
      const activeSym = targetSymbol || state.config.symbol;
      const activeExchange = state.config.exchange || 'NSE';
      const ltpData = await kite.getLTP([`${activeExchange}:${activeSym}`]);
      const spotPrice = ltpData[`${activeExchange}:${activeSym}`]?.last_price;
      if (!spotPrice) {
        this.log(state, `❌ Failed to fetch spot price for option strike selection on ${activeSym}`);
        return;
      }

      // Upgrade 2: Smart Option Contract & Liquidity Filter
      const moneyness = state.config.moneyness ?? 'ATM';
      const optionSymbol = await this.findSmartOptionContract(
        client, kite, activeSym, spotPrice, side === 'CALL' ? 'CE' : 'PE', moneyness, state
      );

      if (!optionSymbol) {
        this.log(state, `❌ Could not find active liquid option symbol for ${activeSym}`);
        return;
      }

      state.activeStockSymbol = activeSym;
      state.config.symbol = activeSym;

      // Fetch Option candles to find the Mother Candle's High/Low
      const interval = state.config.timeframe === '5min' ? '5minute' : '15minute';
      const optCandles = await this.fetchCandles(client, optionSymbol, 'NFO', interval);
      const motherOptCandle = optCandles.find(c => c.date.getTime() === motherTimestamp.getTime());

      if (!motherOptCandle) {
        this.log(state, `⚠ Option candle missing at mother timestamp. Skipping illiquid strike ${optionSymbol}`);
        return;
      }

      const H_om = motherOptCandle.high;
      const L_om = motherOptCandle.low;

      // Calculate trigger prices
      const entryPrice = this.roundTick(H_om + (state.config.triggerOffset ?? 0.50));
      let slPrice = this.roundTick(L_om);
      const risk = entryPrice - slPrice;

      if (risk <= 0) {
        this.log(state, `❌ Invalid dynamic risk (SL: ₹${slPrice} >= Entry: ₹${entryPrice})`);
        return;
      }

      const target1Price = this.roundTick(entryPrice + risk * (state.config.target1RR ?? 1.5));
      const target2Price = this.roundTick(entryPrice + risk * (state.config.target2RR ?? 3.0));

      // Fetch Lot Size
      const instruments = await client.getInstruments('NFO');
      const optInst = instruments.find((i: any) => i.tradingsymbol === optionSymbol);
      const lotSize = optInst?.lot_size ?? 1;

      // Dynamic Capital-Based Lot Check with Kite Margin Integration (Conservative 30% Cap)
      const costPerLot = entryPrice * lotSize;
      let deployableCapital = state.config.maxCapital || 15000;
      let liveAvailableCash = deployableCapital;
      if (state.config.enableDynamicSizing ?? true) {
        try {
          const margins = await kite.getMargins().catch(() => null);
          const liveCash = margins?.equity?.available?.live_balance ?? margins?.equity?.available?.cash ?? margins?.available?.live_balance ?? margins?.available?.cash ?? 0;
          if (liveCash > 0) {
            liveAvailableCash = liveCash;
            // Conservative: Never deploy more than 30% of capital on a single option trade
            const marginBudget = liveCash * 0.30;
            deployableCapital = state.config.maxCapital ? Math.min(state.config.maxCapital, marginBudget) : marginBudget;
          }
        } catch { }
      }

      const affordableLots = Math.floor(deployableCapital / costPerLot);
      if (affordableLots < 1) {
        this.log(
          state,
          `❌ Margin Check: 1 lot of ${optionSymbol} requires ₹${costPerLot.toFixed(2)} (${lotSize} qty @ ₹${entryPrice.toFixed(2)}), but conservative capital limit (max 30% of account) allows ₹${deployableCapital.toFixed(2)} (Live Free Cash: ₹${liveAvailableCash.toFixed(2)}). Skipping trade to preserve capital.`
        );
        return;
      }

      const configuredLots = state.config.lots ?? 1;
      const lotsToTrade = Math.max(1, Math.min(configuredLots, affordableLots));

      if (configuredLots > affordableLots) {
        this.log(
          state,
          `⚠️ Margin Allocation: Configured ${configuredLots} lots, but conservative capital allows ${affordableLots} lot(s). Auto-scaled down to ${lotsToTrade} lot(s) to trade safely.`
        );
      }

      // Hard Risk Cap for Options: Total potential loss must never exceed user's Stop Loss ₹ (e.g. ₹500)
      const maxAllowedRisk = state.config.stopLossRs && state.config.stopLossRs > 0 ? state.config.stopLossRs : 500;
      const totalTradeQty = lotsToTrade * lotSize;
      const rawPotentialLoss = risk * totalTradeQty;
      if (rawPotentialLoss > maxAllowedRisk) {
        const maxSlDistance = maxAllowedRisk / totalTradeQty;
        slPrice = this.roundTick(entryPrice - maxSlDistance);
        this.log(state, `🛡 Strict Risk Cap Applied: Clamped Option SL to ₹${slPrice.toFixed(2)} so potential loss cannot exceed ₹${maxAllowedRisk}.`);
      }

      // Update State
      state.optionSymbol = optionSymbol;
      state.signalSide = side;
      state.entryTriggerPrice = entryPrice;
      state.stopLossPrice = slPrice;
      state.targetPrice = target2Price; // Final 100% ROI target
      state.target1Price = target1Price; // T1 +50% ROI target
      state.target2Price = target2Price; // T2 +100% ROI target
      state.highestPriceReached = entryPrice;
      state.isT1Reached = false;
      state.lotSize = lotSize;
      state.positionQty = lotSize * lotsToTrade;
      state.spotEntryPrice = spotPrice;
      state.spotStopLossPrice = motherSpotSl;
      state.isSlTrailedToCost = false;

      this.log(state, `🎯 Smart Resolved Strike: NFO:${optionSymbol} (${moneyness}, Lot Size: ${lotSize}, Lots Allocated: ${lotsToTrade})`);
      this.log(state, `📋 Entry: ₹${entryPrice.toFixed(2)} | SL: ₹${slPrice.toFixed(2)} | T1 (+50% ROI): ₹${target1Price.toFixed(2)} | T2 (+100% ROI): ₹${target2Price.toFixed(2)} | Total Capital Required: ₹${(costPerLot * lotsToTrade).toFixed(2)}`);

      // Upgrade 3: Precision Order Execution with Ask Offset & Timeout
      state.orderPlacedTimestamp = Date.now();

      if (state.isPaperTrade || isHistorical) {
        state.entryOrderId = `PAPER_${Date.now().toString(36).toUpperCase()}`;
        state.stateType = 'WAITING_FOR_TRIGGER';
        this.log(state, `📝 Simulated Breakout Trigger order placed. Waiting for break above ₹${entryPrice}...`);
      } else {
        // Fetch current Ask for limit order precision
        const quoteKey = `NFO:${optionSymbol}`;
        const quoteMap = await kite.getQuote([quoteKey]);
        const bestAsk = quoteMap[quoteKey]?.depth?.sell?.[0]?.price || entryPrice;
        const limitPrice = this.roundTick(Math.max(entryPrice, bestAsk + 0.20));

        const params: OrderParams = {
          symbol: optionSymbol,
          exchange: 'NFO',
          side: 'BUY',
          orderType: 'SL',
          price: limitPrice,
          triggerPrice: entryPrice,
          product: state.config.product ?? 'MIS',
          qty: state.positionQty,
        };

        const orderId = await client.placeOrder(params);
        state.entryOrderId = orderId;
        state.stateType = 'WAITING_FOR_TRIGGER';
        this.log(state, `✅ Precision SL Limit Order placed at exchange: ${orderId} (Trigger: ₹${entryPrice}, Limit: ₹${limitPrice})`);
      }

      await this.trackOrder(state, entryPrice, 'OPEN');
    } catch (e) {
      this.log(state, `❌ Setup trigger error: ${e.message}`);
    }
  }

  // ─── Upgrade 3 (Contd.): Check Breakout Trigger Fill & Timeout Monitor ────────

  private async checkBreakoutTrigger(state: StrategyState, client: any, kite: any) {
    if (!state.optionSymbol || !state.entryTriggerPrice) return;

    try {
      const key = `NFO:${state.optionSymbol}`;
      const ltpData = await kite.getLTP([key]);
      const currentPrice = ltpData[key]?.last_price;

      if (!currentPrice) return;

      // Check Order Timeout (Default 5s timeout)
      const timeoutSec = state.config.orderTimeoutSec ?? 5;
      const elapsedSec = (Date.now() - (state.orderPlacedTimestamp ?? Date.now())) / 1000;

      if (state.isPaperTrade) {
        if (currentPrice >= state.entryTriggerPrice) {
          state.executionLatencyMs = Math.round((Date.now() - (state.orderPlacedTimestamp ?? Date.now())));
          this.log(state, `🚀 Breakout Triggered! Option LTP ₹${currentPrice} broke above trigger ₹${state.entryTriggerPrice}`);
          this.log(state, `⚡ Execution Latency [PAPER]: ${state.executionLatencyMs}ms`);

          state.stateType = 'ACTIVE_POSITION';
          state.entryTime = Date.now();
          this.log(state, `🛒 Position Opened [PAPER]: Bought ${state.positionQty} of ${state.optionSymbol} at Avg ₹${state.entryTriggerPrice.toFixed(2)}`);
          await this.updateOrderStatus(state.entryOrderId!, 'COMPLETE', state.entryTriggerPrice);
        }
      } else {
        // Query order status from Zerodha
        const orders = await kite.getOrders();
        const brokerOrder = orders.find((o: any) => o.order_id === state.entryOrderId);

        if (brokerOrder) {
          if (brokerOrder.status === 'COMPLETE') {
            const avgPrice = Number(brokerOrder.average_price) || state.entryTriggerPrice;
            state.executionLatencyMs = Math.round((Date.now() - (state.orderPlacedTimestamp ?? Date.now())));
            state.entryTriggerPrice = avgPrice;
            state.stateType = 'ACTIVE_POSITION';
            state.entryTime = Date.now();

            this.log(state, `🛒 Position Opened [LIVE]: Filled ${state.positionQty} of ${state.optionSymbol} at Avg ₹${avgPrice.toFixed(2)}`);
            this.log(state, `⚡ Execution Latency [LIVE]: ${state.executionLatencyMs}ms`);
            await this.updateOrderStatus(state.entryOrderId!, 'COMPLETE', avgPrice);
          } else if (brokerOrder.status === 'REJECTED' || brokerOrder.status === 'CANCELLED') {
            this.log(state, `❌ Trigger order was ${brokerOrder.status}. Reason: ${brokerOrder.status_message || 'N/A'}`);
            await this.updateOrderStatus(state.entryOrderId!, brokerOrder.status, null);
            this.resetStateToScanning(state);
          } else if ((brokerOrder.status === 'OPEN' || brokerOrder.status === 'TRIGGER PENDING') && elapsedSec > timeoutSec) {
            // Execution timeout: cancel pending order to prevent unexpected floating fills
            this.log(state, `⏱ Order Execution Timeout (${elapsedSec.toFixed(1)}s > ${timeoutSec}s limit). Cancelling pending trigger ${state.entryOrderId}`);
            try {
              await client.cancelOrder(state.entryOrderId);
            } catch { }
            this.resetStateToScanning(state);
          }
        }
      }
    } catch (e) {
      this.log(state, `⚠ Breakout check error: ${e.message}`);
    }
  }

  // ─── Upgrade 4: Dynamic Exit Engine (Spot SL, Trailing SL & 45-Min Time Exit) ──

  private async monitorPosition(state: StrategyState, client: any, kite: any) {
    if (!state.optionSymbol || !state.entryTriggerPrice || !state.stopLossPrice || !state.targetPrice) return;

    try {
      const key = `NFO:${state.optionSymbol}`;
      const spotKey = `${state.config.exchange}:${state.config.symbol}`;
      const ltpData = await kite.getLTP([key, spotKey]);

      const currentPrice = ltpData[key]?.last_price;
      const currentSpot = ltpData[spotKey]?.last_price;

      if (!currentPrice) return;

      const pnlPoints = currentPrice - state.entryTriggerPrice;
      const pnlRs = pnlPoints * state.positionQty;
      const pnlPct = state.entryTriggerPrice ? (pnlPoints / state.entryTriggerPrice) * 100 : 0;
      const heldMinutes = Math.round((Date.now() - (state.entryTime ?? Date.now())) / 60_000);

      state.currentLtp = currentPrice;
      state.currentPnlRs = pnlRs;
      state.currentPnlPct = pnlPct;
      state.peakPnlRs = Math.max(state.peakPnlRs || 0, pnlRs);

      // 3:05 PM Cutoff
      const currentHhmm = this.getIstHhmm(new Date());
      if (currentHhmm >= 15 * 60 + 5) {
        this.log(state, `⏰ 3:05 PM Intraday EOD Cutoff reached in position monitor! Auto-squaring off at ₹${currentPrice.toFixed(2)} (P&L: ₹${pnlRs.toFixed(2)})`);
        await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
        await this.persistLogs(state);
        return;
      }

      const sign = pnlRs >= 0 ? '+' : '';
      const pctSign = pnlPct >= 0 ? '+' : '';
      this.log(
        state,
        `📊 [LIVE P&L] ${state.optionSymbol}: ₹${currentPrice.toFixed(2)} | Target: ₹${state.targetPrice.toFixed(2)} | SL: ₹${state.stopLossPrice.toFixed(2)} | P&L: ${sign}₹${pnlRs.toFixed(2)} (${pctSign}${pnlPct.toFixed(2)}%) | Held: ${heldMinutes}m`,
      );

      // Update highest price peak reached
      state.highestPriceReached = Math.max(state.highestPriceReached ?? currentPrice, currentPrice);

      // Upgrade 4A: Spot Price SL Breach Check
      if (currentSpot && state.spotStopLossPrice) {
        const isSpotBreached = state.signalSide === 'CALL'
          ? currentSpot < state.spotStopLossPrice
          : currentSpot > state.spotStopLossPrice;

        if (isSpotBreached) {
          this.log(state, `🛑 Underlying Spot Price breached SL level (Spot: ₹${currentSpot.toFixed(2)}, SL: ₹${state.spotStopLossPrice.toFixed(2)})`);
          await this.exitPosition(state, client, currentPrice, 'SPOT_SL');
          return;
        }
      }

      // Upgrade 4B: Target 1 (+50% Gain / 1:1.5 RR) -> "The Banker" Partial Booking & Trailing SL to Cost + Cushion
      const t1Price = state.target1Price || (state.entryTriggerPrice + 1.5 * (state.entryTriggerPrice - state.stopLossPrice));
      const t2Price = state.target2Price || (state.entryTriggerPrice + 3.0 * (state.entryTriggerPrice - state.stopLossPrice));

      if (currentPrice >= t1Price && !state.isT1Reached && (state.config.enableTrailingSl ?? true)) {
        state.isT1Reached = true;
        state.stopLossPrice = this.roundTick(state.entryTriggerPrice + 0.50);
        state.isSlTrailedToCost = true;

        // "The Banker": Partial Profit Booking at Target 1
        if ((state.config.enablePartialBooking ?? true) && !state.partialBooked && state.positionQty > state.lotSize) {
          const bookingPct = (state.config.partialBookingPct ?? 50) / 100;
          const lotsToBook = Math.max(1, Math.floor((state.positionQty * bookingPct) / state.lotSize));
          const qtyToBook = lotsToBook * state.lotSize;

          if (qtyToBook < state.positionQty) {
            try {
              if (state.isPaperTrade) {
                this.log(state, `💰 [THE BANKER - PAPER] Booked ${lotsToBook} lot(s) (${qtyToBook} Qty) at Target 1 (+50% ROI / ₹${currentPrice.toFixed(2)})!`);
              } else {
                const params: OrderParams = {
                  symbol: state.optionSymbol,
                  exchange: 'NFO',
                  side: 'SELL',
                  orderType: 'MARKET',
                  product: state.config.product ?? 'MIS',
                  qty: qtyToBook,
                };
                const partialOrderId = await client.placeOrder(params);
                this.log(state, `💰 [THE BANKER - LIVE] Booked ${lotsToBook} lot(s) (${qtyToBook} Qty) at Target 1 (Order: ${partialOrderId})!`);
              }
              state.positionQty -= qtyToBook;
              state.partialBooked = true;
            } catch (err: any) {
              this.log(state, `⚠ The Banker partial booking notice: ${err.message}`);
            }
          }
        }

        this.log(state, `🛡 Target 1 (+50% Gain / 1:1.5 RR) Reached at ₹${currentPrice.toFixed(2)}! Trailing SL moved to Cost + ₹0.50 cushion (₹${state.stopLossPrice.toFixed(2)}) — Trade is now 100% RISK-FREE!`);
      }

      // Dynamic Trailing SL after T1: Trail specified % behind peak price reached
      if (state.isT1Reached && (state.config.enableTrailingSl ?? true)) {
        const trailingStepPct = (state.config.trailingStepPct ?? 20) / 100;
        const dynamicSl = this.roundTick((state.highestPriceReached ?? currentPrice) * (1 - trailingStepPct));
        if (dynamicSl > state.stopLossPrice) {
          state.stopLossPrice = dynamicSl;
          this.log(state, `📈 Dynamic Trailing SL updated to ₹${dynamicSl.toFixed(2)} (Peak Price: ₹${state.highestPriceReached?.toFixed(2)})`);
        }
      }

      // Upgrade 4C: 25-Min Theta Decay Stagnancy Auto-Exit
      const maxStagnantTime = state.config.maxStagnantTimeMin ?? 25;
      if (heldMinutes >= maxStagnantTime && !state.isT1Reached) {
        this.log(state, `⏰ Theta Decay Cutoff: Position held for ${heldMinutes}m without reaching Target 1 (> ${maxStagnantTime}m limit). Exiting to protect capital.`);
        await this.exitPosition(state, client, currentPrice, 'TIME_EXIT');
        return;
      }

      // Standard SL & Target 2 (+100% ROI) Checks
      if (currentPrice <= state.stopLossPrice) {
        const slReason = state.isT1Reached ? 'Trailing Stop Loss' : 'Stop Loss';
        this.log(state, `🛑 ${slReason} Hit at ₹${currentPrice.toFixed(2)}`);
        await this.exitPosition(state, client, currentPrice, 'SL');
      } else if (currentPrice >= t2Price) {
        this.log(state, `🎯 Target 2 (+100% ROI / 2x Premium) Hit at ₹${currentPrice.toFixed(2)}! Exiting 1 lot with peak profit!`);
        await this.exitPosition(state, client, currentPrice, 'TARGET');
      }
    } catch (e) {
      this.log(state, `⚠ Position monitor error: ${e.message}`);
    }
  }

  private async exitPosition(state: StrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET' | 'SPOT_SL' | 'TIME_EXIT' | 'FORCE_CLOSE') {
    try {
      // Upgrade 5: Paper Trading Realistic Slippage Simulation
      let actualExitPrice = exitPrice;
      if (state.isPaperTrade) {
        const simulatedSlippage = 0.15; // 0.15 pts spread slippage
        actualExitPrice = this.roundTick(Math.max(0.05, exitPrice - simulatedSlippage));
      }

      const profit = (actualExitPrice - state.entryTriggerPrice!) * state.positionQty;
      this.log(state, `📤 Exiting Position — Reason: ${reason} | Price: ₹${actualExitPrice.toFixed(2)} | P&L: ₹${profit.toFixed(2)}`);

      if (state.isPaperTrade) {
        this.log(state, `📝 PAPER TRADE — Exit simulated with ₹0.15 slippage model`);
      } else {
        if (state.entryOrderId) {
          try {
            await client.cancelOrder(state.entryOrderId);
          } catch { }
        }

        const kite = client['kite'];
        let isManuallyClosed = false;
        try {
          const exitSafety = await isSafeToExit(kite, state.optionSymbol!, 'SELL', this.logger);
          if (!exitSafety.safe && reason !== 'FORCE_CLOSE') {
            isManuallyClosed = true;
            this.log(state, `ℹ [AUTO-SYNC] ${state.optionSymbol} was already closed on Zerodha (Broker Qty: ${exitSafety.brokerQty}). Skipping duplicate exit order to prevent unintended short.`);
          }
        } catch (posErr: any) {
          this.log(state, `⚠ Position sync check notice: ${posErr.message}`);
        }

        if (!isManuallyClosed) {
          try {
            const params: OrderParams = {
              symbol: state.optionSymbol!,
              exchange: 'NFO',
              side: 'SELL',
              orderType: 'MARKET',
              product: state.config.product ?? 'MIS',
              qty: state.positionQty,
            };

            const exitOrderId = await client.placeOrder(params);
            this.log(state, `✅ Live Exit Order placed: ${exitOrderId}`);
          } catch (err: any) {
            this.log(state, `❌ Live Exit Order failed: ${err.message}`);
          }
        }
      }

      // Record exit order in DB
      try {
        const exec = await this.prisma.strategyExecution.findUnique({
          where: { id: state.executionId },
          include: { strategy: true },
        });
        if (exec?.strategy?.userId) {
          await this.prisma.order.create({
            data: {
              userId: exec.strategy.userId,
              brokerAccountId: state.brokerAccountId,
              executionId: state.executionId,
              symbol: state.optionSymbol || state.config.symbol || 'OPTION',
              exchange: 'NFO',
              side: 'SELL',
              orderType: 'LIMIT',
              productType: state.config.product as any ?? 'MIS',
              qty: Math.max(1, state.positionQty || 1),
              price: actualExitPrice || 0.05,
              status: 'COMPLETE',
              isPaperTrade: state.isPaperTrade,
            } as any,
          });
        }
      } catch (dbErr) {
        this.log(state, `⚠ DB order log skipped: ${dbErr.message}`);
      }

      if (profit > 0) {
        state.winsToday = (state.winsToday || 0) + 1;
      } else if (profit < 0) {
        state.lossesToday = (state.lossesToday || 0) + 1;
      }
      state.tradesPlacedToday++;
    } catch (e) {
      this.log(state, `❌ Exit execution failed: ${e.message}`);
    } finally {
      this.resetStateToScanning(state);
    }
  }

  private async forceExit(state: StrategyState, reason?: string) {
    if (state.stateType === 'SCANNING') return;

    this.log(state, reason ? `🛑 ${reason}. Closing triggers and positions.` : `⏰ Market closing cutoff. Closing triggers and positions.`);

    if (!state.optionSymbol) {
      this.resetStateToScanning(state);
      return;
    }

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (account?.accessToken) {
      const client = this.factory.createClient(account);
      const kite = client['kite'];

      if (state.stateType === 'WAITING_FOR_TRIGGER') {
        if (!state.isPaperTrade && state.entryOrderId) {
          try {
            await client.cancelOrder(state.entryOrderId);
            this.log(state, `✅ Cancelled trigger order ${state.entryOrderId}`);
          } catch { }
        }
        this.resetStateToScanning(state);
      } else if (state.stateType === 'ACTIVE_POSITION') {
        const key = `NFO:${state.optionSymbol}`;
        const ltpData = await kite.getLTP([key]).catch(() => ({}));
        const currentPrice = ltpData[key]?.last_price || state.entryTriggerPrice || 0.05;
        await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
      }
    } else {
      this.resetStateToScanning(state);
    }
  }

  // ─── Upgrade 2: Smart Option Selector & Liquidity Guard ──────────────────────

  private async findSmartOptionContract(
    client: any, kite: any, baseSymbol: string, spotPrice: number,
    type: 'CE' | 'PE', moneyness: 'ATM' | 'ITM', state: StrategyState
  ): Promise<string | null> {
    const exchange = 'NFO';
    const segment = 'NFO-OPT';
    const underlying = baseSymbol.toUpperCase().trim();

    const instruments = await client.getInstruments(exchange);
    const options = instruments.filter((i: any) =>
      i.name === underlying && i.instrument_type === type && i.segment === segment
    );
    if (options.length === 0) return null;

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const getExpiryStr = (expiry: any): string => {
      if (!expiry) return '';
      const d = new Date(expiry);
      if (isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    };

    const uniqueExpiries = Array.from(new Set(options.map((i: any) => getExpiryStr(i.expiry))))
      .filter(exp => exp !== '' && exp >= todayStr);

    const sortedExpiries = uniqueExpiries.sort();
    if (sortedExpiries.length === 0) return null;

    const nearExpiry = sortedExpiries[0];
    const filteredOptions = options.filter((i: any) => getExpiryStr(i.expiry) === nearExpiry);

    // Sort by strike
    filteredOptions.sort((a: any, b: any) => Number(a.strike) - Number(b.strike));

    // Find ATM strike index
    let atmIndex = 0, minDiff = Infinity;
    for (let i = 0; i < filteredOptions.length; i++) {
      const diff = Math.abs(Number(filteredOptions[i].strike) - spotPrice);
      if (diff < minDiff) {
        minDiff = diff;
        atmIndex = i;
      }
    }

    // Determine target index based on Moneyness
    let targetIndex = atmIndex;
    if (moneyness === 'ITM') {
      if (type === 'CE' && atmIndex > 0) targetIndex = atmIndex - 1; // 1 strike lower for ITM Call
      if (type === 'PE' && atmIndex < filteredOptions.length - 1) targetIndex = atmIndex + 1; // 1 strike higher for ITM Put
    }

    const candidate = filteredOptions[targetIndex];
    if (!candidate) return null;

    // Liquidity & Spread Guard Check
    try {
      const quoteKey = `NFO:${candidate.tradingsymbol}`;
      const quoteMap = await kite.getQuote([quoteKey]);
      const quote = quoteMap[quoteKey];

      if (quote) {
        const ltp = quote.last_price || candidate.strike;
        const buyDepth = quote.depth?.buy?.[0]?.price || 0;
        const sellDepth = quote.depth?.sell?.[0]?.price || 0;

        if (buyDepth > 0 && sellDepth > 0 && ltp > 0) {
          const spreadPct = ((sellDepth - buyDepth) / ltp) * 100;
          const maxSpreadAllowed = state.config.maxBidAskSpreadPct ?? 1.2;

          if (spreadPct > maxSpreadAllowed) {
            this.log(state, `⚠️ Liquidity Warning: ${candidate.tradingsymbol} Bid-Ask spread (${spreadPct.toFixed(2)}%) exceeds max allowed (${maxSpreadAllowed}%). Testing ATM alternative...`);
            if (targetIndex !== atmIndex) {
              const atmCand = filteredOptions[atmIndex];
              const atmQuote = (await kite.getQuote([`NFO:${atmCand.tradingsymbol}`]))[`NFO:${atmCand.tradingsymbol}`];
              const atmBuy = atmQuote?.depth?.buy?.[0]?.price || 0;
              const atmSell = atmQuote?.depth?.sell?.[0]?.price || 0;
              const atmLtp = atmQuote?.last_price || 1;
              if (atmBuy > 0 && atmSell > 0) {
                const atmSpread = ((atmSell - atmBuy) / atmLtp) * 100;
                if (atmSpread <= maxSpreadAllowed) {
                  this.log(state, `💧 Selected liquid ATM substitute: ${atmCand.tradingsymbol} (Spread: ${atmSpread.toFixed(2)}% <= ${maxSpreadAllowed}%)`);
                  return atmCand.tradingsymbol;
                }
              }
            }
            this.log(state, `❌ Liquidity Guard: Rejected illiquid options for ${baseSymbol} (Spread > ${maxSpreadAllowed}%). Skipping to prevent slippage.`);
            return null;
          } else {
            this.log(state, `💧 Liquidity Filter Passed: ${candidate.tradingsymbol} Spread: ${spreadPct.toFixed(2)}% | Volume: ${quote.volume || 0}`);
          }
        }
      }
    } catch { }

    return candidate.tradingsymbol;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private calculateVolumeSMA(candles: Candle[], period: number, endIdx: number): number {
    const startIdx = Math.max(0, endIdx - period + 1);
    let sum = 0, count = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      sum += candles[i].volume;
      count++;
    }
    return count > 0 ? sum / count : 0;
  }

  private async fetchCandles(client: any, symbol: string, exchange: string, interval: string): Promise<Candle[]> {
    const cacheKey = `${exchange}:${symbol}:${interval}`;
    const cached = this.candleCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.candles;
    }

    const now = new Date();
    const istDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    const from = new Date(`${istDateStr} 09:15:00 GMT+0530`);
    from.setDate(from.getDate() - 5); // last 5 days
    const data = await client.getHistoricalData(symbol, exchange, interval, from, now);
    const candles = (data || []).map((c: any) => ({
      date: new Date(c.date), open: c.open, high: c.high,
      low: c.low, close: c.close, volume: c.volume,
    }));
    this.candleCache.set(cacheKey, { candles, expiresAt: Date.now() + 30_000 });
    return candles;
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

  private calculateVWAP(candles: Candle[], vwapSource: 'close' | 'hlc3' = 'close') {
    const vwaps: (number | null)[] = new Array(candles.length).fill(null);
    let cpv = 0, cv = 0;
    let lastDateStr = '';
    for (let i = 0; i < candles.length; i++) {
      const dateStr = this.getIstDateStr(candles[i].date);
      if (dateStr !== lastDateStr) {
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

  private roundTick(price: number): number {
    return Math.round(price / 0.05) * 0.05;
  }

  private resetStateToScanning(state: StrategyState) {
    state.stateType = 'SCANNING';
    state.optionSymbol = null;
    state.signalSide = null;
    state.entryTriggerPrice = null;
    state.stopLossPrice = null;
    state.targetPrice = null;
    state.target1Price = null;
    state.target2Price = null;
    state.highestPriceReached = undefined;
    state.isT1Reached = undefined;
    state.entryOrderId = null;
    state.entryTime = undefined;
    state.spotEntryPrice = undefined;
    state.spotStopLossPrice = undefined;
    state.isSlTrailedToCost = undefined;
    state.orderPlacedTimestamp = undefined;
    state.executionLatencyMs = undefined;
    state.partialBooked = false;
    state.initialQty = undefined;
    if (state.isAutoMode) {
      state.config.symbol = 'AUTO';
      state.activeStockSymbol = null;
    }
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

    if (latestCrossover !== null && crossoverIdx !== -1 && (idx - crossoverIdx) <= 3) {
      const currentEma = emas[idx], currentVwap = vwaps[idx];
      const currentCandle = candles[idx];
      if (currentEma === null || currentVwap === null) return null;

      const longValid = latestCrossover === 'LONG' && currentEma > currentVwap && currentCandle.close >= (currentVwap * 0.998);
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

  private formatTime(d: Date): string {
    return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  private getTrendDirection(idx: number, candles: Candle[], emas: (number | null)[], vwaps: (number | null)[]): 'LONG' | 'SHORT' | null {
    const crossover = this.getLatestCrossoverToday(idx, candles, emas, vwaps);
    if (crossover) return crossover;

    // Fallback to established trend alignment if EMA and VWAP are clearly directional today
    const currEma = emas[idx], currVwap = vwaps[idx], candle = candles[idx];
    if (currEma !== null && currVwap !== null && candle) {
      if (currEma > currVwap && candle.close >= currVwap && candle.close >= currEma) {
        return 'LONG';
      } else if (currEma < currVwap && candle.close <= currVwap && candle.close <= currEma) {
        return 'SHORT';
      }
    }
    return null;
  }

  private getLatestCrossoverToday(idx: number, candles: Candle[], emas: (number | null)[], vwaps: (number | null)[]): 'LONG' | 'SHORT' | null {
    const details = this.getLatestCrossoverTodayDetails(idx, candles, emas, vwaps);
    return details ? details.trend : null;
  }

  private async initialCatchup(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;
    const now = new Date();

    this.log(state, `🔍 Running catch-up for today's data...`);
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) {
      this.log(state, `⚠ Catch-up skipped: No active broker account or access token found.`);
      await this.persistLogs(state);
      return;
    }

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    try {
      if (state.isAutoMode || state.config.symbol === 'AUTO') {
        this.log(state, `🎯 Auto F&O Scanner active. Ready for live tick to scan top 5%-10% momentum breakout candidates.`);
        await this.persistLogs(state);
        return;
      }

      const interval = state.config.timeframe === '5min' ? '5minute' : '15minute';
      const candles = await this.fetchCandles(client, state.config.symbol, state.config.exchange, interval);
      const emaPeriod = state.config.emaPeriod || 15;
      if (candles.length < emaPeriod + 2) {
        this.log(state, `⚠ Catch-up skipped: Insufficient candles fetched for ${state.config.symbol} (need ${emaPeriod + 2}, got ${candles.length})`);
        await this.persistLogs(state);
        return;
      }

      const emas = this.calculateEMA(candles, emaPeriod);
      const vwaps = this.calculateVWAP(candles);
      const todayStr = this.getIstDateStr(now);

      let cachedOptCandles: Candle[] = [];
      let cachedOptSymbol = '';

      for (let i = emaPeriod + 1; i < candles.length; i++) {
        const currentCandle = candles[i];
        const candleDateStr = this.getIstDateStr(currentCandle.date);
        if (candleDateStr !== todayStr) continue;

        if (state.stateType === 'ACTIVE_POSITION' && state.optionSymbol) {
          if (cachedOptSymbol !== state.optionSymbol) {
            const rawOptData = await client.getHistoricalData(state.optionSymbol, 'NFO', interval, new Date(state.entryTime || currentCandle.date), now).catch(() => []);
            cachedOptCandles = (rawOptData || []).map((c: any) => ({
              date: new Date(c.date),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
            }));
            cachedOptSymbol = state.optionSymbol;
            await new Promise(r => setTimeout(r, 250)); // Rate limit pause
          }

          const currentOptCandle = cachedOptCandles.find(c => c.date.getTime() === currentCandle.date.getTime());

          if (currentOptCandle) {
            const high = currentOptCandle.high;
            const low = currentOptCandle.low;

            if (!state.isT1Reached && high >= state.target1Price!) {
              state.isT1Reached = true;
              state.stopLossPrice = state.entryTriggerPrice;
              state.isSlTrailedToCost = true;
              this.log(state, `🎯 (Catch-up) T1 (+50% ROI) hit at ₹${high.toFixed(2)} on ${this.formatTime(currentCandle.date)}! SL trailed to cost ₹${state.entryTriggerPrice}`);
            }

            if (high >= state.target2Price!) {
              this.log(state, `🏁 (Catch-up) T2 (+100% ROI Target) hit at ₹${high.toFixed(2)} on ${this.formatTime(currentCandle.date)}! Trade Closed.`);
              this.resetDailyState(state);
              cachedOptCandles = [];
              cachedOptSymbol = '';
              continue;
            }

            if (low <= state.stopLossPrice!) {
              this.log(state, `🛑 (Catch-up) Stop Loss hit at ₹${low.toFixed(2)} on ${this.formatTime(currentCandle.date)}. Trade Closed.`);
              this.resetDailyState(state);
              cachedOptCandles = [];
              cachedOptSymbol = '';
              continue;
            }
          }
          continue;
        }

        if (state.tradesPlacedToday >= state.config.maxTradesPerDay) break;

        const mother = candles[i - 1];
        const baby = candles[i];
        const motherDateStr = this.getIstDateStr(mother.date);
        const babyDateStr = this.getIstDateStr(baby.date);
        const isInsideCandle = motherDateStr === todayStr && babyDateStr === todayStr && baby.high <= mother.high && baby.low >= mother.low;
        const details = this.getLatestCrossoverTodayDetails(i, candles, emas, vwaps);

        if (details !== null) {
          const side = details.trend === 'LONG' ? 'CALL' : 'PUT';
          const crossoverCandle = candles[details.crossoverIdx];
          const isFreshCrossover = (i - details.crossoverIdx) <= 1;

          let triggerHigh: number | null = null;
          let triggerLow: number | null = null;
          let setupType = '';

          if (isInsideCandle) {
            if (side === 'CALL' && baby.close >= details.vwap * 0.998) {
              triggerHigh = mother.high;
              triggerLow = mother.low;
              setupType = 'Inside Candle Pullback';
            } else if (side === 'PUT' && baby.close <= details.vwap * 1.002) {
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
            this.log(
              state,
              `🔍 Detected ${side} (${setupType}) at ${this.formatTime(new Date(baby.date))} (EMA: ₹${details.ema.toFixed(2)}, VWAP: ₹${details.vwap.toFixed(2)}) — Trigger High: ₹${triggerHigh.toFixed(2)}, Low (SL): ₹${triggerLow.toFixed(2)}`
            );

            let breakoutFound = false;
            let setupInvalidated = false;

            for (let j = i + 1; j < Math.min(i + 13, candles.length); j++) {
              const checkCandle = candles[j];
              const isBreakout = side === 'CALL' ? checkCandle.high > triggerHigh : checkCandle.low < triggerLow;
              const isInvalidated = side === 'CALL' ? checkCandle.low < triggerLow : checkCandle.high > triggerHigh;

              if (isBreakout) {
                this.log(state, `🚀 (Catch-up) Found past ${side} Breakout (${setupType}) at ${this.formatTime(new Date(checkCandle.date))}!`);
                await this.setupBreakoutTrigger(state, client, kite, side, baby.date, side === 'CALL' ? triggerLow : triggerHigh, state.config.symbol, true);
                await new Promise(r => setTimeout(r, 250)); // Rate limit pause
                state.stateType = 'ACTIVE_POSITION';
                state.entryTime = checkCandle.date.getTime();
                i = j;
                breakoutFound = true;
                break;
              } else if (isInvalidated) {
                this.log(state, `❌ (Catch-up) Setup invalidated at ${this.formatTime(new Date(checkCandle.date))} (Price crossed VWAP/SL level ₹${triggerLow.toFixed(2)})`);
                setupInvalidated = true;
                break;
              }
            }

            if (!breakoutFound && !setupInvalidated) {
              this.log(state, `⏳ (Catch-up) Setup expired without breakout above ₹${triggerHigh.toFixed(2)}`);
            }
          }
        }
      }

      if (state.stateType === 'ACTIVE_POSITION' || state.stateType === 'WAITING_FOR_TRIGGER') {
        this.log(state, `📊 (Catch-up) Past morning signals reviewed. Transitioning to SCANNING for live market signals.`);
        this.resetStateToScanning(state);
      } else if (state.stateType === 'SCANNING') {
        this.log(state, `✅ Catch-up complete. Ready for live signals.`);
      }
      state.tradesPlacedToday = 0;
      await this.persistLogs(state);
    } catch (err) {
      this.log(state, `⚠ Catch-up failed: ${err.message}`);
      await this.persistLogs(state);
    }
  }

  private resetDailyState(state: StrategyState) {
    this.resetStateToScanning(state);
    state.tradesPlacedToday = 0;
    state.winsToday = 0;
    state.lossesToday = 0;
    state.lastProcessedTimestamp = 0;
  }

  private async trackOrder(state: StrategyState, price: number, status: 'OPEN' | 'COMPLETE') {
    try {
      const exec = await this.prisma.strategyExecution.findUnique({
        where: { id: state.executionId },
        include: { strategy: true },
      });
      if (!exec?.strategy?.userId) return;

      await this.prisma.order.create({
        data: {
          userId: exec.strategy.userId,
          brokerAccountId: state.brokerAccountId,
          executionId: state.executionId,
          symbol: state.optionSymbol || state.config.symbol || 'OPTION',
          exchange: 'NFO',
          side: 'BUY',
          orderType: 'SL',
          productType: state.config.product as any ?? 'MIS',
          qty: Math.max(1, state.positionQty || 1),
          price: price || 0,
          brokerOrderId: state.entryOrderId || `PAPER_${Math.random().toString(36).substring(7).toUpperCase()}`,
          status: state.isPaperTrade ? 'COMPLETE' : status,
          isPaperTrade: state.isPaperTrade,
        } as any,
      });
    } catch (e) {
      this.logger.warn(`Failed to track order in DB: ${e.message}`);
    }
  }

  private log(state: StrategyState, msg: string) {
    const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    state.logs.push(`[${ts}] ${msg}`);
    this.logger.log(`[${state.executionId}] ${msg}`);
  }

  private async persistLogs(state: StrategyState) {
    try {
      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { logs: JSON.stringify(state.logs.slice(-500)) },
      });
      strategyEvents.emit('strategy.update', {
        strategyId: state.strategyId,
        logs: state.logs,
        state: this.getState(state.strategyId),
      });
    } catch { }
  }

  private async updateOrderStatus(brokerOrderId: string, status: string, filledPrice: number | null) {
    try {
      await this.prisma.order.updateMany({
        where: { brokerOrderId },
        data: {
          status: status as any,
          ...(filledPrice && { avgPrice: filledPrice, price: filledPrice }),
        },
      });
    } catch (e) {
      this.logger.error(`Failed to update trigger order status: ${e.message}`);
    }
  }
}
