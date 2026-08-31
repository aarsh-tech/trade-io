import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { Breakout15MinConfig } from './dto/strategy.dto';
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

interface StrategyState {
  strategyId: string;
  executionId: string;
  config: Breakout15MinConfig;
  brokerAccountId: string;
  isPaperTrade: boolean;
  futureSymbol: string | null;
  futureExchange: string;
  refHigh: number | null;
  refLow: number | null;
  refCandleSet: boolean;
  entryTriggered: 'LONG' | 'SHORT' | null;
  optionSymbol: string | null;
  entryOrderId: string | null;
  slOrderId: string | null;
  targetOrderId: string | null;
  stopLossPrice?: number | null;
  targetPrice?: number | null;
  entryPrice?: number | null;
  entryFilled?: boolean;
  setupTimestamp: number | null;
  tradesPlacedToday: number;
  logs: string[];

  // Dynamic & Adaptive Upgrades State
  dynamicAtr?: number;
  initialRiskPoints?: number;
  isBreakevenTrailed?: boolean;
  highestPriceReached?: number;
  lowestPriceReached?: number;
  lastBreakoutAttempt?: {
    side: 'LONG' | 'SHORT';
    timestamp: number;
    failed: boolean;
    breakoutPrice: number;
  } | null;
  isReversalTrade?: boolean;
  currentLtp?: number;
  currentPnlRs?: number;
  currentPnlPct?: number;
  peakPnlRs?: number;

  // Real-Time WebSocket & Ticker Tracking State
  realtimeActive?: boolean;
  lastTickTime?: number;
  lastPnlLogTime?: number;
  lastEmitTime?: number;
  tickerUnsubscribe?: () => void;
}

