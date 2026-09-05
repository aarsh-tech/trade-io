import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { Breakout15MinConfig } from './dto/strategy.dto';
import { autoSelectStock, getInstrumentTickSize, roundToInstrumentTick } from './smart-stock-picker';
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
  initialSlPrice?: number | null;
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

  // Enterprise Dynamic Sizing & Exchange SL Tracking State
  executedQty?: number;
  lastBrokerSlTrigger?: number;
  lastBrokerSlModifyTime?: number;
  isProfitLockTrailed?: boolean;
  isDynamicTrailingActive?: boolean;
  dailyRealizedPnlRs?: number;

  // Real-Time WebSocket & Ticker Tracking State
  realtimeActive?: boolean;
  lastTickTime?: number;
  lastPnlLogTime?: number;
  lastEmitTime?: number;
  tickerUnsubscribe?: () => void;

  // Dual-Edge & Liquidity Sweep Trap Tracking State
  cprData?: {
    pivot: number;
    bc: number;
    tc: number;
    width: number;
    widthPct: number;
    topCpr: number;
    bottomCpr: number;
    r1: number;
    s1: number;
    r2: number;
    s2: number;
    isNarrow: boolean;
    isWide: boolean;
  } | null;
  sweptHigh?: boolean;
  sweptHighPrice?: number;
  sweptLow?: boolean;
  sweptLowPrice?: number;
  isTrapTrade?: boolean;

  // 9/15 EMA & VWAP Trailing State
  lastEma?: number | null;
  lastVwap?: number | null;
  isTrailingEma?: boolean;

  // Parabolic Mode & Multi-Candle Confirmation State
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

  // Systematic Profitability & Capital Preservation Pillars
  dailyLossesCount: number;
  isPartialBooked?: boolean;
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
    await this.prisma.strategyExecution.updateMany({
      where: { strategyId, status: 'RUNNING' },
      data: { status: 'STOPPED', stoppedAt: new Date() },
    });
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
      isProfitLockTrailed: false,
      isDynamicTrailingActive: false,
      dailyRealizedPnlRs: 0,
      lastBreakoutAttempt: null,
      isReversalTrade: false,
      lastEma: null,
      lastVwap: null,
      isTrailingEma: false,
      isParabolicActive: false,
      emaWarningCandle: null,
      reEntryEligible: false,
      reEntrySwingPrice: null,
      reEntryCountToday: 0,
      dailyLossesCount: 0,
      isPartialBooked: false,
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Dynamic 15-Min Breakout Strategy started — Symbol: ${config.symbol}:${config.exchange} | Mode: ${state.isPaperTrade ? 'PAPER' : 'LIVE'} | Entry TF: ${config.entryTimeframe ?? '3min'} | Trailing: ${config.enableEmaVwapTrailing !== false ? `${config.trailingEmaPeriod ?? 9}-EMA & VWAP` : 'Ratchet'} | Moneyness: ${config.moneyness ?? 'ITM'} | Dynamic ATR: ${config.enableDynamicAtr !== false ? 'ON' : 'OFF'} | Traps: ${config.enableTrapReversal !== false ? 'ACTIVE' : 'OFF'}`);
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
        data: { status: 'STOPPED', stoppedAt: new Date(), logs: JSON.stringify(state.logs.slice(-200)) },
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
        data: { status, stoppedAt: new Date(), logs: JSON.stringify(state.logs.slice(-200)) },
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
    const currentQty = s.executedQty || s.config.qty;
    const calculatedPnlRs = pnlPoints * currentQty;
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
      qty: currentQty,
      executedQty: s.executedQty,
      refHigh: s.refHigh,
      refLow: s.refLow,
      dynamicAtr: s.dynamicAtr,
      isBreakevenTrailed: s.isBreakevenTrailed,
      isProfitLockTrailed: s.isProfitLockTrailed,
      isDynamicTrailingActive: s.isDynamicTrailingActive,
      dailyRealizedPnlRs: s.dailyRealizedPnlRs || 0,
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

      // 1. Cancel pending broker SL order
      await this.cancelBrokerOrderSafe(client, state.slOrderId);
      await this.cancelBrokerOrderSafe(client, state.targetOrderId);

      // 2. Check if position was already closed manually on Zerodha
      let isAlreadyClosed = false;
      try {
        const kite = client['kite'];
        if (kite && kite.getPositions) {
          const pos = await kite.getPositions().catch(() => null);
          const allPos = [...(pos?.net || []), ...(pos?.day || [])];
          const currentPos = allPos.find((p: any) => p.tradingsymbol === symbol);
          const liveNetQty = currentPos ? Math.abs(currentPos.quantity) : 0;
          if (liveNetQty === 0) {
            isAlreadyClosed = true;
            this.log(state, `ℹ [AUTO-SYNC] ${symbol} was already squared off manually on Zerodha. Skipping duplicate exit order.`);
          }
        }
      } catch { }

      if (!isAlreadyClosed) {
        const exitSide = (state.optionSymbol ? 'SELL' : (state.entryTriggered === 'LONG' ? 'SELL' : 'BUY'));
        await client.placeOrder({
          symbol,
          exchange,
          side: exitSide,
          orderType: 'MARKET',
          product: state.config.product,
          qty: state.executedQty || state.config.qty,
        }).catch((e: any) => this.log(state, `❌ Square-Off exit order notice: ${e.message}`));
      }
    }

    this.log(state, `⚡ Manual Instant Square-Off requested by user @ ₹${exitPrice.toFixed(2)}`);
    if (state.isPaperTrade) {
      await this.closePaperTrade(state, 'MANUAL_SQUARE_OFF', exitPrice);
    } else {
      state.entryTriggered = null;
      state.entryFilled = false;
      state.slOrderId = null;
      state.targetOrderId = null;
      state.isBreakevenTrailed = false;
      state.isProfitLockTrailed = false;
      state.isDynamicTrailingActive = false;
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
      const rangePts = ref.high - ref.low;
      this.log(state, `📊 (Catch-up) Reference Range Set — H: ₹${ref.high} | L: ₹${ref.low} (Range: ₹${rangePts.toFixed(2)})`);

      // 2.1 Calculate Central Pivot Range (CPR) from Previous Day (Official Zerodha Live Daily data)
      const prevOhlc = await this.fetchPreviousDayOHLC(client, state.futureSymbol, state.futureExchange, now);
      if (prevOhlc) {
        state.cprData = this.calculateCPR(prevOhlc);
      } else {
        const prevCandles = candles15.filter(c => this.getIstDateStr(c.date) !== todayStr);
        if (prevCandles.length > 0) {
          const prevDayStr = this.getIstDateStr(prevCandles[prevCandles.length - 1].date);
          const prevDayCandles = prevCandles.filter(c => this.getIstDateStr(c.date) === prevDayStr);
          state.cprData = this.calculateCPR(prevDayCandles);
        }
      }
      if (state.cprData) {
        this.log(state, `🎯 (Catch-up) Live Zerodha CPR: Pivot ₹${state.cprData.pivot.toFixed(1)} | TC: ₹${state.cprData.tc.toFixed(1)}, BC: ₹${state.cprData.bc.toFixed(1)} (Corridor: ₹${state.cprData.bottomCpr.toFixed(1)} - ₹${state.cprData.topCpr.toFixed(1)}, Width: ₹${state.cprData.width.toFixed(1)} / ${state.cprData.widthPct.toFixed(3)}%) | R1: ₹${state.cprData.r1.toFixed(1)}, S1: ₹${state.cprData.s1.toFixed(1)} — Regime: ${state.cprData.isNarrow ? '🔥 NARROW (HIGH TREND/BREAKOUT CONVICTION)' : (state.cprData.isWide ? '🛡 WIDE (CHOP REGIME — TRAPS ONLY)' : '⚖ AVERAGE CPR')}`);
      }

      // ─── Opening Range Width Filter (Skip exhausted blowout days) ────────
      const symUpper = (state.config.symbol || '').toUpperCase().trim();
      const defaultMaxRange = symUpper.includes('BANKNIFTY') ? 300 : (symUpper.includes('NIFTY') ? 120 : (ref.high * 0.012));
      const maxRangeAllowed = state.config.maxOpeningRangePts ?? defaultMaxRange;
      if (rangePts > maxRangeAllowed) {
        this.log(state, `⛔ (Catch-up) Opening 15-min range (₹${rangePts.toFixed(1)} pts) exceeds max allowable threshold (₹${maxRangeAllowed} pts). Volatility exhausted; skipping day to prevent SL whipsaws.`);
        await this.persistLogs(state);
        return;
      }

      // 3. Scan lower timeframe candles for traps & breakouts (STRICTLY FROM TODAY after 9:30 AM)
      const entryTf = state.config.entryTimeframe || '3min';
      const tfInterval = entryTf === '1min' ? 'minute' : (entryTf === '3min' ? '3minute' : '5minute');
      const tfDurationMs = (entryTf === '1min' ? 1 : (entryTf === '3min' ? 3 : 5)) * 60 * 1000;
      const candles5 = await this.fetchCandlesForSymbol(client, state.futureSymbol, tfInterval, now, state.futureExchange);
      const today5Candles = candles5.filter(c => this.getIstDateStr(c.date) === todayStr);
      const breakoutCandidates = today5Candles.filter(c => this.getIstHhmm(new Date(c.date)) >= 9 * 60 + 30);

      const atrs = this.calculateATR(candles5, state.config.atrPeriod ?? 14);
      const currentAtr = atrs[atrs.length - 1] || Math.max(1, (state.refHigh - state.refLow) * 0.5);
      state.dynamicAtr = currentAtr;

      const buffer = (state.config.enableDynamicAtr !== false) ? Math.max(0.05, currentAtr * (state.config.atrBufferMultiplier ?? 0.15)) : 0;
      const vwaps = this.calculateVWAP(candles5);
      const trailingPeriod = state.config.trailingEmaPeriod || 9;
      const emaTrailing = this.calculateEMA(candles5, trailingPeriod);
      const ema9 = this.calculateEMA(candles5, 9);
      const ema21 = this.calculateEMA(candles5, 21);
      const rsis = this.calculateRSI(candles5, 14);

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

            // Check Dynamic Breakeven Ratchet (+0.7R -> SL to Cost)
            const evalHighPrice = isLong ? currentOptionPriceHigh : currentOptionPriceLow;
            const currentPnlPoints = isLong ? (evalHighPrice - state.entryPrice!) : (state.entryPrice! - evalHighPrice);
            const breakevenPoints = (state.initialRiskPoints ?? 5) * (state.config.breakevenTriggerR ?? 0.7);

            if (!state.isBreakevenTrailed && currentPnlPoints >= breakevenPoints && state.entryPrice) {
              state.stopLossPrice = state.entryPrice;
              state.isBreakevenTrailed = true;
              this.log(state, `🛡 (Catch-up Protection) Position reached +${(state.config.breakevenTriggerR ?? 0.7).toFixed(1)}R profit! Trailed SL to COST (₹${state.entryPrice.toFixed(2)}) — Risk-Free!`);
            }

            // Multi-Lot Partial Profit Booking ("The Banker & The Runner") in Catch-up
            const enablePartial = state.config.enablePartialBooking !== false;
            const partialR = state.config.partialBookingR ?? 1.8;
            const symClean = (state.config.symbol || state.futureSymbol || '').toUpperCase().trim();
            const lotSize = this.getLotSizeForUnderlying(symClean);
            const currentTotalQty = state.config.qty;

            if (enablePartial && !state.isPartialBooked && currentPnlPoints >= ((state.initialRiskPoints ?? 5) * partialR) && currentTotalQty >= 2 * lotSize && state.entryPrice) {
              const targetPct = (state.config.partialBookingPct ?? 50) / 100;
              const bookLots = Math.max(1, Math.floor((currentTotalQty / lotSize) * targetPct));
              const bookQty = bookLots * lotSize;
              const remainingQty = currentTotalQty - bookQty;
              if (bookQty > 0 && remainingQty > 0) {
                state.isPartialBooked = true;
                state.executedQty = remainingQty;
                state.stopLossPrice = state.entryPrice;
                state.isBreakevenTrailed = true;
                this.log(state, `💰 (Catch-up) [THE BANKER & RUNNER] Partial Profit Booked: ${bookLots} lots (${bookQty} qty) @ +${partialR}R (+₹${(currentPnlPoints * bookQty).toFixed(2)})! Remaining ${remainingQty} qty SL moved to COST (₹${state.entryPrice.toFixed(2)}) — Risk-Free! Trailing along 9/15-EMA & VWAP.`);
              }
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
              state.dailyLossesCount = (state.dailyLossesCount || 0) + 1;
              this.log(state, `🔴 (Catch-up) PAPER SL HIT! ${state.optionSymbol || state.futureSymbol || state.config.symbol} at ₹${effectiveSl} | Daily Losses: ${state.dailyLossesCount}`);
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

        // Check if this candle is closed (at least tfDurationMs passed since its start)
        const candleStart = new Date(currentCandle.date).getTime();
        if ((now.getTime() - candleStart) < tfDurationMs) continue;

        // Check Daily Max Loss Limit (1-Loss & Done Capital Preservation Shield)
        const maxLossesAllowed = state.config.maxLossesPerDay ?? 1;
        if ((state.dailyLossesCount || 0) >= maxLossesAllowed) {
          this.log(state, `🛡 (Catch-up) 1-Loss Capital Shield active (${state.dailyLossesCount}/${maxLossesAllowed} losses today). Skipping further entries to prevent chop drawdowns.`);
          break;
        }

        // Check Midday Dead-Zone Filter (11:45 AM - 13:00 PM IST)
        const candHhmm = this.getIstHhmm(new Date(currentCandle.date));
        if (state.config.enableMiddayChopFilter !== false) {
          const [deadStartH, deadStartM] = (state.config.middayDeadZoneStart || '11:45').split(':').map(Number);
          const [deadEndH, deadEndM] = (state.config.middayDeadZoneEnd || '13:00').split(':').map(Number);
          const deadStartMin = (deadStartH || 11) * 60 + (deadStartM || 45);
          const deadEndMin = (deadEndH || 13) * 60 + (deadEndM || 0);
          if (candHhmm >= deadStartMin && candHhmm <= deadEndMin) {
            continue;
          }
        }

        // Entry Window Cutoff check for new entries (default: all day until 15:00)
        const primeEndStr = state.config.primeWindowEndTime || '15:00';
        if (primeEndStr && primeEndStr !== 'ALL_DAY') {
          const [primeH, primeM] = primeEndStr.split(':').map(Number);
          const primeMinutes = (primeH || 15) * 60 + (primeM || 0);
          if (!state.entryTriggered && candHhmm > primeMinutes) {
            continue;
          }
        }

        // ─── Track Liquidity Sweeps Beyond 15-min Range ────────────────────
        const sym = state.config.symbol || state.futureSymbol || '';
        const isSensex = sym.includes('SENSEX') || sym.includes('BSESN');
        const maxSweepPts = isSensex ? 90 : 65;

        if (currentCandle.high > state.refHigh!) {
          if ((currentCandle.high - state.refHigh!) <= maxSweepPts) {
            state.sweptHigh = true;
            state.sweptHighPrice = Math.max(state.sweptHighPrice || 0, currentCandle.high);
          } else {
            state.sweptHigh = false;
          }
        }
        if (currentCandle.low < state.refLow!) {
          if ((state.refLow! - currentCandle.low) <= maxSweepPts) {
            state.sweptLow = true;
            state.sweptLowPrice = state.sweptLowPrice ? Math.min(state.sweptLowPrice, currentCandle.low) : currentCandle.low;
          } else {
            state.sweptLow = false;
          }
        }

        const curVwap = candleIdxInFull >= 0 ? vwaps[candleIdxInFull] : null;
        const curTrailingEma = candleIdxInFull >= 0 ? emaTrailing[candleIdxInFull] : null;
        const curEma9 = candleIdxInFull >= 0 ? ema9[candleIdxInFull] : null;
        const curEma21 = candleIdxInFull >= 0 ? ema21[candleIdxInFull] : null;
        const curRsi = candleIdxInFull >= 0 ? rsis[candleIdxInFull] : null;

        state.lastEma = curTrailingEma;
        state.lastVwap = curVwap;

        // ─── 1. Dual-Edge: Liquidity Sweep Trap Reversals (Turtle Soup / 2B) ────
        if (state.config.enableTrapReversal !== false && !state.entryTriggered) {
          const isVwapBear = !curVwap || currentCandle.close < curVwap;
          const isEmaBear = !curTrailingEma || currentCandle.close <= curTrailingEma;
          const isVwapBull = !curVwap || currentCandle.close > curVwap;
          const isEmaBull = !curTrailingEma || currentCandle.close >= curTrailingEma;
          const isRsiBear = curRsi === null || curRsi <= 55;
          const isRsiBull = curRsi === null || curRsi >= 40;
          const isStrongBear = curEma9 && curEma21 ? curEma9 < curEma21 : true;
          const isStrongBull = curEma9 && curEma21 ? curEma9 > curEma21 : true;
          const canTakeBearishTrap = !state.cprData || !state.cprData.isNarrow || isStrongBear;
          const canTakeBullishTrap = !state.cprData || !state.cprData.isNarrow || isStrongBull;

          // Bull Trap (Price swept above 15m high, but fails and closes back inside below VWAP/EMA)
          if (state.sweptHigh && currentCandle.close < state.refHigh! && (isVwapBear || isEmaBear) && currentCandle.close < currentCandle.open && isRsiBear && canTakeBearishTrap) {
            this.log(state, `⚡ (Catch-up) BULL TRAP (LIQUIDITY SWEEP) TRIGGERED on ${entryTf}! Price swept above 15m high (₹${state.refHigh}, peak ₹${state.sweptHighPrice?.toFixed(1)}), failed and closed back inside range @ ₹${currentCandle.close} (VWAP: ₹${curVwap?.toFixed(1)}, ${trailingPeriod}-EMA: ₹${curTrailingEma?.toFixed(1)}). Entering SHORT to ride reversal to range bottom!`);
            state.sweptHigh = false;
            state.isTrapTrade = true;
            await this.placeBreakoutTrade(strategyId, state, client, account, 'SELL', currentCandle.close, new Date(currentCandle.date), state.refLow, state.refHigh, currentCandle);
            continue;
          }
          // Bear Trap (Price swept below 15m low, but fails and reclaims range above VWAP/EMA)
          else if (state.sweptLow && currentCandle.close > state.refLow! && (isVwapBull || isEmaBull) && currentCandle.close > currentCandle.open && isRsiBull && canTakeBullishTrap) {
            this.log(state, `⚡ (Catch-up) BEAR TRAP (LIQUIDITY SWEEP) TRIGGERED on ${entryTf}! Price swept below 15m low (₹${state.refLow}, trough ₹${state.sweptLowPrice?.toFixed(1)}), failed and reclaimed range @ ₹${currentCandle.close} (VWAP: ₹${curVwap?.toFixed(1)}, ${trailingPeriod}-EMA: ₹${curTrailingEma?.toFixed(1)}). Entering LONG to ride reversal to range top!`);
            state.sweptLow = false;
            state.isTrapTrade = true;
            await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', currentCandle.close, new Date(currentCandle.date), state.refLow, state.refHigh, currentCandle);
            continue;
          }
        }

        // ─── 2. Regular Dynamic Breakout Check with Retest & CPR Confirmation ──
        const candRange = Math.max(0.1, currentCandle.high - currentCandle.low);
        const candBody = Math.abs(currentCandle.close - currentCandle.open);
        const bodyRatio = candBody / candRange;
        const isRetestOk = state.config.enableRetestConfirmation === false || bodyRatio >= 0.40;
        const isCprOk = state.config.enableCprFilter === false || !state.cprData || state.cprData.isNarrow;
        const isCprWide = state.config.enableCprSupportResistance !== false && state.cprData && state.cprData.isWide;
        const nearCprResistance = state.config.enableCprSupportResistance !== false && state.cprData && (
          (state.cprData.pivot > currentCandle.close && (state.cprData.pivot - currentCandle.close) < 25) ||
          (state.cprData.topCpr > currentCandle.close && (state.cprData.topCpr - currentCandle.close) < 25)
        );
        const nearCprSupport = state.config.enableCprSupportResistance !== false && state.cprData && (
          (currentCandle.close > state.cprData.pivot && (currentCandle.close - state.cprData.pivot) < 25) ||
          (currentCandle.close > state.cprData.bottomCpr && (currentCandle.close - state.cprData.bottomCpr) < 25)
        );

        if (currentCandle.close > (state.refHigh! + buffer)) {
          const isVwapOk = state.config.enableVwapFilter === false || !curVwap || currentCandle.close >= curVwap;
          const isEmaOk = !curEma9 || !curEma21 || curEma9 >= curEma21;
          const isRsiOk = state.config.enableRsiFilter === false || curRsi === null || curRsi >= 55;

          if (isCprWide) {
            this.log(state, `⏳ (Catch-up) CPR Regime Gate: Wide CPR (${state.cprData?.widthPct.toFixed(2)}%). Breakout chasing blocked to avoid retail chop traps. Prioritizing Liquidity Sweep Trap Reversals!`);
          } else if (!isCprOk) {
            this.log(state, `⏳ (Catch-up) CPR Filter: Wide CPR (${state.cprData?.widthPct.toFixed(2)}%). Skipping breakout to prevent chop; waiting for trap reversals.`);
          } else if (nearCprResistance) {
            this.log(state, `⏳ (Catch-up) CPR S/R Hurdle: Long breakout @ ₹${currentCandle.close} is directly beneath CPR resistance overhead (Pivot ₹${state.cprData?.pivot.toFixed(1)}, Top CPR ₹${state.cprData?.topCpr.toFixed(1)}). Waiting for clean breakout.`);
          } else if (!isRetestOk) {
            this.log(state, `⏳ (Catch-up) Breakout candle closed with weak body conviction (${(bodyRatio * 100).toFixed(0)}% body). Waiting for confirmed retest bounce.`);
          } else if (isVwapOk && isEmaOk && isRsiOk) {
            this.log(state, `🚀 (Catch-up) Dynamic BREAKOUT! 5-min candle (${this.formatTime(new Date(currentCandle.date))}) closed at ₹${currentCandle.close} > ₹${(state.refHigh! + buffer).toFixed(2)} (ATR: ₹${currentAtr.toFixed(2)}, RSI: ${curRsi?.toFixed(1) ?? 'N/A'})`);
            await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', currentCandle.close, new Date(currentCandle.date), state.refLow, state.refHigh, currentCandle);
          }
        } else if (currentCandle.close < (state.refLow! - buffer)) {
          const isVwapOk = state.config.enableVwapFilter === false || !curVwap || currentCandle.close <= curVwap;
          const isEmaOk = !curEma9 || !curEma21 || curEma9 <= curEma21;
          const isRsiOk = state.config.enableRsiFilter === false || curRsi === null || curRsi <= 45;

          if (isCprWide) {
            this.log(state, `⏳ (Catch-up) CPR Regime Gate: Wide CPR (${state.cprData?.widthPct.toFixed(2)}%). Breakdown chasing blocked to avoid retail chop traps. Prioritizing Liquidity Sweep Trap Reversals!`);
          } else if (!isCprOk) {
            this.log(state, `⏳ (Catch-up) CPR Filter: Wide CPR (${state.cprData?.widthPct.toFixed(2)}%). Skipping breakdown to prevent chop; waiting for trap reversals.`);
          } else if (nearCprSupport) {
            this.log(state, `⏳ (Catch-up) CPR S/R Hurdle: Short breakdown @ ₹${currentCandle.close} is directly above CPR support underneath (Pivot ₹${state.cprData?.pivot.toFixed(1)}, Bottom CPR ₹${state.cprData?.bottomCpr.toFixed(1)}). Waiting for clean breakdown.`);
          } else if (!isRetestOk) {
            this.log(state, `⏳ (Catch-up) Breakdown candle closed with weak body conviction (${(bodyRatio * 100).toFixed(0)}% body). Waiting for confirmed retest bounce.`);
          } else if (isVwapOk && isEmaOk && isRsiOk) {
            this.log(state, `🚀 (Catch-up) Dynamic BREAKDOWN! 5-min candle (${this.formatTime(new Date(currentCandle.date))}) closed at ₹${currentCandle.close} < ₹${(state.refLow! - buffer).toFixed(2)} (ATR: ₹${currentAtr.toFixed(2)}, RSI: ${curRsi?.toFixed(1) ?? 'N/A'})`);
            await this.placeBreakoutTrade(strategyId, state, client, account, 'SELL', currentCandle.close, new Date(currentCandle.date), state.refLow, state.refHigh, currentCandle);
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
        } catch { }
      }
      return;
    }

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'];
    const { config } = state;
    const todayStr = this.getIstDateStr(now);
    const upper = (config.symbol || '').toUpperCase().trim();
    const clean = upper.replace(/:NSE|:BSE|:NFO|:BFO/g, '').trim();
    const isIndex = (config.instrumentType as string) === 'INDEX' || (config.instrumentType as string) === 'OPTION' || clean.includes('NIFTY') || clean.includes('SENSEX') || clean.includes('BANKNIFTY') || clean.includes('FINNIFTY') || clean.includes('MIDCPNIFTY');

    if (!state.futureSymbol) {
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

          // Calculate Live Zerodha Central Pivot Range (CPR)
          const prevOhlc = await this.fetchPreviousDayOHLC(client, state.futureSymbol, state.futureExchange, now);
          if (prevOhlc) {
            state.cprData = this.calculateCPR(prevOhlc);
          } else {
            const prevCandles = candles15.filter(c => this.getIstDateStr(c.date) !== todayStr);
            if (prevCandles.length > 0) {
              const prevDayStr = this.getIstDateStr(prevCandles[prevCandles.length - 1].date);
              const prevDayCandles = prevCandles.filter(c => this.getIstDateStr(c.date) === prevDayStr);
              state.cprData = this.calculateCPR(prevDayCandles);
            }
          }
          if (state.cprData) {
            this.log(state, `🎯 Live Zerodha CPR: Pivot ₹${state.cprData.pivot.toFixed(1)} | TC: ₹${state.cprData.tc.toFixed(1)}, BC: ₹${state.cprData.bc.toFixed(1)} (Corridor: ₹${state.cprData.bottomCpr.toFixed(1)} - ₹${state.cprData.topCpr.toFixed(1)}, Width: ₹${state.cprData.width.toFixed(1)} / ${state.cprData.widthPct.toFixed(3)}%) | R1: ₹${state.cprData.r1.toFixed(1)}, S1: ₹${state.cprData.s1.toFixed(1)} — Regime: ${state.cprData.isNarrow ? '🔥 NARROW (HIGH TREND/BREAKOUT CONVICTION)' : (state.cprData.isWide ? '🛡 WIDE (CHOP REGIME — TRAPS ONLY)' : '⚖ AVERAGE CPR')}`);
          }
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
        try {
          const entryTf = config.entryTimeframe || '3min';
          const tfInterval = entryTf === '1min' ? 'minute' : (entryTf === '3min' ? '3minute' : '5minute');
          const lowerCandles = await this.fetchCandlesForSymbol(client, state.futureSymbol || config.symbol, tfInterval, now, state.futureExchange || config.exchange);
          if (lowerCandles.length > 0) {
            const vwaps = this.calculateVWAP(lowerCandles);
            const trailingPeriod = config.trailingEmaPeriod || 9;
            const emaTrailing = this.calculateEMA(lowerCandles, trailingPeriod);
            state.lastVwap = vwaps[vwaps.length - 1];
            state.lastEma = emaTrailing[emaTrailing.length - 1];

            // ── 1. Parabolic VWAP Profit-Lock on Candle Close (TTML Spike Protection) ──
            const lastCandle = lowerCandles[lowerCandles.length - 1];
            const isOption = !!state.optionSymbol;
            const isLong = isOption || state.entryTriggered === 'LONG';
            const curEma = state.lastEma;
            const curVwap = state.lastVwap;

            if (state.config.enableParabolicVwapLock !== false && state.isParabolicActive && curVwap && !isOption) {
              const isVwapBroken = isLong ? (lastCandle.close < curVwap) : (lastCandle.close > curVwap);
              if (isVwapBroken) {
                this.log(state, `🎯 [PARABOLIC VWAP LOCK] Candle closed across Session VWAP (₹${lastCandle.close.toFixed(2)} vs VWAP ₹${curVwap.toFixed(2)}). Exiting to protect morning surge gains!`);
                await this.exitPosition(state, client, lastCandle.close, 'TARGET');
                await this.persistLogs(state);
                return;
              }
            }

            // ── 2. Two-Candle Confirmation Rule on EMA Exit (CHENNPETRO Shakeout Protection) ──
            if (state.config.enableTwoCandleEmaConfirmation !== false && state.isTrailingEma && curEma && curVwap && !isOption) {
              const isEmaBreached = isLong ? (lastCandle.close < curEma) : (lastCandle.close > curEma);
              const isAboveVwap = isLong ? (lastCandle.close > curVwap) : (lastCandle.close < curVwap);

              if (isEmaBreached) {
                if (!state.emaWarningCandle) {
                  // Candle 1: Warning Flag (Don't exit immediately on 1 bar noise)
                  state.emaWarningCandle = {
                    date: lastCandle.date,
                    low: lastCandle.low,
                    high: lastCandle.high,
                    close: lastCandle.close,
                  };
                  this.log(state, `⚠ [EMA TRAIL WARNING] Candle closed beyond ${trailingPeriod}-EMA (₹${lastCandle.close.toFixed(2)} vs EMA ₹${curEma.toFixed(2)}). Waiting for Candle 2 confirmation before exiting to prevent fakeout.`);
                } else if (new Date(lastCandle.date).getTime() !== new Date(state.emaWarningCandle.date).getTime()) {
                  // Candle 2: Confirmation evaluation
                  const isLowBroken = isLong ? (lastCandle.low < state.emaWarningCandle.low) : (lastCandle.high > state.emaWarningCandle.high);
                  const isSecondCloseBeyond = isLong ? (lastCandle.close < curEma) : (lastCandle.close > curEma);

                  if (isLowBroken || isSecondCloseBeyond || !isAboveVwap) {
                    this.log(state, `🛑 [CONFIRMED EMA BREAKDOWN] Candle 2 confirmed breakdown below EMA (Low broken or 2nd close below). Exiting trade.`);
                    await this.exitPosition(state, client, lastCandle.close, 'TARGET');
                    await this.persistLogs(state);
                    return;
                  } else {
                    this.log(state, `🟢 [EMA FAKEOUT REJECTED] Candle 2 held support and closed back green! Resetting warning, staying in mega-trend.`);
                    state.emaWarningCandle = null;
                  }
                }
              } else {
                if (state.emaWarningCandle) {
                  this.log(state, `🟢 [EMA RE-CLAIMED] Price firmly back above ${trailingPeriod}-EMA! Warning cleared.`);
                  state.emaWarningCandle = null;
                }
              }
            }
          }
        } catch { }

        if (state.isPaperTrade) {
          await this.monitorPaperTrade(state, kite);
        } else {
          await this.monitorRealTrade(state, client);
        }
      } catch (err: any) { this.log(state, `❌ Monitor error: ${err.message}`); }
      await this.persistLogs(state);
      return;
    }

    // ─── 0.0 Trend Continuation Re-Entry (Catch Leg 2 on EMA Re-Claim) ────────
    if (state.config.enableTrendReEntry !== false && state.reEntryEligible && state.reEntrySwingPrice && !state.entryTriggered && (state.reEntryCountToday || 0) < 1 && hhmm <= (13 * 60 + 30)) {
      try {
        const reEntrySym = state.futureSymbol || config.symbol;
        const reEntryEx = state.futureExchange || config.exchange;
        const lowerCandles = await this.fetchCandlesForSymbol(client, reEntrySym, '5minute', now, reEntryEx);
        if (lowerCandles.length >= 2) {
          const lastCandle = lowerCandles[lowerCandles.length - 1];
          const vwaps = this.calculateVWAP(lowerCandles);
          const trailingPeriod = config.trailingEmaPeriod || 15;
          const emaTrailing = this.calculateEMA(lowerCandles, trailingPeriod);
          const curVwap = vwaps[vwaps.length - 1];
          const curEma = emaTrailing[emaTrailing.length - 1];

          // Condition: Price firmly re-claims above 15-EMA & VWAP, and breaks prior swing high
          const isReClaim = curEma && curVwap && lastCandle.close > curEma && lastCandle.close > curVwap;
          const isBreakout = lastCandle.close > state.reEntrySwingPrice;

          if (isReClaim && isBreakout) {
            this.log(state, `🔥 [TREND RE-ENTRY TRIGGERED] ${reEntrySym} re-claimed ${trailingPeriod}-EMA & VWAP and broke swing high (₹${state.reEntrySwingPrice.toFixed(2)}) @ ₹${lastCandle.close.toFixed(2)}! Entering Trend Continuation Leg 2.`);
            state.reEntryEligible = false;
            state.reEntryCountToday = (state.reEntryCountToday || 0) + 1;
            const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
            await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', lastCandle.close, now, Math.min(lastCandle.low, curEma), state.reEntrySwingPrice, lastCandle);
            await this.persistLogs(state);
            return;
          }
        }
      } catch (err: any) {
        this.logger.debug?.(`Re-entry evaluation notice: ${err.message}`);
      }
    }

    // ─── Breakout Scanning (only when no active trade) ────────────────────────
    if (state.tradesPlacedToday >= config.maxTradesPerDay) {
      this.log(state, `⛔ Max daily trade cap (${config.maxTradesPerDay}) reached.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'COMPLETED', `⛔ Auto-Stopped: Max daily trade cap reached`);
      return;
    }

    // ─── 0.1 Capital Shield: 1-Loss & Done ─────────────────────────────────────
    const maxLossesAllowed = config.maxLossesPerDay ?? 1;
    if ((state.dailyLossesCount || 0) >= maxLossesAllowed) {
      if (hhmm % 30 === 0 && !state.logs.some(l => l.includes(`1-Loss Shield active`))) {
        this.log(state, `🛡 [1-LOSS SHIELD ACTIVE] Daily max loss limit reached (${state.dailyLossesCount}/${maxLossesAllowed}). Halting all new entries today to protect capital from choppy markets.`);
      }
      await this.persistLogs(state);
      return;
    }

    // ─── 0.2 Midday Dead-Zone Filter (11:45 AM - 13:00 PM IST European Transition) ─
    if (config.enableMiddayChopFilter !== false) {
      const [deadStartH, deadStartM] = (config.middayDeadZoneStart || '11:45').split(':').map(Number);
      const [deadEndH, deadEndM] = (config.middayDeadZoneEnd || '13:00').split(':').map(Number);
      const deadStartMin = (deadStartH || 11) * 60 + (deadStartM || 45);
      const deadEndMin = (deadEndH || 13) * 60 + (deadEndM || 0);

      if (hhmm >= deadStartMin && hhmm <= deadEndMin) {
        if (hhmm % 15 === 0 && !state.logs.some(l => l.includes(`European transition dead-zone`))) {
          this.log(state, `⏳ [MIDDAY CHOP GATE] Current time (${this.formatTime(now)}) is inside European transition dead-zone (11:45-13:00). Skipping new breakout entries to prevent fakeouts.`);
        }
        await this.persistLogs(state);
        return;
      }
    }

    // ─── 0. Safety Filters: Opening Range Exhaustion & Prime Momentum Window ─
    if (state.refCandleSet && state.refHigh !== null && state.refLow !== null) {
      const rangePts = state.refHigh - state.refLow;
      const upperSym = (config.symbol || '').toUpperCase().trim();
      const defaultMaxRange = upperSym.includes('BANKNIFTY') ? 300 : (upperSym.includes('NIFTY') ? 120 : (state.refHigh * 0.012));
      const maxRangeAllowed = config.maxOpeningRangePts ?? defaultMaxRange;

      if (rangePts > maxRangeAllowed) {
        if (hhmm % 15 === 0 && !state.logs.some(l => l.includes(`Opening 15-min range exceeds max allowable`))) {
          this.log(state, `⛔ Opening 15-min range (₹${rangePts.toFixed(1)} pts) exceeds max allowable threshold (₹${maxRangeAllowed} pts). Daily volatility exhausted; day skipped to eliminate SL traps.`);
        }
        await this.persistLogs(state);
        return;
      }
    }

    const primeEndStr = config.primeWindowEndTime || '15:00';
    if (primeEndStr && primeEndStr !== 'ALL_DAY') {
      const [primeH, primeM] = primeEndStr.split(':').map(Number);
      const primeMinutes = (primeH || 15) * 60 + (primeM || 0);
      if (hhmm > primeMinutes) {
        if (hhmm % 30 === 0 && !state.logs.some(l => l.includes(`Past entry cutoff window`))) {
          this.log(state, `⏳ Past entry cutoff window (${primeEndStr}). Skipping new entries for the rest of session.`);
        }
        await this.persistLogs(state);
        return;
      }
    }

    try {
      const futureKey = `${state.futureExchange}:${state.futureSymbol}`;
      const ltpData = await kite.getLTP([futureKey]);
      const currentPrice = ltpData[futureKey]?.last_price;
      if (!currentPrice) { await this.persistLogs(state); return; }

      const entryTf = config.entryTimeframe || '3min';
      const tfInterval = entryTf === '1min' ? 'minute' : (entryTf === '3min' ? '3minute' : '5minute');
      const tfDurationMs = (entryTf === '1min' ? 1 : (entryTf === '3min' ? 3 : 5)) * 60 * 1000;
      const candlesLower = await this.fetchCandlesForSymbol(client, state.futureSymbol, tfInterval, now, state.futureExchange);
      const todayLowerCandles = candlesLower.filter(c => this.getIstDateStr(c.date) === todayStr);
      const breakoutCandidates = todayLowerCandles.filter(c => this.getIstHhmm(new Date(c.date)) >= 9 * 60 + 30);
      if (breakoutCandidates.length === 0) { await this.persistLogs(state); return; }

      const lastCandle = breakoutCandidates[breakoutCandidates.length - 1];
      const isClosed = (now.getTime() - new Date(lastCandle.date).getTime()) >= tfDurationMs;
      const target = isClosed ? lastCandle : (breakoutCandidates.length > 1 ? breakoutCandidates[breakoutCandidates.length - 2] : null);
      if (!target) { await this.persistLogs(state); return; }

      // ─── Dynamic Indicator Computations (ATR, VWAP, EMA, RSI) ──────────────
      const atrs = this.calculateATR(candlesLower, config.atrPeriod ?? 14);
      const currentAtr = atrs[atrs.length - 1] || Math.max(1, (state.refHigh! - state.refLow!) * 0.5);
      state.dynamicAtr = currentAtr;

      const buffer = (config.enableDynamicAtr !== false) ? Math.max(0.05, currentAtr * (config.atrBufferMultiplier ?? 0.15)) : 0;
      const vwaps = this.calculateVWAP(candlesLower);
      const currentVwap = vwaps[vwaps.length - 1];
      const trailingPeriod = config.trailingEmaPeriod || 9;
      const emaTrailing = this.calculateEMA(candlesLower, trailingPeriod);
      const curTrailingEma = emaTrailing[emaTrailing.length - 1];
      const ema9 = this.calculateEMA(candlesLower, 9);
      const ema21 = this.calculateEMA(candlesLower, 21);
      const curEma9 = ema9[ema9.length - 1];
      const curEma21 = ema21[ema21.length - 1];
      const rsis = this.calculateRSI(candlesLower, 14);
      const currentRsi = rsis[rsis.length - 1];

      state.lastEma = curTrailingEma;
      state.lastVwap = currentVwap;

      // Periodic scanning heartbeat
      if (hhmm % 5 === 0 && !state.logs.some(l => l.includes(`Scanning for breakout`) && l.includes(`LTP: ₹${currentPrice}`))) {
        const activeSym = state.futureSymbol || config.symbol;
        this.log(state, `[${activeSym}] 👀 Scanning on ${entryTf} (LTP: ₹${currentPrice}) — Range: ₹${state.refLow} to ₹${state.refHigh} | ATR: ₹${currentAtr.toFixed(2)} | RSI: ${currentRsi?.toFixed(1) ?? 'N/A'} | ${trailingPeriod}-EMA: ₹${curTrailingEma?.toFixed(1) ?? 'N/A'} | VWAP: ₹${currentVwap?.toFixed(1) ?? 'N/A'}`);
      }

      // ─── Track Liquidity Sweeps Beyond 15-min Range ────────────────────
      const sym = config.symbol || state.futureSymbol || '';
      const isSensex = sym.includes('SENSEX') || sym.includes('BSESN');
      const maxSweepPts = isSensex ? 90 : 65;

      if (target.high > state.refHigh!) {
        if ((target.high - state.refHigh!) <= maxSweepPts) {
          state.sweptHigh = true;
          state.sweptHighPrice = Math.max(state.sweptHighPrice || 0, target.high);
        } else {
          state.sweptHigh = false;
        }
      }
      if (target.low < state.refLow!) {
        if ((state.refLow! - target.low) <= maxSweepPts) {
          state.sweptLow = true;
          state.sweptLowPrice = state.sweptLowPrice ? Math.min(state.sweptLowPrice, target.low) : target.low;
        } else {
          state.sweptLow = false;
        }
      }

      // ─── 1. DUAL-EDGE: LIQUIDITY SWEEP TRAP REVERSALS (TURTLE SOUP / 2B) ──
      if (config.enableTrapReversal !== false && !state.entryTriggered) {
        const isVwapBear = !currentVwap || target.close < currentVwap;
        const isEmaBear = !curTrailingEma || target.close <= curTrailingEma;
        const isVwapBull = !currentVwap || target.close > currentVwap;
        const isEmaBull = !curTrailingEma || target.close >= curTrailingEma;
        const isRsiBear = currentRsi === null || currentRsi <= 55;
        const isRsiBull = currentRsi === null || currentRsi >= 40;
        const isStrongBear = curEma9 && curEma21 ? curEma9 < curEma21 : true;
        const isStrongBull = curEma9 && curEma21 ? curEma9 > curEma21 : true;
        const canTakeBearishTrap = !state.cprData || !state.cprData.isNarrow || isStrongBear;
        const canTakeBullishTrap = !state.cprData || !state.cprData.isNarrow || isStrongBull;

        // Bull Trap (Price swept above 15m high, but fails and closes back inside below VWAP/EMA)
        if (state.sweptHigh && target.close < state.refHigh! && (isVwapBear || isEmaBear) && target.close < target.open && isRsiBear && canTakeBearishTrap) {
          this.log(state, `⚡ BULL TRAP (LIQUIDITY SWEEP) TRIGGERED on ${entryTf}! Price swept above 15m high (₹${state.refHigh}, peak ₹${state.sweptHighPrice?.toFixed(1)}), failed and closed back inside range @ ₹${target.close} (VWAP: ₹${currentVwap?.toFixed(1)}, ${trailingPeriod}-EMA: ₹${curTrailingEma?.toFixed(1)}). Entering SHORT to ride reversal to range bottom!`);
          state.sweptHigh = false;
          state.isTrapTrade = true;
          await this.placeBreakoutTrade(strategyId, state, client, account, 'SELL', currentPrice, undefined, state.refLow, state.refHigh, target);
          await this.persistLogs(state);
          return;
        }
        // Bear Trap (Price swept below 15m low, but fails and reclaims range above VWAP/EMA)
        else if (state.sweptLow && target.close > state.refLow! && (isVwapBull || isEmaBull) && target.close > target.open && isRsiBull && canTakeBullishTrap) {
          this.log(state, `⚡ BEAR TRAP (LIQUIDITY SWEEP) TRIGGERED on ${entryTf}! Price swept below 15m low (₹${state.refLow}, trough ₹${state.sweptLowPrice?.toFixed(1)}), failed and reclaimed range @ ₹${target.close} (VWAP: ₹${currentVwap?.toFixed(1)}, ${trailingPeriod}-EMA: ₹${curTrailingEma?.toFixed(1)}). Entering LONG to ride reversal to range top!`);
          state.sweptLow = false;
          state.isTrapTrade = true;
          await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', currentPrice, undefined, state.refLow, state.refHigh, target);
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
      const candleBody = Math.abs(target.close - target.open);
      const bodyRatio = candleBody / candleRange;
      const isStrongBull = (target.close - target.low) / candleRange >= 0.55;
      const isStrongBear = (target.high - target.close) / candleRange >= 0.55;
      const isRetestOk = config.enableRetestConfirmation === false || bodyRatio >= 0.40;
      const isCprOk = config.enableCprFilter === false || !state.cprData || state.cprData.isNarrow;
      const isCprWide = config.enableCprSupportResistance !== false && state.cprData && state.cprData.isWide;
      const nearCprResistance = config.enableCprSupportResistance !== false && state.cprData && (
        (state.cprData.pivot > target.close && (state.cprData.pivot - target.close) < 25) ||
        (state.cprData.topCpr > target.close && (state.cprData.topCpr - target.close) < 25)
      );
      const nearCprSupport = config.enableCprSupportResistance !== false && state.cprData && (
        (target.close > state.cprData.pivot && (target.close - state.cprData.pivot) < 25) ||
        (target.close > state.cprData.bottomCpr && (target.close - state.cprData.bottomCpr) < 25)
      );

      // ─── 3. DYNAMIC LONG BREAKOUT ──────────────────────────────────────────
      if (target.close > (state.refHigh! + buffer)) {
        const isVwapOk = config.enableVwapFilter === false || !currentVwap || target.close >= currentVwap;
        const isEmaOk = !curEma9 || !curEma21 || curEma9 >= curEma21;
        const isRsiOk = config.enableRsiFilter === false || currentRsi === null || currentRsi >= 55;

        if (isCprWide) {
          this.log(state, `⏳ CPR Regime Gate: Wide CPR (${state.cprData?.widthPct.toFixed(2)}%). Pure breakout chasing blocked to avoid retail chop traps. Prioritizing Liquidity Sweep Trap Reversals!`);
        } else if (!isCprOk) {
          this.log(state, `⏳ CPR Filter: Wide CPR (${state.cprData?.widthPct.toFixed(2)}%). Skipping breakout to prevent chop; waiting for trap reversals.`);
        } else if (nearCprResistance) {
          this.log(state, `⏳ CPR S/R Hurdle: Long breakout @ ₹${target.close} is directly beneath CPR resistance overhead (Pivot ₹${state.cprData?.pivot.toFixed(1)}, Top CPR ₹${state.cprData?.topCpr.toFixed(1)}). Waiting for clean breakout.`);
        } else if (!isVolumeConfirmed) {
          this.log(state, `⏳ Breakout above ₹${state.refHigh} detected, but volume (${target.volume}) is below required ${(config.minRvol ?? 1.2)}x threshold. Skipping weak breakout.`);
        } else if (!isRetestOk || !isStrongBull) {
          this.log(state, `⏳ Breakout candle closed with weak conviction (${(bodyRatio * 100).toFixed(0)}% body). Waiting for confirmed retest bounce.`);
        } else if (!isVwapOk || !isEmaOk) {
          this.log(state, `⏳ Breakout above ₹${state.refHigh} conflicts with VWAP/EMA trend. Skipping counter-trend trade.`);
        } else if (!isRsiOk) {
          this.log(state, `⏳ Breakout above ₹${state.refHigh} detected, but RSI (${currentRsi?.toFixed(1)}) is below 55 (weak momentum). Skipping false breakout trap.`);
        } else {
          if (config.enableMarketTrendFilter !== false && !isIndex) {
            const trendCheck = await this.checkMarketTrendAlignment(client, 'BUY');
            if (!trendCheck.isAligned) {
              this.log(state, `⏳ Market Filter: ${trendCheck.reason}. Skipping long breakout trade to prevent counter-trend trap.`);
              await this.persistLogs(state);
              return;
            }
          }
          this.log(state, `🚀 DYNAMIC BREAKOUT! 5-min (${this.formatTime(new Date(target.date))}) closed at ₹${target.close} > ₹${(state.refHigh! + buffer).toFixed(2)} (ATR: ₹${currentAtr.toFixed(2)}, RSI: ${currentRsi?.toFixed(1) ?? 'N/A'}, Vol: ${target.volume})`);
          await this.placeBreakoutTrade(strategyId, state, client, account, 'BUY', currentPrice, undefined, state.refLow, state.refHigh, target);
        }
      }
      // ─── 4. DYNAMIC SHORT BREAKDOWN ────────────────────────────────────────
      else if (target.close < (state.refLow! - buffer)) {
        const isVwapOk = config.enableVwapFilter === false || !currentVwap || target.close <= currentVwap;
        const isEmaOk = !curEma9 || !curEma21 || curEma9 <= curEma21;
        const isRsiOk = config.enableRsiFilter === false || currentRsi === null || currentRsi <= 45;

        if (isCprWide) {
          this.log(state, `⏳ CPR Regime Gate: Wide CPR (${state.cprData?.widthPct.toFixed(2)}%). Breakdown chasing blocked to avoid retail chop traps. Prioritizing Liquidity Sweep Trap Reversals!`);
        } else if (!isCprOk) {
          this.log(state, `⏳ CPR Filter: Wide CPR (${state.cprData?.widthPct.toFixed(2)}%). Skipping breakdown to prevent chop; waiting for trap reversals.`);
        } else if (nearCprSupport) {
          this.log(state, `⏳ CPR S/R Hurdle: Short breakdown @ ₹${target.close} is directly above CPR support underneath (Pivot ₹${state.cprData?.pivot.toFixed(1)}, Bottom CPR ₹${state.cprData?.bottomCpr.toFixed(1)}). Waiting for clean breakdown.`);
        } else if (!isVolumeConfirmed) {
          this.log(state, `⏳ Breakdown below ₹${state.refLow} detected, but volume (${target.volume}) is below required ${(config.minRvol ?? 1.2)}x threshold. Skipping weak breakdown.`);
        } else if (!isRetestOk || !isStrongBear) {
          this.log(state, `⏳ Breakdown candle closed with weak conviction (${(bodyRatio * 100).toFixed(0)}% body). Waiting for confirmed retest bounce.`);
        } else if (!isVwapOk || !isEmaOk) {
          this.log(state, `⏳ Breakdown below ₹${state.refLow} conflicts with VWAP/EMA trend. Skipping counter-trend trade.`);
        } else if (!isRsiOk) {
          this.log(state, `⏳ Breakdown below ₹${state.refLow} detected, but RSI (${currentRsi?.toFixed(1)}) is above 45 (weak momentum). Skipping false breakdown trap.`);
        } else {
          if (config.enableMarketTrendFilter !== false && !isIndex) {
            const trendCheck = await this.checkMarketTrendAlignment(client, 'SELL');
            if (!trendCheck.isAligned) {
              this.log(state, `⏳ Market Filter: ${trendCheck.reason}. Skipping short breakdown trade to prevent counter-trend trap.`);
              await this.persistLogs(state);
              return;
            }
          }
          this.log(state, `🚀 DYNAMIC BREAKDOWN! 5-min (${this.formatTime(new Date(target.date))}) closed at ₹${target.close} < ₹${(state.refLow! - buffer).toFixed(2)} (ATR: ₹${currentAtr.toFixed(2)}, RSI: ${currentRsi?.toFixed(1) ?? 'N/A'}, Vol: ${target.volume})`);
          await this.placeBreakoutTrade(strategyId, state, client, account, 'SELL', currentPrice, undefined, state.refLow, state.refHigh, target);
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
    const isOption = !!state.optionSymbol;
    const isLong = isOption || state.entryTriggered === 'LONG';
    const symTickSize = isOption ? 0.05 : getInstrumentTickSize(symbol, state.entryPrice || 0);

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

      const currentQty = state.executedQty || state.config.qty;
      const pnlPoints = isLong ? (currentPrice - state.entryPrice!) : (state.entryPrice! - currentPrice);
      const pnlRs = pnlPoints * currentQty;
      const pnlPct = state.entryPrice ? (pnlPoints / state.entryPrice) * 100 : 0;

      state.currentPnlRs = pnlRs;
      state.currentPnlPct = pnlPct;
      state.peakPnlRs = Math.max(state.peakPnlRs || 0, pnlRs);

      // ── 0. Check if Server SL Order filled directly at Zerodha ──────────
      if (!state.isPaperTrade && state.slOrderId && state.slOrderId !== 'FAILED' && client) {
        try {
          const kite = client['kite'];
          if (kite && kite.getOrders) {
            const orders = await kite.getOrders().catch(() => []);
            const slOrder = orders.find((o: any) => o.order_id === state.slOrderId);
            if (slOrder && slOrder.status === 'COMPLETE') {
              if (isExiting) return;
              isExiting = true;
              const avgPrice = Number(slOrder.average_price) || state.stopLossPrice!;
              const isProfitExit = isLong ? (avgPrice >= state.entryPrice!) : (avgPrice <= state.entryPrice!);
              this.log(state, `🛑 Zerodha Server SL Order (${state.slOrderId}) filled at ₹${avgPrice.toFixed(2)}`);
              this.stopRealtimeMonitor(state);
              await this.exitPosition(state, client, avgPrice, isProfitExit ? 'TARGET' : 'SL');
              return;
            }
          }
        } catch { }
      }

      // ── 1. 3:05 PM Mandatory EOD Cutoff ──────────────────────────────────
      const currentHhmm = this.getIstHhmm(new Date());
      if (currentHhmm >= 15 * 60 + 5 && state.entryTriggered) {
        if (isExiting) return;
        isExiting = true;
        this.log(state, `⏰ 3:05 PM Intraday EOD Cutoff reached! Auto-squaring off position (Current P&L: ₹${pnlRs.toFixed(2)})...`);
        await this.exitPosition(state, client, currentPrice, 'EOD');
        return;
      }

      const risk = state.initialRiskPoints || Math.max(0.50, Math.abs((state.entryPrice || currentPrice) - (state.stopLossPrice || currentPrice)));

      // ── 2. Breakeven Lock (+0.7R profit -> SL to COST) ─────────────────────
      const breakevenPoints = risk * (state.config.breakevenTriggerR ?? 0.7);
      if (state.config.enableBreakevenTrail !== false && !state.isBreakevenTrailed && pnlPoints >= breakevenPoints && state.entryPrice) {
        state.stopLossPrice = state.entryPrice;
        state.isBreakevenTrailed = true;
        this.log(state, `🛡 (Dynamic Protection) Position hit +${(state.config.breakevenTriggerR ?? 0.7).toFixed(1)}R profit (+₹${pnlPoints.toFixed(2)} pts)! Trailed SL to COST (₹${state.entryPrice.toFixed(2)}) — Risk-Free Trade!`);
        await this.updateBrokerSlSafe(client, client?.['kite'], state, symbol);
      }

      // ── 3. Profit Lock Milestone (+1.5R profit -> Lock +0.75R) ────────────
      if (pnlPoints >= (risk * 1.5) && !state.isProfitLockTrailed && state.entryPrice) {
        state.isProfitLockTrailed = true;
        const lockPrice = this.roundTick(isLong ? state.entryPrice + (risk * 0.75) : state.entryPrice - (risk * 0.75), symTickSize);
        if ((isLong && lockPrice > (state.stopLossPrice || 0)) || (!isLong && lockPrice < (state.stopLossPrice || Infinity))) {
          state.stopLossPrice = lockPrice;
          this.log(state, `🔒 Profit Lock (+1.5R reached): Trailed SL to ₹${lockPrice.toFixed(2)} (+₹${(risk * 0.75).toFixed(2)} pts locked)`);
          await this.updateBrokerSlSafe(client, client?.['kite'], state, symbol);
        }
      }

      // ── 3.5 Multi-Lot Partial Profit Booking ("The Banker & The Runner") ──
      const partialR = state.config.partialBookingR ?? 1.8;
      const enablePartial = state.config.enablePartialBooking !== false;
      const cleanUnderlying = (state.config.symbol || state.futureSymbol || '').toUpperCase().trim();
      const lotSize = this.getLotSizeForUnderlying(cleanUnderlying);
      const activeQty = state.executedQty || state.config.qty;

      if (enablePartial && !state.isPartialBooked && pnlPoints >= (risk * partialR) && activeQty >= 2 * lotSize && state.entryPrice) {
        state.isPartialBooked = true;
        const targetPct = (state.config.partialBookingPct ?? 50) / 100;
        let bookLots = Math.max(1, Math.floor((activeQty / lotSize) * targetPct));
        const bookQty = bookLots * lotSize;
        const remainingQty = activeQty - bookQty;

        if (bookQty > 0 && remainingQty > 0) {
          state.executedQty = remainingQty;
          const exitSide = isLong ? 'SELL' : 'BUY';

          if (state.isPaperTrade) {
            this.log(state, `💰 [THE BANKER & RUNNER] Paper Partial Profit Booked: ${bookLots} lots (${bookQty} qty) @ ₹${currentPrice.toFixed(2)} (+${partialR}R / +₹${(pnlPoints * bookQty).toFixed(2)})!`);
          } else if (client) {
            try {
              const partId = await client.placeOrder({
                symbol,
                exchange,
                side: exitSide,
                orderType: 'MARKET',
                product: state.config.product ?? 'MIS',
                qty: bookQty,
              });
              this.log(state, `💰 [THE BANKER & RUNNER] Live Partial Profit Booked: ${bookLots} lots (${bookQty} qty) @ ₹${currentPrice.toFixed(2)} | Order: ${partId}`);
            } catch (err: any) {
              this.log(state, `⚠ Partial profit exit order notice: ${err.message}`);
            }

            // Sync remaining broker Stop Loss order quantity
            if (state.slOrderId && state.slOrderId !== 'FAILED') {
              try {
                const k = client?.['kite'] || client;
                if (client.modifyOrder) {
                  await client.modifyOrder(state.slOrderId, { quantity: remainingQty }).catch(() => { });
                } else if (k && k.modifyOrder) {
                  await k.modifyOrder('regular', state.slOrderId, { quantity: remainingQty }).catch(() => { });
                }
              } catch { }
            }
          }

          // Move Stop Loss of remaining runner to Cost (Risk-Free)
          state.stopLossPrice = state.entryPrice;
          state.isBreakevenTrailed = true;
          this.log(state, `🛡 [THE RUNNER ACTIVATED] Remaining ${remainingQty} qty SL moved to COST (₹${state.entryPrice.toFixed(2)}) — Risk-Free Trade! Trailing on 9/15-EMA & VWAP.`);
          await this.updateBrokerSlSafe(client, client?.['kite'], state, symbol);
        }
      }

      // ── 4. Target 1 Milestone (+2R) -> Activate Uncapped Momentum Trailing ─
      const targetR = state.config.riskRewardRatio ?? 2.0;
      if (pnlPoints >= (risk * targetR) && !state.isDynamicTrailingActive) {
        state.isDynamicTrailingActive = true;
        const lockPrice = this.roundTick(isLong ? state.entryPrice + (risk * 1.25) : state.entryPrice - (risk * 1.25), symTickSize);
        if ((isLong && lockPrice > (state.stopLossPrice || 0)) || (!isLong && lockPrice < (state.stopLossPrice || Infinity))) {
          state.stopLossPrice = lockPrice;
        }
        this.log(state, `🚀 Target 1 Milestone Hit (+${pnlPoints.toFixed(2)} pts / ₹${pnlRs.toFixed(2)})! Activating Uncapped Momentum Trailing to ride full trend runner.`);
        await this.updateBrokerSlSafe(client, client?.['kite'], state, symbol);
      }

      // ── 5. Dynamic Ratchet Trailing (Beyond Target 1 or when trailing) ────
      if (state.config.enableTrailingSl !== false && (state.isDynamicTrailingActive || state.isBreakevenTrailed)) {
        if (isLong) {
          state.highestPriceReached = Math.max(state.highestPriceReached || currentPrice, currentPrice);
          const trailDist = state.isDynamicTrailingActive ? (risk * 0.60) : (risk * 0.80);
          const newSl = this.roundTick(state.highestPriceReached - trailDist, symTickSize);
          if (newSl > (state.stopLossPrice || 0)) {
            state.stopLossPrice = newSl;
            this.log(state, `📈 Dynamic Momentum Trail: Peak ₹${state.highestPriceReached.toFixed(2)} -> Trailed SL to ₹${newSl.toFixed(2)}`);
            await this.updateBrokerSlSafe(client, client?.['kite'], state, symbol);
          }
        } else {
          state.lowestPriceReached = Math.min(state.lowestPriceReached || currentPrice, currentPrice);
          const trailDist = state.isDynamicTrailingActive ? (risk * 0.60) : (risk * 0.80);
          const newSl = this.roundTick(state.lowestPriceReached + trailDist, symTickSize);
          if (newSl < (state.stopLossPrice || Infinity)) {
            state.stopLossPrice = newSl;
            this.log(state, `📈 Dynamic Momentum Trail: Low ₹${state.lowestPriceReached.toFixed(2)} -> Trailed SL to ₹${newSl.toFixed(2)}`);
            await this.updateBrokerSlSafe(client, client?.['kite'], state, symbol);
          }
        }
      }

      // ── 5.1 Dynamic 9/15 EMA & VWAP Trailing ─────────────────────────────
      if (state.config.enableEmaVwapTrailing !== false && (state.isDynamicTrailingActive || state.isBreakevenTrailed || pnlPoints > 0) && state.entryPrice) {
        const vwapSource = state.config.trailingVwapSource || 'both';
        let trendSupport: number | null = null;
        if (vwapSource === 'both') {
          trendSupport = (state.lastEma && state.lastVwap)
            ? (isLong ? Math.max(state.lastEma, state.lastVwap) : Math.min(state.lastEma, state.lastVwap))
            : (state.lastEma || state.lastVwap || null);
        } else if (vwapSource === 'ema') {
          trendSupport = state.lastEma || null;
        } else if (vwapSource === 'vwap') {
          trendSupport = state.lastVwap || null;
        }

        if (trendSupport !== null && !isOption) {
          const isSupportInProfit = isLong ? (trendSupport > state.entryPrice) : (trendSupport < state.entryPrice);
          if (isSupportInProfit) {
            const roundedSl = this.roundTick(trendSupport, symTickSize);
            const isBetterSl = isLong ? (roundedSl > (state.stopLossPrice || 0)) : (roundedSl < (state.stopLossPrice || Infinity));
            if (isBetterSl) {
              state.stopLossPrice = roundedSl;
              state.isTrailingEma = true;
              this.log(state, `📈 [${state.config.trailingEmaPeriod || 9}-EMA & VWAP TRAIL] Dynamic trend support advanced to ₹${roundedSl.toFixed(2)} (in profit)! Trailing SL to lock gains.`);
              await this.updateBrokerSlSafe(client, client?.['kite'], state, symbol);
            }
          }
        }
      }

      // ── 5.2 Parabolic Momentum & VWAP Profit-Lock (TTML Spike Protection) ──
      const gainPct = state.entryPrice ? (Math.abs(currentPrice - state.entryPrice) / state.entryPrice) * 100 : 0;
      const isParabolicTrigger = gainPct >= 2.5 || (pnlPoints >= (risk * 2.0));
      if (state.config.enableParabolicVwapLock !== false && isParabolicTrigger && state.entryPrice && !isOption) {
        if (!state.isParabolicActive) {
          state.isParabolicActive = true;
          this.log(state, `🚀 [PARABOLIC MOMENTUM ACTIVE] Stock surged +${gainPct.toFixed(2)}% (+${(pnlPoints / risk).toFixed(1)}R)! Dynamic floor transferred to Session VWAP (₹${(state.lastVwap || 0).toFixed(2)}) to lock peak gains.`);
        }
        if (state.lastVwap) {
          const roundedVwap = this.roundTick(state.lastVwap, symTickSize);
          const isBetterVwap = isLong ? (roundedVwap > (state.stopLossPrice || 0)) : (roundedVwap < (state.stopLossPrice || Infinity));
          if (isBetterVwap) {
            state.stopLossPrice = roundedVwap;
            await this.updateBrokerSlSafe(client, client?.['kite'], state, symbol);
          }
        }
      }

      // ── 6. Stop Loss Hit Trigger ──────────────────────────────────────────
      const isHitSL = isLong ? (currentPrice <= (state.stopLossPrice || 0)) : (currentPrice >= (state.stopLossPrice || Infinity));
      if (isHitSL) {
        if (isExiting) return;
        isExiting = true;
        const isProfitExit = isLong ? (currentPrice >= state.entryPrice!) : (currentPrice <= state.entryPrice!);
        this.log(state, `${isProfitExit ? '🎯 Trailing Stop Hit' : '🛑 Stop Loss Hit'} at ₹${currentPrice.toFixed(2)} (Trigger: ₹${(state.stopLossPrice || 0).toFixed(2)}) | P&L: ₹${pnlRs.toFixed(2)}`);
        await this.exitPosition(state, client, currentPrice, isProfitExit ? 'TARGET' : 'SL');
        return;
      }

      // ── Real-Time WebSocket State Broadcast (500ms throttle) ─────────────
      if (now - (state.lastEmitTime || 0) >= 500) {
        state.lastEmitTime = now;
        strategyEvents.emit('strategy.update', {
          strategyId: state.strategyId,
          logs: state.logs,
          state: this.getState(state.strategyId),
        });
      }

      // ── Throttled Live P&L Logging (every 15 seconds) ─────────────────────
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

  private async updateBrokerSlSafe(client: any, kite: any, state: StrategyState, symbol: string) {
    if (state.isPaperTrade || !state.slOrderId || state.slOrderId === 'FAILED' || !state.stopLossPrice) return;
    try {
      const symTickSize = state.optionSymbol ? 0.05 : getInstrumentTickSize(symbol, state.stopLossPrice);
      const isLong = state.entryTriggered === 'LONG' || !!state.optionSymbol;
      const triggerPrice = this.roundTick(state.stopLossPrice, symTickSize);
      const limitPrice = this.roundTick(isLong ? triggerPrice - symTickSize * 3 : triggerPrice + symTickSize * 3, symTickSize);

      if (state.lastBrokerSlTrigger !== undefined && Math.abs(triggerPrice - state.lastBrokerSlTrigger) < symTickSize) {
        return;
      }

      const now = Date.now();
      if (state.lastBrokerSlModifyTime && (now - state.lastBrokerSlModifyTime) < 2000) {
        return;
      }

      const k = kite || client?.['kite'] || client;
      if (client && client.modifyOrder) {
        await client.modifyOrder(state.slOrderId, {
          triggerPrice,
          price: limitPrice,
        }).catch((e: any) => {
          this.logger.warn(`Broker SL modify notice: ${e.message}`);
        });
        state.lastBrokerSlTrigger = triggerPrice;
        state.lastBrokerSlModifyTime = now;
        this.log(state, `🛡 Synced Trailing SL to Zerodha Exchange (${state.slOrderId}) -> Trigger: ₹${triggerPrice.toFixed(2)}, Limit: ₹${limitPrice.toFixed(2)}`);
      } else if (k && k.modifyOrder) {
        await k.modifyOrder('regular', state.slOrderId, {
          trigger_price: triggerPrice,
          price: limitPrice,
        }).catch((e: any) => {
          this.logger.warn(`Broker SL modify notice: ${e.message}`);
        });
        state.lastBrokerSlTrigger = triggerPrice;
        state.lastBrokerSlModifyTime = now;
        this.log(state, `🛡 Synced Trailing SL to Zerodha Exchange (${state.slOrderId}) -> Trigger: ₹${triggerPrice.toFixed(2)}, Limit: ₹${limitPrice.toFixed(2)}`);
      }
    } catch (e: any) {
      this.logger.warn(`Failed to update broker SL order: ${e.message}`);
    }
  }

  private async exitPosition(state: StrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET' | 'FORCE_CLOSE' | 'EOD') {
    const { config } = state;
    const symbol = state.optionSymbol || state.futureSymbol || config.symbol;
    const exchange = state.optionSymbol ? (symbol.startsWith('SENSEX') ? 'BFO' : 'NFO') : (state.futureExchange || config.exchange);
    const isOption = !!state.optionSymbol;
    const isLong = isOption || state.entryTriggered === 'LONG';
    const exitSide = isLong ? 'SELL' : 'BUY';
    const qty = state.executedQty || config.qty;

    this.stopRealtimeMonitor(state);

    let actualExitPrice = exitPrice;
    let exitOrderId = '';
    let exitOrderType: 'MARKET' | 'LIMIT' | 'SL' = 'MARKET';

    if (state.isPaperTrade) {
      exitOrderId = `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`;
      await this.prisma.order.updateMany({
        where: { executionId: state.executionId, isPaperTrade: true, status: 'OPEN' },
        data: { status: 'COMPLETE', price: actualExitPrice }
      });
      this.log(state, `🏁 Paper trade closed (${reason}) at ₹${actualExitPrice.toFixed(2)}`);
    } else {
      const kite = client?.['kite'] || client;
      let isAlreadyFilledAtBroker = false;

      // 1. Check if server SL order completed at broker
      if (kite && state.slOrderId && state.slOrderId !== 'FAILED') {
        try {
          const orders = await kite.getOrders().catch(() => []);
          const slOrder = orders.find((o: any) => o.order_id === state.slOrderId);
          if (slOrder && slOrder.status === 'COMPLETE') {
            isAlreadyFilledAtBroker = true;
            exitOrderId = state.slOrderId;
            exitOrderType = 'SL';
            if (slOrder.average_price && Number(slOrder.average_price) > 0) {
              actualExitPrice = Number(slOrder.average_price);
            }
            this.log(state, `🛑 Confirmed Broker SL Order executed: ${exitOrderId} @ ₹${actualExitPrice.toFixed(2)}`);
          }
        } catch { }
      }

      if (!isAlreadyFilledAtBroker) {
        // Cancel pending broker SL order before placing market exit
        await this.cancelBrokerOrderSafe(client, state.slOrderId);
        await this.cancelBrokerOrderSafe(client, state.targetOrderId);

        // Check if user already manually squared off on Zerodha mobile app
        let isManuallyClosed = false;
        try {
          if (kite && kite.getPositions) {
            const pos = await kite.getPositions().catch(() => null);
            const allPos = [...(pos?.net || []), ...(pos?.day || [])];
            const currentPos = allPos.find((p: any) => p.tradingsymbol === symbol);
            const liveNetQty = currentPos ? Math.abs(currentPos.quantity) : 0;
            if (liveNetQty === 0 && reason !== 'FORCE_CLOSE') {
              isManuallyClosed = true;
              this.log(state, `ℹ [AUTO-SYNC] ${symbol} was already squared off manually on Zerodha. Skipping duplicate exit order.`);
            }
          }
        } catch { }

        if (!isManuallyClosed && client) {
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

      // Track exit order in DB
      try {
        const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
        if (account) {
          await this.trackOrder(state, account, state.executionId, {
            symbol,
            exchange,
            side: exitSide,
            orderType: exitOrderType,
            product: config.product ?? 'MIS',
            qty,
            price: actualExitPrice
          }, exitOrderId || `EXIT_${Date.now()}`, state.strategyId);
        }
      } catch { }
    }

    const tradePnlPoints = isLong ? (actualExitPrice - (state.entryPrice || actualExitPrice)) : ((state.entryPrice || actualExitPrice) - actualExitPrice);
    const tradePnlRs = tradePnlPoints * qty;
    state.dailyRealizedPnlRs = (state.dailyRealizedPnlRs || 0) + tradePnlRs;
    const slippage = actualExitPrice - exitPrice;
    this.log(state, `🏁 Trade cycle complete (${reason}) @ ₹${actualExitPrice.toFixed(2)} | Realized P&L: ${tradePnlRs >= 0 ? '+' : ''}₹${tradePnlRs.toFixed(2)} (${tradePnlPoints >= 0 ? '+' : ''}${tradePnlPoints.toFixed(2)} pts)${slippage !== 0 ? ` [Slippage: ${slippage > 0 ? '+' : ''}₹${slippage.toFixed(2)}]` : ''}`);

    if (state.config.enableTrendReEntry !== false && (state.reEntryCountToday || 0) < 1 && (reason === 'TARGET' || state.isTrailingEma)) {
      state.reEntryEligible = true;
      state.reEntrySwingPrice = state.highestPriceReached || state.entryPrice;
      this.log(state, `🔁 [RE-ENTRY ARMED] ${symbol} exited trend trail. If price reclaims ${config.trailingEmaPeriod || 15}-EMA and breaks swing high (₹${(state.reEntrySwingPrice || 0).toFixed(2)}) with VWAP support, Leg 2 Re-Entry will execute!`);
    }

    if (reason === 'SL') {
      state.dailyLossesCount = (state.dailyLossesCount || 0) + 1;
      const maxLossesAllowed = config.maxLossesPerDay ?? 1;
      this.log(state, `🛑 Daily SL Hit #${state.dailyLossesCount} recorded.`);
      if (state.dailyLossesCount >= maxLossesAllowed) {
        this.log(state, `🛡 [1-LOSS CAPITAL SHIELD ACTIVATED] Daily max allowable loss limit reached (${state.dailyLossesCount}/${maxLossesAllowed}). Halting all new entries today to preserve capital and eliminate chop drawdowns.`);
      }
      state.lastBreakoutAttempt = {
        side: state.entryTriggered!,
        timestamp: Date.now(),
        failed: true,
        breakoutPrice: state.entryPrice || 0
      };
      this.log(state, `⚠ Flagged ${state.entryTriggered} breakout as FAILED. Monitoring for Liquidity Trap Reversal.`);
    } else {
      state.lastBreakoutAttempt = null;
    }

    // Reset position state
    state.entryTriggered = null;
    state.entryFilled = false;
    state.entryPrice = null;
    state.stopLossPrice = null;
    state.targetPrice = null;
    state.slOrderId = null;
    state.targetOrderId = null;
    state.isBreakevenTrailed = false;
    state.isProfitLockTrailed = false;
    state.isDynamicTrailingActive = false;
    state.isPartialBooked = false;
    state.executedQty = undefined;
    state.currentPnlRs = 0;
    state.currentPnlPct = 0;

    // Check Daily P&L Target or Max Loss Lock (One-and-Done)
    const targetRs = config.targetRs && config.targetRs > 0 ? config.targetRs : 1500;
    const maxLossRs = config.stopLossRs && config.stopLossRs > 0 ? config.stopLossRs : 1000;
    if (config.enableDailyPnLLock !== false) {
      if (state.dailyRealizedPnlRs >= targetRs) {
        this.log(state, `🏆 Daily Profit Target Reached (+₹${state.dailyRealizedPnlRs.toFixed(2)} >= ₹${targetRs})! One-and-Done rule locking strategy for the day.`);
        await this.stopWithStatus(state.strategyId, 'COMPLETED', `Daily Profit Target achieved (+₹${state.dailyRealizedPnlRs.toFixed(2)})`);
        return;
      } else if (state.dailyRealizedPnlRs <= -maxLossRs) {
        this.log(state, `🛑 Daily Max Loss Threshold Hit (-₹${Math.abs(state.dailyRealizedPnlRs).toFixed(2)} >= ₹${maxLossRs})! Halting strategy for capital preservation.`);
        await this.stopWithStatus(state.strategyId, 'STOPPED', `Daily Max Loss limit reached (-₹${Math.abs(state.dailyRealizedPnlRs).toFixed(2)})`);
        return;
      }
    }

    await this.persistLogs(state);
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
      const currentQty = state.executedQty || state.config.qty;
      const currentPnlPoints = isLong ? (ltp - state.entryPrice!) : (state.entryPrice! - ltp);
      const pnlRs = currentPnlPoints * currentQty;
      const pnlPct = state.entryPrice ? (currentPnlPoints / state.entryPrice) * 100 : 0;
      state.currentPnlRs = pnlRs;
      state.currentPnlPct = pnlPct;
      state.peakPnlRs = Math.max(state.peakPnlRs || 0, pnlRs);

      const risk = state.initialRiskPoints || Math.max(0.50, Math.abs((state.entryPrice || ltp) - (state.stopLossPrice || ltp)));
      const breakevenPoints = risk * (state.config.breakevenTriggerR ?? 0.7);

      // Breakeven Trail
      if (state.config.enableBreakevenTrail !== false && !state.isBreakevenTrailed && currentPnlPoints >= breakevenPoints && state.entryPrice) {
        state.stopLossPrice = state.entryPrice;
        state.isBreakevenTrailed = true;
        this.log(state, `🛡 (Paper Protection) Position hit +${(state.config.breakevenTriggerR ?? 0.7).toFixed(1)}R profit! Trailed SL to COST (₹${state.entryPrice.toFixed(2)}) — Risk-Free!`);
      }

      // Dynamic Trailing
      if (state.config.enableTrailingSl !== false && state.isBreakevenTrailed) {
        if (isLong) {
          state.highestPriceReached = Math.max(state.highestPriceReached || ltp, ltp);
          const trailDist = risk * 0.8;
          const newSl = this.roundTick(state.highestPriceReached - trailDist);
          if (newSl > (state.stopLossPrice || 0)) {
            state.stopLossPrice = newSl;
            this.log(state, `📈 (Paper Trailing) High ₹${state.highestPriceReached.toFixed(2)}. Trailed SL to ₹${newSl.toFixed(2)}`);
          }
        }
      }

      const isHitSL = isLong ? (ltp <= (state.stopLossPrice || 0)) : (ltp >= (state.stopLossPrice || Infinity));
      const isHitTarget = isLong ? (state.targetPrice && ltp >= state.targetPrice) : (state.targetPrice && ltp <= state.targetPrice);

      if (isHitSL) {
        this.log(state, `🔴 PAPER SL HIT! ${symbol} at ₹${ltp} | Final P&L: ₹${pnlRs.toFixed(2)}`);
        await this.exitPosition(state, null, ltp, 'SL');
      } else if (isHitTarget) {
        this.log(state, `🟢 PAPER TARGET HIT! ${symbol} at ₹${ltp} | Final P&L: ₹${pnlRs.toFixed(2)}`);
        await this.exitPosition(state, null, ltp, 'TARGET');
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
          const fillPrice = Number(entryOrder.average_price) || Number(entryOrder.price) || state.entryPrice!;
          state.entryPrice = fillPrice;
          this.log(state, `🛒 Entry Order FILLED at ₹${fillPrice.toFixed(2)}. Arming Server Stop Loss order at Zerodha...`);
          await this.prisma.order.updateMany({
            where: { executionId: state.executionId, brokerOrderId: state.entryOrderId },
            data: { status: 'COMPLETE', price: fillPrice }
          });

          // Arm server-side Stop Loss on Zerodha
          const { config, executionId } = state;
          const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
          const symbol = state.optionSymbol || state.futureSymbol || state.config.symbol;
          const exchange = state.optionSymbol ? (symbol.startsWith('SENSEX') ? 'BFO' : 'NFO') : (state.futureExchange || state.config.exchange);
          const isOption = !!state.optionSymbol;
          const isLong = isOption || state.entryTriggered === 'LONG';
          const exitSide = isLong ? 'SELL' : 'BUY';
          const symTickSize = isOption ? 0.05 : getInstrumentTickSize(symbol, fillPrice);
          const sl = state.stopLossPrice!;
          const triggerPrice = this.roundTick(sl, symTickSize);
          const limitPrice = this.roundTick(isLong ? triggerPrice - symTickSize * 3 : triggerPrice + symTickSize * 3, symTickSize);
          const qty = state.executedQty || config.qty;

          const slId = await client.placeOrder({
            symbol,
            exchange,
            side: exitSide,
            orderType: 'SL',
            product: config.product ?? 'MIS',
            qty,
            price: limitPrice,
            triggerPrice,
          }).catch((e: any) => {
            this.log(state, `❌ SL Order Failed: ${e.message}`);
            return 'FAILED';
          });
          state.slOrderId = slId;
          state.lastBrokerSlTrigger = triggerPrice;
          state.lastBrokerSlModifyTime = Date.now();

          await this.trackOrder(state, account, executionId, {
            symbol,
            exchange,
            side: exitSide,
            orderType: 'SL',
            product: config.product,
            qty,
            price: limitPrice,
            triggerPrice
          }, slId, state.executionId);

          this.log(state, `🛡 Server Stop Loss Armed at Zerodha (${qty} qty): Trigger ₹${triggerPrice.toFixed(2)}, Limit ₹${limitPrice.toFixed(2)} | OrderId: ${slId}. Target 1 (₹${state.targetPrice?.toFixed(2)}) will activate Uncapped Momentum Trailing.`);
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
    } catch (err: any) {
      this.logger.error(`Real trade monitor error: ${err.message}`);
    }
  }

  private async closePaperTrade(state: StrategyState, reason: string, price: number) {
    await this.exitPosition(state, null, price, reason === 'TARGET_HIT' ? 'TARGET' : 'SL');
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

  private async checkMarketTrendAlignment(client: any, trend: 'BUY' | 'SELL'): Promise<{ isAligned: boolean; reason?: string }> {
    try {
      const kite = client?.['kite'] || client;
      if (!kite || !kite.getQuote) return { isAligned: true };
      const quotes = await kite.getQuote(['NSE:NIFTY 50']).catch(() => null);
      const nifty = quotes?.['NSE:NIFTY 50'];
      if (!nifty?.last_price || !nifty?.ohlc?.open) return { isAligned: true };

      const ltp = nifty.last_price;
      const open = nifty.ohlc.open;
      const changePct = ((ltp - open) / open) * 100;

      if (trend === 'BUY' && changePct < -0.30) {
        return {
          isAligned: false,
          reason: `NIFTY 50 is in sharp decline (${changePct.toFixed(2)}% from Open: ₹${open.toFixed(1)} -> ₹${ltp.toFixed(1)})`
        };
      }
      if (trend === 'SELL' && changePct > 0.30) {
        return {
          isAligned: false,
          reason: `NIFTY 50 is in strong bull rally (${changePct.toFixed(2)}% from Open: ₹${open.toFixed(1)} -> ₹${ltp.toFixed(1)})`
        };
      }
      return { isAligned: true };
    } catch {
      return { isAligned: true };
    }
  }

  private getLotSizeForUnderlying(underlying: string): number {
    const upper = (underlying || '').toUpperCase().trim();
    if (upper.includes('BANKNIFTY')) return 30;
    if (upper.includes('FINNIFTY')) return 65;
    if (upper.includes('MIDCPNIFTY')) return 120;
    if (upper.includes('SENSEX')) return 20;
    return 65; // Nifty default
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

  private async placeBreakoutTrade(strategyId: string, state: StrategyState, client: any, account: any, side: 'BUY' | 'SELL', triggerPrice: number, triggerTime?: Date, refLow?: number, refHigh?: number, breakoutCandle?: Candle) {
    const { config } = state;
    const kite = client['kite'] || client;
    let symbol = config.symbol, exchange = config.exchange, finalSide: 'BUY' | 'SELL' = side;

    const stopLow = refLow ?? state.refLow;
    const stopHigh = refHigh ?? state.refHigh;

    const upper = config.symbol.toUpperCase().trim();
    const clean = upper.replace(/:NSE|:BSE|:NFO|:BFO/g, '').trim();
    const isIndex = (config.instrumentType as string) === 'INDEX' || (config.instrumentType as string) === 'OPTION' || clean.includes('NIFTY') || clean.includes('SENSEX') || clean.includes('BANKNIFTY') || clean.includes('FINNIFTY') || clean.includes('MIDCPNIFTY');
    const dynamicAtr = state.dynamicAtr || (Math.abs((stopHigh || 0) - (stopLow || 0)) * 0.5) || 20;
    const rr = config.riskRewardRatio ?? 2.0;

    // ─── Query Live Zerodha Available Capital & Dynamic Margin Sizing ───────
    let capital = (config as any).maxCapital;
    if (!capital || capital <= 0) {
      if (client && !state.isPaperTrade && !triggerTime) {
        try {
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
            let optionRisk = config.enableDynamicAtr !== false
              ? this.roundTick(Math.max(2.0, entry * 0.12))
              : this.roundTick(Math.max(2.0, config.stopLossRs ? (config.stopLossRs / config.qty) : (entry * 0.15)));

            // Structural Candle / Sweep SL for Option Buying (Tied to underlying sweep extreme + Delta)
            if (config.useStructuralCandleSl !== false && (breakoutCandle || state.isTrapTrade)) {
              const sweepExtreme = side === 'BUY'
                ? (state.isTrapTrade && state.sweptLowPrice ? state.sweptLowPrice : breakoutCandle?.low || triggerPrice)
                : (state.isTrapTrade && state.sweptHighPrice ? state.sweptHighPrice : breakoutCandle?.high || triggerPrice);
              const underlyingRisk = side === 'BUY'
                ? Math.max(10, triggerPrice - sweepExtreme)
                : Math.max(10, sweepExtreme - triggerPrice);
              const deltaRisk = this.roundTick(Math.max(6.0, Math.min(entry * 0.15, underlyingRisk * 0.52)));
              optionRisk = deltaRisk;
              this.log(state, `🛡 ${state.isTrapTrade ? '⚡ Liquidity Sweep Trap SL' : 'Structural Candle SL'} for Option: Underlying risk ${underlyingRisk.toFixed(1)} pts (Sweep Extreme: ₹${sweepExtreme.toFixed(2)}) -> Option SL Risk: ${optionRisk.toFixed(1)} pts.`);
            }

            const sl = this.roundTick(Math.max(1.0, entry - optionRisk));
            const risk = Math.max(0.50, entry - sl);
            const tgt = this.roundTick(entry + (risk * rr));
            state.initialRiskPoints = risk;

            // Dynamic Option Lot Sizing
            const lotSize = this.getLotSizeForUnderlying(clean);
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
            this.log(state, `⚖ Dynamic Option Sizing: ${dynamicLots} lots (${tradeQty} qty, ₹${(tradeQty * entry).toLocaleString('en-IN')} deployed / ₹${capital.toLocaleString('en-IN')} capital [Buffer: ₹${capitalBuffer.toFixed(0)}])`);

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

    // Adaptive structural SL & Candle Range
    const candleRangePct = (stopHigh && stopLow && entry > 0) ? ((stopHigh - stopLow) / entry) * 100 : 0;
    const isWideCandle = candleRangePct > 0.80;

    const isBankNifty = clean.includes('BANKNIFTY');
    const isNifty = clean.includes('NIFTY');
    const minRisk = isBankNifty ? 40 : (isNifty ? 18 : Math.max(0.5, entry * 0.003));
    const maxRisk = isBankNifty ? 85 : (isNifty ? 35 : Math.max(2.0, entry * 0.015));

    if (side === 'BUY') {
      if (state.isTrapTrade && state.sweptLowPrice) {
        const buffer = config.trapSlBufferPts ?? Math.max(5, dynamicAtr * 0.1);
        sl = this.roundTick(state.sweptLowPrice - buffer);
        this.log(state, `🛡 Institutional Liquidity Sweep SL (Bear Trap): Sweep Low ₹${state.sweptLowPrice.toFixed(2)} - ₹${buffer} buffer -> SL: ₹${sl.toFixed(2)} (${(entry - sl).toFixed(1)} pts risk vs ₹${stopLow ? (entry - stopLow).toFixed(1) : 'N/A'} pts range risk).`);
      } else if (config.useStructuralCandleSl !== false && breakoutCandle) {
        const buffer = Math.max(0.05, dynamicAtr * 0.05);
        const candleLow = breakoutCandle.low - buffer;
        const rawRisk = entry - candleLow;
        const clampedRisk = Math.max(minRisk, Math.min(maxRisk, rawRisk));
        sl = this.roundTick(entry - clampedRisk);
        this.log(state, `🛡 Structural Candle SL: Breakout candle low ₹${breakoutCandle.low.toFixed(2)} -> SL: ₹${sl.toFixed(2)} (${clampedRisk.toFixed(1)} pts tight risk vs ₹${stopLow ? (entry - stopLow).toFixed(1) : 'N/A'} pts range risk).`);
      } else if (isWideCandle && stopHigh && stopLow) {
        const midpoint = (stopHigh + stopLow) / 2;
        sl = this.roundTick(midpoint);
        this.log(state, `📏 Wide Reference Candle (${candleRangePct.toFixed(2)}% range). Using adaptive 50% midpoint SL at ₹${sl.toFixed(2)} instead of extreme low (₹${stopLow.toFixed(2)}).`);
      } else if (config.enableDynamicAtr !== false) {
        sl = this.roundTick(entry - dynamicRisk);
      } else {
        sl = stopLow ? this.roundTick(stopLow) : this.roundTick(entry - config.stopLossRs / config.qty);
      }
      const risk = Math.max(0.50, Math.abs(entry - sl));
      tgt = this.roundTick(entry + (risk * rr));
      state.initialRiskPoints = risk;
    } else {
      if (state.isTrapTrade && state.sweptHighPrice) {
        const buffer = config.trapSlBufferPts ?? Math.max(5, dynamicAtr * 0.1);
        sl = this.roundTick(state.sweptHighPrice + buffer);
        this.log(state, `🛡 Institutional Liquidity Sweep SL (Bull Trap): Sweep High ₹${state.sweptHighPrice.toFixed(2)} + ₹${buffer} buffer -> SL: ₹${sl.toFixed(2)} (${(sl - entry).toFixed(1)} pts risk vs ₹${stopHigh ? (stopHigh - entry).toFixed(1) : 'N/A'} pts range risk).`);
      } else if (config.useStructuralCandleSl !== false && breakoutCandle) {
        const buffer = Math.max(0.05, dynamicAtr * 0.05);
        const candleHigh = breakoutCandle.high + buffer;
        const rawRisk = candleHigh - entry;
        const clampedRisk = Math.max(minRisk, Math.min(maxRisk, rawRisk));
        sl = this.roundTick(entry + clampedRisk);
        this.log(state, `🛡 Structural Candle SL: Breakout candle high ₹${breakoutCandle.high.toFixed(2)} -> SL: ₹${sl.toFixed(2)} (${clampedRisk.toFixed(1)} pts tight risk vs ₹${stopHigh ? (stopHigh - entry).toFixed(1) : 'N/A'} pts range risk).`);
      } else if (isWideCandle && stopHigh && stopLow) {
        const midpoint = (stopHigh + stopLow) / 2;
        sl = this.roundTick(midpoint);
        this.log(state, `📏 Wide Reference Candle (${candleRangePct.toFixed(2)}% range). Using adaptive 50% midpoint SL at ₹${sl.toFixed(2)} instead of extreme high (₹${stopHigh.toFixed(2)}).`);
      } else if (config.enableDynamicAtr !== false) {
        sl = this.roundTick(entry + dynamicRisk);
      } else {
        sl = stopHigh ? this.roundTick(stopHigh) : this.roundTick(entry - config.stopLossRs / config.qty);
      }
      const risk = Math.max(0.50, Math.abs(sl - entry));
      tgt = this.roundTick(entry - (risk * rr));
      state.initialRiskPoints = risk;
    }

    // Dynamic Margin Allocation for Equity (5x MIS Leverage with 15% Cash Buffer)
    const capitalBuffer = Math.max(1000, capital * 0.15);
    const tradeableCapital = Math.max(2000, capital - capitalBuffer);
    const maxBuyingPower = (capital * 0.90) * 5; // Zerodha 5x MIS leverage
    const targetBuyingPower = tradeableCapital * 0.85 * 5;
    const capitalQty = Math.max(1, Math.floor(targetBuyingPower / entry));
    const maxCapitalQty = Math.floor(maxBuyingPower / entry);
    const finalQty = Math.max(1, Math.min(capitalQty, maxCapitalQty));
    state.config.qty = finalQty;
    this.log(state, `⚖ Dynamic Margin-Scaled Position Sizing (5x MIS): ${finalQty} shares (Margin: ₹${((finalQty * entry) / 5).toFixed(0)} / ₹${capital.toLocaleString('en-IN')} [15% Cash Buffer: ₹${capitalBuffer.toFixed(0)}])`);

    if (isIndex) {
      this.log(state, `⚠ Falling back to ${symbol} (Spot/Future) as no suitable option was found.`);
    }
    await this.executeOrders(strategyId, state, client, account, symbol, exchange, side, entry, sl, tgt, triggerTime);
  }

  private async executeOrders(strategyId: string, state: StrategyState, client: any, account: any, symbol: string, exchange: string, side: 'BUY' | 'SELL', entry: number, sl: number, tgt: number, triggerTime?: Date) {
    const { config, executionId } = state;
    this.log(state, `📋 Placing ${state.isReversalTrade ? '⚡ REVERSAL' : '🚀 BREAKOUT'}: ${symbol} — Entry: ₹${entry.toFixed(2)} | Dynamic SL: ₹${sl.toFixed(2)} | Target (1:${(config.riskRewardRatio ?? 2.0).toFixed(1)} RR + Uncapped Trail): ₹${tgt.toFixed(2)}`);

    state.stopLossPrice = sl;
    state.initialSlPrice = sl;
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
    state.isProfitLockTrailed = false;
    state.isDynamicTrailingActive = false;
    state.highestPriceReached = entry;
    state.lowestPriceReached = entry;
    const symTickSize = isOption ? 0.05 : getInstrumentTickSize(symbol, entry);

    if (state.isPaperTrade || triggerTime) {
      const entryId = `PAPER_ENTRY_${Math.random().toString(36).substring(7).toUpperCase()}`;
      state.entryOrderId = entryId;
      state.entryFilled = true;
      state.executedQty = config.qty;
      const exitSide = side === 'BUY' ? 'SELL' : 'BUY';
      const slId = `PAPER_SL_${Math.random().toString(36).substring(7).toUpperCase()}`;
      state.slOrderId = slId;

      this.log(state, `✅ Paper Entry Order (Simulated @ ₹${entry.toFixed(2)}): ${entryId} (${config.qty} qty)`);
      await this.trackOrder(state, account, executionId, { symbol, exchange, side, orderType: 'LIMIT', product: config.product, qty: config.qty, price: entry, triggerPrice: entry }, entryId, strategyId, triggerTime);
      await this.trackOrder(state, account, executionId, { symbol, exchange, side: exitSide, orderType: 'SL', product: config.product, qty: config.qty, price: sl, triggerPrice: sl }, slId, strategyId, triggerTime);

      // Start real-time tracking if placed live
      if (!triggerTime) {
        await this.startRealtimeMonitor(state, client);
      }
      return;
    }

    // LIVE ORDER EXECUTION:
    const limitPrice = side === 'BUY' ? this.roundTick(entry + symTickSize * 3, symTickSize) : this.roundTick(entry - symTickSize * 3, symTickSize);
    const entryId = await client.placeOrder({ symbol, exchange, side, orderType: 'LIMIT', product: config.product ?? 'MIS', qty: config.qty, price: limitPrice });
    state.entryOrderId = entryId;
    this.log(state, `✅ Live Entry Order placed (LIMIT @ ₹${limitPrice.toFixed(2)}): ${entryId}`);
    await this.trackOrder(state, account, executionId, { symbol, exchange, side, orderType: 'LIMIT', product: config.product, qty: config.qty, price: limitPrice }, entryId, strategyId, triggerTime);

    let executedQty = config.qty;
    let actualEntryPrice = entry;
    const kite = client?.['kite'] || client;

    if (kite) {
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
            state.entryFilled = true;
            this.log(state, `📊 Broker Entry Status: ${status} | Executed: ${executedQty}/${config.qty} @ Avg ₹${actualEntryPrice.toFixed(2)}`);
          } else if (status === 'REJECTED' || status === 'CANCELLED') {
            this.log(state, `❌ Entry order ${entryId} was ${status}: ${entryOrder.status_message || 'Order rejected by broker'}`);
            state.entryTriggered = null;
            state.entryOrderId = null;
            return;
          } else {
            this.log(state, `⏳ Entry order ${entryId} is ${status} (0 filled so far). Monitoring for fill confirmation...`);
            state.entryFilled = false;
            executedQty = 0;
          }
        }
      } catch (e: any) {
        this.log(state, `⚠ Order status check notice: ${e.message}`);
      }
    }

    state.executedQty = executedQty;
    state.entryPrice = actualEntryPrice;

    // Recalculate SL and Target based on actualEntryPrice
    const isLong = side === 'BUY';
    const exitSide = isLong ? 'SELL' : 'BUY';
    const risk = Math.max(0.50, Math.abs(actualEntryPrice - sl));
    state.initialRiskPoints = risk;
    const tgtPrice = isLong ? this.roundTick(actualEntryPrice + risk * (config.riskRewardRatio ?? 2.0), symTickSize) : this.roundTick(actualEntryPrice - risk * (config.riskRewardRatio ?? 2.0), symTickSize);
    state.targetPrice = tgtPrice;

    // Arm Server-side SL-L order at Zerodha if shares filled
    if (state.entryFilled && executedQty > 0) {
      const triggerPrice = this.roundTick(sl, symTickSize);
      const slLimitPrice = this.roundTick(isLong ? triggerPrice - symTickSize * 3 : triggerPrice + symTickSize * 3, symTickSize);

      const slId = await client.placeOrder({
        symbol,
        exchange,
        side: exitSide,
        orderType: 'SL',
        product: config.product ?? 'MIS',
        qty: executedQty,
        price: slLimitPrice,
        triggerPrice,
      }).catch((e: any) => {
        this.log(state, `❌ Server SL Order Failed: ${e.message}`);
        return 'FAILED';
      });

      state.slOrderId = slId;
      state.lastBrokerSlTrigger = triggerPrice;
      state.lastBrokerSlModifyTime = Date.now();

      await this.trackOrder(state, account, executionId, {
        symbol,
        exchange,
        side: exitSide,
        orderType: 'SL',
        product: config.product,
        qty: executedQty,
        price: slLimitPrice,
        triggerPrice
      }, slId, strategyId, triggerTime);

      this.log(state, `🛡 Server Stop Loss Armed at Zerodha (${executedQty} qty): Trigger ₹${triggerPrice.toFixed(2)}, Limit ₹${slLimitPrice.toFixed(2)} | OrderId: ${slId}. Target 1 (₹${tgtPrice.toFixed(2)}) will activate Uncapped Momentum Trailing.`);
    }

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

  private calculateRSI(candles: Candle[], period = 14): (number | null)[] {
    const rsi: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length <= period) return rsi;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

    for (let i = period + 1; i < candles.length; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        rsi[i] = 100;
      } else {
        const rs = avgGain / avgLoss;
        rsi[i] = 100 - (100 / (1 + rs));
      }
    }
    return rsi;
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
    } catch { }
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

  private async fetchPreviousDayOHLC(client: any, symbol: string, exchange: string, now: Date): Promise<{ high: number; low: number; close: number } | null> {
    const todayStr = this.getIstDateStr(now);
    try {
      const dailyCandles = await this.fetchCandlesForSymbol(client, symbol, 'day', now, exchange);
      const pastDaily = dailyCandles.filter(c => this.getIstDateStr(c.date) !== todayStr);
      if (pastDaily.length > 0) {
        const lastDay = pastDaily[pastDaily.length - 1];
        return { high: lastDay.high, low: lastDay.low, close: lastDay.close };
      }
    } catch (e: any) {
      this.logger.debug?.(`Daily candle fetch notice: ${e.message}`);
    }

    try {
      const candles15 = await this.fetchCandlesForSymbol(client, symbol, '15minute', now, exchange);
      const past15 = candles15.filter(c => this.getIstDateStr(c.date) !== todayStr);
      if (past15.length > 0) {
        const prevDayStr = this.getIstDateStr(past15[past15.length - 1].date);
        const prevDayCandles = past15.filter(c => this.getIstDateStr(c.date) === prevDayStr);
        if (prevDayCandles.length > 0) {
          const high = Math.max(...prevDayCandles.map(c => c.high));
          const low = Math.min(...prevDayCandles.map(c => c.low));
          const close = prevDayCandles[prevDayCandles.length - 1].close;
          return { high, low, close };
        }
      }
    } catch (e: any) {
      this.logger.debug?.(`15m candle CPR fallback notice: ${e.message}`);
    }

    return null;
  }

  private calculateCPR(prevDay: { high: number; low: number; close: number } | Candle[]) {
    let high = 0, low = 0, close = 0;
    if (Array.isArray(prevDay)) {
      if (prevDay.length === 0) return null;
      high = Math.max(...prevDay.map(c => c.high));
      low = Math.min(...prevDay.map(c => c.low));
      close = prevDay[prevDay.length - 1].close;
    } else if (prevDay && typeof prevDay.high === 'number') {
      high = prevDay.high;
      low = prevDay.low;
      close = prevDay.close;
    } else {
      return null;
    }

    const pivot = (high + low + close) / 3;
    const bc = (high + low) / 2;
    const tc = (pivot - bc) + pivot;
    const width = Math.abs(tc - bc);
    const widthPct = (width / pivot) * 100;
    const topCpr = Math.max(tc, bc);
    const bottomCpr = Math.min(tc, bc);
    const r1 = (2 * pivot) - low;
    const s1 = (2 * pivot) - high;
    const r2 = pivot + (high - low);
    const s2 = pivot - (high - low);

    return {
      pivot,
      bc,
      tc,
      width,
      widthPct,
      topCpr,
      bottomCpr,
      r1,
      s1,
      r2,
      s2,
      isNarrow: widthPct <= 0.18,
      isWide: widthPct > 0.22,
    };
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
    state.initialSlPrice = null;
    state.isBreakevenTrailed = false;
    state.isProfitLockTrailed = false;
    state.isDynamicTrailingActive = false;
    state.executedQty = undefined;
    state.lastBrokerSlTrigger = undefined;
    state.lastBrokerSlModifyTime = undefined;
    state.highestPriceReached = undefined;
    state.lowestPriceReached = undefined;
    state.lastBreakoutAttempt = null;
    state.isReversalTrade = false;
    state.cprData = null;
    state.sweptHigh = false;
    state.sweptHighPrice = undefined;
    state.sweptLow = false;
    state.sweptLowPrice = undefined;
    state.isTrapTrade = false;
    state.dailyLossesCount = 0;
    state.isPartialBooked = false;
    state.isParabolicActive = false;
    state.emaWarningCandle = null;
    state.reEntryEligible = false;
    state.reEntrySwingPrice = null;
    state.reEntryCountToday = 0;
    this.stopRealtimeMonitor(state);
  }
}
