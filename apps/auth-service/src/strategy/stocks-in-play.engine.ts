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
import { FADE_MIN_HISTORY, FadeCandle, fadeLongTrigger, fadeReadings, fadeShortTrigger, FadeTrigger, toCompletedCandles } from './inplay-fade-signals';
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
 *
 * Setup FADE (In-play Fade, config setup: 'FADE') uses the same 09:20 RVOL scan but trades the rollover instead:
 * - Candidates: first 5m candle volume >= minRvol x usual AND the stock opened above the previous close (gap up).
 *   Any candle colour. Skipped when the upper circuit is within 2.5% (a short squeezed into the circuit cannot exit).
 * - Signal: on each 5m candle closing 09:20..09:45, MFI/Stochastic/Bollinger/CMF turning down from overbought
 *   (inplay-fade-signals.ts). The earliest candle wins; several on one candle -> highest RVOL first.
 * - Entry: SHORT at market right after that candle closes (skipped if more than 2 minutes late).
 * - Exits: stop stopPct above the fill (exchange SL order), target targetR x the stop below it (engine-watched,
 *   market exit), stop moved to the entry once the trade is breakevenAtR x the stop in profit, then (profitLock)
 *   to +0.5R at +1.5R and +1.5R at +2.5R; else 15:05.
 * - Backtest (2024-09 .. 2026-09, 1m bars, Zerodha costs + slippage, 1 trade/day, ₹500 risk, 1.2% / 3R / BE at 1R,
 *   avg value >= ₹10 Cr, price >= ₹50): +₹70.4k, year 1 +₹30.1k, year 2 +₹40.4k, 39% wins, avg loss ₹341,
 *   max drawdown ₹4.9k, 20/25 green months. Entering 1 minute late cut it to +₹46k, so entries must be prompt.
 * - fadeLongs adds the mirror on gap-down stocks: an oversold turn-up on the same closes ARMS a long, bought only when
 *   price then trades above the first 5m candle's high within 30 minutes (same % stop, target and stop ladder).
 *   maxPositions then counts per side. Backtest (scratchpad research2.js, 29 Oct 2026, ₹500 risk): the long side
 *   alone +₹11.0k (year 1 -₹1.2k, year 2 +₹12.2k), weak; book with up to 1 short + 1 long a day +₹73.6k vs +₹62.6k
 *   short only, max drawdown ₹7.6k vs ₹5.1k. Buying the turn-up without the high break lost (-₹9.0k).
 */

type Side = 'LONG' | 'SHORT';
type ExitReason = 'SL' | 'TARGET' | 'SQUARE_OFF' | 'MANUAL' | 'BROKER_SL' | 'BROKER_SYNC' | 'NO_PROTECTION';
type Setup = 'ORB' | 'FADE';

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

const FIVE_MIN_MS = 5 * 60_000;
/** FADE: signals on the candles starting 09:15..09:40 (closing 09:20..09:45). */
const FADE_FIRST_CANDLE_HHMM = 9 * 60 + 15;
const FADE_LAST_CANDLE_HHMM = 9 * 60 + 40;
const FADE_MAX_CANDIDATES = 25;
/** Calendar days of 5m history loaded per candidate for the indicator warm-up (needs the previous session). */
const FADE_HISTORY_DAYS = 10;
/** Wait this long after a candle closes before reading it, so Kite has the final candle. */
const FADE_SETTLE_MS = 2000;
/** A candle Kite has not published this long after its close is given up for that stock. */
const FADE_CANDLE_WAIT_MS = 45_000;
/** No entry on a signal older than this: the backtest edge fell from ₹70k to ₹46k with a 1-minute delay. */
const FADE_MAX_ENTRY_DELAY_MS = 120_000;
/** Skip a fade candidate whose upper circuit is this close (short squeezed into the circuit cannot be covered). */
const FADE_MIN_CIRCUIT_ROOM = 0.025;
/** FADE long: after the oversold turn-up, the first-candle high must break within this long. */
const FADE_LONG_BREAK_WINDOW_MS = 30 * 60_000;
/** Retry a failed breakeven SL modification after this long. */
const BREAKEVEN_RETRY_MS = 10_000;
/** FADE profit lock after breakeven, as [profit reached in R, profit locked in R]. Backtest: same total as without
 *  (₹76.0k vs ₹76.4k), wins 39% -> 51%, worst month -₹3.6k -> -₹2.4k (scratchpad protect.js, 28 Oct 2026). */
const FADE_PROFIT_LOCK_STEPS: [number, number][] = [[1.5, 0.5], [2.5, 1.5]];

interface ResolvedConfig {
  setup: Setup;
  /** FADE: stop distance as % of the fill. */
  stopPct: number;
  /** FADE: target at this multiple of the stop distance (0 = no target). */
  targetR: number;
  /** FADE: move the stop to the entry once the trade is this multiple of the stop in profit (0 = off). */
  breakevenAtR: number;
  /** FADE: after breakeven, lock +0.5R at +1.5R and +1.5R at +2.5R (FADE_PROFIT_LOCK_STEPS). */
  profitLock: boolean;
  stopLossRs: number;
  /** Daily trade cap and position slots (FADE with longs: both sides together). */
  maxPositions: number;
  /** Trades per side per day (FADE with longs: the configured maxPositions; otherwise = maxPositions). */
  perSideTrades: number;
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
  /** FADE: completed 5m candles (history + today) and the start of the last candle checked for a signal. */
  candles: FadeCandle[] | null;
  /** When candles was read from Kite (epoch ms). */
  candlesAt: number;
  checkedThrough: number;
  /** FADE long: the turn-up came; buy above `level` (first-candle high) until this time (epoch ms). 0 = not armed. */
  armedUntil: number;
}

