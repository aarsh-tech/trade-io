/**
 * Futures OI "short build-up" picks for the Stocks-in-Play OI setup (5 Nov 2026 study).
 *
 * Signal on the previous trading day t (NSE end-of-day files, free from nsearchives.nseindia.com):
 *   - the stock closed >= 3% down (and less than 25% down) vs its previous close (EQ series),
 *   - its total stock-futures open interest (all expiries) rose 5%..80% vs the day before t,
 *   - t was not the stock's near-month expiry day, and it traded >= Rs 25 Cr in the cash market.
 * Ranked by the OI rise; the engine shorts the top pick in the 09:00-09:07 pre-open auction of the next day.
 *
 * Backtest Sep 2024 - Sep 2026 (top 1/day, Rs 500 risk, 1% stop, 3R target, else 15:05):
 *   09:15 auction fill Rs 40.3k / 2y (Y1 21.0k, Y2 19.3k); entered at 09:16 instead only Rs 3.5k, so the auction
 *   price is the edge. A sell limit 5% under yesterday's close (no fill on a bigger gap down) Rs 41.0k.
 */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { isTradingDay } from '../market/market-calendar';

export interface OiPick {
  symbol: string;
  /** Signal day (the trading day before the trade day), YYYY-MM-DD. */
  signalDay: string;
  /** Cash-market close and previous close on the signal day. */
  close: number;
  prevClose: number;
  /** close / prevClose - 1 (negative). */
  priceChg: number;
  /** Total stock-futures OI on the signal day and the day before. */
  oi: number;
  prevOi: number;
  /** oi / prevOi - 1. */
  oiChg: number;
  turnoverCr: number;
}

export const OI_RULES = { minFall: 0.03, maxFall: 0.25, minOiRise: 0.05, maxOiRise: 0.8, minTurnoverCr: 25 };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const ymd = (day: string) => day.replace(/-/g, '');
const dmy = (day: string) => `${day.slice(8, 10)}${day.slice(5, 7)}${day.slice(0, 4)}`;
export const foBhavUrl = (day: string) => `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${ymd(day)}_F_0000.csv.zip`;
export const secBhavUrl = (day: string) => `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${dmy(day)}.csv`;

/** Trading days before `day` (YYYY-MM-DD), newest first, from the exchange calendar. */
export function previousTradingDays(day: string, count: number): string[] {
  const out: string[] = [];
  const base = new Date(`${day}T12:00:00+05:30`).getTime();
  for (let k = 1; k <= 20 && out.length < count; k++) {
    const d = new Date(base - k * 86_400_000);
    if (isTradingDay(d)) out.push(new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10));
  }
  return out;
}

/** The single file inside a zip archive (NSE's bhavcopy zips hold one CSV). */
export function unzipSingle(buf: Buffer): Buffer {
  // End of central directory record: signature 0x06054b50 within the last 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const cd = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('bad zip central directory');
  const method = buf.readUInt16LE(cd + 10);
  const compSize = buf.readUInt32LE(cd + 20);
  const local = buf.readUInt32LE(cd + 42);
  if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('bad zip local header');
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + compSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return zlib.inflateRawSync(data);
  throw new Error(`unsupported zip compression ${method}`);
}

/** Per stock: total stock-futures OI over every expiry and the nearest expiry date (UDiFF F&O bhavcopy). */
export function parseFoBhavcopy(csv: string): Map<string, { oi: number; nearExpiry: string }> {
  const lines = csv.split(/\r?\n/);
  const h = lines[0].split(',').map((s) => s.trim());
  const iT = h.indexOf('FinInstrmTp'), iS = h.indexOf('TckrSymb'), iX = h.indexOf('XpryDt'), iOI = h.indexOf('OpnIntrst');
  if ([iT, iS, iX, iOI].some((i) => i < 0)) throw new Error('unexpected F&O bhavcopy columns');
  const out = new Map<string, { oi: number; nearExpiry: string }>();
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    if (c.length < 10 || c[iT].trim() !== 'STF') continue;
    const sym = c[iS].trim();
    const oi = Number(c[iOI]);
    const x = c[iX].trim();
    const d = out.get(sym);
    if (!d) out.set(sym, { oi: Number.isFinite(oi) ? oi : 0, nearExpiry: x });
    else {
      d.oi += Number.isFinite(oi) ? oi : 0;
      if (x < d.nearExpiry) d.nearExpiry = x;
    }
  }
  return out;
}

