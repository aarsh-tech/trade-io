// Volume-confirmation + exit-rule study for the 15-EMA/VWAP fresh-crossover setup (engine setup 'DIRECT').
// Real Kite 5m history in backtest/data/5minute. Signal-quality only (no costs), same SL formula as emavwap-core.js.
// Usage: node strategies/emavwap-volume-study.js [minPrice=100]
const fs = require('fs'); const path = require('path'); const c = require('../lib/core');
const minPrice = +(process.argv[2] || 100);
const dir = path.join(__dirname, '..', 'data', '5minute');
const syms = fs.readdirSync(dir).map((f) => f.replace('.json', '')).filter((s) => !/NIFTY|BANK|FIN|SENSEX|MIDCP|INDIA ?VIX/i.test(s));
const rows = [];
const part = +(process.argv[3] || 0), parts = +(process.argv[4] || 1);
if (process.env.MERGE) for (const f of process.env.MERGE.split(',')) rows.push(...JSON.parse(fs.readFileSync(f, 'utf8')));
for (const sym of (process.env.MERGE ? [] : syms.filter((_, k) => k % parts === part))) {
  const cs = c.load('5minute', sym); if (!cs || cs.length < 500) continue;
  if (cs[cs.length - 1].c < minPrice) continue;
  const em = c.ema(cs, 15), vw = c.vwap(cs, 'close');
  // volume lookup by day/slot for time-of-day RVOL
  const days = []; const dayIdx = new Map(); const slotVol = []; // slotVol[dayNo] = Map(m -> v)
  for (let i = 0; i < cs.length; i++) { if (!dayIdx.has(cs[i].d)) { dayIdx.set(cs[i].d, days.length); days.push(cs[i].d); slotVol.push(new Map()); } slotVol[dayIdx.get(cs[i].d)].set(cs[i].m, cs[i].v); }
  const rvolTod = (i, nPrev = 3) => { const dn = dayIdx.get(cs[i].d); let s = 0, n = 0; for (let k = 1; k <= nPrev + 2 && n < nPrev; k++) { const dd = dn - k; if (dd < 0) break; const v = slotVol[dd].get(cs[i].m); if (v > 0) { s += v; n++; } } return n >= 2 ? cs[i].v / (s / n) : null; };
  // per-stock, same-clock-time history (up to 10 prior sessions): rvol10, z-score of ln(volume), percentile rank
  const hist10 = (i) => { const dn = dayIdx.get(cs[i].d); const a = []; for (let k = 1; k <= 14 && a.length < 10; k++) { const dd = dn - k; if (dd < 0) break; const v = slotVol[dd].get(cs[i].m); if (v > 0) a.push(v); } if (a.length < 6 || !(cs[i].v > 0)) return null; const mean = a.reduce((x, y) => x + y, 0) / a.length; const ls = a.map(Math.log); const lm = ls.reduce((x, y) => x + y, 0) / ls.length; const sd = Math.sqrt(ls.reduce((x, y) => x + (y - lm) ** 2, 0) / (ls.length - 1)) || 0.01; return { rv10: cs[i].v / mean, z10: (Math.log(cs[i].v) - lm) / sd, p10: a.filter((x) => x < cs[i].v).length / a.length, cv: sd }; };
  const rvolTrail = (i) => { let s = 0, n = 0; for (let k = i - 1; k >= 0 && cs[k].d === cs[i].d && n < 10; k--) { s += cs[k].v; n++; } return n >= 3 ? cs[i].v / (s / n) : null; };
  let curDay = '', latest = null, ci = -1, done = false;
  for (let i = 1; i < cs.length - 1; i++) {
    const cur = cs[i];
    if (cur.d !== curDay) { curDay = cur.d; latest = null; ci = -1; done = false; }
    if (cs[i - 1].d === cur.d && em[i - 1] !== null && vw[i - 1] !== null && em[i] !== null) {
      const pe = em[i - 1], ce = em[i], pv = vw[i - 1], cv = vw[i];
      if (pe <= pv && ce > cv && cur.c >= cv && cur.c >= ce && cur.c >= cur.o) { latest = 'LONG'; ci = i; }
      else if (pe >= pv && ce < cv && cur.c <= cv && cur.c <= ce && cur.c <= cur.o) { latest = 'SHORT'; ci = i; }
    }
    if (done || !latest || i - ci > 2) continue;
    if (cur.m < 560 || cur.m + 5 >= 14 * 60 + 30) continue;
    const ce = em[i], cv = vw[i]; if (ce === null) continue;
    const valid = latest === 'LONG' ? (ce > cv && cur.c >= cv * 0.998) : (ce < cv && cur.c <= cv * 1.002);
    if (!valid) continue;
    const long = latest === 'LONG'; const cc = cs[ci];
    // structural SL (same as engine getSwingShelfSl / emavwap-core)
    let dl = Infinity, dh = -Infinity; for (let k = i; k >= 0 && cs[k].d === cur.d; k--) { dl = Math.min(dl, cs[k].l); dh = Math.max(dh, cs[k].h); }
    let sLow = Infinity, sHigh = -Infinity; for (let k = i, n = 0; k >= 0 && n < 6; k--, n++) { sLow = Math.min(sLow, cs[k].l); sHigh = Math.max(sHigh, cs[k].h); }
    let acr = 0, an = 0; for (let k = i; k >= 0 && an < 10; k--, an++) acr += (cs[k].h - cs[k].l) / cs[k].c * 100; acr /= an;
    const vb = Math.max(cur.c * 0.0002, cur.c * (acr * 0.01 * 0.35)); const minD = cur.c * 0.0085, maxD = cur.c * 0.022;
    const trig = long ? cc.h : cc.l; let slD;
    if (long) { const a = (cur.c - dl) <= maxD ? Math.min(dl, sLow, cc.l) : Math.min(sLow, cc.l); slD = Math.min(maxD, Math.max(minD, cur.c - (a - vb))); }
    else { const a = (dh - cur.c) <= maxD ? Math.max(dh, sHigh, cc.h) : Math.max(sHigh, cc.h); slD = Math.min(maxD, Math.max(minD, a + vb - cur.c)); }
    // entry
    const exp = cc.t + 10 * 60e3; let entry = null, ei = -1;
    for (let j = i + 1; j < cs.length && cs[j].d === cur.d; j++) { const b = cs[j]; if (b.t >= exp && j > i + 1) break;
      if (long ? b.l < trig - slD : b.h > trig + slD) { if (!(long ? b.h >= trig : b.l <= trig)) break; }
      if (long ? b.h >= trig : b.l <= trig) { entry = long ? Math.max(trig, b.o) : Math.min(trig, b.o); if (long ? b.o >= trig : b.o <= trig) entry = b.o; ei = j; break; } }
    if (ei < 0) continue; done = true;
    const R = slD, sl = long ? entry - R : entry + R, r2t = long ? entry + 2 * R : entry - 2 * R;
    // exit A: candle-close beyond 15-EMA (hard structural SL, EOD 15:05); exit B: fixed 2R; exit C: 15-EMA candle exit but SL breakeven after +1R
    let rA = null, rB = null, rD = null, rE = null, slE = sl;
    for (let j = ei; j < cs.length && cs[j].d === cur.d; j++) { const b = cs[j];
      if (b.m >= 905) { const r = (long ? b.o - entry : entry - b.o) / R; if (rA === null) rA = r; if (rB === null) rB = r; if (rD === null) rD = r; if (rE === null) rE = r; break; }
      // D = current-engine style: tick-touch exit at max(EMA,VWAP) (long) / min (short) of previous closed bar once that line is in profit; else hard SL
      if (rD === null) { const sup = long ? Math.max(em[j - 1], vw[j - 1]) : Math.min(em[j - 1], vw[j - 1]); const inProfit = long ? sup > entry : sup < entry;
        const hSl = long ? b.l <= sl : b.h >= sl; const hSup = inProfit && (long ? b.l <= sup : b.h >= sup);
        if (hSl && !(hSup && (long ? sup > sl : sup < sl))) rD = -1; else if (hSup) rD = (long ? Math.min(b.o, sup) - entry : entry - Math.max(b.o, sup)) / R; }
      // E = A + move SL to break-even after +1R (checked on bar highs/lows, conservative: BE takes effect from next bar)
      if (rE === null) { if (long ? b.l <= slE : b.h >= slE) rE = slE === sl ? -1 : 0; else if (em[j] !== null && (long ? b.c < em[j] : b.c > em[j])) rE = (long ? b.c - entry : entry - b.c) / R; else if (long ? b.h >= entry + R : b.l <= entry - R) slE = entry; }
      const hitSl = long ? b.l <= sl : b.h >= sl;
      if (hitSl) { if (rA === null) rA = -1; if (rB === null) rB = -1; }
      if (rB === null && (long ? b.h >= r2t : b.l <= r2t)) rB = 2;
      if (rA === null && em[j] !== null && (long ? b.c < em[j] : b.c > em[j])) rA = (long ? b.c - entry : entry - b.c) / R;
      if (rA !== null && rB !== null && rD !== null && rE !== null) break; }
    let li = ei; while (li + 1 < cs.length && cs[li + 1].d === cur.d) li++; const last = cs[li]; const eod = (long ? last.c - entry : entry - last.c) / R; if (rA === null) rA = eod; if (rB === null) rB = eod; if (rD === null) rD = eod; if (rE === null) rE = eod;
    rows.push({ sym, d: cur.d, long, m: cur.m, R: R / entry * 100, rvT: rvolTod(ci), h: hist10(ci), rvT2: rvolTod(i), rvR: rvolTrail(ci), rvR2: rvolTrail(i), vPrev: cs[ci - 1].v > 0 ? cc.v / cs[ci - 1].v : null, rA, rB, rD, rE });
  }
}
if (process.argv[5]) { fs.writeFileSync(process.argv[5], JSON.stringify(rows)); process.exit(0); }
rows.sort((a, b) => a.d < b.d ? -1 : 1);
const mid = rows[Math.floor(rows.length / 2)].d;
const mean = (a, k) => a.length ? a.reduce((s, x) => s + x[k], 0) / a.length : NaN;
const win = (a, k) => a.length ? a.filter((x) => x[k] > 0).length / a.length * 100 : NaN;
const ci95 = (a, k) => { if (a.length < 3) return NaN; const m = mean(a, k); const sd = Math.sqrt(a.reduce((s, x) => s + (x[k] - m) ** 2, 0) / (a.length - 1)); return 1.96 * sd / Math.sqrt(a.length); };
const f = (x, d = 3) => Number.isFinite(x) ? x.toFixed(d) : ' n/a ';
console.log(`symbols>=₹${minPrice}  setups(all) ${rows.length}  split date ${mid}\n`);
function table(title, key, cuts) {
  console.log(title);
  console.log('filter'.padEnd(12), 'n'.padStart(6), 'A:meanR'.padStart(9), '±95%'.padStart(7), 'A:win%'.padStart(7), 'B(2R)'.padStart(7), 'A 1st half'.padStart(11), 'A 2nd half'.padStart(11), '  n1/n2');
  for (const t of cuts) { const s = rows.filter((x) => t === null ? true : (x[key] !== null && x[key] >= t)); const h1 = s.filter((x) => x.d < mid), h2 = s.filter((x) => x.d >= mid);
    console.log((t === null ? 'no filter' : `>= ${t}`).padEnd(12), String(s.length).padStart(6), f(mean(s, 'rA')).padStart(9), f(ci95(s, 'rA')).padStart(7), f(win(s, 'rA'), 1).padStart(7), f(mean(s, 'rB')).padStart(7), f(mean(h1, 'rA')).padStart(11), f(mean(h2, 'rA')).padStart(11), `  ${h1.length}/${h2.length}`); }
  console.log(); }
