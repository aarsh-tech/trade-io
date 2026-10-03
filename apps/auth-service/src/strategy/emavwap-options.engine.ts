import { Injectable, Logger } from '@nestjs/common';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';
import { resolveIndex } from '../brokers/instrument-store';
import { strategyEvents } from '../common/events';
import { loadResumableLogs, MAX_ENGINE_LOGS, pushEngineLog } from '../common/utils/engine-log';
import { TickerService } from '../market/ticker.service';
import { OrderGateway } from '../order-gateway/order-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { getCompletedBrokerExitDetails, getLiveBrokerPosition, isSafeToExit } from './broker-position-guard';
import { EmaVwapOptionsConfig } from './dto/strategy.dto';
import { calculateEMA, calculateVWAP, Candle, filterClosedCandles, findLatestEmaVwapCrossToday, getIstDateStr, getIstHhmm, isInsideCandle } from './emavwap-signals';
import { computeAtmPcr, computeFuturesOiBuildup, derivativesExchange, expiryDateStr, IndexUnderlying, indexOptionChain, optionUnderlying, strikeStepNear } from './option-chain-sentiment';
import { countTodaysTradesForEntry, findOpenPosition, PositionUnknownError, protectionNotice, recoverTodaysTrades } from './position-recovery';
import { logSignal } from './signal-logger';

/**
 * EMA-VWAP Options: buys NIFTY / BANKNIFTY / SENSEX options on setups read from the option's OWN 5-minute chart
 * (15-EMA and VWAP of the premium), not the index's.
 *
 * - Watches one CE and one PE at the money (strikes picked from the spot index price, nearest expiry; on expiry day
 *   the next expiry unless `useSameDayExpiry`). An idle leg moves to the new ATM strike when the spot moves.
 * - Setups, always a buy of that option:
 *   CROSSOVER: the 15-EMA crosses above VWAP on a green candle that closes above both. Entry = its high,
 *     SL = its low − buffer, valid for the next 2 candles.
 *   INSIDE: a candle inside the previous (mother) candle while EMA > VWAP. Entry = mother high,
 *     SL = mother low − buffer, valid for the next 2 candles. Every new inside candle is a fresh setup.
 *   Buffer = 2% of that low, at least ₹1. A setup is dropped if the premium trades below its low first.
 * - Sizing: lots so (entry − SL) × qty ≤ max loss per trade; skipped if one lot already exceeds it.
 * - Exit: at 2R book half the lots and move the SL to cost; the rest exits on the first 5m candle that closes below
 *   the option's 15-EMA. 15:05 square-off. One position at a time.
 * - PCR and futures OI build-up are logged on every setup, entry and exit, never used as a filter.
 */

type OptType = 'CE' | 'PE';
type SetupKind = 'CROSSOVER' | 'INSIDE';
type ExitReason = 'SL' | 'COST' | 'EMA_EXIT' | 'SQUARE_OFF' | 'MANUAL' | 'BROKER_SL' | 'BROKER_SYNC' | 'NO_PROTECTION';

const FIVE_MIN_MS = 5 * 60 * 1000;
const SETUP_VALID_CANDLES = 2;
const SQUARE_OFF_HHMM = 15 * 60 + 5;
const DEFAULT_ENTRY_CUTOFF = '15:00';
/** Skip a breakout the premium has already run past by more than this share of the setup's risk. */
const MAX_CHASE_R = 0.5;
/** Live: if the premium sits at or below the SL this long without the broker SL filling, exit at market. */
const SL_BREACH_GRACE_MS = 3000;
const SUPPORTED_UNDERLYINGS: IndexUnderlying[] = ['NIFTY', 'BANKNIFTY', 'SENSEX'];

interface ResolvedConfig {
  symbol: IndexUnderlying;
  stopLossRs: number;
  emaPeriod: number;
  vwapSource: 'close' | 'hlc3';
  product: 'MIS' | 'NRML';
  maxTradesPerDay: number;
  maxLots: number;
  maxCapital: number | null;
  slBufferPct: number;
  minSlBufferRs: number;
  partialTargetR: number;
  partialBookFraction: number;
  useSameDayExpiry: boolean;
  entryCutoffTime: string;
}

interface Contract {
  symbol: string;
  exchange: 'NFO' | 'BFO';
  type: OptType;
  strike: number;
  expiry: string;
  lotSize: number;
  tickSize: number;
}

interface Setup {
  kind: SetupKind;
  /** Start time (ms) of the candle the setup was read from. */
  candleTime: number;
  entry: number;
  /** The unbuffered low the SL hangs from; trading below it before entry kills the setup. */
  structureLow: number;
  sl: number;
  expiresAt: number;
}

interface Leg {
  type: OptType;
  contract: Contract | null;
  candles: Candle[];
  /** Start time (ms) of the last closed candle already evaluated. */
  lastCandleTime: number;
  ema: number | null;
  vwap: number | null;
  setup: Setup | null;
  ltp: number | null;
  ltpAt: number;
  subscribed: string | null;
}

interface OpenPosition {
  contract: Contract;
  setupKind: SetupKind | 'RECOVERED';
  entryPrice: number;
  initialQty: number;
  qty: number;
  sl: number;
  risk: number;
  partialTarget: number;
  stage: 'INITIAL' | 'RUNNER';
  runnerSince: number | null;
  slOrderId: string | null;
  realizedRs: number;
  openedAt: number;
  slBreachAt: number | null;
  /** An exit that could not be confirmed; retried every few seconds until the broker is flat. */
  retryExit: ExitReason | null;
  lastExitAttempt: number;
}

interface EngineState {
  strategyId: string;
  executionId: string;
  userId: string;
  brokerAccountId: string;
  isPaperTrade: boolean;
  config: ResolvedConfig;
  spotKey: string;
  lastSpot: number | null;
  legs: Record<OptType, Leg>;
  position: OpenPosition | null;
  tradesToday: number;
  winsToday: number;
  lossesToday: number;
  realizedTodayRs: number;
  logs: string[];
  busy: boolean;
  stopping: boolean;
  /** Set inside a tick when the day is done; the stop runs after the tick releases `busy`. */
  completeReason: string | null;
  client: any | null;
  clientCheckedAt: number;
  /** Start (ms) of the newest 5m slot whose closed candles have been fetched. */
  fetchedSlot: number;
  lastOrdersCheck: number;
  lastBrokerPosCheck: number;
  lastPnlLog: number;
  loggedNoSession: boolean;
  loggedCutoff: boolean;
  tickerUnsubscribe?: () => void;
  lastPersistedLogTail?: string;
  lastDbPersistTime?: number;
}

function roundDown(p: number, tick: number): number {
  return Number((Math.floor(p / tick + 1e-9) * tick).toFixed(2));
}

