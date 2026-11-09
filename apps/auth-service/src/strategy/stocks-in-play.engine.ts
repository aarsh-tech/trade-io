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
import { getCompletedBrokerExitDetails, getLiveBrokerPosition, isSafeToExit, normalizeSymbol } from './broker-position-guard';
import { StocksInPlayConfig } from './dto/strategy.dto';
import { getIstDateStr, getIstHhmm } from './emavwap-signals';
import { FADE_MIN_HISTORY, FadeCandle, fadeLongTrigger, fadeReadings, fadeShortTrigger, FadeTrigger, toCompletedCandles } from './inplay-fade-signals';
import { buildSrZones, describeZonesAhead, prevDayHighLow, zonesAhead } from './inplay-sr-zones';
import { crossedBack, crossSide, TREND_SLOW, trendReadings, vwapAgrees } from './inplay-trend-signals';
import { loadOiPicks, OiPick } from './oi-buildup-signals';
import { countTodaysTradesForEntry, findOpenPosition, istDayStart, PositionUnknownError, protectionNotice, recoverTodaysTrades, strategyOrderWhere } from './position-recovery';
import { logSignal } from './signal-logger';
import { registerSymbolHolder, symbolHeldByOther, unregisterSymbolHolder } from './symbol-claims';

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
 *   market exit), stop moved to the entry (+breakevenLockR) once the trade is breakevenAtR x the stop in profit, then (profitLock)
 *   to +0.5R at +1.5R and +1.5R at +2.5R; else 15:05.
 * - Backtest (2024-09 .. 2026-09, 1m bars, Zerodha costs + slippage, 1 trade/day, ₹500 risk, 1.2% / 3R / BE at 1R,
 *   avg value >= ₹10 Cr, price >= ₹50): +₹70.4k, year 1 +₹30.1k, year 2 +₹40.4k, 39% wins, avg loss ₹341,
 *   max drawdown ₹4.9k, 20/25 green months. Entering 1 minute late cut it to +₹46k, so entries must be prompt.
 * - fadeLongs adds the mirror on gap-down stocks: an oversold turn-up on the same closes ARMS a long, bought only when
 *   price then trades above the first 5m candle's high within 30 minutes (same % stop, target and stop ladder).
 *   maxPositions is the day's cap over BOTH sides: the first entry of the day takes it; a short signal is entered
 *   before the long breaks are checked, so in the same minute the short wins. Backtest (scratchpad onebook.js,
 *   3 Nov 2026, 1.2% / 3R / +0.2R at +1R, ₹500 risk, ₹1L notional): 1 a day over both sides +₹77.8k (year 1 +₹30.9k,
 *   year 2 +₹46.9k), 64% wins, max drawdown ₹4.2k, worst month -₹1.3k, vs short only +₹69.6k (DD ₹4.8k, worst month
 *   -₹2.5k) and 1 short + 1 long a day +₹77.6k (DD ₹6.5k, worst month -₹3.0k, twice the daily risk). Picking the
 *   highest-volume signal instead of the first did worse (+₹52.8k, even with hindsight). Engine replay Jun-Sep 2026
 *   (scratchpad fade-replay-onebook.ts): never more than 1 trade a day, same pick as the sim on 75 of 79 days.
 *   The long side alone +₹8.1k (year 1 +₹0.2k), weak. Buying the turn-up without the high break lost (-₹9.0k).
 * - breakevenLockR 0.2 (default): at +1R the stop goes to +0.2R, not the bare entry, so a trade that reached +1R and
 *   came back is a small win instead of a small loss after charges. Backtest both sides (scratchpad grid3.js,
 *   29 Oct 2026): 62% wins, +₹77.6k vs 49% wins, +₹76.7k with the stop at the entry; +0.1R..+0.3R all 62-64%.
 * - High win-rate exits (scratchpad grid2.js, 29 Oct 2026, both sides): stopPct 1.8, breakevenAtR 0.5,
 *   breakevenLockR 0.2, targetR 3 + profit lock -> 73% wins, +₹39.3k, max drawdown ₹2.9k, worst month -₹1.7k,
 *   vs the default 1.2% / BE at 1R: 49% wins, +₹76.7k. The neighbours (1.8-2.1%, +0.4..0.5R, +0.1..0.2R) were all 71-76%.
 *
 * Setup TREND (15/40 EMA trend, config setup: 'TREND'), built on the user's request on 2 Nov 2026:
 * - Watchlist at 09:20: the watchCount (default 1) liquid stocks with the highest first 5m candle volume vs usual.
 * - Signal: each side's FIRST 15/40 EMA crossover of the day on the 5m closes 09:25..14:30 (EMAs of the 5m closes,
 *   continuing from the previous sessions). Taken only when the close is on the VWAP side of the trade and, with
 *   withGapOnly (default), in the direction of the gap: a gap-up stock is never shorted, a gap-down one never bought
 *   (inplay-trend-signals.ts). Market entry right after the close; 1 trade a day.
 * - Stop: the day low (long) / day high (short) through the signal candle, at least 0.3% away; exchange SL order.
 * - Exit: the first 5m close where the 15-EMA has crossed back over the 40-EMA (market), the stop, or 15:05.
 * - VWAP is the session VWAP of the 1m closes (one 1m history call when a crossover passes the gap rule), as in the
 *   backtest; the 5m-close VWAP differs a lot after a huge first candle.
 * - Backtest (26 Aug 2024 .. 2 Nov 2026, 1m bars, Zerodha costs + 0.03% slippage, ₹500 risk, watchlist ranked over
 *   every liquid stock as at 09:20; scratchpad x1540.js / an9.js): top 1 with the gap +₹5.0k (year 1 +₹1.2k, year 2
 *   +₹3.7k), only 94 trades, 47% wins. Top 1 either side +₹3.7k, top 3 with the gap +₹2.0k, top 5 -₹0.5k..-₹4.7k,
 *   top 10 -₹12k..-₹16k, flat-open stocks only worse. About breakeven, not a proven edge: every 15/40 crossover on
 *   every stock loses -₹55..-₹125 a trade, and only the top-RVOL watchlist keeps it near zero.
 */

type Side = 'LONG' | 'SHORT';
type ExitReason = 'SL' | 'TARGET' | 'TREND' | 'SQUARE_OFF' | 'MANUAL' | 'BROKER_SL' | 'BROKER_SYNC' | 'NO_PROTECTION';
type Setup = 'ORB' | 'FADE' | 'TREND' | 'OI';

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
/** TREND: crossovers on the candles starting 09:20..14:25 (closing 09:25..14:30). */
const TREND_FIRST_CANDLE_HHMM = 9 * 60 + 20;
const TREND_LAST_CANDLE_HHMM = 14 * 60 + 25;
/** TREND: the day-low/high stop is at least this % from the fill. */
const TREND_MIN_STOP_PCT = 0.3;
/** OI: pre-open order entry is 09:00-09:10 (since 7 Sep 2026: market orders only until 09:05, entry closes at a random moment
 *  09:08-09:10, matching 09:10-09:12; an unmatched limit carries into 09:15). The LIMIT goes in from 09:00, never after 09:07. */
const OI_ORDER_START_HHMM = 9 * 60;
const OI_ORDER_END_HHMM = 9 * 60 + 7;
const MARKET_OPEN_HHMM = 9 * 60 + 15;
/** OI: the pre-open SELL LIMIT sits this far under yesterday's close; the auction fills it at the opening price when the
 *  stock opens above it. Opening lower (a >5% gap down) means no fill and no trade (backtest Rs 41.0k vs 40.3k any gap). */
const OI_LIMIT_BELOW_CLOSE = 0.05;
/** OI: how often the pending pre-open order is read from Zerodha. */
const OI_ORDER_CHECK_MS = 5000;

/** OI short build-up: the day's pick list and the pre-open order. */
interface OiState {
  picks: OiPick[] | null;
  signalDay: string | null;
  triedAt: number;
  loggedWait: boolean;
  orderId: string | null;
  pick: OiPick | null;
  /** Stock of the order sent today (also known after a restart, when `pick` is not). */
  symbol: string | null;
  limit: number;
  qty: number;
  tick: number;
  lastCheck: number;
  /** Nothing more to do today (filled and handed to the position code, rejected, not filled, or no pick). */
  resolved: boolean;
  doneReason: string | null;
}

