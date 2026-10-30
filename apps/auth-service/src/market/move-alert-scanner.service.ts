import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { getSharedInstruments } from '../brokers/instrument-store';
import { sendAlert } from '../common/utils/alert';
import { NIFTY_500_UNIVERSE } from './market.constants';
import { isTradingDay, istParts } from './market-calendar';

/**
 * Move alerts: watches the NIFTY 500 + F&O universe for the moves the engines do not trade and tells you,
 * so you can decide by hand. It places no orders.
 *
 * - OPEN_DRIVE: the stock is down >= 2% from today's open (and again at >= 4%), has never traded above the open
 *   (+0.3%), and is below the day's VWAP. A sell-off that started at the open and has not been bought back.
 *   Backtest (2024-09..2026-09): too unstable to automate (30 Oct 2026 study), good enough to watch.
 * - RANGE_BREAK: the previous 5 sessions sat inside a <= 5% range and price now trades through its low (BREAKDOWN)
 *   or its high (BREAKOUT) while today's volume runs >= 1.5x the pace of the stock's usual daily volume.
 *
 * Needs a connected Zerodha account (quotes + daily history). One alert per stock, type and level a day.
 * Delivery: log, GET /market/move-alerts, and one message per scan to the configured alert channels
 * (webhook / Telegram, common/utils/alert.ts).
 */

export type MoveAlertType = 'OPEN_DRIVE' | 'BREAKDOWN' | 'BREAKOUT';

export interface MoveAlert {
  id: string;
  time: string; // ISO
  hhmm: string; // IST
  symbol: string;
  type: MoveAlertType;
  /** OPEN_DRIVE: the drop threshold crossed (2 or 4); others 0. */
  level: number;
  ltp: number;
  open: number;
  prevClose: number;
  changePct: number;
  fromOpenPct: number;
  /** Today's volume vs the usual pace, x. */
  volPace: number;
  /** Reference stop: the day's high for a short (OPEN_DRIVE / BREAKDOWN), the day's low for a BREAKOUT. */
  stopRef: number;
  text: string;
}

interface RangeInfo {
  hi: number;
  lo: number;
  avgVol: number;
  prevClose: number;
}

const POLL_MS = 30_000;
const FIRST_ALERT_MINUTE = 9 * 60 + 20;
const LAST_ALERT_MINUTE = 15 * 60;
const OPEN_DRIVE_LEVELS = [2, 4];
const OPEN_RECLAIM_PCT = 0.3;
const MAX_RANGE_PCT = 5;
const RANGE_SESSIONS = 5;
const MIN_PRICE = 50;
const MIN_AVG_VALUE_CR = 10;
const MIN_VOL_PACE = 1.5;
const MAX_ALERTS_PER_DAY = 80;
const MAX_LINES_PER_MESSAGE = 12;