const cuts = [null, 1.0, 1.25, 1.5, 2, 2.5, 3, 4];
table('Crossover-candle RVOL vs SAME-CLOCK-TIME avg of prior 3 sessions (rvT)', 'rvT', cuts);
table('Crossover-candle RVOL vs trailing 10 candles same day (rvR)', 'rvR', cuts);
table('Detection-candle RVOL vs same-clock-time (rvT2)', 'rvT2', cuts);
table('Crossover-candle volume / previous candle volume (vPrev)', 'vPrev', [null, 1, 1.5, 2, 3]);
for (const side of [true, false]) { const s = rows.filter((x) => x.long === side && x.rvT !== null && x.rvT >= 1.5); console.log(side ? 'LONG' : 'SHORT', 'rvT>=1.5 n', s.length, 'A meanR', f(mean(s, 'rA')), 'win%', f(win(s, 'rA'), 1)); }
console.log('\nBy time of day (signal candle), filter rvT>=1.5, exit A:');
for (const [lo, hi] of [[560, 600], [600, 690], [690, 780], [780, 870]]) { const s = rows.filter((x) => x.m >= lo && x.m < hi && x.rvT !== null && x.rvT >= 1.5); console.log(`${String(Math.floor(lo / 60)).padStart(2, '0')}:${String(lo % 60).padStart(2, '0')}-${String(Math.floor(hi / 60)).padStart(2, '0')}:${String(hi % 60).padStart(2, '0')}`, 'n', s.length, 'meanR', f(mean(s, 'rA')), 'win%', f(win(s, 'rA'), 1)); }

