// Packs backtest/data/5minute/*.json into one day x slot aligned Float32 cache for the EMA-VWAP pipeline simulator.
// Layout: field[stock][day*75 + slot], slot 0 = 09:15 IST ... 74 = 15:25 IST. Missing bars are NaN.
// Fields: o h l c v ema15 vwap(close) — EMA/VWAP are computed on each stock's own continuous bars, like the engine.
// Usage: node sim/prep.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data', '5minute');
const OUT = path.join(__dirname, 'cache');
const SLOTS = 75;
const FIELDS = ['o', 'h', 'l', 'c', 'v', 'ema', 'vwap'];

const isIndex = (s) => /NIFTY|INDIA_VIX|SENSEX|FUT$/.test(s);
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.json'));
const stocks = files.map((f) => f.replace('.json', '')).filter((s) => !isIndex(s)).sort();

const istParts = (iso) => {
  const t = new Date(iso).getTime() + 330 * 60000;
  const d = new Date(t);
  return { day: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
};

// Calendar = NIFTY 50's trading days.
const nifty = JSON.parse(fs.readFileSync(path.join(SRC, 'NIFTY_50.json'), 'utf8'));
const daySet = new Set();
for (const b of nifty) daySet.add(istParts(b.date).day);
const days = Array.from(daySet).sort();
const dayIdx = new Map(days.map((d, i) => [d, i]));
const N = days.length * SLOTS;
console.log(`days ${days.length} (${days[0]} .. ${days[days.length - 1]}), stocks ${stocks.length}, cells/stock ${N}`);

fs.mkdirSync(OUT, { recursive: true });
const fds = Object.fromEntries(FIELDS.map((f) => [f, fs.openSync(path.join(OUT, `${f}.f32`), 'w')]));

// NIFTY 50 aligned close (market filter studies).
{
  const nc = new Float32Array(N).fill(NaN), no = new Float32Array(N).fill(NaN);
  for (const b of nifty) { const p = istParts(b.date); const s = (p.min - 555) / 5; const di = dayIdx.get(p.day); if (s >= 0 && s < SLOTS && di !== undefined) { nc[di * SLOTS + s] = b.close; no[di * SLOTS + s] = b.open; } }
  fs.writeFileSync(path.join(OUT, 'nifty_c.f32'), Buffer.from(nc.buffer));
  fs.writeFileSync(path.join(OUT, 'nifty_o.f32'), Buffer.from(no.buffer));
}

const kept = [];
for (const sym of stocks) {
  const raw = JSON.parse(fs.readFileSync(path.join(SRC, `${sym}.json`), 'utf8'));
  if (!Array.isArray(raw) || raw.length < 2000) continue;
  const cols = Object.fromEntries(FIELDS.map((f) => [f, new Float32Array(N).fill(NaN)]));
  // EMA15 seeded with SMA of the first 15 closes; VWAP(close) reset each IST day.
  const mult = 2 / 16;
  let ema = null, sum = 0, cnt = 0, cpv = 0, cv = 0, lastDay = '';
  for (const b of raw) {
    const p = istParts(b.date);
    cnt++;
    if (ema === null) { sum += b.close; if (cnt === 15) ema = sum / 15; } else ema = (b.close - ema) * mult + ema;
    if (p.day !== lastDay) { cpv = 0; cv = 0; lastDay = p.day; }
    cpv += b.close * b.volume; cv += b.volume;
    const vwap = cv === 0 ? b.close : cpv / cv;
    const s = (p.min - 555) / 5;
    const di = dayIdx.get(p.day);
    if (di === undefined || s < 0 || s >= SLOTS || s !== Math.floor(s)) continue;
    const k = di * SLOTS + s;
    cols.o[k] = b.open; cols.h[k] = b.high; cols.l[k] = b.low; cols.c[k] = b.close; cols.v[k] = b.volume;
    cols.ema[k] = ema === null ? NaN : ema; cols.vwap[k] = vwap;
  }
  for (const f of FIELDS) fs.writeSync(fds[f], Buffer.from(cols[f].buffer));
  kept.push(sym);
  if (kept.length % 50 === 0) console.log(`  ${kept.length} packed`);
}
for (const f of FIELDS) fs.closeSync(fds[f]);
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ days, stocks: kept, slots: SLOTS, fields: FIELDS }));
console.log(`done: ${kept.length} stocks`);
