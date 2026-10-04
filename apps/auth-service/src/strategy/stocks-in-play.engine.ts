import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';
import { getSharedInstruments } from '../brokers/instrument-store';
import { strategyEvents } from '../common/events';
import { loadResumableLogs, MAX_ENGINE_LOGS, pushEngineLog } from '../common/utils/engine-log';
import { NIFTY_500_UNIVERSE } from '../market/market.constants';
import { TickerService } from '../market/ticker.service';
import { OrderGateway } from '../order-gateway/order-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { getCompletedBrokerExitDetails, getLiveBrokerPosition, isSafeToExit } from './broker-position-guard';
import { StocksInPlayConfig } from './dto/strategy.dto';
import { getIstDateStr, getIstHhmm } from './emavwap-signals';
import { countTodaysTradesForEntry, findOpenPosition, istDayStart, PositionUnknownError, protectionNotice, recoverTodaysTrades, strategyOrderWhere } from './position-recovery';
import { logSignal } from './signal-logger';

/**
 * Stocks-in-Play opening-range breakout (after Zarattini, Barbon & Aziz, "A Profitable Day Trading Strategy for the
 * U.S. Equity Market", 2024), fitted to NSE on 2 years of 5m data (backtest/sim/orb-*.js).
 *
 * - Universe: NIFTY 500 + F&O stocks, price >= minPrice, average daily traded value (14 sessions) >= minAvgValueCr.
 * - At 09:20, when the first 5m candle has closed: RVOL = that candle's volume / its average over the previous
 *   10 sessions. Stocks with RVOL >= minRvol are "in play". A red first candle is a SHORT candidate (break of its low),
 *   a green one a LONG candidate (break of its high, only with allowLongs). Doji candles are skipped.
 * - Entry: MARKET order when the price trades through the level, any time until the entry cutoff. One entry per stock.
 * - Stop: stopAtrFraction x the stock's 14-day ATR from the fill, placed at once as an exchange SL order.
 * - Exit: the stop, or the 15:05 square-off. No target: the winners that run all day pay for the many small stops.
 * - Size: the smaller of (max loss per trade / stop distance) and (capital / maxPositions x leverage / price).
 *   maxPositions is also the daily trade cap; several positions can be open together.
 *
 * Backtest (2024-09 .. 2026-09, Zerodha costs + slippage): shorts only, RVOL >= 10, stop 0.2 ATR, 2 positions:
 * positive in both years and 8/8 quarters; about 1 in 3 trades wins and the best 5% of trades carry the result.
 */

type Side = 'LONG' | 'SHORT';
type ExitReason = 'SL' | 'SQUARE_OFF' | 'MANUAL' | 'BROKER_SL' | 'BROKER_SYNC' | 'NO_PROTECTION';

const SQUARE_OFF_HHMM = 15 * 60 + 5;
const FIRST_CANDLE_CLOSE_HHMM = 9 * 60 + 20;
const DEFAULT_ENTRY_CUTOFF = '15:00';
/** Live: if the price sits beyond the SL this long without the broker SL filling, exit at market. */
const SL_BREACH_GRACE_MS = 3000;
/** Do not enter a breakout the price has already run past by more than this share of the stop distance. */
const MAX_CHASE_OF_STOP = 0.5;
const BASELINE_SESSIONS = 10;
const ATR_SESSIONS = 14;
const MAX_CANDIDATES = 10;

interface ResolvedConfig {
  stopLossRs: number;
  maxPositions: number;
  minRvol: number;
  stopAtrFraction: number;
  minAvgValueCr: number;
  minPrice: number;
  allowLongs: boolean;
  allowShorts: boolean;
  leverage: number;
  maxCapital: number | null;
  entryCutoffTime: string;
}

/** Per-stock numbers from the previous sessions, computed once a day. */
interface Baseline {
  avgFirstVol: number;
  atr: number;
  avgValueCr: number;
  prevClose: number;
  tick: number;
  /** Today's 09:15 candle when the history was loaded after 09:20. */
  first?: { o: number; h: number; l: number; c: number; v: number };
}

interface Candidate {
  symbol: string;
  side: Side;
  level: number;
  stopDist: number;
  rvol: number;
  tick: number;
  first: { o: number; h: number; l: number; c: number; v: number };
  ltp: number | null;
  ltpAt: number;
  done: boolean;
}

interface OpenPosition {
  symbol: string;
  side: Side;
  entryPrice: number;
  qty: number;
  sl: number;
  tick: number;
  rvol: number | null;
  slOrderId: string | null;
  openedAt: number;
  ltp: number | null;
  ltpAt: number;
  slBreachAt: number | null;
  retryExit: ExitReason | null;
  lastExitAttempt: number;
  lastOrdersCheck: number;
  lastBrokerPosCheck: number;
}

interface EngineState {
  strategyId: string;
  executionId: string;
  userId: string;
  brokerAccountId: string;
  isPaperTrade: boolean;
  config: ResolvedConfig;
  baselines: Map<string, Baseline> | null;
  baselineLoading: boolean;
  candidates: Candidate[] | null;
  candidatesTriedAt: number;
  tradedSymbols: Set<string>;
  positions: OpenPosition[];
  tradesToday: number;
  winsToday: number;
  lossesToday: number;
  realizedTodayRs: number;
  logs: string[];
  busy: boolean;
  stopping: boolean;
  completeReason: string | null;
  client: any | null;
  clientCheckedAt: number;
  subscribed: Set<string>;
  lastPnlLog: number;
  loggedNoSession: boolean;
  loggedCutoff: boolean;
  tickerUnsubscribe?: () => void;
  lastPersistedLogTail?: string;
  lastDbPersistTime?: number;
}

interface OrderSnap {
  status: string;
  filledQty: number;
  avgPrice: number;
  message?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const roundTo = (p: number, tick: number, dir: 'up' | 'down' | 'near') => {
  const n = p / tick;
  const k = dir === 'up' ? Math.ceil(n - 1e-9) : dir === 'down' ? Math.floor(n + 1e-9) : Math.round(n);
  return Number((k * tick).toFixed(2));
};

@Injectable()
export class StocksInPlayEngine {
  private readonly logger = new Logger(StocksInPlayEngine.name);
  private readonly running = new Map<string, EngineState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  /** Baselines are the same for every strategy on a day, so they are shared (and cached on disk). */
  private sharedBaselines: { day: string; data: Map<string, Baseline> } | null = null;
  private baselinePromise: Promise<Map<string, Baseline>> | null = null;

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
    private tickerService: TickerService,
    private readonly orderGateway: OrderGateway,
  ) { }

  /** All broker orders go through the OrderGateway (kill switch, limits, tagging, DB record). */
  private async placeOrder(state: EngineState, params: OrderParams): Promise<string> {
    const placed = await this.orderGateway.place(state.userId, state.brokerAccountId, params, {
      strategyId: state.strategyId,
      executionId: state.executionId,
    });
    return placed.orderId;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) return { executionId: this.running.get(strategyId)!.executionId };

    const strategy = await this.prisma.strategy.findUnique({ where: { id: strategyId }, include: { brokerAccount: true } });
    if (!strategy) throw new Error('Strategy not found');
    const config = this.resolveConfig(JSON.parse(strategy.config || '{}'));