console.log('\nExit-rule comparison (filter rvT>=2.5 | all setups):');
for (const [label, sub] of [['rvT>=2.5', rows.filter((x) => x.rvT !== null && x.rvT >= 2.5)], ['all', rows]]) for (const [k, name] of [['rA', 'A  candle-close beyond 15EMA + hard SL'], ['rD', 'D  tick-touch max/min(EMA,VWAP) trail (old engine)'], ['rE', 'E  A + breakeven after +1R'], ['rB', 'B  fixed 2R + hard SL']]) console.log(label.padEnd(9), name.padEnd(52), 'meanR', f(mean(sub, k)), '±', f(ci95(sub, k)), 'win%', f(win(sub, k), 1), '| halves', f(mean(sub.filter((x) => x.d < mid), k)), f(mean(sub.filter((x) => x.d >= mid), k)));

// ---- dynamic (per-stock) volume thresholds vs static, matched on trade count ----
const H = rows.filter((x) => x.h && x.rvT !== null);
const flat = H.map((x) => ({ ...x, rv10: x.h.rv10, z10: x.h.z10, p10: x.h.p10, cv: x.h.cv, rvAdj: (x.h.rv10 - 1) / (x.h.cv + 0.2) }));
console.log(`\nDynamic-threshold study (needs >=6 prior sessions of same-slot volume): n=${flat.length}, baseline meanR(A)=${f(mean(flat, 'rA'))}`);
const target = flat.filter((x) => x.rv10 >= 2.5).length;
function matched(key, label) { const sorted = [...flat].sort((a, b) => b[key] - a[key]).slice(0, target); const cut = sorted[sorted.length - 1][key]; const h1 = sorted.filter((x) => x.d < mid), h2 = sorted.filter((x) => x.d >= mid); console.log(label.padEnd(44), 'cut', f(cut, 2).padStart(6), 'n', String(sorted.length).padStart(6), 'A', f(mean(sorted, 'rA')), '±', f(ci95(sorted, 'rA')), 'win%', f(win(sorted, 'rA'), 1), '| halves', f(mean(h1, 'rA')), f(mean(h2, 'rA')), '| B(2R)', f(mean(sorted, 'rB'))); }
console.log('Top-N by each measure, N = # of trades that pass static rvol10>=2.5 (equal trade count):');
matched('rv10', 'static  rvol vs 10-session same-time avg'); matched('z10', 'dynamic z-score of ln(volume) (own history)'); matched('p10', 'dynamic percentile rank (own history)'); matched('rvAdj', 'dynamic rvol scaled by stock volume-noise');
console.log('\nStatic rvol10 cutoffs, then z-score cutoffs (absolute):');
for (const t of [1.5, 2, 2.5, 3]) { const s2 = flat.filter((x) => x.rv10 >= t); console.log(`rvol10>=${t}`.padEnd(16), 'n', s2.length, 'A', f(mean(s2, 'rA')), '±', f(ci95(s2, 'rA')), 'halves', f(mean(s2.filter((x) => x.d < mid), 'rA')), f(mean(s2.filter((x) => x.d >= mid), 'rA'))); }
for (const t of [1, 1.5, 2, 2.5]) { const s2 = flat.filter((x) => x.z10 >= t); console.log(`z10>=${t}`.padEnd(16), 'n', s2.length, 'A', f(mean(s2, 'rA')), '±', f(ci95(s2, 'rA')), 'halves', f(mean(s2.filter((x) => x.d < mid), 'rA')), f(mean(s2.filter((x) => x.d >= mid), 'rA'))); }
// rvol needed varies by stock: show spread of the z=2 cutoff in rvol terms
const cvs = flat.map((x) => x.cv).sort((a, b) => a - b); console.log('\nPer-stock volume noise (std of ln vol): p10', f(cvs[Math.floor(cvs.length * .1)], 2), 'median', f(cvs[Math.floor(cvs.length * .5)], 2), 'p90', f(cvs[Math.floor(cvs.length * .9)], 2), ' => a z=2 spike needs rvol ~', f(Math.exp(2 * cvs[Math.floor(cvs.length * .1)]), 1) + 'x (calm stock) to', f(Math.exp(2 * cvs[Math.floor(cvs.length * .9)]), 1) + 'x (noisy stock)');
