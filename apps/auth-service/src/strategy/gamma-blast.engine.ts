import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';

// ─── Strategy Config ──────────────────────────────────────────────────────────

export interface GammaBlastConfig {
  // Instrument
  symbol: string;            // 'NIFTY 50' | 'BANKNIFTY'
  exchange: string;          // 'NSE'

  // Expiry schedule
  expiryMode: 'weekly' | 'monthly-last';  // weekly = every Tue (Nifty), monthly-last = last Tue (BankNifty)
  expiryDay: number;         // 0-6 (0=Sun..6=Sat). Default: 2 (Tuesday)

  // Position sizing
  lots: number;              // 1, 2, 3... Fully configurable

  // Option selection
  minPremium: number;        // Default: 2
  maxPremium: number;        // Default: 10
  strikesOTM: number;        // How many strikes OTM to search. Default: 5

  // Signal thresholds
  atrMultiplier: number;     // Default: 2.5
  premiumVelocityX: number;  // Default: 2.0 (premium must 2x in 60s)
  vixSpikeThreshold: number; // Default: 3.0 (%)
  vwapDivergence: number;    // Default: 0.3 (%)
  minSignalScore: number;    // Default: 70 (out of 100)

  // Trailing SL tiers (%)
  trailTier1: number;        // For premium ₹5–15.  Default: 40
  trailTier2: number;        // For premium ₹15–50. Default: 30
  trailTier3: number;        // For premium ₹50–100.Default: 25
  trailTier4: number;        // For premium ₹100+.  Default: 20

  // Risk limits
  maxTradesPerDay: number;   // Default: 3
  maxLossPerDay: number;     // Default: 2000 (₹)
  forceExitMinBefore: number;// Default: 15 (minutes before market close)
  product: string;           // 'MIS'
}

// ─── Runtime State ────────────────────────────────────────────────────────────

interface Candle { date: Date; open: number; high: number; low: number; close: number; volume: number; }

interface PremiumSnapshot { ltp: number; ts: number; }

interface GammaPosition {
  side: 'CE' | 'PE';
  optionSymbol: string;
  entryPrice: number;
  qty: number;
  orderId: string;
  highWaterMark: number;   // highest premium seen — for trailing SL
  trailingSL: number;      // current trailing SL price
}

interface SignalScores {
  velocityBreakout: number;   // 0 or 40
  premiumVelocity: number;    // 0 or 30
  vixSpike: number;           // 0 or 15
  vwapDivergence: number;     // 0 or 15
  total: number;
  direction: 'CE' | 'PE' | null;
}

interface StrategyState {
  executionId: string;
  config: GammaBlastConfig;
  brokerAccountId: string;
  isPaperTrade: boolean;

  // Future resolution
  futureSymbol: string | null;
  futureExchange: string;

  // Market data buffers
  candles1m: Candle[];
  atrBuffer: number[];         // rolling ATR values
  vixHistory: { value: number; ts: number }[];
  cePremiumHistory: PremiumSnapshot[];
  pePremiumHistory: PremiumSnapshot[];
  vwap: number;

  // Position tracking
  positions: GammaPosition[];
  tradesPlacedToday: number;
  totalPnlToday: number;
  dayChecked: boolean;         // whether we checked expiry day today

  logs: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcATR(candles: Candle[], period: number): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const c = candles[i];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

function calcVWAP(candles: Candle[]): number {
  let cumPV = 0, cumV = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumPV += tp * c.volume;
    cumV += c.volume;
  }
  return cumV === 0 ? candles[candles.length - 1]?.close ?? 0 : cumPV / cumV;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

@Injectable()
export class GammaBlastEngine {
  private readonly logger = new Logger(GammaBlastEngine.name);
  private readonly running = new Map<string, StrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) {
      return { executionId: this.running.get(strategyId)!.executionId };
    }

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

