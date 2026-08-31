import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { GammaBlastExpiryConfig } from './dto/strategy.dto';
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
  activeSpotSymbol: string;
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
  is2xLocked?: boolean;
  is3xLocked?: boolean;
  is5xLocked?: boolean;
  rangeHigh?: number | null;
  rangeLow?: number | null;
  rangeVwap?: number | null;
  atmPcr?: number | null;
  bias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null;
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
    const dayOfWeek = this.getIstDayOfWeek(now); // 2 = Tuesday, 4 = Thursday

    let underlying: 'NIFTY' | 'SENSEX' = 'NIFTY';
    let exchange: 'NFO' | 'BFO' = 'NFO';
    let spotSymbol = 'NSE:NIFTY 50';

    if (config.symbol === 'SENSEX' || (config.symbol === 'AUTO' && dayOfWeek === 4)) {
      underlying = 'SENSEX';
      exchange = 'BFO';
      spotSymbol = 'BSE:SENSEX';
    } else {
      underlying = 'NIFTY';
      exchange = 'NFO';
      spotSymbol = 'NSE:NIFTY 50';
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
      activeSpotSymbol: spotSymbol,
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
      is2xLocked: false,
      is3xLocked: false,
      is5xLocked: false,
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Gamma Blast (CAS Expiry Special) Engine Started! Mode: ${strategy.isPaperTrade ? 'PAPER TRADING' : 'LIVE TRADING'}`);
    this.log(state, `🎯 Active Expiry Focus: ${underlying} (${exchange}) | Lot Size: ${defaultLotSize} (${lots} Lot = ${targetQty} Qty)`);
    this.log(state, `⏰ Active Execution Window: ${config.startTime || '13:30'} – ${config.endTime || '15:25'} IST (Auto Square-off @ 03:25 PM)`);
    this.log(state, `💎 Premium Target Range: ${underlying === 'NIFTY' ? `₹${config.minPremiumNifty || 8} – ₹${config.maxPremiumNifty || 15}` : `₹${config.minPremiumSensex || 12} – ₹${config.maxPremiumSensex || 25}`}`);

    // ── Live Crash / Power Recovery on Startup ──────────────────────────────
    if (!strategy.isPaperTrade && strategy.brokerAccount?.accessToken) {
      try {
        const client = this.factory.createClient(strategy.brokerAccount);
        const kite = client['kite'] || client;
        if (kite && kite.getPositions) {
          const positionsData = await kite.getPositions().catch(() => null);
          const netPositions = positionsData?.net || [];
          const openPos = netPositions.find((p: any) =>
            Number(p.quantity) > 0 &&
            (p.tradingsymbol.startsWith(underlying) || p.tradingsymbol.includes(underlying))
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

            this.log(state, `🔄 [POWER RECOVERY] Reconnected to active live option position: ${sym} (${absQty} Qty @ Avg ₹${entryAvg.toFixed(2)}) | SL: ₹${state.stopLossPrice?.toFixed(2)}`);
            await this.startRealtimeMonitor(state, client);
          }
        }
      } catch (e: any) {
        this.logger.debug?.(`Position recovery notice: ${e.message}`);
      }
    }

    await this.persistLogs(state);

    const timer = setInterval(() => this.tick(strategyId).catch(e => this.logger.error(e)), 5_000);
    this.timers.set(strategyId, timer);

    return { executionId: execution.id };
  }

  async stop(strategyId: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      this.stopRealtimeMonitor(state);
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

  // ── Core Periodic Evaluation Loop ──────────────────────────────────────────

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'] || client;
    const now = new Date();
    const hhmm = this.getIstHhmm(now);

    // ── 1. 03:25:00 PM Sharp Mandatory EOD Square-Off ────────────────────────
    if (hhmm >= 15 * 60 + 25) {
      if (state.entryTriggered) {
        const exitPrice = state.currentLtp || state.entryPrice || 0;
        this.log(state, `⏰ 03:25 PM Pre-CAS Hard Cutoff Reached! Auto-squaring off position @ ₹${exitPrice.toFixed(2)} to secure profits before CAS settlement...`);
        await this.exitPosition(state, client, exitPrice, 'TIME_CUTOFF');
        await this.persistLogs(state);
      }
      return;
    }

    // If position is active, monitorPosition safety net handles it
    if (state.entryTriggered) {
      await this.monitorPosition(state, client, kite);
      await this.persistLogs(state);
      return;
    }

    // Check daily lock / max trades
    if (state.dailyTargetLocked) return;
    if (state.tradesPlacedToday >= (state.config.maxTradesPerDay || 2)) return;

    // ── 2. Time Window Check (Active between 01:30 PM and 03:15 PM) ───────────
    const [startH, startM] = (state.config.startTime || '13:30').split(':').map(Number);
    const startHhmm = startH * 60 + startM;

    if (hhmm < startHhmm) {
      const minutesLeft = startHhmm - hhmm;
      if (minutesLeft % 15 === 0 && (!state.lastTickTime || (Date.now() - state.lastTickTime > 60000))) {
        state.lastTickTime = Date.now();
        this.log(state, `⏳ Waiting for 01:30 PM Gamma Window (${minutesLeft} mins remaining). Monitoring underlying ${state.activeUnderlying}...`);
        await this.persistLogs(state);
      }
      return;
    }

    if (hhmm > 15 * 60 + 15) {
      return; // Past 03:15 PM, do not open new trades
    }

    // ── 3. Range Compression & Confluence Trigger Evaluation ──────────────────
    try {
      await this.evaluateGammaBreakout(state, client, kite, now);
      await this.persistLogs(state);
    } catch (e: any) {
      this.logger.error(`Gamma evaluation error: ${e.message}`);
    }
  }

  // ── Confluence & Live Option Chain Analysis ────────────────────────────────

  private async evaluateGammaBreakout(state: GammaStrategyState, client: any, kite: any, now: Date) {
    const underlying = state.activeUnderlying;
    const exchange = state.activeExchange;
    const spotKey = state.activeSpotSymbol;

    // 1. Fetch Spot 3m candles for Range Compression calculation (1:00 PM – 2:00 PM)
    const candles = await this.fetchIndexCandles(client, spotKey, now);
    if (!candles || candles.length < 15) return;

    // Calculate 1:00 PM to current range
    const rangeData = this.calculateCompressionRange(candles, now);
    if (!rangeData) return;

    state.rangeHigh = rangeData.high;
    state.rangeLow = rangeData.low;
    state.rangeVwap = rangeData.vwap;

    const currentSpot = candles[candles.length - 1].close;
    const currentSpotHigh = candles[candles.length - 1].high;
    const currentSpotLow = candles[candles.length - 1].low;

    // 2. Fetch Instruments & Filter Today's Weekly Option Chain
    const instruments = await kite.getInstruments(exchange);
    const segment = exchange === 'BFO' ? 'BFO-OPT' : 'NFO-OPT';
    const optInstruments = instruments.filter((i: any) =>
      i.name === underlying &&
      i.segment === segment
    );
    if (optInstruments.length === 0) return;

    // Find nearest weekly expiry date (today's expiry)
    const expiries = Array.from(new Set(optInstruments.map((i: any) => this.getIstDateStr(new Date(i.expiry))))).sort();
    const todayStr = this.getIstDateStr(now);
    const targetExpiry = expiries.find(e => e >= todayStr) || expiries[0];

    const weeklyOptions = optInstruments.filter((i: any) => this.getIstDateStr(new Date(i.expiry)) === targetExpiry);
    if (weeklyOptions.length === 0) return;

    // Update authoritative lot size
    if (weeklyOptions[0]?.lot_size) {
      state.lotSize = weeklyOptions[0].lot_size;
      state.targetQty = state.lots * state.lotSize;
    }

    // 3. Resolve ATM Strike & Query Live Quotes with Open Interest (OI)
    const strikeStep = underlying === 'NIFTY' ? 50 : 100;
    const atmStrike = Math.round(currentSpot / strikeStep) * strikeStep;

    // Select ATM ± 4 strikes for OI & PCR computation
    const candidateStrikes: number[] = [];
    for (let s = atmStrike - (strikeStep * 4); s <= atmStrike + (strikeStep * 4); s += strikeStep) {
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

    const quotes = await kite.getQuote(targetOptionSymbols).catch(() => null);
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

    // Determine Institutional Bias
    // Bullish Squeeze: Price > VWAP & Range High + Call OI unwinding / PCR > 1.15
    // Bearish Squeeze: Price < VWAP & Range Low + Put OI unwinding / PCR < 0.85
    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (currentSpot >= rangeData.high && currentSpot >= rangeData.vwap) {
      bias = 'BULLISH';
    } else if (currentSpot <= rangeData.low && currentSpot <= rangeData.vwap) {
      bias = 'BEARISH';
    }
    state.bias = bias;

    const minPrem = underlying === 'NIFTY' ? (state.config.minPremiumNifty || 8) : (state.config.minPremiumSensex || 12);
    const maxPrem = underlying === 'NIFTY' ? (state.config.maxPremiumNifty || 15) : (state.config.maxPremiumSensex || 25);

    // ── 4. Trigger Execution Check ───────────────────────────────────────────

    // Bullish Call Blast: Spot breaks Range High + CE breaks 15m high with volume
    if (bias === 'BULLISH' && currentSpotHigh >= rangeData.high) {
      const eligibleCe = optionQuotes
        .filter(o => o.type === 'CE' && o.ltp >= minPrem && o.ltp <= maxPrem)
        .sort((a, b) => Math.abs(a.ltp - ((minPrem + maxPrem) / 2)) - Math.abs(b.ltp - ((minPrem + maxPrem) / 2)))[0];

      if (eligibleCe && eligibleCe.ltp > 0) {
        this.log(state, `🚀 [GAMMA BLAST SIGNAL - CALL] ${underlying} broke Range High (₹${rangeData.high.toFixed(2)}) @ Spot ₹${currentSpot.toFixed(2)} | PCR: ${pcr.toFixed(2)}`);
        this.log(state, `🎯 Selected Explosive Strike: ${eligibleCe.tradingsymbol} @ ₹${eligibleCe.ltp.toFixed(2)} (OI: ${(eligibleCe.oi / 1000).toFixed(0)}k, Vol: ${(eligibleCe.volume / 1000).toFixed(0)}k)`);
        await this.placeGammaTrade(state, client, kite, eligibleCe.tradingsymbol, eligibleCe.ltp, 'CALL_BLAST');
        return;
      }
    }

    // Bearish Put Blast: Spot breaks Range Low + PE breaks 15m high with volume
    if (bias === 'BEARISH' && currentSpotLow <= rangeData.low) {
      const eligiblePe = optionQuotes
        .filter(o => o.type === 'PE' && o.ltp >= minPrem && o.ltp <= maxPrem)
        .sort((a, b) => Math.abs(a.ltp - ((minPrem + maxPrem) / 2)) - Math.abs(b.ltp - ((minPrem + maxPrem) / 2)))[0];

      if (eligiblePe && eligiblePe.ltp > 0) {
        this.log(state, `🚀 [GAMMA BLAST SIGNAL - PUT] ${underlying} broke Range Low (₹${rangeData.low.toFixed(2)}) @ Spot ₹${currentSpot.toFixed(2)} | PCR: ${pcr.toFixed(2)}`);
        this.log(state, `🎯 Selected Explosive Strike: ${eligiblePe.tradingsymbol} @ ₹${eligiblePe.ltp.toFixed(2)} (OI: ${(eligiblePe.oi / 1000).toFixed(0)}k, Vol: ${(eligiblePe.volume / 1000).toFixed(0)}k)`);
        await this.placeGammaTrade(state, client, kite, eligiblePe.tradingsymbol, eligiblePe.ltp, 'PUT_BLAST');
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
    type: 'CALL_BLAST' | 'PUT_BLAST'
  ) {
    const exchange = state.activeExchange;
    const qty = state.targetQty; // 1 Lot (65 Nifty / 20 Sensex)
    const initialSl = this.roundTick(entryPrice * 0.50); // 50% initial SL (e.g. ₹6 on ₹12)
    const product = state.config.product || 'NRML';

    this.log(state, `📋 Placing 1-Lot Order: ${exchange}:${symbol} | Qty: ${qty} | Entry: ₹${entryPrice.toFixed(2)} | Initial SL: ₹${initialSl.toFixed(2)} (Max Loss: ₹${((entryPrice - initialSl) * qty).toFixed(2)})`);

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

      // ── Ratchet Trailing Logic ──────────────────────────────────────────────

      // 1. Milestone 1: 2x Spike (e.g. ₹12 -> ₹24) -> Move SL to Cost + ₹1 (Risk-Free!)
      if (peak >= entry * 2.0 && !state.is2xLocked) {
        state.is2xLocked = true;
        const newSl = this.roundTick(entry + 1.00);
        state.stopLossPrice = Math.max(state.stopLossPrice || 0, newSl);
        this.log(state, `🚀 [2X GAMMA SPIKE] Peak: ₹${peak.toFixed(2)} (${(peak / entry).toFixed(1)}x)! Trailing SL ratcheted to Cost+1 (₹${state.stopLossPrice.toFixed(2)}) — Trade is 100% Risk-Free!`);
      }

      // 2. Milestone 2: 3x Spike (e.g. ₹12 -> ₹36) -> Lock SL at 2x level (₹24.00)
      if (peak >= entry * 3.0 && !state.is3xLocked) {
        state.is3xLocked = true;
        const newSl = this.roundTick(entry * 2.0);
        state.stopLossPrice = Math.max(state.stopLossPrice || 0, newSl);
        this.log(state, `🎯 [3X GAMMA BLAST] Peak: ₹${peak.toFixed(2)} (${(peak / entry).toFixed(1)}x)! Trailing SL LOCKED at 2x profit level (₹${state.stopLossPrice.toFixed(2)})!`);
      }

      // 3. Milestone 3: 5x+ Multi-Bagger Explosion (e.g. ₹12 -> ₹60+) -> High-Water Mark Trail (Peak * 0.80)
      if (peak >= entry * 4.0) {
        state.is5xLocked = true;
        const peakTrailSl = this.roundTick(peak * 0.80); // 20% pullback buffer from the highest tick
        if (peakTrailSl > (state.stopLossPrice || 0)) {
          state.stopLossPrice = peakTrailSl;
        }
      }

      // ── Exit Check ─────────────────────────────────────────────────────────
      if (currentPrice <= (state.stopLossPrice || 0)) {
        if (isExiting) return;
        isExiting = true;
        const reason = (state.is2xLocked || state.is3xLocked || state.is5xLocked) ? 'TARGET' : 'SL';
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

    if (currentPrice <= (state.stopLossPrice || 0)) {
      this.log(state, `🛑 Position Monitor: Trailing SL triggered @ ₹${currentPrice.toFixed(2)} | P&L: ₹${pnlRs.toFixed(2)}`);
      await this.exitPosition(state, client, currentPrice, 'SL');
      await this.persistLogs(state);
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

      await this.trackOrderInDB(state, 'SELL', symbol, exchange, qty, exitPrice, exitOrderId, undefined, 'MARKET');
      state.tradesPlacedToday++;

      const entry = state.entryPrice || exitPrice;
      const tradePnl = (exitPrice - entry) * qty;
      state.dailyRealizedPnlRs = (state.dailyRealizedPnlRs || 0) + tradePnl;

      if (tradePnl > 0) state.winningTradesToday++;

      this.log(state, `🎉 Trade Closed (${reason}) @ ₹${exitPrice.toFixed(2)} | P&L: ${tradePnl >= 0 ? '+' : ''}₹${tradePnl.toFixed(2)} | Total Today: ₹${state.dailyRealizedPnlRs.toFixed(2)}`);

      state.entryTriggered = null;
      state.optionSymbol = null;
      state.entryPrice = null;
      state.stopLossPrice = null;
      state.slOrderId = null;
      state.peakPrice = 0;
      state.is2xLocked = false;
      state.is3xLocked = false;
      state.is5xLocked = false;
    } catch (e: any) {
      this.log(state, `❌ Exit failed: ${e.message}`);
    }
  }

  // ── Helper Utilities ───────────────────────────────────────────────────────

  private async fetchIndexCandles(client: any, spotKey: string, now: Date): Promise<Candle[]> {
    try {
      const todayStr = this.getIstDateStr(now);
      const from = new Date(`${todayStr}T09:15:00.000+05:30`);
      const [exchange, symbol] = spotKey.split(':');
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

  private calculateCompressionRange(candles: Candle[], now: Date): { high: number; low: number; vwap: number } | null {
    if (candles.length === 0) return null;

    // Filter candles between 01:00 PM and current time
    const afternoonCandles = candles.filter(c => {
      const hhmm = this.getIstHhmm(c.date);
      return hhmm >= 13 * 60; // 01:00 PM onwards
    });

    const evalCandles = afternoonCandles.length >= 6 ? afternoonCandles : candles.slice(-15);
    let high = -Infinity;
    let low = Infinity;
    let sumPv = 0;
    let sumV = 0;

    for (const c of evalCandles) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      const typical = (c.high + c.low + c.close) / 3;
      sumPv += typical * (c.volume || 1);
      sumV += (c.volume || 1);
    }

    const vwap = sumV > 0 ? (sumPv / sumV) : evalCandles[evalCandles.length - 1].close;
    return { high, low, vwap };
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
