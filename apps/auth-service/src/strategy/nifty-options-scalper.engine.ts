import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { NiftyOptionsScalperConfig } from './dto/strategy.dto';
import { autoSelectStock } from './smart-stock-picker';
import { strategyEvents } from '../common/events';
import { TickerService } from '../market/ticker.service';

interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ScalperStrategyState {
  strategyId: string;
  executionId: string;
  config: NiftyOptionsScalperConfig;
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
  setupType?: string;
  entryPrice: number | null;
  stopLossPrice: number | null;
  initialSlPrice?: number | null;
  spotStopLossPrice?: number | null;
  targetPrice: number | null;
  slOrderId: string | null;
  targetOrderId: string | null;
  entryTriggered: 'LONG' | 'SHORT' | null;
  optionSymbol: string | null;
  tradesPlacedToday: number;
  winningTradesToday: number;
  logs: string[];
  lastProcessedTimestamp?: number;
  tickerUnsubscribe?: () => void;
  realtimeActive?: boolean;
  lastPnlLogTime?: number;
  lastTickTime?: number;
  lastExitTimestamp?: number;
  currentLtp?: number;
  currentPnlRs?: number;
  currentPnlPct?: number;
  peakPnlRs?: number;
  isCostSlTrailed?: boolean;
  isProfitLockTrailed?: boolean;
  isDynamicTrailingActive?: boolean;
  lastBrokerSlTrigger?: number;
  lastBrokerSlModifyTime?: number;
}