    const config: GammaBlastConfig = this.applyDefaults(JSON.parse(strategy.config));
    const execution = await this.prisma.strategyExecution.create({ data: { strategyId, status: 'RUNNING' } });
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: true } });

    const state: StrategyState = {
      executionId: execution.id,
      config,
      brokerAccountId: brokerAccount.id,
      isPaperTrade: (strategy as any).isPaperTrade,
      futureSymbol: null,
      futureExchange: 'NFO',
      candles1m: [],
      atrBuffer: [],
      vixHistory: [],
      cePremiumHistory: [],
      pePremiumHistory: [],
      vwap: 0,
      positions: [],
      tradesPlacedToday: 0,
      totalPnlToday: 0,
      dayChecked: false,
      logs: [],
    };

    this.running.set(strategyId, state);
    this.log(state, `⚡ Gamma Blast engine started — ${config.symbol} | ${config.lots} lot(s) | Mode: ${config.expiryMode}`);

    // Tick every 15 seconds for fast gamma detection
    const timer = setInterval(
      () => this.tick(strategyId).catch(e => this.logger.error(e)),
      15_000,
    );
    this.timers.set(strategyId, timer);
    this.tick(strategyId).catch(e => this.logger.error(e));
    return { executionId: execution.id };
  }

  async stop(strategyId: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      clearInterval(this.timers.get(strategyId));
      this.timers.delete(strategyId);
      this.running.delete(strategyId);
      this.log(state, '⏹ Gamma Blast engine stopped');
      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { status: 'STOPPED', stoppedAt: new Date(), logs: JSON.stringify(state.logs) },
      });
    }
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: false } });
  }

  isRunning(strategyId: string) { return this.running.has(strategyId); }
  getLogs(strategyId: string): string[] { return this.running.get(strategyId)?.logs ?? []; }

  getState(strategyId: string) {
    const s = this.running.get(strategyId);
    if (!s) return null;
    return {
      symbol: s.config.symbol,
      expiryMode: s.config.expiryMode,
      lots: s.config.lots,
      positions: s.positions.map(p => ({
        side: p.side,
        symbol: p.optionSymbol,
        entry: p.entryPrice,
        hwm: p.highWaterMark,
        trailSL: p.trailingSL,
        qty: p.qty,
      })),
      tradesToday: s.tradesPlacedToday,
      pnlToday: s.totalPnlToday,
    };
  }

  // ── Main Tick ──────────────────────────────────────────────────────────────

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const h = ist.getHours();
    const m = ist.getMinutes();
    const hhmm = h * 60 + m;

    const MARKET_OPEN = 9 * 60 + 15;
    const MARKET_CLOSE = 15 * 60 + 30; // Will adjust for 3:40 close later

    // Before market open — reset daily state
    if (hhmm < MARKET_OPEN) {
      this.resetDay(state);
      return;
    }

    // After market close — stop
    if (hhmm >= MARKET_CLOSE) {
      return;
    }

    // ── Expiry day check (once per day) ──────────────────────────────────
    if (!state.dayChecked) {
      state.dayChecked = true;
      const isExpiry = this.isExpiryDay(ist, state.config);
      if (!isExpiry) {
        this.log(state, `📅 Not expiry day — skipping. Mode: ${state.config.expiryMode}, Day: ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][ist.getDay()]}`);
        return;
      }
      this.log(state, `🔥 EXPIRY DAY DETECTED — Gamma Blast is ACTIVE!`);
    }

    // If we already determined it's not expiry day, skip
    // (dayChecked is true but we logged "not expiry day")
    if (!this.isExpiryDay(ist, state.config)) return;

    // ── Skip first 5 minutes (opening noise) ────────────────────────────
    const marketMinutes = hhmm - MARKET_OPEN;
    if (marketMinutes < 5) {
      this.log(state, `⏳ Waiting for opening noise to settle (${marketMinutes}/5 min)`);
      return;
    }

    // ── Force exit before close ──────────────────────────────────────────
    const closeTime = MARKET_CLOSE;
    const forceExitTime = closeTime - (state.config.forceExitMinBefore ?? 15);
    if (hhmm >= forceExitTime && state.positions.length > 0) {
      await this.forceExitAll(state, strategyId, 'TIME_EXIT');
      return;
    }

    // ── Max loss check ───────────────────────────────────────────────────
    if (state.totalPnlToday <= -(state.config.maxLossPerDay ?? 2000)) {
      this.log(state, `⛔ Max daily loss (₹${state.config.maxLossPerDay}) reached. P&L: ₹${state.totalPnlToday.toFixed(0)}`);
      return;
    }

    // ── Get broker client ────────────────────────────────────────────────
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account?.accessToken) { this.log(state, '⚠ No active broker session'); return; }

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    // Resolve future symbol if index
    if (!state.futureSymbol) {
      try {
        const resolved = await this.resolveFuture(kite, state.config.symbol);
        state.futureSymbol = resolved.symbol;
        state.futureExchange = resolved.exchange;
        this.log(state, `🔎 Resolved Underlying Future: ${state.futureExchange}:${state.futureSymbol}`);
      } catch (e) {
        this.log(state, `❌ Future resolve failed: ${e.message}`);
        return;
      }
    }

    try {
      // ── Step 1: Fetch 1-min candles ────────────────────────────────────
      await this.updateCandles(state, kite, ist);

      // ── Step 2: Monitor open positions (trailing SL) ───────────────────
      if (state.positions.length > 0) {
        await this.managePositions(state, kite, strategyId);
        // Don't look for new entries while in a position
        await this.persistLogs(state);
        return;
      }

      // ── Step 3: Check trade limits ─────────────────────────────────────
      if (state.tradesPlacedToday >= state.config.maxTradesPerDay) {
        this.log(state, `⛔ Max ${state.config.maxTradesPerDay} trades reached today`);
        await this.persistLogs(state);
        return;
      }

      // ── Step 4: Calculate signals ──────────────────────────────────────
      const signals = await this.calculateSignals(state, kite);
      this.log(state, `📊 Signals — Velocity:${signals.velocityBreakout} | Premium:${signals.premiumVelocity} | VIX:${signals.vixSpike} | VWAP:${signals.vwapDivergence} | Total:${signals.total}/100 | Dir:${signals.direction ?? '—'}`);

      // ── Step 5: Enter if signal score is high enough ───────────────────
      if (signals.total >= state.config.minSignalScore && signals.direction) {
        this.log(state, `🚀 GAMMA BLAST SIGNAL FIRED! Score: ${signals.total}/100 → Entering ${signals.direction}`);
        await this.enterGammaPosition(strategyId, state, kite, client, account, signals.direction);
      }

    } catch (e) {
      this.log(state, `❌ Tick error: ${e.message}`);
    }

    await this.persistLogs(state);
  }

  // ── Expiry Day Detection ───────────────────────────────────────────────────

  private isExpiryDay(ist: Date, config: GammaBlastConfig): boolean {
    const dayOfWeek = ist.getDay(); // 0=Sun..6=Sat
    const expiryDay = config.expiryDay ?? 2; // default Tuesday

    if (config.expiryMode === 'weekly') {
      // Weekly: every configured day (e.g. every Tuesday for Nifty)
      return dayOfWeek === expiryDay;
    }

    if (config.expiryMode === 'monthly-last') {
      // Monthly last: last occurrence of the configured day in the month
      if (dayOfWeek !== expiryDay) return false;

      // Check if this is the LAST occurrence of this day in the month
      const currentDate = ist.getDate();
      const year = ist.getFullYear();
      const month = ist.getMonth();

      // Get total days in this month
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // If adding 7 more days would exceed the month, this is the last occurrence
      return (currentDate + 7) > daysInMonth;
    }

    return false;
  }

  // ── Candle Updates ─────────────────────────────────────────────────────────

  private async updateCandles(state: StrategyState, kite: any, ist: Date) {
    try {
      const from = new Date(ist); from.setHours(9, 15, 0, 0);
      const to = new Date(ist);

      const symbol = state.futureSymbol || state.config.symbol;
      const exchange = state.futureExchange || state.config.exchange;

      let token = 0;
      const indexTokens: Record<string, number> = { 'NIFTY 50': 256265, 'BANKNIFTY': 260105 };

      const instruments = await kite.getInstruments(exchange);
      const found = instruments.find((i: any) => i.tradingsymbol === symbol);

      if (!found) {
        if (indexTokens[symbol.toUpperCase()]) {
          token = indexTokens[symbol.toUpperCase()];
        } else {
          throw new Error(`Token not found for ${symbol} on ${exchange}`);
        }
      } else {
        token = found.instrument_token;
      }

      const data = await kite.getHistoricalData(token, 'minute', from, to, false);
      state.candles1m = (data || []).map((c: any) => ({
        date: new Date(c.date), open: c.open, high: c.high,
        low: c.low, close: c.close, volume: c.volume,
      }));

      if (state.candles1m.length >= 2) {
        state.vwap = calcVWAP(state.candles1m);
      }
    } catch (e) {
      this.log(state, `⚠ Candle fetch error: ${e.message}`);
    }
  }

  // ── Signal Calculation ─────────────────────────────────────────────────────

  private async calculateSignals(state: StrategyState, kite: any): Promise<SignalScores> {
    const scores: SignalScores = {
      velocityBreakout: 0,
      premiumVelocity: 0,
      vixSpike: 0,
      vwapDivergence: 0,
      total: 0,
      direction: null,
    };

    const candles = state.candles1m;
    if (candles.length < 22) return scores;

    const config = state.config;
    const latestCandle = candles[candles.length - 1];
    const price = latestCandle.close;

    // ── Signal 1: 1-Min Velocity Breakout (40 pts) ───────────────────────
    const atr = calcATR(candles, 20);
    const candleRange = latestCandle.high - latestCandle.low;
    const atrMultiplier = config.atrMultiplier ?? 2.5;

    if (atr > 0 && candleRange > atr * atrMultiplier) {
      scores.velocityBreakout = 40;
      this.log(state, `⚡ VELOCITY BREAKOUT! Candle range: ${candleRange.toFixed(2)} vs ATR×${atrMultiplier}: ${(atr * atrMultiplier).toFixed(2)}`);
    }

    // ── Signal 2: OTM Option Premium Velocity (30 pts) ───────────────────
    try {
      const premiumSignal = await this.checkPremiumVelocity(state, kite, price);
      if (premiumSignal.fired) {
        scores.premiumVelocity = 30;
        scores.direction = premiumSignal.direction;
        this.log(state, `💥 PREMIUM VELOCITY! ${premiumSignal.direction} option ₹${premiumSignal.from?.toFixed(2)} → ₹${premiumSignal.to?.toFixed(2)} in 60s`);
      }
    } catch (e) {
      this.log(state, `⚠ Premium velocity check failed: ${e.message}`);
    }

    // ── Signal 3: India VIX Spike (15 pts) ───────────────────────────────
    try {
      const vixSignal = await this.checkVIXSpike(state, kite);
      if (vixSignal) {
        scores.vixSpike = 15;
        this.log(state, `📈 VIX SPIKE detected!`);
      }
    } catch (e) {
      this.log(state, `⚠ VIX check failed: ${e.message}`);
    }

    // ── Signal 4: VWAP Divergence (15 pts) — also determines direction ───
    if (state.vwap > 0) {
      const divergence = ((price - state.vwap) / state.vwap) * 100;
      const threshold = config.vwapDivergence ?? 0.3;

      if (Math.abs(divergence) >= threshold) {
        scores.vwapDivergence = 15;
        const vwapDir: 'CE' | 'PE' = divergence > 0 ? 'CE' : 'PE';

        // VWAP confirms or sets direction
        if (!scores.direction) {
          scores.direction = vwapDir;
        }
        this.log(state, `📐 VWAP Divergence: ${divergence > 0 ? '+' : ''}${divergence.toFixed(3)}% → ${vwapDir}`);
      }
    }

    // If velocity breakout fired but no direction from premium/VWAP, use candle direction
    if (scores.velocityBreakout > 0 && !scores.direction) {
      scores.direction = latestCandle.close > latestCandle.open ? 'CE' : 'PE';
    }

    scores.total = scores.velocityBreakout + scores.premiumVelocity + scores.vixSpike + scores.vwapDivergence;
    return scores;
  }

  // ── Premium Velocity Check ─────────────────────────────────────────────────

  private async checkPremiumVelocity(
    state: StrategyState, kite: any, spotPrice: number,
  ): Promise<{ fired: boolean; direction: 'CE' | 'PE' | null; from?: number; to?: number }> {
    const config = state.config;
    const underlying = this.resolveUnderlying(config.symbol);
    const step = this.getStrikeStep(config.symbol);
    const isSensex = underlying === 'SENSEX';
    const exchange = isSensex ? 'BFO' : 'NFO';

    // Find cheap OTM CE and PE options
    const atmStrike = Math.round(spotPrice / step) * step;
    const strikesOTM = config.strikesOTM ?? 5;

    const instruments = await kite.getInstruments(exchange);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Get nearest expiry options
    const allOptions = instruments.filter((i: any) =>
      i.name === underlying && (i.instrument_type === 'CE' || i.instrument_type === 'PE') &&
      (isSensex ? i.segment === 'BFO-OPT' : i.segment === 'NFO-OPT')
    );

    const uniqueExpiries = Array.from(new Set(allOptions.map((i: any) => i.expiry)));
    const sortedExpiries = uniqueExpiries
      .map(e => new Date(e as any))
      .filter(e => e >= today)
      .sort((a, b) => a.getTime() - b.getTime());

    if (sortedExpiries.length === 0) return { fired: false, direction: null };
    const nearExpiry = allOptions.find(
      (i: any) => new Date(i.expiry as any).getTime() === sortedExpiries[0].getTime()
    )?.expiry;

    // Find OTM CE (above ATM) and OTM PE (below ATM)
    const ceStrikes: number[] = [];
    const peStrikes: number[] = [];
    for (let i = 1; i <= strikesOTM; i++) {
      ceStrikes.push(atmStrike + i * step);
      peStrikes.push(atmStrike - i * step);
    }

    const ceOptions = ceStrikes.map(strike =>
      allOptions.find((o: any) => o.expiry === nearExpiry && Number(o.strike) === strike && o.instrument_type === 'CE')
    ).filter(Boolean);

    const peOptions = peStrikes.map(strike =>
      allOptions.find((o: any) => o.expiry === nearExpiry && Number(o.strike) === strike && o.instrument_type === 'PE')
    ).filter(Boolean);

    // Fetch LTP for these options
    const optionKeys: string[] = [];
    for (const opt of [...ceOptions, ...peOptions]) {
      if (opt) optionKeys.push(`${exchange}:${opt.tradingsymbol}`);
    }

    if (optionKeys.length === 0) return { fired: false, direction: null };

    const ltpData = await kite.getLTP(optionKeys.slice(0, 20)); // Limit to 20 requests
    const now = Date.now();

    // Update premium history for CE side
    for (const opt of ceOptions) {
      if (!opt) continue;
      const key = `${exchange}:${opt.tradingsymbol}`;
      const ltp = ltpData[key]?.last_price;
      if (ltp && ltp >= (config.minPremium ?? 2) && ltp <= (config.maxPremium ?? 10)) {
        state.cePremiumHistory.push({ ltp, ts: now });
      }
    }

    // Update premium history for PE side
    for (const opt of peOptions) {
      if (!opt) continue;
      const key = `${exchange}:${opt.tradingsymbol}`;
      const ltp = ltpData[key]?.last_price;
      if (ltp && ltp >= (config.minPremium ?? 2) && ltp <= (config.maxPremium ?? 10)) {
        state.pePremiumHistory.push({ ltp, ts: now });
      }
    }

    // Trim old history (keep last 2 minutes)
    const twoMinAgo = now - 120_000;
    state.cePremiumHistory = state.cePremiumHistory.filter(p => p.ts >= twoMinAgo);
    state.pePremiumHistory = state.pePremiumHistory.filter(p => p.ts >= twoMinAgo);

    const velocityX = config.premiumVelocityX ?? 2.0;

    // Check CE velocity
    if (state.cePremiumHistory.length >= 2) {
      const oldest = state.cePremiumHistory[0];
      const newest = state.cePremiumHistory[state.cePremiumHistory.length - 1];
      if (newest.ts - oldest.ts >= 30_000 && newest.ts - oldest.ts <= 120_000) {
        if (newest.ltp >= oldest.ltp * velocityX) {
          return { fired: true, direction: 'CE', from: oldest.ltp, to: newest.ltp };
        }
      }
    }

    // Check PE velocity
    if (state.pePremiumHistory.length >= 2) {
      const oldest = state.pePremiumHistory[0];
      const newest = state.pePremiumHistory[state.pePremiumHistory.length - 1];
      if (newest.ts - oldest.ts >= 30_000 && newest.ts - oldest.ts <= 120_000) {
        if (newest.ltp >= oldest.ltp * velocityX) {
          return { fired: true, direction: 'PE', from: oldest.ltp, to: newest.ltp };
        }
      }
    }

    return { fired: false, direction: null };
  }

  // ── VIX Spike Check ────────────────────────────────────────────────────────

  private async checkVIXSpike(state: StrategyState, kite: any): Promise<boolean> {
    try {
      const INDIA_VIX_TOKEN = 264969;
      const vixLTP = await kite.getLTP([`NSE:INDIA VIX`]);
      const vixValue = vixLTP['NSE:INDIA VIX']?.last_price;
      if (!vixValue) return false;

      const now = Date.now();
      state.vixHistory.push({ value: vixValue, ts: now });

      // Keep last 10 minutes
      const tenMinAgo = now - 600_000;
      state.vixHistory = state.vixHistory.filter(v => v.ts >= tenMinAgo);

      // Check 5-min spike
      const fiveMinAgo = now - 300_000;
      const oldVix = state.vixHistory.find(v => v.ts <= fiveMinAgo + 30_000 && v.ts >= fiveMinAgo - 30_000);
      if (oldVix) {
        const vixChange = ((vixValue - oldVix.value) / oldVix.value) * 100;
        if (vixChange >= (state.config.vixSpikeThreshold ?? 3.0)) {
          this.log(state, `📈 VIX: ${oldVix.value.toFixed(2)} → ${vixValue.toFixed(2)} (+${vixChange.toFixed(1)}%)`);
          return true;
        }
      }
    } catch (e) {
      // VIX data may not always be available
    }
    return false;
  }

  // ── Enter Gamma Position ───────────────────────────────────────────────────

  private async enterGammaPosition(
    strategyId: string, state: StrategyState, kite: any, client: any, account: any,
    direction: 'CE' | 'PE',
  ) {
    try {
      const config = state.config;
      const underlying = this.resolveUnderlying(config.symbol);
      const step = this.getStrikeStep(config.symbol);
      const exchange = underlying === 'SENSEX' ? 'BFO' : 'NFO';

      // Get reference price from future contract
      const futKey = `${state.futureExchange}:${state.futureSymbol}`;
      const futLTP = await kite.getLTP([futKey]);
      const referencePrice = futLTP[futKey]?.last_price || (state.candles1m.length > 0 ? state.candles1m[state.candles1m.length - 1].close : null);
      if (!referencePrice) { this.log(state, `❌ Could not fetch reference price for future: ${futKey}`); return; }

      const atmStrike = Math.round(referencePrice / step) * step;
      const strikesOTM = config.strikesOTM ?? 5;

      // Find the cheapest option in the premium range
      const instruments = await kite.getInstruments(exchange);
      const today = new Date(); today.setHours(0, 0, 0, 0);

      const options = instruments.filter((i: any) =>
        i.name === underlying && i.instrument_type === direction &&
        (exchange === 'BFO' ? i.segment === 'BFO-OPT' : i.segment === 'NFO-OPT')
      );

      const uniqueExpiries = Array.from(new Set(options.map((i: any) => i.expiry)));
      const sortedExpiries = uniqueExpiries
        .map(e => new Date(e as any))
        .filter(e => e >= today)
        .sort((a, b) => a.getTime() - b.getTime());

      if (sortedExpiries.length === 0) { this.log(state, '❌ No expiry dates found'); return; }
      const nearExpiry = options.find(
        (i: any) => new Date(i.expiry as any).getTime() === sortedExpiries[0].getTime()
      )?.expiry;

      // Scan OTM strikes for cheap options
      const candidates: { symbol: string; strike: number; ltp: number }[] = [];

      for (let i = 1; i <= strikesOTM + 3; i++) {
        const strike = direction === 'CE'
          ? atmStrike + i * step
          : atmStrike - i * step;

        const match = options.find((o: any) => o.expiry === nearExpiry && Number(o.strike) === strike);
        if (match) {
          const key = `${exchange}:${match.tradingsymbol}`;
          try {
            const ltp = await kite.getLTP([key]);
            const price = ltp[key]?.last_price;
            if (price && price >= (config.minPremium ?? 2) && price <= (config.maxPremium ?? 10)) {
              candidates.push({ symbol: match.tradingsymbol, strike, ltp: price });
            }
          } catch { /* skip */ }
        }
      }

      if (candidates.length === 0) {
        this.log(state, `❌ No ${direction} options found in premium range ₹${config.minPremium}–₹${config.maxPremium}`);
        return;
      }

      // Pick the cheapest candidate (maximizes gamma leverage)
      candidates.sort((a, b) => a.ltp - b.ltp);
      const pick = candidates[0];

      const lotSize = this.getLotSize(config.symbol);
      const qty = (config.lots ?? 1) * lotSize;
      const entryPx = this.roundTick(pick.ltp);

      this.log(state, `📋 BUY ${direction} | ${pick.symbol} | Strike: ${pick.strike} | LTP: ₹${entryPx} | Qty: ${qty} (${config.lots} lot × ${lotSize})`);

      const params: OrderParams = {
        symbol: pick.symbol,
        exchange,
        side: 'BUY',
        orderType: 'MARKET',
        product: config.product as any ?? 'MIS',
        qty,
        price: 0,
      };

      let orderId: string;
      if (state.isPaperTrade) {
        orderId = `PAPER_GB_${Date.now().toString(36).toUpperCase()}`;
        this.log(state, `📝 PAPER TRADE — simulated order ${orderId}`);
      } else {
        orderId = await client.placeOrder(params);
      }

      // Track position
      const position: GammaPosition = {
        side: direction,
        optionSymbol: pick.symbol,
        entryPrice: entryPx,
        qty,
        orderId,
        highWaterMark: entryPx,
        trailingSL: 0, // No SL initially — let it run
      };
      state.positions.push(position);
      state.tradesPlacedToday++;

      // Track order in DB
      await this.trackOrder(state, account, params, orderId, strategyId);

      this.log(state, `✅ Position opened: ${direction} ${pick.symbol} @ ₹${entryPx} | Trailing SL will activate once premium moves up`);
    } catch (e) {
      this.log(state, `❌ Entry failed: ${e.message}`);
    }
  }

  // ── Manage Positions (Trailing SL) ─────────────────────────────────────────

  private async managePositions(state: StrategyState, kite: any, strategyId: string) {
    const config = state.config;
    const exchange = this.resolveUnderlying(config.symbol) === 'SENSEX' ? 'BFO' : 'NFO';
    const positionsToRemove: number[] = [];

    for (let i = 0; i < state.positions.length; i++) {
      const pos = state.positions[i];

      try {
        const key = `${exchange}:${pos.optionSymbol}`;
        const ltpData = await kite.getLTP([key]);
        const currentPrice = ltpData[key]?.last_price;
        if (!currentPrice) continue;

        // Update high water mark
        if (currentPrice > pos.highWaterMark) {
          pos.highWaterMark = currentPrice;
        }

        // Calculate trailing SL based on tier
        const trailPct = this.getTrailPct(pos.highWaterMark, config);
        pos.trailingSL = this.roundTick(pos.highWaterMark * (1 - trailPct / 100));

        const pnlPerUnit = currentPrice - pos.entryPrice;
        const pnlTotal = pnlPerUnit * pos.qty;

        this.log(state, `👀 ${pos.side} ${pos.optionSymbol}: ₹${currentPrice.toFixed(2)} | HWM: ₹${pos.highWaterMark.toFixed(2)} | Trail SL: ₹${pos.trailingSL.toFixed(2)} | P&L: ${pnlTotal >= 0 ? '+' : ''}₹${pnlTotal.toFixed(0)}`);

        // ── Exit conditions ──────────────────────────────────────────────

        // 1. Trailing SL hit (only if premium has moved up from entry)
        if (pos.highWaterMark > pos.entryPrice * 1.5 && currentPrice <= pos.trailingSL) {
          this.log(state, `🎯 TRAILING SL HIT! Exit at ₹${currentPrice.toFixed(2)} (HWM was ₹${pos.highWaterMark.toFixed(2)})`);
          state.totalPnlToday += pnlTotal;
          positionsToRemove.push(i);
          continue;
        }

        // 2. Absolute stop: premium drops below ₹1 (illiquidity risk)
        if (currentPrice <= 1) {
          this.log(state, `🛑 Premium dropped below ₹1 — exiting to avoid illiquidity`);
          state.totalPnlToday += pnlTotal;
          positionsToRemove.push(i);
          continue;
        }

        // 3. Full loss: premium drops to ₹0.5 or less from entry
        if (currentPrice <= pos.entryPrice * 0.3) {
          this.log(state, `🛑 Premium dropped 70%+ from entry — cutting loss`);
          state.totalPnlToday += pnlTotal;
          positionsToRemove.push(i);
          continue;
        }

      } catch (e) {
        this.log(state, `⚠ Position monitor error: ${e.message}`);
      }
    }

    // Remove exited positions (in reverse to maintain indices)
    for (const idx of positionsToRemove.reverse()) {
      const pos = state.positions[idx];
      this.log(state, `📤 Position closed: ${pos.side} ${pos.optionSymbol} | Entry: ₹${pos.entryPrice.toFixed(2)} | HWM: ₹${pos.highWaterMark.toFixed(2)}`);
      state.positions.splice(idx, 1);
    }
  }

  // ── Force Exit All ─────────────────────────────────────────────────────────

  private async forceExitAll(state: StrategyState, strategyId: string, reason: string) {
    this.log(state, `⏰ Force exiting all positions — Reason: ${reason}`);
    for (const pos of state.positions) {
      const pnl = (pos.highWaterMark - pos.entryPrice) * pos.qty; // Approximate
      state.totalPnlToday += pnl;
      this.log(state, `📤 Force exit: ${pos.side} ${pos.optionSymbol} | Entry: ₹${pos.entryPrice.toFixed(2)} | ~P&L: ₹${pnl.toFixed(0)}`);
    }
    state.positions = [];
    await this.persistLogs(state);
  }

  // ── Trailing SL Tier ───────────────────────────────────────────────────────

  private getTrailPct(hwm: number, config: GammaBlastConfig): number {
    if (hwm >= 100) return config.trailTier4 ?? 20;
    if (hwm >= 50) return config.trailTier3 ?? 25;
    if (hwm >= 15) return config.trailTier2 ?? 30;
    return config.trailTier1 ?? 40;
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  private async resolveFuture(kite: any, symbol: string): Promise<{ symbol: string; exchange: string }> {
    const upper = symbol.toUpperCase().trim();
    const isSensex = upper === 'SENSEX' || upper === 'BSE SENSEX';
    const exchange = isSensex ? 'BFO' : 'NFO';
    const segment = isSensex ? 'BFO-FUT' : 'NFO-FUT';
    const underlying = this.resolveUnderlying(symbol);

    const instruments = await kite.getInstruments(exchange);
    const futures = instruments.filter((i: any) =>
      i.name === underlying && i.instrument_type === 'FUT' && i.segment === segment
    );
    if (futures.length === 0) throw new Error(`No ${exchange} future for ${symbol}`);
    futures.sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    return { symbol: futures[0].tradingsymbol, exchange };
  }

  private resolveUnderlying(symbol: string): string {
    const u = symbol.toUpperCase().trim();
    if (u.includes('BANK') && u.includes('NIFTY')) return 'BANKNIFTY';
    if (u.includes('NIFTY 50') || u === 'NIFTY50' || u === 'NIFTY') return 'NIFTY';
    if (u.includes('SENSEX')) return 'SENSEX';
    return u;
  }

  private getStrikeStep(symbol: string): number {
    const u = symbol.toUpperCase();
    if (u.includes('BANK')) return 100;
    if (u.includes('SENSEX')) return 100;
    return 50; // Nifty 50
  }

  getLotSize(symbol: string): number {
    const u = symbol.toUpperCase();
    if (u.includes('BANK')) return 30;   // BankNifty: 30 (NSE verified Jan 2026)
    if (u.includes('SENSEX')) return 20;
    return 65; // Nifty 50: 65 (NSE verified Jan 2026)
  }

  private roundTick(price: number, tick = 0.05): number {
    return Math.round(price / tick) * tick;
  }

  private applyDefaults(raw: Partial<GammaBlastConfig>): GammaBlastConfig {
    return {
      symbol: raw.symbol ?? 'NIFTY 50',
      exchange: raw.exchange ?? 'NSE',
      expiryMode: raw.expiryMode ?? 'weekly',
      expiryDay: raw.expiryDay ?? 2,
      lots: raw.lots ?? 1,
      minPremium: raw.minPremium ?? 2,
      maxPremium: raw.maxPremium ?? 10,
      strikesOTM: raw.strikesOTM ?? 5,
      atrMultiplier: raw.atrMultiplier ?? 2.5,
      premiumVelocityX: raw.premiumVelocityX ?? 2.0,
      vixSpikeThreshold: raw.vixSpikeThreshold ?? 3.0,
      vwapDivergence: raw.vwapDivergence ?? 0.3,
      minSignalScore: raw.minSignalScore ?? 70,
      trailTier1: raw.trailTier1 ?? 40,
      trailTier2: raw.trailTier2 ?? 30,
      trailTier3: raw.trailTier3 ?? 25,
      trailTier4: raw.trailTier4 ?? 20,
      maxTradesPerDay: raw.maxTradesPerDay ?? 3,
      maxLossPerDay: raw.maxLossPerDay ?? 2000,
      forceExitMinBefore: raw.forceExitMinBefore ?? 15,
      product: raw.product ?? 'MIS',
    };
  }

  private log(state: StrategyState, msg: string) {
    const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const entry = `[${ts}] ${msg}`;
    state.logs.push(entry);
    this.logger.log(`[${state.executionId}] ${msg}`);
  }

  private async persistLogs(state: StrategyState) {
    await this.prisma.strategyExecution.update({
      where: { id: state.executionId },
      data: { logs: JSON.stringify(state.logs.slice(-300)) },
    });
  }

  private resetDay(state: StrategyState) {
    state.positions = [];
    state.tradesPlacedToday = 0;
    state.totalPnlToday = 0;
    state.dayChecked = false;
    state.futureSymbol = null;
    state.futureExchange = 'NFO';
    state.candles1m = [];
    state.atrBuffer = [];
    state.vixHistory = [];
    state.cePremiumHistory = [];
    state.pePremiumHistory = [];
    state.vwap = 0;
  }

  private async trackOrder(state: StrategyState, account: any, params: OrderParams, orderId: string, strategyId: string) {
    try {
      await this.prisma.order.create({
        data: {
          userId: account.userId, brokerAccountId: account.id,
          executionId: state.executionId,
          symbol: params.symbol, exchange: params.exchange,
          side: params.side as any, orderType: params.orderType as any,
          productType: params.product as any, qty: params.qty,
          price: params.price ?? null, triggerPrice: null,
          brokerOrderId: orderId,
          status: state.isPaperTrade ? 'COMPLETE' : 'OPEN',
          isPaperTrade: state.isPaperTrade,
        } as any,
      });
    } catch (e) {
      this.log(state, `⚠ Order tracking failed: ${e.message}`);
    }
  }
}
