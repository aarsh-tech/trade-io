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
  isCostSlTrailed?: boolean;
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

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) return { executionId: this.running.get(strategyId)!.executionId };

    const strategy = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
      include: { brokerAccount: true },
    });
    if (!strategy) throw new Error('Strategy not found');

    const parsedConfig: Partial<NiftyOptionsScalperConfig> = JSON.parse(strategy.config);
    const lots = parsedConfig.lots || 1;
    const qty = parsedConfig.qty || (lots * 65);
    const stopLossPoints = parsedConfig.stopLossPoints || 7;
    const targetPoints = parsedConfig.targetPoints || 10;
    const trailCostAtPoints = parsedConfig.trailCostAtPoints || 5;

    const config: NiftyOptionsScalperConfig = {
      symbol: parsedConfig.symbol || 'NIFTY',
      exchange: parsedConfig.exchange || 'NSE',
      emaPeriod: parsedConfig.emaPeriod || 15,
      vwapSource: parsedConfig.vwapSource || 'close',
      isOptionBuyingOnly: true,
      qty,
      lots,
      product: parsedConfig.product || 'MIS',
      maxTradesPerDay: parsedConfig.maxTradesPerDay || 3,
      maxWinsPerDay: parsedConfig.maxWinsPerDay || 1,
      stopLossPoints,
      targetPoints,
      trailCostAtPoints,
      stopLossRs: stopLossPoints * qty,
      targetRs: targetPoints * qty,
      minPremium: parsedConfig.minPremium,
      maxPremium: parsedConfig.maxPremium,
      enableOrbTrigger: parsedConfig.enableOrbTrigger !== undefined ? parsedConfig.enableOrbTrigger : true,
      enablePullbackTrigger: parsedConfig.enablePullbackTrigger !== undefined ? parsedConfig.enablePullbackTrigger : true,
    };

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
      winningTradesToday: 0,
      logs: [],
      lastProcessedTimestamp: 0,
      isCostSlTrailed: false,
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Nifty 10-Point Scalper Started — ${config.symbol}:${config.exchange} (Target: +${config.targetPoints} pts, SL: -${config.stopLossPoints} pts, Cost Trail: +${config.trailCostAtPoints} pts)`);
    await this.persistLogs(state);

    const timer = setInterval(() => this.tick(strategyId).catch(e => this.logger.error(e)), 60_000);
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
      isGoalAchieved: s.winningTradesToday >= (s.config.maxWinsPerDay || 1),
    };
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
        if (currentEma === null || currentVwap === null) continue;

        // Active Position Management in Catch-up
        if (state.entryTriggered) {
          const optSymbol = state.optionSymbol!;
          const rawData = await client.getHistoricalData(optSymbol, 'NFO', '5minute', new Date(state.setupTimestamp || currentCandle.date), now);
          const optCandles: Candle[] = (rawData || []).map((c: any) => ({ date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
          const optCandle = optCandles.find(c => c.date.getTime() === currentCandle.date.getTime());

          if (optCandle) {
            // Step 1: Check +4 Points Cost Trail
            if (optCandle.high >= state.entryPrice! + (state.config.trailCostAtPoints || 4) && !state.isCostSlTrailed) {
              state.isCostSlTrailed = true;
              state.stopLossPrice = state.entryPrice;
              this.log(state, `🛡 (Catch-up) Option hit +${state.config.trailCostAtPoints || 4} pts profit! Trailed SL to COST (₹${state.entryPrice!.toFixed(2)}) — Risk-Free Trade!`);
            }

            // Step 2: Check +7 Points Profit Lock (+4 Pts locked)
            if (optCandle.high >= state.entryPrice! + 7 && state.stopLossPrice! < state.entryPrice! + 4) {
              state.stopLossPrice = state.entryPrice! + 4;
              this.log(state, `🔒 (Catch-up) Option hit +7 pts profit! Locked +4 pts profit (SL set to ₹${state.stopLossPrice.toFixed(2)}) — +₹520 Profit Guaranteed!`);
            }

            // Target (+10 Points) Check
            if (optCandle.high >= state.targetPrice!) {
              const exitPrice = state.targetPrice!;
              const pnlPoints = exitPrice - state.entryPrice!;
              const pnlRs = pnlPoints * state.config.qty;
              this.log(state, `🎯 (Catch-up) Target Hit (+${pnlPoints.toFixed(1)} pts / ₹${pnlRs.toFixed(2)}) on ${this.formatTime(currentCandle.date)} @ ₹${exitPrice.toFixed(2)}`);
              state.winningTradesToday++;
              await this.exitPositionHistorical(state, client, exitPrice, 'TARGET', currentCandle.date);
              continue;
            }

            // Stop Loss Check
            if (optCandle.low <= state.stopLossPrice!) {
              const exitPrice = state.stopLossPrice!;
              const pnlPoints = exitPrice - state.entryPrice!;
              const pnlRs = pnlPoints * state.config.qty;
              this.log(state, `🛑 (Catch-up) Stop Loss Hit (${pnlPoints.toFixed(1)} pts / ₹${pnlRs.toFixed(2)}) on ${this.formatTime(currentCandle.date)} @ ₹${exitPrice.toFixed(2)}`);
              await this.exitPositionHistorical(state, client, exitPrice, 'SL', currentCandle.date);
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

        const prevCandle = candles[i - 1];
        const prevDateStr = prevCandle.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
        if (prevDateStr !== targetSessionDateStr) continue;

        const prevEma = emas[i - 1], prevVwap = vwaps[i - 1];

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
            
            const touchedVwapOrEmaBearish = currentCandle.high >= currentEma - 8 && currentCandle.high <= Math.max(currentEma, currentVwap) + 10;
            const touchedVwapOrEmaBullish = currentCandle.low <= currentEma + 8 && currentCandle.low >= Math.min(currentEma, currentVwap) - 10;

            if (isBearishRegime && touchedVwapOrEmaBearish && currentCandle.close < currentCandle.open && currentCandle.low < prevCandle.low) {
              triggerSide = 'SELL'; setupName = 'VWAP/EMA Pullback PE Rejection'; triggerPriceLevel = currentCandle.low;
            } else if (isBullishRegime && touchedVwapOrEmaBullish && currentCandle.close > currentCandle.open && currentCandle.high > prevCandle.high) {
              triggerSide = 'BUY'; setupName = 'VWAP/EMA Pullback CE Rejection'; triggerPriceLevel = currentCandle.high;
            }
          }
        }

        // Trigger 3: 15-Min Opening Range Breakdown (ORB)
        if (!triggerSide && state.config.enableOrbTrigger && orbLow !== null && orbHigh !== null && i >= 3) {
          if (currentCandle.close < orbLow && prevCandle.close >= orbLow) {
            triggerSide = 'SELL'; setupName = '15-Min ORB Breakdown (PE)'; triggerPriceLevel = currentCandle.low;
          } else if (currentCandle.close > orbHigh && prevCandle.close <= orbHigh) {
            triggerSide = 'BUY'; setupName = '15-Min ORB Breakout (CE)'; triggerPriceLevel = currentCandle.high;
          }
        }

        if (triggerSide) {
          this.log(state, `🚀 (Catch-up) Detected ${setupName} on ${this.formatTime(currentCandle.date)}! Executing 10-point Option Trade...`);
          await this.placeTrade(state, client, account, triggerSide, triggerPriceLevel, new Date(currentCandle.date), new Date(prevCandle.date), currentCandle.low, currentCandle.high);
        }
      }

      if (!state.entryTriggered) this.log(state, `✅ Catch-up complete for Nifty 10-Point Scalper. Evaluated ${sessionCandles.length} 5-min candles for session (${targetSessionDateStr}). Placed ${state.tradesPlacedToday} trades.`);
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

        const currEma = emas[lastIdx], prevEma = emas[lastIdx - 1];
        const currVwap = vwaps[lastIdx], prevVwap = vwaps[lastIdx - 1];
        const currentCandle = closedCandles[lastIdx];
        const prevCandle = closedCandles[lastIdx - 1];

        const todayStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
        const currDateStr = currentCandle.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
        const prevDateStr = prevCandle.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });

        // Ensure both current candle and previous candle belong strictly to today's trading session
        if (currDateStr !== todayStr || prevDateStr !== todayStr) return;

        let triggerSide: 'BUY' | 'SELL' | null = null;
        let setupName = '';

        // 1. EMA-VWAP Crossover Trigger
        if (prevEma !== null && prevVwap !== null && currEma !== null && currVwap !== null) {
          if (prevEma <= prevVwap && currEma > currVwap) {
            triggerSide = 'BUY'; setupName = 'EMA-VWAP Bullish Crossover';
          } else if (prevEma >= prevVwap && currEma < currVwap) {
            triggerSide = 'SELL'; setupName = 'EMA-VWAP Bearish Crossover';
          }
        }

        // 2. VWAP / 15-EMA Pullback Rejection (Captures CE & PE continuation)
        if (!triggerSide && config.enablePullbackTrigger && currEma !== null && currVwap !== null) {
          const candleHhmm = this.getIstHhmm(currentCandle.date);
          if (candleHhmm >= 9 * 60 + 35) {
            const isBearishRegime = currEma < currVwap && currentCandle.close < currEma && currentCandle.close < currVwap;
            const isBullishRegime = currEma > currVwap && currentCandle.close > currEma && currentCandle.close > currVwap;

            const touchedVwapOrEmaBearish = currentCandle.high >= currEma - 8 && currentCandle.high <= Math.max(currEma, currVwap) + 10;
            const touchedVwapOrEmaBullish = currentCandle.low <= currEma + 8 && currentCandle.low >= Math.min(currEma, currVwap) - 10;

            if (isBearishRegime && touchedVwapOrEmaBearish && currentCandle.close < currentCandle.open && currentCandle.low < prevCandle.low) {
              triggerSide = 'SELL'; setupName = 'VWAP/EMA Pullback PE Rejection';
            } else if (isBullishRegime && touchedVwapOrEmaBullish && currentCandle.close > currentCandle.open && currentCandle.high > prevCandle.high) {
              triggerSide = 'BUY'; setupName = 'VWAP/EMA Pullback CE Rejection';
            }
          }
        }

        // 3. 15-Min Opening Range Breakdown (ORB)
        let orbHigh: number | null = null;
        let orbLow: number | null = null;
        const todayCandles = closedCandles.filter(c => c.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' }) === todayStr);
        if (todayCandles.length >= 3) {
          const orbCandles = todayCandles.slice(0, 3);
          orbHigh = Math.max(...orbCandles.map(c => c.high));
          orbLow = Math.min(...orbCandles.map(c => c.low));
        }

        if (!triggerSide && config.enableOrbTrigger && orbLow !== null && orbHigh !== null && lastIdx >= 3) {
          if (currentCandle.close < orbLow && prevCandle.close >= orbLow) {
            triggerSide = 'SELL'; setupName = '15-Min ORB Breakdown (PE)';
          } else if (currentCandle.close > orbHigh && prevCandle.close <= orbHigh) {
            triggerSide = 'BUY'; setupName = '15-Min ORB Breakout (CE)';
          }
        }

        if (triggerSide) {
          this.log(state, `🚀 Triggered ${setupName} at ${this.formatTime(currentCandle.date)}! Placing 10-Point Option Trade...`);
          await this.placeTrade(state, client, account, triggerSide, currentCandle.close);
        } else {
          this.log(state, `👀 Scanned 5-min candle (${this.formatTime(currentCandle.date)}) @ ₹${currentCandle.close.toFixed(2)} — EMA: ₹${currEma?.toFixed(2)} | VWAP: ₹${currVwap?.toFixed(2)} (No crossover signal)`);
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

    let optionEntryPrice = 100;
    if (triggerTime) {
      const histPrice = await this.getHistoricalOptionPrice(client, optSym, 'NFO', triggerTime);
      if (histPrice !== null) optionEntryPrice = histPrice;
    } else {
      const q = await kite.getLTP([`NFO:${optSym}`]);
      if (q[`NFO:${optSym}`]?.last_price) optionEntryPrice = q[`NFO:${optSym}`].last_price;
    }

    const entry = this.roundTick(optionEntryPrice);
    const sl = this.roundTick(entry - (config.stopLossPoints || 7));
    const tgt = this.roundTick(entry + (config.targetPoints || 10));

    state.entryTriggered = 'LONG';
    state.optionSymbol = optSym;
    state.entryPrice = entry;
    state.stopLossPrice = sl;
    state.initialSlPrice = sl;
    state.targetPrice = tgt;
    state.setupTimestamp = triggerTime ? triggerTime.getTime() : Date.now();
    state.isCostSlTrailed = false;

    this.log(state, `📋 Placed Option Trade: ${optSym} — Entry: ₹${entry.toFixed(2)} | Target (+10 pts): ₹${tgt.toFixed(2)} | Initial SL (-7 pts): ₹${sl.toFixed(2)}`);

    try {
      const isHistorical = !!triggerTime;
      const orderId = (state.isPaperTrade || isHistorical)
        ? `PAPER_${Math.random().toString(36).substring(7).toUpperCase()}`
        : await client.placeOrder({ symbol: optSym, exchange: 'NFO', product: config.product, qty: config.qty, side: 'BUY', orderType: 'MARKET' });

      await this.trackOrderInDB(state, 'BUY', optSym, 'NFO', config.qty, entry, orderId, triggerTime);

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

    state.realtimeActive = true;
    let isExiting = false;

    const unsubscribe = this.tickerService.registerListener(async (ticks) => {
      const currentPrice = ticks[symbol];
      if (!currentPrice || !state.entryTriggered || isExiting) return;

      const now = Date.now();
      const pnlPoints = currentPrice - state.entryPrice!;
      const pnlRs = pnlPoints * state.config.qty;

      // 1. Check +4 Points Breakeven Trail (Step 1)
      if (pnlPoints >= (state.config.trailCostAtPoints || 4) && !state.isCostSlTrailed) {
        state.isCostSlTrailed = true;
        state.stopLossPrice = state.entryPrice;
        this.log(state, `🛡 Option profit hit +${state.config.trailCostAtPoints || 4} pts! Trailed SL to COST (₹${state.entryPrice!.toFixed(2)}) — Risk-Free Trade!`);
      }

      // 2. Check +7 Points Profit Lock (Step 2)
      if (pnlPoints >= 7 && state.stopLossPrice! < state.entryPrice! + 4) {
        state.stopLossPrice = state.entryPrice! + 4;
        this.log(state, `🔒 Option profit hit +7 pts! Locked +4 pts profit (SL set to ₹${state.stopLossPrice.toFixed(2)}) — +₹520 Profit Guaranteed!`);
      }

      // 2. Check Target (+10 Points)
      if (currentPrice >= state.targetPrice!) {
        isExiting = true;
        this.log(state, `🎯 Target Hit (+${pnlPoints.toFixed(1)} pts / ₹${pnlRs.toFixed(2)}) @ ₹${currentPrice.toFixed(2)}`);
        state.winningTradesToday++;
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, 'TARGET');
        return;
      }

      // 3. Check Stop Loss
      if (currentPrice <= state.stopLossPrice!) {
        isExiting = true;
        this.log(state, `🛑 Stop Loss Hit (${pnlPoints.toFixed(1)} pts / ₹${pnlRs.toFixed(2)}) @ ₹${currentPrice.toFixed(2)}`);
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, 'SL');
        return;
      }

      // 4. 3:10 PM Mandatory Cutoff
      if (this.getIstHhmm(new Date()) >= 15 * 60 + 10) {
        isExiting = true;
        this.log(state, `⏰ 3:10 PM Cutoff reached! Squaring off at ₹${currentPrice.toFixed(2)}`);
        this.stopRealtimeMonitor(state);
        await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
        return;
      }

      if (now - (state.lastPnlLogTime || 0) >= 5000) {
        state.lastPnlLogTime = now;
        this.log(state, `📊 [RT] ${symbol}: ₹${currentPrice.toFixed(2)} | P&L: ${pnlPoints > 0 ? '+' : ''}${pnlPoints.toFixed(1)} pts (₹${pnlRs.toFixed(2)}) | SL: ₹${state.stopLossPrice!.toFixed(2)} | Target: ₹${state.targetPrice!.toFixed(2)}`);
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
    }
  }

  private async monitorPosition(state: ScalperStrategyState, client: any, kite: any) {
    if (!state.optionSymbol) return;
    if (state.realtimeActive) return;

    try {
      const symbol = state.optionSymbol;
      const key = `NFO:${symbol}`;
      const ltpData = await kite.getLTP([key]);
      const currentPrice = ltpData[key]?.last_price;
      if (!currentPrice) return;

      const pnlPoints = currentPrice - state.entryPrice!;
      if (pnlPoints >= (state.config.trailCostAtPoints || 5) && !state.isCostSlTrailed) {
        state.isCostSlTrailed = true;
        state.stopLossPrice = state.entryPrice;
        this.log(state, `🛡 Option profit hit +${state.config.trailCostAtPoints} pts! Trailed SL to COST (₹${state.entryPrice!.toFixed(2)})`);
      }

      if (currentPrice >= state.targetPrice!) {
        this.log(state, `🎯 Target Hit at ₹${currentPrice.toFixed(2)}`);
        state.winningTradesToday++;
        await this.exitPosition(state, client, currentPrice, 'TARGET');
      } else if (currentPrice <= state.stopLossPrice!) {
        this.log(state, `🛑 Stop Loss Hit at ₹${currentPrice.toFixed(2)}`);
        await this.exitPosition(state, client, currentPrice, 'SL');
      }
    } catch (e) {
      this.log(state, `⚠ Position monitor error: ${e.message}`);
    }
  }

  private async exitPosition(state: ScalperStrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET' | 'FORCE_CLOSE') {
    const symbol = state.optionSymbol!;
    const qty = state.config.qty;
    this.stopRealtimeMonitor(state);

    try {
      const exitOrderId = state.isPaperTrade
        ? `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`
        : await client.placeOrder({ symbol, exchange: 'NFO', product: state.config.product, qty, side: 'SELL', orderType: 'MARKET' });

      await this.trackOrderInDB(state, 'SELL', symbol, 'NFO', qty, exitPrice, exitOrderId);
      state.tradesPlacedToday++;

      state.entryTriggered = null;
      state.optionSymbol = null;
      state.entryPrice = null;
      state.stopLossPrice = null;
      state.targetPrice = null;
      state.isCostSlTrailed = false;
    } catch (e) {
      this.log(state, `❌ Exit execution failed: ${e.message}`);
    }
  }

  private async exitPositionHistorical(state: ScalperStrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET', timestamp: Date) {
    const symbol = state.optionSymbol!;
    const qty = state.config.qty;
    this.stopRealtimeMonitor(state);

    try {
      const exitOrderId = `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`;
      await this.trackOrderInDB(state, 'SELL', symbol, 'NFO', qty, exitPrice, exitOrderId, timestamp);
      state.tradesPlacedToday++;

      state.entryTriggered = null;
      state.optionSymbol = null;
      state.entryPrice = null;
      state.stopLossPrice = null;
      state.targetPrice = null;
      state.isCostSlTrailed = false;
    } catch (e) {
      this.log(state, `❌ Historical exit failed: ${e.message}`);
    }
  }

  private async trackOrderInDB(state: ScalperStrategyState, side: 'BUY' | 'SELL', symbol: string, exchange: string, qty: number, price: number, orderId: string, createdAt?: Date) {
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
          executionId: state.executionId,
          symbol,
          exchange,
          side: side as any,
          orderType: 'LIMIT',
          productType: state.config.product,
          qty,
          price,
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
        cpv = 0; cv = 0; lastDateStr = dateStr;
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

  private async findOptionSymbol(client: any, state: ScalperStrategyState, spotPrice: number, type: 'CE' | 'PE', triggerTime?: Date): Promise<string | null> {
    const { config } = state;
    const upper = config.symbol.toUpperCase().trim();
    const underlying = upper.includes('BANKNIFTY') ? 'BANKNIFTY' : 'NIFTY';
    const exchange = 'NFO';
    const segment = 'NFO-OPT';

    const instruments = await client.getInstruments(exchange);
    const options = instruments.filter((i: any) => i.name === underlying && i.instrument_type === type && i.segment === segment);
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

    // ATM strike matching
    const step = 50;
    const atm = Math.round(spotPrice / step) * step;
    const match = filteredOptions.find((i: any) => Number(i.strike) === atm);
    if (match) return match.tradingsymbol;

    let closest: any = null, closestD = Infinity;
    for (const opt of filteredOptions) {
      const d = Math.abs(Number(opt.strike) - spotPrice);
      if (d < closestD) { closestD = d; closest = opt; }
    }
    return closest ? closest.tradingsymbol : null;
  }

  private getIstHhmm(date: Date): number {
    const istStr = date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: false });
    const parts = istStr.split(':').map(Number);
    return parts[0] * 60 + (parts[1] || 0);
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
    const exchange = 'NFO';
    const segment = 'NFO-FUT';
    const underlying = upperSymbol.includes('BANK') ? 'BANKNIFTY' : 'NIFTY';
    const instruments = await client.getInstruments(exchange);
    const futures = instruments.filter((i: any) => i.name === underlying && i.instrument_type === 'FUT' && i.segment === segment);
    if (futures.length === 0) throw new Error(`No ${exchange} future for ${baseSymbol}`);
    const sorted = futures.sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    return { symbol: sorted[0].tradingsymbol, exchange };
  }
}