/** Per EQ-series stock: close, previous close and traded value (₹ Cr) from sec_bhavdata_full. */
export function parseSecBhav(csv: string): Map<string, { close: number; prevClose: number; turnoverCr: number }> {
  const lines = csv.split(/\r?\n/);
  const h = lines[0].split(',').map((s) => s.trim());
  const iS = h.indexOf('SYMBOL'), iSer = h.indexOf('SERIES'), iPc = h.indexOf('PREV_CLOSE'), iC = h.indexOf('CLOSE_PRICE'), iT = h.indexOf('TURNOVER_LACS');
  if ([iS, iSer, iPc, iC, iT].some((i) => i < 0)) throw new Error('unexpected security bhavcopy columns');
  const out = new Map<string, { close: number; prevClose: number; turnoverCr: number }>();
  for (const line of lines.slice(1)) {
    const c = line.split(',').map((s) => s.trim());
    if (c.length <= iT || c[iSer] !== 'EQ') continue;
    out.set(c[iS], { close: Number(c[iC]), prevClose: Number(c[iPc]), turnoverCr: Number(c[iT]) / 100 });
  }
  return out;
}

/** The short build-up picks of signal day `signalDay`, highest OI rise first. */
export function buildOiPicks(
  signalDay: string,
  fo: Map<string, { oi: number; nearExpiry: string }>,
  foPrev: Map<string, { oi: number; nearExpiry: string }>,
  sec: Map<string, { close: number; prevClose: number; turnoverCr: number }>,
): OiPick[] {
  const picks: OiPick[] = [];
  for (const [symbol, f] of fo) {
    const p = foPrev.get(symbol);
    const s = sec.get(symbol);
    if (!p || !(p.oi > 0) || !s || !(s.prevClose > 0) || !(s.close > 0)) continue;
    if (f.nearExpiry === signalDay) continue; // expiry day: the roll distorts the OI change
    if (!(s.turnoverCr >= OI_RULES.minTurnoverCr)) continue;
    const priceChg = s.close / s.prevClose - 1;
    const oiChg = f.oi / p.oi - 1;
    if (!(priceChg <= -OI_RULES.minFall && priceChg > -OI_RULES.maxFall)) continue;
    if (!(oiChg >= OI_RULES.minOiRise && oiChg <= OI_RULES.maxOiRise)) continue;
    picks.push({ symbol, signalDay, close: s.close, prevClose: s.prevClose, priceChg, oi: f.oi, prevOi: p.oi, oiChg, turnoverCr: s.turnoverCr });
  }
  return picks.sort((a, b) => b.oiChg - a.oiChg);
}

async function download(url: string): Promise<Buffer> {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30_000, headers: { 'User-Agent': UA, Accept: '*/*' }, validateStatus: (s) => s === 200 });
  return Buffer.from(res.data);
}

const cacheFile = (tradeDay: string) => path.join(process.cwd(), 'logs', 'stocks-in-play', `oi-picks-${tradeDay}.json`);

/**
 * Picks for trade day `tradeDay` (YYYY-MM-DD), from the previous trading day's NSE files (cached on disk per day).
 * Throws when a file cannot be read: the caller retries, and never falls back to an older signal day.
 */
export async function loadOiPicks(tradeDay: string): Promise<{ signalDay: string; picks: OiPick[] }> {
  const file = cacheFile(tradeDay);
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cached?.signalDay && Array.isArray(cached.picks)) return cached;
  } catch { /* not cached yet */ }

  const [t, ...older] = previousTradingDays(tradeDay, 5);
  if (!t) throw new Error('no previous trading day in the calendar');
  const fo = parseFoBhavcopy(unzipSingle(await download(foBhavUrl(t))).toString('utf8'));
  const sec = parseSecBhav((await download(secBhavUrl(t))).toString('utf8'));
  // The day before t: the calendar may list an unannounced holiday, so try a few days back for its file.
  let foPrev: Map<string, { oi: number; nearExpiry: string }> | null = null;
  for (const p of older) {
    try {
      foPrev = parseFoBhavcopy(unzipSingle(await download(foBhavUrl(p))).toString('utf8'));
      break;
    } catch { /* try the next older day */ }
  }
  if (!foPrev) throw new Error(`no F&O bhavcopy found for the trading day before ${t}`);
  const out = { signalDay: t, picks: buildOiPicks(t, fo, foPrev, sec) };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out));
  } catch { /* cache is optional */ }
  return out;
}