    const resumedLogs = await loadResumableLogs(this.prisma, strategyId);
    await this.prisma.strategyExecution.updateMany({
      where: { strategyId, status: 'RUNNING' },
      data: { status: 'STOPPED', stoppedAt: new Date() },
    });
    const execution = await this.prisma.strategyExecution.create({ data: { strategyId, status: 'RUNNING' } });
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: true } });

    const state: EngineState = {
      strategyId,
      executionId: execution.id,
      userId: strategy.userId,
      brokerAccountId: strategy.brokerAccountId!,
      isPaperTrade: strategy.isPaperTrade,
      config,
      baselines: null,
      baselineLoading: false,
      candidates: null,
      candidatesTriedAt: 0,
      tradedSymbols: new Set(),
      positions: [],
      tradesToday: 0,
      winsToday: 0,
      lossesToday: 0,
      realizedTodayRs: 0,
      logs: resumedLogs,
      busy: false,
      stopping: false,
      completeReason: null,
      client: null,
      clientCheckedAt: 0,
      subscribed: new Set(),
      lastPnlLog: 0,
      loggedNoSession: false,
      loggedCutoff: false,
    };
    this.running.set(strategyId, state);

    const mode = state.isPaperTrade ? 'PAPER TRADING' : 'LIVE TRADING';
    const sides = [config.allowShorts ? 'shorts' : null, config.allowLongs ? 'longs' : null].filter(Boolean).join(' + ');
    if (resumedLogs.length > 0) {
      this.log(state, `🔁 Engine reconnected — resuming console from the interrupted session (${mode})`);
    } else {
      this.log(state, `▶ Stocks-in-Play ORB started | ${mode}`);
      this.log(state, `⚙ At 09:20: stocks whose first 5m candle traded >= ${config.minRvol}x their usual volume (NIFTY 500 + F&O, price >= ₹${config.minPrice}, avg daily value >= ₹${config.minAvgValueCr} Cr) | Trading ${sides} on the break of that candle | Stop ${config.stopAtrFraction} x 14-day ATR | Max loss/trade ₹${config.stopLossRs} | Up to ${config.maxPositions} positions (= trades/day), ${config.leverage}x | Entries until ${config.entryCutoffTime}, square-off 15:05`);
    }

    // Today's trades come from the broker's order book (live) or saved paper orders, so a restart cannot trade past the cap.
    const day = await recoverTodaysTrades({ prisma: this.prisma, factory: this.factory, strategyId, isPaper: !!strategy.isPaperTrade, brokerAccount: strategy.brokerAccount });
    state.tradesToday = day.trades;
    state.winsToday = day.wins;
    state.lossesToday = day.losses;
    state.realizedTodayRs = day.realizedPnlRs;
    if (day.trades > 0) {
      this.log(state, `📊 [STATE RECOVERY] Today so far: ${day.trades}/${config.maxPositions} trades | ${day.wins} wins | ${day.losses} losses | Realized P&L: ₹${day.realizedPnlRs.toFixed(2)} [${day.source === 'BROKER' ? 'Zerodha order book' : 'saved orders'}]`);
    }
    // A stock already ordered today is never entered again.
    const todays: any[] = await this.prisma.order.findMany({
      where: { ...strategyOrderWhere(strategyId), createdAt: { gte: istDayStart() }, isPaperTrade: state.isPaperTrade },
      select: { symbol: true },
    }).catch(() => []);
    for (const o of todays) state.tradedSymbols.add(o.symbol);

    await this.recoverOpenPositions(state, strategy.brokerAccount);
    if (state.positions.length > state.tradesToday) state.tradesToday = state.positions.length;

    if (state.positions.length === 0 && state.tradesToday >= config.maxPositions) {
      await this.stopWithStatus(strategyId, 'COMPLETED', `⛔ Max ${config.maxPositions} trades already taken today. Strategy completed.`);
      return { executionId: execution.id };
    }

    state.tickerUnsubscribe = this.tickerService.registerListener((ticks) => this.onTicks(state, ticks));
    await this.persistLogs(state);

    const timer = setInterval(() => this.tick(strategyId).catch((e) => this.logger.error(e)), 2_000);
    this.timers.set(strategyId, timer);
    this.tick(strategyId).catch((e) => this.logger.error(e));
    return { executionId: execution.id };
  }

  private resolveConfig(raw: Partial<StocksInPlayConfig> & Record<string, any>): ResolvedConfig {
    const stopLossRs = Number(raw.stopLossRs);
    if (!(stopLossRs > 0)) throw new Error('Stocks-in-Play needs a max loss per trade (stopLossRs) above ₹0 to size positions.');
    const num = (v: any, d: number) => (Number(v) > 0 ? Number(v) : d);
    const allowShorts = raw.allowShorts !== false;
    const allowLongs = raw.allowLongs === true;
    if (!allowShorts && !allowLongs) throw new Error('Stocks-in-Play: enable shorts, longs or both.');
    return {
      stopLossRs,
      maxPositions: Math.min(5, Math.floor(num(raw.maxPositions, 2))),
      minRvol: num(raw.minRvol, 10),
      stopAtrFraction: num(raw.stopAtrFraction, 0.2),
      minAvgValueCr: num(raw.minAvgValueCr, 25),
      minPrice: num(raw.minPrice, 50),
      allowLongs,
      allowShorts,
      leverage: Math.min(5, num(raw.leverage, 4)),
      maxCapital: Number(raw.maxCapital) > 0 ? Number(raw.maxCapital) : null,
      entryCutoffTime: /^\d{1,2}:\d{2}$/.test(raw.entryCutoffTime || '') ? raw.entryCutoffTime : DEFAULT_ENTRY_CUTOFF,
    };
  }

  /** Re-adopts every stock position this strategy opened today (LIVE: broker, PAPER: saved orders). */
  private async recoverOpenPositions(state: EngineState, brokerAccount: any) {
    const adopted = new Set<string>();
    for (let i = 0; i < 6; i++) {
      let pos;
      try {
        pos = await findOpenPosition({
          prisma: this.prisma,
          factory: this.factory,
          strategyId: state.strategyId,
          executionId: state.executionId,
          isPaper: state.isPaperTrade,
          brokerAccount,
          accept: (sym) => !adopted.has(sym) && /^[A-Z0-9&-]+$/.test(sym) && !/(CE|PE|FUT)$/.test(sym),
        });
      } catch (err: any) {
        if (err instanceof PositionUnknownError) {
          await this.stopWithStatus(state.strategyId, 'STOPPED', `🛑 Start aborted: ${err.message}`);
          throw err;
        }
        this.logger.warn(`Position recovery failed for ${state.strategyId}: ${err?.message}`);
        return;
      }
      if (!pos) return;
      adopted.add(pos.symbol);
      const tick = 0.05;
      const sign = pos.side === 'LONG' ? -1 : 1;
      // Without a saved SL, cap the loss at the configured max loss for the quantity held.
      const sl = pos.slPrice && pos.slPrice > 0 ? pos.slPrice : roundTo(pos.avgPrice + sign * state.config.stopLossRs / pos.qty, tick, pos.side === 'LONG' ? 'down' : 'up');
      state.positions.push({
        symbol: pos.symbol, side: pos.side, entryPrice: pos.avgPrice, qty: pos.qty, sl, tick, rvol: null,
        slOrderId: pos.slOrderId, openedAt: Date.now(), ltp: null, ltpAt: 0, slBreachAt: null, retryExit: null, lastExitAttempt: 0, lastOrdersCheck: 0, lastBrokerPosCheck: 0,
      });
      state.tradedSymbols.add(pos.symbol);
      this.log(state, `🔄 [${pos.isPaper ? 'PAPER' : 'LIVE'} RECOVERY] Re-adopted ${pos.side} ${pos.symbol}: ${pos.qty} qty @ ₹${pos.avgPrice.toFixed(2)} | SL ₹${sl.toFixed(2)}${pos.slPrice ? '' : ' (no saved SL — set from the max loss)'}${pos.slOrderId ? ` [Order ${pos.slOrderId}]` : ''}`);
      const notice = protectionNotice(pos);
      if (notice) this.log(state, notice);
      const p = state.positions[state.positions.length - 1];
      try { await this.tickerService.subscribeSymbol(state.brokerAccountId, p.symbol); } catch { /* REST prices cover it */ }
      if (!state.isPaperTrade && brokerAccount?.accessToken && !pos.slOrderId) await this.armStopLoss(state, p);
    }
  }

  async stop(strategyId: string): Promise<void> {
    await this.stopWithStatus(strategyId, 'STOPPED', '⏹ Strategy stopped by user');
  }

  /** Safe shutdown: open positions are squared off first; one that cannot be confirmed keeps its broker SL. */
  private async stopWithStatus(strategyId: string, status: 'COMPLETED' | 'STOPPED', reason: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      state.stopping = true;
      const deadline = Date.now() + 20_000;
      while (state.busy && Date.now() < deadline) await sleep(250);
      state.busy = true;

      this.log(state, reason);
      if (state.positions.length > 0) {
        const client = await this.getClient(state);
        if (client || state.isPaperTrade) {
          this.log(state, `🧯 ${state.positions.length} position(s) still open on shutdown — squaring off before stopping.`);
          for (const p of [...state.positions]) {
            try {
              await this.exitPosition(state, client, p, 'MANUAL', p.ltp ?? p.entryPrice);
            } catch (e: any) {
              this.log(state, `❌ Shutdown square-off of ${p.symbol} failed: ${e?.message || e}`);
            }
          }
        }
        for (const p of state.positions) {
          this.log(state, `🚨 POSITION NOT CONFIRMED FLAT (${p.symbol}). The broker stop-loss order is left ACTIVE. Verify and close it in Kite.`);
        }
      }

      state.tickerUnsubscribe?.();
      clearInterval(this.timers.get(strategyId));
      this.timers.delete(strategyId);
      this.running.delete(strategyId);
      state.busy = false;

      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { status, stoppedAt: new Date(), logs: JSON.stringify(state.logs.slice(-MAX_ENGINE_LOGS)) },
      }).catch(() => undefined);
      strategyEvents.emit('strategy.update', { strategyId, logs: state.logs, state: this.snapshot(state) });
    }
    // A day's normal end (COMPLETED) keeps autoStart so the strategy runs again next session; any stop clears it.
    const data = status === 'COMPLETED' ? { isActive: false } : { isActive: false, autoStart: false };
    await this.prisma.strategy.update({ where: { id: strategyId }, data }).catch(() => undefined);
  }

  isRunning(strategyId: string): boolean {
    return this.running.has(strategyId);
  }

  getLogs(strategyId: string): string[] {
    return this.running.get(strategyId)?.logs || [];
  }

  getState(strategyId: string) {
    const s = this.running.get(strategyId);
    return s ? this.snapshot(s) : null;
  }

  private snapshot(s: EngineState) {
    const pnlOf = (p: OpenPosition) => ((p.ltp ?? p.entryPrice) - p.entryPrice) * p.qty * (p.side === 'LONG' ? 1 : -1);
    const positions = s.positions.map((p) => ({
      symbol: p.symbol, side: p.side, entryPrice: p.entryPrice, qty: p.qty, stopLossPrice: p.sl, currentLtp: p.ltp, pnlRs: pnlOf(p), rvol: p.rvol,
    }));
    const first = s.positions[0];
    return {
      // First position at the top level, for the shared single-position cards.
      entryTriggered: first ? first.side : null,
      activeSymbol: first?.symbol ?? null,
      entryPrice: first?.entryPrice ?? null,
      currentLtp: first?.ltp ?? null,
      stopLossPrice: first?.sl ?? null,
      targetPrice: null,
      qty: first?.qty ?? 0,
      pnlRs: s.positions.reduce((a, p) => a + pnlOf(p), 0),
      positions,
      candidates: (s.candidates || []).map((c) => ({ symbol: c.symbol, side: c.side, level: c.level, rvol: Number(c.rvol.toFixed(1)), ltp: c.ltp, done: c.done })),
      baselineReady: !!s.baselines,
      tradesToday: s.tradesToday,
      winningTradesToday: s.winsToday,
      losingTradesToday: s.lossesToday,
      realizedTodayRs: s.realizedTodayRs,
      isPaperTrade: s.isPaperTrade,
    };
  }

  async squareOff(strategyId: string): Promise<{ success: boolean; message: string }> {
    const state = this.running.get(strategyId);
    if (!state) return { success: false, message: 'Strategy is not running' };
    const deadline = Date.now() + 15_000;
    while (state.busy && Date.now() < deadline) await sleep(200);
    if (state.busy) return { success: false, message: 'Engine busy, try again in a moment' };
    if (state.positions.length === 0) return { success: false, message: 'No open position to square off' };

    state.busy = true;
    try {
      const client = await this.getClient(state);
      this.log(state, `⚡ Manual square-off requested for ${state.positions.map((p) => p.symbol).join(', ')}`);
      for (const p of [...state.positions]) await this.exitPosition(state, client, p, 'MANUAL', p.ltp ?? p.entryPrice);
      return state.positions.length > 0
        ? { success: false, message: 'Exit not confirmed for every position — check the console and Kite' }
        : { success: true, message: 'Squared off all positions' };
    } finally {
      state.busy = false;
      await this.persistLogs(state);
    }
  }

  // ── Main loop ──────────────────────────────────────────────────────────────

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state || state.busy || state.stopping) return;
    state.busy = true;
    try {
      const now = new Date();
      const hhmm = getIstHhmm(now);

      const client = await this.getClient(state);
      if (!client) {
        if (!state.loggedNoSession) {
          state.loggedNoSession = true;
          this.log(state, `⚠ No Zerodha session for this account — waiting for login.`);
        }
        return;
      }

      if (!state.baselines && !state.baselineLoading) this.loadBaselines(state, client);
      if (hhmm < 9 * 60 + 15) return;

      await this.refreshPrices(state, client, now);
      if (state.positions.length > 0) await this.managePositions(state, client, now);

      if (hhmm >= SQUARE_OFF_HHMM) {
        if (state.positions.length === 0) state.completeReason = `🏁 Session over (15:05). Strategy completed for today.`;
        return;
      }
      if (!state.baselines) return;
      if (!state.candidates && hhmm >= FIRST_CANDLE_CLOSE_HHMM && now.getTime() - state.candidatesTriedAt >= 5000) {
        state.candidatesTriedAt = now.getTime();
        await this.buildCandidates(state, client, now);
      }
      if (state.candidates) await this.checkEntries(state, client, now);
    } catch (err: any) {
      this.log(state, `❌ Tick error: ${err?.message || err}`);
    } finally {
      state.busy = false;
    }

    if (state.completeReason && state.positions.length === 0) {
      const reason = state.completeReason;
      state.completeReason = null;
      await this.stopWithStatus(strategyId, 'COMPLETED', reason);
      return;
    }
    await this.persistLogs(state);
  }

  /** Live ticks: record prices and react at once to entry levels and stop levels. */
  private onTicks(state: EngineState, ticks: Record<string, number>) {
    let touched = false;
    for (const c of state.candidates || []) {
      if (c.done) continue;
      const px = ticks[`NSE:${c.symbol}`] ?? ticks[c.symbol];
      if (px && px > 0) { c.ltp = px; c.ltpAt = Date.now(); touched = true; }
    }
    for (const p of state.positions) {
      const px = ticks[`NSE:${p.symbol}`] ?? ticks[p.symbol];
      if (px && px > 0) { p.ltp = px; p.ltpAt = Date.now(); touched = true; }
    }
    if (!touched || state.busy || state.stopping || !state.client) return;

    state.busy = true;
    const now = new Date();
    (async () => {
      if (state.positions.length > 0) await this.managePositions(state, state.client, now);
      if (state.candidates && getIstHhmm(now) < SQUARE_OFF_HHMM) await this.checkEntries(state, state.client, now);
    })()
      .catch((e) => this.log(state, `❌ Realtime check error: ${e?.message || e}`))
      .finally(() => { state.busy = false; });
  }

  private async getClient(state: EngineState): Promise<any | null> {
    if (state.client && Date.now() - state.clientCheckedAt < 60_000) return state.client;
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } }).catch(() => null);
    state.clientCheckedAt = Date.now();
    state.client = account?.accessToken ? this.factory.createClient(account) : null;
    if (state.client) state.loggedNoSession = false;
    return state.client;
  }

  // ── Baselines (previous sessions) ──────────────────────────────────────────

  private baselineFile(day: string) {
    return path.join(process.cwd(), 'logs', 'stocks-in-play', `baseline-${day}.json`);
  }

  /** Starts (or joins) the day's baseline load; the state picks it up when it finishes. */
  private loadBaselines(state: EngineState, client: any) {
    const day = getIstDateStr(new Date());
    if (this.sharedBaselines?.day === day) {
      state.baselines = this.sharedBaselines.data;
      return;
    }
    state.baselineLoading = true;
    if (!this.baselinePromise) {
      this.baselinePromise = this.fetchBaselines(state, client, day).finally(() => { this.baselinePromise = null; });
    }
    this.baselinePromise
      .then((data) => {
        if (data.size > 0) {
          this.sharedBaselines = { day, data };
          state.baselines = data;
          this.log(state, `✅ Volume baselines ready for ${data.size} liquid stocks.`);
        } else {
          this.log(state, `⚠ No volume baselines could be loaded — retrying.`);
        }
      })
      .catch((e) => this.log(state, `⚠ Baseline load failed: ${e?.message || e} — retrying.`))
      .finally(() => { state.baselineLoading = false; });
  }

  private async fetchBaselines(state: EngineState, client: any, day: string): Promise<Map<string, Baseline>> {
    const file = this.baselineFile(day);
    try {
      const cached = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Baseline>;
      const map = new Map(Object.entries(cached));
      if (map.size > 0) {
        this.log(state, `📦 Loaded today's volume baselines from cache (${map.size} stocks).`);
        // A cache written before 09:20 has no first candle; it is read from quotes at 09:20.
        return map;
      }
    } catch { /* no cache yet */ }

    const kite = client['kite'] || client;
    const nse = await getSharedInstruments(kite, 'NSE');
    const nfo = await getSharedInstruments(kite, 'NFO').catch(() => [] as any[]);
    const eq = new Map<string, any>();
    for (const i of nse) if ((i as any).instrument_type === 'EQ' && (i as any).exchange === 'NSE') eq.set((i as any).tradingsymbol, i);
    const universe = new Set<string>(NIFTY_500_UNIVERSE.filter((s) => eq.has(s)));
    for (const i of nfo) { const n = String((i as any).name || '').toUpperCase(); if (eq.has(n)) universe.add(n); }
    const symbols = Array.from(universe);
    this.log(state, `⏳ Loading volume baselines for ${symbols.length} stocks (NIFTY 500 + F&O, ~${Math.ceil(symbols.length / 3 / 60)} min at Kite's history rate)...`);

    const to = new Date();
    const from = new Date(`${day}T09:15:00.000+05:30`);
    from.setDate(from.getDate() - 24);
    const out = new Map<string, Baseline>();
    let failed = 0;
    for (let i = 0; i < symbols.length; i += 3) {
      if (!this.running.has(state.strategyId)) break;
      await Promise.all(symbols.slice(i, i + 3).map(async (sym) => {
        try {
          const raw: any[] = await client.getHistoricalData(sym, 'NSE', '5minute', from, to);
          const b = this.baselineFrom(raw, day, Number(eq.get(sym)?.tick_size) || 0.05);
          if (b) out.set(sym, b);
        } catch {
          failed++;
        }
      }));
    }
    if (failed > 0) this.log(state, `⚠ History unavailable for ${failed} stock(s); they are skipped today.`);
    if (out.size > 0) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const plain: Record<string, Baseline> = {};
        for (const [k, v] of out) { const { first, ...rest } = v; plain[k] = rest as Baseline; }
        fs.writeFileSync(file, JSON.stringify(plain));
      } catch { /* cache is optional */ }
    }
    return out;
  }

  /** Previous sessions' first-candle volume, 14-day ATR and traded value from 5m candles; plus today's first candle. */
  private baselineFrom(raw: any[], today: string, tick: number): Baseline | null {
    const days = new Map<string, { first: number | null; h: number; l: number; c: number; value: number; f?: any }>();
    for (const k of raw || []) {
      const d = new Date(k.date);
      const dayStr = getIstDateStr(d);
      const hhmm = getIstHhmm(d);
      if (hhmm < 9 * 60 + 15 || hhmm >= 15 * 60 + 30) continue;
      let r = days.get(dayStr);
      if (!r) { r = { first: null, h: -Infinity, l: Infinity, c: 0, value: 0 }; days.set(dayStr, r); }
      const o = Number(k.open), h = Number(k.high), l = Number(k.low), c = Number(k.close), v = Number(k.volume) || 0;
      if (hhmm === 9 * 60 + 15) { r.first = v; r.f = { o, h, l, c, v }; }
      r.h = Math.max(r.h, h); r.l = Math.min(r.l, l); r.c = c; r.value += c * v;
    }
    const prior = Array.from(days.keys()).filter((d) => d < today).sort();
    if (prior.length < BASELINE_SESSIONS - 2) return null;
    const firstVols = prior.slice(-BASELINE_SESSIONS).map((d) => days.get(d)!.first).filter((v): v is number => !!v && v > 0);
    if (firstVols.length < BASELINE_SESSIONS - 2) return null;
    const atrDays = prior.slice(-(ATR_SESSIONS + 1));
    let trSum = 0, trN = 0, valSum = 0;
    for (let i = 1; i < atrDays.length; i++) {
      const r = days.get(atrDays[i])!, pc = days.get(atrDays[i - 1])!.c;
      trSum += Math.max(r.h, pc) - Math.min(r.l, pc); trN++; valSum += r.value;
    }
    if (trN < 8) return null;
    const last = days.get(prior[prior.length - 1])!;
    const todayRow = days.get(today);
    return {
      avgFirstVol: firstVols.reduce((a, b) => a + b, 0) / firstVols.length,
      atr: trSum / trN,
      avgValueCr: valSum / trN / 1e7,
      prevClose: last.c,
      tick,
      ...(todayRow?.f ? { first: todayRow.f } : {}),
    };
  }

  // ── Candidates (09:20) ─────────────────────────────────────────────────────

  private async buildCandidates(state: EngineState, client: any, now: Date) {
    const cfg = state.config;
    const base = state.baselines!;
    const kite = client['kite'] || client;
    const eligible = Array.from(base.entries()).filter(([, b]) => b.avgValueCr >= cfg.minAvgValueCr && b.prevClose >= cfg.minPrice);

    // The first candle of each stock: from the loaded history when the engine started after 09:20, else from
    // quotes (screen) + the 5m candle itself for the shortlist.
    const firsts = new Map<string, { o: number; h: number; l: number; c: number; v: number }>();
    for (const [sym, b] of eligible) if (b.first) firsts.set(sym, b.first);
    const circuits = new Map<string, { lower: number; upper: number }>();
    const missing = eligible.filter(([sym]) => !firsts.has(sym)).map(([sym]) => sym);
    if (missing.length > 0) {
      const shortlist: string[] = [];
      for (let i = 0; i < missing.length; i += 500) {
        const keys = missing.slice(i, i + 500).map((s) => `NSE:${s}`);
        let q: Record<string, any> = {};
        try { q = await kite.getQuote(keys); } catch (e: any) { this.log(state, `⚠ Quotes unavailable: ${e?.message || e}`); return; }
        for (const sym of missing.slice(i, i + 500)) {
          const x = q[`NSE:${sym}`];
          if (!x?.volume) continue;
          circuits.set(sym, { lower: Number(x.lower_circuit_limit) || 0, upper: Number(x.upper_circuit_limit) || 0 });
          if (x.volume / base.get(sym)!.avgFirstVol >= cfg.minRvol * 0.7) shortlist.push(sym);
        }
      }
      const from = new Date(`${getIstDateStr(now)}T09:15:00.000+05:30`);
      for (let i = 0; i < shortlist.length; i += 3) {
        await Promise.all(shortlist.slice(i, i + 3).map(async (sym) => {
          try {
            const raw: any[] = await client.getHistoricalData(sym, 'NSE', '5minute', from, now);
            const k = (raw || []).find((r: any) => getIstHhmm(new Date(r.date)) === 9 * 60 + 15 && getIstDateStr(new Date(r.date)) === getIstDateStr(now));
            if (k) firsts.set(sym, { o: Number(k.open), h: Number(k.high), l: Number(k.low), c: Number(k.close), v: Number(k.volume) || 0 });
          } catch { /* retried below */ }
        }));
      }
      // Kite publishes the 09:15 candle a moment after 09:20: try again shortly unless it is getting late.
      const got = shortlist.filter((s) => firsts.has(s)).length;
      if (got < shortlist.length && getIstHhmm(now) < 9 * 60 + 22) return;
    }

    const list: Candidate[] = [];
    for (const [sym, b] of eligible) {
      const f = firsts.get(sym);
      if (!f || !(f.v > 0)) continue;
      const rvol = f.v / b.avgFirstVol;
      if (rvol < cfg.minRvol) continue;
      const side: Side | null = f.c < f.o ? 'SHORT' : f.c > f.o ? 'LONG' : null;
      if (!side || (side === 'SHORT' && !cfg.allowShorts) || (side === 'LONG' && !cfg.allowLongs)) continue;
      if (state.tradedSymbols.has(sym)) continue;
      const cir = circuits.get(sym);
      if (cir && ((side === 'SHORT' && cir.lower > 0 && (f.c - cir.lower) / f.c < 0.01) || (side === 'LONG' && cir.upper > 0 && (cir.upper - f.c) / f.c < 0.01))) continue;
      const tick = b.tick || 0.05;
      list.push({ symbol: sym, side, level: side === 'SHORT' ? f.l : f.h, stopDist: Math.max(tick * 4, cfg.stopAtrFraction * b.atr), rvol, tick, first: f, ltp: null, ltpAt: 0, done: false });
    }
    list.sort((a, b) => b.rvol - a.rvol);
    state.candidates = list.slice(0, MAX_CANDIDATES);

    if (state.candidates.length === 0) {
      this.log(state, `📭 No stock in play today (no first candle >= ${cfg.minRvol}x its usual volume in the ${eligible.length} liquid stocks${cfg.allowLongs ? '' : ' with a red candle'}).`);
      if (state.positions.length === 0) state.completeReason = `🏁 Nothing to trade today. Strategy completed.`;
      return;
    }
    for (const c of state.candidates) {
      this.log(state, `🎯 In play: ${c.symbol} — first candle O ₹${c.first.o} H ₹${c.first.h} L ₹${c.first.l} C ₹${c.first.c}, volume ${c.rvol.toFixed(1)}x usual | ${c.side === 'SHORT' ? `Short below ₹${c.level.toFixed(2)}` : `Buy above ₹${c.level.toFixed(2)}`}, stop ₹${c.stopDist.toFixed(2)} from the fill`);
      logSignal('SETUP', state.strategyId, { engine: 'STOCKS_IN_PLAY', symbol: c.symbol, side: c.side, level: c.level, stopDist: c.stopDist, rvol: c.rvol, first: c.first, isPaper: state.isPaperTrade });
      try { await this.tickerService.subscribeSymbol(state.brokerAccountId, c.symbol); state.subscribed.add(c.symbol); } catch { /* REST prices cover it */ }
    }
  }

  // ── Prices ─────────────────────────────────────────────────────────────────

  /** REST fallback for prices older than 4s (open positions and live candidates). */
  private async refreshPrices(state: EngineState, client: any, now: Date) {
    const t = now.getTime();
    const stale: { symbol: string; set: (px: number) => void }[] = [];
    for (const p of state.positions) if (t - p.ltpAt > 4000) stale.push({ symbol: p.symbol, set: (px) => { p.ltp = px; p.ltpAt = Date.now(); } });
    for (const c of state.candidates || []) if (!c.done && t - c.ltpAt > 4000) stale.push({ symbol: c.symbol, set: (px) => { c.ltp = px; c.ltpAt = Date.now(); } });
    if (stale.length === 0) return;
    try {
      const ltps: Record<string, number> = await client.getLTP(stale.map((s) => `NSE:${s.symbol}`));
      for (const s of stale) { const px = ltps[`NSE:${s.symbol}`]; if (px && px > 0) s.set(px); }
    } catch (e: any) {
      this.logger.warn(`[${state.strategyId}] LTP refresh failed: ${e?.message || e}`);
    }
  }

  // ── Entries ────────────────────────────────────────────────────────────────

  private getEntryCutoffPassed(state: EngineState, now: Date): boolean {
    const [h, m] = state.config.entryCutoffTime.split(':').map(Number);
    return getIstHhmm(now) >= Math.min(h * 60 + m, SQUARE_OFF_HHMM);
  }

  private async checkEntries(state: EngineState, client: any, now: Date) {
    if (state.stopping || !state.candidates) return;
    const live = state.candidates.filter((c) => !c.done);
    if (this.getEntryCutoffPassed(state, now)) {
      if (!state.loggedCutoff) {
        state.loggedCutoff = true;
        for (const c of live) c.done = true;
        this.log(state, `⏱ Entry cutoff ${state.config.entryCutoffTime} reached — no new trades today.`);
        if (state.positions.length === 0) state.completeReason = `🏁 Entry window closed with no open position. Strategy completed.`;
      }
      return;
    }
    if (state.tradesToday >= state.config.maxPositions) {
      for (const c of live) c.done = true;
      if (state.positions.length === 0) state.completeReason = `⛔ Max ${state.config.maxPositions} trades done for today. Strategy completed.`;
      return;
    }
    if (live.length === 0) {
      if (state.positions.length === 0) state.completeReason = `🏁 Every stock in play has been traded or dropped. Strategy completed.`;
      return;
    }
    for (const c of live) {
      if (c.ltp === null || now.getTime() - c.ltpAt > 10_000) continue;
      const broke = c.side === 'SHORT' ? c.ltp <= c.level : c.ltp >= c.level;
      if (!broke) continue;
      await this.enterTrade(state, client, c, now);
      if (state.tradesToday >= state.config.maxPositions) return;
    }
  }

  private async enterTrade(state: EngineState, client: any, c: Candidate, now: Date) {
    const cfg = state.config;
    c.done = true;
    const ltp = c.ltp!;
    const sign = c.side === 'LONG' ? 1 : -1;

    const chase = (ltp - c.level) * sign;
    if (chase > MAX_CHASE_OF_STOP * c.stopDist) {
      this.log(state, `⏭ ${c.symbol} broke ₹${c.level.toFixed(2)} but is already at ₹${ltp.toFixed(2)} (more than ${MAX_CHASE_OF_STOP} of the stop distance past it). Not chasing.`);
      return;
    }

    // Hard daily cap: re-count today's trades from Zerodha's order book (paper: saved orders) before every entry.
    const tradesToday = await countTodaysTradesForEntry({ prisma: this.prisma, factory: this.factory, strategyId: state.strategyId, brokerAccountId: state.brokerAccountId, isPaper: state.isPaperTrade });
    if (tradesToday === null) {
      this.log(state, `⛔ Could not verify today's trade count (Zerodha and DB unreadable) — skipping ${c.symbol} to stay within the ${cfg.maxPositions}-trade limit.`);
      c.done = false; // try again on the next price
      return;
    }
    if (tradesToday >= cfg.maxPositions) {
      state.tradesToday = Math.max(state.tradesToday, tradesToday);
      this.log(state, `⛔ Daily trade limit reached: ${tradesToday}/${cfg.maxPositions} trades already taken today. Skipping ${c.symbol}.`);
      return;
    }

    // Capital per position slot. Live: the free margin (already net of open positions) split over the slots still
    // free, never more than an even share of maxCapital. Paper: an even share of maxCapital (default ₹15,000).
    let slotCapital: number;
    if (state.isPaperTrade) {
      slotCapital = (cfg.maxCapital ?? 15000) / cfg.maxPositions;
    } else {
      const cash = await this.liveCash(client);
      if (cash === null) {
        this.log(state, `⚠ Could not read the Zerodha margin — skipping ${c.symbol} rather than sizing blind.`);
        return;
      }
      slotCapital = cash / Math.max(1, cfg.maxPositions - state.positions.length);
      if (cfg.maxCapital !== null) slotCapital = Math.min(slotCapital, cfg.maxCapital / cfg.maxPositions);
    }
    const qtyByCapital = Math.floor((slotCapital * cfg.leverage * 0.95) / ltp);
    const qtyByRisk = Math.floor(cfg.stopLossRs / c.stopDist);
    const qty = Math.min(qtyByCapital, qtyByRisk);
    if (qty < 1) {
      this.log(state, `⏭ ${c.symbol} skipped: 1 share needs ₹${(ltp / cfg.leverage).toFixed(0)} margin or risks ₹${c.stopDist.toFixed(2)} (capital per slot ₹${slotCapital.toFixed(0)}, max loss ₹${cfg.stopLossRs}).`);
      return;
    }
    this.log(state, `🚀 ${c.symbol} broke ₹${c.level.toFixed(2)} at ₹${ltp.toFixed(2)} — ${c.side === 'SHORT' ? 'shorting' : 'buying'} ${qty} (risk allows ${qtyByRisk}, capital allows ${qtyByCapital}).`);

    const entrySide: 'BUY' | 'SELL' = c.side === 'LONG' ? 'BUY' : 'SELL';
    let fill: { qty: number; price: number; orderId: string } | null;
    if (state.isPaperTrade) {
      fill = { qty, price: ltp, orderId: `PAPER_${Math.random().toString(36).substring(2, 10).toUpperCase()}` };
      await this.recordPaperOrder(state, c.symbol, entrySide, qty, ltp, fill.orderId, 'MARKET', 'COMPLETE');
    } else {
      fill = await this.placeLiveEntry(state, client, c.symbol, entrySide, qty);
      if (!fill) return;
    }
    state.tradedSymbols.add(c.symbol);

    const sl = roundTo(fill.price - sign * c.stopDist, c.tick, c.side === 'LONG' ? 'down' : 'up');
    state.tradesToday++;
    const p: OpenPosition = {
      symbol: c.symbol, side: c.side, entryPrice: fill.price, qty: fill.qty, sl, tick: c.tick, rvol: c.rvol,
      slOrderId: null, openedAt: now.getTime(), ltp: ltp, ltpAt: Date.now(), slBreachAt: null, retryExit: null, lastExitAttempt: 0, lastOrdersCheck: 0, lastBrokerPosCheck: 0,
    };
    state.positions.push(p);
    this.log(state, `📋 Placed Trade: NSE:${c.symbol} — ${c.side} Entry: ₹${fill.price.toFixed(2)} | Qty: ${fill.qty} | SL: ₹${sl.toFixed(2)} (risk ₹${(Math.abs(fill.price - sl) * fill.qty).toFixed(2)}) | Exit at the SL or 15:05 | Trade ${state.tradesToday}/${cfg.maxPositions} | Order ${fill.orderId}`);
    logSignal('ENTRY', state.strategyId, { engine: 'STOCKS_IN_PLAY', symbol: c.symbol, side: c.side, level: c.level, entry: fill.price, sl, qty: fill.qty, rvol: c.rvol, isPaper: state.isPaperTrade });

    if (state.isPaperTrade) {
      await this.recordPaperOrder(state, c.symbol, entrySide === 'BUY' ? 'SELL' : 'BUY', p.qty, sl, `${fill.orderId}_SL`, 'SL', 'OPEN', sl);
      p.slOrderId = `${fill.orderId}_SL`;
    } else {
      await this.armStopLoss(state, p);
      if (!p.slOrderId) {
        this.log(state, `🚨 Broker SL could not be placed for ${p.symbol}. Flattening the position now.`);
        await this.exitPosition(state, client, p, 'NO_PROTECTION', p.ltp ?? fill.price);
      }
    }
  }

  /** MARKET order through the gateway, then the real fill from the order book. Null when nothing filled. */
  private async placeLiveEntry(state: EngineState, client: any, symbol: string, side: 'BUY' | 'SELL', qty: number): Promise<{ qty: number; price: number; orderId: string } | null> {
    let orderId: string;
    try {
      orderId = await this.placeOrder(state, { symbol, exchange: 'NSE', product: 'MIS', qty, side, orderType: 'MARKET', intent: 'ENTRY' });
    } catch (e: any) {
      this.log(state, `❌ Entry order for ${symbol} failed: ${e?.message || e}`);
      return null;
    }

    let order = await this.awaitOrder(client, orderId, 5000);
    if (order && order.filledQty < qty && !['COMPLETE', 'REJECTED', 'CANCELLED'].includes(order.status)) {
      this.log(state, `⏳ Entry ${orderId} still ${order.status} (${order.filledQty}/${qty} filled) — cancelling the rest.`);
      await client.cancelOrder(orderId).catch(() => undefined);
      order = (await this.awaitOrder(client, orderId, 2000)) ?? order;
    }
    if (order && order.filledQty > 0 && order.avgPrice > 0) {
      this.log(state, `✅ Entry ${orderId} filled ${order.filledQty}/${qty} @ ₹${order.avgPrice.toFixed(2)} (${order.status})`);
      return { qty: order.filledQty, price: order.avgPrice, orderId };
    }
    if (order && (order.status === 'REJECTED' || order.status === 'CANCELLED')) {
      this.log(state, `❌ Entry ${orderId} ${order.status}${order.message ? `: ${order.message}` : ''}. Not counted as a trade.`);
      return null;
    }
    // Order book silent: the position book decides whether we are in.
    const pos = await getLiveBrokerPosition(client['kite'] || client, symbol, this.logger, { exchange: 'NSE', product: 'MIS' });
    const avg = Number(pos.rawPosition?.average_price) || Number(side === 'BUY' ? pos.rawPosition?.buy_price : pos.rawPosition?.sell_price) || 0;
    const held = side === 'BUY' ? pos.netQty : -pos.netQty;
    if (held > 0 && avg > 0) {
      this.log(state, `✅ Entry ${orderId} confirmed from positions: ${held} qty @ ₹${avg.toFixed(2)}`);
      return { qty: held, price: avg, orderId };
    }
    this.log(state, `🚨 Entry ${orderId} for ${symbol} could not be confirmed (order ${order?.status ?? 'not found'}, position ${pos.netQty}). Not tracking it — check Kite.`);
    return null;
  }

  private async liveCash(client: any): Promise<number | null> {
    try {
      const kite = client['kite'] || client;
      const m = await (kite.getMargins ? kite.getMargins() : client.getMargins());
      const cash = m?.equity?.available?.live_balance ?? m?.equity?.available?.cash ?? m?.equity?.net ?? m?.available?.live_balance ?? m?.available?.cash ?? m?.net;
      return cash !== undefined && cash !== null ? Number(cash) : null;
    } catch {
      return null;
    }
  }

  // ── Position management ────────────────────────────────────────────────────

  private async managePositions(state: EngineState, client: any, now: Date) {
    for (const p of [...state.positions]) {
      if (!state.positions.includes(p)) continue;
      await this.managePosition(state, client, p, now);
    }
    if (state.positions.length > 0 && now.getTime() - state.lastPnlLog >= 30_000) {
      state.lastPnlLog = now.getTime();
      const parts = state.positions.map((p) => {
        const px = p.ltp ?? p.entryPrice;
        const open = (px - p.entryPrice) * p.qty * (p.side === 'LONG' ? 1 : -1);
        return `${p.side} ${p.symbol} ₹${px.toFixed(2)} (entry ₹${p.entryPrice.toFixed(2)}, SL ₹${p.sl.toFixed(2)}) ${open >= 0 ? '+' : ''}₹${open.toFixed(2)}`;
      });
      this.log(state, `📊 [LIVE P&L] ${parts.join(' | ')}`);
    }
  }

  private async managePosition(state: EngineState, client: any, p: OpenPosition, now: Date) {
    const kite = client ? client['kite'] || client : null;
    const exitSide: 'BUY' | 'SELL' = p.side === 'LONG' ? 'SELL' : 'BUY';
    const match = { exchange: 'NSE', product: 'MIS' };

    if (!state.isPaperTrade && kite) {
      if (p.slOrderId && now.getTime() - p.lastOrdersCheck >= 2500) {
        p.lastOrdersCheck = now.getTime();
        const o = await this.readOrder(kite, p.slOrderId);
        if (o && o.status === 'COMPLETE' && o.filledQty > 0) {
          this.log(state, `🛑 Broker SL order ${p.slOrderId} (${p.symbol}) filled ${o.filledQty} @ ₹${o.avgPrice.toFixed(2)}`);
          this.closePosition(state, p, o.avgPrice || p.sl, 'BROKER_SL', p.slOrderId);
          return;
        }
      }
      if (now.getTime() - p.lastBrokerPosCheck >= 15_000) {
        p.lastBrokerPosCheck = now.getTime();
        const pos = await getLiveBrokerPosition(kite, p.symbol, this.logger, match);
        if (!pos.isOpen) {
          // A manual exit in Kite leaves the SL order working; if it later triggered it would open a new position.
          if (p.slOrderId) await client.cancelOrder(p.slOrderId).catch(() => undefined);
          const exit = await getCompletedBrokerExitDetails(kite, p.symbol, p.slOrderId, null, exitSide, this.logger, match);
          const px = exit.found && exit.exitPrice > 0 ? exit.exitPrice : (p.ltp ?? p.entryPrice);
          this.log(state, `ℹ [AUTO-SYNC] ${p.symbol} is flat at the broker (closed outside the engine) — exit ₹${px.toFixed(2)}${exit.found ? ` (order ${exit.orderId})` : ' (last price; exit order not found)'}.`);
          this.closePosition(state, p, px, 'BROKER_SYNC', exit.orderId);
          return;
        }
      }
    }

    const price = p.ltp;
    if (p.retryExit && now.getTime() - p.lastExitAttempt >= 3000) {
      this.log(state, `🔁 Retrying the unconfirmed exit of ${p.symbol}.`);
      await this.exitPosition(state, client, p, p.retryExit, price ?? p.entryPrice);
      return;
    }
    if (getIstHhmm(now) >= SQUARE_OFF_HHMM) {
      this.log(state, `⏰ 15:05 square-off — exiting ${p.side} ${p.symbol}.`);
      await this.exitPosition(state, client, p, 'SQUARE_OFF', price ?? p.entryPrice);
      return;
    }
    if (price === null) return;

    const beyondSl = p.side === 'LONG' ? price <= p.sl : price >= p.sl;
    if (beyondSl) {
      if (state.isPaperTrade) {
        this.log(state, `🛑 Stop loss hit: ${p.symbol} ₹${price.toFixed(2)} vs SL ₹${p.sl.toFixed(2)}`);
        await this.exitPosition(state, client, p, 'SL', price);
        return;
      }
      // Live: the exchange SL should fill; if it has not within the grace period (gap through the limit), exit at market.
      if (p.slBreachAt === null) {
        p.slBreachAt = now.getTime();
      } else if (now.getTime() - p.slBreachAt >= SL_BREACH_GRACE_MS) {
        this.log(state, `🛑 ${p.symbol} ₹${price.toFixed(2)} is beyond the SL ₹${p.sl.toFixed(2)} and the broker SL has not filled — exiting at market.`);
        await this.exitPosition(state, client, p, 'SL', price);
        return;
      }
    } else {
      p.slBreachAt = null;
    }
  }

  // ── Broker stop-loss ───────────────────────────────────────────────────────

  /** SL-limit price a little beyond the trigger so a fast move still fills. */
  private slLimit(p: OpenPosition, trigger: number): number {
    const buf = Math.max(p.tick * 4, trigger * 0.005);
    return p.side === 'LONG' ? roundTo(trigger - buf, p.tick, 'down') : roundTo(trigger + buf, p.tick, 'up');
  }

  private async armStopLoss(state: EngineState, p: OpenPosition) {
    const trigger = roundTo(p.sl, p.tick, p.side === 'LONG' ? 'down' : 'up');
    const price = this.slLimit(p, trigger);
    const side: 'BUY' | 'SELL' = p.side === 'LONG' ? 'SELL' : 'BUY';
    for (let attempt = 1; attempt <= 2 && !p.slOrderId; attempt++) {
      try {
        p.slOrderId = await this.placeOrder(state, { symbol: p.symbol, exchange: 'NSE', product: 'MIS', qty: p.qty, side, orderType: 'SL', triggerPrice: trigger, price, intent: 'PROTECTIVE' });
        this.log(state, `🛡 Broker SL armed for ${p.symbol} (${p.slOrderId}): ${side} ${p.qty}, trigger ₹${trigger.toFixed(2)}, limit ₹${price.toFixed(2)}`);
      } catch (e: any) {
        this.log(state, `⚠ Broker SL placement for ${p.symbol} failed (attempt ${attempt}/2): ${e?.message || e}`);
      }
    }
  }

  // ── Exits ──────────────────────────────────────────────────────────────────

  /** Closes the open quantity at market and books the trade on the real fill (paper: at `refPrice`). */
  private async exitPosition(state: EngineState, client: any, p: OpenPosition, reason: ExitReason, refPrice: number) {
    if (!state.positions.includes(p)) return;
    p.lastExitAttempt = Date.now();
    const exitSide: 'BUY' | 'SELL' = p.side === 'LONG' ? 'SELL' : 'BUY';
    const match = { exchange: 'NSE', product: 'MIS' };

    if (state.isPaperTrade) {
      const id = `PAPER_EXIT_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      await this.recordPaperOrder(state, p.symbol, exitSide, p.qty, refPrice, id, 'MARKET', 'COMPLETE');
      this.closePosition(state, p, refPrice, reason, id);
      return;
    }
    if (!client) {
      this.log(state, `🚨 No broker session — cannot exit ${p.symbol}. The broker SL stays active.`);
      return;
    }
    const kite = client['kite'] || client;

    // Cancel the protective order first; if it filled meanwhile, that fill is the exit.
    if (p.slOrderId) {
      await client.cancelOrder(p.slOrderId).catch(() => undefined);
      const sl = await this.readOrder(kite, p.slOrderId);
      if (sl && sl.status === 'COMPLETE' && sl.filledQty > 0) {
        this.log(state, `🛑 Broker SL ${p.slOrderId} (${p.symbol}) had already filled @ ₹${sl.avgPrice.toFixed(2)}`);
        this.closePosition(state, p, sl.avgPrice || p.sl, 'BROKER_SL', p.slOrderId);
        return;
      }
    }

    // Never send more than the broker holds; a lagging position book gets a few retries before "flat" is believed.
    let safety = await isSafeToExit(kite, p.symbol, exitSide, this.logger, match);
    for (let attempt = 0; attempt < 3 && !safety.safe; attempt++) {
      await sleep(700);
      safety = await isSafeToExit(kite, p.symbol, exitSide, this.logger, match);
    }
    if (safety.unknown) {
      p.retryExit = reason;
      p.slOrderId = null;
      this.log(state, `⚠ Zerodha positions for ${p.symbol} could not be read — exit not sent. Re-arming the SL and retrying.`);
      await this.armStopLoss(state, p);
      return;
    }
    if (!safety.safe) {
      const exit = await getCompletedBrokerExitDetails(kite, p.symbol, p.slOrderId, null, exitSide, this.logger, match);
      const px = exit.found && exit.exitPrice > 0 ? exit.exitPrice : refPrice;
      this.log(state, `ℹ [AUTO-SYNC] ${p.symbol} is already flat at the broker (qty ${safety.brokerQty}). No order sent.`);
      this.closePosition(state, p, px, 'BROKER_SYNC', exit.orderId);
      return;
    }

    const exitQty = Math.min(p.qty, Math.abs(safety.brokerQty));
    let orderId: string | null = null;
    try {
      orderId = await this.placeOrder(state, { symbol: p.symbol, exchange: 'NSE', product: 'MIS', qty: exitQty, side: exitSide, orderType: 'MARKET', intent: 'EXIT' });
    } catch (e: any) {
      this.log(state, `❌ Exit order for ${p.symbol} failed: ${e?.message || e}. Re-arming the SL and retrying.`);
      p.retryExit = reason;
      p.slOrderId = null;
      await this.armStopLoss(state, p);
      return;
    }
    const o = await this.awaitOrder(client, orderId, 5000);

    await sleep(500);
    const after = await getLiveBrokerPosition(kite, p.symbol, this.logger, match);
    // isOpen with netQty 0 means the position book could not be read; then only a COMPLETE exit order counts as flat.
    const unreadable = after.isOpen && after.netQty === 0;
    const held = Math.abs(after.netQty);
    const remaining = held > 0 ? held : p.qty - (o?.filledQty ?? 0);
    if (remaining > 0 && (held > 0 || (unreadable && o?.status !== 'COMPLETE'))) {
      p.qty = remaining;
      p.slOrderId = null;
      p.retryExit = reason;
      this.log(state, `🚨 ${p.symbol} not confirmed flat after the exit order (${o?.status ?? 'status unknown'}, broker qty ${unreadable ? 'unreadable' : after.netQty}). Re-arming the SL for ${remaining} qty and retrying.`);
      await this.armStopLoss(state, p);
      return;
    }

    const px = o && o.avgPrice > 0 ? o.avgPrice : refPrice;
    if (!o || !(o.avgPrice > 0)) this.log(state, `⚠ Exit fill price not confirmed for ${orderId ?? p.symbol}; using ₹${refPrice.toFixed(2)}. The order book holds the real price.`);
    this.closePosition(state, p, px, reason, orderId);
  }

  /** Books the trade's result and removes the position. No orders are placed here. */
  private closePosition(state: EngineState, p: OpenPosition, exitPrice: number, reason: ExitReason, orderId: string | null) {
    if (!state.positions.includes(p)) return;
    const pnl = (exitPrice - p.entryPrice) * p.qty * (p.side === 'LONG' ? 1 : -1);
    state.realizedTodayRs += pnl;
    if (pnl > 0) state.winsToday++;
    else if (pnl < 0) state.lossesToday++;

    if (state.isPaperTrade && p.slOrderId) {
      this.prisma.order.updateMany({ where: { brokerOrderId: p.slOrderId, isPaperTrade: true, status: 'OPEN' }, data: { status: 'CANCELLED' } }).catch(() => undefined);
    }
    const label: Record<ExitReason, string> = {
      SL: 'Stop Loss Hit', SQUARE_OFF: '15:05 square-off', MANUAL: 'Manual square-off', BROKER_SL: 'Broker SL filled',
      BROKER_SYNC: 'Closed outside the engine', NO_PROTECTION: 'Exited (no broker SL)',
    };
    this.log(state, `🏁 ${label[reason]} — ${p.symbol} exit at ₹${exitPrice.toFixed(2)} (${p.side} entry ₹${p.entryPrice.toFixed(2)}) | Realized P&L: ₹${pnl.toFixed(2)} | Today: ₹${state.realizedTodayRs.toFixed(2)} (${state.winsToday}W/${state.lossesToday}L, ${state.tradesToday}/${state.config.maxPositions} trades) [${orderId ?? 'n/a'}]`);
    logSignal('EXIT', state.strategyId, { engine: 'STOCKS_IN_PLAY', symbol: p.symbol, side: p.side, reason, entry: p.entryPrice, exit: exitPrice, qty: p.qty, pnl, rvol: p.rvol, heldMs: Date.now() - p.openedAt, isPaper: state.isPaperTrade });

    state.positions = state.positions.filter((x) => x !== p);
    strategyEvents.emit('strategy.update', { strategyId: state.strategyId, logs: state.logs, state: this.snapshot(state) });
  }

  // ── Orders and records ─────────────────────────────────────────────────────

  private async readOrder(kite: any, orderId: string): Promise<OrderSnap | null> {
    try {
      const orders: any[] = await kite.getOrders();
      const o = orders?.find((x: any) => x.order_id === orderId);
      return o ? { status: o.status, filledQty: Number(o.filled_quantity) || 0, avgPrice: Number(o.average_price) || 0, message: o.status_message } : null;
    } catch {
      return null;
    }
  }

  /** Polls the order book until the order is final or `maxMs` passes; returns the last state seen. */
  private async awaitOrder(client: any, orderId: string, maxMs: number): Promise<OrderSnap | null> {
    const kite = client['kite'] || client;
    const deadline = Date.now() + maxMs;
    let last: OrderSnap | null = null;
    do {
      await sleep(500);
      last = (await this.readOrder(kite, orderId)) ?? last;
      if (last && ['COMPLETE', 'REJECTED', 'CANCELLED'].includes(last.status)) return last;
    } while (Date.now() < deadline);
    return last;
  }

  private async recordPaperOrder(state: EngineState, symbol: string, side: 'BUY' | 'SELL', qty: number, price: number, orderId: string, orderType: 'MARKET' | 'SL', status: 'OPEN' | 'COMPLETE', triggerPrice?: number) {
    await this.orderGateway.recordEngineOrder({
      userId: state.userId,
      accountId: state.brokerAccountId,
      strategyId: state.strategyId,
      executionId: state.executionId,
      symbol,
      exchange: 'NSE',
      side,
      orderType,
      product: 'MIS',
      qty,
      price,
      triggerPrice: triggerPrice ?? null,
      brokerOrderId: orderId,
      status,
      isPaper: true,
    });
  }

  // ── Logging ────────────────────────────────────────────────────────────────

  private log(state: EngineState, msg: string) {
    const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    pushEngineLog(state.logs, `[${ts}] ${msg}`);
    this.logger.log(`[${state.executionId}] ${msg}`);
  }

  private async persistLogs(state: EngineState) {
    try {
      const tail = state.logs[state.logs.length - 1];
      const now = Date.now();
      if (tail !== state.lastPersistedLogTail || now - (state.lastDbPersistTime || 0) >= 15_000) {
        state.lastPersistedLogTail = tail;
        state.lastDbPersistTime = now;
        await this.prisma.strategyExecution.update({ where: { id: state.executionId }, data: { logs: JSON.stringify(state.logs.slice(-MAX_ENGINE_LOGS)) } });
      }
      strategyEvents.emit('strategy.update', { strategyId: state.strategyId, logs: state.logs, state: this.snapshot(state) });
    } catch { /* logging must not disturb trading */ }
  }
}