@Injectable()
export class Breakout15MinEngine {
  private readonly logger = new Logger(Breakout15MinEngine.name);
  private readonly running = new Map<string, StrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
    private readonly tickerService: TickerService,
  ) { }

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) return { executionId: this.running.get(strategyId)!.executionId };

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

    const config: Breakout15MinConfig = JSON.parse(strategy.config);
    const execution = await this.prisma.strategyExecution.create({ data: { strategyId, status: 'RUNNING' } });

    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: true } });

    const state: StrategyState = {
      strategyId,
      executionId: execution.id,
      config,
      brokerAccountId: strategy.brokerAccountId!,
      isPaperTrade: (strategy as any).isPaperTrade,
      futureSymbol: config.instrumentType === 'STOCK' ? config.symbol : null,
      futureExchange: config.instrumentType === 'STOCK' ? config.exchange : 'NFO',
      refHigh: null,
      refLow: null,
      refCandleSet: false,
      entryTriggered: null,
      optionSymbol: null,
      entryOrderId: null,
      slOrderId: null,
      targetOrderId: null,
      setupTimestamp: null,
      tradesPlacedToday: 0,
      logs: [],
      isBreakevenTrailed: false,
      lastBreakoutAttempt: null,
      isReversalTrade: false,
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Dynamic 15-Min Breakout Strategy started — Symbol: ${config.symbol}:${config.exchange} | Mode: ${state.isPaperTrade ? 'PAPER' : 'LIVE'} | Moneyness: ${config.moneyness ?? 'ITM'} | Dynamic ATR: ${config.enableDynamicAtr !== false ? 'ON' : 'OFF'} | Fakeout Reversal: ${config.enableFakeoutReversal !== false ? 'ON' : 'OFF'}`);
    await this.persistLogs(state);

    const timer = setInterval(() => this.tick(strategyId).catch(e => this.logger.error(e)), 60_000);
    this.timers.set(strategyId, timer);

    // Run catch-up first, then start ticking
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

      if (!state.isPaperTrade && (state.entryOrderId || state.slOrderId || state.targetOrderId)) {
        try {
          const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
          if (account?.accessToken) {
            const client = this.factory.createClient(account);
            await this.cancelBrokerOrderSafe(client, state.entryOrderId);
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

      if (!state.isPaperTrade && (state.entryOrderId || state.slOrderId || state.targetOrderId)) {
        try {
          const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
          if (account?.accessToken) {
            const client = this.factory.createClient(account);
            await this.cancelBrokerOrderSafe(client, state.entryOrderId);
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
    const isLong = s.entryTriggered === 'LONG' || !!s.optionSymbol;
    const ltp = s.currentLtp || s.entryPrice || 0;
    const entry = s.entryPrice || 0;
    const pnlPoints = entry > 0 && ltp > 0 ? (isLong ? (ltp - entry) : (entry - ltp)) : 0;
    const calculatedPnlRs = pnlPoints * s.config.qty;
    const calculatedPnlPct = entry > 0 ? (pnlPoints / entry) * 100 : 0;

    return {
      entryTriggered: s.entryTriggered,
      tradesToday: s.tradesPlacedToday,
      optionSymbol: s.optionSymbol,
      futureSymbol: s.futureSymbol || s.config.symbol,
      entryPrice: s.entryPrice,
      currentLtp: ltp,
      stopLossPrice: s.stopLossPrice,
      targetPrice: s.targetPrice,
      pnlRs: s.currentPnlRs !== undefined && s.currentPnlRs !== 0 ? s.currentPnlRs : calculatedPnlRs,
      pnlPct: s.currentPnlPct !== undefined && s.currentPnlPct !== 0 ? s.currentPnlPct : calculatedPnlPct,
      peakPnlRs: s.peakPnlRs ?? 0,
      qty: s.config.qty,
      refHigh: s.refHigh,
      refLow: s.refLow,
      dynamicAtr: s.dynamicAtr,
      isBreakevenTrailed: s.isBreakevenTrailed,
      isPaperTrade: s.isPaperTrade,
    };
  }

  async squareOff(strategyId: string): Promise<{ success: boolean; message: string }> {
    const state = this.running.get(strategyId);
    if (!state) return { success: false, message: 'Strategy is not running' };
    if (!state.entryTriggered) return { success: false, message: 'No active open position to square off' };

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    const client = account?.accessToken ? this.factory.createClient(account) : null;
    const symbol = state.optionSymbol || state.futureSymbol || state.config.symbol;
    const exchange = state.optionSymbol ? (symbol.startsWith('SENSEX') ? 'BFO' : 'NFO') : (state.futureExchange || state.config.exchange);

    let exitPrice = state.currentLtp || state.entryPrice || 0;
    if (client && !state.isPaperTrade) {
      try {
        const ltpData = await client['kite'].getLTP([`${exchange}:${symbol}`]);
        exitPrice = ltpData[`${exchange}:${symbol}`]?.last_price || exitPrice;
      } catch { }
      await this.cancelBrokerOrderSafe(client, state.slOrderId);
      await this.cancelBrokerOrderSafe(client, state.targetOrderId);
      const exitSide = (state.optionSymbol ? 'SELL' : (state.entryTriggered === 'LONG' ? 'SELL' : 'BUY'));
      await client.placeOrder({
        symbol,
        exchange,
        side: exitSide,
        orderType: 'MARKET',
        product: state.config.product,
        qty: state.config.qty,
      }).catch((e: any) => this.log(state, `❌ Square-Off exit order notice: ${e.message}`));
    }

    this.log(state, `⚡ Manual Instant Square-Off requested by user @ ₹${exitPrice.toFixed(2)}`);
    if (state.isPaperTrade) {
      await this.closePaperTrade(state, 'MANUAL_SQUARE_OFF', exitPrice);
    } else {
      state.entryTriggered = null;
      state.entryFilled = false;
      state.slOrderId = null;
      state.targetOrderId = null;
      this.stopRealtimeMonitor(state);
    }
    await this.persistLogs(state);
    return { success: true, message: `Position squared off at ₹${exitPrice.toFixed(2)}` };
  }

  /**
   * Scans today's historical data to see if a breakout already happened before the engine was started.
   */
  private async initialCatchup(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    const now = new Date();
    const hhmm = this.getIstHhmm(now);

    // Only catch up if we are past 9:30 AM IST
    if (hhmm < 9 * 60 + 30) return;

    this.log(state, `🔍 Running initial catch-up for today's data...`);

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    try {
      const todayStr = this.getIstDateStr(now);

      // 1. Resolve Tradable Asset
      if (!state.futureSymbol) {
        const upper = state.config.symbol.toUpperCase().trim();
        const clean = upper.replace(/:NSE|:BSE|:NFO|:BFO/g, '').trim();
        const isIndex = (state.config.instrumentType as string) === 'INDEX' || (state.config.instrumentType as string) === 'OPTION' || clean.includes('NIFTY') || clean.includes('SENSEX') || clean.includes('BANKNIFTY') || clean.includes('FINNIFTY') || clean.includes('MIDCPNIFTY');
        if (isIndex) {
          const res = await this.findFutureSymbol(client, state.config.symbol);
          state.futureSymbol = res.symbol;
          state.futureExchange = res.exchange;
        } else if (state.config.symbol === 'AUTO') {
          const pick = await autoSelectStock(kite, state.config.targetRs, state.config.stopLossRs, this.logger);
          state.futureSymbol = pick.symbol;
          state.futureExchange = pick.exchange;
          state.config.qty = pick.qty;
          this.log(state, `🎯 Auto-Selected Stock: ${state.futureSymbol} (via Smart Pick) - Qty: ${state.config.qty}`);
        } else {
          state.futureSymbol = state.config.symbol;
          state.futureExchange = state.config.exchange;
        }
      }

      // 2. Set Reference Range (Strictly first 15-minute candle OF TODAY)
      const candles15 = await this.fetchCandlesForSymbol(client, state.futureSymbol, '15minute', now, state.futureExchange);
      const today15Candles = candles15.filter(c => this.getIstDateStr(c.date) === todayStr);
      if (today15Candles.length === 0) {
        this.log(state, `⏳ No 15-minute candle formed yet today for ${state.futureSymbol}. Catch-up waiting for range.`);
        await this.persistLogs(state);
        return;
      }

      const ref = today15Candles[0];
      state.refHigh = ref.high;
      state.refLow = ref.low;
      state.refCandleSet = true;
      this.log(state, `📊 (Catch-up) Reference Range Set — H: ₹${ref.high} | L: ₹${ref.low} (Range: ₹${(ref.high - ref.low).toFixed(2)})`);

      // 3. Scan 5-min candles for breakout (STRICTLY FROM TODAY after 9:30 AM)
      const candles5 = await this.fetchCandlesForSymbol(client, state.futureSymbol, '5minute', now, state.futureExchange);
      const today5Candles = candles5.filter(c => this.getIstDateStr(c.date) === todayStr);
      const breakoutCandidates = today5Candles.filter(c => this.getIstHhmm(new Date(c.date)) >= 9 * 60 + 30);

      const atrs = this.calculateATR(candles5, state.config.atrPeriod ?? 14);
      const currentAtr = atrs[atrs.length - 1] || Math.max(1, (state.refHigh - state.refLow) * 0.5);
      state.dynamicAtr = currentAtr;

      const buffer = (state.config.enableDynamicAtr !== false) ? Math.max(0.05, currentAtr * (state.config.atrBufferMultiplier ?? 0.15)) : 0;
      const vwaps = this.calculateVWAP(candles5);
      const ema9 = this.calculateEMA(candles5, 9);
      const ema21 = this.calculateEMA(candles5, 21);

      let optionCandles: Candle[] = [];
      let optionCandleSymbol = '';

      for (let k = 0; k < breakoutCandidates.length; k++) {
        if (state.tradesPlacedToday >= state.config.maxTradesPerDay) {
          this.log(state, `⛔ (Catch-up) Max daily trade cap (${state.config.maxTradesPerDay}) reached.`);
          break;
        }

        const currentCandle = breakoutCandidates[k];
        const candleIdxInFull = candles5.findIndex(c => c.date.getTime() === new Date(currentCandle.date).getTime());

        if (state.entryTriggered) {
          const candleTimeMs = new Date(currentCandle.date).getTime();
          let currentOptionPriceLow = 0;
          let currentOptionPriceHigh = 0;
          let currentOptionPriceClose = 0;
          let hasOptionData = false;

          if (state.optionSymbol) {
            if (optionCandleSymbol !== state.optionSymbol) {
              const exchange = state.optionSymbol.includes('-') || state.optionSymbol.startsWith('NIFTY') || state.optionSymbol.startsWith('BANKNIFTY') || state.optionSymbol.startsWith('FINNIFTY') || state.optionSymbol.startsWith('MIDCPNIFTY') || state.optionSymbol.startsWith('SENSEX') ? (state.optionSymbol.startsWith('SENSEX') ? 'BFO' : 'NFO') : state.futureExchange;
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

            const optCandle = optionCandles.find(c => c.date.getTime() === candleTimeMs);
            if (optCandle) {
              currentOptionPriceLow = optCandle.low;
              currentOptionPriceHigh = optCandle.high;
              currentOptionPriceClose = optCandle.close;
              hasOptionData = true;
            }
          } else {
            currentOptionPriceLow = currentCandle.low;
            currentOptionPriceHigh = currentCandle.high;
            currentOptionPriceClose = currentCandle.close;
            hasOptionData = true;
          }

          if (hasOptionData) {
            const evalClose = currentOptionPriceClose || currentCandle.close;
            state.currentLtp = evalClose;
            const isOption = !!state.optionSymbol;
            const isLong = isOption || state.entryTriggered === 'LONG';
            const closePnlPoints = isLong ? (evalClose - state.entryPrice!) : (state.entryPrice! - evalClose);
            state.currentPnlRs = closePnlPoints * state.config.qty;
            state.currentPnlPct = state.entryPrice ? (closePnlPoints / state.entryPrice) * 100 : 0;
            state.peakPnlRs = Math.max(state.peakPnlRs || 0, state.currentPnlRs);

            // Check Dynamic Breakeven Ratchet (+1R -> SL to Cost)
            const evalHighPrice = isLong ? currentOptionPriceHigh : currentOptionPriceLow;
            const currentPnlPoints = isLong ? (evalHighPrice - state.entryPrice!) : (state.entryPrice! - evalHighPrice);
            const breakevenPoints = (state.initialRiskPoints ?? 5) * (state.config.breakevenTriggerR ?? 1.0);

            if (!state.isBreakevenTrailed && currentPnlPoints >= breakevenPoints && state.entryPrice) {
              state.stopLossPrice = state.entryPrice;
              state.isBreakevenTrailed = true;
              this.log(state, `🛡 (Catch-up Protection) Position reached +${(state.config.breakevenTriggerR ?? 1).toFixed(1)}R profit! Trailed SL to COST (₹${state.entryPrice.toFixed(2)}) — Risk-Free!`);
            }

            const orders = await this.prisma.order.findMany({
              where: { executionId: state.executionId, status: 'OPEN' }
            });
            const slOrder = orders.find(o => o.orderType === 'SL');
            const targetOrder = orders.find(o => o.orderType === 'LIMIT' && o.brokerOrderId.includes('TARGET'));

            const effectiveSl = state.stopLossPrice || (slOrder ? slOrder.price! : 0);

            const isHitSL = isLong
              ? (effectiveSl && currentOptionPriceLow <= effectiveSl)
              : (effectiveSl && currentOptionPriceHigh >= effectiveSl);

            const isHitTarget = isLong
              ? (targetOrder && currentOptionPriceHigh >= targetOrder.price!)
              : (targetOrder && currentOptionPriceLow <= targetOrder.price!);

            if (isHitSL) {
              this.log(state, `🔴 (Catch-up) PAPER SL HIT! ${state.optionSymbol || state.futureSymbol || state.config.symbol} at ₹${effectiveSl}`);
              await this.closePaperTradeHistorical(state, 'SL_HIT', effectiveSl, new Date(currentCandle.date));
              
              // Record failed breakout for Fakeout Reversal monitoring
              state.lastBreakoutAttempt = {
                side: state.entryTriggered,
                timestamp: new Date(currentCandle.date).getTime(),
                failed: true,
                breakoutPrice: state.entryPrice || 0
              };
              this.log(state, `⚠ (Catch-up) Flagged ${state.entryTriggered} breakout as FAILED. Monitoring for Liquidity Trap Reversal.`);

              optionCandles = [];
              optionCandleSymbol = '';
              continue;
            }
            if (isHitTarget) {
              this.log(state, `🟢 (Catch-up) PAPER TARGET HIT! ${state.optionSymbol || state.futureSymbol || state.config.symbol} at ₹${targetOrder!.price}`);
              await this.closePaperTradeHistorical(state, 'TARGET_HIT', targetOrder!.price!, new Date(currentCandle.date));
              optionCandles = [];
              optionCandleSymbol = '';
              continue;
            }

            // 3:05 PM Intraday EOD Cutoff in Catch-up
            const candleHhmm = this.getIstHhmm(new Date(currentCandle.date));
            if (candleHhmm >= 15 * 60 + 5) {
              const exitPrice = currentOptionPriceClose || currentCandle.close;
              this.log(state, `⏰ (Catch-up) 3:05 PM EOD Cutoff reached on ${this.formatTime(new Date(currentCandle.date))}! Auto-squaring off position at ₹${exitPrice.toFixed(2)}`);
              await this.closePaperTradeHistorical(state, 'EOD_CUTOFF_3_05_PM', exitPrice, new Date(currentCandle.date));
              optionCandles = [];
              optionCandleSymbol = '';
              continue;
            }
          }
          continue;
        }

        // Check if this candle is closed (at least 5 mins passed since its start)
        const candleStart = new Date(currentCandle.date).getTime();
        if ((now.getTime() - candleStart) < 5 * 60 * 1000) continue;

        // ─── Fakeout Reversal Check in Catch-up ──────────────────────────────
        if (state.config.enableFakeoutReversal !== false && state.lastBreakoutAttempt?.failed && !state.entryTriggered) {
          if (state.lastBreakoutAttempt.side === 'LONG' && currentCandle.close < state.refLow!) {
            this.log(state, `⚡ (Catch-up) BULL TRAP DETECTED! Long breakout failed and price plunged below ₹${state.refLow}. Triggering SHORT Reversal Trade!`);
            state.lastBreakoutAttempt = null;
            state.isReversalTrade = true;
            await this.placeBreakoutTrade(strategyId, state, client, account, 'SELL', currentCandle.close, new Date(currentCandle.date), state.refLow, state.refHigh);
            continue;
          } else if (state.lastBreakoutAttempt.side === 'SHORT' && currentCandle.close > state.refHigh!) {
            this.log(state, `⚡ (Catch-up) BEAR TRAP DETECTED! Short breakdown failed and price broke above ₹${state.refHigh}. Triggering LONG Reversal Trade!`);
            state.lastBreakoutAttempt = null;
            state.isReversalTrade = true;
            await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', currentCandle.close, new Date(currentCandle.date), state.refLow, state.refHigh);
            continue;
          }
        }

        // ─── Regular Dynamic Breakout Check ─────────────────────────────────
        const curVwap = candleIdxInFull >= 0 ? vwaps[candleIdxInFull] : null;
        const curEma9 = candleIdxInFull >= 0 ? ema9[candleIdxInFull] : null;
        const curEma21 = candleIdxInFull >= 0 ? ema21[candleIdxInFull] : null;

        if (currentCandle.close > (state.refHigh! + buffer)) {
          const isVwapOk = state.config.enableVwapFilter === false || !curVwap || currentCandle.close >= curVwap;
          const isEmaOk = !curEma9 || !curEma21 || curEma9 >= curEma21;

          if (isVwapOk && isEmaOk) {
            this.log(state, `🚀 (Catch-up) Dynamic BREAKOUT! 5-min candle (${this.formatTime(new Date(currentCandle.date))}) closed at ₹${currentCandle.close} > ₹${(state.refHigh! + buffer).toFixed(2)} (ATR: ₹${currentAtr.toFixed(2)})`);
            await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', currentCandle.close, new Date(currentCandle.date), state.refLow, state.refHigh);
          }
        } else if (currentCandle.close < (state.refLow! - buffer)) {
          const isVwapOk = state.config.enableVwapFilter === false || !curVwap || currentCandle.close <= curVwap;
          const isEmaOk = !curEma9 || !curEma21 || curEma9 <= curEma21;

          if (isVwapOk && isEmaOk) {
            this.log(state, `🚀 (Catch-up) Dynamic BREAKDOWN! 5-min candle (${this.formatTime(new Date(currentCandle.date))}) closed at ₹${currentCandle.close} < ₹${(state.refLow! - buffer).toFixed(2)} (ATR: ₹${currentAtr.toFixed(2)})`);
            await this.placeBreakoutTrade(strategyId, state, client, account, 'SELL', currentCandle.close, new Date(currentCandle.date), state.refLow, state.refHigh);
          }
        }
      }

      if (!state.entryTriggered) {
        this.log(state, `✅ Catch-up complete. No active breakout position at this time.`);
      } else {
        const activeSym = state.optionSymbol || state.futureSymbol || state.config.symbol;
        const activeExch = state.optionSymbol ? (activeSym.startsWith('SENSEX') ? 'BFO' : 'NFO') : (state.futureExchange || state.config.exchange);
        try {
          const quotes = await kite.getLTP([`${activeExch}:${activeSym}`]);
          const latestLtp = quotes[`${activeExch}:${activeSym}`]?.last_price;
          if (latestLtp) {
            state.currentLtp = latestLtp;
            const isOption = !!state.optionSymbol;
            const isLong = isOption || state.entryTriggered === 'LONG';
            const pnlPoints = isLong ? (latestLtp - state.entryPrice!) : (state.entryPrice! - latestLtp);
            state.currentPnlRs = pnlPoints * state.config.qty;
            state.currentPnlPct = state.entryPrice ? (pnlPoints / state.entryPrice) * 100 : 0;
            state.peakPnlRs = Math.max(state.peakPnlRs || 0, state.currentPnlRs);
            this.log(state, `📊 Active Position Tracked: ${activeSym} | Entry: ₹${state.entryPrice?.toFixed(2)} | Current LTP: ₹${latestLtp.toFixed(2)} | P&L: ${state.currentPnlRs >= 0 ? '+' : ''}₹${state.currentPnlRs.toFixed(2)} (${state.currentPnlPct >= 0 ? '+' : ''}${state.currentPnlPct.toFixed(2)}%)`);
          }
        } catch (e: any) {
          this.logger.debug?.(`Catch-up latest LTP fetch notice: ${e.message}`);
        }

        // Always activate real-time tracking if position is open
        await this.startRealtimeMonitor(state, client);
      }
      await this.persistLogs(state);
    } catch (err: any) {
      this.log(state, `⚠ Catch-up failed: ${err.message}`);
      await this.persistLogs(state);
    }
  }

  private async cancelBrokerOrderSafe(client: any, orderId: string | null) {
    if (!orderId || orderId.startsWith('PAPER_') || orderId === 'FAILED') return;
    try {
      await client.cancelOrder(orderId);
      this.logger.log(`Cancelled order: ${orderId}`);
    } catch (err: any) {
      this.logger.debug?.(`Cancel order ${orderId} notice: ${err?.message || err}`);
    }
  }

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    const now = new Date();
    const hhmm = this.getIstHhmm(now);

    if (hhmm < 9 * 60 + 15 || hhmm >= 15 * 60 + 30) {
      if (hhmm < 9 * 60 + 15) this.resetDailyState(state);
      if (state.entryTriggered) {
        try {
          const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
          if (account?.accessToken) {
            const client = this.factory.createClient(account);
            const kite = client['kite'];
            const activeSym = state.optionSymbol || state.futureSymbol || state.config.symbol;
            const activeExch = state.optionSymbol ? (activeSym.startsWith('SENSEX') ? 'BFO' : 'NFO') : (state.futureExchange || state.config.exchange);
            const quotes = await kite.getLTP([`${activeExch}:${activeSym}`]);
            const latestLtp = quotes[`${activeExch}:${activeSym}`]?.last_price;
            if (latestLtp) {
              state.currentLtp = latestLtp;
              const isOption = !!state.optionSymbol;
              const isLong = isOption || state.entryTriggered === 'LONG';
              const pnlPoints = isLong ? (latestLtp - state.entryPrice!) : (state.entryPrice! - latestLtp);
              state.currentPnlRs = pnlPoints * state.config.qty;
              state.currentPnlPct = state.entryPrice ? (pnlPoints / state.entryPrice) * 100 : 0;
              state.peakPnlRs = Math.max(state.peakPnlRs || 0, state.currentPnlRs);
            }
          }
        } catch {}
      }
      return;
    }

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'];
    const { config } = state;
    const todayStr = this.getIstDateStr(now);

    if (!state.futureSymbol) {
      const upper = config.symbol.toUpperCase().trim();
      const clean = upper.replace(/:NSE|:BSE|:NFO|:BFO/g, '').trim();
      const isIndex = (config.instrumentType as string) === 'INDEX' || (config.instrumentType as string) === 'OPTION' || clean.includes('NIFTY') || clean.includes('SENSEX') || clean.includes('BANKNIFTY') || clean.includes('FINNIFTY') || clean.includes('MIDCPNIFTY');
      if (isIndex) {
        try {
          const res = await this.findFutureSymbol(client, config.symbol);
          state.futureSymbol = res.symbol;
          state.futureExchange = res.exchange;
          this.log(state, `🔎 Resolved Future: ${state.futureExchange}:${state.futureSymbol}`);
        } catch (err: any) {
          this.log(state, `❌ Resolve Error: ${err.message}`);
          await this.persistLogs(state);
          return;
        }
      } else if (config.symbol === 'AUTO') {
        try {
          const pick = await autoSelectStock(kite, config.targetRs, config.stopLossRs, this.logger);
          state.futureSymbol = pick.symbol;
          state.futureExchange = pick.exchange;
          state.config.qty = pick.qty;
          this.log(state, `🎯 Auto-Selected Stock: ${state.futureExchange}:${state.futureSymbol} - Qty: ${state.config.qty}`);
        } catch (err: any) {
          this.log(state, `❌ Auto-Select Error: ${err.message}`);
          await this.persistLogs(state);
          return;
        }
      } else {
        state.futureSymbol = config.symbol;
        state.futureExchange = config.exchange;
        this.log(state, `📈 Equity Stock: ${config.exchange}:${config.symbol}`);
      }
    }

    if (!state.refCandleSet) {
      if (hhmm < 9 * 60 + 30) {
        this.log(state, `⏳ Waiting for 15-min Future range (Current: ${this.formatTime(now)})`);
        await this.persistLogs(state);
        return;
      }
      try {
        const candles15 = await this.fetchCandlesForSymbol(client, state.futureSymbol, '15minute', now, state.futureExchange);
        const today15Candles = candles15.filter(c => this.getIstDateStr(c.date) === todayStr);
        if (today15Candles.length > 0) {
          const ref = today15Candles[0];
          state.refHigh = ref.high;
          state.refLow = ref.low;
          state.refCandleSet = true;
          this.log(state, `📊 FUTURE Range Set — H: ₹${ref.high} | L: ₹${ref.low} (Range: ₹${(ref.high - ref.low).toFixed(2)})`);
        }
      } catch (err: any) {
        this.log(state, `❌ 15-min error: ${err.message}`);
        await this.persistLogs(state);
        return;
      }
    }

    // ─── 3:05 PM EOD Auto Square Off (NSE CAS Settlement & Broker Safe Exit) ──
    if (hhmm >= 15 * 60 + 5) {
      if (state.entryTriggered) {
        this.log(state, `⏰ 3:05 PM Intraday EOD cutoff reached! Auto-squaring off position.`);
        if (state.isPaperTrade) {
          const quotes = await kite.getLTP([`${state.futureExchange}:${state.optionSymbol || state.futureSymbol}`]).catch(() => ({}));
          const ltp = quotes[`${state.futureExchange}:${state.optionSymbol || state.futureSymbol}`]?.last_price || state.entryPrice || 0;
          await this.closePaperTrade(state, 'CAS_CUTOFF_3_05_PM', ltp);
        } else {
          await this.cancelBrokerOrderSafe(client, state.slOrderId);
          await this.cancelBrokerOrderSafe(client, state.targetOrderId);
          const exitSymbol = state.optionSymbol || state.futureSymbol || state.config.symbol;
          const exitExchange = state.optionSymbol ? (exitSymbol.startsWith('SENSEX') ? 'BFO' : 'NFO') : (state.futureExchange || state.config.exchange);
          const exitSide = state.optionSymbol ? 'SELL' : (state.entryTriggered === 'LONG' ? 'SELL' : 'BUY');
          await client.placeOrder({
            symbol: exitSymbol,
            exchange: exitExchange,
            side: exitSide,
            orderType: 'MARKET',
            product: state.config.product,
            qty: state.config.qty,
          }).catch((e: any) => this.log(state, `❌ 3:05 PM EOD exit order failed: ${e.message}`));
          state.entryTriggered = null;
          state.entryFilled = false;
          state.slOrderId = null;
          state.targetOrderId = null;
          this.stopRealtimeMonitor(state);
        }
      }
      await this.persistLogs(state);
      return;
    }

    // ─── Paper/Real Trade Monitoring (safety polling loop) ────
    if (state.entryTriggered) {
      try {
        if (state.isPaperTrade) {
          await this.monitorPaperTrade(state, kite);
        } else {
          await this.monitorRealTrade(state, client);
        }
      } catch (err: any) { this.log(state, `❌ Monitor error: ${err.message}`); }
      await this.persistLogs(state);
      return;
    }

    // ─── Breakout Scanning (only when no active trade) ────────────────────────
    if (state.tradesPlacedToday >= config.maxTradesPerDay) {
      this.log(state, `⛔ Max daily trade cap (${config.maxTradesPerDay}) reached.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'COMPLETED', `⛔ Auto-Stopped: Max daily trade cap reached`);
      return;
    }

    try {
      const futureKey = `${state.futureExchange}:${state.futureSymbol}`;
      const ltpData = await kite.getLTP([futureKey]);
      const currentPrice = ltpData[futureKey]?.last_price;
      if (!currentPrice) { await this.persistLogs(state); return; }

      const candles5 = await this.fetchCandlesForSymbol(client, state.futureSymbol, '5minute', now, state.futureExchange);
      const today5Candles = candles5.filter(c => this.getIstDateStr(c.date) === todayStr);
      const breakoutCandidates = today5Candles.filter(c => this.getIstHhmm(new Date(c.date)) >= 9 * 60 + 30);
      if (breakoutCandidates.length === 0) { await this.persistLogs(state); return; }

      const lastCandle = breakoutCandidates[breakoutCandidates.length - 1];
      const isClosed = (now.getTime() - new Date(lastCandle.date).getTime()) >= 5 * 60 * 1000;
      const target = isClosed ? lastCandle : (breakoutCandidates.length > 1 ? breakoutCandidates[breakoutCandidates.length - 2] : null);
      if (!target) { await this.persistLogs(state); return; }

      // ─── Dynamic Indicator Computations (ATR, VWAP, EMA) ───────────────────
      const atrs = this.calculateATR(candles5, config.atrPeriod ?? 14);
      const currentAtr = atrs[atrs.length - 1] || Math.max(1, (state.refHigh! - state.refLow!) * 0.5);
      state.dynamicAtr = currentAtr;

      const buffer = (config.enableDynamicAtr !== false) ? Math.max(0.05, currentAtr * (config.atrBufferMultiplier ?? 0.15)) : 0;
      const vwaps = this.calculateVWAP(candles5);
      const currentVwap = vwaps[vwaps.length - 1];
      const ema9 = this.calculateEMA(candles5, 9);
      const ema21 = this.calculateEMA(candles5, 21);
      const curEma9 = ema9[ema9.length - 1];
      const curEma21 = ema21[ema21.length - 1];

      // Periodic scanning heartbeat
      if (hhmm % 5 === 0 && !state.logs.some(l => l.includes(`Scanning for breakout`) && l.includes(`LTP: ₹${currentPrice}`))) {
        const activeSym = state.futureSymbol || config.symbol;
        this.log(state, `[${activeSym}] 👀 Scanning for breakout (LTP: ₹${currentPrice}) — Range: ₹${state.refLow} to ₹${state.refHigh} | ATR: ₹${currentAtr.toFixed(2)} | Buffer: ±₹${buffer.toFixed(2)}`);
      }

      // ─── 1. DYNAMIC FAKEOUT REVERSAL (LIQUIDITY TRAP CAPTURE) ──────────────
      if (config.enableFakeoutReversal !== false && state.lastBreakoutAttempt?.failed && !state.entryTriggered) {
        if (state.lastBreakoutAttempt.side === 'LONG' && target.close < state.refLow!) {
          this.log(state, `⚡ BULL TRAP DETECTED! Long breakout failed and price plunged below 15-min low (₹${state.refLow}). Reversing to SHORT to capture trapped buyer liquidations!`);
          state.lastBreakoutAttempt = null;
          state.isReversalTrade = true;
          await this.placeBreakoutTrade(strategyId, state, client, account, 'SELL', currentPrice, undefined, state.refLow, state.refHigh);
          await this.persistLogs(state);
          return;
        } else if (state.lastBreakoutAttempt.side === 'SHORT' && target.close > state.refHigh!) {
          this.log(state, `⚡ BEAR TRAP DETECTED! Short breakdown failed and price surged above 15-min high (₹${state.refHigh}). Reversing to LONG to capture trapped short-covering!`);
          state.lastBreakoutAttempt = null;
          state.isReversalTrade = true;
          await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', currentPrice, undefined, state.refLow, state.refHigh);
          await this.persistLogs(state);
          return;
        }
      }

      // ─── 2. VOLUME & CANDLE STRENGTH VALIDATION ────────────────────────────
      let isVolumeConfirmed = true;
      if (config.enableVolumeFilter !== false && breakoutCandidates.length > 1) {
        const totalVol = breakoutCandidates.reduce((acc, c) => acc + c.volume, 0);
        const avgVol = totalVol / breakoutCandidates.length;
        isVolumeConfirmed = target.volume >= (avgVol * (config.minRvol ?? 1.2));
      }

      const candleRange = Math.max(0.01, target.high - target.low);
      const isStrongBull = (target.close - target.low) / candleRange >= 0.60;
      const isStrongBear = (target.high - target.close) / candleRange >= 0.60;

      // ─── 3. DYNAMIC LONG BREAKOUT ──────────────────────────────────────────
      if (target.close > (state.refHigh! + buffer)) {
        const isVwapOk = config.enableVwapFilter === false || !currentVwap || target.close >= currentVwap;
        const isEmaOk = !curEma9 || !curEma21 || curEma9 >= curEma21;

        if (!isVolumeConfirmed) {
          this.log(state, `⏳ Breakout above ₹${state.refHigh} detected, but volume (${target.volume}) is below required ${(config.minRvol ?? 1.2)}x threshold. Skipping weak breakout.`);
        } else if (!isStrongBull) {
          this.log(state, `⏳ Breakout candle closed with long upper wick (weak close). Skipping potential false breakout.`);
        } else if (!isVwapOk || !isEmaOk) {
          this.log(state, `⏳ Breakout above ₹${state.refHigh} conflicts with VWAP/EMA trend. Skipping counter-trend trade.`);
        } else {
          this.log(state, `🚀 DYNAMIC BREAKOUT! 5-min (${this.formatTime(new Date(target.date))}) closed at ₹${target.close} > ₹${(state.refHigh! + buffer).toFixed(2)} (ATR: ₹${currentAtr.toFixed(2)}, Vol: ${target.volume})`);
          await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', currentPrice, undefined, state.refLow, state.refHigh);
        }
      }
      // ─── 4. DYNAMIC SHORT BREAKDOWN ────────────────────────────────────────
      else if (target.close < (state.refLow! - buffer)) {
        const isVwapOk = config.enableVwapFilter === false || !currentVwap || target.close <= currentVwap;
        const isEmaOk = !curEma9 || !curEma21 || curEma9 <= curEma21;

        if (!isVolumeConfirmed) {
          this.log(state, `⏳ Breakdown below ₹${state.refLow} detected, but volume (${target.volume}) is below required ${(config.minRvol ?? 1.2)}x threshold. Skipping weak breakdown.`);
        } else if (!isStrongBear) {
          this.log(state, `⏳ Breakdown candle closed with long lower wick (weak close). Skipping potential false breakdown.`);
        } else if (!isVwapOk || !isEmaOk) {
          this.log(state, `⏳ Breakdown below ₹${state.refLow} conflicts with VWAP/EMA trend. Skipping counter-trend trade.`);
        } else {
          this.log(state, `🚀 DYNAMIC BREAKDOWN! 5-min (${this.formatTime(new Date(target.date))}) closed at ₹${target.close} < ₹${(state.refLow! - buffer).toFixed(2)} (ATR: ₹${currentAtr.toFixed(2)}, Vol: ${target.volume})`);
          await this.placeBreakoutTrade(strategyId, state, client, account, 'SELL', currentPrice, undefined, state.refLow, state.refHigh);
        }
      }
    } catch (err: any) { this.log(state, `❌ Tick error: ${err.message}`); }

    await this.persistLogs(state);
  }

  // ─── Real-Time WebSocket Position Monitoring (Sub-Second Ticks) ────────────
  private async startRealtimeMonitor(state: StrategyState, client: any) {
    if (!state.entryTriggered) return;

    const symbol = state.optionSymbol || state.futureSymbol || state.config.symbol;
    const exchange = state.optionSymbol ? (symbol.startsWith('SENSEX') ? 'BFO' : 'NFO') : (state.futureExchange || state.config.exchange);

    try {
      await this.tickerService.subscribeSymbol(state.brokerAccountId, symbol);
      this.log(state, `📡 Live tracking activated for ${exchange}:${symbol}`);
    } catch (e: any) {
      this.log(state, `⚠ WebSocket subscribe notice: ${e.message}. Polling active.`);
    }

    state.realtimeActive = true;
    let isExiting = false;

    const unsubscribe = this.tickerService.registerListener(async (ticks) => {
      const currentPrice = ticks[symbol] || ticks[`${exchange}:${symbol}`] || ticks[`NFO:${symbol}`] || ticks[`NSE:${symbol}`] || ticks[`BFO:${symbol}`];
      if (!currentPrice || !state.entryTriggered || isExiting) return;

      const now = Date.now();
      state.lastTickTime = now;
      state.currentLtp = currentPrice;

      const isOption = !!state.optionSymbol;
      const isLong = isOption || state.entryTriggered === 'LONG';
      const pnlPoints = isLong ? (currentPrice - state.entryPrice!) : (state.entryPrice! - currentPrice);
      const pnlRs = pnlPoints * state.config.qty;
      const pnlPct = state.entryPrice ? (pnlPoints / state.entryPrice) * 100 : 0;

      state.currentPnlRs = pnlRs;
      state.currentPnlPct = pnlPct;
      state.peakPnlRs = Math.max(state.peakPnlRs || 0, pnlRs);

      // ── 1. 3:05 PM Mandatory EOD Cutoff ──
      const currentHhmm = this.getIstHhmm(new Date());
      if (currentHhmm >= 15 * 60 + 5 && state.entryTriggered) {
        if (isExiting) return;
        isExiting = true;
        this.log(state, `⏰ 3:05 PM Intraday EOD Cutoff reached! Auto-squaring off position (Current P&L: ₹${pnlRs.toFixed(2)})...`);
        this.stopRealtimeMonitor(state);
        await this.squareOff(state.strategyId);
        await this.persistLogs(state);
        return;
      }

      // ── 2. Breakeven Lock (+1R -> SL to Cost) ──
      const breakevenPoints = (state.initialRiskPoints ?? 5) * (state.config.breakevenTriggerR ?? 1.0);
      if (state.config.enableBreakevenTrail !== false && !state.isBreakevenTrailed && pnlPoints >= breakevenPoints && state.entryPrice) {
        state.stopLossPrice = state.entryPrice;
        state.isBreakevenTrailed = true;
        if (state.isPaperTrade) {
          await this.prisma.order.updateMany({
            where: { executionId: state.executionId, isPaperTrade: true, orderType: 'SL', status: 'OPEN' },
            data: { price: state.entryPrice, triggerPrice: state.entryPrice }
          });
        } else if (client.modifyOrder && state.slOrderId && state.slOrderId !== 'FAILED') {
          await client.modifyOrder(state.slOrderId, { price: state.entryPrice, triggerPrice: state.entryPrice }).catch((e: any) => {
            this.log(state, `⚠ Live SL modify notice: ${e.message}`);
          });
          await this.prisma.order.updateMany({
            where: { executionId: state.executionId, brokerOrderId: state.slOrderId! },
            data: { price: state.entryPrice, triggerPrice: state.entryPrice }
          });
        }
        this.log(state, `🛡 (Dynamic Protection) Position reached +${(state.config.breakevenTriggerR ?? 1).toFixed(1)}R profit! Trailed SL to COST (₹${state.entryPrice.toFixed(2)}) — Risk-Free!`);
      }

      // ── 3. Dynamic Trailing SL ──
      if (state.config.enableTrailingSl !== false && state.isBreakevenTrailed) {
        if (isLong) {
          state.highestPriceReached = Math.max(state.highestPriceReached || currentPrice, currentPrice);
          const trailDist = (state.initialRiskPoints ?? 5) * 0.8;
          const newSl = this.roundTick(state.highestPriceReached - trailDist);
          if (newSl > (state.stopLossPrice || 0)) {
            state.stopLossPrice = newSl;
            if (state.isPaperTrade) {
              await this.prisma.order.updateMany({
                where: { executionId: state.executionId, isPaperTrade: true, orderType: 'SL', status: 'OPEN' },
                data: { price: newSl, triggerPrice: newSl }
              });
            }
            this.log(state, `📈 (Dynamic Trailing) High ₹${state.highestPriceReached.toFixed(2)}. Trailed SL to ₹${newSl.toFixed(2)} to lock in gains.`);
          }
        }
      }

      // ── 4. Check SL & Target Hits for Paper Trade ──
      if (state.isPaperTrade) {
        const isHitSL = isLong ? (currentPrice <= (state.stopLossPrice || 0)) : (currentPrice >= (state.stopLossPrice || Infinity));
        const isHitTarget = isLong ? (state.targetPrice && currentPrice >= state.targetPrice) : (state.targetPrice && currentPrice <= state.targetPrice);

        if (isHitSL) {
          if (isExiting) return;
          isExiting = true;
          this.log(state, `🔴 PAPER SL HIT! ${symbol} at ₹${currentPrice.toFixed(2)} (Trigger: ₹${(state.stopLossPrice || 0).toFixed(2)}) | Final P&L: ₹${pnlRs.toFixed(2)}`);
          this.stopRealtimeMonitor(state);
          await this.closePaperTrade(state, 'SL_HIT', currentPrice);
          state.lastBreakoutAttempt = {
            side: state.entryTriggered!,
            timestamp: Date.now(),
            failed: true,
            breakoutPrice: state.entryPrice || 0
          };
          this.log(state, `⚠ Flagged ${state.entryTriggered} breakout as FAILED. Monitoring for Liquidity Trap Reversal.`);
          await this.persistLogs(state);
          return;
        }

        if (isHitTarget) {
          if (isExiting) return;
          isExiting = true;
          this.log(state, `🟢 PAPER TARGET HIT! ${symbol} at ₹${currentPrice.toFixed(2)} (Target: ₹${state.targetPrice!.toFixed(2)}) | Final P&L: ₹${pnlRs.toFixed(2)}`);
          this.stopRealtimeMonitor(state);
          await this.closePaperTrade(state, 'TARGET_HIT', currentPrice);
          state.lastBreakoutAttempt = null;
          await this.persistLogs(state);
          return;
        }
      }

      // ── Real-Time WebSocket State Broadcast (500ms throttle) ──
      if (now - (state.lastEmitTime || 0) >= 500) {
        state.lastEmitTime = now;
        strategyEvents.emit('strategy.update', {
          strategyId: state.strategyId,
          logs: state.logs,
          state: this.getState(state.strategyId),
        });
      }

      // ── Throttled Live P&L Logging (every 15 seconds) ──
      if (now - (state.lastPnlLogTime || 0) >= 15000) {
        state.lastPnlLogTime = now;
        const sign = pnlRs >= 0 ? '+' : '';
        const pctSign = pnlPct >= 0 ? '+' : '';
        this.log(state, `📊 [LIVE P&L] ${symbol}: ₹${currentPrice.toFixed(2)} | Entry: ₹${state.entryPrice!.toFixed(2)} | SL: ₹${state.stopLossPrice!.toFixed(2)} | Tgt: ₹${state.targetPrice!.toFixed(2)} | P&L: ${sign}₹${pnlRs.toFixed(2)} (${pctSign}${pnlPct.toFixed(2)}%) | Peak: +₹${(state.peakPnlRs || 0).toFixed(2)}`);
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

  private async monitorPaperTrade(state: StrategyState, kite: any) {
    if (!state.entryTriggered) return;

    try {
      const orders = await this.prisma.order.findMany({
        where: { executionId: state.executionId, isPaperTrade: true, status: 'OPEN' }
      });
      if (orders.length === 0) return;

      const symbol = orders[0].symbol;
      const exchange = orders[0].exchange;
      const quotes = await kite.getLTP([`${exchange}:${symbol}`]);
      const ltp = quotes[`${exchange}:${symbol}`]?.last_price;
      if (!ltp) return;

      state.currentLtp = ltp;
      const isLong = state.entryTriggered === 'LONG' || !!state.optionSymbol;
      const currentPnlPoints = isLong ? (ltp - state.entryPrice!) : (state.entryPrice! - ltp);
      const pnlRs = currentPnlPoints * state.config.qty;
      const pnlPct = state.entryPrice ? (currentPnlPoints / state.entryPrice) * 100 : 0;
      state.currentPnlRs = pnlRs;
      state.currentPnlPct = pnlPct;
      state.peakPnlRs = Math.max(state.peakPnlRs || 0, pnlRs);

      const breakevenPoints = (state.initialRiskPoints ?? 5) * (state.config.breakevenTriggerR ?? 1.0);

      // ─── Dynamic Breakeven Shield (+1R -> SL to Cost) ──────────────────────
      if (state.config.enableBreakevenTrail !== false && !state.isBreakevenTrailed && currentPnlPoints >= breakevenPoints && state.entryPrice) {
        state.stopLossPrice = state.entryPrice;
        state.isBreakevenTrailed = true;
        await this.prisma.order.updateMany({
          where: { executionId: state.executionId, isPaperTrade: true, orderType: 'SL', status: 'OPEN' },
          data: { price: state.entryPrice, triggerPrice: state.entryPrice }
        });
        this.log(state, `🛡 (Dynamic Protection) Position reached +${(state.config.breakevenTriggerR ?? 1).toFixed(1)}R profit (+₹${currentPnlPoints.toFixed(2)} pts)! Trailed SL to COST (₹${state.entryPrice.toFixed(2)}) — Risk-Free Trade!`);
      }

      // ─── Dynamic Trailing SL ───────────────────────────────────────────────
      if (state.config.enableTrailingSl !== false && state.isBreakevenTrailed) {
        if (isLong) {
          state.highestPriceReached = Math.max(state.highestPriceReached || ltp, ltp);
          const trailDist = (state.initialRiskPoints ?? 5) * 0.8;
          const newSl = this.roundTick(state.highestPriceReached - trailDist);
          if (newSl > (state.stopLossPrice || 0)) {
            state.stopLossPrice = newSl;
            await this.prisma.order.updateMany({
              where: { executionId: state.executionId, isPaperTrade: true, orderType: 'SL', status: 'OPEN' },
              data: { price: newSl, triggerPrice: newSl }
            });
            this.log(state, `📈 (Dynamic Trailing) High ₹${state.highestPriceReached.toFixed(2)}. Trailed SL to ₹${newSl.toFixed(2)} to lock in gains.`);
          }
        }
      }

      for (const order of orders) {
        if (order.orderType === 'SL') {
          const hit = order.side === 'SELL' ? (ltp <= (state.stopLossPrice || order.triggerPrice!)) : (ltp >= (state.stopLossPrice || order.triggerPrice!));
          if (hit) {
            const exitP = state.stopLossPrice || order.triggerPrice!;
            this.log(state, `🔴 PAPER SL HIT! ${symbol} at ₹${ltp} (Trigger: ₹${exitP}) | Final P&L: ₹${pnlRs.toFixed(2)}`);
            await this.closePaperTrade(state, 'SL_HIT', ltp);

            // Record failed breakout for Fakeout Reversal monitoring
            state.lastBreakoutAttempt = {
              side: state.entryTriggered,
              timestamp: Date.now(),
              failed: true,
              breakoutPrice: state.entryPrice || 0
            };
            this.log(state, `⚠ Flagged ${state.entryTriggered} breakout as FAILED. Monitoring for Liquidity Trap Reversal.`);
            break;
          }
        } else if (order.orderType === 'LIMIT' && order.brokerOrderId.includes('TARGET')) {
          const hit = order.side === 'SELL' ? (ltp >= order.price!) : (ltp <= order.price!);
          if (hit) {
            this.log(state, `🟢 PAPER TARGET HIT! ${symbol} at ₹${ltp} (Target: ₹${order.price}) | Final P&L: ₹${pnlRs.toFixed(2)}`);
            await this.closePaperTrade(state, 'TARGET_HIT', ltp);
            state.lastBreakoutAttempt = null;
            break;
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Paper monitor error: ${err.message}`);
    }
  }

  private async monitorRealTrade(state: StrategyState, client: any) {
    if (!state.entryTriggered) return;

    try {
      // 1. If entry order has not yet filled, check entry order status
      if (!state.entryFilled && state.entryOrderId) {
        const entryOrder = await client.getOrder(state.entryOrderId);
        if (entryOrder.status === 'COMPLETE') {
          state.entryFilled = true;
          const fillPrice = entryOrder.average_price || entryOrder.price;
          this.log(state, `🛒 Entry Order FILLED at ₹${fillPrice}. Now placing SL & Target orders...`);
          await this.prisma.order.updateMany({
            where: { executionId: state.executionId, brokerOrderId: state.entryOrderId },
            data: { status: 'COMPLETE', price: fillPrice }
          });

          // Place SL and Target now that entry is filled!
          const { config, executionId } = state;
          const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
          const symbol = state.optionSymbol || state.futureSymbol || state.config.symbol;
          const exchange = state.optionSymbol ? (symbol.startsWith('SENSEX') ? 'BFO' : 'NFO') : (state.futureExchange || state.config.exchange);
          const exitSide = state.entryTriggered === 'LONG' ? 'SELL' : 'BUY';
          const sl = state.stopLossPrice!;
          const tgt = state.targetPrice!;

          const slId = await client.placeOrder({ symbol, exchange, side: exitSide, orderType: 'SL', product: config.product, qty: config.qty, price: sl, triggerPrice: sl }).catch(() => 'FAILED');
          state.slOrderId = slId;
          await this.trackOrder(state, account, executionId, { symbol, exchange, side: exitSide, orderType: 'SL', product: config.product, qty: config.qty, price: sl, triggerPrice: sl }, slId, state.executionId);

          const tgtId = await client.placeOrder({ symbol, exchange, side: exitSide, orderType: 'LIMIT', product: config.product, qty: config.qty, price: tgt }).catch(() => 'FAILED');
          state.targetOrderId = tgtId;
          await this.trackOrder(state, account, executionId, { symbol, exchange, side: exitSide, orderType: 'LIMIT', product: config.product, qty: config.qty, price: tgt }, tgtId, state.executionId);
          this.log(state, `🛡 Placed Bracket Protection: SL (${slId} @ ₹${sl}) & Target (${tgtId} @ ₹${tgt})`);
          return;
        } else if (entryOrder.status === 'REJECTED' || entryOrder.status === 'CANCELLED') {
          this.log(state, `❌ Entry order was ${entryOrder.status}. Reason: ${entryOrder.status_message || 'N/A'}`);
          await this.prisma.order.updateMany({
            where: { executionId: state.executionId, brokerOrderId: state.entryOrderId },
            data: { status: entryOrder.status }
          });
          state.entryTriggered = null;
          state.entryOrderId = null;
          this.stopRealtimeMonitor(state);
          return;
        }
      }

      // 2. If entry is filled, monitor exit SL and Target orders for execution (strict OCO)
      if (state.entryFilled) {
        // Real-time Breakeven Ratchet for live orders
        if (state.config.enableBreakevenTrail !== false && !state.isBreakevenTrailed && state.entryPrice) {
          const kite = client['kite'];
          const quotes = await kite.getLTP([`${state.futureExchange}:${state.optionSymbol || state.futureSymbol}`]).catch(() => ({}));
          const ltp = quotes[`${state.futureExchange}:${state.optionSymbol || state.futureSymbol}`]?.last_price;
          const isLong = state.entryTriggered === 'LONG' || !!state.optionSymbol;
          const currentPnlPoints = ltp ? (isLong ? (ltp - state.entryPrice) : (state.entryPrice - ltp)) : 0;
          const breakevenPoints = (state.initialRiskPoints ?? 5) * (state.config.breakevenTriggerR ?? 1.0);

          if (ltp) {
            state.currentLtp = ltp;
            state.currentPnlRs = currentPnlPoints * state.config.qty;
            state.currentPnlPct = state.entryPrice ? (currentPnlPoints / state.entryPrice) * 100 : 0;
            state.peakPnlRs = Math.max(state.peakPnlRs || 0, state.currentPnlRs);
          }

          if (ltp && currentPnlPoints >= breakevenPoints) {
            state.stopLossPrice = state.entryPrice;
            state.isBreakevenTrailed = true;
            if (client.modifyOrder && state.slOrderId && state.slOrderId !== 'FAILED') {
              await client.modifyOrder(state.slOrderId, { price: state.entryPrice, triggerPrice: state.entryPrice }).catch((e: any) => {
                this.log(state, `⚠ Live SL modify notice: ${e.message}`);
              });
            }
            await this.prisma.order.updateMany({
              where: { executionId: state.executionId, brokerOrderId: state.slOrderId! },
              data: { price: state.entryPrice, triggerPrice: state.entryPrice }
            });
            this.log(state, `🛡 (Live Protection) Position reached +${(state.config.breakevenTriggerR ?? 1).toFixed(1)}R profit! Trailed SL to COST (₹${state.entryPrice.toFixed(2)}) — Risk-Free!`);
          }
        }

        if (state.slOrderId && state.slOrderId !== 'FAILED') {
          const slOrder = await client.getOrder(state.slOrderId);
          if (slOrder.status === 'COMPLETE') {
            const fillPrice = slOrder.average_price || slOrder.price;
            this.log(state, `🔴 Stop Loss Hit at ₹${fillPrice}!`);
            await this.cancelBrokerOrderSafe(client, state.targetOrderId);
            await this.prisma.order.updateMany({
              where: { executionId: state.executionId, brokerOrderId: state.slOrderId },
              data: { status: 'COMPLETE', price: fillPrice }
            });
            await this.prisma.order.updateMany({
              where: { executionId: state.executionId, brokerOrderId: state.targetOrderId! },
              data: { status: 'CANCELLED' }
            });

            // Record failed breakout for Fakeout Reversal monitoring
            state.lastBreakoutAttempt = {
              side: state.entryTriggered!,
              timestamp: Date.now(),
              failed: true,
              breakoutPrice: state.entryPrice || 0
            };
            this.log(state, `⚠ Live Trade stopped out. Flagged ${state.entryTriggered} breakout as FAILED. Monitoring for Liquidity Trap Reversal.`);

            state.entryTriggered = null;
            state.entryFilled = false;
            state.slOrderId = null;
            state.targetOrderId = null;
            this.stopRealtimeMonitor(state);
            this.log(state, `🏁 Trade cycle complete (SL exit).`);
            return;
          }
        }

        if (state.targetOrderId && state.targetOrderId !== 'FAILED') {
          const tgtOrder = await client.getOrder(state.targetOrderId);
          if (tgtOrder.status === 'COMPLETE') {
            const fillPrice = tgtOrder.average_price || tgtOrder.price;
            this.log(state, `🟢 Target Hit at ₹${fillPrice}!`);
            await this.cancelBrokerOrderSafe(client, state.slOrderId);
            await this.prisma.order.updateMany({
              where: { executionId: state.executionId, brokerOrderId: state.targetOrderId },
              data: { status: 'COMPLETE', price: fillPrice }
            });
            await this.prisma.order.updateMany({
              where: { executionId: state.executionId, brokerOrderId: state.slOrderId! },
              data: { status: 'CANCELLED' }
            });
            state.entryTriggered = null;
            state.entryFilled = false;
            state.slOrderId = null;
            state.targetOrderId = null;
            state.lastBreakoutAttempt = null;
            this.stopRealtimeMonitor(state);
            this.log(state, `🏁 Trade cycle complete (Target exit).`);
            return;
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Real trade monitor error: ${err.message}`);
    }
  }

  private async closePaperTrade(state: StrategyState, reason: string, price: number) {
    await this.prisma.order.updateMany({
      where: { executionId: state.executionId, isPaperTrade: true, status: 'OPEN' },
      data: { status: 'COMPLETE', price }
    });
    this.log(state, `🏁 Paper trade closed (${reason}) at ₹${price.toFixed(2)}`);
    state.entryTriggered = null;
    state.entryPrice = null;
    state.setupTimestamp = null;
    state.isBreakevenTrailed = false;
    this.stopRealtimeMonitor(state);
  }

  private async closePaperTradeHistorical(state: StrategyState, reason: string, price: number, timestamp: Date) {
    await this.prisma.order.updateMany({
      where: { executionId: state.executionId, isPaperTrade: true, status: 'OPEN' },
      data: { status: 'COMPLETE', price }
    });
    this.log(state, `🏁 (Catch-up) Paper trade closed (${reason}) at ₹${price.toFixed(2)}`);
    state.entryTriggered = null;
    state.entryPrice = null;
    state.setupTimestamp = null;
    state.isBreakevenTrailed = false;
    this.stopRealtimeMonitor(state);
  }

  private async findFutureSymbol(client: any, baseSymbol: string): Promise<{ symbol: string; exchange: string }> {
    const upperSymbol = baseSymbol.toUpperCase().trim();
    const cleanSymbol = upperSymbol.replace(/:NSE|:BSE|:NFO|:BFO/g, '').trim();
    const isSensex = cleanSymbol.includes('SENSEX');
    const exchange = isSensex ? 'BFO' : 'NFO';
    const segment = isSensex ? 'BFO-FUT' : 'NFO-FUT';
    let underlying = isSensex ? 'SENSEX' : cleanSymbol.includes('BANK') ? 'BANKNIFTY' : (cleanSymbol.includes('NIFTY 50') || cleanSymbol.includes('NIFTY') || cleanSymbol === 'NIFTY') ? 'NIFTY' : cleanSymbol.includes('FIN') ? 'FINNIFTY' : cleanSymbol.includes('MID') ? 'MIDCPNIFTY' : cleanSymbol;

    const instruments = await client.getInstruments(exchange);
    const futures = instruments.filter((i: any) => i.name === underlying && i.instrument_type === 'FUT' && i.segment === segment);
    if (futures.length === 0) throw new Error(`No ${exchange} future for ${baseSymbol}`);
    
    const todayStr = this.getIstDateStr(new Date());
    const validFutures = futures.filter((i: any) => {
      const exp = this.getExpiryStr(i.expiry);
      return exp !== '' && exp >= todayStr;
    });
    const targetFutures = validFutures.length > 0 ? validFutures : futures;
    const sorted = targetFutures.sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    return { symbol: sorted[0].tradingsymbol, exchange };
  }

  private async fetchCandlesForSymbol(client: any, symbol: string, interval: string, now: Date, exchange = 'NFO'): Promise<Candle[]> {
    const istDateStr = this.getIstDateStr(now);
    const from = new Date(`${istDateStr}T09:15:00.000+05:30`);
    from.setDate(from.getDate() - 5);
    const data = await client.getHistoricalData(symbol, exchange, interval, from, now);
    return (data || []).map((c: any) => ({ date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
  }

  private getIstHhmm(date: Date): number {
    const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
    const istDate = new Date(utcMs + (330 * 60000));
    return istDate.getHours() * 60 + istDate.getMinutes();
  }

  private getIstDateStr(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private getExpiryStr(expiry: any): string {
    if (!expiry) return '';
    if (typeof expiry === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      return expiry;
    }
    const d = new Date(expiry);
    if (isNaN(d.getTime())) return '';
    return this.getIstDateStr(d);
  }

  private async placeBreakoutTrade(strategyId: string, state: StrategyState, client: any, account: any, side: 'BUY' | 'SELL', triggerPrice: number, triggerTime?: Date, refLow?: number, refHigh?: number) {
    const { config } = state;
    const kite = client['kite'];
    let symbol = config.symbol, exchange = config.exchange, finalSide: 'BUY' | 'SELL' = side;

    const stopLow = refLow ?? state.refLow;
    const stopHigh = refHigh ?? state.refHigh;

    const upper = config.symbol.toUpperCase().trim();
    const clean = upper.replace(/:NSE|:BSE|:NFO|:BFO/g, '').trim();
    const isIndex = (config.instrumentType as string) === 'INDEX' || (config.instrumentType as string) === 'OPTION' || clean.includes('NIFTY') || clean.includes('SENSEX') || clean.includes('BANKNIFTY') || clean.includes('FINNIFTY') || clean.includes('MIDCPNIFTY');
    const dynamicAtr = state.dynamicAtr || (Math.abs((stopHigh || 0) - (stopLow || 0)) * 0.5) || 20;
    const rr = config.riskRewardRatio ?? 2.0;

    if (isIndex) {
      try {
        const optionType = side === 'BUY' ? 'CE' : 'PE';
        const optSym = await this.findOptionSymbol(client, state, triggerPrice, optionType, triggerTime);
        if (optSym) {
          symbol = optSym;
          exchange = optSym.startsWith('SENSEX') ? 'BFO' : 'NFO';
          finalSide = 'BUY';
          let ltp: number | null = null;
          if (triggerTime) {
            ltp = await this.getHistoricalOptionPrice(client, symbol, exchange, triggerTime);
            if (ltp !== null) {
              this.log(state, `💡 Selected Option Historical Price: ₹${ltp.toFixed(2)} (Underlying: ₹${triggerPrice.toFixed(2)}) at ${this.formatTime(triggerTime)}`);
            } else {
              this.log(state, `⚠ Could not fetch historical option price for ${symbol} at ${this.formatTime(triggerTime)}. Using current LTP.`);
              const quotes = await kite.getLTP([`${exchange}:${symbol}`]);
              ltp = quotes[`${exchange}:${symbol}`]?.last_price;
            }
          } else {
            const quotes = await kite.getLTP([`${exchange}:${symbol}`]);
            ltp = quotes[`${exchange}:${symbol}`]?.last_price;
            if (ltp) {
              this.log(state, `💡 Selected Option LTP: ₹${ltp.toFixed(2)} (Underlying: ₹${triggerPrice.toFixed(2)})`);
            }
          }

          if (ltp) {
            const entry = this.roundTick(ltp);
            // Option Dynamic Risk (Default to 12% of premium or stopLossRs)
            const optionRisk = config.enableDynamicAtr !== false
              ? this.roundTick(Math.max(2.0, entry * 0.12))
              : this.roundTick(Math.max(2.0, config.stopLossRs ? (config.stopLossRs / config.qty) : (entry * 0.15)));
            const sl = this.roundTick(Math.max(1.0, entry - optionRisk));
            const risk = Math.max(0.50, entry - sl);
            const tgt = this.roundTick(entry + (risk * rr));
            state.initialRiskPoints = risk;

            await this.executeOrders(strategyId, state, client, account, symbol, exchange, finalSide, entry, sl, tgt, triggerTime);
            return;
          }
        }
      } catch (err: any) { this.log(state, `❌ Option error: ${err.message}`); }
    }

    // Fallback or Equity trade
    const entry = this.roundTick(triggerPrice);
    let sl: number;
    let tgt: number;

    const dynamicRisk = config.enableDynamicAtr !== false
      ? Math.max(0.50, dynamicAtr * (config.atrSlMultiplier ?? 1.0))
      : (config.stopLossRs / config.qty);

    if (side === 'BUY') {
      sl = config.enableDynamicAtr !== false
        ? this.roundTick(entry - dynamicRisk)
        : (stopLow ? this.roundTick(stopLow) : this.roundTick(entry - config.stopLossRs / config.qty));
      const risk = Math.max(0.50, Math.abs(entry - sl));
      tgt = this.roundTick(entry + (risk * rr));
      state.initialRiskPoints = risk;
    } else {
      sl = config.enableDynamicAtr !== false
        ? this.roundTick(entry + dynamicRisk)
        : (stopHigh ? this.roundTick(stopHigh) : this.roundTick(entry + config.stopLossRs / config.qty));
      const risk = Math.max(0.50, Math.abs(sl - entry));
      tgt = this.roundTick(entry - (risk * rr));
      state.initialRiskPoints = risk;
    }

    if (isIndex) {
      this.log(state, `⚠ Falling back to ${symbol} (Spot/Future) as no suitable option was found.`);
    }
    await this.executeOrders(strategyId, state, client, account, symbol, exchange, side, entry, sl, tgt, triggerTime);
  }

  private async executeOrders(strategyId: string, state: StrategyState, client: any, account: any, symbol: string, exchange: string, side: 'BUY' | 'SELL', entry: number, sl: number, tgt: number, triggerTime?: Date) {
    const { config, executionId } = state;
    this.log(state, `📋 Placing ${state.isReversalTrade ? '⚡ REVERSAL' : '🚀 BREAKOUT'}: ${symbol} — Entry: ₹${entry.toFixed(2)} | Dynamic SL: ₹${sl.toFixed(2)} | Dynamic Target (1:${(config.riskRewardRatio ?? 2.0).toFixed(1)} RR): ₹${tgt.toFixed(2)}`);

    state.stopLossPrice = sl;
    state.targetPrice = tgt;
    state.entryPrice = entry;
    state.currentLtp = entry;
    state.currentPnlRs = 0;
    state.currentPnlPct = 0;
    state.peakPnlRs = 0;
    state.entryTriggered = side === 'BUY' ? 'LONG' : 'SHORT';
    const isOption = exchange === 'NFO' || exchange === 'BFO' || symbol.endsWith('CE') || symbol.endsWith('PE');
    state.optionSymbol = isOption ? symbol : null;
    if (!triggerTime) state.tradesPlacedToday += 1;
    state.setupTimestamp = triggerTime ? triggerTime.getTime() : Date.now();
    state.isBreakevenTrailed = false;
    state.highestPriceReached = entry;
    state.lowestPriceReached = entry;

    if (state.isPaperTrade || triggerTime) {
      const entryId = `PAPER_ENTRY_${Math.random().toString(36).substring(7).toUpperCase()}`;
      state.entryOrderId = entryId;
      state.entryFilled = true;
      const exitSide = side === 'BUY' ? 'SELL' : 'BUY';
      const slId = `PAPER_SL_${Math.random().toString(36).substring(7).toUpperCase()}`;
      const tgtId = `PAPER_TARGET_${Math.random().toString(36).substring(7).toUpperCase()}`;
      state.slOrderId = slId;
      state.targetOrderId = tgtId;

      this.log(state, `✅ Paper Entry Order (Simulated @ ₹${entry.toFixed(2)}): ${entryId}`);
      await this.trackOrder(state, account, executionId, { symbol, exchange, side, orderType: 'LIMIT', product: config.product, qty: config.qty, price: entry, triggerPrice: entry }, entryId, strategyId, triggerTime);
      await this.trackOrder(state, account, executionId, { symbol, exchange, side: exitSide, orderType: 'SL', product: config.product, qty: config.qty, price: sl, triggerPrice: sl }, slId, strategyId, triggerTime);
      await this.trackOrder(state, account, executionId, { symbol, exchange, side: exitSide, orderType: 'LIMIT', product: config.product, qty: config.qty, price: tgt }, tgtId, strategyId, triggerTime);

      // Start real-time tracking if placed live
      if (!triggerTime) {
        await this.startRealtimeMonitor(state, client);
      }
      return;
    }

    // LIVE ORDER EXECUTION:
    const limitPrice = side === 'BUY' ? this.roundTick(entry + 0.20) : this.roundTick(entry - 0.20);
    const entryId = await client.placeOrder({ symbol, exchange, side, orderType: 'LIMIT', product: config.product, qty: config.qty, price: limitPrice });
    state.entryOrderId = entryId;
    state.entryFilled = false;
    this.log(state, `✅ Live Entry Order placed (LIMIT @ ₹${limitPrice.toFixed(2)}): ${entryId}`);
    await this.trackOrder(state, account, executionId, { symbol, exchange, side, orderType: 'LIMIT', product: config.product, qty: config.qty, price: limitPrice }, entryId, strategyId, triggerTime);

    await this.startRealtimeMonitor(state, client);
  }

  private async getHistoricalOptionPrice(client: any, symbol: string, exchange: string, timestamp: Date): Promise<number | null> {
    try {
      const from = new Date(timestamp.getTime() - 15 * 60 * 1000);
      const to = new Date(timestamp.getTime() + 15 * 60 * 1000);
      const data = await client.getHistoricalData(symbol, exchange, '5minute', from, to);
      if (!data || data.length === 0) return null;

      const targetTimeMs = timestamp.getTime();
      const match = data.find((c: any) => new Date(c.date).getTime() === targetTimeMs);
      if (match) return match.close;

      let closest = data[0];
      let minDiff = Math.abs(new Date(closest.date).getTime() - targetTimeMs);
      for (const c of data) {
        const diff = Math.abs(new Date(c.date).getTime() - targetTimeMs);
        if (diff < minDiff) {
          minDiff = diff;
          closest = c;
        }
      }
      return closest ? closest.close : null;
    } catch (e: any) {
      this.logger.error(`Error getting historical option price for ${symbol} at ${timestamp.toISOString()}: ${e.message}`);
      return null;
    }
  }

  private async findOptionSymbol(client: any, state: StrategyState, spotPrice: number, type: 'CE' | 'PE', triggerTime?: Date): Promise<string | null> {
    const { config } = state;
    const upper = config.symbol.toUpperCase().trim();
    const clean = upper.replace(/:NSE|:BSE|:NFO|:BFO/g, '').trim();

    // ─── Resolve the canonical underlying name for NFO instruments ───────────
    let underlying: string;
    if (clean.includes('BANKNIFTY') || clean === 'BANKNIFTY') underlying = 'BANKNIFTY';
    else if (clean.includes('NIFTY 50') || clean.includes('NIFTY') || clean === 'NIFTY') underlying = 'NIFTY';
    else if (clean.includes('FINNIFTY')) underlying = 'FINNIFTY';
    else if (clean.includes('MIDCPNIFTY')) underlying = 'MIDCPNIFTY';
    else if (clean.includes('SENSEX')) underlying = 'SENSEX';
    else underlying = clean;

    const exchange = underlying === 'SENSEX' ? 'BFO' : 'NFO';
    const segment = underlying === 'SENSEX' ? 'BFO-OPT' : 'NFO-OPT';

    const instruments = await client.getInstruments(exchange);
    const options = instruments.filter((i: any) => i.name === underlying && i.instrument_type === type && i.segment === segment);

    if (options.length === 0) {
      this.log(state, `⚠ No ${type} options found for ${underlying} on ${exchange}.`);
      return null;
    }

    const todayStr = this.getIstDateStr(new Date());

    const uniqueExpiries = Array.from(new Set(options.map((i: any) => this.getExpiryStr(i.expiry))))
      .filter(exp => exp !== '' && exp >= todayStr)
      .sort();

    if (uniqueExpiries.length === 0) {
      this.log(state, `❌ No future expiries found for ${underlying}.`);
      return null;
    }

    const nearestExpiry = uniqueExpiries[0];
    const filteredOptions = options.filter((i: any) => this.getExpiryStr(i.expiry) === nearestExpiry);
    this.log(state, `📋 Found ${filteredOptions.length} ${type} options for ${underlying} (expiry: ${nearestExpiry})`);

    const step = ['NIFTY', 'FINNIFTY'].includes(underlying) ? 50 : underlying === 'MIDCPNIFTY' ? 25 : 100;
    const atmStrike = Math.round(spotPrice / step) * step;
    const moneyness = config.moneyness ?? 'ITM';

    // ─── Option 1: Premium Range Selection ──────────────────────────────────
    if (config.minPremium && config.maxPremium) {
      this.log(state, `🔍 Searching for ${type} option in premium range ₹${config.minPremium} - ₹${config.maxPremium}...`);
      const candidateStrikes = [
        atmStrike,
        atmStrike + step, atmStrike - step,
        atmStrike + 2 * step, atmStrike - 2 * step,
        atmStrike + 3 * step, atmStrike - 3 * step,
        atmStrike + 4 * step, atmStrike - 4 * step,
        atmStrike + 5 * step, atmStrike - 5 * step,
        atmStrike + 6 * step, atmStrike - 6 * step,
      ];

      if (triggerTime) {
        for (const strike of candidateStrikes) {
          const opt = filteredOptions.find((i: any) => Number(i.strike) === strike);
          if (!opt) continue;

          const price = await this.getHistoricalOptionPrice(client, opt.tradingsymbol, exchange, triggerTime);
          if (price !== null && price >= config.minPremium && price <= config.maxPremium) {
            this.log(state, `🎯 Found ${opt.tradingsymbol} within premium range (historical check: ₹${price.toFixed(2)}).`);
            return opt.tradingsymbol;
          }
        }
        this.log(state, `⚠ No strike found within ₹${config.minPremium}-₹${config.maxPremium} via historical check. Falling back to ${moneyness} strike.`);
      } else {
        const allSymbols = filteredOptions.map((i: any) => `${exchange}:${i.tradingsymbol}`);
        const CHUNK = 200;
        const quotes: Record<string, any> = {};
        for (let i = 0; i < allSymbols.length; i += CHUNK) {
          const chunk = allSymbols.slice(i, i + CHUNK);
          try {
            const res = await client.getLTP(chunk);
            Object.assign(quotes, res);
          } catch (e: any) {
            this.log(state, `⚠ LTP batch failed: ${e.message}`);
          }
        }

        for (const strike of candidateStrikes) {
          const opt = filteredOptions.find((i: any) => Number(i.strike) === strike);
          if (!opt) continue;

          const key = `${exchange}:${opt.tradingsymbol}`;
          const ltp = quotes[key]?.last_price;
          if (ltp && ltp >= config.minPremium && ltp <= config.maxPremium) {
            this.log(state, `🎯 Found ${opt.tradingsymbol} within premium range (LTP: ₹${ltp.toFixed(2)}).`);
            return opt.tradingsymbol;
          }
        }
        this.log(state, `⚠ No strike found within ₹${config.minPremium}-₹${config.maxPremium}. Falling back to ${moneyness} strike.`);
      }
    }

    // ─── Option 2: Default ATM / ITM Strike Selection ───────────────────────
    let desiredStrike = atmStrike;
    if (moneyness === 'ITM') {
      desiredStrike = type === 'CE' ? atmStrike - step : atmStrike + step;
    } else if ((moneyness as string) === 'OTM') {
      desiredStrike = type === 'CE' ? atmStrike + step : atmStrike - step;
    } else {
      desiredStrike = atmStrike;
    }

    const match = filteredOptions.find((i: any) => Number(i.strike) === desiredStrike)
      || filteredOptions.find((i: any) => Number(i.strike) === atmStrike);

    if (match) {
      this.log(state, `🎯 Selected ${moneyness} Strike: ${match.tradingsymbol} (Strike: ${match.strike})`);
      return match.tradingsymbol;
    }

    // ─── Option 3: Closest available strike fallback ────────────────────────
    let closestOpt: any = null;
    let closestDiff = Infinity;
    for (const opt of filteredOptions) {
      const diff = Math.abs(Number(opt.strike) - spotPrice);
      if (diff < closestDiff) { closestDiff = diff; closestOpt = opt; }
    }
    if (closestOpt) {
      this.log(state, `🎯 Using closest strike: ${closestOpt.tradingsymbol} (Strike: ${closestOpt.strike})`);
      return closestOpt.tradingsymbol;
    }

    return null;
  }

  // ─── TECHNICAL INDICATORS (ATR, VWAP, EMA) ──────────────────────────────────
  private calculateATR(candles: Candle[], period = 14): number[] {
    const atrs: number[] = new Array(candles.length).fill(0);
    if (candles.length === 0) return atrs;
    const trs: number[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (i === 0) {
        trs.push(candles[i].high - candles[i].low);
      } else {
        const prevClose = candles[i - 1].close;
        const tr = Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - prevClose),
          Math.abs(candles[i].low - prevClose)
        );
        trs.push(tr);
      }
    }

    let sum = 0;
    for (let i = 0; i < Math.min(period, trs.length); i++) {
      sum += trs[i];
      atrs[i] = sum / (i + 1);
    }
    for (let i = period; i < trs.length; i++) {
      atrs[i] = (atrs[i - 1] * (period - 1) + trs[i]) / period;
    }
    return atrs;
  }

  private calculateVWAP(candles: Candle[], vwapSource: 'close' | 'hlc3' = 'close'): (number | null)[] {
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

  private calculateEMA(candles: Candle[], period: number): (number | null)[] {
    const emas: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period) return emas;
    const mult = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += candles[i].close;
    let prev = sum / period;
    emas[period - 1] = prev;
    for (let i = period; i < candles.length; i++) {
      const ema = (candles[i].close - prev) * mult + prev;
      emas[i] = ema;
      prev = ema;
    }
    return emas;
  }

  private roundTick(price: number, tick = 0.05) { return Math.round(price / tick) * tick; }
  private formatTime(d: Date) { return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }); }
  private log(state: StrategyState, msg: string) { const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); state.logs.push(`[${ts}] ${msg}`); this.logger.log(`[${state.executionId}] ${msg}`); }
  private async persistLogs(state: StrategyState) {
    try {
      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { logs: JSON.stringify(state.logs.slice(-200)) },
      });
      strategyEvents.emit('strategy.update', {
        strategyId: state.strategyId,
        logs: state.logs,
        state: this.getState(state.strategyId),
      });
    } catch {}
  }

  private async trackOrder(state: StrategyState, account: any, executionId: string, params: any, brokerOrderId: string, strategyId: string, createdAt?: Date) {
    try {
      const isEntry = !brokerOrderId.includes('SL') && !brokerOrderId.includes('TARGET');
      await this.prisma.order.create({
        data: {
          userId: account.userId,
          brokerAccountId: account.id,
          executionId,
          symbol: params.symbol,
          exchange: params.exchange,
          side: params.side,
          orderType: params.orderType,
          productType: params.product,
          qty: params.qty,
          price: params.price ?? null,
          triggerPrice: params.triggerPrice ?? null,
          brokerOrderId,
          status: state.isPaperTrade ? (isEntry ? 'COMPLETE' : 'OPEN') : 'OPEN',
          isPaperTrade: state.isPaperTrade,
          ...(createdAt ? { createdAt } : {})
        } as any
      });
    } catch (err: any) { this.log(state, `⚠ DB track failed: ${err.message}`); }
  }

  private resetDailyState(state: StrategyState) {
    state.refHigh = null;
    state.refLow = null;
    state.refCandleSet = false;
    state.entryTriggered = null;
    state.optionSymbol = null;
    state.tradesPlacedToday = 0;
    state.setupTimestamp = null;
    state.entryPrice = null;
    state.dynamicAtr = undefined;
    state.initialRiskPoints = undefined;
    state.isBreakevenTrailed = false;
    state.highestPriceReached = undefined;
    state.lowestPriceReached = undefined;
    state.lastBreakoutAttempt = null;
    state.isReversalTrade = false;
    this.stopRealtimeMonitor(state);
  }
}