interface ResolvedConfig {
  setup: Setup;
  /** FADE: stop distance as % of the fill. */
  stopPct: number;
  /** FADE: target at this multiple of the stop distance (0 = no target). */
  targetR: number;
  /** FADE: move the stop to the entry once the trade is this multiple of the stop in profit (0 = off). */
  breakevenAtR: number;
  /** FADE: profit that first stop move locks, in R (0 = exactly the entry; default 0.2). Always below breakevenAtR. */
  breakevenLockR: number;
  /** FADE: skip a signal when yesterday's low (short) / high (long) lies less than this many R ahead of the price
   *  (0 = off, the default; the user switches it on). Asked for on 5 Nov 2026 after NYKAA bounced off yesterday's low at 1.8R. Backtest 2y,
   *  1 trade/day: 2R Rs77.1k vs Rs77.8k off (Recommended exits), Rs45.2k vs Rs48.1k (1.4%/2.5R/+0.5R) - about neutral. */
  skipNearPdlR: number;
  /** FADE: after breakeven, lock +0.5R at +1.5R and +1.5R at +2.5R (FADE_PROFIT_LOCK_STEPS). */
  profitLock: boolean;
  stopLossRs: number;
  /** Daily trade cap and position slots (FADE with longs and TREND: both sides together). */
  maxPositions: number;
  /** Trades per side per day (= maxPositions: either side may take the whole day's cap). */
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
  /** TREND: stocks watched from 09:20 (highest first-candle RVOL first). */
  watchCount: number;
  /** TREND: trade only with the gap (no short on a gap-up stock, no long on a gap-down one). */
  withGapOnly: boolean;
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
  /** TREND: the day low (long) / high (short) through the signal candle = the stop. 0 = no signal yet. */
  stopLevel: number;
  /** TREND: sides whose first crossover of the day has been seen (only that one may be traded). */
  crossSeen: Set<Side>;
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
  /** TREND: 5m candles (history + today) for the crossback exit, and the start of the last candle checked. */
  candles: FadeCandle[] | null;
  trendCheckedThrough: number;
  trendFetchAt: number;
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
  /** Stock whose entry order is in flight (seen by other engines through symbol-claims before the position exists). */
  enteringSymbol: string | null;
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
  /** OI setup only. */
  oi: OiState | null;
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
      enteringSymbol: null,
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
      oi: config.setup === 'OI'
        ? { picks: null, signalDay: null, triedAt: 0, loggedWait: false, orderId: null, pick: null, symbol: null, limit: 0, qty: 0, tick: 0.05, lastCheck: 0, resolved: false, doneReason: null }
        : null,
    };
    this.running.set(strategyId, state);
    if (!state.isPaperTrade) {
      registerSymbolHolder(strategyId, state.brokerAccountId, strategy.name || 'Stocks in Play', (sym) =>
        state.enteringSymbol === sym || state.positions.some((p) => normalizeSymbol(p.symbol) === sym));
    }

    const mode = state.isPaperTrade ? 'PAPER TRADING' : 'LIVE TRADING';
    const sides = [config.allowShorts ? 'shorts' : null, config.allowLongs ? 'longs' : null].filter(Boolean).join(' + ');
    if (resumedLogs.length > 0) {
      this.log(state, `🔁 Engine reconnected — resuming console from the interrupted session (${mode})`);
    } else if (config.setup === 'OI') {
      this.log(state, `▶ OI short build-up (pre-open) started | ${mode}`);
      this.log(state, `⚙ From NSE's end-of-day files: the stock that fell >= 3% yesterday while its futures open interest rose the most (5–80%, not an expiry day, >= ₹25 Cr traded) | SHORT in the 09:00–09:07 pre-open auction with a SELL LIMIT ${OI_LIMIT_BELOW_CLOSE * 100}% under yesterday's close (fills at the 09:15 opening price; no fill on a bigger gap down = no trade) | Stop ${config.stopPct}% | Target ${config.targetR > 0 ? `${config.targetR}R (${(config.stopPct * config.targetR).toFixed(2)}%)` : 'none'} | Broker SL from 09:15 | Max loss/trade ₹${config.stopLossRs} | 1 trade/day | Square-off 15:05`);
    } else if (config.setup === 'FADE') {
      this.log(state, `▶ In-play Fade (${config.allowLongs ? 'short + long' : 'short'}) started | ${mode}`);
      this.log(state, `⚙ At 09:20: stocks that opened ABOVE yesterday's close and whose first 5m candle traded >= ${config.minRvol}x their usual volume (NIFTY 500 + F&O, price >= ₹${config.minPrice}, avg daily value >= ₹${config.minAvgValueCr} Cr) | SHORT on the first 5m close from 09:20 to 09:45 where MFI, Stochastic, Bollinger or CMF turns down from overbought | Stop ${config.stopPct}% | Target ${config.targetR > 0 ? `${config.targetR}R (${(config.stopPct * config.targetR).toFixed(2)}%)` : 'none'} | Stop to ${config.breakevenLockR > 0 ? `entry +${config.breakevenLockR}R` : 'entry'} at ${config.breakevenAtR > 0 ? `+${config.breakevenAtR}R` : 'never'}${config.profitLock ? ' | Profit lock: +0.5R at +1.5R, +1.5R at +2.5R' : ''}${config.skipNearPdlR > 0 ? ` | Skip when yesterday's low is less than ${config.skipNearPdlR}R below the price` : ''} | Max loss/trade ₹${config.stopLossRs} | ${config.maxPositions} trade(s)/day, ${config.leverage}x | Square-off 15:05`);
      if (config.allowLongs) this.log(state, `⚙ Longs: stocks that opened BELOW yesterday's close with the same volume | on an oversold turn-up (MFI, Stochastic, Bollinger or CMF) from 09:20 to 09:45, BUY only when price breaks the first 5m candle's high within 30 min | same stop, target and stop ladder | ${config.maxPositions} trade(s) a day over both sides: the first entry, short or long, takes it`);
    } else if (config.setup === 'TREND') {
      this.log(state, `▶ 15/40 EMA trend (${sides}) started | ${mode}`);
      this.log(state, `⚙ At 09:20: watch the ${config.watchCount} stock(s) with the highest first 5m candle volume vs usual (NIFTY 500 + F&O, price >= ₹${config.minPrice}, avg daily value >= ₹${config.minAvgValueCr} Cr) | Each side's first 15/40 EMA crossover on the 5m closes 09:25–14:30: BUY when the 15-EMA crosses above the 40-EMA with the close above VWAP, SHORT when it crosses below with the close below VWAP${config.withGapOnly ? ' | Only with the gap: a gap-up stock is never shorted, a gap-down stock never bought' : ''} | Stop at the day low/high | Exit when the 15-EMA crosses back, else 15:05 | Max loss/trade ₹${config.stopLossRs} | ${config.maxPositions} trade(s)/day, ${config.leverage}x`);
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
    if (state.oi) await this.recoverOiOrder(state);

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
    const setup: Setup = raw.setup === 'FADE' ? 'FADE' : raw.setup === 'TREND' ? 'TREND' : raw.setup === 'OI' ? 'OI' : 'ORB';
    const fade = setup === 'FADE';
    const trend = setup === 'TREND';
    const oi = setup === 'OI';
    // The fade always shorts; its long mirror only with fadeLongs (and only on a break of the first-candle high).
    // TREND trades both sides unless one is switched off. OI is short only.
    const allowShorts = fade || oi ? true : raw.allowShorts !== false;
    const allowLongs = oi ? false : fade ? raw.fadeLongs === true : trend ? raw.allowLongs !== false : raw.allowLongs === true;
    if (!allowShorts && !allowLongs) throw new Error('Stocks-in-Play: enable shorts, longs or both.');
    // FADE with longs and TREND: maxPositions is the day's trade cap over both sides (each side may take all of it).
    // OI: always the top pick only (the backtest's 1 trade a day).
    const perSideTrades = oi ? 1 : Math.min(5, Math.floor(num(raw.maxPositions, fade || trend ? 1 : 2)));
    const breakevenAtR = Math.min(20, numOrZero(raw.breakevenAtR, 1));
    return {
      setup,
      stopPct: Math.min(5, Math.max(0.3, num(raw.stopPct, oi ? 1 : 1.2))),
      targetR: Math.min(20, numOrZero(raw.targetR, 3)),
      breakevenAtR,
      breakevenLockR: Math.min(numOrZero(raw.breakevenLockR, 0.2), breakevenAtR * 0.8),
      skipNearPdlR: Math.min(10, numOrZero(raw.skipNearPdlR, 0)),
      profitLock: raw.profitLock !== false,
      stopLossRs,
      maxPositions: perSideTrades,
      perSideTrades,
      minRvol: num(raw.minRvol, 10),
      stopAtrFraction: num(raw.stopAtrFraction, 0.2),
      minAvgValueCr: num(raw.minAvgValueCr, fade || trend ? 10 : 25),
      minPrice: num(raw.minPrice, 50),
      allowLongs,
      allowShorts,
      leverage: Math.min(5, num(raw.leverage, 4)),
      maxCapital: Number(raw.maxCapital) > 0 ? Number(raw.maxCapital) : null,
      entryCutoffTime: /^\d{1,2}:\d{2}$/.test(raw.entryCutoffTime || '') ? raw.entryCutoffTime : DEFAULT_ENTRY_CUTOFF,
      watchCount: Math.min(10, Math.floor(num(raw.watchCount, 1))),
      withGapOnly: raw.withGapOnly !== false,
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
      // FADE and OI: the target and breakeven come from the fixed % stop, so they are rebuilt from the fill alone.
      const fade = state.config.setup === 'FADE';
      const pctStop = fade || state.config.setup === 'OI';
      const stopDist = pctStop ? (pos.avgPrice * state.config.stopPct) / 100 : Math.abs(pos.avgPrice - sl);
      // `sign` points at the stop side, so the target is the other way.
      const target = pctStop && state.config.targetR > 0 ? roundTo(pos.avgPrice - sign * state.config.targetR * stopDist, tick, pos.side === 'LONG' ? 'down' : 'up') : null;
      const probe = { side: pos.side, entryPrice: pos.avgPrice, stopDist } as OpenPosition;
      const lockedR = fade ? this.lockedROf(probe, sl) : null;
      const beDone = this.lockSteps(state.config).every(([, lk]) => lockedR !== null && lk <= lockedR + 1e-6);
      state.positions.push({
        symbol: pos.symbol, side: pos.side, entryPrice: pos.avgPrice, qty: pos.qty, sl, target, stopDist, beDone, lastBeAttempt: 0, lockedR, bestR: lockedR ?? 0, tick, rvol: null,
        slOrderId: pos.slOrderId, openedAt: Date.now(), ltp: null, ltpAt: 0, slBreachAt: null, retryExit: null, lastExitAttempt: 0, lastOrdersCheck: 0, lastBrokerPosCheck: 0,
        candles: null, trendCheckedThrough: 0, trendFetchAt: 0,
      });
      state.tradedSymbols.add(pos.symbol);
      this.log(state, `🔄 [${pos.isPaper ? 'PAPER' : 'LIVE'} RECOVERY] Re-adopted ${pos.side} ${pos.symbol}: ${pos.qty} qty @ ₹${pos.avgPrice.toFixed(2)} | SL ₹${sl.toFixed(2)}${pos.slPrice ? '' : ' (no saved SL — set from the max loss)'}${target !== null ? ` | Target ₹${target.toFixed(2)}` : ''}${pos.slOrderId ? ` [Order ${pos.slOrderId}]` : ''}`);
      const notice = protectionNotice(pos);
      if (notice) this.log(state, notice);
      const p = state.positions[state.positions.length - 1];
      try { await this.tickerService.subscribeSymbol(state.brokerAccountId, p.symbol); } catch { /* REST prices cover it */ }
      // Before 09:15 (OI pre-open fill) the exchange takes no stop orders: the OI tick arms it at the open.
      if (!state.isPaperTrade && brokerAccount?.accessToken && !pos.slOrderId && getIstHhmm(new Date()) >= MARKET_OPEN_HHMM) await this.armStopLoss(state, p);
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
      // A position left unconfirmed keeps its stock off-limits to the other engines until the next start.
      if (state.positions.length === 0) unregisterSymbolHolder(strategyId);
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

      if (state.oi) {
        // OI needs no volume baselines: it trades yesterday's NSE files in the pre-open auction (09:00-09:07).
        await this.tickOi(state, client, now);
        if (hhmm < MARKET_OPEN_HHMM) {
          await this.persistLogs(state);
          return;
        }
      } else if (!state.baselines && !state.baselineLoading) this.loadBaselines(state, client);
      if (hhmm < MARKET_OPEN_HHMM) return;

      await this.refreshPrices(state, client, now);
      if (state.positions.length > 0) await this.managePositions(state, client, now);

      // TREND exits on 5m closes (the 15-EMA crossing back), checked before any new entry.
      if (state.config.setup === 'TREND' && state.positions.length > 0) await this.checkTrendExits(state, client, new Date());

      // No early `return` below: the completion check after the try block must still run.
      const fade = state.config.setup === 'FADE';
      const trend = state.config.setup === 'TREND';
      const sessionOver = hhmm >= SQUARE_OFF_HHMM;
      // FADE only signals on the 09:20..09:45 closes, TREND on 09:25..14:30; started (or still without candidates) after that, nothing is left today.
      const windowOver = !state.candidates && ((fade && hhmm >= FADE_LAST_CANDLE_HHMM + 7) || (trend && hhmm >= TREND_LAST_CANDLE_HHMM + 7));
      if (sessionOver) {
        if (state.positions.length === 0) state.completeReason = `🏁 Session over (15:05). Strategy completed for today.`;
      } else if (windowOver) {
        if (state.positions.length === 0 && !state.completeReason) {
          state.completeReason = fade
            ? `🏁 The fade window (09:20–09:45 closes) is over for today. Strategy completed.`
            : `🏁 The crossover window (09:25–14:30 closes) is over for today. Strategy completed.`;
        }
      } else if (state.baselines) {
        // FADE and TREND read the 09:15 candle's history at once, so give Kite a moment to finalise it.
        const firstCandleReady = !(fade || trend) || getIstHhmm(now) > FIRST_CANDLE_CLOSE_HHMM || now.getTime() % 60_000 >= FADE_SETTLE_MS;
        if (!state.candidates && hhmm >= FIRST_CANDLE_CLOSE_HHMM && firstCandleReady && now.getTime() - state.candidatesTriedAt >= 5000) {
          state.candidatesTriedAt = now.getTime();
          await this.buildCandidates(state, client, now);
        }
        if (state.candidates) {
          if (fade) {
            await this.checkFadeSignals(state, client, new Date());
            if (state.config.allowLongs) await this.checkFadeLongBreaks(state, client, new Date());
          } else if (trend) await this.checkTrendSignals(state, client, new Date());
          else await this.checkEntries(state, client, now);
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
      // The best price is recorded on every tick, even while the engine is busy, so the stop ladder never misses a
      // brief move (4 Nov VIJAYA: a few seconds through the +1.5R level between checks, the lock never fired).
      if (px && px > 0) { p.ltp = px; p.ltpAt = Date.now(); this.trackBest(p, px); touched = true; }
    }
    if (!touched || state.busy || state.stopping || !state.client) return;

    state.busy = true;
    const now = new Date();
    (async () => {
      if (state.positions.length > 0) await this.managePositions(state, state.client, now);
      // FADE shorts and TREND enter only on 5m closes (tick loop); armed FADE longs and the stop/target/breakeven react to every tick.
      if (state.candidates && getIstHhmm(now) < SQUARE_OFF_HHMM) {
        if (state.config.setup === 'ORB') await this.checkEntries(state, state.client, now);
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
    const trend = cfg.setup === 'TREND';
    // FADE and TREND keep the shortlist's history (previous sessions included) as the indicators' warm-up.
    const histories = new Map<string, { candles: FadeCandle[]; at: number }>();
    const missing = eligible.filter(([sym]) => !firsts.has(sym)).map(([sym]) => sym);
    if (missing.length > 0) {
      let shortlist: string[] = [];
      // TREND has no RVOL floor: it ranks every stock, so the quote screen keeps a margin over the watch count.
      const ranked: { sym: string; rv: number }[] = [];
      for (let i = 0; i < missing.length; i += 500) {
        const keys = missing.slice(i, i + 500).map((s) => `NSE:${s}`);
        let q: Record<string, any> = {};
        try { q = await kite.getQuote(keys); } catch (e: any) { this.log(state, `⚠ Quotes unavailable: ${e?.message || e}`); return; }
        for (const sym of missing.slice(i, i + 500)) {
          const x = q[`NSE:${sym}`];
          if (!x?.volume) continue;
          circuits.set(sym, { lower: Number(x.lower_circuit_limit) || 0, upper: Number(x.upper_circuit_limit) || 0 });
          const rv = x.volume / base.get(sym)!.avgFirstVol;
          if (trend) ranked.push({ sym, rv });
          else if (rv >= cfg.minRvol * 0.7) shortlist.push(sym);
        }
      }
      if (trend) shortlist = ranked.sort((a, b) => b.rv - a.rv).slice(0, Math.max(15, cfg.watchCount * 5)).map((r) => r.sym);
      const from = new Date(`${getIstDateStr(now)}T09:15:00.000+05:30`);
      if (fade || trend) from.setDate(from.getDate() - FADE_HISTORY_DAYS);
      for (let i = 0; i < shortlist.length; i += 3) {
        await Promise.all(shortlist.slice(i, i + 3).map(async (sym) => {
          try {
            const raw: any[] = await client.getHistoricalData(sym, 'NSE', '5minute', from, new Date());
            const k = (raw || []).find((r: any) => getIstHhmm(new Date(r.date)) === 9 * 60 + 15 && getIstDateStr(new Date(r.date)) === getIstDateStr(now));
            if (k) firsts.set(sym, { o: Number(k.open), h: Number(k.high), l: Number(k.low), c: Number(k.close), v: Number(k.volume) || 0 });
            if (fade || trend) histories.set(sym, { candles: toCompletedCandles(raw, Date.now()), at: Date.now() });
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
      if (trend) {
        // Ranked by RVOL only; the side comes from the crossover (placeholder until then).
        if (state.tradedSymbols.has(sym)) continue;
        list.push({ symbol: sym, side: 'LONG', level: 0, stopDist: 0, rvol, tick: b.tick || 0.05, first: f, ltp: null, ltpAt: 0, done: false, candles: histories.get(sym)?.candles ?? null, candlesAt: histories.get(sym)?.at ?? 0, checkedThrough: 0, armedUntil: 0, stopLevel: 0, crossSeen: new Set() });
        continue;
      }
      if (rvol < cfg.minRvol) continue;
      if (fade) {
        // Gap up -> short, gap down -> long (fadeLongs only); any first-candle colour.
        const side: Side | null = f.o > b.prevClose ? 'SHORT' : f.o < b.prevClose && cfg.allowLongs ? 'LONG' : null;
        if (!side || state.tradedSymbols.has(sym)) continue;
        list.push({ symbol: sym, side, level: side === 'SHORT' ? f.c : f.h, stopDist: 0, rvol, tick: b.tick || 0.05, first: f, ltp: null, ltpAt: 0, done: false, candles: histories.get(sym)?.candles ?? null, candlesAt: histories.get(sym)?.at ?? 0, checkedThrough: 0, armedUntil: 0, stopLevel: 0, crossSeen: new Set() });
        continue;
      }
      const side: Side | null = f.c < f.o ? 'SHORT' : f.c > f.o ? 'LONG' : null;
      if (!side || (side === 'SHORT' && !cfg.allowShorts) || (side === 'LONG' && !cfg.allowLongs)) continue;
      if (state.tradedSymbols.has(sym)) continue;
      const cir = circuits.get(sym);
      if (cir && ((side === 'SHORT' && cir.lower > 0 && (f.c - cir.lower) / f.c < 0.01) || (side === 'LONG' && cir.upper > 0 && (cir.upper - f.c) / f.c < 0.01))) continue;
      const tick = b.tick || 0.05;
      list.push({ symbol: sym, side, level: side === 'SHORT' ? f.l : f.h, stopDist: Math.max(tick * 4, cfg.stopAtrFraction * b.atr), rvol, tick, first: f, ltp: null, ltpAt: 0, done: false, candles: null, candlesAt: 0, checkedThrough: 0, armedUntil: 0, stopLevel: 0, crossSeen: new Set() });
    }
    list.sort((a, b) => b.rvol - a.rvol);
    state.candidates = list.slice(0, fade ? FADE_MAX_CANDIDATES : trend ? cfg.watchCount : MAX_CANDIDATES);
    if (fade && state.candidates.length > 0) state.candidates = await this.dropNearCircuit(state, kite, state.candidates);

    if (state.candidates.length === 0) {
      this.log(state, fade
        ? `📭 No fade candidate today (no stock opened ${cfg.allowLongs ? 'above or below' : 'above'} yesterday's close with a first candle >= ${cfg.minRvol}x its usual volume in the ${eligible.length} liquid stocks).`
        : trend
          ? `📭 No first 5m candle could be read for the ${eligible.length} liquid stocks — nothing to watch today.`
          : `📭 No stock in play today (no first candle >= ${cfg.minRvol}x its usual volume in the ${eligible.length} liquid stocks${cfg.allowLongs ? '' : ' with a red candle'}).`);
      if (state.positions.length === 0) state.completeReason = `🏁 Nothing to trade today. Strategy completed.`;
      return;
    }
    for (const c of state.candidates) {
      if (trend) {
        const b = base.get(c.symbol)!;
        const gapPct = (c.first.o / b.prevClose - 1) * 100;
        const sides = cfg.withGapOnly
          ? gapPct > 0 ? (cfg.allowLongs ? 'LONG only (gap up)' : 'nothing (gap up, longs off)') : gapPct < 0 ? (cfg.allowShorts ? 'SHORT only (gap down)' : 'nothing (gap down, shorts off)') : 'both sides (flat open)'
          : [cfg.allowLongs ? 'LONG' : null, cfg.allowShorts ? 'SHORT' : null].filter(Boolean).join(' + ');
        this.log(state, `🎯 Watching: ${c.symbol} — opened ₹${c.first.o} (${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(2)}% vs yesterday's ₹${b.prevClose}), first candle H ₹${c.first.h} L ₹${c.first.l} C ₹${c.first.c}, volume ${c.rvol.toFixed(1)}x usual | ${sides} on its first 15/40 EMA crossover (5m closes 09:25–14:30)`);
      } else if (fade) {
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

  // ── TREND signals (5m closes 09:25..14:30) and the crossback exit ──────────

  /**
   * TREND: on each 5m close, every 15/40 EMA crossover since the last check is recorded; only each side's FIRST one
   * of the day counts (as in the backtest), and it is traded only on the candle that just closed, on the VWAP side,
   * with the gap (withGapOnly). Market entry right after the close.
   */
  private async checkTrendSignals(state: EngineState, client: any, now: Date) {
    if (state.stopping || !state.candidates) return;
    const cfg = state.config;
    const nowMs = now.getTime();
    const dayOpenMs = new Date(`${getIstDateStr(now)}T09:15:00.000+05:30`).getTime();
    const firstStart = dayOpenMs + (TREND_FIRST_CANDLE_HHMM - FADE_FIRST_CANDLE_HHMM) * 60_000;
    const lastStart = dayOpenMs + (TREND_LAST_CANDLE_HHMM - FADE_FIRST_CANDLE_HHMM) * 60_000;
    const live = state.candidates.filter((c) => !c.done);

    if (state.tradesToday >= cfg.maxPositions || nowMs > lastStart + FIVE_MIN_MS + FADE_CANDLE_WAIT_MS) {
      for (const c of live) c.done = true;
      if (state.positions.length === 0 && !state.completeReason) {
        state.completeReason = state.tradesToday >= cfg.maxPositions
          ? `⛔ Max ${cfg.maxPositions} trade(s) done for today. Strategy completed.`
          : `🏁 No tradable 15/40 EMA crossover on the watched stock(s) by the 14:30 close — no trade today. Strategy completed.`;
      }
      return;
    }
    if (live.length === 0) {
      if (state.positions.length === 0 && !state.completeReason) state.completeReason = `🏁 Every watched stock has used its crossovers for today. Strategy completed.`;
      return;
    }

    const closedStart = Math.floor((nowMs - FADE_SETTLE_MS) / FIVE_MIN_MS) * FIVE_MIN_MS - FIVE_MIN_MS;
    if (closedStart < firstStart) return;
    const target = Math.min(closedStart, lastStart);
    const closeMs = target + FIVE_MIN_MS;
    const pending = live.filter((c) => c.checkedThrough < target);
    if (pending.length === 0) return;
    const hhmmOf = (ms: number) => { const m = getIstHhmm(new Date(ms)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
    const tooLate = nowMs - closeMs > FADE_MAX_ENTRY_DELAY_MS;

    const signals: { c: Candidate; side: Side; r: NonNullable<ReturnType<typeof trendReadings>> }[] = [];
    for (let i = 0; i < pending.length; i += 3) {
      await Promise.all(pending.slice(i, i + 3).map(async (c) => {
        const haveFresh = !!c.candles && c.candlesAt >= closeMs + FADE_SETTLE_MS && c.candles.some((k) => k.t === target);
        if (!haveFresh) {
          const got = await this.fetchCandles(state, client, c.symbol, c.candles, dayOpenMs);
          if (!got) return; // retried on the next tick
          c.candles = got;
          c.candlesAt = Date.now();
        }
        const k = c.candles!;
        const idx = k.findIndex((x) => x.t === target);
        if (idx < 0) {
          if (nowMs - closeMs >= FADE_CANDLE_WAIT_MS) {
            c.checkedThrough = target;
            this.log(state, `⚠ ${c.symbol}: Kite has no ${hhmmOf(closeMs)} candle yet — skipped for that close.`);
          }
          return;
        }
        if (idx < TREND_SLOW + 1) {
          c.done = true;
          this.log(state, `⚠ ${c.symbol}: only ${idx} earlier 5m candles available (the 40-EMA needs ${TREND_SLOW + 1}) — dropped.`);
          return;
        }
        const b = state.baselines?.get(c.symbol);
        const gap = b && b.prevClose > 0 ? c.first.o / b.prevClose - 1 : 0;
        const tradable = (side: Side) => (side === 'LONG' ? cfg.allowLongs : cfg.allowShorts) && !(cfg.withGapOnly && (side === 'LONG' ? gap < 0 : gap > 0));
        // Every unchecked candle up to the latest close: a crossover on a candle that was missed still uses up its side.
        for (let j = 0; j <= idx; j++) {
          if (k[j].t < firstStart || k[j].t <= c.checkedThrough) continue;
          const r = trendReadings(k, j, dayOpenMs);
          const side = r ? crossSide(r) : null;
          if (!r || !side || c.crossSeen.has(side)) continue;
          c.crossSeen.add(side);
          const at = hhmmOf(k[j].t + FIVE_MIN_MS);
          const what = `15-EMA ₹${r.fast.toFixed(2)} crossed ${side === 'LONG' ? 'above' : 'below'} the 40-EMA ₹${r.slow.toFixed(2)} at the ${at} close ₹${r.close}`;
          if (k[j].t !== target || tooLate) this.log(state, `⏭ ${c.symbol}: ${what} — seen too late to trade; ${side} is done for today.`);
          else if (!(side === 'LONG' ? cfg.allowLongs : cfg.allowShorts)) this.log(state, `ℹ ${c.symbol}: ${what} — ${side} trades are switched off.`);
          else if (!tradable(side)) this.log(state, `ℹ ${c.symbol}: ${what} — not taken: against the ${gap > 0 ? 'gap up' : 'gap down'} (${(gap * 100).toFixed(2)}%).`);
          else {
            // VWAP of the 1m closes, as in the backtest (the 5m one differs a lot after a huge first candle).
            const vwap1m = await this.vwapFromMinutes(state, client, c.symbol, dayOpenMs, target + FIVE_MIN_MS);
            if (vwap1m !== null) r.vwap = vwap1m;
            else this.log(state, `⚠ ${c.symbol}: 1m candles unavailable — using the 5m VWAP ₹${r.vwap.toFixed(2)}.`);
            if (!vwapAgrees(side, r)) this.log(state, `ℹ ${c.symbol}: ${what} — not taken: the close is ${side === 'LONG' ? 'below' : 'above'} VWAP ₹${r.vwap.toFixed(2)}; ${side} is done for today.`);
            else signals.push({ c, side, r });
          }
        }
        c.checkedThrough = target;
        if ((['LONG', 'SHORT'] as Side[]).every((s) => !tradable(s) || c.crossSeen.has(s))) c.done = true;
      }));
    }
    if (tooLate && pending.length > 0) this.log(state, `⏭ The ${hhmmOf(closeMs)} candle closed over ${FADE_MAX_ENTRY_DELAY_MS / 60_000} min ago — too late to act on it; waiting for the next close.`);
    if (signals.length === 0) return;

    // Several on the same close: the highest opening volume first.
    signals.sort((a, b) => b.c.rvol - a.c.rvol);
    for (const s of signals) {
      if (state.tradesToday >= cfg.maxPositions || state.stopping) break;
      if (Date.now() - closeMs > FADE_MAX_ENTRY_DELAY_MS) {
        this.log(state, `⏭ ${s.c.symbol} crossover is over ${FADE_MAX_ENTRY_DELAY_MS / 60_000} min old — not entering late.`);
        continue;
      }
      const long = s.side === 'LONG';
      s.c.side = s.side;
      s.c.level = s.r.close;
      s.c.stopLevel = long ? s.r.dayLow : s.r.dayHigh;
      this.log(state, `${long ? '📈' : '📉'} [TREND SIGNAL] ${s.c.symbol} ${hhmmOf(closeMs)} close ₹${s.r.close} — 15-EMA ₹${s.r.fast.toFixed(2)} crossed ${long ? 'above' : 'below'} the 40-EMA ₹${s.r.slow.toFixed(2)}, close ${long ? 'above' : 'below'} VWAP ₹${s.r.vwap.toFixed(2)} | stop at the day ${long ? 'low' : 'high'} ₹${s.c.stopLevel} | volume ${s.c.rvol.toFixed(1)}x`);
      logSignal('SETUP', state.strategyId, { engine: 'STOCKS_IN_PLAY', setup: 'TREND', event: 'SIGNAL', symbol: s.c.symbol, side: s.side, readings: s.r, rvol: s.c.rvol, isPaper: state.isPaperTrade });
      await this.refreshCandidateLtp(state, client, s.c);
      await this.enterTrade(state, client, s.c, new Date());
    }
  }

  /** Completed 5m candles: today's re-read, earlier sessions kept from `existing` (10 calendar days when there is none). */
  private async fetchCandles(state: EngineState, client: any, symbol: string, existing: FadeCandle[] | null, dayOpenMs: number): Promise<FadeCandle[] | null> {
    const from = new Date(dayOpenMs);
    if (!existing) from.setDate(from.getDate() - FADE_HISTORY_DAYS);
    try {
      const fresh = toCompletedCandles(await client.getHistoricalData(symbol, 'NSE', '5minute', from, new Date()), Date.now());
      return existing ? [...existing.filter((k) => k.t < dayOpenMs), ...fresh.filter((k) => k.t >= dayOpenMs)] : fresh;
    } catch (e: any) {
      this.logger.warn(`[${state.strategyId}] ${symbol} 5m history failed: ${e?.message || e}`);
      return null;
    }
  }

  /** Session VWAP of today's 1m closes before `untilMs`; null when Kite has none. */
  private async vwapFromMinutes(state: EngineState, client: any, symbol: string, dayOpenMs: number, untilMs: number): Promise<number | null> {
    try {
      const raw: any[] = await client.getHistoricalData(symbol, 'NSE', 'minute', new Date(dayOpenMs), new Date(untilMs));
      let pv = 0, vv = 0;
      for (const k of raw || []) {
        const t = new Date(k.date).getTime();
        if (t < dayOpenMs || t >= untilMs) continue;
        const c = Number(k.close), v = Number(k.volume) || 0;
        if (c > 0) { pv += c * v; vv += v; }
      }
      return vv > 0 ? pv / vv : null;
    } catch (e: any) {
      this.logger.warn(`[${state.strategyId}] ${symbol} 1m history failed: ${e?.message || e}`);
      return null;
    }
  }

  /** TREND exit: on each 5m close from the entry candle on, exit at market once the 15-EMA has crossed back over the 40-EMA. */
  private async checkTrendExits(state: EngineState, client: any, now: Date) {
    const nowMs = now.getTime();
    const dayOpenMs = new Date(`${getIstDateStr(now)}T09:15:00.000+05:30`).getTime();
    const closedStart = Math.floor((nowMs - FADE_SETTLE_MS) / FIVE_MIN_MS) * FIVE_MIN_MS - FIVE_MIN_MS;
    for (const p of [...state.positions]) {
      if (!state.positions.includes(p) || p.retryExit) continue;
      if (closedStart < Math.floor(p.openedAt / FIVE_MIN_MS) * FIVE_MIN_MS || closedStart <= p.trendCheckedThrough) continue;
      if (!p.candles?.some((k) => k.t === closedStart)) {
        if (nowMs - p.trendFetchAt < 5000) continue;
        p.trendFetchAt = nowMs;
        const got = await this.fetchCandles(state, client, p.symbol, p.candles, dayOpenMs);
        if (got) p.candles = got;
      }
      const idx = p.candles ? p.candles.findIndex((k) => k.t === closedStart) : -1;
      const closeHhmm = getIstHhmm(new Date(closedStart + FIVE_MIN_MS));
      const at = `${Math.floor(closeHhmm / 60)}:${String(closeHhmm % 60).padStart(2, '0')}`;
      if (idx < 0) {
        if (nowMs - (closedStart + FIVE_MIN_MS) >= FADE_CANDLE_WAIT_MS) {
          p.trendCheckedThrough = closedStart;
          this.log(state, `⚠ ${p.symbol}: Kite has no ${at} candle — the crossback exit is checked again on the next close (the SL stays on the exchange).`);
        }
        continue;
      }
      p.trendCheckedThrough = closedStart;
      const x = crossedBack(p.side, p.candles!, idx);
      if (!x) continue;
      const close = p.candles![idx].c;
      this.log(state, `${p.side === 'LONG' ? '📉' : '📈'} [TREND EXIT] ${p.symbol} ${at} close ₹${close} — the 15-EMA ₹${x.fast.toFixed(2)} crossed back ${p.side === 'LONG' ? 'below' : 'above'} the 40-EMA ₹${x.slow.toFixed(2)} — exiting at market.`);
      await this.exitPosition(state, client, p, 'TREND', p.ltp ?? close);
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

  // ── OI short build-up (pre-open auction) ───────────────────────────────────

  /**
   * OI flow, every tick from the start (08:50 pre-open auto-start): load yesterday's NSE picks, send the SELL LIMIT in
   * 09:00-09:07, read its auction fill (matched ~09:08), arm the broker SL at 09:15, then the normal position code runs.
   */
  private async tickOi(state: EngineState, client: any, now: Date) {
    const o = state.oi!;
    const hhmm = getIstHhmm(now);
    const open = hhmm >= MARKET_OPEN_HHMM;

    // The exchange takes stop orders only from 09:15; a position that cannot get one is flattened.
    if (open && !state.isPaperTrade) {
      for (const p of [...state.positions]) {
        if (p.slOrderId) continue;
        await this.armStopLoss(state, p);
        if (!p.slOrderId) {
          this.log(state, `🚨 Broker SL could not be placed for ${p.symbol}. Flattening the position now.`);
          await this.exitPosition(state, client, p, 'NO_PROTECTION', p.ltp ?? p.entryPrice);
        }
      }
    }

    if (!o.resolved && !o.orderId) {
      if (hhmm >= OI_ORDER_END_HHMM) {
        this.resolveOi(state, `⏱ The pre-open order window (09:00–09:07) has passed with no order sent today — this setup only trades at the auction price.`);
      } else {
        if (!o.picks) await this.loadOiPicksFor(state, now);
        if (o.picks && !o.resolved) {
          if (hhmm < OI_ORDER_START_HHMM) {
            if (!o.loggedWait) {
              o.loggedWait = true;
              this.log(state, `⏳ Waiting for the pre-open session: the order goes in at 09:00.`);
            }
          } else {
            await this.placeOiOrder(state, client, now);
          }
        }
      }
    } else if (!o.resolved && o.orderId && now.getTime() - o.lastCheck >= OI_ORDER_CHECK_MS) {
      if (state.isPaperTrade) {
        // Paper: the auction fill is the day's opening price, readable once trading starts.
        if (open) {
          o.lastCheck = now.getTime();
          await this.fillPaperOi(state, client, now);
        }
      } else if (hhmm >= OI_ORDER_END_HHMM + 1) {
        o.lastCheck = now.getTime();
        await this.checkOiOrder(state, client, open);
      }
    }

    if (open && o.resolved && state.positions.length === 0 && !state.completeReason) {
      state.completeReason = o.doneReason ?? `🏁 OI short build-up done for today. Strategy completed.`;
    }
  }

  /** Nothing more to send today; `msg` (if any) says why. The day completes once no position is open (from 09:15). */
  private resolveOi(state: EngineState, msg: string | null) {
    const o = state.oi!;
    o.resolved = true;
    state.enteringSymbol = null;
    if (msg) {
      this.log(state, msg);
      o.doneReason = `🏁 Nothing more to trade today. Strategy completed.`;
    }
  }

  private async loadOiPicksFor(state: EngineState, now: Date) {
    const o = state.oi!;
    if (now.getTime() - o.triedAt < 30_000) return;
    o.triedAt = now.getTime();
    try {
      const r = await loadOiPicks(getIstDateStr(now));
      o.signalDay = r.signalDay;
      o.picks = r.picks.filter((p) => !state.tradedSymbols.has(p.symbol));
      if (o.picks.length === 0) {
        this.resolveOi(state, `🏁 No futures short build-up on ${r.signalDay} (a stock down >= 3% with futures OI up 5–80%). Nothing to trade today.`);
        return;
      }
      const top = o.picks.slice(0, 5).map((p, i) => `${i + 1}. ${p.symbol} ${(p.priceChg * 100).toFixed(1)}%, futures OI +${(p.oiChg * 100).toFixed(1)}%, close ₹${p.close}`);
      this.log(state, `📑 Short build-up on ${r.signalDay} (NSE F&O bhavcopy), highest OI rise first: ${top.join(' | ')}${o.picks.length > 5 ? ` (+${o.picks.length - 5} more)` : ''}`);
    } catch (e: any) {
      this.log(state, `⚠ Could not read NSE's end-of-day files (${e?.message || e}) — retrying in 30s.`);
    }
  }

  /** The top pick's SELL LIMIT for the auction (a later pick only when an earlier one cannot be sized or is held elsewhere). */
  private async placeOiOrder(state: EngineState, client: any, now: Date) {
    const o = state.oi!;
    const cfg = state.config;
    if (now.getTime() - o.lastCheck < OI_ORDER_CHECK_MS) return;
    o.lastCheck = now.getTime();

    if (!state.isPaperTrade) {
      const tradesToday = await countTodaysTradesForEntry({ prisma: this.prisma, factory: this.factory, strategyId: state.strategyId, brokerAccountId: state.brokerAccountId, isPaper: false });
      if (tradesToday === null) {
        this.log(state, `⛔ Could not verify today's trade count (Zerodha and DB unreadable) — retrying before sending the order.`);
        return;
      }
      if (tradesToday >= cfg.maxPositions) {
        state.tradesToday = Math.max(state.tradesToday, tradesToday);
        this.resolveOi(state, `⛔ Daily trade limit reached: ${tradesToday}/${cfg.maxPositions} trades already taken today.`);
        return;
      }
    }
    let slotCapital: number;
    if (state.isPaperTrade) slotCapital = cfg.maxCapital ?? 15000;
    else {
      const cash = await this.liveCash(client);
      if (cash === null) {
        this.log(state, `⚠ Could not read the Zerodha margin — retrying rather than sizing blind.`);
        return;
      }
      slotCapital = cfg.maxCapital !== null ? Math.min(cash, cfg.maxCapital) : cash;
    }

    for (const pick of o.picks!) {
      if (state.tradedSymbols.has(pick.symbol)) continue;
      let tick = 0.05;
      try { tick = Number(await client.getTickSize(pick.symbol, 'NSE')) || 0.05; } catch { /* default tick */ }
      const limit = roundTo(pick.close * (1 - OI_LIMIT_BELOW_CLOSE), tick, 'up');
      // Sized on yesterday's close; the stop is re-based on the real auction fill.
      const qtyByRisk = Math.floor(cfg.stopLossRs / ((pick.close * cfg.stopPct) / 100));
      const qtyByCapital = Math.floor((slotCapital * cfg.leverage * 0.95) / pick.close);
      const qty = Math.min(qtyByRisk, qtyByCapital);
      if (qty < 1) {
        this.log(state, `⏭ ${pick.symbol} skipped: 1 share needs ₹${(pick.close / cfg.leverage).toFixed(0)} margin or risks ₹${((pick.close * cfg.stopPct) / 100).toFixed(2)} (capital ₹${slotCapital.toFixed(0)}, max loss ₹${cfg.stopLossRs}).`);
        continue;
      }
      let orderId: string;
      if (state.isPaperTrade) {
        orderId = `PAPER_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      } else {
        const holder = symbolHeldByOther(state.strategyId, state.brokerAccountId, pick.symbol);
        if (holder) {
          this.log(state, `⏭ ${pick.symbol}: "${holder}" already has a position in this stock on the same Zerodha account — skipping.`);
          continue;
        }
        state.enteringSymbol = normalizeSymbol(pick.symbol);
        try {
          orderId = await this.placeOrder(state, { symbol: pick.symbol, exchange: 'NSE', product: 'MIS', qty, side: 'SELL', orderType: 'LIMIT', price: limit, intent: 'ENTRY' });
        } catch (e: any) {
          this.resolveOi(state, `❌ Pre-open order for ${pick.symbol} was not accepted: ${e?.message || e}. No trade today.`);
          return;
        }
      }
      o.orderId = orderId;
      o.symbol = pick.symbol;
      o.pick = pick;
      o.limit = limit;
      o.qty = qty;
      o.tick = tick;
      o.lastCheck = Date.now();
      state.tradedSymbols.add(pick.symbol);
      this.log(state, `📨 ${state.isPaperTrade ? '[PAPER] ' : ''}Pre-open order sent: SELL ${qty} ${pick.symbol} LIMIT ₹${limit.toFixed(2)} (MIS, ${OI_LIMIT_BELOW_CLOSE * 100}% under yesterday's close ₹${pick.close}) — the auction fills it at the 09:15 opening price if the stock opens at or above the limit (risk allows ${qtyByRisk}, capital allows ${qtyByCapital}) | Order ${orderId}`);
      return;
    }
    this.resolveOi(state, `⏭ None of yesterday's short build-up stocks could be traded (see above). No trade today.`);
  }

  /** Live: the order after the auction match; at 09:15 an unfilled order is cancelled (opened under the limit). */
  private async checkOiOrder(state: EngineState, client: any, final: boolean) {
    const o = state.oi!;
    const kite = client['kite'] || client;
    const sym = o.symbol!;
    const id = o.orderId!;
    let ord = await this.readOrder(kite, id);
    if (ord && ord.status === 'COMPLETE' && ord.filledQty > 0 && ord.avgPrice > 0) {
      this.log(state, `✅ Pre-open order ${id} filled in the auction: ${ord.filledQty} @ ₹${ord.avgPrice.toFixed(2)}`);
      await this.openOiPosition(state, client, ord.filledQty, ord.avgPrice, id);
      return;
    }
    if (ord && (ord.status === 'REJECTED' || ord.status === 'CANCELLED')) {
      if (ord.filledQty > 0 && ord.avgPrice > 0) {
        this.log(state, `✅ Pre-open order ${id} ${ord.status} after a part fill: ${ord.filledQty} @ ₹${ord.avgPrice.toFixed(2)}`);
        await this.openOiPosition(state, client, ord.filledQty, ord.avgPrice, id);
        return;
      }
      this.resolveOi(state, `❌ Zerodha ${ord.status === 'REJECTED' ? 'rejected' : 'cancelled'} the pre-open order ${id} for ${sym}${ord.message ? `: ${ord.message}` : ''}. No trade today.`);
      return;
    }
    if (!final) return; // still waiting for the auction match

    // 09:15 and not (fully) filled: the stock opened under the limit. A resting limit must not fill later in the day.
    await client.cancelOrder(id).catch(() => undefined);
    ord = (await this.awaitOrder(client, id, 3000)) ?? ord;
    if (ord && ord.filledQty > 0 && ord.avgPrice > 0) {
      this.log(state, `✅ Pre-open order ${id}: ${ord.filledQty}/${o.qty} filled @ ₹${ord.avgPrice.toFixed(2)}, the rest cancelled.`);
      await this.openOiPosition(state, client, ord.filledQty, ord.avgPrice, id);
      return;
    }
    if (!ord) {
      // Order book unreadable: the position book decides whether we are in.
      const pos = await getLiveBrokerPosition(kite, sym, this.logger, { exchange: 'NSE', product: 'MIS' });
      const avg = Number(pos.rawPosition?.average_price) || Number(pos.rawPosition?.sell_price) || 0;
      if (-pos.netQty > 0 && avg > 0) {
        this.log(state, `✅ Pre-open order ${id} confirmed from positions: ${-pos.netQty} qty @ ₹${avg.toFixed(2)}`);
        await this.openOiPosition(state, client, -pos.netQty, avg, id);
        return;
      }
      this.resolveOi(state, `🚨 Pre-open order ${id} for ${sym} could not be read from Zerodha and no position is open — check Kite. No trade today.`);
      return;
    }
    this.resolveOi(state, `⏭ ${sym} opened under the ₹${o.limit.toFixed(2)} limit (a gap down of more than ${OI_LIMIT_BELOW_CLOSE * 100}%): no auction fill, order cancelled. No trade today (backtest rule).`);
  }

  /** Paper: fills at the day's opening price when it is at or above the limit (what the auction would have done). */
  private async fillPaperOi(state: EngineState, client: any, now: Date) {
    const o = state.oi!;
    const sym = o.symbol!;
    if (getIstHhmm(now) === MARKET_OPEN_HHMM && now.getTime() % 60_000 < 3000) return; // let the open print settle
    let openPx = 0;
    try {
      const kite = client['kite'] || client;
      const q = await kite.getQuote([`NSE:${sym}`]);
      openPx = Number(q?.[`NSE:${sym}`]?.ohlc?.open) || 0;
    } catch { /* retried on the next check */ }
    if (!(openPx > 0)) {
      if (getIstHhmm(now) >= MARKET_OPEN_HHMM + 2) this.resolveOi(state, `⚠ [PAPER] No opening price for ${sym} — no paper trade today.`);
      return;
    }
    if (openPx < o.limit) {
      this.resolveOi(state, `⏭ [PAPER] ${sym} opened at ₹${openPx.toFixed(2)}, under the ₹${o.limit.toFixed(2)} limit — no auction fill. No trade today (backtest rule).`);
      return;
    }
    await this.openOiPosition(state, client, o.qty, openPx, o.orderId!);
  }

  private async openOiPosition(state: EngineState, client: any, qty: number, price: number, orderId: string) {
    const o = state.oi!;
    const cfg = state.config;
    const sym = o.symbol!;
    if (!(o.tick > 0)) {
      try { o.tick = Number(await client.getTickSize(sym, 'NSE')) || 0.05; } catch { o.tick = 0.05; }
    }
    const stopDist = (price * cfg.stopPct) / 100;
    const sl = roundTo(price + stopDist, o.tick, 'up');
    // Target rounded toward the entry, so it is never further than targetR x the stop.
    const target = cfg.targetR > 0 ? roundTo(price - cfg.targetR * stopDist, o.tick, 'up') : null;
    state.tradedSymbols.add(sym);
    state.tradesToday++;
    state.sideTrades.SHORT++;
    const p: OpenPosition = {
      symbol: sym, side: 'SHORT', entryPrice: price, qty, sl, target, stopDist, beDone: true, lastBeAttempt: 0, lockedR: null, bestR: 0, tick: o.tick, rvol: null,
      slOrderId: null, openedAt: Date.now(), ltp: price, ltpAt: 0, slBreachAt: null, retryExit: null, lastExitAttempt: 0, lastOrdersCheck: 0, lastBrokerPosCheck: 0,
      candles: null, trendCheckedThrough: 0, trendFetchAt: 0,
    };
    state.positions.push(p);
    this.resolveOi(state, null);
    this.log(state, `📋 Placed Trade: NSE:${sym} — SHORT Entry: ₹${price.toFixed(2)} | Qty: ${qty} | SL: ₹${sl.toFixed(2)} (risk ₹${((sl - price) * qty).toFixed(2)}) | Target ₹${target !== null ? target.toFixed(2) : '—'} | else 15:05 | Pre-open auction fill (limit ₹${o.limit.toFixed(2)}) | Trade ${state.tradesToday}/${cfg.maxPositions} | Order ${orderId}`);
    logSignal('ENTRY', state.strategyId, { engine: 'STOCKS_IN_PLAY', setup: 'OI', symbol: sym, side: 'SHORT', level: o.limit, entry: price, sl, target, qty, oiChg: o.pick?.oiChg, priceChg: o.pick?.priceChg, signalDay: o.signalDay, isPaper: state.isPaperTrade });
    try { await this.tickerService.subscribeSymbol(state.brokerAccountId, sym); } catch { /* REST prices cover it */ }
    if (state.isPaperTrade) {
      await this.recordPaperOrder(state, sym, 'SELL', qty, price, orderId, 'MARKET', 'COMPLETE');
      await this.recordPaperOrder(state, sym, 'BUY', qty, sl, `${orderId}_SL`, 'SL', 'OPEN', sl);
      p.slOrderId = `${orderId}_SL`;
    } else if (getIstHhmm(new Date()) >= MARKET_OPEN_HHMM) {
      await this.armStopLoss(state, p);
      if (!p.slOrderId) {
        this.log(state, `🚨 Broker SL could not be placed for ${sym}. Flattening the position now.`);
        await this.exitPosition(state, client, p, 'NO_PROTECTION', price);
      }
    } else {
      this.log(state, `🛡 The broker SL goes in at 09:15 (the exchange takes no stop orders in the pre-open session).`);
    }
  }

  /**
   * After a restart: an OI order already sent today is followed up, never sent twice. A still-pending pre-open order
   * counts as today's trade in recoverTodaysTrades, so it is un-counted here: otherwise the start would complete the
   * strategy and the order would fill at ~09:08 with nobody watching it.
   */
  private async recoverOiOrder(state: EngineState) {
    const o = state.oi!;
    const done = () => {
      o.resolved = true;
      o.doneReason = `🏁 Today's OI short is done. Strategy completed.`;
    };
    if (state.positions.length > 0) return done(); // filled and re-adopted (the SL is armed from 09:15)
    if (state.isPaperTrade) {
      if (state.tradesToday > 0) done(); // a paper order is only saved once filled
      return;
    }
    const sent: any = await this.prisma.order.findFirst({
      where: { ...strategyOrderWhere(state.strategyId), createdAt: { gte: istDayStart() }, isPaperTrade: false, side: 'SELL' },
      orderBy: { createdAt: 'asc' },
      select: { symbol: true, brokerOrderId: true, price: true, qty: true },
    }).catch(() => null);
    if (!sent?.brokerOrderId) {
      if (state.tradesToday > 0) done();
      return;
    }
    const client = await this.getClient(state);
    const ord = client ? await this.readOrder(client['kite'] || client, sent.brokerOrderId) : null;
    if (ord && ['COMPLETE', 'REJECTED', 'CANCELLED'].includes(ord.status)) return done(); // traded (and closed) or refused today
    state.tradesToday = 0; // pending: counted again when it fills
    o.orderId = sent.brokerOrderId;
    o.symbol = sent.symbol;
    o.limit = Number(sent.price) || 0;
    o.qty = Number(sent.qty) || 0;
    o.tick = 0;
    o.picks = [];
    state.enteringSymbol = normalizeSymbol(sent.symbol);
    this.log(state, `🔁 Following up today's pre-open order ${sent.brokerOrderId} for ${sent.symbol} (SELL ${o.qty} LIMIT ₹${o.limit}).`);
  }

  // ── Prices ─────────────────────────────────────────────────────────────────

  /** REST fallback for prices older than 4s (open positions and live candidates). */
  private async refreshPrices(state: EngineState, client: any, now: Date) {
    const t = now.getTime();
    const stale: { symbol: string; set: (px: number) => void }[] = [];
    for (const p of state.positions) if (t - p.ltpAt > 4000) stale.push({ symbol: p.symbol, set: (px) => { p.ltp = px; p.ltpAt = Date.now(); this.trackBest(p, px); } });
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
    const trend = cfg.setup === 'TREND';
    // TREND: from the price to the day low/high (at least TREND_MIN_STOP_PCT), re-based on the real fill below.
    const trendStopDist = (px: number) => Math.max((px * TREND_MIN_STOP_PCT) / 100, (px - c.stopLevel) * sign);
    // ORB: a fixed ₹ distance from the ATR. FADE: a fixed % of the price (re-based on the real fill below).
    const stopDist = fade ? (ltp * cfg.stopPct) / 100 : trend ? trendStopDist(ltp) : c.stopDist;

    // ORB and the FADE long enter on a level break and must not chase it; the FADE short and TREND enter at market on the candle close by design.
    const chase = (ltp - c.level) * sign;
    if ((cfg.setup === 'ORB' || (fade && c.side === 'LONG')) && chase > MAX_CHASE_OF_STOP * stopDist) {
      this.log(state, `⏭ ${c.symbol} broke ₹${c.level.toFixed(2)} but is already at ₹${ltp.toFixed(2)} (more than ${MAX_CHASE_OF_STOP} of the stop distance past it). Not chasing.`);
      return;
    }

    // FADE: no room to yesterday's low (short) / high (long). The stock is dropped; a later signal on another stock may still trade.
    if (fade && cfg.skipNearPdlR > 0) {
      const yday = prevDayHighLow(c.candles, new Date(`${getIstDateStr(now)}T09:15:00.000+05:30`).getTime());
      const lvl = yday ? (c.side === 'SHORT' ? yday.l : yday.h) : null;
      const roomR = lvl !== null && stopDist > 0 ? (sign * (lvl - ltp)) / stopDist : null;
      if (lvl !== null && roomR !== null && roomR > 0 && roomR < cfg.skipNearPdlR) {
        this.log(state, `⏭ ${c.symbol} skipped: yesterday's ${c.side === 'SHORT' ? 'low' : 'high'} ₹${lvl.toFixed(2)} is only ${roomR.toFixed(2)}R ${c.side === 'SHORT' ? 'below' : 'above'} ₹${ltp.toFixed(2)} (needs at least ${cfg.skipNearPdlR}R of room).`);
        return;
      }
    }

    // Hard daily cap: re-count today's trades from Zerodha's order book (paper: saved orders) before every entry.
    // The bid/ask is only recorded for later study, so it is not waited for here; the two checks run together to get the order out sooner.
    const quoteAtEntry = this.readBidAsk(client, c.symbol);
    const [tradesToday, liveCashNow] = await Promise.all([
      countTodaysTradesForEntry({ prisma: this.prisma, factory: this.factory, strategyId: state.strategyId, brokerAccountId: state.brokerAccountId, isPaper: state.isPaperTrade }),
      state.isPaperTrade ? Promise.resolve(null) : this.liveCash(client),
    ]);
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
      const cash = liveCashNow;
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
    this.log(state, trend
      ? `🚀 ${c.symbol} 15/40 EMA crossover at ₹${ltp.toFixed(2)} — ${c.side === 'SHORT' ? 'shorting' : 'buying'} ${qty} (risk allows ${qtyByRisk}, capital allows ${qtyByCapital}).`
      : fade
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
      // Checked and claimed with no await in between, so two engines entering on the same 5m close cannot both pass.
      const holder = symbolHeldByOther(state.strategyId, state.brokerAccountId, c.symbol);
      if (holder) {
        this.log(state, `⏭ ${c.symbol}: "${holder}" already has a position in this stock on the same Zerodha account — skipping (the broker would net the two positions and break both strategies' exit checks).`);
        return;
      }
      state.enteringSymbol = normalizeSymbol(c.symbol);
      try {
        fill = await this.placeLiveEntry(state, client, c.symbol, entrySide, qty);
      } finally {
        state.enteringSymbol = null;
      }
      if (!fill) return;
    }
    state.tradedSymbols.add(c.symbol);

    const fillStopDist = fade ? (fill.price * cfg.stopPct) / 100 : trend ? trendStopDist(fill.price) : c.stopDist;
    const sl = roundTo(fill.price - sign * fillStopDist, c.tick, c.side === 'LONG' ? 'down' : 'up');
    // Target rounded toward the entry, so it is never further than targetR x the stop.
    const target = fade && cfg.targetR > 0 ? roundTo(fill.price + sign * cfg.targetR * fillStopDist, c.tick, c.side === 'LONG' ? 'down' : 'up') : null;
    state.tradesToday++;
    state.sideTrades[c.side]++;
    const p: OpenPosition = {
      symbol: c.symbol, side: c.side, entryPrice: fill.price, qty: fill.qty, sl, target, stopDist: fillStopDist, beDone: this.lockSteps(cfg).length === 0, lastBeAttempt: 0, lockedR: null, bestR: 0, tick: c.tick, rvol: c.rvol,
      slOrderId: null, openedAt: now.getTime(), ltp: ltp, ltpAt: Date.now(), slBreachAt: null, retryExit: null, lastExitAttempt: 0, lastOrdersCheck: 0, lastBrokerPosCheck: 0,
      candles: trend ? c.candles : null, trendCheckedThrough: 0, trendFetchAt: 0,
    };
    state.positions.push(p);
    const exitPlan = fade
      ? `Target ₹${target !== null ? target.toFixed(2) : '—'}${this.lockSteps(cfg).map(([at, lk]) => ` | at ₹${(fill.price + sign * at * fillStopDist).toFixed(2)} SL → ${lk === 0 ? 'entry' : `+${lk}R ₹${(fill.price + sign * lk * fillStopDist).toFixed(2)}`}`).join('')} | else 15:05`
      : trend
        ? `Exit on the 5m close where the 15-EMA crosses back ${c.side === 'LONG' ? 'below' : 'above'} the 40-EMA, at the SL or 15:05`
        : 'Exit at the SL or 15:05';
    // FADE: support/resistance zones ahead of the trade, for the log only (no effect on the exits). Built from the
    // 5m history already in memory, so no extra Kite call delays the stop order below.
    let srText = '';
    let srZones: { sessions: number; ahead: { lo: number; hi: number; touches: number; sources: string[]; distR: number }[] } | undefined;
    if (fade) {
      try {
        const set = buildSrZones(c.candles, new Date(`${getIstDateStr(now)}T09:15:00.000+05:30`).getTime());
        const maxR = cfg.targetR > 0 ? cfg.targetR : 3;
        srText = ` | ${describeZonesAhead(set, c.side, fill.price, fillStopDist, maxR)}`;
        srZones = { sessions: set.sessions, ahead: zonesAhead(set, c.side, fill.price, fillStopDist, maxR).map((a) => ({ lo: a.zone.lo, hi: a.zone.hi, touches: a.zone.touches, sources: a.zone.sources, distR: Number(a.distR.toFixed(3)) })) };
      } catch {
        srText = '';
      }
    }
    this.log(state, `📋 Placed Trade: NSE:${c.symbol} — ${c.side} Entry: ₹${fill.price.toFixed(2)} | Qty: ${fill.qty} | SL: ₹${sl.toFixed(2)} (risk ₹${(Math.abs(fill.price - sl) * fill.qty).toFixed(2)}) | ${exitPlan} | Trade ${state.tradesToday}/${cfg.maxPositions} | Order ${fill.orderId}${srText}`);
    logSignal('ENTRY', state.strategyId, { engine: 'STOCKS_IN_PLAY', setup: cfg.setup, symbol: c.symbol, side: c.side, level: c.level, entry: fill.price, sl, target, qty: fill.qty, rvol: c.rvol, ...(srZones ? { srZones } : {}), isPaper: state.isPaperTrade });

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
    await this.logEntryQuality(state, c, ltp, fill, quoteAtEntry);
  }

  /** Best bid and offer from a quote. Never throws; null when the quote or either side is missing. */
  private async readBidAsk(client: any, symbol: string): Promise<{ bid: number; ask: number } | null> {
    try {
      const kite = client['kite'] || client;
      const key = `NSE:${symbol}`;
      const q = await kite.getQuote([key]);
      const bid = Number(q?.[key]?.depth?.buy?.[0]?.price) || 0;
      const ask = Number(q?.[key]?.depth?.sell?.[0]?.price) || 0;
      return bid > 0 && ask > 0 ? { bid, ask } : null;
    } catch {
      return null;
    }
  }

  /** Records what the entry cost against the price at the order and the bid/ask, to separate spread from price movement. Runs after the stop is placed. */
  private async logEntryQuality(state: EngineState, c: Candidate, ltp: number, fill: { qty: number; price: number; orderId: string }, quote: Promise<{ bid: number; ask: number } | null>) {
    try {
      const q = await Promise.race([quote, sleep(3000).then(() => null)]);
      const sign = c.side === 'LONG' ? 1 : -1;
      // Positive = a worse price than expected, for either side.
      const costPct = ((fill.price - ltp) * sign * 100) / ltp;
      const touch = q ? (c.side === 'LONG' ? q.ask : q.bid) : null;
      const spreadPct = q ? ((q.ask - q.bid) * 200) / (q.ask + q.bid) : null;
      const vsTouchPct = touch ? ((fill.price - touch) * sign * 100) / touch : null;
      this.log(state, `🔎 ${c.symbol} entry cost: price at the order ₹${ltp.toFixed(2)}, fill ₹${fill.price.toFixed(2)}, ${costPct.toFixed(3)}% (₹${(costPct * ltp * fill.qty / 100).toFixed(2)})${q ? ` | bid ₹${q.bid.toFixed(2)}, ask ₹${q.ask.toFixed(2)}, spread ${spreadPct!.toFixed(3)}%, fill vs ${c.side === 'LONG' ? 'ask' : 'bid'} ${vsTouchPct!.toFixed(3)}%` : ' | bid/ask unavailable'}`);
      logSignal('SETUP', state.strategyId, { engine: 'STOCKS_IN_PLAY', setup: state.config.setup, event: 'ENTRY_QUOTE', symbol: c.symbol, side: c.side, ltpAtOrder: ltp, fill: fill.price, qty: fill.qty, orderId: fill.orderId, bid: q?.bid ?? null, ask: q?.ask ?? null, costPct, spreadPct, vsTouchPct, isPaper: state.isPaperTrade });
    } catch { /* recording must not disturb trading */ }
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
    // An OI position filled in the pre-open auction waits for 09:15: no orders can execute before then.
    if (getIstHhmm(now) < MARKET_OPEN_HHMM) return;
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
    // Stop ladder (FADE): breakeven, then profit locks, from the best price seen so far (every tick, see trackBest).
    this.trackBest(p, price);
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

  /** Raises the best profit seen (in R) from one price. Called on every tick and every price refresh. */
  private trackBest(p: OpenPosition, price: number) {
    if (p.stopDist > 0 && price > 0) p.bestR = Math.max(p.bestR, ((price - p.entryPrice) * (p.side === 'LONG' ? 1 : -1)) / p.stopDist);
  }

  /** FADE stop ladder as [profit reached in R, profit locked in R]: breakeven, then the profit-lock steps. */
  private lockSteps(cfg: ResolvedConfig): [number, number][] {
    if (cfg.setup !== 'FADE') return [];
    const steps: [number, number][] = [];
    if (cfg.breakevenAtR > 0) steps.push([cfg.breakevenAtR, cfg.breakevenLockR]);
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
      SL: 'Stop Loss Hit', TARGET: 'Target hit', TREND: '15/40 EMA crossback', SQUARE_OFF: '15:05 square-off', MANUAL: 'Manual square-off', BROKER_SL: 'Broker SL filled',
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
