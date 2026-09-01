import { Injectable, Logger } from '@nestjs/common';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { strategyEvents } from '../common/events';
import { TickerService } from '../market/ticker.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmaVwapCrossoverConfig } from './dto/strategy.dto';
import { getInstrumentTickSize, getTopCandidateStocks, roundToInstrumentTick } from './smart-stock-picker';

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
  setupType?: 'DIRECT' | 'INSIDE_CANDLE' | 'OPEN_LOW_DRIVE' | 'OPEN_HIGH_DRIVE';
  invalidatedCrossoverTime?: number | null;
  entryPrice: number | null;
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
  currentLtp?: number;
  currentPnlRs?: number;
  currentPnlPct?: number;
  peakPnlRs?: number;
  lockedProfitRs?: number;
  isTrailingEma?: boolean;
  isAutoMode?: boolean;
  activeSymbol?: string | null;
  dailyRealizedPnlRs?: number;
  dailyTargetLocked?: boolean;
}

@Injectable()
export class EmaVwapCrossoverEngine {
  private readonly logger = new Logger(EmaVwapCrossoverEngine.name);
  private readonly running = new Map<string, StrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
    private tickerService: TickerService,
  ) { }

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

    const state: StrategyState = {
      strategyId,
      executionId: execution.id,
      config,
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
      tradesPlacedToday: 0,
      dailyRealizedPnlRs: 0,
      dailyTargetLocked: false,
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

    // ── Live Position Recovery after power cut or server restart ─────────────
    if (!strategy.isPaperTrade && strategy.brokerAccount?.accessToken) {
      try {
        const client = this.factory.createClient(strategy.brokerAccount);
        const kite = client['kite'] || client;
        if (kite && kite.getPositions) {
          const positionsData = await kite.getPositions().catch(() => null);
          const netPositions = positionsData?.net || [];
          const openPos = netPositions.find((p: any) =>
            p.product === (config.product || 'MIS') &&
            Number(p.quantity) !== 0 &&
            (state.isAutoMode || p.tradingsymbol === config.symbol || p.tradingsymbol?.startsWith(config.symbol))
          );

          if (openPos) {
            const rawQty = Number(openPos.quantity);
            const side = rawQty > 0 ? 'LONG' : 'SHORT';
            const absQty = Math.abs(rawQty);
            const entryAvg = Number(openPos.average_price) || Number(openPos.buy_price) || Number(openPos.sell_price) || 0;
            const sym = openPos.tradingsymbol;

            state.activeSymbol = sym;
            state.entryTriggered = side;
            state.executedQty = absQty;
            state.config.qty = absQty;
            state.entryPrice = entryAvg;

            // Look for existing broker SL order
            const orders = await (kite.getOrders ? kite.getOrders() : []).catch(() => []);
            const openOrders = (orders || []).filter((o: any) => o.tradingsymbol === sym && (o.status === 'TRIGGER PENDING' || o.status === 'OPEN'));
            const slOrder = openOrders.find((o: any) => o.order_type === 'SL' || o.order_type === 'SL-M');
            const targetOrder = openOrders.find((o: any) => o.order_type === 'LIMIT');

            if (slOrder) {
              state.slOrderId = slOrder.order_id;
              state.stopLossPrice = Number(slOrder.trigger_price) || Number(slOrder.price);
            } else {
              const riskPerSh = entryAvg * 0.01;
              state.stopLossPrice = side === 'LONG' ? (entryAvg - riskPerSh) : (entryAvg + riskPerSh);
            }

            if (targetOrder) {
              state.targetOrderId = targetOrder.order_id;
              state.targetPrice = Number(targetOrder.price);
            } else {
              const riskPerSh = Math.abs(entryAvg - (state.stopLossPrice || entryAvg * 0.01));
              state.targetPrice = side === 'LONG' ? (entryAvg + riskPerSh * 1.5) : (entryAvg - riskPerSh * 1.5);
            }

            this.log(state, `🔄 [POWER RECOVERY] Reconnected to active Zerodha position: ${sym} (${absQty} shares ${side} @ Avg ₹${entryAvg.toFixed(2)}) | SL: ₹${state.stopLossPrice?.toFixed(2)} [OrderId: ${state.slOrderId || 'Active'}] | Target: ₹${state.targetPrice?.toFixed(2)}`);
            this.log(state, `📡 Resumed live real-time tracking & dynamic trailing seamlessly!`);
            await this.startRealtimeMonitor(state, client);
          }
        }
      } catch (recErr: any) {
        this.logger.debug?.(`Position recovery notice on start: ${recErr.message}`);
      }
    }

    await this.persistLogs(state); // Persist immediately so UI shows "Started" and capital

    const timer = setInterval(() => this.tick(strategyId).catch(e => this.logger.error(e)), 10_000);
    this.timers.set(strategyId, timer);

    this.initialCatchup(strategyId).then(() => {
      this.tick(strategyId).catch(e => this.logger.error(e));
    }).catch(e => this.logger.error(`Catch-up error: ${e.message}`));

    return { executionId: execution.id };
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
      activeSymbol: s.activeSymbol || s.config.symbol,
      optionSymbol: s.optionSymbol || s.activeSymbol || s.config.symbol,
      entryPrice: s.entryPrice,
      currentLtp: s.currentLtp || s.entryPrice,
      stopLossPrice: s.stopLossPrice,
      targetPrice: s.targetPrice,
      pnlRs: s.currentPnlRs ?? 0,
      pnlPct: s.currentPnlPct ?? 0,
      peakPnlRs: s.peakPnlRs ?? 0,
      qty: s.executedQty || s.config.qty,
      executedQty: s.executedQty || s.config.qty,
      targetQty: s.config.qty,
      entryOrderId: s.entryOrderId,
      isTrailingEma: s.isTrailingEma ?? false,
      lastEma: s.lastEma,
      isPaperTrade: s.isPaperTrade,
      dailyRealizedPnlRs: s.dailyRealizedPnlRs ?? 0,
      dailyTargetLocked: s.dailyTargetLocked ?? false,
    };
  }

  async squareOff(strategyId: string): Promise<{ success: boolean; message: string }> {
    const state = this.running.get(strategyId);
    if (!state) return { success: false, message: 'Strategy is not running' };
    if (!state.entryTriggered) return { success: false, message: 'No active open position to square off' };

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
    const now = new Date();
    if (this.getIstHhmm(now) < 9 * 60 + 20) return;

    this.log(state, `🔍 Running catch-up for today's data...`);
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    try {
      if (state.config.symbol === 'AUTO') {
        const candidates = await getTopCandidateStocks(kite, state.config.targetRs, state.config.stopLossRs, this.logger, (state.config as any).maxCapital, 30);
        this.log(state, `🚀 Simultaneous Multi-Stock Scanner: Scanning top 30 Zerodha liquid F&O leaders simultaneously...`);

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
              const lastIdx = closedCCandles.length - 1;

              // 1. Check Open = Low (Buy) / Open = High (Sell) Opening Drive setup
              if (state.config.enableOpenLowHighTrigger !== false) {
                const openDrive = this.checkOpenDriveSetup(closedCCandles, cVwaps, now);
                if (openDrive) {
                  activeSetups.push({
                    candidate: { ...candidate, score: candidate.score + 1000 },
                    details: {
                      trend: openDrive.trend,
                      setupType: openDrive.setupType,
                      crossoverIdx: openDrive.candleIdx,
                      triggerHigh: openDrive.triggerHigh,
                      triggerLow: openDrive.triggerLow,
                      ema: cEmas[openDrive.candleIdx] || openDrive.triggerHigh,
                      vwap: cVwaps[openDrive.candleIdx] || openDrive.triggerHigh,
                      crossoverTime: openDrive.candleTime
                    }
                  });
                  return;
                }
              }

              // 2. Check EMA-VWAP crossover
              const details = this.getLatestCrossoverTodayDetails(lastIdx, closedCCandles, cEmas, cVwaps);
              if (details !== null && (lastIdx - details.crossoverIdx) <= 3) {
                activeSetups.push({ candidate, details });
              }
            } catch { }
          }));
          await new Promise(r => setTimeout(r, 100));
        }

        if (activeSetups.length > 0) {
          activeSetups.sort((a, b) => b.candidate.score - a.candidate.score);
          const best = activeSetups[0];
          const setupName = best.details.setupType ? ` (${best.details.setupType})` : '';
          this.log(state, `🎯 Auto-Selected #1 Stock with Active Setup: [${best.candidate.symbol}] (Score: ${best.candidate.score}, Qty: ${best.candidate.qty}) — Trend: ${best.details.trend}${setupName}`);
          this.log(state, `📋 All detected stock setups: ${activeSetups.map(s => `${s.candidate.symbol} (${s.details.trend}${s.details.setupType ? ` - ${s.details.setupType}` : ''})`).join(', ')}`);
          state.activeSymbol = best.candidate.symbol;
          state.config.exchange = best.candidate.exchange;
          state.config.qty = best.candidate.qty;
        } else if (candidates.length > 0) {
          const fallback = candidates[0];
          this.log(state, `ℹ Top candidate [${fallback.symbol}] assigned for live setup monitoring (Qty: ${fallback.qty})`);
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

      // ── Scan Open = Low / Open = High Opening Drive for today's opening candle ──
      if (state.config.enableOpenLowHighTrigger !== false && !state.entryTriggered && state.tradesPlacedToday < state.config.maxTradesPerDay) {
        const openDrive = this.checkOpenDriveSetup(candles, vwaps, now);
        if (openDrive) {
          const setupName = openDrive.setupType === 'OPEN_LOW_DRIVE' ? 'Open=Low Opening Drive' : 'Open=High Opening Drive';
          const setupInfo = {
            trend: openDrive.trend,
            setupType: setupName,
            time: openDrive.candleTime,
            triggerHigh: openDrive.triggerHigh,
            triggerLow: openDrive.triggerLow,
            ema: emas[openDrive.candleIdx] || openDrive.triggerHigh,
            vwap: vwaps[openDrive.candleIdx] || openDrive.triggerHigh,
            outcome: 'PENDING' as 'BREAKOUT' | 'INVALIDATED' | 'EXPIRED' | 'PENDING',
          };
          detectedSetups.push(setupInfo);
          this.log(state, `🚀 (Catch-up) Detected ${setupName} on ${this.formatTime(openDrive.candleTime)} — Trigger High: ₹${openDrive.triggerHigh.toFixed(2)}, SL (${openDrive.slNote}): ₹${openDrive.triggerLow.toFixed(2)}`);

          for (let j = openDrive.candleIdx + 1; j < Math.min(openDrive.candleIdx + 13, candles.length); j++) {
            const checkCandle = candles[j];
            if (openDrive.trend === 'LONG') {
              if (checkCandle.high > openDrive.triggerHigh) {
                this.log(state, `🚀 (Catch-up) Found past LONG Breakout (${setupName}) at ${this.formatTime(new Date(checkCandle.date))}!`);
                await this.placeTrade(state, client, account, 'BUY', openDrive.triggerHigh, new Date(checkCandle.date), openDrive.candleTime, openDrive.triggerLow, openDrive.triggerHigh);
                setupInfo.outcome = 'BREAKOUT';
                break;
              }
              if (checkCandle.low < openDrive.triggerLow) {
                this.log(state, `❌ (Catch-up) Setup invalidated at ${this.formatTime(new Date(checkCandle.date))} (Price fell below SL ₹${openDrive.triggerLow.toFixed(2)})`);
                setupInfo.outcome = 'INVALIDATED';
                break;
              }
            } else {
              if (checkCandle.low < openDrive.triggerLow) {
                this.log(state, `🚀 (Catch-up) Found past SHORT Breakout (${setupName}) at ${this.formatTime(new Date(checkCandle.date))}!`);
                await this.placeTrade(state, client, account, 'SELL', openDrive.triggerLow, new Date(checkCandle.date), openDrive.candleTime, openDrive.triggerLow, openDrive.triggerHigh);
                setupInfo.outcome = 'BREAKOUT';
                break;
              }
              if (checkCandle.high > openDrive.triggerHigh) {
                this.log(state, `❌ (Catch-up) Setup invalidated at ${this.formatTime(new Date(checkCandle.date))} (Price rose above SL ₹${openDrive.triggerHigh.toFixed(2)})`);
                setupInfo.outcome = 'INVALIDATED';
                break;
              }
            }
          }
        }
      }

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

    // ── Phase 3: Monitor Active Position ─────────────────────────────────────
    if (state.entryTriggered) {
      try {
        const candleSymbol = state.activeSymbol || config.symbol;
        const candleExchange = state.futureSymbol ? state.futureExchange : config.exchange;
        const testConfig = { ...config, symbol: candleSymbol, exchange: candleExchange };
        const cCandles = await this.fetchCandles(client, testConfig as any, '5minute', now);
        if (cCandles && cCandles.length >= 2) {
          const cEmas = this.calculateEMA(cCandles, config.emaPeriod || 15);
          const cVwaps = this.calculateVWAP(cCandles, config.vwapSource || 'close');
          state.lastEma = cEmas[cCandles.length - 1];
          state.lastVwap = cVwaps[cCandles.length - 1];
        }
      } catch (e) { }

      await this.monitorPosition(state, client, kite);
      await this.persistLogs(state);
      return;
    }

    try {
      if (state.isAutoMode && !state.entryTriggered && !state.waitingForConfirmation) {
        const candidates = await getTopCandidateStocks(kite, config.targetRs, config.stopLossRs, this.logger, undefined, 30);
        const activeSetups: Array<{ candidate: any; details: any }> = [];

        for (let i = 0; i < candidates.length; i += 5) {
          const batch = candidates.slice(i, i + 5);
          await Promise.allSettled(batch.map(async (candidate) => {
            try {
              const testConfig = { ...config, symbol: candidate.symbol, exchange: candidate.exchange };
              const cCandles = await this.fetchCandles(client, testConfig as any, '5minute', now);
              const emaPeriod = config.emaPeriod || 15;
              if (!cCandles || cCandles.length < emaPeriod + 2) return;

              const closedCCandles = this.filterClosedCandles(cCandles, now, 5);
              if (closedCCandles.length < 2) return;

              const cEmas = this.calculateEMA(closedCCandles, emaPeriod);
              const cVwaps = this.calculateVWAP(closedCCandles, config.vwapSource || 'close');
              const lastIdx = closedCCandles.length - 1;

              // 1. Check Open = Low (Buy) / Open = High (Sell) Opening Drive setup
              if (config.enableOpenLowHighTrigger !== false) {
                const openDrive = this.checkOpenDriveSetup(closedCCandles, cVwaps, now);
                if (openDrive) {
                  activeSetups.push({
                    candidate: { ...candidate, score: candidate.score + 1000 },
                    details: {
                      trend: openDrive.trend,
                      setupType: openDrive.setupType,
                      crossoverIdx: openDrive.candleIdx,
                      triggerHigh: openDrive.triggerHigh,
                      triggerLow: openDrive.triggerLow,
                      ema: cEmas[openDrive.candleIdx] || openDrive.triggerHigh,
                      vwap: cVwaps[openDrive.candleIdx] || openDrive.triggerHigh,
                      crossoverTime: openDrive.candleTime
                    }
                  });
                  return;
                }
              }

              // 2. Check EMA-VWAP crossover
              const details = this.getLatestCrossoverTodayDetails(lastIdx, closedCCandles, cEmas, cVwaps);
              if (details !== null && (lastIdx - details.crossoverIdx) <= 3) {
                activeSetups.push({ candidate, details });
              }
            } catch { }
          }));
          await new Promise(r => setTimeout(r, 100));
        }

        if (activeSetups.length > 0) {
          activeSetups.sort((a, b) => b.candidate.score - a.candidate.score);
          const best = activeSetups[0];
          const setupName = best.details.setupType ? ` (${best.details.setupType})` : '';
          if (state.activeSymbol !== best.candidate.symbol) {
            this.log(state, `🎯 Live Auto-Selected Stock with Active Setup: [${best.candidate.symbol}] (Score: ${best.candidate.score}, Qty: ${best.candidate.qty}) — Trend: ${best.details.trend}${setupName}`);
          }
          state.activeSymbol = best.candidate.symbol;
          config.exchange = best.candidate.exchange;
          config.qty = best.candidate.qty;
        } else if (candidates.length > 0) {
          const fallback = candidates[0];
          state.activeSymbol = fallback.symbol;
          config.exchange = fallback.exchange;
          config.qty = fallback.qty;
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

      if (state.waitingForConfirmation) {
        // Expiration check: 3 candles (15 mins) for crossover, or 6 candles (30 mins) for open drive
        const maxWaitCandles = (state.setupType === 'OPEN_LOW_DRIVE' || state.setupType === 'OPEN_HIGH_DRIVE') ? 6 : 3;
        const timeframeMs = 5 * 60 * 1000;
        const elapsed = now.getTime() - state.setupTimestamp!;
        if (elapsed > maxWaitCandles * timeframeMs) {
          this.log(state, `⏳ Setup expired (${maxWaitCandles} candles passed without breakout). Resetting to scanning.`);
          state.invalidatedCrossoverTime = state.setupTimestamp;
          state.waitingForConfirmation = null;
          state.confirmationHigh = null;
          state.confirmationLow = null;
          state.invalidationPrice = null;
          state.setupTimestamp = null;
          state.setupType = undefined;
          return;
        }

        const activeSym = state.activeSymbol || config.symbol;
        const checkSymbol = state.futureSymbol || activeSym;
        const checkExchange = state.futureSymbol ? state.futureExchange : config.exchange;
        const ltpData = await kite.getLTP([`${checkExchange}:${checkSymbol}`]);
        const ltp = ltpData[`${checkExchange}:${checkSymbol}`]?.last_price;
        if (ltp) {
          if (state.waitingForConfirmation === 'LONG') {
            const isDirectBreakout = (state.setupType === 'OPEN_LOW_DRIVE')
              ? ltp >= state.confirmationHigh!
              : (ltp >= state.confirmationHigh! && ltp <= (state.confirmationHigh! * 1.004));

            if (isDirectBreakout) {
              const triggerReason = state.setupType === 'OPEN_LOW_DRIVE'
                ? `Open=Low Opening Drive Breakout above 09:15 Candle High (₹${state.confirmationHigh!.toFixed(2)})`
                : state.setupType === 'INSIDE_CANDLE'
                  ? `Pullback Breakout above Mother High (₹${state.confirmationHigh!.toFixed(2)})`
                  : `Level Breakout above Crossover High (₹${state.confirmationHigh!.toFixed(2)})`;
              this.log(state, `[${activeSym}] 🎯 LONG Entry Triggered! ${triggerReason} @ LTP ₹${ltp.toFixed(2)}`);
              await this.placeTrade(state, client, account, 'BUY', ltp, undefined, undefined, state.invalidationPrice ?? undefined, state.confirmationHigh ?? undefined);
              state.waitingForConfirmation = null;
              state.confirmationHigh = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
              state.setupType = undefined;
            } else if (ltp < state.invalidationPrice!) {
              this.log(state, `[${activeSym}] ❌ Setup invalidated! LTP ₹${ltp.toFixed(2)} broke below low ₹${state.invalidationPrice!.toFixed(2)}`);
              state.invalidatedCrossoverTime = state.setupTimestamp;
              state.waitingForConfirmation = null;
              state.confirmationHigh = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
              state.setupType = undefined;
            }
          } else if (state.waitingForConfirmation === 'SHORT') {
            const isDirectBreakdownShort = (state.setupType === 'OPEN_HIGH_DRIVE')
              ? ltp <= state.confirmationLow!
              : (ltp <= state.confirmationLow! && ltp >= (state.confirmationLow! * 0.996));

            if (isDirectBreakdownShort) {
              const triggerReason = state.setupType === 'OPEN_HIGH_DRIVE'
                ? `Open=High Opening Drive Breakdown below 09:15 Candle Low (₹${state.confirmationLow!.toFixed(2)})`
                : state.setupType === 'INSIDE_CANDLE'
                  ? `Pullback Breakdown below Mother Low (₹${state.confirmationLow!.toFixed(2)})`
                  : `Level Breakdown below Crossover Low (₹${state.confirmationLow!.toFixed(2)})`;
              this.log(state, `[${activeSym}] 🎯 SHORT Entry Triggered! ${triggerReason} @ LTP ₹${ltp.toFixed(2)}`);
              await this.placeTrade(state, client, account, 'SELL', ltp, undefined, undefined, state.confirmationLow ?? undefined, state.invalidationPrice ?? undefined);
              state.waitingForConfirmation = null;
              state.confirmationLow = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
              state.setupType = undefined;
            } else if (ltp > state.invalidationPrice!) {
              this.log(state, `[${activeSym}] ❌ Setup invalidated! LTP ₹${ltp.toFixed(2)} broke above high ₹${state.invalidationPrice!.toFixed(2)}`);
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

      // ─── Dual Entry Scanning: Open Drive OR Direct Crossover Breakout OR Inside Candle Pullback ───
      if (!state.entryTriggered) {
        const lastClosedCandleTime = closedCandles[lastIdx].date.getTime();
        if (lastClosedCandleTime > (state.lastProcessedTimestamp || 0)) {
          state.lastProcessedTimestamp = lastClosedCandleTime;
          const rangeStr = this.formatCandleRange(closedCandles[lastIdx].date, 5);
          const closeTimeStr = this.formatCandleCloseTime(closedCandles[lastIdx].date, 5);
          const currEma = emas[lastIdx];
          const currVwap = vwaps[lastIdx];
          const targetSym = state.activeSymbol || config.symbol;
          const closedCandle = closedCandles[lastIdx];
          this.log(state, `[${targetSym}] 🔍 5m Candle [${rangeStr}] closed at ${closeTimeStr} | Close: ₹${closedCandle.close.toFixed(2)} (H: ₹${closedCandle.high.toFixed(2)}, L: ₹${closedCandle.low.toFixed(2)}) | 15-EMA: ₹${currEma?.toFixed(2)}, VWAP: ₹${currVwap?.toFixed(2)}`);

          // ── Scenario 0: Open = Low / Open = High Opening Drive ──────────────
          if (config.enableOpenLowHighTrigger !== false && !state.waitingForConfirmation) {
            const openDrive = this.checkOpenDriveSetup(closedCandles, vwaps, now);
            const openDriveTimeMs = openDrive?.candleTime.getTime();
            const isAlreadyInvalidated = state.invalidatedCrossoverTime === openDriveTimeMs;

            if (openDrive && !isAlreadyInvalidated) {
              const checkSymbol = state.futureSymbol || targetSym;
              const checkExchange = state.futureSymbol ? state.futureExchange : config.exchange;
              const ltpData = await kite.getLTP([`${checkExchange}:${checkSymbol}`]).catch(() => null);
              const ltp = ltpData?.[`${checkExchange}:${checkSymbol}`]?.last_price;

              if (openDrive.trend === 'LONG') {
                state.waitingForConfirmation = 'LONG';
                state.setupType = 'OPEN_LOW_DRIVE';
                state.confirmationHigh = openDrive.triggerHigh;
                state.confirmationLow = null;
                state.invalidationPrice = openDrive.triggerLow;
                state.setupTimestamp = openDriveTimeMs!;
                this.log(state, `[${targetSym}] 🚀 Bullish Open=Low Opening Drive! 09:15 Candle High: ₹${openDrive.triggerHigh.toFixed(2)}, SL (${openDrive.slNote}): ₹${openDrive.triggerLow.toFixed(2)}. Monitoring for immediate breakout...`);

                // Instant execution check on the same cycle:
                if (ltp && ltp >= openDrive.triggerHigh) {
                  this.log(state, `[${targetSym}] 🎯 Instant LONG Entry Triggered! Open=Low Breakout above 09:15 Candle High (₹${openDrive.triggerHigh.toFixed(2)}) @ LTP ₹${ltp.toFixed(2)}`);
                  await this.placeTrade(state, client, account, 'BUY', ltp, undefined, undefined, openDrive.triggerLow, openDrive.triggerHigh);
                  state.waitingForConfirmation = null;
                  state.confirmationHigh = null;
                  state.invalidationPrice = null;
                  state.setupTimestamp = null;
                  state.setupType = undefined;
                }
              } else if (openDrive.trend === 'SHORT') {
                state.waitingForConfirmation = 'SHORT';
                state.setupType = 'OPEN_HIGH_DRIVE';
                state.confirmationHigh = null;
                state.confirmationLow = openDrive.triggerLow;
                state.invalidationPrice = openDrive.triggerHigh;
                state.setupTimestamp = openDriveTimeMs!;
                this.log(state, `[${targetSym}] 🚀 Bearish Open=High Opening Drive! 09:15 Candle Low: ₹${openDrive.triggerLow.toFixed(2)}, SL (${openDrive.slNote}): ₹${openDrive.triggerHigh.toFixed(2)}. Monitoring for immediate breakdown...`);

                // Instant execution check on the same cycle:
                if (ltp && ltp <= openDrive.triggerLow) {
                  this.log(state, `[${targetSym}] 🎯 Instant SHORT Entry Triggered! Open=High Breakdown below 09:15 Candle Low (₹${openDrive.triggerLow.toFixed(2)}) @ LTP ₹${ltp.toFixed(2)}`);
                  await this.placeTrade(state, client, account, 'SELL', ltp, undefined, undefined, openDrive.triggerLow, openDrive.triggerHigh);
                  state.waitingForConfirmation = null;
                  state.confirmationLow = null;
                  state.invalidationPrice = null;
                  state.setupTimestamp = null;
                  state.setupType = undefined;
                }
              }
            }
          }

          const mother = closedCandles[prevIdx];
          const baby = closedCandles[lastIdx];
          const motherDateStr = this.getIstDateStr(mother.date);
          const babyDateStr = this.getIstDateStr(baby.date);
          const isInsideCandle = motherDateStr === todayDate && babyDateStr === todayDate && baby.high <= mother.high && baby.low >= mother.low;

          const crossoverDetails = this.getLatestCrossoverTodayDetails(lastIdx, closedCandles, emas, vwaps);

          if (crossoverDetails) {
            const { trend, crossoverIdx } = crossoverDetails;
            const crossoverCandle = closedCandles[crossoverIdx];
            const crossoverTimeMs = crossoverCandle.date.getTime();
            const isFreshCrossover = (lastIdx - crossoverIdx) <= 1;
            const isAlreadyInvalidated = state.invalidatedCrossoverTime === crossoverTimeMs;

            // Scenario 1: Inside Candle Pullback (Refines trigger to mother candle high/low)
            if (isInsideCandle && !state.waitingForConfirmation) {
              if (trend === 'LONG' && baby.close >= crossoverDetails.vwap * 0.998) {
                state.waitingForConfirmation = 'LONG';
                state.setupType = 'INSIDE_CANDLE';
                state.confirmationHigh = mother.high;
                state.confirmationLow = null;
                state.invalidationPrice = mother.low;
                state.setupTimestamp = lastClosedCandleTime;
                this.log(state, `[${targetSym}] 🔔 Bullish crossover pullback setup! Inside candle (Mother High: ₹${mother.high.toFixed(2)}, Low: ₹${mother.low.toFixed(2)}). Waiting for break above high...`);
              } else if (trend === 'SHORT' && baby.close <= crossoverDetails.vwap * 1.002) {
                state.waitingForConfirmation = 'SHORT';
                state.setupType = 'INSIDE_CANDLE';
                state.confirmationHigh = null;
                state.confirmationLow = mother.low;
                state.invalidationPrice = mother.high;
                state.setupTimestamp = lastClosedCandleTime;
                this.log(state, `[${targetSym}] 🔔 Bearish crossover pullback setup! Inside candle (Mother High: ₹${mother.high.toFixed(2)}, Low: ₹${mother.low.toFixed(2)}). Waiting for break below low...`);
              }
            }
            // Scenario 2: Direct Breakout (Triggers immediately on fresh crossover candle)
            else if (isFreshCrossover && !isAlreadyInvalidated && !state.waitingForConfirmation) {
              if (trend === 'LONG') {
                state.waitingForConfirmation = 'LONG';
                state.setupType = 'DIRECT';
                state.confirmationHigh = crossoverCandle.high;
                state.confirmationLow = null;
                // For direct long: SL should be tight (crossover low capped to max 1.2% risk)
                state.invalidationPrice = Math.max(crossoverCandle.low, crossoverCandle.close * 0.988);
                state.setupTimestamp = lastClosedCandleTime;
                this.log(state, `[${targetSym}] 🚀 Bullish Direct Crossover setup! Crossover Candle High: ₹${crossoverCandle.high.toFixed(2)}, SL: ₹${state.invalidationPrice.toFixed(2)}. Waiting for momentum breakout...`);
              } else if (trend === 'SHORT') {
                state.waitingForConfirmation = 'SHORT';
                state.setupType = 'DIRECT';
                state.confirmationHigh = null;
                state.confirmationLow = crossoverCandle.low;
                // For direct short: SL should be tight (crossover high capped to max 1.2% risk)
                state.invalidationPrice = Math.min(crossoverCandle.high, crossoverCandle.close * 1.012);
                state.setupTimestamp = lastClosedCandleTime;
                this.log(state, `[${targetSym}] 🚀 Bearish Direct Crossover setup! Crossover Candle Low: ₹${crossoverCandle.low.toFixed(2)}, SL: ₹${state.invalidationPrice.toFixed(2)}. Waiting for momentum breakdown...`);
              }
            }
          }
        }
      }
    } catch (err) { this.log(state, `❌ Tick error: ${err.message}`); }
    await this.persistLogs(state);
  }

  private async placeTrade(state: StrategyState, client: any, account: any, side: 'BUY' | 'SELL', triggerPrice: number, triggerTime?: Date, motherTime?: Date, motherLow?: number, motherHigh?: number) {
    const { config } = state;
    if (state.entryTriggered) {
      this.log(state, `⛔ Strategy already has an active open position (${state.entryTriggered}). Skipping 2nd trade.`);
      return;
    }
    if (state.dailyTargetLocked && config.enableDailyPnLLock !== false) {
      this.log(state, `🔒 Daily Trading Lock active (Realized P&L: ₹${(state.dailyRealizedPnlRs || 0).toFixed(2)}). Skipping trade placement.`);
      return;
    }
    if (state.tradesPlacedToday >= config.maxTradesPerDay) {
      this.log(state, `⛔ Daily trade limit reached (${state.tradesPlacedToday}/${config.maxTradesPerDay}). Skipping 2nd trade.`);
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
    const maxRiskPointsCap = Math.max(symTickSize * 10, entry * 0.015); // Max 1.5% stock move or max risk per share

    if (isOption) {
      sl = optionMotherLow !== null ? this.roundTick(optionMotherLow, symbol) : this.roundTick(entry - (maxRiskThresholdRs / config.qty), symbol);
      const optionRisk = Math.max(0.50, Math.abs(entry - sl));
      tgt = this.roundTick(entry + optionRisk * 1.5, symbol);
      state.spotStopLossPrice = side === 'BUY' ? motherLow : motherHigh;
    } else {
      if (finalSide === 'BUY') {
        const rawSl = motherLow ? motherLow : (entry - (maxRiskThresholdRs / (config.qty || 1)));
        sl = this.roundTick(Math.max(rawSl, entry - maxRiskPointsCap), symbol);
        if (sl >= entry) sl = this.roundTick(entry - symTickSize * 3, symbol);
        const risk = Math.max(symTickSize, Math.abs(entry - sl));
        tgt = this.roundTick(entry + risk * 1.5, symbol);
      } else {
        const rawSl = motherHigh ? motherHigh : (entry + (maxRiskThresholdRs / (config.qty || 1)));
        sl = this.roundTick(Math.min(rawSl, entry + maxRiskPointsCap), symbol);
        if (sl <= entry) sl = this.roundTick(entry + symTickSize * 3, symbol);
        const risk = Math.max(symTickSize, Math.abs(sl - entry));
        tgt = this.roundTick(entry - risk * 1.5, symbol);
      }
    }

    const riskPerShare = Math.max(symTickSize, Math.abs(entry - sl));
    const targetPerShare = Math.max(symTickSize, Math.abs(tgt - entry));
    const targetThresholdRs = config.targetRs && config.targetRs > 0 ? config.targetRs : 500;
    const targetQty = Math.ceil(targetThresholdRs / targetPerShare);

    // Dynamically query exact live available capital from Zerodha Kite margin API
    let capital = (config as any).maxCapital;
    if (!capital || capital <= 0) {
      if (client && !state.isPaperTrade && !isHistorical) {
        try {
          const kite = client['kite'] || client;
          const liveMargins = await (kite.getMargins ? kite.getMargins() : client.getMargins?.()).catch(() => null);
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

    // Preserve at least ₹1,500 cash buffer for Expiry Option Buying / Gamma Blast & brokerage charges
    const capitalBuffer = Math.min(1500, capital * 0.15);
    const availableCapitalForStock = Math.max(2000, capital - capitalBuffer);
    const safeCapital = availableCapitalForStock * 0.90; // 90% safe utilization buffer
    const maxBuyingPower = safeCapital * 5; // Zerodha 5x MIS intraday leverage
    const maxCapitalQty = Math.floor(maxBuyingPower / entry);
    const maxRiskRs = config.stopLossRs && config.stopLossRs > 0 ? config.stopLossRs : (targetThresholdRs * 1.5);
    const riskQty = Math.max(1, Math.floor(maxRiskRs / riskPerShare));
    const finalQty = Math.max(1, Math.min(riskQty, targetQty, maxCapitalQty));
    state.config.qty = finalQty;
    const potentialMaxLossRs = finalQty * riskPerShare;
    this.log(state, `⚖ Risk-Managed Position Sizing: ${finalQty} shares (Risk/sh: ₹${riskPerShare.toFixed(2)}, Max Potential Loss: ₹${potentialMaxLossRs.toFixed(2)} [Cap: ₹${maxRiskRs.toFixed(0)}], Target Move: ₹${targetPerShare.toFixed(2)} -> Target Profit: ₹${(finalQty * targetPerShare).toFixed(2)}, Margin: ₹${((finalQty * entry) / 5).toFixed(0)} / ₹${capital.toLocaleString('en-IN')} [Reserved ₹${capitalBuffer.toFixed(0)} for Gamma Blast/Options])`);

    this.log(state, `📋 Placing: ${symbol} — Target Qty: ${state.config.qty} | Entry: ₹${entry.toFixed(2)} | SL: ₹${sl.toFixed(2)} | Target (1:1.5 RR): ₹${tgt.toFixed(2)}`);
    try {
      const limitPrice = finalSide === 'BUY'
        ? this.roundTick(entry + symTickSize * 2, symbol)
        : this.roundTick(entry - symTickSize * 2, symbol);
      const entryId = (state.isPaperTrade || isHistorical)
        ? `PAPER_${Math.random().toString(36).substring(7).toUpperCase()}`
        : await client.placeOrder({ symbol, exchange, product, qty: config.qty, side: finalSide, orderType: 'LIMIT', price: limitPrice });
      this.log(state, `✅ Entry Order (LIMIT @ ₹${limitPrice.toFixed(2)}): ${entryId}`);
      state.entryOrderId = entryId;

      let executedQty = config.qty;
      let actualEntryPrice = entry;

      if (!state.isPaperTrade && !isHistorical && client && kite) {
        // Wait 600ms for exchange order book match
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
              this.log(state, `❌ Entry order ${entryId} was ${status}: ${entryOrder.status_message || 'Order rejected by broker'}`);
              return;
            } else {
              this.log(state, `⏳ Entry order ${entryId} is ${status} (0 filled so far). Monitoring for fills...`);
              executedQty = 0;
            }
          }
        } catch (e: any) {
          this.log(state, `⚠ Order status verification notice: ${e.message}`);
        }
      }

      state.executedQty = executedQty;
      state.entryPrice = actualEntryPrice;

      // Track order in DB
      await this.trackOrderInDB(state, finalSide, symbol, exchange, executedQty > 0 ? executedQty : config.qty, actualEntryPrice, entryId, triggerTime);

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

          slOrderId = await client.placeOrder({
            symbol,
            exchange,
            product,
            qty: state.executedQty,
            side: exitSide,
            orderType: 'SL',
            price: slLimitPrice,
            triggerPrice: slTriggerPrice
          }).catch((e: any) => { this.log(state, `❌ SL Failed: ${e.message}`); return null; });

          if (slOrderId) {
            this.log(state, `🛡 Stop Loss Armed at broker (${state.executedQty} shares): Trigger ₹${slTriggerPrice.toFixed(2)}, Limit ₹${slLimitPrice.toFixed(2)} | OrderId: ${slOrderId}`);
          }
          if (config.enableProfitFloor === false) {
            targetOrderId = await client.placeOrder({ symbol, exchange, product, qty: state.executedQty, side: exitSide, orderType: 'LIMIT', price: tgtPrice })
              .catch((e: any) => { this.log(state, `❌ Target Failed: ${e.message}`); return null; });
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

      if (!state.isPaperTrade && !isHistorical && state.executedQty > 0 && !slOrderId) {
        this.log(state, `⚠ Warning: Failed to place SL order at broker. Active monitoring will try to exit if needed.`);
      }

      // Start real-time WebSocket monitoring for live trades (not historical catch-up)
      if (!isHistorical && state.entryTriggered) {
        await this.startRealtimeMonitor(state, client);
      }
    } catch (err) { this.log(state, `❌ Placement failed: ${err.message}`); }
  }

  // ── Real-Time WebSocket Position Monitoring ────────────────────────────────

  // ── Real-Time Position Monitoring ──────────────────────────────────────────

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
      if (!currentPrice || !state.entryTriggered || isExiting) return;

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
        if (isExiting) return;
        isExiting = true;
        this.log(state, `⏰ 3:05 PM Intraday EOD Cutoff reached! Auto-squaring off position (Current P&L: ₹${pnlRs.toFixed(2)}) to avoid Zerodha RMS penalty charges...`);
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
        await this.persistLogs(state);
        return;
      }

      // ── 2. Dynamic VWAP & 15-EMA Trailing SL Check (Live Real-time Ticks) ───
      const targetThresholdRs = state.config.targetRs || 500;
      const isTarget1Reached = isLong ? (currentPrice >= state.targetPrice!) : (currentPrice <= state.targetPrice!);
      const isTrailingEnabled = state.config.enableProfitFloor !== false;

      if ((pnlRs >= targetThresholdRs || isTarget1Reached) && !state.isTrailingEma && isTrailingEnabled) {
        state.isTrailingEma = true;
        this.log(state, `📈 Target 1 reached (Target: ₹${state.targetPrice?.toFixed(2)}, P&L: ₹${pnlRs.toFixed(2)})! Activated Dynamic VWAP & 15-EMA Trailing SL — riding trend...`);
        if (state.targetOrderId) {
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

      // ── Throttled Live P&L Logging (every 15 seconds) ───────────────────────
      if (now - (state.lastPnlLogTime || 0) >= 15000) {
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
              state.slOrderId = await client.placeOrder({
                symbol,
                exchange,
                product: state.config.product ?? 'MIS',
                qty: state.executedQty,
                side: exitSide,
                orderType: 'SL',
                price: slLimitPrice,
                triggerPrice: slTriggerPrice
              }).catch((e: any) => { this.log(state, `❌ SL Failed: ${e.message}`); return null; });
              if (state.slOrderId) {
                this.log(state, `🛡 Armed SL order (${state.slOrderId}) for ${state.executedQty} shares @ Trigger ₹${slTriggerPrice.toFixed(2)}`);
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
    const isTrailingEnabled = state.config.enableProfitFloor !== false;

    // Log live P&L on every poll cycle
    const sign = pnlRs >= 0 ? '+' : '';
    const pctSign = pnlPct >= 0 ? '+' : '';
    this.log(state, `📊 [LIVE P&L] ${symbol}: ₹${currentPrice.toFixed(2)} | Entry: ₹${state.entryPrice!.toFixed(2)} | SL: ₹${state.stopLossPrice!.toFixed(2)} | Tgt: ₹${state.targetPrice!.toFixed(2)} | P&L: ${sign}₹${pnlRs.toFixed(2)} (${pctSign}${pnlPct.toFixed(2)}%) | Executed Qty: ${activeQty} | Peak: +₹${state.peakPnlRs.toFixed(2)}${state.isTrailingEma ? ' (15-EMA Trailing Active)' : ''}`);

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
        state.stopLossPrice = dynamicTrailingSl;
        const isCrossed = isLong ? (currentPrice < dynamicTrailingSl) : (currentPrice > dynamicTrailingSl);
        if (isCrossed) {
          this.log(state, `📈 Price crossed Trailing SL line @ ₹${currentPrice.toFixed(2)} (Trailing Level: ₹${dynamicTrailingSl.toFixed(2)}) | Realized P&L: ₹${pnlRs.toFixed(2)}`);
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
    const { config } = state;
    const symbol = state.optionSymbol || state.activeSymbol || config.symbol;
    const exchange = state.optionSymbol ? 'NFO' : (state.futureSymbol ? state.futureExchange : config.exchange);
    const exitSide = (config.isOptionBuyingOnly && state.optionSymbol) ? 'SELL' : (state.entryTriggered === 'LONG' ? 'SELL' : 'BUY');
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

        // Check if SL or Target already executed at broker
        if (kite && (state.slOrderId || state.targetOrderId)) {
          try {
            const orders = await kite.getOrders();
            const slOrder = orders.find((o: any) => o.order_id === state.slOrderId);
            const targetOrder = orders.find((o: any) => o.order_id === state.targetOrderId);

            if (reason === 'SL' && slOrder?.status === 'COMPLETE') {
              isAlreadyFilledAtBroker = true;
              exitOrderId = state.slOrderId!;
              exitOrderType = 'SL';
              if (slOrder.average_price && Number(slOrder.average_price) > 0) {
                actualExitPrice = Number(slOrder.average_price);
              }
              const isLong = (state.config.isOptionBuyingOnly && state.optionSymbol) || state.entryTriggered === 'LONG';
              const realizedPnl = (isLong ? (actualExitPrice - (state.entryPrice || 0)) : ((state.entryPrice || 0) - actualExitPrice)) * qty;
              const slippage = actualExitPrice - exitPrice;
              await this.cancelBrokerOrderSafe(client, state.targetOrderId);
              this.log(state, `🛑 Confirmed Broker SL Order executed: ${exitOrderId} @ ₹${actualExitPrice.toFixed(2)} | Realized P&L: ₹${realizedPnl.toFixed(2)}${slippage !== 0 ? ` (Execution Slippage: ${slippage > 0 ? '+' : ''}₹${slippage.toFixed(2)}/sh)` : ''}`);
            } else if (reason === 'TARGET' && targetOrder?.status === 'COMPLETE') {
              isAlreadyFilledAtBroker = true;
              exitOrderId = state.targetOrderId!;
              exitOrderType = 'LIMIT';
              if (targetOrder.average_price && Number(targetOrder.average_price) > 0) {
                actualExitPrice = Number(targetOrder.average_price);
              }
              const isLong = (state.config.isOptionBuyingOnly && state.optionSymbol) || state.entryTriggered === 'LONG';
              const realizedPnl = (isLong ? (actualExitPrice - (state.entryPrice || 0)) : ((state.entryPrice || 0) - actualExitPrice)) * qty;
              await this.cancelBrokerOrderSafe(client, state.slOrderId);
              this.log(state, `🎯 Confirmed Broker Target Order executed: ${exitOrderId} @ ₹${actualExitPrice.toFixed(2)} | Realized P&L: ₹${realizedPnl.toFixed(2)}`);
            }
          } catch (e: any) {
            this.log(state, `⚠ Order status verification notice: ${e.message}`);
          }
        }

        if (!isAlreadyFilledAtBroker) {
          // Cancel both pending SL and Target orders before placing guaranteed market exit
          await this.cancelBrokerOrderSafe(client, state.slOrderId);
          await this.cancelBrokerOrderSafe(client, state.targetOrderId);

          try {
            exitOrderId = await client.placeOrder({
              symbol,
              exchange,
              product: config.product ?? 'MIS',
              qty,
              side: exitSide,
              orderType: 'MARKET',
            });
            exitOrderType = 'MARKET';
            this.log(state, `✅ Live Market Exit Order placed (${reason}): ${exitOrderId}`);
          } catch (err: any) {
            this.log(state, `❌ Live Market Exit Order failed (${reason}): ${err.message}`);
          }
        }
      }

      await this.trackOrderInDB(state, exitSide, symbol, exchange, qty, actualExitPrice, exitOrderId, undefined, exitOrderType);
      state.tradesPlacedToday++;

      const isLong = (config.isOptionBuyingOnly && state.optionSymbol) || state.entryTriggered === 'LONG';
      const tradePnl = (isLong ? (actualExitPrice - (state.entryPrice || 0)) : ((state.entryPrice || 0) - actualExitPrice)) * qty;
      state.dailyRealizedPnlRs = (state.dailyRealizedPnlRs || 0) + tradePnl;

      const targetThresholdRs = config.targetRs && config.targetRs > 0 ? config.targetRs : 500;
      const maxRiskRs = config.stopLossRs && config.stopLossRs > 0 ? config.stopLossRs : (targetThresholdRs * 1.5);

      if (config.enableDailyPnLLock !== false) {
        if (state.dailyRealizedPnlRs >= targetThresholdRs) {
          state.dailyTargetLocked = true;
          this.log(state, `🎯 Daily Profit Target Reached (+₹${state.dailyRealizedPnlRs.toFixed(2)})! 'One-and-Done' Rule Active — Trading safely locked for the day to protect profits.`);
        } else if (state.dailyRealizedPnlRs <= -maxRiskRs) {
          state.dailyTargetLocked = true;
          this.log(state, `🛑 Daily Max Loss Limit Reached (₹${state.dailyRealizedPnlRs.toFixed(2)})! 'One-and-Done' Rule Active — Trading safely locked for the day to preserve capital.`);
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
      this.log(state, `❌ Exit execution failed: ${e.message}`);
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

      const isLong = (config.isOptionBuyingOnly && state.optionSymbol) || state.entryTriggered === 'LONG';
      const tradePnl = (isLong ? (exitPrice - (state.entryPrice || 0)) : ((state.entryPrice || 0) - exitPrice)) * qty;
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
    const istDateStr = this.getIstDateStr(now);
    const from = new Date(`${istDateStr}T09:15:00.000+05:30`);
    from.setDate(from.getDate() - 5); // Go back 5 days to ensure enough historical candles
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

    // 1. Open = Low Drive (Bullish Buy setup)
    // Low within 0.25% of Open (or equal) + Green candle
    const lowOpenDiffPct = Math.abs(open - low) / open;
    const isGreen = close > open;
    const isOpenLow = lowOpenDiffPct <= 0.0025 && isGreen;

    if (isOpenLow) {
      const candleRangePct = (high - low) / open;
      let slPrice = low;
      let slNote = 'Open/Low';

      // Adaptive SL for large candles (> 0.8% range):
      // Pick the closer/tighter level between 50% midpoint and VWAP to optimize RR & risk
      if (candleRangePct > 0.008) {
        const midpoint = (high + low) / 2;
        const vwapLevel = (vwap && vwap > low && vwap < high) ? vwap : midpoint;
        // For LONG, closer SL to entry is higher:
        const candidateSl = Math.max(midpoint, vwapLevel);
        // Safety cap: Ensure SL is at least 0.35% below high to avoid noise, capped to max 1.2% risk
        const maxSl = high * (1 - 0.0035);
        const minSl = high * (1 - 0.012);
        slPrice = Math.max(Math.min(candidateSl, maxSl), minSl);
        slNote = (candidateSl === vwapLevel && vwapLevel !== midpoint) ? 'VWAP Level' : 'Tight Risk SL';
      }

      return {
        trend: 'LONG',
        setupType: 'OPEN_LOW_DRIVE',
        triggerHigh: high,
        triggerLow: slPrice, // Adaptive SL
        invalidationPrice: low, // Absolute candle low
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
      const candleRangePct = (high - low) / open;
      let slPrice = high;
      let slNote = 'Open/High';

      // Adaptive SL for large candles (> 0.8% range):
      // Pick the closer/tighter level between 50% midpoint and VWAP to optimize RR & risk
      if (candleRangePct > 0.008) {
        const midpoint = (high + low) / 2;
        const vwapLevel = (vwap && vwap > low && vwap < high) ? vwap : midpoint;
        // For SHORT, closer SL to entry is lower:
        const candidateSl = Math.min(midpoint, vwapLevel);
        // Safety cap: Ensure SL is at least 0.35% above low to avoid noise, capped to max 1.2% risk
        const minSl = low * (1 + 0.0035);
        const maxSl = low * (1 + 0.012);
        slPrice = Math.min(Math.max(candidateSl, minSl), maxSl);
        slNote = (candidateSl === vwapLevel && vwapLevel !== midpoint) ? 'VWAP Level' : 'Tight Risk SL';
      }

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
  private log(state: StrategyState, msg: string) { const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); state.logs.push(`[${ts}] ${msg}`); this.logger.log(`[${state.executionId}] ${msg}`); }
  private async persistLogs(state: StrategyState) {
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

      // Exhaustion Guard: If stock has already moved >3.5% from open before crossover, skip late entry
      let firstDayCandle: Candle | null = null;
      for (let k = 0; k < candles.length; k++) {
        if (this.getIstDateStr(candles[k].date) === todayStr) {
          firstDayCandle = candles[k];
          break;
        }
      }
      if (firstDayCandle && firstDayCandle.open > 0) {
        const moveFromOpenPct = (Math.abs(currentCandle.close - firstDayCandle.open) / firstDayCandle.open) * 100;
        if (moveFromOpenPct > 3.5 && (idx - crossoverIdx) > 0) {
          return null; // Move is exhausted; avoid entering late at extremes
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