@Injectable()
export class MoveAlertScannerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MoveAlertScannerService.name);
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private day = '';
  private alerts: MoveAlert[] = [];
  private seen = new Set<string>();
  /** Short lines for this scan's new alerts, sent together by flush(). */
  private pending: string[] = [];
  private ranges: Map<string, RangeInfo> | null = null;
  private rangesLoading = false;
  private lastError = 0;
  private status = 'idle';
  private updatedAt = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), POLL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  getAlerts() {
    this.rollDay();
    return { day: this.day, status: this.status, updatedAt: this.updatedAt, alerts: [...this.alerts].reverse() };
  }

  private dir() {
    return path.join(process.cwd(), 'logs', 'move-alerts');
  }

  /** Starts a fresh day: restores that day's alerts after a restart, drops the old ranges. */
  private rollDay() {
    const today = istParts().date;
    if (this.day === today) return;
    this.day = today;
    this.alerts = [];
    this.seen = new Set();
    this.ranges = null;
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(this.dir(), `alerts-${today}.json`), 'utf8')) as MoveAlert[];
      this.alerts = saved;
      for (const a of saved) this.seen.add(`${a.symbol}|${a.type}|${a.level}`);
    } catch { /* none yet */ }
  }

  private persist() {
    try {
      fs.mkdirSync(this.dir(), { recursive: true });
      fs.writeFileSync(path.join(this.dir(), `alerts-${this.day}.json`), JSON.stringify(this.alerts));
    } catch (e: any) {
      this.logger.warn(`Could not save move alerts: ${e?.message || e}`);
    }
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      this.rollDay();
      const now = istParts();
      if (!isTradingDay()) { this.status = 'market closed'; return; }
      // Ranges are prepared from 08:45 so the first alert at 09:20 is not waiting on history.
      if (now.minute < 8 * 60 + 45 || now.minute > LAST_ALERT_MINUTE + 5) { this.status = 'outside hours'; return; }

      const account = await this.prisma.brokerAccount.findFirst({
        where: { isActive: true, accessToken: { not: null } },
        orderBy: { updatedAt: 'desc' },
      });
      if (!account?.accessToken) { this.status = 'no connected broker account'; return; }
      const client: any = this.factory.createClient(account);
      const kite = client['kite'] || client;

      if (!this.ranges) {
        if (!this.rangesLoading) void this.loadRanges(client, kite);
        this.status = 'preparing 5-day ranges';
        return;
      }
      if (now.minute < FIRST_ALERT_MINUTE || now.minute > LAST_ALERT_MINUTE) { this.status = 'waiting for 09:20'; return; }

      const symbols = Array.from(this.ranges.keys());
      const quotes: Record<string, any> = {};
      for (let i = 0; i < symbols.length; i += 500) {
        Object.assign(quotes, await kite.getQuote(symbols.slice(i, i + 500).map((s) => `NSE:${s}`)));
      }
      this.evaluate(quotes, now.minute);
      this.flush();
      this.status = 'scanning';
      this.updatedAt = new Date().toISOString();
    } catch (e: any) {
      this.status = 'error';
      if (Date.now() - this.lastError > 10 * 60_000) {
        this.lastError = Date.now();
        this.logger.warn(`Move alert scan failed: ${e?.message || e}`);
      }
    } finally {
      this.busy = false;
    }
  }

  private evaluate(quotes: Record<string, any>, minute: number) {
    if (!this.ranges) return;
    const elapsed = Math.max(1, minute - (9 * 60 + 15));
    const paceShare = Math.max(0.05, Math.min(1, elapsed / 375));
    for (const [sym, r] of this.ranges) {
      if (this.alerts.length >= MAX_ALERTS_PER_DAY) return;
      const q = quotes[`NSE:${sym}`];
      const ltp = Number(q?.last_price), open = Number(q?.ohlc?.open), high = Number(q?.ohlc?.high), low = Number(q?.ohlc?.low);
      if (!(ltp > 0) || !(open > 0) || !(high > 0)) continue;
      const vwap = Number(q?.average_price) || 0;
      const volPace = r.avgVol > 0 ? Number(q?.volume || 0) / (r.avgVol * paceShare) : 0;
      const fromOpen = (ltp / open - 1) * 100;
      const chg = (ltp / r.prevClose - 1) * 100;

      if (high <= open * (1 + OPEN_RECLAIM_PCT / 100) && (vwap === 0 || ltp < vwap)) {
        for (const level of OPEN_DRIVE_LEVELS) {
          if (fromOpen <= -level) {
            this.raise(sym, 'OPEN_DRIVE', level, { ltp, open, prev: r.prevClose, fromOpen, chg, volPace, stopRef: high },
              `${sym} ₹${ltp} is ${Math.abs(fromOpen).toFixed(1)}% below its open ₹${open} and has not traded above it (day high ₹${high}), under VWAP${vwap ? ` ₹${vwap.toFixed(2)}` : ''}.`);
          }
        }
      }

      const rangePct = (r.hi / r.lo - 1) * 100;
      if (rangePct <= MAX_RANGE_PCT && volPace >= MIN_VOL_PACE) {
        if (ltp < r.lo * 0.999) {
          this.raise(sym, 'BREAKDOWN', 0, { ltp, open, prev: r.prevClose, fromOpen, chg, volPace, stopRef: high },
            `${sym} ₹${ltp} broke below its ${RANGE_SESSIONS}-day range low ₹${r.lo} (range ${rangePct.toFixed(1)}%), volume ${volPace.toFixed(1)}x the usual pace.`);
        } else if (ltp > r.hi * 1.001) {
          this.raise(sym, 'BREAKOUT', 0, { ltp, open, prev: r.prevClose, fromOpen, chg, volPace, stopRef: low },
            `${sym} ₹${ltp} broke above its ${RANGE_SESSIONS}-day range high ₹${r.hi} (range ${rangePct.toFixed(1)}%), volume ${volPace.toFixed(1)}x the usual pace.`);
        }
      }
    }
  }

  private raise(
    symbol: string, type: MoveAlertType, level: number,
    m: { ltp: number; open: number; prev: number; fromOpen: number; chg: number; volPace: number; stopRef: number },
    detail: string,
  ) {
    const key = `${symbol}|${type}|${level}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const label = type === 'OPEN_DRIVE' ? `📉 OPEN-DRIVE DOWN ${level}%` : type === 'BREAKDOWN' ? '📉 RANGE BREAKDOWN' : '📈 RANGE BREAKOUT';
    const side = type === 'BREAKOUT' ? 'long' : 'short';
    const now = new Date();
    const hhmm = new Date(now.getTime() + 330 * 60_000).toISOString().slice(11, 16);
    const text = `${label} — ${detail} Day ${type === 'BREAKOUT' ? 'low' : 'high'} ₹${m.stopRef} is the ${side} stop reference. Manual trade only.`;
    const alert: MoveAlert = {
      id: `${this.day}-${this.alerts.length + 1}`, time: now.toISOString(), hhmm, symbol, type, level,
      ltp: m.ltp, open: m.open, prevClose: m.prev,
      changePct: Number(m.chg.toFixed(2)), fromOpenPct: Number(m.fromOpen.toFixed(2)), volPace: Number(m.volPace.toFixed(1)),
      stopRef: m.stopRef, text,
    };
    this.alerts.push(alert);
    this.persist();
    this.logger.log(`[${hhmm}] ${text}`);
    const move = type === 'OPEN_DRIVE'
      ? `${Math.abs(m.fromOpen).toFixed(1)}% below open, never back above it`
      : `${type === 'BREAKDOWN' ? 'broke 5-day range low' : 'broke 5-day range high'}, volume ${m.volPace.toFixed(1)}x`;
    this.pending.push(`${type === 'BREAKOUT' ? '📈' : '📉'} ${symbol} ₹${m.ltp}: ${move} (stop ref ₹${m.stopRef})`);
  }

  /** One message per scan, so a burst of alerts at 09:20 arrives as one notification, not dozens. */
  private flush() {
    if (this.pending.length === 0) return;
    const lines = this.pending.splice(0);
    const hhmm = new Date(Date.now() + 330 * 60_000).toISOString().slice(11, 16);
    const shown = lines.slice(0, MAX_LINES_PER_MESSAGE);
    const more = lines.length - shown.length;
    void sendAlert([`Move Alerts ${hhmm} (manual trades only)`, ...shown, ...(more > 0 ? [`+${more} more on the Move Alerts page`] : [])].join('\n'));
  }

  /** Previous 5 sessions' range, 10-session average volume and traded value, from daily candles; cached per day. */
  private async loadRanges(client: any, kite: any) {
    this.rangesLoading = true;
    const day = this.day;
    const file = path.join(this.dir(), `ranges-${day}.json`);
    try {
      try {
        const cached = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, RangeInfo>;
        if (Object.keys(cached).length > 0) { this.ranges = new Map(Object.entries(cached)); this.logger.log(`Move alerts: loaded ${this.ranges.size} ranges from cache.`); return; }
      } catch { /* build it */ }

      const nse = await getSharedInstruments(kite, 'NSE');
      const nfo = await getSharedInstruments(kite, 'NFO').catch(() => [] as any[]);
      const eq = new Set<string>();
      for (const i of nse) if ((i as any).instrument_type === 'EQ' && (i as any).exchange === 'NSE') eq.add((i as any).tradingsymbol);
      const universe = new Set<string>(NIFTY_500_UNIVERSE.filter((s) => eq.has(s)));
      for (const i of nfo) { const n = String((i as any).name || '').toUpperCase(); if (eq.has(n)) universe.add(n); }
      const symbols = Array.from(universe);
      this.logger.log(`Move alerts: loading daily history for ${symbols.length} stocks (~${Math.ceil(symbols.length / 3 / 60)} min)...`);

      const to = new Date();
      const from = new Date(to.getTime() - 30 * 86400_000);
      const out = new Map<string, RangeInfo>();
      for (let i = 0; i < symbols.length; i += 3) {
        if (this.day !== day) return;
        await Promise.all(symbols.slice(i, i + 3).map(async (sym) => {
          try {
            const raw: any[] = await client.getHistoricalData(sym, 'NSE', 'day', from, to);
            // Completed sessions only: today's partial candle is excluded.
            const bars = raw.filter((b) => istParts(new Date(b.date)).date < day).slice(-10);
            if (bars.length < RANGE_SESSIONS + 3) return;
            const last = bars[bars.length - 1];
            const rng = bars.slice(-RANGE_SESSIONS);
            const avgVal = bars.reduce((a, b) => a + b.close * b.volume, 0) / bars.length / 1e7;
            if (last.close < MIN_PRICE || avgVal < MIN_AVG_VALUE_CR) return;
            out.set(sym, {
              hi: Math.max(...rng.map((b) => b.high)),
              lo: Math.min(...rng.map((b) => b.low)),
              avgVol: bars.reduce((a, b) => a + b.volume, 0) / bars.length,
              prevClose: last.close,
            });
          } catch { /* skipped today */ }
        }));
      }
      if (out.size > 0 && this.day === day) {
        this.ranges = out;
        try {
          fs.mkdirSync(this.dir(), { recursive: true });
          fs.writeFileSync(file, JSON.stringify(Object.fromEntries(out)));
        } catch { /* cache is optional */ }
        this.logger.log(`Move alerts: ${out.size} liquid stocks ready.`);
      }
    } catch (e: any) {
      this.logger.warn(`Move alerts: could not load ranges: ${e?.message || e}`);
    } finally {
      this.rangesLoading = false;
    }
  }
}