@Injectable()
export class NiftyOptionsScalperEngine {
  private readonly logger = new Logger(NiftyOptionsScalperEngine.name);
  private readonly running = new Map<string, ScalperStrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
    private tickerService: TickerService,
  ) { }

  getIndexScalpParams(symbol: string, userConfig?: Partial<NiftyOptionsScalperConfig>) {
    const symUpper = (symbol || 'NIFTY').toUpperCase().trim();
    const isSensex = symUpper.includes('SENSEX');
    const isBankNifty = symUpper.includes('BANKNIFTY');

    // Index-Adaptive Scaling Factors based on Index Spot & Lot Size:
    // NIFTY (~25,000 spot, 65 lot size)    -> 7 pt SL, 4 pt Cost trail, 7 pt lock (+5), 10 pt Target, 3.5 pt dynamic trail
    // SENSEX (~81,000 spot, 20 lot size)   -> 22 pt SL, 13 pt Cost trail, 22 pt lock (+16), 32 pt Target, 11.0 pt dynamic trail
    // BANKNIFTY (~54,000 spot, 15 lot size) -> 15 pt SL, 8 pt Cost trail, 15 pt lock (+10), 22 pt Target, 7.0 pt dynamic trail
    const defaultLotSize = isSensex ? 20 : (isBankNifty ? 15 : 65);
    const stopLossPoints = userConfig?.stopLossPoints || (isSensex ? 22 : (isBankNifty ? 15 : 7));
    const targetPoints = userConfig?.targetPoints || (isSensex ? 32 : (isBankNifty ? 22 : 10));
    const trailCostAtPoints = userConfig?.trailCostAtPoints || (isSensex ? 13 : (isBankNifty ? 8 : 4));
    const profitLockTriggerPts = isSensex ? 22 : (isBankNifty ? 15 : 7);
    const profitLockPts = isSensex ? 16 : (isBankNifty ? 10 : 5);
    const target1LockPts = isSensex ? 22 : (isBankNifty ? 15 : 7);
    const dynamicTrailBufferPts = isSensex ? 11.0 : (isBankNifty ? 7.0 : 3.5);
    const minCandleRange = isSensex ? 25 : (isBankNifty ? 18 : 8);
    const emaPullbackBuffer = isSensex ? 25 : (isBankNifty ? 16 : 8);

    return {
      isSensex,
      isBankNifty,
      defaultLotSize,
      stopLossPoints,
      targetPoints,
      trailCostAtPoints,
      profitLockTriggerPts,
      profitLockPts,
      target1LockPts,
      dynamicTrailBufferPts,
      minCandleRange,
      emaPullbackBuffer,
    };
  }

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) return { executionId: this.running.get(strategyId)!.executionId };

    const strategy = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
      include: { brokerAccount: true },
    });
    if (!strategy) throw new Error('Strategy not found');

    const parsedConfig: Partial<NiftyOptionsScalperConfig> = JSON.parse(strategy.config);
    const symUpper = (parsedConfig.symbol || 'NIFTY').toUpperCase().trim();
    const params = this.getIndexScalpParams(symUpper, parsedConfig);
    const lots = parsedConfig.lots || 1;
    const qty = parsedConfig.qty || (lots * params.defaultLotSize);
    const stopLossPoints = params.stopLossPoints;
    const targetPoints = params.targetPoints;
    const trailCostAtPoints = params.trailCostAtPoints;

    const config: NiftyOptionsScalperConfig = {
      symbol: parsedConfig.symbol || 'NIFTY',
      exchange: parsedConfig.exchange || (params.isSensex ? 'BSE' : 'NSE'),
      emaPeriod: parsedConfig.emaPeriod || 15,
      vwapSource: parsedConfig.vwapSource || 'close',
      isOptionBuyingOnly: true,
      qty,
      lots,
      product: parsedConfig.product || 'MIS',
      maxTradesPerDay: parsedConfig.maxTradesPerDay || 4,
      maxWinsPerDay: parsedConfig.maxWinsPerDay || 2,
      stopLossPoints,
      targetPoints,
      trailCostAtPoints,
      stopLossRs: stopLossPoints * qty,
      targetRs: targetPoints * qty,
      minPremium: parsedConfig.minPremium,
      maxPremium: parsedConfig.maxPremium,
      enableOrbTrigger: parsedConfig.enableOrbTrigger !== undefined ? parsedConfig.enableOrbTrigger : true,
      enablePullbackTrigger: parsedConfig.enablePullbackTrigger !== undefined ? parsedConfig.enablePullbackTrigger : true,
      enableRsiFilter: parsedConfig.enableRsiFilter !== undefined ? parsedConfig.enableRsiFilter : true,
      enableRangeFilter: parsedConfig.enableRangeFilter !== undefined ? parsedConfig.enableRangeFilter : true,
      enableStagnancyExit: parsedConfig.enableStagnancyExit !== undefined ? parsedConfig.enableStagnancyExit : true,
      stagnancyMinutes: parsedConfig.stagnancyMinutes || 15,
      moneyness: parsedConfig.moneyness || 'ITM',
    };

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
        status: 'COMPLETE'
      }
    }).catch(() => 0);

    const state: ScalperStrategyState = {
      strategyId,
      executionId: execution.id,
      config,
      brokerAccountId: strategy.brokerAccountId!,
      isPaperTrade: strategy.isPaperTrade,
      futureSymbol: null,
      futureExchange: symUpper.includes('SENSEX') ? 'BFO' : 'NFO',
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
      tradesPlacedToday: 0,
      winningTradesToday: 0,
      logs: [],
      lastProcessedTimestamp: 0,
      isCostSlTrailed: false,
      isProfitLockTrailed: false,
      isDynamicTrailingActive: false,
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Nifty 10-Point Scalper Started — ${config.symbol}:${config.exchange} (Target: +${config.targetPoints} pts, SL: -${config.stopLossPoints} pts, Cost Trail: +${config.trailCostAtPoints} pts, Strike: ${config.moneyness || 'ITM'})`);
    this.log(state, `⚡ High-Speed Engine active: 3-second tick frequency, RSI & Range choppiness filters enabled`);
    await this.persistLogs(state);

    const timer = setInterval(() => this.tick(strategyId).catch(e => this.logger.error(e)), 3_000);
    this.timers.set(strategyId, timer);

    this.initialCatchup(strategyId).then(() => {
      this.tick(strategyId).catch(e => this.logger.error(e));
    }).catch(e => this.logger.error(`Catch-up error: ${e.message}`));

    return { executionId: execution.id };
  }

  async stop(strategyId: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      this.stopRealtimeMonitor(state);
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
      this.stopRealtimeMonitor(state);
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
      entryTriggered: s.entryTriggered,
      tradesToday: s.tradesPlacedToday,
      winningTradesToday: s.winningTradesToday,
      optionSymbol: s.optionSymbol,
      futureSymbol: s.futureSymbol || s.config.symbol,
      entryPrice: s.entryPrice,
      currentLtp: s.currentLtp || s.entryPrice,
      stopLossPrice: s.stopLossPrice,
      targetPrice: s.targetPrice,
      pnlRs: s.currentPnlRs ?? 0,
      pnlPct: s.currentPnlPct ?? 0,
      peakPnlRs: s.peakPnlRs ?? 0,
      qty: s.config.qty,
      isGoalAchieved: s.winningTradesToday >= (s.config.maxWinsPerDay || 1),
      isPaperTrade: s.isPaperTrade,
    };
  }

  async squareOff(strategyId: string): Promise<{ success: boolean; message: string }> {
    const state = this.running.get(strategyId);
    if (!state) return { success: false, message: 'Strategy is not running' };
    if (!state.entryTriggered || !state.optionSymbol) return { success: false, message: 'No active open position to square off' };

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    const client = account?.accessToken ? this.factory.createClient(account) : null;

    let exitPrice = state.currentLtp || state.entryPrice || 0;
    if (client && !state.isPaperTrade) {
      try {
        const ltpData = await client['kite'].getLTP([`NFO:${state.optionSymbol}`]);
        exitPrice = ltpData[`NFO:${state.optionSymbol}`]?.last_price || exitPrice;
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
    const now = new Date();
    if (this.getIstHhmm(now) < 9 * 60 + 20) return;

    this.log(state, `🔍 Running catch-up for Nifty 10-Point Scalper...`);
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    try {
      const upper = state.config.symbol.toUpperCase().trim();
      const isIndex = upper.includes('NIFTY') || upper.includes('BANKNIFTY') || upper.includes('FINNIFTY') || upper.includes('MIDCPNIFTY') || upper.includes('SENSEX');
      if (isIndex && !state.futureSymbol) {
        const res = await this.findFutureSymbol(client, state.config.symbol);
        state.futureSymbol = res.symbol;
        state.futureExchange = res.exchange;
        this.log(state, `Resolved future contract for index: ${state.futureExchange}:${state.futureSymbol}`);
      }

      const candles = await this.fetchCandles(client, state.config, '5minute', now, state.futureSymbol || undefined, state.futureSymbol ? state.futureExchange : undefined);
      const emaPeriod = state.config.emaPeriod || 15;
      if (candles.length < emaPeriod + 2) return;

      const emas = this.calculateEMA(candles, emaPeriod);
      const vwaps = this.calculateVWAP(candles, state.config.vwapSource || 'close');
      const stochRsis = this.calculateStochRSI(candles, 14, 14, 3, 3);

      const todayStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });

      // Determine target trading session date: if today has candles (weekday), use today; otherwise pick the most recent trading date from fetched candles!
      const lastCandle = candles[candles.length - 1];
      const latestCandleDateStr = lastCandle ? lastCandle.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' }) : todayStr;

      const todayCandlesCheck = candles.filter(c => c.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' }) === todayStr);
      const targetSessionDateStr = todayCandlesCheck.length > 0 ? todayStr : latestCandleDateStr;

      // Identify 15-min Opening Range (9:15 - 9:30 AM candles) for ORB Trigger
      let orbHigh: number | null = null;
      let orbLow: number | null = null;
      const sessionCandles = candles.filter(c => c.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' }) === targetSessionDateStr);
      if (sessionCandles.length >= 3) {
        const orbCandles = sessionCandles.slice(0, 3);
        orbHigh = Math.max(...orbCandles.map(c => c.high));
        orbLow = Math.min(...orbCandles.map(c => c.low));
      }

      for (let i = emaPeriod + 1; i < candles.length; i++) {
        const currentCandle = candles[i];
        const candleDateStr = currentCandle.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
        if (candleDateStr !== targetSessionDateStr) continue;

        if (state.winningTradesToday >= (state.config.maxWinsPerDay || 1)) {
          this.log(state, `🎯 Daily target win achieved (${state.winningTradesToday} win). Catch-up complete.`);
          break;
        }

        if (state.tradesPlacedToday >= state.config.maxTradesPerDay) {
          this.log(state, `⛔ Daily trade cap (${state.config.maxTradesPerDay}) reached during catch-up.`);
          break;
        }

        const currentEma = emas[i];
        const currentVwap = vwaps[i];
        const currStoch = stochRsis[i];
        const prevStoch = stochRsis[i - 1];
        const currK = currStoch?.k ?? null;
        const currD = currStoch?.d ?? null;
        const prevK = prevStoch?.k ?? null;
        if (currentEma === null || currentVwap === null) continue;

        // Active Position Management in Catch-up
        if (state.entryTriggered) {
          const params = this.getIndexScalpParams(state.config.symbol, state.config);
          const optSymbol = state.optionSymbol!;
          const exch = state.futureExchange === 'BFO' ? 'BFO' : 'NFO';
          const rawData = await client.getHistoricalData(optSymbol, exch, '5minute', new Date(state.setupTimestamp || currentCandle.date), now);
          const optCandles: Candle[] = (rawData || []).map((c: any) => ({ date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
          const optCandle = optCandles.find(c => c.date.getTime() === currentCandle.date.getTime());

          if (optCandle) {
            // Step 1: Check Cost Trail
            if (optCandle.high >= state.entryPrice! + params.trailCostAtPoints && !state.isCostSlTrailed) {
              state.isCostSlTrailed = true;
              state.stopLossPrice = Math.max(state.stopLossPrice || 0, state.entryPrice!);
              this.log(state, `🛡 (Catch-up) Option hit +${params.trailCostAtPoints} pts profit! Trailed SL to COST (₹${state.entryPrice!.toFixed(2)}) — Risk-Free Trade!`);
            }

            // Step 2: Check Profit Lock
            if (optCandle.high >= state.entryPrice! + params.profitLockTriggerPts && state.stopLossPrice! < state.entryPrice! + params.profitLockPts) {
              state.isProfitLockTrailed = true;
              state.stopLossPrice = state.entryPrice! + params.profitLockPts;
              this.log(state, `🔒 (Catch-up) Option hit +${params.profitLockTriggerPts} pts profit! Locked +${params.profitLockPts} pts profit (SL set to ₹${state.stopLossPrice.toFixed(2)}) — +₹${(params.profitLockPts * state.config.qty).toFixed(2)} Profit Guaranteed!`);
            }

            // Step 3: Check Target 1 Milestone & Dynamic Trailing
            if (optCandle.high >= state.entryPrice! + params.targetPoints) {
              state.isDynamicTrailingActive = true;
              state.winningTradesToday = Math.max(state.winningTradesToday, 1);
              if (state.stopLossPrice! < state.entryPrice! + params.target1LockPts) {
                state.stopLossPrice = state.entryPrice! + params.target1LockPts;
              }
              const dynamicSl = this.roundTick(optCandle.high - params.dynamicTrailBufferPts);
              if (dynamicSl > state.stopLossPrice!) {
                state.stopLossPrice = dynamicSl;
              }
            }

            // Stop Loss / Trailing SL Check
            if (optCandle.low <= state.stopLossPrice!) {
              const exitPrice = state.stopLossPrice!;
              const pnlPoints = exitPrice - state.entryPrice!;
              const pnlRs = pnlPoints * state.config.qty;
              const isWin = pnlPoints >= 0;
              this.log(state, `${isWin ? '🎯 (Catch-up) Trailing Profit Hit' : '🛑 (Catch-up) Stop Loss Hit'} (${pnlPoints >= 0 ? '+' : ''}${pnlPoints.toFixed(1)} pts / ₹${pnlRs.toFixed(2)}) on ${this.formatTime(currentCandle.date)} @ ₹${exitPrice.toFixed(2)}`);
              await this.exitPositionHistorical(state, client, exitPrice, isWin ? 'TARGET' : 'SL', currentCandle.date);
              continue;
            }

            // 3:10 PM EOD Square Off
            if (this.getIstHhmm(currentCandle.date) >= 15 * 60 + 10) {
              const exitPrice = optCandle.close;
              this.log(state, `⏰ (Catch-up) 3:10 PM EOD Cutoff reached! Squared off at ₹${exitPrice.toFixed(2)}`);
              await this.exitPositionHistorical(state, client, exitPrice, 'TARGET', currentCandle.date);
              continue;
            }
          }
          continue;
        }

        // ── 3-Trigger Catch-up Scanning ─────────────────────────────────────────

        // 1. Post-Trade Cooldown Check (15 minutes / 3 candles) to prevent entering at exhausted peaks
        if (state.lastExitTimestamp && (currentCandle.date.getTime() - state.lastExitTimestamp) < 15 * 60 * 1000) {
          continue;
        }

        const prevCandle = candles[i - 1];
        const prevDateStr = prevCandle.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
        if (prevDateStr !== targetSessionDateStr) continue;

        const prevEma = emas[i - 1], prevVwap = vwaps[i - 1];
        const candleRange = currentCandle.high - currentCandle.low;
        const scanParams = this.getIndexScalpParams(state.config.symbol, state.config);

        // Skip micro / flat candles to avoid choppy sideways whipsaws
        if (state.config.enableRangeFilter !== false && candleRange < scanParams.minCandleRange) continue;

        let triggerSide: 'BUY' | 'SELL' | null = null;
        let setupName = '';
        let triggerPriceLevel = currentCandle.close;

        // Trigger 1: EMA-VWAP Crossover
        if (prevEma !== null && prevVwap !== null) {
          if (prevEma <= prevVwap && currentEma > currentVwap) {
            triggerSide = 'BUY'; setupName = 'EMA-VWAP Bullish Crossover'; triggerPriceLevel = currentCandle.high;
          } else if (prevEma >= prevVwap && currentEma < currentVwap) {
            triggerSide = 'SELL'; setupName = 'EMA-VWAP Bearish Crossover'; triggerPriceLevel = currentCandle.low;
          }
        }

        // Trigger 2: VWAP / 15-EMA Pullback Rejection (Captures CE & PE continuation)
        if (!triggerSide && state.config.enablePullbackTrigger) {
          const candleHhmm = this.getIstHhmm(currentCandle.date);
          if (candleHhmm >= 9 * 60 + 35) {
            const isBearishRegime = currentEma < currentVwap && currentCandle.close < currentEma && currentCandle.close < currentVwap;
            const isBullishRegime = currentEma > currentVwap && currentCandle.close > currentEma && currentCandle.close > currentVwap;

            const touchedVwapOrEmaBearish = currentCandle.high >= currentEma - scanParams.emaPullbackBuffer && currentCandle.high <= Math.max(currentEma, currentVwap) + (scanParams.emaPullbackBuffer + 2);
            const touchedVwapOrEmaBullish = currentCandle.low <= currentEma + scanParams.emaPullbackBuffer && currentCandle.low >= Math.min(currentEma, currentVwap) - (scanParams.emaPullbackBuffer + 2);

            if (isBearishRegime && touchedVwapOrEmaBearish && currentCandle.close < currentCandle.open && currentCandle.low < prevCandle.low) {
              triggerSide = 'SELL'; setupName = 'VWAP/EMA Pullback PE Rejection'; triggerPriceLevel = currentCandle.low;
            } else if (isBullishRegime && touchedVwapOrEmaBullish && currentCandle.close > currentCandle.open && currentCandle.high > prevCandle.high) {
              triggerSide = 'BUY'; setupName = 'VWAP/EMA Pullback CE Rejection'; triggerPriceLevel = currentCandle.high;
            }
          }
        }

        // Trigger 3: 15-Min Opening Range Breakdown (ORB) — strictly active between 9:30 AM and 11:30 AM!
        const candleHhmm = this.getIstHhmm(currentCandle.date);
        const isOrbTimeWindow = candleHhmm >= 9 * 60 + 30 && candleHhmm <= 11 * 60 + 30;
        if (!triggerSide && state.config.enableOrbTrigger && isOrbTimeWindow && orbLow !== null && orbHigh !== null && i >= 3) {
          if (currentCandle.close < orbLow && prevCandle.close >= orbLow) {
            triggerSide = 'SELL'; setupName = '15-Min ORB Breakdown (PE)'; triggerPriceLevel = currentCandle.low;
          } else if (currentCandle.close > orbHigh && prevCandle.close <= orbHigh) {
            triggerSide = 'BUY'; setupName = '15-Min ORB Breakout (CE)'; triggerPriceLevel = currentCandle.high;
          }
        }

        // Apply Optimized Stochastic RSI (14, 14, 3, 3) Momentum Confirmation Filter by Setup Type
        if (triggerSide && state.config.enableRsiFilter !== false && currK !== null && currD !== null) {
          const isBreakoutSetup = setupName.includes('Crossover') || setupName.includes('ORB');

          if (triggerSide === 'BUY') {
            const isKAboveD = currK >= currD - 0.5;
            const isRising = prevK === null || currK >= prevK - 1.0;
            const isNotToppedOut = currK <= 92;

            const isBullishZone = isBreakoutSetup
              ? (currK >= 50 && isRising)
              : ((currK <= 45 && (prevK === null || currK >= prevK)) || (currK >= 50));

            if (!(isKAboveD && isRising && isNotToppedOut && isBullishZone)) {
              triggerSide = null; // Filter out weak CE
            }
          } else if (triggerSide === 'SELL') {
            const isKBelowD = currK <= currD + 0.5;
            const isFalling = prevK === null || currK <= prevK + 1.0;
            const isNotBottomedOut = currK >= 8;

            const isBearishZone = isBreakoutSetup
              ? (currK <= 50 && isFalling)
              : ((currK >= 55 && (prevK === null || currK <= prevK)) || (currK <= 50));

            if (!(isKBelowD && isFalling && isNotBottomedOut && isBearishZone)) {
              triggerSide = null; // Filter out weak PE
            }
          }
        }

        if (triggerSide) {
          const kStr = currK !== null ? currK.toFixed(1) : 'N/A';
          const dStr = currD !== null ? currD.toFixed(1) : 'N/A';
          this.log(state, `🚀 (Catch-up) Detected ${setupName} on ${this.formatTime(currentCandle.date)} (StochRSI %K: ${kStr}, %D: ${dStr}, Range: ${candleRange.toFixed(1)} pts)! Executing 10-point Option Trade...`);
          await this.placeTrade(state, client, account, triggerSide, triggerPriceLevel, new Date(currentCandle.date), new Date(prevCandle.date), currentCandle.low, currentCandle.high);
        }
      }

      if (!state.entryTriggered) this.log(state, `✅ Catch-up complete for Nifty 10-Point Scalper. Evaluated ${sessionCandles.length} 5-min candles for session (${targetSessionDateStr}).`);
      state.tradesPlacedToday = 0;
      await this.persistLogs(state);
    } catch (err) {
      this.log(state, `⚠ Catch-up failed: ${err.message}`);
      await this.persistLogs(state);
    }
  }

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;
    const now = new Date();
    const hhmm = this.getIstHhmm(now);
    if (hhmm < 9 * 60 + 15 || hhmm >= 15 * 60 + 30) return;

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const { config } = state;
    const kite = client['kite'];

    if (state.winningTradesToday >= (config.maxWinsPerDay || 1)) {
      this.log(state, `🎯 Daily win goal reached (${state.winningTradesToday} win). Auto-stopping scalper for today.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'COMPLETED', `🎯 Auto-Stopped: Daily 10-point target locked`);
      return;
    }

    if (state.tradesPlacedToday >= config.maxTradesPerDay) {
      this.log(state, `⛔ Max daily trade cap (${config.maxTradesPerDay}) reached.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'COMPLETED', `⛔ Auto-Stopped: Max daily trade cap reached`);
      return;
    }

    if (state.entryTriggered) {
      await this.monitorPosition(state, client, kite);
      await this.persistLogs(state);
      return;
    }

    try {
      const candles = await this.fetchCandles(client, config, '5minute', now, state.futureSymbol || undefined, state.futureSymbol ? state.futureExchange : undefined);
      if (candles.length < 2) return;

      const latestCandle = candles[candles.length - 1];
      const isClosed = (now.getTime() - latestCandle.date.getTime()) >= 5 * 60 * 1000;
      const closedCandles = isClosed ? candles : candles.slice(0, -1);
      if (closedCandles.length < 2) return;

      const lastIdx = closedCandles.length - 1;
      const lastClosedCandleTime = closedCandles[lastIdx].date.getTime();

      if (lastClosedCandleTime > (state.lastProcessedTimestamp || 0)) {
        state.lastProcessedTimestamp = lastClosedCandleTime;
        const emas = this.calculateEMA(closedCandles, config.emaPeriod || 15);
        const vwaps = this.calculateVWAP(closedCandles, config.vwapSource || 'close');
        const stochRsis = this.calculateStochRSI(closedCandles, 14, 14, 3, 3);

        const currEma = emas[lastIdx], prevEma = emas[lastIdx - 1];
        const currVwap = vwaps[lastIdx], prevVwap = vwaps[lastIdx - 1];
        const currStoch = stochRsis[lastIdx], prevStoch = stochRsis[lastIdx - 1];
        const currK = currStoch?.k ?? null, currD = currStoch?.d ?? null;
        const prevK = prevStoch?.k ?? null;
        const currentCandle = closedCandles[lastIdx];
        const prevCandle = closedCandles[lastIdx - 1];
        const candleRange = currentCandle.high - currentCandle.low;
        const scanParams = this.getIndexScalpParams(config.symbol, config);

        const todayStr = this.getIstDateStr(now);
        const currDateStr = this.getIstDateStr(currentCandle.date);
        const prevDateStr = this.getIstDateStr(prevCandle.date);

        // Ensure both current candle and previous candle belong strictly to today's trading session
        if (currDateStr !== todayStr || prevDateStr !== todayStr) return;

        // 1. Post-Trade Cooldown Check (15 minutes / 3 candles) to prevent entering at exhausted peaks
        if (state.lastExitTimestamp && (currentCandle.date.getTime() - state.lastExitTimestamp) < 15 * 60 * 1000) {
          const remMin = Math.ceil((15 * 60 * 1000 - (currentCandle.date.getTime() - state.lastExitTimestamp)) / 60000);
          this.log(state, `⏳ Post-trade cooldown active (${remMin}m remaining). Skipping entries.`);
          return;
        }

        let triggerSide: 'BUY' | 'SELL' | null = null;
        let setupName = '';

        // Skip micro / flat candles to avoid choppy sideways whipsaws
        const isRangeValid = config.enableRangeFilter === false || candleRange >= scanParams.minCandleRange;

        if (isRangeValid) {
          // 1. EMA-VWAP Crossover Trigger (requires price confirmation)
          if (prevEma !== null && prevVwap !== null && currEma !== null && currVwap !== null) {
            if (prevEma <= prevVwap && currEma > currVwap && currentCandle.close >= currVwap && currentCandle.close >= currEma && currentCandle.close >= currentCandle.open) {
              triggerSide = 'BUY'; setupName = 'EMA-VWAP Bullish Crossover';
            } else if (prevEma >= prevVwap && currEma < currVwap && currentCandle.close <= currVwap && currentCandle.close <= currEma && currentCandle.close <= currentCandle.open) {
              triggerSide = 'SELL'; setupName = 'EMA-VWAP Bearish Crossover';
            }
          }

          // 2. VWAP / 15-EMA Pullback Rejection (Captures CE & PE continuation)
          if (!triggerSide && config.enablePullbackTrigger && currEma !== null && currVwap !== null) {
            const candleHhmm = this.getIstHhmm(currentCandle.date);
            if (candleHhmm >= 9 * 60 + 35) {
              const isBearishRegime = currEma < currVwap && currentCandle.close < currEma && currentCandle.close < currVwap;
              const isBullishRegime = currEma > currVwap && currentCandle.close > currEma && currentCandle.close > currVwap;

              const touchedVwapOrEmaBearish = currentCandle.high >= currEma - scanParams.emaPullbackBuffer && currentCandle.high <= Math.max(currEma, currVwap) + (scanParams.emaPullbackBuffer + 2);
              const touchedVwapOrEmaBullish = currentCandle.low <= currEma + scanParams.emaPullbackBuffer && currentCandle.low >= Math.min(currEma, currVwap) - (scanParams.emaPullbackBuffer + 2);

              if (isBearishRegime && touchedVwapOrEmaBearish && currentCandle.close < currentCandle.open && currentCandle.low < prevCandle.low) {
                triggerSide = 'SELL'; setupName = 'VWAP/EMA Pullback PE Rejection';
              } else if (isBullishRegime && touchedVwapOrEmaBullish && currentCandle.close > currentCandle.open && currentCandle.high > prevCandle.high) {
                triggerSide = 'BUY'; setupName = 'VWAP/EMA Pullback CE Rejection';
              }
            }
          }

          // 3. 15-Min Opening Range Breakdown (ORB) — strictly active between 9:30 AM and 11:30 AM!
          const candleHhmm = this.getIstHhmm(currentCandle.date);
          const isOrbTimeWindow = candleHhmm >= 9 * 60 + 30 && candleHhmm <= 11 * 60 + 30;
          let orbHigh: number | null = null;
          let orbLow: number | null = null;
          const todayCandles = closedCandles.filter(c => this.getIstDateStr(c.date) === todayStr);
          if (todayCandles.length >= 3) {
            const orbCandles = todayCandles.slice(0, 3);
            orbHigh = Math.max(...orbCandles.map(c => c.high));
            orbLow = Math.min(...orbCandles.map(c => c.low));
          }

          if (!triggerSide && config.enableOrbTrigger && isOrbTimeWindow && orbLow !== null && orbHigh !== null && lastIdx >= 3) {
            if (currentCandle.close < orbLow && prevCandle.close >= orbLow) {
              triggerSide = 'SELL'; setupName = '15-Min ORB Breakdown (PE)';
            } else if (currentCandle.close > orbHigh && prevCandle.close <= orbHigh) {
              triggerSide = 'BUY'; setupName = '15-Min ORB Breakout (CE)';
            }
          }

          // Apply Optimized Stochastic RSI (14, 14, 3, 3) Momentum Confirmation Filter by Setup Type
          if (triggerSide && config.enableRsiFilter !== false && currK !== null && currD !== null) {
            const isBreakoutSetup = setupName.includes('Crossover') || setupName.includes('ORB');

            if (triggerSide === 'BUY') {
              const isKAboveD = currK >= currD - 0.5;
              const isRising = prevK === null || currK >= prevK - 1.0;
              const isNotToppedOut = currK <= 92;

              const isBullishZone = isBreakoutSetup
                ? (currK >= 50 && isRising)
                : ((currK <= 45 && (prevK === null || currK >= prevK)) || (currK >= 50));

              if (!(isKAboveD && isRising && isNotToppedOut && isBullishZone)) {
                triggerSide = null; // Filter out weak CE
              }
            } else if (triggerSide === 'SELL') {
              const isKBelowD = currK <= currD + 0.5;
              const isFalling = prevK === null || currK <= prevK + 1.0;
              const isNotBottomedOut = currK >= 8;

              const isBearishZone = isBreakoutSetup
                ? (currK <= 50 && isFalling)
                : ((currK >= 55 && (prevK === null || currK <= prevK)) || (currK <= 50));

              if (!(isKBelowD && isFalling && isNotBottomedOut && isBearishZone)) {
                triggerSide = null; // Filter out weak PE
              }
            }
          }
        }

        const rangeStr = this.formatCandleRange(currentCandle.date, 5);
        const closeTimeStr = this.formatCandleCloseTime(currentCandle.date, 5);
        const kStr = currK !== null ? currK.toFixed(1) : 'N/A';
        const dStr = currD !== null ? currD.toFixed(1) : 'N/A';

        if (triggerSide) {
          this.log(state, `🚀 Triggered ${setupName} on 5m candle [${rangeStr}] (closed at ${closeTimeStr}, StochRSI %K: ${kStr}, %D: ${dStr}, Range: ${candleRange.toFixed(1)} pts)! Placing 10-Point Option Trade...`);
          await this.placeTrade(state, client, account, triggerSide, currentCandle.close);
        } else {
          this.log(state, `👀 Scanned 5-min candle [${rangeStr}] (closed at ${closeTimeStr}) @ ₹${currentCandle.close.toFixed(2)} — EMA: ₹${currEma?.toFixed(2)} | VWAP: ₹${currVwap?.toFixed(2)} | StochRSI: ${kStr}/${dStr} (No crossover signal)`);
        }
      }
    } catch (err) { this.log(state, `❌ Tick error: ${err.message}`); }
    await this.persistLogs(state);
  }

  private async placeTrade(state: ScalperStrategyState, client: any, account: any, side: 'BUY' | 'SELL', triggerPrice: number, triggerTime?: Date, motherTime?: Date, motherLow?: number, motherHigh?: number) {
    const { config } = state;
    if (state.entryTriggered) return;
    const kite = client['kite'];
    const type = side === 'BUY' ? 'CE' : 'PE';

    const optSym = await this.findOptionSymbol(client, state, triggerPrice, type, triggerTime);
    if (!optSym) {
      this.log(state, `⚠ Could not resolve ${type} option contract for Nifty.`);
      return;
    }

    const exch = state.futureExchange === 'BFO' ? 'BFO' : 'NFO';
    let optionEntryPrice = 100;
    if (triggerTime) {
      const histPrice = await this.getHistoricalOptionPrice(client, optSym, exch, triggerTime);
      if (histPrice !== null) optionEntryPrice = histPrice;
    } else {
      const q = await kite.getLTP([`${exch}:${optSym}`]);
      if (q[`${exch}:${optSym}`]?.last_price) optionEntryPrice = q[`${exch}:${optSym}`].last_price;
    }

    const params = this.getIndexScalpParams(config.symbol, config);
    const entry = this.roundTick(optionEntryPrice);
    const sl = this.roundTick(entry - (params.stopLossPoints));
    const tgt = this.roundTick(entry + (params.targetPoints));

    // Dynamic Capital Sizing & Lot Auto-Calculation
    const isHistorical = !!triggerTime;
    let capital = (config as any).maxCapital;
    if (!capital || capital <= 0) {
      if (client && !state.isPaperTrade && !isHistorical) {
        try {
          const k = client['kite'] || client;
          const liveMargins = await (k.getMargins ? k.getMargins() : client.getMargins?.()).catch(() => null);
          const liveCash = liveMargins?.equity?.available?.live_balance
            ?? liveMargins?.equity?.available?.cash
            ?? liveMargins?.equity?.net
            ?? liveMargins?.available?.live_balance
            ?? liveMargins?.available?.cash
            ?? liveMargins?.net;
          if (liveCash && liveCash > 0) {
            capital = Number(liveCash);
            this.log(state, `💰 Live Zerodha Equity Margin detected: ₹${capital.toLocaleString('en-IN')}`);
          }
        } catch { }
      }
    }
    if (!capital || capital <= 0) capital = 15000;

    const lotSize = params.defaultLotSize;

    // Dynamic sizing: Reserve 15% cash buffer (min ₹1,000), deploy 85% tradeable margin for option buying
    const capitalBuffer = Math.max(1000, capital * 0.15);
    const tradeableCapital = Math.max(2000, capital - capitalBuffer);
    const perLotCost = entry * lotSize;
    let dynamicLots = Math.max(1, Math.floor(tradeableCapital / Math.max(1, perLotCost)));

    if (config.lots && config.lots > 1) {
      dynamicLots = Math.max(config.lots, dynamicLots);
    }
    const tradeQty = dynamicLots * lotSize;
    state.config.qty = tradeQty;
    state.config.lots = dynamicLots;

    state.entryTriggered = 'LONG';
    state.optionSymbol = optSym;
    state.entryPrice = entry;
    state.stopLossPrice = sl;
    state.initialSlPrice = sl;
    state.targetPrice = tgt;
    state.setupTimestamp = triggerTime ? triggerTime.getTime() : Date.now();
    state.isCostSlTrailed = false;
    state.isProfitLockTrailed = false;
    state.isDynamicTrailingActive = false;

    this.log(state, `📋 Placed Option Trade: ${exch}:${optSym} — Entry: ₹${entry.toFixed(2)} | Target (+${params.targetPoints} pts): ₹${tgt.toFixed(2)} | Initial SL (-${params.stopLossPoints} pts): ₹${sl.toFixed(2)} | Qty: ${tradeQty} (${dynamicLots} lots, ₹${(tradeQty * entry).toLocaleString('en-IN')} deployed)`);

    const tStart = performance.now();
    try {
      const orderId = (state.isPaperTrade || isHistorical)
        ? `PAPER_${Math.random().toString(36).substring(7).toUpperCase()}`
        : await client.placeOrder({ symbol: optSym, exchange: exch, product: config.product, qty: tradeQty, side: 'BUY', orderType: 'MARKET' });

      const elapsed = (performance.now() - tStart).toFixed(2);
      this.log(state, `⚡ Order punched in ${elapsed} ms [${state.isPaperTrade ? 'Paper Trade' : 'Live Broker Execution'}] (Order ID: ${orderId})`);

      // Track order in DB asynchronously (non-blocking for ultra-fast tick startup)
      this.trackOrderInDB(state, 'BUY', optSym, exch, tradeQty, entry, orderId, triggerTime).catch(() => { });

      // Live Broker SL Order Placement at Zerodha Server
      if (!state.isPaperTrade && !isHistorical) {
        const slTriggerPrice = this.roundTick(sl);
        const slLimitPrice = this.roundTick(Math.max(0.05, sl - 1.00));
        try {
          state.slOrderId = await client.placeOrder({
            symbol: optSym,
            exchange: exch,
            product: config.product ?? 'MIS',
            qty: tradeQty,
            side: 'SELL',
            orderType: 'SL',
            price: slLimitPrice,
            triggerPrice: slTriggerPrice
          });
          this.log(state, `🛡 Armed Zerodha Server SL Order (${state.slOrderId}) for ${tradeQty} shares @ Trigger ₹${slTriggerPrice.toFixed(2)}, Limit ₹${slLimitPrice.toFixed(2)}`);
        } catch (slErr: any) {
          this.log(state, `⚠ Failed to arm broker SL order: ${slErr.message}. Realtime monitor will guard position.`);
        }
      }

      if (!isHistorical) {
        await this.startRealtimeMonitor(state, client);
      }
    } catch (e) {
      this.log(state, `❌ Trade placement failed: ${e.message}`);
    }
  }

  private async startRealtimeMonitor(state: ScalperStrategyState, client: any) {
    if (!state.optionSymbol || !state.entryTriggered) return;

    const symbol = state.optionSymbol;
    try {
      await this.tickerService.subscribeSymbol(state.brokerAccountId, symbol);
      this.log(state, `📡 Real-time WebSocket active for ${symbol}`);
    } catch {
      return;
    }

    const params = this.getIndexScalpParams(state.config.symbol, state.config);
    state.realtimeActive = true;
    let isExiting = false;

    const unsubscribe = this.tickerService.registerListener(async (ticks) => {
      const currentPrice = ticks[symbol] || ticks[`NFO:${symbol}`] || ticks[`BFO:${symbol}`];
      if (!currentPrice || !state.entryTriggered || isExiting) return;

      const now = Date.now();
      state.lastTickTime = now;
      state.currentLtp = currentPrice;
      const pnlPoints = currentPrice - state.entryPrice!;
      const pnlRs = pnlPoints * state.config.qty;
      const pnlPct = state.entryPrice ? (pnlPoints / state.entryPrice) * 100 : 0;
      state.currentPnlRs = pnlRs;
      state.currentPnlPct = pnlPct;
      state.peakPnlRs = Math.max(state.peakPnlRs || 0, pnlRs);

      // 0. Check if Server SL Order filled at Zerodha
      if (!state.isPaperTrade && state.slOrderId && client) {
        const kite = client['kite'] || client;
        if (kite && kite.getOrders) {
          try {
            const orders = await kite.getOrders();
            const slOrder = orders.find((o: any) => o.order_id === state.slOrderId);
            if (slOrder?.status === 'COMPLETE') {
              isExiting = true;
              const avgPrice = Number(slOrder.average_price) || state.stopLossPrice!;
              const isProfitExit = avgPrice >= state.entryPrice!;
              this.log(state, `🛑 Zerodha Server SL Order (${state.slOrderId}) filled at ₹${avgPrice.toFixed(2)}`);
              this.stopRealtimeMonitor(state);
              await this.exitPosition(state, client, avgPrice, isProfitExit ? 'TARGET' : 'SL');
              await this.persistLogs(state);
              return;
            }
          } catch { }
        }
      }

      // 1. 3:05 PM Mandatory Cutoff (Exit safely before Zerodha 3:12 PM RMS cutoff)
      if (this.getIstHhmm(new Date()) >= 15 * 60 + 5) {
        isExiting = true;
        this.log(state, `⏰ 3:05 PM Mandatory Cutoff reached! Auto-squaring off at ₹${currentPrice.toFixed(2)} (P&L: ₹${pnlRs.toFixed(2)})`);
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
        await this.persistLogs(state);
        return;
      }

      // 2. Step 1: Check Breakeven Trail (Trail to COST)
      if (pnlPoints >= params.trailCostAtPoints && !state.isCostSlTrailed) {
        state.isCostSlTrailed = true;
        state.stopLossPrice = Math.max(state.stopLossPrice || 0, state.entryPrice!);
        this.log(state, `🛡 Option profit hit +${params.trailCostAtPoints} pts! Trailed SL to COST (₹${state.entryPrice!.toFixed(2)}) — Risk-Free Trade!`);
        await this.updateBrokerSlSafe(client, client['kite'], state, symbol);
      }

      // 3. Step 2: Check Profit Lock
      if (pnlPoints >= params.profitLockTriggerPts && state.stopLossPrice! < state.entryPrice! + params.profitLockPts) {
        state.isProfitLockTrailed = true;
        state.stopLossPrice = state.entryPrice! + params.profitLockPts;
        this.log(state, `🔒 Option profit hit +${params.profitLockTriggerPts} pts! Locked +${params.profitLockPts} pts profit (SL set to ₹${state.stopLossPrice.toFixed(2)}) — +₹${(params.profitLockPts * state.config.qty).toFixed(2)} Profit Guaranteed!`);
        await this.updateBrokerSlSafe(client, client['kite'], state, symbol);
      }

      // 4. Step 3: Target 1 Milestone Reached -> Activate Uncapped Dynamic Trailing!
      if (pnlPoints >= params.targetPoints && !state.isDynamicTrailingActive) {
        state.isDynamicTrailingActive = true;
        state.winningTradesToday = Math.max(state.winningTradesToday, 1);
        if (state.stopLossPrice! < state.entryPrice! + params.target1LockPts) {
          state.stopLossPrice = state.entryPrice! + params.target1LockPts;
        }
        this.log(state, `🚀 Target-1 Milestone Reached (+${pnlPoints.toFixed(1)} pts / ₹${pnlRs.toFixed(2)}) @ ₹${currentPrice.toFixed(2)}! Activating Uncapped Momentum Trailing. Profit locked at +${params.target1LockPts} pts (₹${state.stopLossPrice.toFixed(2)}). Trailing ${params.dynamicTrailBufferPts} pts behind LTP to catch the big runner!`);
        await this.updateBrokerSlSafe(client, client['kite'], state, symbol);
      }

      // 5. Step 4: Beyond Target 1 Dynamic Ratchet Trailing
      if (state.isDynamicTrailingActive && currentPrice >= state.entryPrice! + params.targetPoints) {
        const dynamicSl = this.roundTick(currentPrice - params.dynamicTrailBufferPts);
        if (dynamicSl > state.stopLossPrice!) {
          state.stopLossPrice = dynamicSl;
          this.log(state, `📈 Dynamic Momentum Trail: LTP ₹${currentPrice.toFixed(2)} (+${pnlPoints.toFixed(1)} pts) -> Trailed SL to ₹${dynamicSl.toFixed(2)} (+${(dynamicSl - state.entryPrice!).toFixed(1)} pts / +₹${((dynamicSl - state.entryPrice!) * state.config.qty).toFixed(2)} locked)`);
          await this.updateBrokerSlSafe(client, client['kite'], state, symbol);
        }
      }

      // 6. Stagnant Trade / Theta Decay Timeout (Exit flat trade after 15m without momentum)
      const stagnancyMs = (state.config.stagnancyMinutes || 15) * 60 * 1000;
      const holdingTime = now - (state.setupTimestamp || now);
      if (state.config.enableStagnancyExit !== false && holdingTime >= stagnancyMs && !state.isDynamicTrailingActive) {
        if (pnlPoints >= -3 && pnlPoints <= 2) {
          isExiting = true;
          this.log(state, `⌛ Stagnant Trade Timeout (${Math.round(holdingTime / 60000)}m flat). Exiting at ₹${currentPrice.toFixed(2)} (P&L: ${pnlPoints.toFixed(1)} pts) to prevent theta decay.`);
          this.stopRealtimeMonitor(state);
          await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
          await this.persistLogs(state);
          return;
        }
      }

      // 7. Check Stop Loss / Trailing Stop Trigger
      if (currentPrice <= state.stopLossPrice!) {
        isExiting = true;
        const isProfitExit = state.stopLossPrice! >= state.entryPrice!;
        const exitType = isProfitExit ? 'TARGET' : 'SL';
        this.log(state, `${isProfitExit ? '🎯 Trailing Stop Hit' : '🛑 Stop Loss Hit'} (${pnlPoints >= 0 ? '+' : ''}${pnlPoints.toFixed(1)} pts / ₹${pnlRs.toFixed(2)}) @ ₹${currentPrice.toFixed(2)}`);
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, exitType);
        await this.persistLogs(state);
        return;
      }

      if (now - (state.lastPnlLogTime || 0) >= 15000) {
        state.lastPnlLogTime = now;
        const sign = pnlRs >= 0 ? '+' : '';
        this.log(state, `📊 [LIVE P&L] ${symbol}: ₹${currentPrice.toFixed(2)} | P&L: ${pnlPoints >= 0 ? '+' : ''}${pnlPoints.toFixed(1)} pts (${sign}₹${pnlRs.toFixed(2)}) | SL: ₹${state.stopLossPrice!.toFixed(2)} | Target: ₹${state.targetPrice!.toFixed(2)}`);
        await this.persistLogs(state);
      }
    });

    state.tickerUnsubscribe = unsubscribe;
  }

  private stopRealtimeMonitor(state: ScalperStrategyState) {
    if (state.tickerUnsubscribe) {
      state.tickerUnsubscribe();
      state.tickerUnsubscribe = undefined;
      state.realtimeActive = false;
      this.log(state, `📡 Live tracking stopped`);
    }
  }

  private async updateBrokerSlSafe(client: any, kite: any, state: ScalperStrategyState, symbol: string) {
    if (state.isPaperTrade || !state.slOrderId || state.slOrderId === 'FAILED' || !state.stopLossPrice) return;
    try {
      const triggerPrice = this.roundTick(state.stopLossPrice);
      const limitPrice = this.roundTick(Math.max(0.05, triggerPrice - 1.00));

      const now = Date.now();
      if (state.lastBrokerSlModifyTime && (now - state.lastBrokerSlModifyTime < 1500)) return;
      if (state.lastBrokerSlTrigger && Math.abs(state.lastBrokerSlTrigger - triggerPrice) < 0.25) return;

      const k = kite || client?.['kite'] || client;
      if (client && client.modifyOrder) {
        await client.modifyOrder(state.slOrderId, {
          triggerPrice: triggerPrice,
          price: limitPrice,
        }).catch((e: any) => {
          this.log(state, `⚠ Zerodha SL modify notice: ${e.message}`);
        });
        state.lastBrokerSlTrigger = triggerPrice;
        state.lastBrokerSlModifyTime = now;
        this.log(state, `🛡 Synced Trailing SL to Zerodha Exchange (${state.slOrderId}) -> Trigger: ₹${triggerPrice.toFixed(2)}, Limit: ₹${limitPrice.toFixed(2)}`);
      } else if (k && k.modifyOrder) {
        await k.modifyOrder('regular', state.slOrderId, {
          trigger_price: triggerPrice,
          price: limitPrice,
        }).catch((e: any) => {
          this.log(state, `⚠ Zerodha Kite SL modify notice: ${e.message}`);
        });
        state.lastBrokerSlTrigger = triggerPrice;
        state.lastBrokerSlModifyTime = now;
        this.log(state, `🛡 Synced Trailing SL to Zerodha Exchange (${state.slOrderId}) -> Trigger: ₹${triggerPrice.toFixed(2)}, Limit: ₹${limitPrice.toFixed(2)}`);
      }
    } catch (e: any) {
      this.logger.warn(`Failed to update broker SL order: ${e.message}`);
    }
  }

  private async monitorPosition(state: ScalperStrategyState, client: any, kite: any) {
    if (!state.optionSymbol || !state.entryTriggered) return;

    const symbol = state.optionSymbol;
    const params = this.getIndexScalpParams(state.config.symbol, state.config);
    const exch = state.futureExchange === 'BFO' ? 'BFO' : 'NFO';
    const key = `${exch}:${symbol}`;

    // 0. Check if Server SL Order filled at Zerodha
    if (!state.isPaperTrade && state.slOrderId && kite) {
      try {
        const orders = await kite.getOrders();
        const slOrder = orders.find((o: any) => o.order_id === state.slOrderId);
        if (slOrder?.status === 'COMPLETE') {
          const avgPrice = Number(slOrder.average_price) || state.stopLossPrice!;
          const isProfitExit = avgPrice >= state.entryPrice!;
          this.log(state, `🛑 Zerodha Server SL Order (${state.slOrderId}) filled at ₹${avgPrice.toFixed(2)}`);
          this.stopRealtimeMonitor(state);
          await this.exitPosition(state, client, avgPrice, isProfitExit ? 'TARGET' : 'SL');
          await this.persistLogs(state);
          return;
        }
      } catch { }
    }

    // 1. 3:05 PM Cutoff
    if (this.getIstHhmm(new Date()) >= 15 * 60 + 5) {
      let exitPrice = state.currentLtp || state.entryPrice || 0;
      try {
        const ltpData = await kite.getLTP([key]);
        if (ltpData[key]?.last_price) exitPrice = ltpData[key].last_price;
      } catch { }
      this.log(state, `⏰ 3:05 PM Cutoff reached in poll monitor! Squaring off at ₹${exitPrice.toFixed(2)}`);
      this.stopRealtimeMonitor(state);
      await this.exitPosition(state, client, exitPrice, 'FORCE_CLOSE');
      await this.persistLogs(state);
      return;
    }

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
        this.log(state, `⚠ LTP check notice: ${e.message}`);
      }
    }

    if (!currentPrice) return;

    const pnlPoints = currentPrice - state.entryPrice!;
    const pnlRs = pnlPoints * state.config.qty;
    const pnlPct = state.entryPrice ? (pnlPoints / state.entryPrice) * 100 : 0;
    state.currentPnlRs = pnlRs;
    state.currentPnlPct = pnlPct;
    state.peakPnlRs = Math.max(state.peakPnlRs || 0, pnlRs);

    // 2. Breakeven Trailing (Trail to COST)
    if (pnlPoints >= params.trailCostAtPoints && !state.isCostSlTrailed) {
      state.isCostSlTrailed = true;
      state.stopLossPrice = Math.max(state.stopLossPrice || 0, state.entryPrice!);
      this.log(state, `🛡 Option profit hit +${params.trailCostAtPoints} pts! Trailed SL to COST (₹${state.entryPrice!.toFixed(2)}) — Risk-Free Trade!`);
      await this.updateBrokerSlSafe(client, kite, state, symbol);
    }

    // 3. Profit Lock
    if (pnlPoints >= params.profitLockTriggerPts && state.stopLossPrice! < state.entryPrice! + params.profitLockPts) {
      state.isProfitLockTrailed = true;
      state.stopLossPrice = state.entryPrice! + params.profitLockPts;
      this.log(state, `🔒 Option profit hit +${params.profitLockTriggerPts} pts! Locked +${params.profitLockPts} pts profit (SL set to ₹${state.stopLossPrice.toFixed(2)}) — +₹${(params.profitLockPts * state.config.qty).toFixed(2)} Profit Guaranteed!`);
      await this.updateBrokerSlSafe(client, kite, state, symbol);
    }

    // 4. Target 1 Milestone -> Activate Uncapped Dynamic Trailing
    if (pnlPoints >= params.targetPoints && !state.isDynamicTrailingActive) {
      state.isDynamicTrailingActive = true;
      state.winningTradesToday = Math.max(state.winningTradesToday, 1);
      if (state.stopLossPrice! < state.entryPrice! + params.target1LockPts) {
        state.stopLossPrice = state.entryPrice! + params.target1LockPts;
      }
      this.log(state, `🚀 Target-1 Milestone Reached (+${pnlPoints.toFixed(1)} pts / ₹${pnlRs.toFixed(2)}) @ ₹${currentPrice.toFixed(2)}! Activating Uncapped Momentum Trailing.`);
      await this.updateBrokerSlSafe(client, kite, state, symbol);
    }

    // 5. Beyond Target 1 Dynamic Ratchet Trailing
    if (state.isDynamicTrailingActive && currentPrice >= state.entryPrice! + params.targetPoints) {
      const dynamicSl = this.roundTick(currentPrice - params.dynamicTrailBufferPts);
      if (dynamicSl > state.stopLossPrice!) {
        state.stopLossPrice = dynamicSl;
        this.log(state, `📈 Dynamic Momentum Trail: LTP ₹${currentPrice.toFixed(2)} (+${pnlPoints.toFixed(1)} pts) -> Trailed SL to ₹${dynamicSl.toFixed(2)} (+${(dynamicSl - state.entryPrice!).toFixed(1)} pts locked)`);
        await this.updateBrokerSlSafe(client, kite, state, symbol);
      }
    }

    // 6. Stagnant Trade / Theta Decay Timeout
    const now = Date.now();
    const stagnancyMs = (state.config.stagnancyMinutes || 15) * 60 * 1000;
    const holdingTime = now - (state.setupTimestamp || now);
    if (state.config.enableStagnancyExit !== false && holdingTime >= stagnancyMs && !state.isDynamicTrailingActive) {
      if (pnlPoints >= -3 && pnlPoints <= 2) {
        this.log(state, `⌛ Stagnant Trade Timeout in poll (${Math.round(holdingTime / 60000)}m flat). Exiting at ₹${currentPrice.toFixed(2)}.`);
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
        await this.persistLogs(state);
        return;
      }
    }

    const sign = pnlRs >= 0 ? '+' : '';
    this.log(state, `📊 [LIVE P&L] ${symbol}: ₹${currentPrice.toFixed(2)} | P&L: ${pnlPoints >= 0 ? '+' : ''}${pnlPoints.toFixed(1)} pts (${sign}₹${pnlRs.toFixed(2)}) | SL: ₹${state.stopLossPrice!.toFixed(2)} | Target: ₹${state.targetPrice!.toFixed(2)}`);

    if (currentPrice <= state.stopLossPrice!) {
      const isProfitExit = state.stopLossPrice! >= state.entryPrice!;
      const exitType = isProfitExit ? 'TARGET' : 'SL';
      this.log(state, `${isProfitExit ? '🎯 Trailing Stop Hit' : '🛑 Stop Loss Hit'} at ₹${currentPrice.toFixed(2)}`);
      await this.exitPosition(state, client, currentPrice, exitType);
      await this.persistLogs(state);
    }
  }

  private async exitPosition(state: ScalperStrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET' | 'FORCE_CLOSE') {
    const symbol = state.optionSymbol!;
    const qty = state.config.qty;
    const exch = state.futureExchange === 'BFO' ? 'BFO' : 'NFO';
    this.stopRealtimeMonitor(state);

    // Cancel open broker SL order safely to prevent double exits
    if (!state.isPaperTrade && client && state.slOrderId && state.slOrderId !== 'FAILED') {
      try {
        await client.cancelOrder(state.slOrderId).catch(() => { });
        this.log(state, `🧹 Cancelled pending Zerodha SL order (${state.slOrderId})`);
      } catch { }
    }

    // ── 0. Prevent Duplicate Exit Order if User Already Exited on Zerodha ──────
    if (!state.isPaperTrade && client) {
      try {
        const kite = client['kite'];
        if (kite && kite.getPositions) {
          const pos = await kite.getPositions().catch(() => null);
          const allPos = [...(pos?.net || []), ...(pos?.day || [])];
          const currentPos = allPos.find((p: any) => p.tradingsymbol === symbol);
          const liveNetQty = currentPos ? currentPos.quantity : 0;

          if (liveNetQty <= 0 && reason !== 'FORCE_CLOSE') {
            this.log(state, `ℹ [AUTO-SYNC] ${symbol} was already squared off manually on Zerodha (Net Qty: 0). Skipping duplicate exit order to prevent order misplacement.`);
            state.entryTriggered = null;
            state.optionSymbol = null;
            state.entryPrice = null;
            state.stopLossPrice = null;
            state.targetPrice = null;
            state.slOrderId = null;
            state.isCostSlTrailed = false;
            state.isProfitLockTrailed = false;
            state.isDynamicTrailingActive = false;
            return;
          }
        }
      } catch (err: any) {
        this.log(state, `⚠ Position sync check notice: ${err.message}`);
      }
    }

    try {
      const exitOrderId = state.isPaperTrade
        ? `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`
        : await client.placeOrder({ symbol, exchange: exch, product: state.config.product, qty, side: 'SELL', orderType: 'MARKET' });

      await this.trackOrderInDB(state, 'SELL', symbol, exch, qty, exitPrice, exitOrderId);
      state.tradesPlacedToday++;
      state.lastExitTimestamp = Date.now();

      state.entryTriggered = null;
      state.optionSymbol = null;
      state.entryPrice = null;
      state.stopLossPrice = null;
      state.targetPrice = null;
      state.slOrderId = null;
      state.isCostSlTrailed = false;
      state.isProfitLockTrailed = false;
      state.isDynamicTrailingActive = false;
    } catch (e) {
      this.log(state, `❌ Exit execution failed: ${e.message}`);
    }
  }

  private async exitPositionHistorical(state: ScalperStrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET', timestamp: Date) {
    const symbol = state.optionSymbol!;
    const qty = state.config.qty;
    const exch = state.futureExchange === 'BFO' ? 'BFO' : 'NFO';
    this.stopRealtimeMonitor(state);

    try {
      const exitOrderId = `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`;
      await this.trackOrderInDB(state, 'SELL', symbol, exch, qty, exitPrice, exitOrderId, timestamp);
      state.tradesPlacedToday++;
      state.lastExitTimestamp = timestamp.getTime();

      state.entryTriggered = null;
      state.optionSymbol = null;
      state.entryPrice = null;
      state.stopLossPrice = null;
      state.targetPrice = null;
      state.slOrderId = null;
      state.isCostSlTrailed = false;
      state.isProfitLockTrailed = false;
      state.isDynamicTrailingActive = false;
    } catch (e) {
      this.log(state, `❌ Historical exit failed: ${e.message}`);
    }
  }

  private async trackOrderInDB(
    state: ScalperStrategyState,
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
          productType: state.config.product,
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
        cpv = 0; cv = 0; lastDateStr = dateStr;
      }
      const price = vwapSource === 'close' ? candles[i].close : (candles[i].high + candles[i].low + candles[i].close) / 3;
      cpv += price * candles[i].volume;
      cv += candles[i].volume;
      vwaps[i] = cv === 0 ? candles[i].close : cpv / cv;
    }
    return vwaps;
  }

  private calculateRSI(candles: Candle[], period: number = 9): (number | null)[] {
    const rsis: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period + 1) return rsis;

    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsis[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

    for (let i = period + 1; i < candles.length; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rsis[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
    }
    return rsis;
  }

  /**
   * Calculates Stochastic RSI (14, 14, 3, 3) returning %K and %D lines (0 - 100)
   */
  private calculateStochRSI(
    candles: Candle[],
    rsiPeriod: number = 14,
    stochPeriod: number = 14,
    smoothK: number = 3,
    smoothD: number = 3
  ): Array<{ k: number | null; d: number | null }> {
    const n = candles.length;
    const result: Array<{ k: number | null; d: number | null }> = new Array(n).fill({ k: null, d: null });
    const rsis = this.calculateRSI(candles, rsiPeriod);

    const rawStoch: (number | null)[] = new Array(n).fill(null);

    for (let i = rsiPeriod + stochPeriod - 1; i < n; i++) {
      let minRsi = Infinity;
      let maxRsi = -Infinity;
      let valid = true;

      for (let j = i - stochPeriod + 1; j <= i; j++) {
        const val = rsis[j];
        if (val === null) { valid = false; break; }
        if (val < minRsi) minRsi = val;
        if (val > maxRsi) maxRsi = val;
      }

      if (valid && minRsi !== Infinity && maxRsi !== -Infinity) {
        const curr = rsis[i]!;
        rawStoch[i] = maxRsi === minRsi ? 50 : ((curr - minRsi) / (maxRsi - minRsi)) * 100;
      }
    }

    // Calculate %K (3-period SMA of rawStoch)
    const kValues: (number | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (i < smoothK - 1) continue;
      let sum = 0;
      let count = 0;
      for (let j = i - smoothK + 1; j <= i; j++) {
        if (rawStoch[j] !== null) {
          sum += rawStoch[j]!;
          count++;
        }
      }
      if (count === smoothK) {
        kValues[i] = sum / smoothK;
      }
    }

    // Calculate %D (3-period SMA of %K)
    for (let i = 0; i < n; i++) {
      if (kValues[i] === null) {
        result[i] = { k: null, d: null };
        continue;
      }
      let sum = 0;
      let count = 0;
      for (let j = i - smoothD + 1; j <= i; j++) {
        if (j >= 0 && kValues[j] !== null) {
          sum += kValues[j]!;
          count++;
        }
      }
      const dVal = count === smoothD ? sum / smoothD : null;
      result[i] = { k: kValues[i], d: dVal };
    }

    return result;
  }

  private async fetchCandles(client: any, config: any, interval: string, now: Date, symbol?: string, exchange?: string): Promise<Candle[]> {
    const istDateStr = this.getIstDateStr(now);
    const from = new Date(`${istDateStr}T09:15:00.000+05:30`);
    from.setDate(from.getDate() - 5);
    const sym = symbol || config.symbol;
    const exch = exchange || config.exchange;
    const data = await client.getHistoricalData(sym, exch, interval, from, now);
    return (data || []).map((c: any) => ({ date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
  }

  private async getHistoricalOptionPrice(client: any, symbol: string, exchange: string, timestamp: Date): Promise<number | null> {
    try {
      const from = new Date(timestamp.getTime() - 10 * 60 * 1000);
      const to = new Date(timestamp.getTime() + 10 * 60 * 1000);
      const data = await client.getHistoricalData(symbol, exchange, '5minute', from, to);
      if (!data || data.length === 0) return null;
      const targetTimeMs = timestamp.getTime();
      const match = data.find((c: any) => new Date(c.date).getTime() === targetTimeMs);
      return match ? match.close : data[0].close;
    } catch {
      return null;
    }
  }

  private async findOptionSymbol(client: any, state: ScalperStrategyState, futurePrice: number, type: 'CE' | 'PE', triggerTime?: Date): Promise<string | null> {
    const { config } = state;
    const upper = config.symbol.toUpperCase().trim();
    let underlying = 'NIFTY';
    if (upper.includes('BANKNIFTY')) underlying = 'BANKNIFTY';
    else if (upper.includes('FINNIFTY')) underlying = 'FINNIFTY';
    else if (upper.includes('MIDCPNIFTY')) underlying = 'MIDCPNIFTY';
    else if (upper.includes('SENSEX')) underlying = 'SENSEX';

    const exchange = underlying === 'SENSEX' ? 'BFO' : 'NFO';
    const segment = underlying === 'SENSEX' ? 'BFO-OPT' : 'NFO-OPT';

    const instruments = await client.getInstruments(exchange);
    const options = instruments.filter((i: any) => i.name === underlying && i.instrument_type === type && (i.segment === segment || i.segment === `${exchange}-OPT`));
    if (options.length === 0) return null;

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const getExpiryStr = (expiry: any): string => {
      if (!expiry) return '';
      const d = new Date(expiry);
      return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    };

    const uniqueExpiries = Array.from(new Set(options.map((i: any) => getExpiryStr(i.expiry)))).filter(exp => exp !== '' && exp >= todayStr).sort();
    if (uniqueExpiries.length === 0) return null;

    const nearestExpiry = uniqueExpiries[0];
    const filteredOptions = options.filter((i: any) => getExpiryStr(i.expiry) === nearestExpiry);

    const step = (underlying === 'NIFTY' || underlying === 'FINNIFTY') ? 50 : (underlying === 'MIDCPNIFTY' ? 25 : 100);
    const atm = Math.round(futurePrice / step) * step;

    // 1. Premium range search (if minPremium and maxPremium specified)
    if (config.minPremium && config.maxPremium) {
      const candidateStrikes = [atm, atm + step, atm - step, atm + 2 * step, atm - 2 * step, atm + 3 * step, atm - 3 * step];
      for (const strike of candidateStrikes) {
        const opt = filteredOptions.find((i: any) => Number(i.strike) === strike);
        if (!opt) continue;
        const p = triggerTime ? await this.getHistoricalOptionPrice(client, opt.tradingsymbol, exchange, triggerTime) : null;
        if (p !== null && p >= config.minPremium && p <= config.maxPremium) {
          return opt.tradingsymbol;
        }
      }
    }

    // 2. High-Delta Slight ITM / ATM strike selection (Delta >= 0.55 for fastest 10-point capture)
    const useItm = config.moneyness === 'ITM';
    const targetStrike = useItm ? (type === 'CE' ? (atm - step) : (atm + step)) : atm;

    const itmMatch = filteredOptions.find((i: any) => Number(i.strike) === targetStrike);
    if (itmMatch) return itmMatch.tradingsymbol;

    // 3. Exact ATM Fallback
    const atmMatch = filteredOptions.find((i: any) => Number(i.strike) === atm);
    if (atmMatch) return atmMatch.tradingsymbol;

    let closest: any = null, closestD = Infinity;
    for (const opt of filteredOptions) {
      const d = Math.abs(Number(opt.strike) - futurePrice);
      if (d < closestD) { closestD = d; closest = opt; }
    }
    return closest ? closest.tradingsymbol : null;
  }

  private getIstHhmm(date: Date): number {
    const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
    const istDate = new Date(utcMs + (330 * 60000));
    return istDate.getHours() * 60 + istDate.getMinutes();
  }

  private roundTick(p: number) { return Math.round(p / 0.05) * 0.05; }
  private formatTime(d: Date) { return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
  private log(state: ScalperStrategyState, msg: string) { const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); state.logs.push(`[${ts}] ${msg}`); this.logger.log(`[${state.executionId}] ${msg}`); }
  private async persistLogs(state: ScalperStrategyState) {
    try {
      await this.prisma.strategyExecution.update({ where: { id: state.executionId }, data: { logs: JSON.stringify(state.logs.slice(-200)) } });
      strategyEvents.emit('strategy.update', {
        strategyId: state.strategyId,
        logs: state.logs,
        state: this.getState(state.strategyId),
      });
    } catch { }
  }

  private async findFutureSymbol(client: any, baseSymbol: string): Promise<{ symbol: string; exchange: string }> {
    const upperSymbol = baseSymbol.toUpperCase().trim();
    let underlying = 'NIFTY';
    if (upperSymbol.includes('BANK')) underlying = 'BANKNIFTY';
    else if (upperSymbol.includes('FIN')) underlying = 'FINNIFTY';
    else if (upperSymbol.includes('MIDCP')) underlying = 'MIDCPNIFTY';
    else if (upperSymbol.includes('SENSEX')) underlying = 'SENSEX';

    const exchange = underlying === 'SENSEX' ? 'BFO' : 'NFO';
    const segment = underlying === 'SENSEX' ? 'BFO-FUT' : 'NFO-FUT';
    const instruments = await client.getInstruments(exchange);
    const futures = instruments.filter((i: any) => i.name === underlying && i.instrument_type === 'FUT' && (i.segment === segment || i.segment === `${exchange}-FUT`));
    if (futures.length === 0) throw new Error(`No ${exchange} future for ${baseSymbol}`);
    const sorted = futures.sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    return { symbol: sorted[0].tradingsymbol, exchange };
  }
}
