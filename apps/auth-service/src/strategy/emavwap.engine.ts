import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { EmaVwapCrossoverConfig } from './dto/strategy.dto';
import { autoSelectStock, getTopCandidateStocks } from './smart-stock-picker';
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
  entryPrice: number | null;
  stopLossPrice: number | null;
  spotStopLossPrice?: number | null;
  targetPrice: number | null;
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
  peakPnlRs?: number;
  lockedProfitRs?: number;
  isTrailingEma?: boolean;
  isAutoMode?: boolean;
  activeSymbol?: string | null;
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
      tradesPlacedToday: Math.floor(completedOrdersCount / 2),
      logs: [],
      lastProcessedTimestamp: 0,
      isAutoMode: config.symbol === 'AUTO' || config.symbol?.startsWith('AUTO'),
      activeSymbol: (config.symbol === 'AUTO' || config.symbol?.startsWith('AUTO')) ? null : config.symbol,
      peakPnlRs: 0,
      lockedProfitRs: 0,
      isTrailingEma: false,
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Strategy started — ${config.symbol}:${config.exchange}`);
    await this.persistLogs(state); // Persist immediately so UI shows "Started"

    const timer = setInterval(() => this.tick(strategyId).catch(e => this.logger.error(e)), 60_000);
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
      optionSymbol: s.optionSymbol || s.activeSymbol || s.config.symbol,
    };
  }

  private async initialCatchup(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;
    const now = new Date();
    if (this.getIstHhmm(now) < 9 * 60 + 20) return;

    this.log(state, `🔍 Running catch-up for today's data...`);
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    try {
      if (state.config.symbol === 'AUTO') {
        const candidates = await getTopCandidateStocks(kite, state.config.targetRs, state.config.stopLossRs, this.logger, undefined, 30);
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

              const cEmas = this.calculateEMA(cCandles, emaPeriod);
              const cVwaps = this.calculateVWAP(cCandles, state.config.vwapSource || 'close');
              const lastIdx = cCandles.length - 1;
              const details = this.getLatestCrossoverTodayDetails(lastIdx, cCandles, cEmas, cVwaps);

              if (details !== null) {
                activeSetups.push({ candidate, details });
              }
            } catch { }
          }));
          await new Promise(r => setTimeout(r, 100));
        }

        if (activeSetups.length > 0) {
          activeSetups.sort((a, b) => b.candidate.score - a.candidate.score);
          const best = activeSetups[0];
          this.log(state, `🎯 Auto-Selected #1 Stock with Active Setup: [${best.candidate.symbol}] (Score: ${best.candidate.score}, Qty: ${best.candidate.qty}) — Trend: ${best.details.trend}`);
          this.log(state, `📋 All detected stock setups: ${activeSetups.map(s => `${s.candidate.symbol} (${s.details.trend})`).join(', ')}`);
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

      const todayStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
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

            // 4. 3:10 PM EOD Mandatory Square Off (SEBI / Broker CAS Rule)
            const candleHhmm = this.getIstHhmm(currentCandle.date);
            if (candleHhmm >= 15 * 60 + 10) {
              const exitPrice = (state.optionSymbol && optCandle) ? optCandle.close : currentCandle.close;
              const finalPnl = (isLong ? (exitPrice - state.entryPrice!) : (state.entryPrice! - exitPrice)) * state.config.qty;
              this.log(state, `⏰ (Catch-up) 3:10 PM EOD Cutoff reached on ${this.formatTime(currentCandle.date)}! Position squared off at ₹${exitPrice.toFixed(2)} | Final Realized P&L: ₹${finalPnl.toFixed(2)}`);
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
        const candleDateStr = currentCandle.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
        if (candleDateStr !== todayStr) continue;

        // Dual Entry Catch-up Scanning (Direct Crossover Breakout + Inside Candle Pullback)
        const mother = candles[i - 1];
        const baby = candles[i];
        const isInsideCandle = baby.high <= mother.high && baby.low >= mother.low;
        const details = this.getLatestCrossoverTodayDetails(i, candles, emas, vwaps);

        if (details !== null) {
          const isBullish = details.trend === 'LONG';
          const crossoverCandle = candles[details.crossoverIdx];
          const isFreshCrossover = (i - details.crossoverIdx) <= 2;

          let triggerHigh: number | null = null;
          let triggerLow: number | null = null;
          let setupType = '';

          if (isInsideCandle) {
            triggerHigh = mother.high;
            triggerLow = mother.low;
            setupType = 'Inside Candle Pullback';
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

                  // For live accounts: check current LTP and place a real order if still valid
                  if (!state.isPaperTrade) {
                    const checkSymbol = state.futureSymbol || state.config.symbol;
                    const checkExchange = state.futureSymbol ? state.futureExchange : state.config.exchange;
                    const ltpData = await kite.getLTP([`${checkExchange}:${checkSymbol}`]);
                    const currentLtp = ltpData[`${checkExchange}:${checkSymbol}`]?.last_price;
                    const maxAllowableLtp = triggerHigh * 1.006; // Max 0.6% extension
                    if (currentLtp && currentLtp > triggerLow && currentLtp <= maxAllowableLtp) {
                      this.log(state, `📡 Live entry! LTP ₹${currentLtp.toFixed(2)} still valid near breakout level (SL: ₹${triggerLow!.toFixed(2)}). Placing real order...`);
                      await this.placeTrade(state, client, account, 'BUY', currentLtp, undefined, undefined, triggerLow!, triggerHigh!);
                    } else {
                      this.log(state, `⏭ Skipping live entry — LTP ₹${currentLtp?.toFixed(2) || 'N/A'} is already extended (>0.6%) beyond trigger ₹${triggerHigh!.toFixed(2)}`);
                    }
                  } else {
                    await this.placeTrade(state, client, account, 'BUY', triggerHigh, new Date(checkCandle.date), new Date(baby.date), triggerLow, triggerHigh);
                  }
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

                  // For live accounts: check current LTP and place a real order if still valid
                  if (!state.isPaperTrade) {
                    const checkSymbol = state.futureSymbol || state.config.symbol;
                    const checkExchange = state.futureSymbol ? state.futureExchange : state.config.exchange;
                    const ltpData = await kite.getLTP([`${checkExchange}:${checkSymbol}`]);
                    const currentLtp = ltpData[`${checkExchange}:${checkSymbol}`]?.last_price;
                    const minAllowableLtp = triggerLow * 0.994; // Max 0.6% extension
                    if (currentLtp && currentLtp < triggerHigh && currentLtp >= minAllowableLtp) {
                      this.log(state, `📡 Live entry! LTP ₹${currentLtp.toFixed(2)} still valid near breakdown level (SL: ₹${triggerHigh!.toFixed(2)}). Placing real order...`);
                      await this.placeTrade(state, client, account, 'SELL', currentLtp, undefined, undefined, triggerLow!, triggerHigh!);
                    } else {
                      this.log(state, `⏭ Skipping live entry — LTP ₹${currentLtp?.toFixed(2) || 'N/A'} is already extended (>0.6%) beyond trigger ₹${triggerLow!.toFixed(2)}`);
                    }
                  } else {
                    await this.placeTrade(state, client, account, 'SELL', triggerLow, new Date(checkCandle.date), new Date(baby.date), triggerLow, triggerHigh);
                  }
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
        if (cCandles && cCandles.length >= (config.emaPeriod || 15) + 2) {
          const cEmas = this.calculateEMA(cCandles, config.emaPeriod || 15);
          state.lastEma = cEmas[cCandles.length - 1];
        }
      } catch (e) { }

      await this.monitorPosition(state, client, kite);
      await this.persistLogs(state);
      return;
    }

    try {
      if (state.isAutoMode && !state.entryTriggered) {
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

              const cEmas = this.calculateEMA(cCandles, emaPeriod);
              const cVwaps = this.calculateVWAP(cCandles, config.vwapSource || 'close');
              const lastIdx = cCandles.length - 1;
              const details = this.getLatestCrossoverTodayDetails(lastIdx, cCandles, cEmas, cVwaps);

              if (details !== null) {
                activeSetups.push({ candidate, details });
              }
            } catch { }
          }));
          await new Promise(r => setTimeout(r, 100));
        }

        if (activeSetups.length > 0) {
          activeSetups.sort((a, b) => b.candidate.score - a.candidate.score);
          const best = activeSetups[0];
          if (state.activeSymbol !== best.candidate.symbol) {
            this.log(state, `🎯 Live Auto-Selected Stock with Active Setup: [${best.candidate.symbol}] (Score: ${best.candidate.score}, Qty: ${best.candidate.qty}) — Trend: ${best.details.trend}`);
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
      const latestCandle = candles[candles.length - 1];
      const isClosed = (now.getTime() - latestCandle.date.getTime()) >= 5 * 60 * 1000;
      const closedCandles = isClosed ? candles : candles.slice(0, -1);

      if (closedCandles.length < 2) return;

      // Don't scan for signals if the last closed candle is from a previous day
      const lastClosedDate = closedCandles[closedCandles.length - 1].date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
      const todayDate = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
      if (lastClosedDate !== todayDate) return;

      const emas = this.calculateEMA(closedCandles, config.emaPeriod || 15);
      const vwaps = this.calculateVWAP(closedCandles, config.vwapSource || 'close');

      const lastIdx = closedCandles.length - 1, prevIdx = closedCandles.length - 2;
      const currEma = emas[lastIdx], prevEma = emas[prevIdx];
      const currVwap = vwaps[lastIdx], prevVwap = vwaps[prevIdx];

      if (currEma === null || prevEma === null || currVwap === null || prevVwap === null) return;

      if (state.waitingForConfirmation) {
        // Expiration check: 3 candles (15 mins)
        const timeframeMs = 5 * 60 * 1000;
        const elapsed = now.getTime() - state.setupTimestamp!;
        if (elapsed > 3 * timeframeMs) {
          this.log(state, `⏳ Setup expired (3 candles passed without breakout). Resetting to scanning.`);
          state.waitingForConfirmation = null;
          state.confirmationHigh = null;
          state.confirmationLow = null;
          state.invalidationPrice = null;
          state.setupTimestamp = null;
          return;
        }

        const activeSym = state.activeSymbol || config.symbol;
        const checkSymbol = state.futureSymbol || activeSym;
        const checkExchange = state.futureSymbol ? state.futureExchange : config.exchange;
        const ltpData = await kite.getLTP([`${checkExchange}:${checkSymbol}`]);
        const ltp = ltpData[`${checkExchange}:${checkSymbol}`]?.last_price;
        if (ltp) {
          if (state.waitingForConfirmation === 'LONG') {
            const isPullbackRetest = ltp <= (currEma * 1.003) && ltp >= (currVwap * 0.997);
            const isDirectBreakout = ltp >= state.confirmationHigh! && ltp <= (state.confirmationHigh! * 1.004);

            if (isPullbackRetest || isDirectBreakout) {
              const triggerReason = isPullbackRetest ? `Pullback Retest near 15-EMA (₹${currEma.toFixed(2)}) / VWAP (₹${currVwap.toFixed(2)})` : `Level Breakout (₹${state.confirmationHigh!.toFixed(2)})`;
              this.log(state, `[${activeSym}] 🎯 LONG Entry Triggered! ${triggerReason} @ LTP ₹${ltp.toFixed(2)} — Entry captured near support floor!`);
              await this.placeTrade(state, client, account, 'BUY', ltp, undefined, undefined, state.invalidationPrice ?? undefined, state.confirmationHigh ?? undefined);
              state.waitingForConfirmation = null;
              state.confirmationHigh = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
            } else if (ltp < state.invalidationPrice!) {
              this.log(state, `[${activeSym}] ❌ Setup invalidated! LTP ₹${ltp.toFixed(2)} broke below low ₹${state.invalidationPrice!.toFixed(2)}`);
              state.waitingForConfirmation = null;
              state.confirmationHigh = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
            }
          } else if (state.waitingForConfirmation === 'SHORT') {
            const isPullbackRetestShort = ltp >= (currEma * 0.997) && ltp <= (currVwap * 1.003);
            const isDirectBreakdownShort = ltp <= state.confirmationLow! && ltp >= (state.confirmationLow! * 0.996);

            if (isPullbackRetestShort || isDirectBreakdownShort) {
              const triggerReason = isPullbackRetestShort ? `Pullback Retest near 15-EMA (₹${currEma.toFixed(2)}) / VWAP (₹${currVwap.toFixed(2)})` : `Level Breakdown (₹${state.confirmationLow!.toFixed(2)})`;
              this.log(state, `[${activeSym}] 🎯 SHORT Entry Triggered! ${triggerReason} @ LTP ₹${ltp.toFixed(2)} — Entry captured near resistance ceiling!`);
              await this.placeTrade(state, client, account, 'SELL', ltp, undefined, undefined, state.confirmationLow ?? undefined, state.invalidationPrice ?? undefined);
              state.waitingForConfirmation = null;
              state.confirmationLow = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
            } else if (ltp > state.invalidationPrice!) {
              this.log(state, `[${activeSym}] ❌ Setup invalidated! LTP ₹${ltp.toFixed(2)} broke above high ₹${state.invalidationPrice!.toFixed(2)}`);
              state.waitingForConfirmation = null;
              state.confirmationLow = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
            }
          }
        }
      }

      // ─── Dual Entry Scanning: Direct Crossover Breakout OR Inside Candle Pullback ───
      if (!state.entryTriggered) {
        const lastClosedCandleTime = closedCandles[lastIdx].date.getTime();
        if (lastClosedCandleTime > (state.lastProcessedTimestamp || 0)) {
          state.lastProcessedTimestamp = lastClosedCandleTime;
          const timeStr = this.formatTime(closedCandles[lastIdx].date);
          const currEma = emas[lastIdx];
          const currVwap = vwaps[lastIdx];
          const targetSym = state.activeSymbol || config.symbol;
          const closedCandle = closedCandles[lastIdx];
          this.log(state, `[${targetSym}] 🔍 5m Candle closed at ${timeStr} | Close: ₹${closedCandle.close.toFixed(2)} (H: ₹${closedCandle.high.toFixed(2)}, L: ₹${closedCandle.low.toFixed(2)}) | 15-EMA: ₹${currEma?.toFixed(2)}, VWAP: ₹${currVwap?.toFixed(2)}`);

          const mother = closedCandles[prevIdx];
          const baby = closedCandles[lastIdx];
          const motherDateStr = mother.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
          const babyDateStr = baby.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
          const isInsideCandle = motherDateStr === todayDate && babyDateStr === todayDate && baby.high <= mother.high && baby.low >= mother.low;

          const crossoverDetails = this.getLatestCrossoverTodayDetails(lastIdx, closedCandles, emas, vwaps);

          if (crossoverDetails) {
            const { trend, crossoverIdx } = crossoverDetails;
            const crossoverCandle = closedCandles[crossoverIdx];
            const isFreshCrossover = (lastIdx - crossoverIdx) <= 2;

            // Scenario 1: Inside Candle Pullback (Refines trigger to mother candle high/low)
            if (isInsideCandle) {
              if (trend === 'LONG') {
                state.waitingForConfirmation = 'LONG';
                state.confirmationHigh = mother.high;
                state.confirmationLow = null;
                state.invalidationPrice = mother.low;
                state.setupTimestamp = lastClosedCandleTime;
                this.log(state, `[${targetSym}] 🔔 Bullish crossover pullback setup! Inside candle (Mother High: ₹${mother.high.toFixed(2)}, Low: ₹${mother.low.toFixed(2)}). Waiting for break above high...`);
              } else if (trend === 'SHORT') {
                state.waitingForConfirmation = 'SHORT';
                state.confirmationHigh = null;
                state.confirmationLow = mother.low;
                state.invalidationPrice = mother.high;
                state.setupTimestamp = lastClosedCandleTime;
                this.log(state, `[${targetSym}] 🔔 Bearish crossover pullback setup! Inside candle (Mother High: ₹${mother.high.toFixed(2)}, Low: ₹${mother.low.toFixed(2)}). Waiting for break below low...`);
              }
            }
            // Scenario 2: Direct Breakout (Triggers immediately on breakout of crossover candle high/low)
            else if (isFreshCrossover && !state.waitingForConfirmation) {
              if (trend === 'LONG') {
                state.waitingForConfirmation = 'LONG';
                state.confirmationHigh = crossoverCandle.high;
                state.confirmationLow = null;
                state.invalidationPrice = Math.min(crossoverCandle.low, crossoverDetails.vwap);
                state.setupTimestamp = lastClosedCandleTime;
                this.log(state, `[${targetSym}] 🚀 Bullish Direct Crossover setup! Crossover Candle High: ₹${crossoverCandle.high.toFixed(2)}, SL (VWAP): ₹${state.invalidationPrice.toFixed(2)}. Waiting for momentum breakout...`);
              } else if (trend === 'SHORT') {
                state.waitingForConfirmation = 'SHORT';
                state.confirmationHigh = null;
                state.confirmationLow = crossoverCandle.low;
                state.invalidationPrice = Math.max(crossoverCandle.high, crossoverDetails.vwap);
                state.setupTimestamp = lastClosedCandleTime;
                this.log(state, `[${targetSym}] 🚀 Bearish Direct Crossover setup! Crossover Candle Low: ₹${crossoverCandle.low.toFixed(2)}, SL (VWAP): ₹${state.invalidationPrice.toFixed(2)}. Waiting for momentum breakdown...`);
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
    if (state.tradesPlacedToday >= config.maxTradesPerDay) {
      this.log(state, `⛔ Daily trade limit reached (${state.tradesPlacedToday}/${config.maxTradesPerDay}). Skipping 2nd trade.`);
      return;
    }
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

    const entry = this.roundTick(triggerPrice);
    let sl: number;
    let tgt: number;

    if (isOption) {
      sl = optionMotherLow !== null ? this.roundTick(optionMotherLow) : this.roundTick(entry - (config.stopLossRs / config.qty));
      const optionRisk = Math.max(0.50, Math.abs(entry - sl));
      tgt = this.roundTick(entry + optionRisk * 1.5);
      state.spotStopLossPrice = side === 'BUY' ? motherLow : motherHigh;
    } else {
      if (finalSide === 'BUY') {
        sl = motherLow ? this.roundTick(motherLow) : this.roundTick(entry - (config.stopLossRs / config.qty));
        const risk = Math.max(0.50, Math.abs(entry - sl));
        tgt = this.roundTick(entry + risk * 1.5);
      } else {
        sl = motherHigh ? this.roundTick(motherHigh) : this.roundTick(entry + (config.stopLossRs / config.qty));
        const risk = Math.max(0.50, Math.abs(sl - entry));
        tgt = this.roundTick(entry - risk * 1.5);
      }
    }

    const riskPerShare = Math.max(0.50, Math.abs(entry - sl));
    if ((!config.qty || config.qty <= 1) && config.stopLossRs && config.stopLossRs > 0) {
      const riskQty = Math.max(1, Math.floor(config.stopLossRs / riskPerShare));
      const capital = (config as any).maxCapital || 20000;
      const safeCapital = capital * 0.90; // 90% safe utilization buffer for brokerage, STT & fees
      const maxBuyingPower = safeCapital * 5; // Zerodha 5x MIS intraday leverage
      const maxCapitalQty = Math.floor(maxBuyingPower / entry);
      const finalQty = Math.max(1, Math.min(riskQty, maxCapitalQty));
      state.config.qty = finalQty;
      this.log(state, `⚖ Auto-sized position: ${finalQty} shares (Capital: ₹${capital.toLocaleString('en-IN')}, 90% Safe Utilization, Max Risk: ₹${config.stopLossRs})`);
    }

    this.log(state, `📋 Placing: ${symbol} — Qty: ${state.config.qty} | Entry: ₹${entry.toFixed(2)} | SL (Mother Candle Low/High): ₹${sl.toFixed(2)} | Target (1:1.5 RR): ₹${tgt.toFixed(2)}`);
    try {
      const isHistorical = !!triggerTime;
      const limitPrice = finalSide === 'BUY' ? this.roundTick(entry + 0.20) : this.roundTick(entry - 0.20);
      const entryId = (state.isPaperTrade || isHistorical)
        ? `PAPER_${Math.random().toString(36).substring(7).toUpperCase()}`
        : await client.placeOrder({ symbol, exchange, product, qty: config.qty, side: finalSide, orderType: 'LIMIT', price: limitPrice });
      this.log(state, `✅ Entry Order (LIMIT @ ₹${limitPrice.toFixed(2)}): ${entryId}`);

      // Track order in DB
      await this.trackOrderInDB(state, finalSide, symbol, exchange, config.qty, entry, entryId, triggerTime);

      const exitSide = finalSide === 'BUY' ? 'SELL' : 'BUY';
      let slOrderId: string | null = null;
      let targetOrderId: string | null = null;
      if (!state.isPaperTrade && !isHistorical) {
        // For SL Limit orders:
        // BUY SL (short exit): limit price must be >= trigger price
        // SELL SL (long exit): limit price must be <= trigger price
        const slLimitPrice = exitSide === 'BUY'
          ? this.roundTick(isOption ? sl * 1.02 : sl + 0.30)
          : this.roundTick(isOption ? sl * 0.98 : sl - 0.30);

        slOrderId = await client.placeOrder({
          symbol,
          exchange,
          product,
          qty: config.qty,
          side: exitSide,
          orderType: 'SL',
          price: slLimitPrice,
          triggerPrice: sl
        }).catch((e: any) => { this.log(state, `❌ SL Failed: ${e.message}`); return null; });
        if (config.enableProfitFloor === false) {
          targetOrderId = await client.placeOrder({ symbol, exchange, product, qty: config.qty, side: exitSide, orderType: 'LIMIT', price: tgt })
            .catch((e: any) => { this.log(state, `❌ Target Failed: ${e.message}`); return null; });
        } else {
          this.log(state, `💡 Trend Trailing Mode active — SL placed at broker (Trigger: ₹${sl.toFixed(2)}, Limit: ₹${slLimitPrice.toFixed(2)}), Target 1 (₹${tgt.toFixed(2)}) will activate dynamic 15-EMA Trailing SL to ride full trend.`);
        }
      }

      state.entryTriggered = side === 'BUY' ? 'LONG' : 'SHORT';
      state.optionSymbol = isOption ? symbol : null;
      state.entryPrice = entry;
      state.stopLossPrice = sl;
      state.targetPrice = tgt;
      state.slOrderId = slOrderId;
      state.targetOrderId = targetOrderId;
      state.setupTimestamp = triggerTime ? triggerTime.getTime() : Date.now();

      if (!state.isPaperTrade && !isHistorical && !slOrderId) {
        this.log(state, `⚠ Warning: Failed to place SL order at broker. Active monitoring will try to exit if needed.`);
      }

      // Start real-time WebSocket monitoring for live trades (not historical catch-up)
      if (!isHistorical && state.entryTriggered) {
        await this.startRealtimeMonitor(state, client);
      }
    } catch (err) { this.log(state, `❌ Placement failed: ${err.message}`); }
  }

  // ── Real-Time WebSocket Position Monitoring ────────────────────────────────

  private async startRealtimeMonitor(state: StrategyState, client: any) {
    if (!state.entryTriggered) return;

    const symbol = state.optionSymbol || state.activeSymbol || state.config.symbol;
    const exchange = state.optionSymbol ? 'NFO' : (state.futureSymbol ? state.futureExchange : state.config.exchange);
    const kite = client['kite'];

    // Dynamically subscribe the traded symbol to the WebSocket
    try {
      await this.tickerService.subscribeSymbol(state.brokerAccountId, symbol);
      this.log(state, `📡 WebSocket subscribed: ${exchange}:${symbol} — Real-time monitoring active`);
    } catch (e) {
      this.log(state, `⚠ WebSocket subscribe failed: ${e.message}. Falling back to 60s polling.`);
      return; // Fallback to poll-based monitorPosition
    }

    state.lastPnlLogTime = 0;
    state.realtimeActive = true;
    let isExiting = false;

    const unsubscribe = this.tickerService.registerListener(async (ticks) => {
      // Only process ticks for our symbol
      const currentPrice = ticks[symbol];
      if (!currentPrice || !state.entryTriggered || isExiting) return;

      const now = Date.now();
      const isOptionTrade = !!(state.config.isOptionBuyingOnly && state.optionSymbol);
      const isLong = isOptionTrade || state.entryTriggered === 'LONG';
      const pnlPoints = isLong ? (currentPrice - state.entryPrice!) : (state.entryPrice! - currentPrice);
      const pnlRs = pnlPoints * state.config.qty;

      // ── 3:10 PM SEBI / Broker MIS Mandatory EOD Square Off ─────────────────
      const currentHhmm = this.getIstHhmm(new Date());
      if (currentHhmm >= 15 * 60 + 10 && state.entryTriggered) {
        if (isExiting) return;
        isExiting = true;
        this.log(state, `⏰ 3:10 PM SEBI/Broker MIS cutoff reached! Auto-squaring off position (P&L: ₹${pnlRs.toFixed(2)})...`);
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
        await this.persistLogs(state);
        return;
      }

      // ── EMA(15) Line Trailing Check (Live Real-time Ticks) ───────────────────
      const targetThresholdRs = state.config.targetRs || 500;
      const isTarget1Reached = isLong ? (currentPrice >= state.targetPrice!) : (currentPrice <= state.targetPrice!);
      const isTrailingEnabled = state.config.enableProfitFloor !== false;

      if ((pnlRs >= targetThresholdRs || isTarget1Reached) && !state.isTrailingEma && isTrailingEnabled) {
        state.isTrailingEma = true;
        this.log(state, `📈 [RT] Target 1 reached (Target: ₹${state.targetPrice?.toFixed(2)}, P&L: ₹${pnlRs.toFixed(2)})! Activated EMA(15) Line Trailing SL — riding trend...`);
        if (state.targetOrderId) {
          await this.cancelBrokerOrderSafe(client, state.targetOrderId);
          state.targetOrderId = null;
        }
      }

      if (state.isTrailingEma && state.lastEma && !isOptionTrade) {
        state.stopLossPrice = state.lastEma;
        const isCrossedEma = isLong ? (currentPrice < state.lastEma) : (currentPrice > state.lastEma);
        if (isCrossedEma) {
          if (isExiting) return;
          isExiting = true;
          this.log(state, `📈 [RT] Price crossed EMA(15) line @ ₹${currentPrice.toFixed(2)} (EMA: ₹${state.lastEma.toFixed(2)}) | Realized P&L: ₹${pnlRs.toFixed(2)}`);
          this.stopRealtimeMonitor(state);
          await this.exitPosition(state, client, currentPrice, 'TARGET');
          await this.persistLogs(state);
          return;
        }
      }

      // ── Check SL / Target ──────────────────────────────────────────────
      if (state.isPaperTrade) {
        const isHitSL = isLong ? (currentPrice <= state.stopLossPrice!) : (currentPrice >= state.stopLossPrice!);

        if (!state.isTrailingEma && isHitSL) {
          if (isExiting) return;
          isExiting = true;
          this.log(state, `🛑 [RT] Stop Loss Hit at ₹${currentPrice.toFixed(2)} | P&L: ₹${pnlRs.toFixed(2)}`);
          this.stopRealtimeMonitor(state);
          await this.exitPosition(state, client, currentPrice, 'SL');
          await this.persistLogs(state);
          return;
        }
        if (!isTrailingEnabled && isTarget1Reached) {
          if (isExiting) return;
          isExiting = true;
          this.log(state, `🎯 [RT] Fixed Target Hit at ₹${currentPrice.toFixed(2)} | P&L: ₹${pnlRs.toFixed(2)}`);
          this.stopRealtimeMonitor(state);
          await this.exitPosition(state, client, currentPrice, 'TARGET');
          await this.persistLogs(state);
          return;
        }
      } else {
        // For live trades, check if broker SL/Target orders have been filled/rejected
        // This runs on tick to detect faster than 60s poll
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
              this.log(state, `🛑 [RT] SL Order filled at ₹${avgPrice.toFixed(2)}`);
              if (state.targetOrderId) await client.cancelOrder(state.targetOrderId).catch(() => { });
              this.stopRealtimeMonitor(state);
              await this.exitPosition(state, client, avgPrice, 'SL');
              await this.persistLogs(state);
              return;
            } else if (targetOrder?.status === 'COMPLETE') {
              const avgPrice = Number(targetOrder.average_price) || state.targetPrice!;
              this.log(state, `🎯 [RT] Target Order filled at ₹${avgPrice.toFixed(2)}`);
              if (state.slOrderId) await client.cancelOrder(state.slOrderId).catch(() => { });
              this.stopRealtimeMonitor(state);
              await this.exitPosition(state, client, avgPrice, 'TARGET');
              await this.persistLogs(state);
              return;
            } else if (slOrder && (slOrder.status === 'REJECTED' || slOrder.status === 'CANCELLED')) {
              this.log(state, `⚠ [RT] SL order ${slOrder.status}! Force closing...`);
              if (state.targetOrderId) await client.cancelOrder(state.targetOrderId).catch(() => { });
              this.stopRealtimeMonitor(state);
              await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
              await this.persistLogs(state);
              return;
            } else if (targetOrder && (targetOrder.status === 'REJECTED' || targetOrder.status === 'CANCELLED')) {
              this.log(state, `⚠ [RT] Target order ${targetOrder.status}! Force closing...`);
              if (state.slOrderId) await client.cancelOrder(state.slOrderId).catch(() => { });
              this.stopRealtimeMonitor(state);
              await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
              await this.persistLogs(state);
              return;
            }
          } catch (e) {
            this.logger.error(`[RT] Order check error: ${e.message}`);
          }
          isExiting = false; // Reset if no fill detected yet — order may still be pending at exchange
        }
      }

      // ── Throttled P&L logging (every 5 seconds) ────────────────────────
      if (now - (state.lastPnlLogTime || 0) >= 5000) {
        state.lastPnlLogTime = now;
        this.log(state, `📊 [RT] ${symbol}: ₹${currentPrice.toFixed(2)} | Entry: ₹${state.entryPrice!.toFixed(2)} | SL: ₹${state.stopLossPrice!.toFixed(2)} | Target: ₹${state.targetPrice!.toFixed(2)} | P&L: ₹${pnlRs.toFixed(2)}`);
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
      this.log(state, `📡 WebSocket monitor disconnected`);
    }
  }

  // ── Fallback: Poll-based monitor (runs every 60s as safety net) ──────────

  private async monitorPosition(state: StrategyState, client: any, kite: any) {
    if (!state.entryTriggered) return;

    const symbol = state.optionSymbol || state.activeSymbol || state.config.symbol;
    const exchange = state.optionSymbol ? 'NFO' : (state.futureSymbol ? state.futureExchange : state.config.exchange);

    // If WebSocket real-time monitor is active, just log a heartbeat
    if (state.realtimeActive) {
      this.log(state, `💓 Heartbeat — WebSocket monitoring active for ${symbol}`);
      return;
    }

    // Fallback: full poll-based monitoring when WebSocket is not available
    this.log(state, `⚠ Polling fallback — checking position via API...`);

    try {
      if (state.isPaperTrade) {
        const key = `${exchange}:${symbol}`;
        const ltpData = await kite.getLTP([key]);
        const currentPrice = ltpData[key]?.last_price;
        if (!currentPrice) return;

        const isOptionTrade = !!(state.config.isOptionBuyingOnly && state.optionSymbol);
        const isLong = isOptionTrade || state.entryTriggered === 'LONG';
        const pnlPoints = isLong ? (currentPrice - state.entryPrice!) : (state.entryPrice! - currentPrice);
        const pnlRs = pnlPoints * state.config.qty;

        // ── 3:10 PM SEBI / Broker MIS Mandatory EOD Square Off ─────────────────
        const currentHhmm = this.getIstHhmm(new Date());
        if (currentHhmm >= 15 * 60 + 10 && state.entryTriggered) {
          this.log(state, `⏰ 3:10 PM SEBI/Broker MIS cutoff reached! Auto-squaring off position (P&L: ₹${pnlRs.toFixed(2)})...`);
          await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
          return;
        }

        const targetThresholdRs = state.config.targetRs || 500;
        const isTarget1Reached = isLong ? (currentPrice >= state.targetPrice!) : (currentPrice <= state.targetPrice!);
        const isTrailingEnabled = state.config.enableProfitFloor !== false;

        if ((pnlRs >= targetThresholdRs || isTarget1Reached) && !state.isTrailingEma && isTrailingEnabled) {
          state.isTrailingEma = true;
          this.log(state, `📈 Target 1 reached (Target: ₹${state.targetPrice?.toFixed(2)}, P&L: ₹${pnlRs.toFixed(2)})! Activated EMA(15) Line Trailing SL — riding trend...`);
        }

        this.log(state, `👀 Price ${symbol}: ₹${currentPrice.toFixed(2)} | Target: ₹${state.targetPrice!.toFixed(2)} | SL: ₹${state.stopLossPrice!.toFixed(2)} | P&L: ₹${pnlRs.toFixed(2)}${state.isTrailingEma ? ' (EMA Trailing Active)' : ''}`);

        if (state.isTrailingEma && state.lastEma && !isOptionTrade) {
          state.stopLossPrice = state.lastEma;
          const isCrossedEma = isLong ? (currentPrice < state.lastEma) : (currentPrice > state.lastEma);
          if (isCrossedEma) {
            this.log(state, `📈 Price crossed EMA(15) line @ ₹${currentPrice.toFixed(2)} (EMA: ₹${state.lastEma.toFixed(2)}) | Realized P&L: ₹${pnlRs.toFixed(2)}`);
            await this.exitPosition(state, client, currentPrice, 'TARGET');
            return;
          }
        } else {
          const isHitSL = isLong ? (currentPrice <= state.stopLossPrice!) : (currentPrice >= state.stopLossPrice!);
          if (isHitSL) {
            this.log(state, `🛑 Stop Loss Hit at ₹${currentPrice.toFixed(2)}`);
            await this.exitPosition(state, client, currentPrice, 'SL');
            return;
          } else if (!isTrailingEnabled && isTarget1Reached) {
            this.log(state, `🎯 Fixed Target Hit at ₹${currentPrice.toFixed(2)}`);
            await this.exitPosition(state, client, currentPrice, 'TARGET');
            return;
          }
        }
      } else {
        const orders = await kite.getOrders();
        const slOrder = orders.find((o: any) => o.order_id === state.slOrderId);
        const targetOrder = orders.find((o: any) => o.order_id === state.targetOrderId);

        if (slOrder && slOrder.status === 'COMPLETE') {
          const avgPrice = Number(slOrder.average_price) || state.stopLossPrice!;
          this.log(state, `🛑 Stop Loss Order filled at ₹${avgPrice.toFixed(2)}`);
          if (state.targetOrderId) {
            await client.cancelOrder(state.targetOrderId).catch(() => { });
          }
          await this.exitPosition(state, client, avgPrice, 'SL');
        } else if (targetOrder && targetOrder.status === 'COMPLETE') {
          const avgPrice = Number(targetOrder.average_price) || state.targetPrice!;
          this.log(state, `🎯 Target Order filled at ₹${avgPrice.toFixed(2)}`);
          if (state.slOrderId) {
            await client.cancelOrder(state.slOrderId).catch(() => { });
          }
          await this.exitPosition(state, client, avgPrice, 'TARGET');
        } else if (slOrder && (slOrder.status === 'REJECTED' || slOrder.status === 'CANCELLED')) {
          this.log(state, `⚠ Stop Loss order was ${slOrder.status}! Checking position status.`);
          if (state.targetOrderId) {
            await client.cancelOrder(state.targetOrderId).catch(() => { });
          }
          const key = `${exchange}:${symbol}`;
          const ltpData = await kite.getLTP([key]);
          const currentPrice = ltpData[key]?.last_price || state.stopLossPrice!;
          await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
        } else if (targetOrder && (targetOrder.status === 'REJECTED' || targetOrder.status === 'CANCELLED')) {
          this.log(state, `⚠ Target order was ${targetOrder.status}! Checking position status.`);
          if (state.slOrderId) {
            await client.cancelOrder(state.slOrderId).catch(() => { });
          }
          const key = `${exchange}:${symbol}`;
          const ltpData = await kite.getLTP([key]);
          const currentPrice = ltpData[key]?.last_price || state.targetPrice!;
          await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
        }
      }
    } catch (e) {
      this.log(state, `⚠ Position monitor error: ${e.message}`);
    }
  }

  private async exitPosition(state: StrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET' | 'FORCE_CLOSE') {
    const { config } = state;
    const symbol = state.optionSymbol || state.activeSymbol || config.symbol;
    const exchange = state.optionSymbol ? 'NFO' : (state.futureSymbol ? state.futureExchange : config.exchange);
    const exitSide = (config.isOptionBuyingOnly && state.optionSymbol) ? 'SELL' : (state.entryTriggered === 'LONG' ? 'SELL' : 'BUY');
    const qty = config.qty;

    // Stop WebSocket monitoring before exit
    this.stopRealtimeMonitor(state);

    try {
      let exitOrderId = '';
      let exitOrderType: 'MARKET' | 'LIMIT' | 'SL' = 'MARKET';
      if (state.isPaperTrade) {
        exitOrderId = `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`;
      } else {
        if (reason === 'FORCE_CLOSE' || (reason === 'TARGET' && !state.targetOrderId)) {
          // Cancel both pending SL and Target orders before placing market exit
          await this.cancelBrokerOrderSafe(client, state.slOrderId);
          await this.cancelBrokerOrderSafe(client, state.targetOrderId);
          exitOrderId = await client.placeOrder({ symbol, exchange, product: config.product ?? 'MIS', qty, side: exitSide, orderType: 'MARKET' });
          exitOrderType = 'MARKET';
          this.log(state, `✅ Live Exit Order placed (${reason}): ${exitOrderId}`);
        } else if (reason === 'SL') {
          // SL hit -> cancel target order to avoid reverse/stray trade
          await this.cancelBrokerOrderSafe(client, state.targetOrderId);
          exitOrderId = state.slOrderId || `SL_EXIT_${Date.now()}`;
          exitOrderType = 'SL';
        } else if (reason === 'TARGET') {
          // Fixed target hit -> cancel SL order to avoid reverse/stray trade
          await this.cancelBrokerOrderSafe(client, state.slOrderId);
          exitOrderId = state.targetOrderId || `TARGET_EXIT_${Date.now()}`;
          exitOrderType = 'LIMIT';
        }
      }

      await this.trackOrderInDB(state, exitSide, symbol, exchange, qty, exitPrice, exitOrderId, undefined, exitOrderType);
      state.tradesPlacedToday++;

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
      this.log(state, `🏁 (Catch-up) Paper trade closed (${reason}) at ₹${exitPrice.toFixed(2)}`);

      // Track exit order in DB
      await this.trackOrderInDB(state, exitSide, symbol, exchange, qty, exitPrice, exitOrderId, timestamp);
      state.tradesPlacedToday++;

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

  private calculateVWAP(candles: Candle[], vwapSource: 'close' | 'hlc3' = 'close') {
    const vwaps: (number | null)[] = new Array(candles.length).fill(null);
    let cpv = 0, cv = 0;
    let lastDateStr = '';
    for (let i = 0; i < candles.length; i++) {
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(candles[i].date);
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
    const istDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    const from = new Date(`${istDateStr} 09:15:00 GMT+0530`);
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

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); // "YYYY-MM-DD"

    const getExpiryStr = (expiry: any): string => {
      if (!expiry) return '';
      const d = new Date(expiry);
      if (isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
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
    const istStr = date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: false });
    const parts = istStr.split(':').map(Number);
    return parts[0] * 60 + (parts[1] || 0);
  }

  private roundTick(p: number) { return Math.round(p / 0.05) * 0.05; }
  private formatTime(d: Date) { return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
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
    const todayStr = candles[idx].date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });

    for (let k = 1; k <= idx; k++) {
      const candleDateStr = candles[k].date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
      if (candleDateStr !== todayStr) continue;

      const prevDateStr = candles[k - 1].date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
      if (prevDateStr !== todayStr) continue;

      const prevEma = emas[k - 1], currEma = emas[k];
      const prevVwap = vwaps[k - 1], currVwap = vwaps[k];
      if (prevEma === null || currEma === null || prevVwap === null || currVwap === null) continue;

      if (prevEma <= prevVwap && currEma > currVwap) {
        latestCrossover = 'LONG';
        crossoverIdx = k;
      } else if (prevEma >= prevVwap && currEma < currVwap) {
        latestCrossover = 'SHORT';
        crossoverIdx = k;
      }
    }

    // Return the crossover only if the trend is still valid at the current candle
    // (i.e. EMA is still on the correct side of VWAP — trend hasn't reversed)
    if (latestCrossover !== null) {
      const currentEma = emas[idx], currentVwap = vwaps[idx];
      if (currentEma === null || currentVwap === null) return null;

      const trendStillValid =
        (latestCrossover === 'LONG' && currentEma > currentVwap) ||
        (latestCrossover === 'SHORT' && currentEma < currentVwap);

      if (trendStillValid) {
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


}