interface OpenPosition {
  symbol: string;
  side: Side;
  entryPrice: number;
  qty: number;
  sl: number;
  /** Engine-watched target (FADE); null = none. */
  target: number | null;
  /** The original stop distance in ₹ (1R), for the target and the breakeven trigger. */
  stopDist: number;
  /** Stop already at the entry (or breakeven not used). */
  /** Every lock step (breakeven + profit locks) already applied, or none in use. */
  beDone: boolean;
  lastBeAttempt: number;
  /** Profit (in R) the stop currently locks; null = still the original stop. */
  lockedR: number | null;
  /** Best profit seen, in R. */
  bestR: number;
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
  /** Entries per side today (FADE per-side cap). */
  sideTrades: Record<Side, number>;
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
      sideTrades: { LONG: 0, SHORT: 0 },
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
    } else if (config.setup === 'FADE') {
      this.log(state, `▶ In-play Fade (${config.allowLongs ? 'short + long' : 'short'}) started | ${mode}`);
      this.log(state, `⚙ At 09:20: stocks that opened ABOVE yesterday's close and whose first 5m candle traded >= ${config.minRvol}x their usual volume (NIFTY 500 + F&O, price >= ₹${config.minPrice}, avg daily value >= ₹${config.minAvgValueCr} Cr) | SHORT on the first 5m close from 09:20 to 09:45 where MFI, Stochastic, Bollinger or CMF turns down from overbought | Stop ${config.stopPct}% | Target ${config.targetR > 0 ? `${config.targetR}R (${(config.stopPct * config.targetR).toFixed(2)}%)` : 'none'} | Stop to entry at ${config.breakevenAtR > 0 ? `+${config.breakevenAtR}R` : 'never'}${config.profitLock ? ' | Profit lock: +0.5R at +1.5R, +1.5R at +2.5R' : ''} | Max loss/trade ₹${config.stopLossRs} | ${config.maxPositions} trade(s)/day, ${config.leverage}x | Square-off 15:05`);
      if (config.allowLongs) this.log(state, `⚙ Longs: stocks that opened BELOW yesterday's close with the same volume | on an oversold turn-up (MFI, Stochastic, Bollinger or CMF) from 09:20 to 09:45, BUY only when price breaks the first 5m candle's high within 30 min | same stop, target and stop ladder | ${config.perSideTrades} long + ${config.perSideTrades} short a day`);
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
    // A stock already ordered today is never entered again; its first order (the entry) gives the side for the per-side cap.
    const todays: any[] = await this.prisma.order.findMany({
      where: { ...strategyOrderWhere(strategyId), createdAt: { gte: istDayStart() }, isPaperTrade: state.isPaperTrade },
      select: { symbol: true, side: true },
      orderBy: { createdAt: 'asc' },
    }).catch(() => []);
    for (const o of todays) {
      if (state.tradedSymbols.has(o.symbol)) continue;
      state.tradedSymbols.add(o.symbol);
      state.sideTrades[o.side === 'BUY' ? 'LONG' : 'SHORT']++;
    }

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
    // 0 is a real setting (off) for the target and the breakeven step; only a missing/invalid value takes the default.
    const numOrZero = (v: any, d: number) => (v === undefined || v === null || v === '' || !(Number(v) >= 0) ? d : Number(v));
    const setup: Setup = raw.setup === 'FADE' ? 'FADE' : 'ORB';
    const fade = setup === 'FADE';
    // The fade always shorts; its long mirror only with fadeLongs (and only on a break of the first-candle high).
    const allowShorts = fade ? true : raw.allowShorts !== false;
    const allowLongs = fade ? raw.fadeLongs === true : raw.allowLongs === true;
    if (!allowShorts && !allowLongs) throw new Error('Stocks-in-Play: enable shorts, longs or both.');
    const perSideTrades = Math.min(5, Math.floor(num(raw.maxPositions, fade ? 1 : 2)));
    return {
      setup,
      stopPct: Math.min(5, Math.max(0.3, num(raw.stopPct, 1.2))),
      targetR: Math.min(20, numOrZero(raw.targetR, 3)),
      breakevenAtR: Math.min(20, numOrZero(raw.breakevenAtR, 1)),
      profitLock: raw.profitLock !== false,
      stopLossRs,
      maxPositions: fade && allowLongs ? perSideTrades * 2 : perSideTrades,
      perSideTrades,
      minRvol: num(raw.minRvol, 10),
      stopAtrFraction: num(raw.stopAtrFraction, 0.2),
      minAvgValueCr: num(raw.minAvgValueCr, fade ? 10 : 25),
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
      // FADE: the target and breakeven come from the fixed % stop, so they are rebuilt from the fill alone.
      const fade = state.config.setup === 'FADE';
      const stopDist = fade ? (pos.avgPrice * state.config.stopPct) / 100 : Math.abs(pos.avgPrice - sl);
      // `sign` points at the stop side, so the target is the other way.
      const target = fade && state.config.targetR > 0 ? roundTo(pos.avgPrice - sign * state.config.targetR * stopDist, tick, pos.side === 'LONG' ? 'down' : 'up') : null;
      const probe = { side: pos.side, entryPrice: pos.avgPrice, stopDist } as OpenPosition;
      const lockedR = fade ? this.lockedROf(probe, sl) : null;
      const beDone = this.lockSteps(state.config).every(([, lk]) => lockedR !== null && lk <= lockedR + 1e-6);
      state.positions.push({
        symbol: pos.symbol, side: pos.side, entryPrice: pos.avgPrice, qty: pos.qty, sl, target, stopDist, beDone, lastBeAttempt: 0, lockedR, bestR: lockedR ?? 0, tick, rvol: null,
        slOrderId: pos.slOrderId, openedAt: Date.now(), ltp: null, ltpAt: 0, slBreachAt: null, retryExit: null, lastExitAttempt: 0, lastOrdersCheck: 0, lastBrokerPosCheck: 0,
      });
      state.tradedSymbols.add(pos.symbol);
      this.log(state, `🔄 [${pos.isPaper ? 'PAPER' : 'LIVE'} RECOVERY] Re-adopted ${pos.side} ${pos.symbol}: ${pos.qty} qty @ ₹${pos.avgPrice.toFixed(2)} | SL ₹${sl.toFixed(2)}${pos.slPrice ? '' : ' (no saved SL — set from the max loss)'}${target !== null ? ` | Target ₹${target.toFixed(2)}` : ''}${pos.slOrderId ? ` [Order ${pos.slOrderId}]` : ''}`);
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
      symbol: p.symbol, side: p.side, entryPrice: p.entryPrice, qty: p.qty, stopLossPrice: p.sl, targetPrice: p.target, currentLtp: p.ltp, pnlRs: pnlOf(p), rvol: p.rvol,
    }));
    const first = s.positions[0];
    return {
      // First position at the top level, for the shared single-position cards.
      entryTriggered: first ? first.side : null,
      activeSymbol: first?.symbol ?? null,
      entryPrice: first?.entryPrice ?? null,
      currentLtp: first?.ltp ?? null,
      stopLossPrice: first?.sl ?? null,
      targetPrice: first?.target ?? null,
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

      // No early `return` below: the completion check after the try block must still run.
      const fade = state.config.setup === 'FADE';
      const sessionOver = hhmm >= SQUARE_OFF_HHMM;
      // FADE only signals on the 09:20..09:45 closes; started (or still without candidates) after that, nothing is left today.
      const fadeOver = fade && !state.candidates && hhmm >= FADE_LAST_CANDLE_HHMM + 7;
      if (sessionOver) {
        if (state.positions.length === 0) state.completeReason = `🏁 Session over (15:05). Strategy completed for today.`;
      } else if (fadeOver) {
        if (state.positions.length === 0 && !state.completeReason) state.completeReason = `🏁 The fade window (09:20–09:45 closes) is over for today. Strategy completed.`;
      } else if (state.baselines) {
        // FADE reads the 09:15 candle's history at once, so give Kite a moment to finalise it.
        const firstCandleReady = !fade || getIstHhmm(now) > FIRST_CANDLE_CLOSE_HHMM || now.getTime() % 60_000 >= FADE_SETTLE_MS;
        if (!state.candidates && hhmm >= FIRST_CANDLE_CLOSE_HHMM && firstCandleReady && now.getTime() - state.candidatesTriedAt >= 5000) {
          state.candidatesTriedAt = now.getTime();
          await this.buildCandidates(state, client, now);
        }
        if (state.candidates) {
          if (fade) {
            await this.checkFadeSignals(state, client, new Date());
            if (state.config.allowLongs) await this.checkFadeLongBreaks(state, client, new Date());
          } else await this.checkEntries(state, client, now);
        }
      }
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
      // FADE shorts enter only on 5m closes (tick loop); armed FADE longs and the stop/target/breakeven react to every tick.
      if (state.candidates && getIstHhmm(now) < SQUARE_OFF_HHMM) {
        if (state.config.setup !== 'FADE') await this.checkEntries(state, state.client, now);
        else if (state.config.allowLongs) await this.checkFadeLongBreaks(state, state.client, now);
      }
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
      this.baselinePromise = this.fetchBaselines(client, day, { log: (m) => this.log(state, m), alive: () => this.running.has(state.strategyId) })
        .finally(() => { this.baselinePromise = null; });
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

  /**
   * Pre-market warm-up, called by the market scheduler from 08:30. The ~600 history calls take 3+ minutes at
   * Kite's shared 3/s rate, and half of the FADE backtest's trades come from the 09:20 close, so the baselines
   * must be ready before the 09:15 auto-start. Needs today's Kite session: without one it returns false and the
   * scheduler retries. A load with many failed stocks is not kept (also retried).
   */
  async prewarmBaselines(brokerAccount: any): Promise<boolean> {
    const day = getIstDateStr(new Date());
    if (this.sharedBaselines?.day === day) return true;
    if (this.baselinePromise || !brokerAccount?.accessToken) return false;
    const client = this.factory.createClient(brokerAccount);
    const kite = client['kite'] || client;
    try {
      await (kite.getProfile ? kite.getProfile() : client.getMargins());
    } catch {
      return false; // no valid session yet (not logged in today)
    }
    const stats = { failed: 0, total: 0 };
    const p = this.fetchBaselines(client, day, { log: (m) => this.logger.log(`[Baseline prewarm] ${m}`), alive: () => true, stats })
      .finally(() => { this.baselinePromise = null; });
    this.baselinePromise = p;
    const data = await p;
    if (data.size === 0 || stats.failed > stats.total * 0.1) {
      this.logger.warn(`[Baseline prewarm] Incomplete (${data.size} loaded, ${stats.failed}/${stats.total} failed) — will retry.`);
      return false;
    }
    this.sharedBaselines = { day, data };
    this.logger.log(`[Baseline prewarm] Volume baselines ready for ${data.size} stocks before the open.`);
    return true;
  }

  private async fetchBaselines(
    client: any,
    day: string,
    ctx: { log: (msg: string) => void; alive: () => boolean; stats?: { failed: number; total: number } },
  ): Promise<Map<string, Baseline>> {
    const file = this.baselineFile(day);
    try {
      const cached = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Baseline>;
      const map = new Map(Object.entries(cached));
      if (map.size > 0) {
        ctx.log(`📦 Loaded today's volume baselines from cache (${map.size} stocks).`);
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
    ctx.log(`⏳ Loading volume baselines for ${symbols.length} stocks (NIFTY 500 + F&O, ~${Math.ceil(symbols.length / 3 / 60)} min at Kite's history rate)...`);

    const to = new Date();
    const from = new Date(`${day}T09:15:00.000+05:30`);
    from.setDate(from.getDate() - 24);
    const out = new Map<string, Baseline>();
    let failed = 0;
    for (let i = 0; i < symbols.length; i += 3) {
      if (!ctx.alive()) break;
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
    if (failed > 0) ctx.log(`⚠ History unavailable for ${failed} stock(s); they are skipped today.`);
    if (ctx.stats) { ctx.stats.failed = failed; ctx.stats.total = symbols.length; }
    // A load with many failures (expired session, rate limits) is not cached, so the next load starts clean.
    if (out.size > 0 && failed <= symbols.length * 0.1) {
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
    const fade = cfg.setup === 'FADE';
    // FADE keeps the shortlist's history (previous sessions included) as the indicators' warm-up.
    const histories = new Map<string, { candles: FadeCandle[]; at: number }>();
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
      if (fade) from.setDate(from.getDate() - FADE_HISTORY_DAYS);
      for (let i = 0; i < shortlist.length; i += 3) {
        await Promise.all(shortlist.slice(i, i + 3).map(async (sym) => {
          try {
            const raw: any[] = await client.getHistoricalData(sym, 'NSE', '5minute', from, new Date());
            const k = (raw || []).find((r: any) => getIstHhmm(new Date(r.date)) === 9 * 60 + 15 && getIstDateStr(new Date(r.date)) === getIstDateStr(now));
            if (k) firsts.set(sym, { o: Number(k.open), h: Number(k.high), l: Number(k.low), c: Number(k.close), v: Number(k.volume) || 0 });
            if (fade) histories.set(sym, { candles: toCompletedCandles(raw, Date.now()), at: Date.now() });
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
      if (fade) {
        // Gap up -> short, gap down -> long (fadeLongs only); any first-candle colour.
        const side: Side | null = f.o > b.prevClose ? 'SHORT' : f.o < b.prevClose && cfg.allowLongs ? 'LONG' : null;
        if (!side || state.tradedSymbols.has(sym)) continue;
        list.push({ symbol: sym, side, level: side === 'SHORT' ? f.c : f.h, stopDist: 0, rvol, tick: b.tick || 0.05, first: f, ltp: null, ltpAt: 0, done: false, candles: histories.get(sym)?.candles ?? null, candlesAt: histories.get(sym)?.at ?? 0, checkedThrough: 0, armedUntil: 0 });
        continue;
      }
      const side: Side | null = f.c < f.o ? 'SHORT' : f.c > f.o ? 'LONG' : null;
      if (!side || (side === 'SHORT' && !cfg.allowShorts) || (side === 'LONG' && !cfg.allowLongs)) continue;
      if (state.tradedSymbols.has(sym)) continue;
      const cir = circuits.get(sym);
      if (cir && ((side === 'SHORT' && cir.lower > 0 && (f.c - cir.lower) / f.c < 0.01) || (side === 'LONG' && cir.upper > 0 && (cir.upper - f.c) / f.c < 0.01))) continue;
      const tick = b.tick || 0.05;
      list.push({ symbol: sym, side, level: side === 'SHORT' ? f.l : f.h, stopDist: Math.max(tick * 4, cfg.stopAtrFraction * b.atr), rvol, tick, first: f, ltp: null, ltpAt: 0, done: false, candles: null, candlesAt: 0, checkedThrough: 0, armedUntil: 0 });
    }
    list.sort((a, b) => b.rvol - a.rvol);
    state.candidates = list.slice(0, fade ? FADE_MAX_CANDIDATES : MAX_CANDIDATES);
    if (fade && state.candidates.length > 0) state.candidates = await this.dropNearCircuit(state, kite, state.candidates);

    if (state.candidates.length === 0) {
      this.log(state, fade
        ? `📭 No fade candidate today (no stock opened ${cfg.allowLongs ? 'above or below' : 'above'} yesterday's close with a first candle >= ${cfg.minRvol}x its usual volume in the ${eligible.length} liquid stocks).`
        : `📭 No stock in play today (no first candle >= ${cfg.minRvol}x its usual volume in the ${eligible.length} liquid stocks${cfg.allowLongs ? '' : ' with a red candle'}).`);
      if (state.positions.length === 0) state.completeReason = `🏁 Nothing to trade today. Strategy completed.`;
      return;
    }
    for (const c of state.candidates) {
      if (fade) {
        const b = base.get(c.symbol)!;
        const gapPct = Math.abs((c.first.o / b.prevClose - 1) * 100).toFixed(1);
        this.log(state, c.side === 'SHORT'
          ? `🎯 In play: ${c.symbol} — opened ₹${c.first.o} (${gapPct}% above yesterday's ₹${b.prevClose}), first candle H ₹${c.first.h} L ₹${c.first.l} C ₹${c.first.c}, volume ${c.rvol.toFixed(1)}x usual | Watching for an overbought rollover until the 09:45 close`
          : `🎯 In play (long side): ${c.symbol} — opened ₹${c.first.o} (${gapPct}% below yesterday's ₹${b.prevClose}), first candle H ₹${c.first.h} L ₹${c.first.l} C ₹${c.first.c}, volume ${c.rvol.toFixed(1)}x usual | Watching for an oversold turn-up until the 09:45 close, then a break above ₹${c.first.h}`);
      } else {
        this.log(state, `🎯 In play: ${c.symbol} — first candle O ₹${c.first.o} H ₹${c.first.h} L ₹${c.first.l} C ₹${c.first.c}, volume ${c.rvol.toFixed(1)}x usual | ${c.side === 'SHORT' ? `Short below ₹${c.level.toFixed(2)}` : `Buy above ₹${c.level.toFixed(2)}`}, stop ₹${c.stopDist.toFixed(2)} from the fill`);
      }
      logSignal('SETUP', state.strategyId, { engine: 'STOCKS_IN_PLAY', setup: cfg.setup, symbol: c.symbol, side: c.side, level: c.level, stopDist: c.stopDist, rvol: c.rvol, first: c.first, isPaper: state.isPaperTrade });
      try { await this.tickerService.subscribeSymbol(state.brokerAccountId, c.symbol); state.subscribed.add(c.symbol); } catch { /* REST prices cover it */ }
    }
  }

  /** FADE: drops shorts within FADE_MIN_CIRCUIT_ROOM of the upper circuit and longs that close to the lower one (no exit there). */
  private async dropNearCircuit(state: EngineState, kite: any, list: Candidate[]): Promise<Candidate[]> {
    let q: Record<string, any>;
    try {
      q = await kite.getQuote(list.map((c) => `NSE:${c.symbol}`));
    } catch (e: any) {
      this.log(state, `⚠ Could not read circuit limits (${e?.message || e}) — keeping all ${list.length} candidates.`);
      return list;
    }
    return list.filter((c) => {
      const x = q[`NSE:${c.symbol}`];
      const upper = Number(x?.upper_circuit_limit) || 0, lower = Number(x?.lower_circuit_limit) || 0, last = Number(x?.last_price) || 0;
      if (last > 0) { c.ltp = last; c.ltpAt = Date.now(); }
      if (c.side === 'SHORT' && upper > 0 && last > 0 && (upper - last) / last < FADE_MIN_CIRCUIT_ROOM) {
        this.log(state, `⏭ ${c.symbol} skipped: ₹${last} is within ${(FADE_MIN_CIRCUIT_ROOM * 100).toFixed(1)}% of its upper circuit ₹${upper} (a short there may not be coverable).`);
        return false;
      }
      if (c.side === 'LONG' && lower > 0 && last > 0 && (last - lower) / last < FADE_MIN_CIRCUIT_ROOM) {
        this.log(state, `⏭ ${c.symbol} skipped: ₹${last} is within ${(FADE_MIN_CIRCUIT_ROOM * 100).toFixed(1)}% of its lower circuit ₹${lower} (a long there may not be sellable).`);
        return false;
      }
      return true;
    });
  }

  // ── FADE signals (5m closes 09:20..09:45) ──────────────────────────────────

  private async checkFadeSignals(state: EngineState, client: any, now: Date) {
    if (state.stopping || !state.candidates) return;
    const cfg = state.config;
    const nowMs = now.getTime();
    const dayOpenMs = new Date(`${getIstDateStr(now)}T09:15:00.000+05:30`).getTime();
    const lastStart = dayOpenMs + (FADE_LAST_CANDLE_HHMM - FADE_FIRST_CANDLE_HHMM) * 60_000;
    // A side that used up its trades stops watching; armed longs wait for their break in checkFadeLongBreaks.
    for (const c of state.candidates) if (!c.done && state.sideTrades[c.side] >= cfg.perSideTrades) c.done = true;
    const live = state.candidates.filter((c) => !c.done && !c.armedUntil);
    const armed = state.candidates.some((c) => !c.done && c.armedUntil > 0);

    if (state.tradesToday >= cfg.maxPositions || nowMs > lastStart + FIVE_MIN_MS + FADE_CANDLE_WAIT_MS) {
      for (const c of live) c.done = true;
      if (state.positions.length === 0 && !state.completeReason && !armed) {
        state.completeReason = state.tradesToday >= cfg.maxPositions
          ? `⛔ Max ${cfg.maxPositions} trade(s) done for today. Strategy completed.`
          : `🏁 No ${cfg.allowLongs ? 'fade setup' : 'overbought rollover'} in the candidates by the 09:45 close — no ${state.tradesToday > 0 ? 'more fade trades' : 'fade trade'} today. Strategy completed.`;
      }
      return;
    }
    if (live.length === 0) {
      if (state.positions.length === 0 && !state.completeReason && !armed) state.completeReason = `🏁 Every fade candidate has been traded or dropped. Strategy completed.`;
      return;
    }

    // Start of the latest candle that closed at least FADE_SETTLE_MS ago, capped at the 09:40 candle.
    const closedStart = Math.floor((nowMs - FADE_SETTLE_MS) / FIVE_MIN_MS) * FIVE_MIN_MS - FIVE_MIN_MS;
    if (closedStart < dayOpenMs) return;
    const target = Math.min(closedStart, lastStart);
    const closeMs = target + FIVE_MIN_MS;
    const pending = live.filter((c) => c.checkedThrough < target);
    if (pending.length === 0) return;
    const hhmmOf = (ms: number) => { const m = getIstHhmm(new Date(ms)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
    if (nowMs - closeMs > FADE_MAX_ENTRY_DELAY_MS) {
      for (const c of pending) c.checkedThrough = target;
      this.log(state, `⏭ The ${hhmmOf(closeMs)} candle closed over ${FADE_MAX_ENTRY_DELAY_MS / 60_000} min ago — too late to act on it; waiting for the next close.`);
      return;
    }

    const signals: { c: Candidate; trigger: FadeTrigger; idx: number }[] = [];
    for (let i = 0; i < pending.length; i += 3) {
      await Promise.all(pending.slice(i, i + 3).map(async (c) => {
        // The 09:20 scan already read this candle after it settled: no second history call (saves seconds at 09:20).
        const haveFresh = !!c.candles && c.candlesAt >= closeMs + FADE_SETTLE_MS && c.candles.some((k) => k.t === target);
        if (!haveFresh) {
          const from = new Date(dayOpenMs);
          if (!c.candles) from.setDate(from.getDate() - FADE_HISTORY_DAYS);
          let fresh: FadeCandle[];
          try {
            fresh = toCompletedCandles(await client.getHistoricalData(c.symbol, 'NSE', '5minute', from, new Date()), Date.now());
          } catch (e: any) {
            this.logger.warn(`[${state.strategyId}] ${c.symbol} 5m history failed: ${e?.message || e}`);
            return; // retried on the next tick while the candle is still fresh
          }
          c.candles = c.candles ? [...c.candles.filter((k) => k.t < dayOpenMs), ...fresh.filter((k) => k.t >= dayOpenMs)] : fresh;
          c.candlesAt = Date.now();
        }
        const idx = c.candles.findIndex((k) => k.t === target);
        if (idx < 0) {
          if (nowMs - closeMs >= FADE_CANDLE_WAIT_MS) {
            c.checkedThrough = target;
            this.log(state, `⚠ ${c.symbol}: Kite has no ${hhmmOf(closeMs)} candle yet — skipped for that close.`);
          }
          return;
        }
        c.checkedThrough = target;
        if (idx < FADE_MIN_HISTORY) {
          c.done = true;
          this.log(state, `⚠ ${c.symbol}: only ${idx} earlier 5m candles available (needs ${FADE_MIN_HISTORY}) — dropped.`);
          return;
        }
        const trigger = c.side === 'SHORT' ? fadeShortTrigger(c.candles, idx) : fadeLongTrigger(c.candles, idx);
        if (trigger) signals.push({ c, trigger, idx });
      }));
    }
    if (signals.length === 0) return;

    // Several on the same close: the highest opening volume first (as in the backtest).
    signals.sort((a, b) => b.c.rvol - a.c.rvol);
    for (const s of signals) {
      const r = fadeReadings(s.c.candles!, s.idx)!;
      const k = s.c.candles![s.idx];
      const why: Record<FadeTrigger, string> = s.c.side === 'SHORT' ? {
        MFI: `MFI fell back to ${r.mfi.toFixed(1)} from above 80`,
        STOCH: `Stochastic %K ${r.stochK.toFixed(1)} crossed under %D ${r.stochD.toFixed(1)} from above 80`,
        BB: `closed ₹${k.c} back under the upper Bollinger band ₹${r.bbUpper.toFixed(2)}`,
        CMF: `CMF fell to ${r.cmf.toFixed(3)} (below -0.1)`,
      } : {
        MFI: `MFI rose back to ${r.mfi.toFixed(1)} from below 20`,
        STOCH: `Stochastic %K ${r.stochK.toFixed(1)} crossed over %D ${r.stochD.toFixed(1)} from below 20`,
        BB: `closed ₹${k.c} back over the lower Bollinger band ₹${r.bbLower.toFixed(2)}`,
        CMF: `CMF rose to ${r.cmf.toFixed(3)} (above +0.1)`,
      };
      this.log(state, s.c.side === 'SHORT'
        ? `📉 [FADE SIGNAL] ${s.c.symbol} ${hhmmOf(closeMs)} close ₹${k.c} — ${why[s.trigger]} | volume ${s.c.rvol.toFixed(1)}x`
        : `📈 [FADE LONG SETUP] ${s.c.symbol} ${hhmmOf(closeMs)} close ₹${k.c} — ${why[s.trigger]} | volume ${s.c.rvol.toFixed(1)}x | buy only above the first-candle high ₹${s.c.level} until ${hhmmOf(closeMs + FADE_LONG_BREAK_WINDOW_MS)}`);
      logSignal('SETUP', state.strategyId, { engine: 'STOCKS_IN_PLAY', setup: 'FADE', event: 'SIGNAL', symbol: s.c.symbol, side: s.c.side, trigger: s.trigger, candle: k, readings: r, rvol: s.c.rvol, isPaper: state.isPaperTrade });
    }
    for (const s of signals) {
      if (s.c.side === 'LONG') {
        s.c.armedUntil = closeMs + FADE_LONG_BREAK_WINDOW_MS;
        continue;
      }
      s.c.done = true;
      if (state.tradesToday >= cfg.maxPositions || state.sideTrades.SHORT >= cfg.perSideTrades || state.stopping) continue;
      if (Date.now() - closeMs > FADE_MAX_ENTRY_DELAY_MS) {
        this.log(state, `⏭ ${s.c.symbol} fade signal is over ${FADE_MAX_ENTRY_DELAY_MS / 60_000} min old — not entering late.`);
        continue;
      }
      await this.refreshCandidateLtp(state, client, s.c);
      await this.enterTrade(state, client, s.c, new Date());
    }
    if (signals.some((s) => s.c.side === 'LONG')) {
      for (const s of signals) if (s.c.side === 'LONG') await this.refreshCandidateLtp(state, client, s.c);
      await this.checkFadeLongBreaks(state, client, new Date());
    }
  }

  /** FADE long: buys an armed candidate once price trades above its first-candle high, until the window ends. */
  private async checkFadeLongBreaks(state: EngineState, client: any, now: Date) {
    if (state.stopping || !state.candidates) return;
    const cfg = state.config;
    for (const c of state.candidates) {
      if (c.done || !c.armedUntil) continue;
      if (state.tradesToday >= cfg.maxPositions || state.sideTrades.LONG >= cfg.perSideTrades) { c.done = true; continue; }
      if (now.getTime() > c.armedUntil) {
        c.done = true;
        this.log(state, `⏭ ${c.symbol} did not break its first-candle high ₹${c.level} within ${FADE_LONG_BREAK_WINDOW_MS / 60_000} min of the turn-up — no long.`);
        continue;
      }
      if (c.ltp === null || now.getTime() - c.ltpAt > 10_000 || c.ltp < c.level) continue;
      await this.enterTrade(state, client, c, now);
    }
    if (state.positions.length === 0 && !state.completeReason && state.candidates.every((c) => c.done) && getIstHhmm(now) >= FADE_LAST_CANDLE_HHMM + 5) {
      state.completeReason = `🏁 Every fade candidate has been traded or dropped. Strategy completed.`;
    }
  }

  /** Fresh price right before a FADE entry (ticks if under 3s old, else REST). */
  private async refreshCandidateLtp(state: EngineState, client: any, c: Candidate) {
    if (c.ltp !== null && Date.now() - c.ltpAt < 3000) return;
    try {
      const ltps: Record<string, number> = await client.getLTP([`NSE:${c.symbol}`]);
      const px = ltps[`NSE:${c.symbol}`];
      if (px && px > 0) { c.ltp = px; c.ltpAt = Date.now(); }
    } catch (e: any) {
      this.logger.warn(`[${state.strategyId}] LTP for ${c.symbol} failed: ${e?.message || e}`);
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
    const fade = cfg.setup === 'FADE';
    c.done = true;
    if (c.ltp === null || !(c.ltp > 0)) {
      this.log(state, `⏭ ${c.symbol}: no current price available — not entering blind.`);
      return;
    }
    const ltp = c.ltp;
    const sign = c.side === 'LONG' ? 1 : -1;
    // ORB: a fixed ₹ distance from the ATR. FADE: a fixed % of the price (re-based on the real fill below).
    const stopDist = fade ? (ltp * cfg.stopPct) / 100 : c.stopDist;

    // ORB and the FADE long enter on a level break and must not chase it; the FADE short enters at market on the candle close by design.
    const chase = (ltp - c.level) * sign;
    if ((!fade || c.side === 'LONG') && chase > MAX_CHASE_OF_STOP * stopDist) {
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
    const qtyByRisk = Math.floor(cfg.stopLossRs / stopDist);
    const qty = Math.min(qtyByCapital, qtyByRisk);
    if (qty < 1) {
      this.log(state, `⏭ ${c.symbol} skipped: 1 share needs ₹${(ltp / cfg.leverage).toFixed(0)} margin or risks ₹${stopDist.toFixed(2)} (capital per slot ₹${slotCapital.toFixed(0)}, max loss ₹${cfg.stopLossRs}).`);
      return;
    }
    this.log(state, fade
      ? c.side === 'SHORT'
        ? `🚀 ${c.symbol} fade signal at ₹${ltp.toFixed(2)} — shorting ${qty} (risk allows ${qtyByRisk}, capital allows ${qtyByCapital}).`
        : `🚀 ${c.symbol} broke its first-candle high ₹${c.level} at ₹${ltp.toFixed(2)} after the oversold turn-up — buying ${qty} (risk allows ${qtyByRisk}, capital allows ${qtyByCapital}).`
      : `🚀 ${c.symbol} broke ₹${c.level.toFixed(2)} at ₹${ltp.toFixed(2)} — ${c.side === 'SHORT' ? 'shorting' : 'buying'} ${qty} (risk allows ${qtyByRisk}, capital allows ${qtyByCapital}).`);

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

    const fillStopDist = fade ? (fill.price * cfg.stopPct) / 100 : c.stopDist;
    const sl = roundTo(fill.price - sign * fillStopDist, c.tick, c.side === 'LONG' ? 'down' : 'up');
    // Target rounded toward the entry, so it is never further than targetR x the stop.
    const target = fade && cfg.targetR > 0 ? roundTo(fill.price + sign * cfg.targetR * fillStopDist, c.tick, c.side === 'LONG' ? 'down' : 'up') : null;
    state.tradesToday++;
    state.sideTrades[c.side]++;
    const p: OpenPosition = {
      symbol: c.symbol, side: c.side, entryPrice: fill.price, qty: fill.qty, sl, target, stopDist: fillStopDist, beDone: this.lockSteps(cfg).length === 0, lastBeAttempt: 0, lockedR: null, bestR: 0, tick: c.tick, rvol: c.rvol,
      slOrderId: null, openedAt: now.getTime(), ltp: ltp, ltpAt: Date.now(), slBreachAt: null, retryExit: null, lastExitAttempt: 0, lastOrdersCheck: 0, lastBrokerPosCheck: 0,
    };
    state.positions.push(p);
    const exitPlan = fade
      ? `Target ₹${target !== null ? target.toFixed(2) : '—'}${this.lockSteps(cfg).map(([at, lk]) => ` | at ₹${(fill.price + sign * at * fillStopDist).toFixed(2)} SL → ${lk === 0 ? 'entry' : `+${lk}R ₹${(fill.price + sign * lk * fillStopDist).toFixed(2)}`}`).join('')} | else 15:05`
      : 'Exit at the SL or 15:05';
    this.log(state, `📋 Placed Trade: NSE:${c.symbol} — ${c.side} Entry: ₹${fill.price.toFixed(2)} | Qty: ${fill.qty} | SL: ₹${sl.toFixed(2)} (risk ₹${(Math.abs(fill.price - sl) * fill.qty).toFixed(2)}) | ${exitPlan} | Trade ${state.tradesToday}/${cfg.maxPositions} | Order ${fill.orderId}`);
    logSignal('ENTRY', state.strategyId, { engine: 'STOCKS_IN_PLAY', setup: cfg.setup, symbol: c.symbol, side: c.side, level: c.level, entry: fill.price, sl, target, qty: fill.qty, rvol: c.rvol, isPaper: state.isPaperTrade });

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

    // FADE target: watched here (not a resting order, so a filled target can never race the broker SL).
    if (p.target !== null && (p.side === 'LONG' ? price >= p.target : price <= p.target)) {
      this.log(state, `🎯 Target hit: ${p.symbol} ₹${price.toFixed(2)} vs target ₹${p.target.toFixed(2)} — exiting at market.`);
      await this.exitPosition(state, client, p, 'TARGET', price);
      return;
    }
    // Stop ladder (FADE): breakeven, then profit locks, from the best price seen so far.
    if (p.stopDist > 0) p.bestR = Math.max(p.bestR, ((price - p.entryPrice) * (p.side === 'LONG' ? 1 : -1)) / p.stopDist);
    if (!p.beDone && now.getTime() - p.lastBeAttempt >= BREAKEVEN_RETRY_MS) {
      const due = this.lockSteps(state.config).filter(([at, lk]) => p.bestR >= at && lk > (p.lockedR ?? -1) + 1e-9);
      if (due.length > 0) {
        const step = due[due.length - 1];
        const lockPx = this.lockPrice(p, step[1]);
        if (p.side === 'LONG' ? price <= lockPx : price >= lockPx) {
          // Already reversed through the level to lock (a fast spike between checks): take it now at market.
          this.log(state, `🔒 ${p.symbol} reached +${step[0]}R but is back at ₹${price.toFixed(2)}, through the +${step[1]}R lock ₹${lockPx.toFixed(2)} — exiting at market.`);
          await this.exitPosition(state, client, p, 'SL', price);
          return;
        }
        await this.moveStopToLock(state, client, p, step, now);
      }
    }

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

  /** FADE stop ladder as [profit reached in R, profit locked in R]: breakeven, then the profit-lock steps. */
  private lockSteps(cfg: ResolvedConfig): [number, number][] {
    if (cfg.setup !== 'FADE') return [];
    const steps: [number, number][] = [];
    if (cfg.breakevenAtR > 0) steps.push([cfg.breakevenAtR, 0]);
    if (cfg.profitLock) steps.push(...FADE_PROFIT_LOCK_STEPS);
    return steps.sort((a, b) => a[0] - b[0]);
  }

  /** Stop price that locks `lockR` x the stop distance of profit (0 = the entry), rounded toward the entry. */
  private lockPrice(p: OpenPosition, lockR: number): number {
    return p.side === 'LONG'
      ? roundTo(p.entryPrice + lockR * p.stopDist, p.tick, 'down')
      : roundTo(p.entryPrice - lockR * p.stopDist, p.tick, 'up');
  }

  /** The R currently locked by a stop price (null = still behind the entry, i.e. the original stop). */
  private lockedROf(p: OpenPosition, sl: number): number | null {
    const locked = ((p.side === 'LONG' ? sl - p.entryPrice : p.entryPrice - sl) / p.stopDist);
    return locked >= -1e-6 ? Math.max(0, locked) : null;
  }

  /**
   * Moves the stop (and the broker SL order) to lock `step[1]` R once the trade reached `step[0]` R.
   * On failure the previous stop stays on the exchange and it is retried after BREAKEVEN_RETRY_MS.
   */
  private async moveStopToLock(state: EngineState, client: any, p: OpenPosition, step: [number, number], now: Date) {
    p.lastBeAttempt = now.getTime();
    const [atR, lockR] = step;
    const allDone = (r: number) => this.lockSteps(state.config).every(([, lk]) => lk <= r + 1e-9);
    const newSl = this.lockPrice(p, lockR);
    if (p.side === 'LONG' ? newSl <= p.sl : newSl >= p.sl) {
      p.lockedR = Math.max(p.lockedR ?? 0, lockR);
      p.beDone = allDone(p.lockedR);
      return;
    }
    const tag = lockR === 0 ? '🔒 [BREAKEVEN]' : '🔒 [PROFIT LOCK]';
    const what = lockR === 0
      ? `stop moved to the entry ₹${newSl.toFixed(2)}`
      : `stop moved to ₹${newSl.toFixed(2)}, locking +${lockR}R (≈ ₹${(Math.abs(p.entryPrice - newSl) * p.qty).toFixed(0)})`;
    const reached = `+${atR}R (₹${(atR * p.stopDist * p.qty).toFixed(0)})`;

    if (state.isPaperTrade) {
      p.sl = newSl;
      p.lockedR = lockR;
      p.beDone = allDone(lockR);
      if (p.slOrderId) {
        this.prisma.order.updateMany({ where: { brokerOrderId: p.slOrderId, isPaperTrade: true, status: 'OPEN' }, data: { triggerPrice: newSl, price: newSl } }).catch(() => undefined);
      }
      this.log(state, `${tag} ${p.symbol} reached ${reached} — ${what}.`);
      return;
    }
    if (!p.slOrderId || !client?.modifyOrder) {
      this.log(state, `⚠ ${tag} ${p.symbol}: no broker SL order to move right now — keeping ₹${p.sl.toFixed(2)}, retrying shortly.`);
      return;
    }
    const limit = this.slLimit(p, newSl);
    try {
      await client.modifyOrder(p.slOrderId, { triggerPrice: newSl, price: limit });
      p.sl = newSl;
      p.lockedR = lockR;
      p.beDone = allDone(lockR);
      this.log(state, `${tag} ${p.symbol} reached ${reached} — broker SL ${p.slOrderId} ${what.replace('stop moved', 'moved')} (limit ₹${limit.toFixed(2)}).`);
    } catch (e: any) {
      this.log(state, `⚠ ${tag} Could not move the broker SL for ${p.symbol} (${e?.message || e}). It stays at ₹${p.sl.toFixed(2)}; retrying in ${BREAKEVEN_RETRY_MS / 1000}s.`);
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
      SL: 'Stop Loss Hit', TARGET: 'Target hit', SQUARE_OFF: '15:05 square-off', MANUAL: 'Manual square-off', BROKER_SL: 'Broker SL filled',
      BROKER_SYNC: 'Closed outside the engine', NO_PROTECTION: 'Exited (no broker SL)',
    };
    this.log(state, `🏁 ${label[reason]} — ${p.symbol} exit at ₹${exitPrice.toFixed(2)} (${p.side} entry ₹${p.entryPrice.toFixed(2)}) | Realized P&L: ₹${pnl.toFixed(2)} | Today: ₹${state.realizedTodayRs.toFixed(2)} (${state.winsToday}W/${state.lossesToday}L, ${state.tradesToday}/${state.config.maxPositions} trades) [${orderId ?? 'n/a'}]`);
    logSignal('EXIT', state.strategyId, { engine: 'STOCKS_IN_PLAY', setup: state.config.setup, symbol: p.symbol, side: p.side, reason, entry: p.entryPrice, exit: exitPrice, qty: p.qty, pnl, rvol: p.rvol, heldMs: Date.now() - p.openedAt, isPaper: state.isPaperTrade });

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