function roundUp(p: number, tick: number): number {
  return Number((Math.ceil(p / tick - 1e-9) * tick).toFixed(2));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface OrderSnap {
  status: string;
  filledQty: number;
  avgPrice: number;
  message?: string;
}

@Injectable()
export class EmaVwapOptionsEngine {
  private readonly logger = new Logger(EmaVwapOptionsEngine.name);
  private readonly running = new Map<string, EngineState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

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
    const index = resolveIndex(config.symbol)!;

    const resumedLogs = await loadResumableLogs(this.prisma, strategyId);
    await this.prisma.strategyExecution.updateMany({
      where: { strategyId, status: 'RUNNING' },
      data: { status: 'STOPPED', stoppedAt: new Date() },
    });
    const execution = await this.prisma.strategyExecution.create({ data: { strategyId, status: 'RUNNING' } });
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: true } });

    const newLeg = (type: OptType): Leg => ({ type, contract: null, candles: [], lastCandleTime: 0, ema: null, vwap: null, setup: null, ltp: null, ltpAt: 0, subscribed: null });
    const state: EngineState = {
      strategyId,
      executionId: execution.id,
      userId: strategy.userId,
      brokerAccountId: strategy.brokerAccountId!,
      isPaperTrade: strategy.isPaperTrade,
      config,
      spotKey: `${index.exchange}:${index.tradingsymbol}`,
      lastSpot: null,
      legs: { CE: newLeg('CE'), PE: newLeg('PE') },
      position: null,
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
      fetchedSlot: 0,
      lastOrdersCheck: 0,
      lastBrokerPosCheck: 0,
      lastPnlLog: 0,
      loggedNoSession: false,
      loggedCutoff: false,
    };
    this.running.set(strategyId, state);

    const mode = state.isPaperTrade ? 'PAPER TRADING' : 'LIVE TRADING';
    if (resumedLogs.length > 0) {
      this.log(state, `🔁 Engine reconnected — resuming console from the interrupted session (${config.symbol} options, ${mode})`);
    } else {
      this.log(state, `▶ EMA-VWAP Options started — ${config.symbol} options on ${derivativesExchange(config.symbol)} | ${mode}`);
      this.log(state, `⚙ Setups on the option's own 5m chart (${config.emaPeriod}-EMA + VWAP): EMA/VWAP crossover and inside candle | Max loss/trade ₹${config.stopLossRs} | SL buffer ${config.slBufferPct}% (min ₹${config.minSlBufferRs}) | Book ${Math.round(config.partialBookFraction * 100)}% at ${config.partialTargetR}R, SL to cost, rest exits on a 5m close below the ${config.emaPeriod}-EMA | Max ${config.maxTradesPerDay} trades | Entries until ${config.entryCutoffTime}, square-off 15:05 | Same-day expiry: ${config.useSameDayExpiry ? 'ON' : 'OFF'}`);
    }

    // Today's trades come from the broker's order book (live) or saved paper orders, so a restart cannot trade past the cap.
    const day = await recoverTodaysTrades({ prisma: this.prisma, factory: this.factory, strategyId, isPaper: !!strategy.isPaperTrade, brokerAccount: strategy.brokerAccount });
    state.tradesToday = day.trades;
    state.winsToday = day.wins;
    state.lossesToday = day.losses;
    state.realizedTodayRs = day.realizedPnlRs;
    if (day.trades > 0) {
      this.log(state, `📊 [STATE RECOVERY] Today so far: ${day.trades}/${config.maxTradesPerDay} trades | ${day.wins} wins | ${day.losses} losses | Realized P&L: ₹${day.realizedPnlRs.toFixed(2)} [${day.source === 'BROKER' ? 'Zerodha order book' : 'saved orders'}]`);
    }

    const recovered = await this.recoverOpenPosition(state, strategy.brokerAccount);
    if (recovered && state.tradesToday < 1) state.tradesToday = 1;

    if (!recovered && state.tradesToday >= config.maxTradesPerDay) {
      await this.stopWithStatus(strategyId, 'COMPLETED', `⛔ Max ${config.maxTradesPerDay} trades already taken today. Strategy completed.`);
      return { executionId: execution.id };
    }

    state.tickerUnsubscribe = this.tickerService.registerListener((ticks) => this.onTicks(state, ticks));
    await this.persistLogs(state);

    const timer = setInterval(() => this.tick(strategyId).catch((e) => this.logger.error(e)), 3_000);
    this.timers.set(strategyId, timer);
    this.tick(strategyId).catch((e) => this.logger.error(e));
    return { executionId: execution.id };
  }

  private resolveConfig(raw: Partial<EmaVwapOptionsConfig> & Record<string, any>): ResolvedConfig {
    const index = resolveIndex(raw.symbol || '');
    const underlying = index ? optionUnderlying(index.tradingsymbol) : null;
    if (!underlying || !SUPPORTED_UNDERLYINGS.includes(underlying)) {
      throw new Error(`EMA-VWAP Options trades NIFTY, BANKNIFTY or SENSEX options; "${raw.symbol}" is not one of them.`);
    }
    const stopLossRs = Number(raw.stopLossRs);
    if (!(stopLossRs > 0)) throw new Error('EMA-VWAP Options needs a max loss per trade (stopLossRs) above ₹0 to size positions.');
    const num = (v: any, d: number) => (Number(v) > 0 ? Number(v) : d);
    return {
      symbol: underlying,
      stopLossRs,
      emaPeriod: num(raw.emaPeriod, 15),
      vwapSource: raw.vwapSource === 'hlc3' ? 'hlc3' : 'close',
      product: raw.product === 'NRML' ? 'NRML' : 'MIS',
      maxTradesPerDay: num(raw.maxTradesPerDay, 2),
      maxLots: num(raw.maxLots, 10),
      maxCapital: Number(raw.maxCapital) > 0 ? Number(raw.maxCapital) : null,
      slBufferPct: num(raw.slBufferPct, 2),
      minSlBufferRs: num(raw.minSlBufferRs, 1),
      partialTargetR: num(raw.partialTargetR, 2),
      partialBookFraction: Math.min(1, num(raw.partialBookFraction, 0.5)),
      useSameDayExpiry: raw.useSameDayExpiry === true,
      entryCutoffTime: /^\d{1,2}:\d{2}$/.test(raw.entryCutoffTime || '') ? raw.entryCutoffTime : DEFAULT_ENTRY_CUTOFF,
    };
  }

  /** Re-adopts an option position this strategy opened today (LIVE: broker, PAPER: saved orders). */
  private async recoverOpenPosition(state: EngineState, brokerAccount: any): Promise<boolean> {
    const u = state.config.symbol;
    const pattern = new RegExp(`^${u}\\d.*(CE|PE)$`);
    try {
      const pos = await findOpenPosition({
        prisma: this.prisma,
        factory: this.factory,
        strategyId: state.strategyId,
        executionId: state.executionId,
        isPaper: state.isPaperTrade,
        brokerAccount,
        accept: (sym) => pattern.test(sym),
      });
      if (!pos) return false;
      if (pos.side !== 'LONG') {
        this.log(state, `🚨 Found a SHORT ${pos.symbol} position (${pos.qty}) from this strategy. This engine only buys options — close it manually in Kite.`);
        return false;
      }

      const client = brokerAccount?.accessToken ? this.factory.createClient(brokerAccount) : null;
      const contract = client ? await this.contractBySymbol(client, u, pos.symbol) : null;
      if (!contract) {
        this.log(state, `🚨 Recovered ${pos.symbol} (${pos.qty} qty) but could not read its contract details. Manage it manually in Kite.`);
        return false;
      }

      const entry = pos.avgPrice;
      // Without a saved SL, cap the loss at the configured max loss for the quantity held.
      const sl = pos.slPrice && pos.slPrice > 0 ? pos.slPrice : roundDown(Math.max(contract.tickSize, entry - state.config.stopLossRs / pos.qty), contract.tickSize);
      const atCost = sl >= entry - contract.tickSize;
      const isRunner = atCost || pos.qty < pos.initialQty;
      const risk = Math.max(contract.tickSize, entry - sl);

      state.position = {
        contract,
        setupKind: 'RECOVERED',
        entryPrice: entry,
        initialQty: pos.initialQty,
        qty: pos.qty,
        sl,
        risk,
        partialTarget: roundUp(entry + state.config.partialTargetR * risk, contract.tickSize),
        stage: isRunner ? 'RUNNER' : 'INITIAL',
        runnerSince: isRunner ? Date.now() : null,
        slOrderId: pos.slOrderId,
        realizedRs: 0,
        openedAt: Date.now(),
        slBreachAt: null,
        retryExit: null,
        lastExitAttempt: 0,
      };
      state.legs[contract.type].contract = contract;

      this.log(state, `🔄 [${pos.isPaper ? 'PAPER' : 'LIVE'} RECOVERY] Re-adopted ${contract.exchange}:${contract.symbol}: ${pos.qty} qty @ ₹${entry.toFixed(2)} | SL ₹${sl.toFixed(2)}${pos.slPrice ? '' : ' (no saved SL — set from the max loss)'}${pos.slOrderId ? ` [Order ${pos.slOrderId}]` : ''} | Stage: ${isRunner ? 'runner (SL at cost / partial booked)' : `initial, ${state.config.partialTargetR}R at ₹${state.position.partialTarget.toFixed(2)}`}`);
      const notice = protectionNotice(pos);
      if (notice) this.log(state, notice);

      if (!state.isPaperTrade && client && !pos.slOrderId) await this.armStopLoss(state);
      return true;
    } catch (err: any) {
      if (err instanceof PositionUnknownError) {
        await this.stopWithStatus(state.strategyId, 'STOPPED', `🛑 Start aborted: ${err.message}`);
        throw err;
      }
      this.logger.warn(`Position recovery failed for ${state.strategyId}: ${err?.message}`);
      return false;
    }
  }

  async stop(strategyId: string): Promise<void> {
    await this.stopWithStatus(strategyId, 'STOPPED', '⏹ Strategy stopped by user');
  }

  /**
   * Safe shutdown: an open position is squared off first. If that cannot be confirmed (live), the broker SL order is
   * left working and the console says so loudly.
   */
  private async stopWithStatus(strategyId: string, status: 'COMPLETED' | 'STOPPED', reason: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      state.stopping = true;
      const deadline = Date.now() + 20_000;
      while (state.busy && Date.now() < deadline) await sleep(250);
      state.busy = true;

      this.log(state, reason);
      if (state.position) {
        const client = await this.getClient(state);
        if (client || state.isPaperTrade) {
          this.log(state, `🧯 Position still open on shutdown — squaring off before stopping.`);
          try {
            await this.exitPosition(state, client, 'MANUAL', state.legs[state.position.contract.type].ltp ?? state.position.entryPrice);
          } catch (e: any) {
            this.log(state, `❌ Shutdown square-off failed: ${e?.message || e}`);
          }
        }
        if (state.position) {
          this.log(state, `🚨 POSITION NOT CONFIRMED FLAT (${state.position.contract.symbol}). The broker stop-loss order is left ACTIVE. Verify and close it in Kite.`);
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
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: false, autoStart: false } }).catch(() => undefined);
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
    const p = s.position;
    const ltp = p ? (s.legs[p.contract.type].ltp ?? p.entryPrice) : null;
    const pnlRs = p && ltp !== null ? p.realizedRs + (ltp - p.entryPrice) * p.qty : 0;
    const leg = (l: Leg) => ({
      symbol: l.contract ? `${l.contract.exchange}:${l.contract.symbol}` : null,
      ltp: l.ltp,
      ema: l.ema,
      vwap: l.vwap,
      setup: l.setup ? { kind: l.setup.kind, entry: l.setup.entry, sl: l.setup.sl, expiresAt: new Date(l.setup.expiresAt).toISOString() } : null,
    });
    return {
      entryTriggered: p ? 'LONG' : null,
      tradesToday: s.tradesToday,
      winningTradesToday: s.winsToday,
      losingTradesToday: s.lossesToday,
      realizedTodayRs: s.realizedTodayRs,
      optionSymbol: p?.contract.symbol ?? null,
      futureSymbol: s.config.symbol,
      entryPrice: p?.entryPrice ?? null,
      currentLtp: ltp,
      stopLossPrice: p?.sl ?? null,
      targetPrice: p && p.stage === 'INITIAL' ? p.partialTarget : null,
      stage: p?.stage ?? null,
      pnlRs,
      pnlPct: p ? (((ltp ?? p.entryPrice) - p.entryPrice) / p.entryPrice) * 100 : 0,
      qty: p?.qty ?? 0,
      spot: s.lastSpot,
      watching: { CE: leg(s.legs.CE), PE: leg(s.legs.PE) },
      isPaperTrade: s.isPaperTrade,
    };
  }

  async squareOff(strategyId: string): Promise<{ success: boolean; message: string }> {
    const state = this.running.get(strategyId);
    if (!state) return { success: false, message: 'Strategy is not running' };
    const deadline = Date.now() + 15_000;
    while (state.busy && Date.now() < deadline) await sleep(200);
    if (state.busy) return { success: false, message: 'Engine busy, try again in a moment' };
    if (!state.position) return { success: false, message: 'No open position to square off' };

    state.busy = true;
    try {
      const client = await this.getClient(state);
      const p = state.position;
      this.log(state, `⚡ Manual square-off requested for ${p.contract.symbol}`);
      await this.exitPosition(state, client, 'MANUAL', state.legs[p.contract.type].ltp ?? p.entryPrice);
      return state.position
        ? { success: false, message: 'Exit not confirmed — check the console and Kite' }
        : { success: true, message: `Squared off ${p.contract.symbol}` };
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
      if (hhmm < 9 * 60 + 15) return;

      const client = await this.getClient(state);
      if (!client) {
        if (!state.loggedNoSession) {
          state.loggedNoSession = true;
          this.log(state, `⚠ No Zerodha session for this account — waiting for login to read option prices.`);
        }
        return;
      }

      if (!state.position && (!state.legs.CE.contract || !state.legs.PE.contract)) {
        await this.selectContracts(state, client, now);
      }

      await this.subscribeLegs(state);
      await this.refreshPrices(state, client, now);
      await this.refreshCandles(state, client, now);

      if (state.position) {
        await this.managePosition(state, client, now);
      } else if (hhmm >= SQUARE_OFF_HHMM) {
        state.completeReason = `🏁 Session over (15:05). Strategy completed for today.`;
      } else {
        await this.checkEntries(state, client, now);
      }
    } catch (err: any) {
      this.log(state, `❌ Tick error: ${err?.message || err}`);
    } finally {
      state.busy = false;
    }

    if (state.completeReason && !state.position) {
      const reason = state.completeReason;
      state.completeReason = null;
      await this.stopWithStatus(strategyId, 'COMPLETED', reason);
      return;
    }
    await this.persistLogs(state);
  }

  /** Live ticks: record prices and react at once to entry triggers and stop levels. */
  private onTicks(state: EngineState, ticks: Record<string, number>) {
    let touched = false;
    for (const leg of [state.legs.CE, state.legs.PE]) {
      const c = leg.contract;
      if (!c) continue;
      const px = ticks[`${c.exchange}:${c.symbol}`] ?? ticks[c.symbol];
      if (px && px > 0) {
        leg.ltp = px;
        leg.ltpAt = Date.now();
        touched = true;
      }
    }
    if (!touched || state.busy || state.stopping || !state.client) return;
    if (!state.position && !state.legs.CE.setup && !state.legs.PE.setup) return;

    state.busy = true;
    const now = new Date();
    const work = state.position ? this.managePosition(state, state.client, now) : this.checkEntries(state, state.client, now);
    work
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

  // ── Contracts ──────────────────────────────────────────────────────────────

  /** ATM CE and PE from the spot index price. Legs with a pending setup or the open position keep their contract. */
  private async selectContracts(state: EngineState, client: any, now: Date) {
    const u = state.config.symbol;
    let spot: number | null = null;
    try {
      spot = (await client.getLTP([state.spotKey]))[state.spotKey] ?? null;
    } catch (e: any) {
      this.log(state, `⚠ Spot price unavailable (${state.spotKey}): ${e?.message || e}`);
    }
    if (!spot || spot <= 0) return;
    state.lastSpot = spot;

    const chain = await indexOptionChain(client, u);
    const today = getIstDateStr(now);
    const expiries = Array.from(new Set(chain.map((i: any) => expiryDateStr(i.expiry)))).filter((e) => e && e >= today).sort();
    const expiry = !state.config.useSameDayExpiry && expiries[0] === today ? expiries[1] : expiries[0];
    if (!expiry) {
      this.log(state, `⚠ No ${u} option expiry found in the instrument master.`);
      return;
    }
    const series = chain.filter((i: any) => expiryDateStr(i.expiry) === expiry);
    const step = strikeStepNear(series.map((i: any) => Number(i.strike)), spot);
    const atm = Math.round(spot / step) * step;

    for (const type of ['CE', 'PE'] as OptType[]) {
      const leg = state.legs[type];
      if (leg.setup || state.position?.contract.type === type) continue;
      const ofType = series.filter((i: any) => i.instrument_type === type);
      const inst = ofType.find((i: any) => Number(i.strike) === atm)
        ?? ofType.sort((a: any, b: any) => Math.abs(Number(a.strike) - spot!) - Math.abs(Number(b.strike) - spot!))[0];
      if (!inst || inst.tradingsymbol === leg.contract?.symbol) continue;

      const contract = this.toContract(inst, u);
      const previous = leg.contract?.symbol;
      leg.contract = contract;
      leg.candles = [];
      leg.lastCandleTime = 0;
      leg.ema = null;
      leg.vwap = null;
      leg.ltp = null;
      leg.ltpAt = 0;
      this.log(state, `🎯 Watching ${type}: ${contract.exchange}:${contract.symbol} (strike ${contract.strike}, expiry ${contract.expiry}, lot ${contract.lotSize}) — ${u} spot ₹${spot.toFixed(2)}${previous ? ` (was ${previous})` : ''}`);
      await this.loadLegCandles(state, client, leg, now, false);
    }
    await this.subscribeLegs(state);
  }

  private toContract(inst: any, u: IndexUnderlying): Contract {
    return {
      symbol: inst.tradingsymbol,
      exchange: derivativesExchange(u),
      type: inst.instrument_type,
      strike: Number(inst.strike),
      expiry: expiryDateStr(inst.expiry),
      lotSize: Number(inst.lot_size) || 1,
      tickSize: Number(inst.tick_size) || 0.05,
    };
  }

  private async contractBySymbol(client: any, u: IndexUnderlying, symbol: string): Promise<Contract | null> {
    const chain = await indexOptionChain(client, u).catch(() => []);
    const inst = chain.find((i: any) => i.tradingsymbol === symbol);
    return inst ? this.toContract(inst, u) : null;
  }

  private async subscribeLegs(state: EngineState) {
    for (const leg of [state.legs.CE, state.legs.PE]) {
      const sym = leg.contract?.symbol;
      if (!sym || leg.subscribed === sym) continue;
      try {
        await this.tickerService.subscribeSymbol(state.brokerAccountId, sym);
        leg.subscribed = sym;
      } catch {
        // REST prices in tick() cover a missing websocket feed.
      }
    }
  }

  // ── Prices and candles ─────────────────────────────────────────────────────

  /** REST fallback for legs whose websocket price is missing or older than 4s, only when a price matters. */
  private async refreshPrices(state: EngineState, client: any, now: Date) {
    const needed = state.position ? [state.legs[state.position.contract.type]] : [state.legs.CE, state.legs.PE].filter((l) => l.setup);
    const stale = needed.filter((l) => l.contract && now.getTime() - l.ltpAt > 4000);
    if (stale.length === 0) return;
    try {
      const keys = stale.map((l) => `${l.contract!.exchange}:${l.contract!.symbol}`);
      const ltps: Record<string, number> = await client.getLTP(keys);
      for (const l of stale) {
        const px = ltps[`${l.contract!.exchange}:${l.contract!.symbol}`];
        if (px && px > 0) {
          l.ltp = px;
          l.ltpAt = Date.now();
        }
      }
    } catch (e: any) {
      this.logger.warn(`[${state.strategyId}] LTP refresh failed: ${e?.message || e}`);
    }
  }

  /** Start (ms) of the 5m candle that closed most recently, or 0 before the first one of the day. */
  private lastClosedSlot(now: Date): number {
    const open = new Date(`${getIstDateStr(now)}T09:15:00.000+05:30`).getTime();
    const k = Math.floor((now.getTime() - open) / FIVE_MIN_MS);
    return k >= 1 ? open + (k - 1) * FIVE_MIN_MS : 0;
  }

  /** On each new 5m close: re-pick idle strikes, fetch the legs' candles and evaluate them. */
  private async refreshCandles(state: EngineState, client: any, now: Date) {
    const slot = this.lastClosedSlot(now);
    if (!slot || slot <= state.fetchedSlot) return;
    const sinceClose = now.getTime() - (slot + FIVE_MIN_MS);
    if (sinceClose < 2000) return; // Kite publishes the candle a moment after the close

    if (!state.position) await this.selectContracts(state, client, now);

    const legs = state.position ? [state.legs[state.position.contract.type]] : [state.legs.CE, state.legs.PE];
    let complete = true;
    for (const leg of legs) {
      if (!leg.contract) continue;
      const gotSlot = await this.loadLegCandles(state, client, leg, now, true);
      if (gotSlot < slot) complete = false;
    }
    // Retry until the closed candle is published; after 45s evaluate whatever arrived.
    if (complete || sinceClose > 45_000) state.fetchedSlot = slot;
  }

  /** Fetches a leg's closed 5m candles and evaluates the newest one. Returns that candle's start time (ms). */
  private async loadLegCandles(state: EngineState, client: any, leg: Leg, now: Date, evaluate: boolean): Promise<number> {
    const c = leg.contract!;
    const from = new Date(`${getIstDateStr(now)}T09:15:00.000+05:30`);
    from.setDate(from.getDate() - 5);
    let raw: any[] = [];
    try {
      raw = await client.getHistoricalData(c.symbol, c.exchange, '5minute', from, now);
    } catch (e: any) {
      this.log(state, `⚠ Could not load 5m candles for ${c.symbol}: ${e?.message || e}`);
      return 0;
    }
    const candles: Candle[] = (raw || []).slice(-300).map((k: any) => ({
      date: new Date(k.date), open: Number(k.open), high: Number(k.high), low: Number(k.low), close: Number(k.close), volume: Number(k.volume) || 0,
    }));
    const closed = filterClosedCandles(candles, now, 5);
    leg.candles = closed;
    if (closed.length < 2) return 0;

    const i = closed.length - 1;
    const emas = calculateEMA(closed, state.config.emaPeriod);
    const vwaps = calculateVWAP(closed, state.config.vwapSource);
    leg.ema = emas[i];
    leg.vwap = vwaps[i];

    const lastTime = closed[i].date.getTime();
    if (lastTime <= leg.lastCandleTime) return lastTime;
    leg.lastCandleTime = lastTime;
    if (evaluate) await this.onCandleClose(state, client, leg, closed, emas, vwaps, now);
    else this.readSetup(state, client, leg, closed, emas, vwaps, now); // a fresh contract's latest candle can be a valid setup
    return lastTime;
  }

  private async onCandleClose(state: EngineState, client: any, leg: Leg, candles: Candle[], emas: (number | null)[], vwaps: (number | null)[], now: Date) {
    const i = candles.length - 1;
    const last = candles[i];
    const p = state.position;

    if (p && p.contract.symbol === leg.contract?.symbol) {
      const ema = emas[i];
      const closedAfterRunner = p.runnerSince !== null && last.date.getTime() + FIVE_MIN_MS > p.runnerSince;
      if (p.stage === 'RUNNER' && ema !== null && closedAfterRunner && last.close < ema) {
        this.log(state, `📉 5m candle ${this.hhmmOf(last.date)} closed at ₹${last.close.toFixed(2)}, below the ${state.config.emaPeriod}-EMA ₹${ema.toFixed(2)} — exiting the runner.`);
        await this.exitPosition(state, client, 'EMA_EXIT', leg.ltp ?? last.close);
      }
      return;
    }
    if (p) return;

    this.readSetup(state, client, leg, candles, emas, vwaps, now);
  }

  /** Drops a pending setup that expired or broke its low, then reads a new one from the newest closed candle. */
  private readSetup(state: EngineState, client: any, leg: Leg, candles: Candle[], emas: (number | null)[], vwaps: (number | null)[], now: Date) {
    const i = candles.length - 1;
    const last = candles[i];
    const c = leg.contract!;
    const today = getIstDateStr(now);
    if (getIstDateStr(last.date) !== today) return;

    if (leg.setup) {
      if (last.low < leg.setup.structureLow) {
        this.log(state, `✖ ${c.symbol} ${leg.setup.kind} setup cancelled: premium fell to ₹${last.low.toFixed(2)}, below the setup low ₹${leg.setup.structureLow.toFixed(2)}, before the entry.`);
        leg.setup = null;
      } else if (now.getTime() >= leg.setup.expiresAt) {
        this.log(state, `⌛ ${c.symbol} ${leg.setup.kind} setup expired (no break of ₹${leg.setup.entry.toFixed(2)} in ${SETUP_VALID_CANDLES} candles).`);
        leg.setup = null;
      }
    }

    if (this.getEntryCutoffPassed(state, now)) return;

    const ema = emas[i], vwap = vwaps[i];
    let kind: SetupKind | null = null;
    let entry = 0, structureLow = 0;
    const cross = findLatestEmaVwapCrossToday(i, candles, emas, vwaps);
    if (cross && cross.trend === 'LONG' && cross.crossoverIdx === i) {
      kind = 'CROSSOVER';
      entry = last.high;
      structureLow = last.low;
    } else if (getIstDateStr(candles[i - 1].date) === today && isInsideCandle(candles[i - 1], last) && ema !== null && vwap !== null && ema > vwap) {
      kind = 'INSIDE';
      entry = candles[i - 1].high;
      structureLow = candles[i - 1].low;
    }
    if (!kind) return;

    const buffer = Math.max(state.config.minSlBufferRs, structureLow * state.config.slBufferPct / 100);
    const sl = roundDown(structureLow - buffer, c.tickSize);
    if (sl <= 0 || entry <= sl) return;

    const setupClose = last.date.getTime() + FIVE_MIN_MS;
    if (now.getTime() >= setupClose + SETUP_VALID_CANDLES * FIVE_MIN_MS) return;
    leg.setup = { kind, candleTime: last.date.getTime(), entry, structureLow, sl, expiresAt: setupClose + SETUP_VALID_CANDLES * FIVE_MIN_MS };
    const what = kind === 'CROSSOVER'
      ? `EMA crossed above VWAP on the ${this.hhmmOf(last.date)} candle (H ₹${last.high.toFixed(2)} / L ₹${last.low.toFixed(2)} / C ₹${last.close.toFixed(2)})`
      : `inside candle ${this.hhmmOf(last.date)} within mother ${this.hhmmOf(candles[i - 1].date)} (H ₹${candles[i - 1].high.toFixed(2)} / L ₹${candles[i - 1].low.toFixed(2)})`;
    this.log(state, `📐 ${kind} setup on ${c.exchange}:${c.symbol}: ${what} | EMA ₹${ema?.toFixed(2)} / VWAP ₹${vwap?.toFixed(2)} | Buy above ₹${entry.toFixed(2)}, SL ₹${sl.toFixed(2)} (risk ₹${(entry - sl).toFixed(2)}/unit) | valid until ${this.hhmmOf(new Date(leg.setup.expiresAt))}`);
    this.logContext(state, client, 'SETUP', { kind, symbol: c.symbol, optionType: c.type, entry, sl, ema, vwap, candleTime: last.date.toISOString() });
  }

  private getEntryCutoffPassed(state: EngineState, now: Date): boolean {
    const [h, m] = state.config.entryCutoffTime.split(':').map(Number);
    return getIstHhmm(now) >= Math.min(h * 60 + m, SQUARE_OFF_HHMM);
  }

  // ── Entries ────────────────────────────────────────────────────────────────

  private async checkEntries(state: EngineState, client: any, now: Date) {
    if (state.position || state.stopping) return;
    if (this.getEntryCutoffPassed(state, now)) {
      if (!state.loggedCutoff) {
        state.loggedCutoff = true;
        state.legs.CE.setup = null;
        state.legs.PE.setup = null;
        this.log(state, `⏱ Entry cutoff ${state.config.entryCutoffTime} reached — no new trades today.`);
      }
      return;
    }
    if (state.tradesToday >= state.config.maxTradesPerDay) {
      state.completeReason = `⛔ Max ${state.config.maxTradesPerDay} trades reached for today. Strategy completed.`;
      return;
    }

    for (const leg of [state.legs.CE, state.legs.PE]) {
      const s = leg.setup;
      if (!s || !leg.contract || leg.ltp === null || now.getTime() - leg.ltpAt > 10_000) continue;
      if (now.getTime() >= s.expiresAt) {
        this.log(state, `⌛ ${leg.contract.symbol} ${s.kind} setup expired (no break of ₹${s.entry.toFixed(2)} in ${SETUP_VALID_CANDLES} candles).`);
        leg.setup = null;
        continue;
      }
      if (leg.ltp < s.structureLow) {
        this.log(state, `✖ ${leg.contract.symbol} ${s.kind} setup cancelled: premium ₹${leg.ltp.toFixed(2)} broke the setup low ₹${s.structureLow.toFixed(2)} before the entry.`);
        leg.setup = null;
        continue;
      }
      if (leg.ltp >= s.entry) {
        await this.enterTrade(state, client, leg, s, leg.ltp, now);
        return;
      }
    }
  }

  private async enterTrade(state: EngineState, client: any, leg: Leg, setup: Setup, ltp: number, now: Date) {
    const cfg = state.config;
    const c = leg.contract!;
    // A setup is used once, and only one position is held at a time.
    state.legs.CE.setup = null;
    state.legs.PE.setup = null;

    const setupRisk = setup.entry - setup.sl;
    if (ltp > setup.entry + MAX_CHASE_R * setupRisk) {
      this.log(state, `⏭ ${c.symbol} broke ₹${setup.entry.toFixed(2)} but is already at ₹${ltp.toFixed(2)} (more than ${MAX_CHASE_R}R past the entry). Not chasing.`);
      return;
    }

    // Hard daily cap: re-count today's trades from Zerodha's order book (paper: saved orders) before every entry,
    // so a counter lost to a restart can never allow an extra trade. Unreadable = no entry.
    const tradesToday = await countTodaysTradesForEntry({ prisma: this.prisma, factory: this.factory, strategyId: state.strategyId, brokerAccountId: state.brokerAccountId, isPaper: state.isPaperTrade });
    if (tradesToday === null) {
      this.log(state, `⛔ Could not verify today's trade count (Zerodha and DB unreadable) — skipping ${c.symbol} to stay within the ${cfg.maxTradesPerDay}-trade limit.`);
      return;
    }
    if (tradesToday >= cfg.maxTradesPerDay) {
      state.tradesToday = Math.max(state.tradesToday, tradesToday);
      state.completeReason = `⛔ Max ${cfg.maxTradesPerDay} trades already taken today (re-checked against Zerodha / saved orders). Strategy completed.`;
      this.log(state, `⛔ Daily trade limit reached: ${tradesToday}/${cfg.maxTradesPerDay} trades already taken today. Skipping ${c.symbol}.`);
      return;
    }

    const refEntry = Math.max(ltp, setup.entry);
    const riskPerUnit = refEntry - setup.sl;
    const lotRisk = riskPerUnit * c.lotSize;
    const lotsByRisk = Math.floor(cfg.stopLossRs / lotRisk);
    if (lotsByRisk < 1) {
      this.log(state, `⏭ ${c.symbol} ${setup.kind} skipped: 1 lot (${c.lotSize} qty) risks ₹${lotRisk.toFixed(2)} (entry ₹${refEntry.toFixed(2)} − SL ₹${setup.sl.toFixed(2)}), above the max loss ₹${cfg.stopLossRs}.`);
      return;
    }

    let capital = cfg.maxCapital;
    if (!state.isPaperTrade) {
      capital = await this.liveCash(client);
      if (capital === null) {
        this.log(state, `⚠ Could not read the Zerodha margin — skipping ${c.symbol} rather than sizing blind.`);
        return;
      }
    }
    const lotCost = refEntry * c.lotSize;
    const lotsByCash = capital !== null ? Math.floor((capital * 0.95) / lotCost) : Infinity;
    if (lotsByCash < 1) {
      this.log(state, `⏭ ${c.symbol} skipped: 1 lot costs ₹${lotCost.toFixed(2)}, available capital ₹${capital!.toFixed(2)}.`);
      return;
    }
    const lots = Math.min(lotsByRisk, lotsByCash, cfg.maxLots);
    const qty = lots * c.lotSize;
    const limits = [`risk allows ${lotsByRisk}`, Number.isFinite(lotsByCash) ? `capital allows ${lotsByCash}` : null, `cap ${cfg.maxLots}`].filter(Boolean).join(', ');
    this.log(state, `🚀 ${c.symbol} ${setup.kind} triggered at ₹${ltp.toFixed(2)} (entry ₹${setup.entry.toFixed(2)}). Buying ${lots} lot(s) = ${qty} qty (${limits}).`);

    let fill: { qty: number; price: number; orderId: string } | null;
    if (state.isPaperTrade) {
      fill = { qty, price: ltp, orderId: `PAPER_${Math.random().toString(36).substring(2, 10).toUpperCase()}` };
      await this.recordPaperOrder(state, c, 'BUY', qty, ltp, fill.orderId, 'MARKET', 'COMPLETE');
    } else {
      fill = await this.placeLiveEntry(state, client, c, qty);
      if (!fill) return;
    }

    if (fill.price <= setup.sl) {
      this.log(state, `🚨 Filled at ₹${fill.price.toFixed(2)}, at or below the SL ₹${setup.sl.toFixed(2)} — exiting at once.`);
    }

    const risk = Math.max(c.tickSize, fill.price - setup.sl);
    state.tradesToday++;
    state.position = {
      contract: c,
      setupKind: setup.kind,
      entryPrice: fill.price,
      initialQty: fill.qty,
      qty: fill.qty,
      sl: setup.sl,
      risk,
      partialTarget: roundUp(fill.price + cfg.partialTargetR * risk, c.tickSize),
      stage: 'INITIAL',
      runnerSince: null,
      slOrderId: null,
      realizedRs: 0,
      openedAt: now.getTime(),
      slBreachAt: null,
      retryExit: null,
      lastExitAttempt: 0,
    };
    const p = state.position;
    this.log(state, `📋 Placed Option Trade: ${c.exchange}:${c.symbol} — Entry: ₹${fill.price.toFixed(2)} | Qty: ${fill.qty} | SL: ₹${p.sl.toFixed(2)} (risk ₹${(risk * fill.qty).toFixed(2)}) | ${cfg.partialTargetR}R: ₹${p.partialTarget.toFixed(2)} | Trade ${state.tradesToday}/${cfg.maxTradesPerDay} | Order ${fill.orderId}`);
    this.logContext(state, client, 'ENTRY', { kind: setup.kind, symbol: c.symbol, optionType: c.type, entry: fill.price, setupEntry: setup.entry, sl: p.sl, qty: fill.qty, lots, partialTarget: p.partialTarget });

    if (fill.price <= setup.sl) {
      await this.exitPosition(state, client, 'SL', fill.price);
      return;
    }
    if (state.isPaperTrade) {
      await this.recordPaperOrder(state, c, 'SELL', p.qty, p.sl, `${fill.orderId}_SL`, 'SL', 'OPEN', p.sl);
      p.slOrderId = `${fill.orderId}_SL`;
    } else {
      await this.armStopLoss(state);
      if (!p.slOrderId) {
        this.log(state, `🚨 Broker SL could not be placed. Flattening the position now.`);
        await this.exitPosition(state, client, 'NO_PROTECTION', state.legs[c.type].ltp ?? fill.price);
      }
    }
  }

  /** MARKET buy through the gateway, then the real fill from the order book. Null when nothing filled. */
  private async placeLiveEntry(state: EngineState, client: any, c: Contract, qty: number): Promise<{ qty: number; price: number; orderId: string } | null> {
    let orderId: string;
    try {
      orderId = await this.placeOrder(state, { symbol: c.symbol, exchange: c.exchange, product: state.config.product, qty, side: 'BUY', orderType: 'MARKET', intent: 'ENTRY' });
    } catch (e: any) {
      this.log(state, `❌ Entry order for ${c.symbol} failed: ${e?.message || e}`);
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
    const pos = await getLiveBrokerPosition(client['kite'] || client, c.symbol, this.logger);
    const avg = Number(pos.rawPosition?.average_price) || Number(pos.rawPosition?.buy_price) || 0;
    if (pos.netQty > 0 && avg > 0) {
      this.log(state, `✅ Entry ${orderId} confirmed from positions: ${pos.netQty} qty @ ₹${avg.toFixed(2)}`);
      return { qty: pos.netQty, price: avg, orderId };
    }
    this.log(state, `🚨 Entry ${orderId} for ${c.symbol} could not be confirmed (order ${order?.status ?? 'not found'}, position ${pos.netQty}). Not tracking it — check Kite.`);
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

  private async managePosition(state: EngineState, client: any, now: Date) {
    const p = state.position;
    if (!p) return;
    const leg = state.legs[p.contract.type];
    const kite = client ? client['kite'] || client : null;

    if (!state.isPaperTrade && kite) {
      // Broker SL filled?
      if (p.slOrderId && now.getTime() - state.lastOrdersCheck >= 2500) {
        state.lastOrdersCheck = now.getTime();
        const o = await this.readOrder(kite, p.slOrderId);
        if (o && o.status === 'COMPLETE' && o.filledQty > 0) {
          this.log(state, `🛑 Broker SL order ${p.slOrderId} filled ${o.filledQty} @ ₹${o.avgPrice.toFixed(2)}`);
          this.closePosition(state, client, o.avgPrice || p.sl, 'BROKER_SL', p.slOrderId);
          return;
        }
      }
      // Closed outside the engine (manual exit in Kite, RMS square-off)?
      if (now.getTime() - state.lastBrokerPosCheck >= 15_000) {
        state.lastBrokerPosCheck = now.getTime();
        const pos = await getLiveBrokerPosition(kite, p.contract.symbol, this.logger);
        if (!pos.isOpen) {
          // A manual exit in Kite leaves the SL sell working; if it later triggered it would open a short.
          if (p.slOrderId) await client.cancelOrder(p.slOrderId).catch(() => undefined);
          const exit = await getCompletedBrokerExitDetails(kite, p.contract.symbol, p.slOrderId, null, 'SELL', this.logger);
          const px = exit.found && exit.exitPrice > 0 ? exit.exitPrice : (leg.ltp ?? p.entryPrice);
          this.log(state, `ℹ [AUTO-SYNC] ${p.contract.symbol} is flat at the broker (closed outside the engine) — exit ₹${px.toFixed(2)}${exit.found ? ` (order ${exit.orderId})` : ' (last price; exit order not found)'}.`);
          this.closePosition(state, client, px, 'BROKER_SYNC', exit.orderId);
          return;
        }
      }
    }

    const price = leg.ltp;
    if (p.retryExit && now.getTime() - p.lastExitAttempt >= 3000) {
      this.log(state, `🔁 Retrying the unconfirmed exit of ${p.contract.symbol}.`);
      await this.exitPosition(state, client, p.retryExit, price ?? p.entryPrice);
      return;
    }
    if (getIstHhmm(now) >= SQUARE_OFF_HHMM) {
      this.log(state, `⏰ 15:05 square-off — exiting ${p.contract.symbol}.`);
      await this.exitPosition(state, client, 'SQUARE_OFF', price ?? p.entryPrice);
      return;
    }
    if (price === null) return;

    if (price <= p.sl) {
      const reason: ExitReason = p.sl >= p.entryPrice ? 'COST' : 'SL';
      if (state.isPaperTrade) {
        this.log(state, `🛑 ${reason === 'COST' ? 'Cost stop' : 'Stop loss'} hit: ${p.contract.symbol} ₹${price.toFixed(2)} ≤ SL ₹${p.sl.toFixed(2)}`);
        await this.exitPosition(state, client, reason, price);
        return;
      }
      // Live: the exchange SL should fill; if it has not within the grace period (gap through the limit), exit at market.
      if (p.slBreachAt === null) {
        p.slBreachAt = now.getTime();
      } else if (now.getTime() - p.slBreachAt >= SL_BREACH_GRACE_MS) {
        this.log(state, `🛑 ${p.contract.symbol} ₹${price.toFixed(2)} is at/below the SL ₹${p.sl.toFixed(2)} and the broker SL has not filled — exiting at market.`);
        await this.exitPosition(state, client, reason, price);
        return;
      }
    } else {
      p.slBreachAt = null;
    }

    if (p.stage === 'INITIAL' && price >= p.partialTarget) {
      await this.takePartial(state, client, price, now);
      if (!state.position) return;
    }

    if (now.getTime() - state.lastPnlLog >= 30_000) {
      state.lastPnlLog = now.getTime();
      const open = (price - p.entryPrice) * p.qty;
      this.log(state, `📊 [LIVE P&L] ${p.contract.symbol}: ₹${price.toFixed(2)} | Open ${open >= 0 ? '+' : ''}₹${open.toFixed(2)}${p.realizedRs ? ` | Booked ₹${p.realizedRs.toFixed(2)}` : ''} | SL ₹${p.sl.toFixed(2)} | ${p.stage === 'INITIAL' ? `${state.config.partialTargetR}R ₹${p.partialTarget.toFixed(2)}` : `runner, exits on a 5m close below the ${state.config.emaPeriod}-EMA${leg.ema ? ` (₹${leg.ema.toFixed(2)})` : ''}`}`);
    }
  }

  /** 2R reached: book part of the lots (if there is more than one), move the SL to cost, switch to the EMA exit. */
  private async takePartial(state: EngineState, client: any, price: number, now: Date) {
    const p = state.position!;
    const c = p.contract;
    const lots = Math.floor(p.qty / c.lotSize);
    const bookLots = Math.floor(lots * state.config.partialBookFraction);
    const bookQty = bookLots * c.lotSize;

    if (bookQty > 0 && bookQty < p.qty) {
      let filledQty = 0, avg = price, orderId = '';
      if (state.isPaperTrade) {
        filledQty = bookQty;
        orderId = `PAPER_PARTIAL_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        await this.recordPaperOrder(state, c, 'SELL', bookQty, price, orderId, 'MARKET', 'COMPLETE');
      } else {
        const kite = client['kite'] || client;
        const safety = await isSafeToExit(kite, c.symbol, 'SELL', this.logger);
        const sellQty = safety.safe ? Math.min(bookQty, Math.abs(safety.brokerQty)) : 0;
        if (sellQty <= 0 || sellQty >= p.qty) {
          this.log(state, `ℹ Partial booking skipped: the broker shows ${safety.brokerQty} ${c.symbol}, not enough to book ${bookQty} and keep a runner.`);
        } else {
          // Zerodha counts a sell beyond the long quantity (including the working SL sell) as a fresh short that needs
          // margin, and rejects it. So the stop is cut to the quantity that stays open BEFORE the partial sell goes out.
          // syncStopLoss() below brings it back in line with whatever is really still open.
          let slReady = true;
          if (p.slOrderId) {
            try {
              await client.modifyOrder(p.slOrderId, { quantity: p.qty - sellQty });
            } catch (e: any) {
              slReady = false;
              const sl = await this.readOrder(kite, p.slOrderId);
              if (sl && sl.status === 'COMPLETE' && sl.filledQty > 0) {
                this.log(state, `🛑 Broker SL ${p.slOrderId} filled @ ₹${sl.avgPrice.toFixed(2)} before the partial booking.`);
                this.closePosition(state, client, sl.avgPrice || p.sl, 'BROKER_SL', p.slOrderId);
                return;
              }
              this.log(state, `⚠ Partial booking skipped: could not reduce broker SL ${p.slOrderId} to ${p.qty - sellQty} qty first (${e?.message || e}). The whole position rides on.`);
            }
          }
          if (slReady) {
            try {
              orderId = await this.placeOrder(state, { symbol: c.symbol, exchange: c.exchange, product: state.config.product, qty: sellQty, side: 'SELL', orderType: 'MARKET', intent: 'EXIT' });
              let o = await this.awaitOrder(client, orderId, 5000);
              if (o && !['COMPLETE', 'REJECTED', 'CANCELLED'].includes(o.status)) {
                await client.cancelOrder(orderId).catch(() => undefined);
                o = (await this.awaitOrder(client, orderId, 2000)) ?? o;
              }
              if (o) {
                filledQty = Math.min(sellQty, o.filledQty);
                if (o.avgPrice) avg = o.avgPrice;
              } else {
                // Order book unreadable: the position book says how much was sold.
                const after = await getLiveBrokerPosition(kite, c.symbol, this.logger);
                if (after.netQty > 0) filledQty = Math.max(0, Math.min(sellQty, p.qty - after.netQty));
              }
              if (filledQty < sellQty) {
                this.log(state, `⚠ Partial booking order ${orderId} ${o?.status ?? 'not confirmed'}${o?.message ? `: ${o.message}` : ''} — sold ${filledQty}/${sellQty}. The broker SL is set back to the open quantity.`);
              }
            } catch (e: any) {
              this.log(state, `⚠ Partial booking order failed: ${e?.message || e}. The broker SL is set back to the full quantity.`);
            }
          }
        }
      }
      if (filledQty > 0) {
        p.qty -= filledQty;
        const booked = (avg - p.entryPrice) * filledQty;
        p.realizedRs += booked;
        this.log(state, `💰 ${state.config.partialTargetR}R reached — booked ${filledQty} qty of ${c.symbol} @ ₹${avg.toFixed(2)} (+₹${booked.toFixed(2)})${orderId ? ` [${orderId}]` : ''}. ${p.qty} qty rides on.`);
      }
    } else {
      this.log(state, `💰 ${state.config.partialTargetR}R reached on ${c.symbol} @ ₹${price.toFixed(2)} — single lot, so nothing to book; the whole position rides on.`);
    }

    p.stage = 'RUNNER';
    p.runnerSince = now.getTime();
    p.sl = roundUp(p.entryPrice, c.tickSize);
    p.slBreachAt = null;
    this.log(state, `🛡 SL moved to cost ₹${p.sl.toFixed(2)}. The rest exits on the first 5m close below the ${state.config.emaPeriod}-EMA.`);
    await this.syncStopLoss(state, client);
  }

  // ── Broker stop-loss ───────────────────────────────────────────────────────

  private slLimit(trigger: number, tick: number): number {
    return Math.max(tick, roundDown(trigger - Math.max(1, trigger * 0.03), tick));
  }

  /** Places the exchange SL-limit sell for the open quantity (two attempts). */
  private async armStopLoss(state: EngineState) {
    const p = state.position!;
    const c = p.contract;
    const trigger = roundDown(p.sl, c.tickSize);
    const price = this.slLimit(trigger, c.tickSize);
    for (let attempt = 1; attempt <= 2 && !p.slOrderId; attempt++) {
      try {
        p.slOrderId = await this.placeOrder(state, { symbol: c.symbol, exchange: c.exchange, product: state.config.product, qty: p.qty, side: 'SELL', orderType: 'SL', triggerPrice: trigger, price, intent: 'PROTECTIVE' });
        this.log(state, `🛡 Broker SL armed (${p.slOrderId}): ${p.qty} qty, trigger ₹${trigger.toFixed(2)}, limit ₹${price.toFixed(2)}`);
      } catch (e: any) {
        this.log(state, `⚠ Broker SL placement failed (attempt ${attempt}/2): ${e?.message || e}`);
      }
    }
  }

  /** Brings the protective order in line with the position's SL and open quantity (live and paper). */
  private async syncStopLoss(state: EngineState, client: any) {
    const p = state.position!;
    const c = p.contract;
    const trigger = roundDown(p.sl, c.tickSize);
    const price = this.slLimit(trigger, c.tickSize);

    if (state.isPaperTrade) {
      if (p.slOrderId) {
        await this.prisma.order.updateMany({ where: { brokerOrderId: p.slOrderId, isPaperTrade: true }, data: { triggerPrice: trigger, price, qty: p.qty } }).catch(() => undefined);
      }
      return;
    }
    if (!p.slOrderId) {
      await this.armStopLoss(state);
      return;
    }
    try {
      await client.modifyOrder(p.slOrderId, { triggerPrice: trigger, price, quantity: p.qty });
      this.log(state, `🛡 Broker SL ${p.slOrderId} updated: ${p.qty} qty, trigger ₹${trigger.toFixed(2)}, limit ₹${price.toFixed(2)}`);
    } catch (e: any) {
      // Replace the order rather than leave a stop for the wrong quantity or level.
      this.log(state, `⚠ Could not modify broker SL ${p.slOrderId} (${e?.message || e}) — replacing it.`);
      await client.cancelOrder(p.slOrderId).catch(() => undefined);
      const old = await this.readOrder(client['kite'] || client, p.slOrderId);
      if (old && old.status === 'COMPLETE') {
        this.closePosition(state, client, old.avgPrice || p.sl, 'BROKER_SL', p.slOrderId);
        return;
      }
      p.slOrderId = null;
      await this.armStopLoss(state);
      if (!p.slOrderId) this.log(state, `🚨 ${c.symbol} has NO broker stop-loss now. The engine still exits on the SL price; watch it in Kite.`);
    }
  }

  // ── Exits ──────────────────────────────────────────────────────────────────

  /** Sells the open quantity and closes the position on the real fill (paper: at `refPrice`). */
  private async exitPosition(state: EngineState, client: any, reason: ExitReason, refPrice: number) {
    const p = state.position;
    if (!p) return;
    const c = p.contract;
    p.lastExitAttempt = Date.now();

    if (state.isPaperTrade) {
      const id = `PAPER_EXIT_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      await this.recordPaperOrder(state, c, 'SELL', p.qty, refPrice, id, 'MARKET', 'COMPLETE');
      this.closePosition(state, client, refPrice, reason, id);
      return;
    }
    if (!client) {
      this.log(state, `🚨 No broker session — cannot exit ${c.symbol}. The broker SL stays active.`);
      return;
    }
    const kite = client['kite'] || client;

    // Cancel the protective order first; if it filled meanwhile, that fill is the exit.
    if (p.slOrderId) {
      await client.cancelOrder(p.slOrderId).catch(() => undefined);
      const sl = await this.readOrder(kite, p.slOrderId);
      if (sl && sl.status === 'COMPLETE' && sl.filledQty > 0) {
        this.log(state, `🛑 Broker SL ${p.slOrderId} had already filled @ ₹${sl.avgPrice.toFixed(2)}`);
        this.closePosition(state, client, sl.avgPrice || p.sl, 'BROKER_SL', p.slOrderId);
        return;
      }
    }

    // Never sell more than the broker holds; a lagging position book gets a few retries before "flat" is believed.
    let safety = await isSafeToExit(kite, c.symbol, 'SELL', this.logger);
    for (let attempt = 0; attempt < 3 && !safety.safe; attempt++) {
      await sleep(700);
      safety = await isSafeToExit(kite, c.symbol, 'SELL', this.logger);
    }
    if (safety.unknown) {
      // Unreadable is not flat (the SL was just cancelled): put the stop back and retry the exit.
      p.retryExit = reason;
      p.slOrderId = null;
      this.log(state, `⚠ Zerodha positions for ${c.symbol} could not be read — exit not sent. Re-arming the SL and retrying.`);
      await this.armStopLoss(state);
      return;
    }
    if (!safety.safe) {
      const exit = await getCompletedBrokerExitDetails(kite, c.symbol, p.slOrderId, null, 'SELL', this.logger);
      const px = exit.found && exit.exitPrice > 0 ? exit.exitPrice : refPrice;
      this.log(state, `ℹ [AUTO-SYNC] ${c.symbol} is already flat at the broker (qty ${safety.brokerQty}). No sell sent.`);
      this.closePosition(state, client, px, 'BROKER_SYNC', exit.orderId);
      return;
    }

    const sellQty = Math.min(p.qty, Math.abs(safety.brokerQty));
    let orderId: string | null = null;
    try {
      orderId = await this.placeOrder(state, { symbol: c.symbol, exchange: c.exchange, product: state.config.product, qty: sellQty, side: 'SELL', orderType: 'MARKET', intent: 'EXIT' });
    } catch (e: any) {
      this.log(state, `❌ Exit order for ${c.symbol} failed: ${e?.message || e}. Re-arming the SL and retrying.`);
      p.retryExit = reason;
      p.slOrderId = null;
      await this.armStopLoss(state);
      return;
    }
    const o = await this.awaitOrder(client, orderId, 5000);

    await sleep(500);
    const after = await getLiveBrokerPosition(kite, c.symbol, this.logger);
    // isOpen with netQty 0 means the position book could not be read; then only a COMPLETE exit order counts as flat.
    const unreadable = after.isOpen && after.netQty === 0;
    const remaining = after.netQty > 0 ? after.netQty : p.qty - (o?.filledQty ?? 0);
    if (remaining > 0 && (after.netQty > 0 || (unreadable && o?.status !== 'COMPLETE'))) {
      // Not confirmed flat: keep managing the remainder, put its stop back and retry the exit.
      if (o && o.filledQty > 0) {
        p.realizedRs += ((o.avgPrice || refPrice) - p.entryPrice) * Math.min(o.filledQty, p.qty - remaining);
      }
      p.qty = remaining;
      p.slOrderId = null;
      p.retryExit = reason;
      this.log(state, `🚨 ${c.symbol} not confirmed flat after the exit order (${o?.status ?? 'status unknown'}, broker qty ${unreadable ? 'unreadable' : after.netQty}). Re-arming the SL for ${remaining} qty and retrying.`);
      await this.armStopLoss(state);
      return;
    }

    const px = o && o.avgPrice > 0 ? o.avgPrice : refPrice;
    if (!o || !(o.avgPrice > 0)) this.log(state, `⚠ Exit fill price not confirmed for ${orderId ?? c.symbol}; using ₹${refPrice.toFixed(2)}. The order book holds the real price.`);
    this.closePosition(state, client, px, reason, orderId);
  }

  /** Books the trade's result and clears the position. No orders are placed here. */
  private closePosition(state: EngineState, client: any, exitPrice: number, reason: ExitReason, orderId: string) {
    const p = state.position;
    if (!p) return;
    const pnl = p.realizedRs + (exitPrice - p.entryPrice) * p.qty;
    state.realizedTodayRs += pnl;
    if (pnl > 0) state.winsToday++;
    else if (pnl < 0) state.lossesToday++;

    if (state.isPaperTrade && p.slOrderId) {
      this.prisma.order.updateMany({ where: { brokerOrderId: p.slOrderId, isPaperTrade: true, status: 'OPEN' }, data: { status: 'CANCELLED' } }).catch(() => undefined);
    }

    const label: Record<ExitReason, string> = {
      SL: 'Stop Loss Hit', COST: 'Cost stop hit', EMA_EXIT: `Candle closed below the ${state.config.emaPeriod}-EMA`, SQUARE_OFF: '15:05 square-off',
      MANUAL: 'Manual square-off', BROKER_SL: 'Broker SL filled', BROKER_SYNC: 'Closed outside the engine', NO_PROTECTION: 'Exited (no broker SL)',
    };
    this.log(state, `🏁 ${label[reason]} — ${p.contract.symbol} exit at ₹${exitPrice.toFixed(2)} (entry ₹${p.entryPrice.toFixed(2)}) | Realized P&L: ₹${pnl.toFixed(2)} | Today: ₹${state.realizedTodayRs.toFixed(2)} (${state.winsToday}W/${state.lossesToday}L, ${state.tradesToday}/${state.config.maxTradesPerDay} trades) [${orderId}]`);
    this.logContext(state, client, 'EXIT', { symbol: p.contract.symbol, reason, entry: p.entryPrice, exit: exitPrice, pnl, setupKind: p.setupKind, heldMs: Date.now() - p.openedAt });

    state.position = null;
    state.legs.CE.setup = null;
    state.legs.PE.setup = null;
    strategyEvents.emit('strategy.update', { strategyId: state.strategyId, logs: state.logs, state: this.snapshot(state) });

    if (state.tradesToday >= state.config.maxTradesPerDay) {
      state.completeReason = `⛔ Max ${state.config.maxTradesPerDay} trades done for today. Strategy completed.`;
    }
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

  private async recordPaperOrder(state: EngineState, c: Contract, side: 'BUY' | 'SELL', qty: number, price: number, orderId: string, orderType: 'MARKET' | 'SL', status: 'OPEN' | 'COMPLETE', triggerPrice?: number) {
    await this.orderGateway.recordEngineOrder({
      userId: state.userId,
      accountId: state.brokerAccountId,
      strategyId: state.strategyId,
      executionId: state.executionId,
      symbol: c.symbol,
      exchange: c.exchange,
      side,
      orderType,
      product: state.config.product,
      qty,
      price,
      triggerPrice: triggerPrice ?? null,
      brokerOrderId: orderId,
      status,
      isPaper: true,
    });
  }

  // ── Logging ────────────────────────────────────────────────────────────────

  /** PCR and futures OI build-up next to a setup / entry / exit. Logged only; never awaited by the caller. */
  private logContext(state: EngineState, client: any, kind: 'SETUP' | 'ENTRY' | 'EXIT', payload: Record<string, any>) {
    const base = { engine: 'EMA_VWAP_OPTIONS', underlying: state.config.symbol, spot: state.lastSpot, isPaper: state.isPaperTrade, ...payload };
    if (!client) {
      logSignal(kind, state.strategyId, base);
      return;
    }
    Promise.all([
      state.lastSpot ? computeAtmPcr(client, state.config.symbol, state.lastSpot) : Promise.resolve(null),
      computeFuturesOiBuildup(client, state.config.symbol),
    ])
      .then(([pcr, oi]) => {
        const pcrStr = pcr ? `PCR ${pcr.pcr} (ATM±3, ${pcr.expiry})` : 'PCR n/a';
        const oiStr = oi ? `${oi.futSymbol} ${oi.buildup.replace('_', ' ')} (price ${oi.priceChgPct >= 0 ? '+' : ''}${oi.priceChgPct}%, OI ${oi.oiChgPct >= 0 ? '+' : ''}${oi.oiChgPct}% vs prev close)` : 'futures OI n/a';
        this.log(state, `🧭 ${kind} context — ${pcrStr} | ${oiStr} (info only)`);
        logSignal(kind, state.strategyId, { ...base, pcr, futuresOi: oi });
      })
      .catch(() => logSignal(kind, state.strategyId, base));
  }

  private hhmmOf(d: Date): string {
    return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  }

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
