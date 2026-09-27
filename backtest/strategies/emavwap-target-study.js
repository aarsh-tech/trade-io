// Target-realism study for the 15-EMA/VWAP fresh-crossover setup ('DIRECT') on real Kite 5m history.
// Answers: how often is each candidate target actually reached before the structural SL, and what does each earn?
// Compares: fixed R-multiples, daily-ATR-scaled targets, and the engine's current "logical target" (PDC/PDH/PDL/5D swing/Fib).
// Usage:  node strategies/emavwap-target-study.js 100 <part> <parts> <dumpFile>     (parallel chunks)
//         MERGE=f0,f1,.. node strategies/emavwap-target-study.js                    (report)
const fs = require('fs'); const path = require('path'); const c = require('../lib/core');
const minPrice = +(process.argv[2] || 100);
const dir = path.join(__dirname, '..', 'data', '5minute');
const syms = fs.readdirSync(dir).map((f) => f.replace('.json', '')).filter((s) => !/NIFTY|BANK|FIN|SENSEX|MIDCP|INDIA ?VIX/i.test(s));
const part = +(process.argv[3] || 0), parts = +(process.argv[4] || 1);
const RG = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3], AG = [0.1, 0.15, 0.2, 0.3, 0.4, 0.5];
const rows = [];
if (process.env.MERGE) for (const f of process.env.MERGE.split(',')) rows.push(...JSON.parse(fs.readFileSync(f, 'utf8')));
for (const sym of (process.env.MERGE ? [] : syms.filter((_, k) => k % parts === part))) {
  const cs = c.load('5minute', sym); if (!cs || cs.length < 500) continue; if (cs[cs.length - 1].c < minPrice) continue;
  const em = c.ema(cs, 15), vw = c.vwap(cs, 'close');
  const days = [], dayIdx = new Map(), slotVol = [], dayOHLC = [];
  for (let i = 0; i < cs.length; i++) { const b = cs[i]; if (!dayIdx.has(b.d)) { dayIdx.set(b.d, days.length); days.push(b.d); slotVol.push(new Map()); dayOHLC.push({ o: b.o, h: b.h, l: b.l, cl: b.c }); } const dn = dayIdx.get(b.d); slotVol[dn].set(b.m, b.v); const D = dayOHLC[dn]; D.h = Math.max(D.h, b.h); D.l = Math.min(D.l, b.l); D.cl = b.c; }
  const rvolTod = (i, nPrev = 3) => { const dn = dayIdx.get(cs[i].d); let s = 0, n = 0; for (let k = 1; k <= nPrev + 2 && n < nPrev; k++) { const dd = dn - k; if (dd < 0) break; const v = slotVol[dd].get(cs[i].m); if (v > 0) { s += v; n++; } } return n >= 2 ? cs[i].v / (s / n) : null; };
  const hist10 = (i) => { const dn = dayIdx.get(cs[i].d); const a = []; for (let k = 1; k <= 14 && a.length < 10; k++) { const dd = dn - k; if (dd < 0) break; const v = slotVol[dd].get(cs[i].m); if (v > 0) a.push(v); } if (a.length < 6 || !(cs[i].v > 0)) return null; const mean = a.reduce((x, y) => x + y, 0) / a.length; const ls = a.map(Math.log); const lm = ls.reduce((x, y) => x + y, 0) / ls.length; const sd = Math.sqrt(ls.reduce((x, y) => x + (y - lm) ** 2, 0) / (ls.length - 1)) || 0.01; return { rv10: cs[i].v / mean, z10: (Math.log(cs[i].v) - lm) / sd }; };
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
    if (!(latest === 'LONG' ? (ce > cv && cur.c >= cv * 0.998) : (ce < cv && cur.c <= cv * 1.002))) continue;
    const long = latest === 'LONG'; const cc = cs[ci];
    let dl = Infinity, dh = -Infinity; for (let k = i; k >= 0 && cs[k].d === cur.d; k--) { dl = Math.min(dl, cs[k].l); dh = Math.max(dh, cs[k].h); }
    let sLow = Infinity, sHigh = -Infinity; for (let k = i, n = 0; k >= 0 && n < 6; k--, n++) { sLow = Math.min(sLow, cs[k].l); sHigh = Math.max(sHigh, cs[k].h); }
    let acr = 0, an = 0; for (let k = i; k >= 0 && an < 10; k--, an++) acr += (cs[k].h - cs[k].l) / cs[k].c * 100; acr /= an;
    const vb = Math.max(cur.c * 0.0002, cur.c * (acr * 0.01 * 0.35)); const minD = cur.c * 0.0085, maxD = cur.c * 0.022;
    const trig = long ? cc.h : cc.l; let slD;
    if (long) { const a = (cur.c - dl) <= maxD ? Math.min(dl, sLow, cc.l) : Math.min(sLow, cc.l); slD = Math.min(maxD, Math.max(minD, cur.c - (a - vb))); }
    else { const a = (dh - cur.c) <= maxD ? Math.max(dh, sHigh, cc.h) : Math.max(sHigh, cc.h); slD = Math.min(maxD, Math.max(minD, a + vb - cur.c)); }
    const exp = cc.t + 10 * 60e3; let entry = null, ei = -1;
    for (let j = i + 1; j < cs.length && cs[j].d === cur.d; j++) { const b = cs[j]; if (b.t >= exp && j > i + 1) break;
      if (long ? b.l < trig - slD : b.h > trig + slD) { if (!(long ? b.h >= trig : b.l <= trig)) break; }
      if (long ? b.h >= trig : b.l <= trig) { entry = long ? Math.max(trig, b.o) : Math.min(trig, b.o); if (long ? b.o >= trig : b.o <= trig) entry = b.o; ei = j; break; } }
    if (ei < 0) continue; done = true;
    const R = slD, sl = long ? entry - R : entry + R, sgn = long ? 1 : -1;
    // prior-session stats exactly like the engine (last ~3 sessions): PDH/PDL/PDC, swing high/low, daily range %
    const dn = dayIdx.get(cur.d); const past = []; for (let k = 1; k <= 3 && dn - k >= 0; k++) past.push(dayOHLC[dn - k]);
    let atrPct = 2.5, pdh = null, pdl = null, pdc = null, sh5 = null, sl5 = null;
    if (past.length) { pdh = past[0].h; pdl = past[0].l; pdc = past[0].cl; sh5 = Math.max(...past.map((x) => x.h)); sl5 = Math.min(...past.map((x) => x.l)); atrPct = Math.max(1.2, Math.min(10, past.reduce((s, x) => s + (x.h - x.l) / x.o * 100, 0) / past.length)); }
    // engine's current logical target (calculateLogicalTarget port)
    const baseRange = Math.max(R, entry * 0.008); let logT, logReason;
    if (long) { logT = entry + baseRange * 1.618; logReason = 'FIB';
      if (pdc && pdc > entry && pdc - entry >= R * 1.1) { logT = pdc * 0.999; logReason = 'PDC'; } else if (pdh && pdh > entry && pdh - entry >= R * 1.2) { logT = pdh * 0.999; logReason = 'PDH'; } else if (sh5 && sh5 > entry && sh5 - entry >= R * 1.3 && sh5 - entry <= baseRange * 2.2) { logT = sh5 * 0.999; logReason = 'SWING'; }
      if (logT < entry + R * 1.2) { logT = entry + R * 1.2; logReason = 'MIN1.2R'; } }
    else { logT = entry - baseRange * 1.618; logReason = 'FIB';
      if (pdc && pdc < entry && entry - pdc >= R * 1.1) { logT = pdc * 1.001; logReason = 'PDC'; } else if (pdl && pdl < entry && entry - pdl >= R * 1.2) { logT = pdl * 1.001; logReason = 'PDL'; } else if (sl5 && sl5 < entry && entry - sl5 >= R * 1.3 && entry - sl5 <= baseRange * 2.2) { logT = sl5 * 1.001; logReason = 'SWING'; }
      if (logT > entry - R * 1.2) { logT = entry - R * 1.2; logReason = 'MIN1.2R'; } }
    // path
    let endJ = ei; while (endJ + 1 < cs.length && cs[endJ + 1].d === cur.d && cs[endJ + 1].m < 905) endJ++;
    const sim = (tp) => { for (let j = ei; j <= endJ; j++) { const b = cs[j]; const hSl = long ? b.l <= sl : b.h >= sl, hT = tp !== null && (long ? b.h >= tp : b.l <= tp); if (j === ei && !hSl && !hT) continue; if (hSl) return [-1, 0]; if (hT) return [sgn * (tp - entry) / R, 1]; } const lb = cs[endJ + 1] && cs[endJ + 1].d === cur.d ? cs[endJ + 1].o : cs[endJ].c; return [sgn * (lb - entry) / R, 0]; };
    let mfe = 0; for (let j = ei; j <= endJ; j++) { const b = cs[j]; const hSl = long ? b.l <= sl : b.h >= sl; if (hSl) break; mfe = Math.max(mfe, sgn * ((long ? b.h : b.l) - entry) / R); }
    const res = {}; for (const m of RG) res['R' + m] = sim(entry + sgn * m * R); for (const f of AG) { const dist = entry * atrPct / 100 * f; res['ATR' + f] = sim(entry + sgn * dist); res['ATR' + f + 'R'] = dist / R; }
    res.LOG = sim(logT); res.LOGR = sgn * (logT - entry) / R;
    // ---- target MODES the engine will offer ----
    const clampD = (d) => Math.min(2 * R, Math.max(0.5 * R, d)); const atrDist = clampD(entry * atrPct / 100 * 0.5);
    const simP = (dist, be) => { const tp = entry + sgn * dist; let leg1 = null, slNow = sl;
      for (let j = ei; j <= endJ; j++) { const b = cs[j]; const hSl = long ? b.l <= slNow : b.h >= slNow;
        if (leg1 === null) { const hT = long ? b.h >= tp : b.l <= tp; if (j === ei && !hSl && !hT) continue; if (hSl) return [-1, 0]; if (hT) { leg1 = dist / R; if (be) slNow = entry; continue; } if (em[j] !== null && (long ? b.c < em[j] : b.c > em[j])) return [sgn * (b.c - entry) / R, 0]; }
        else { if (hSl) return [0.5 * leg1 + 0.5 * sgn * (slNow - entry) / R, 1]; if (em[j] !== null && (long ? b.c < em[j] : b.c > em[j])) return [0.5 * leg1 + 0.5 * sgn * (b.c - entry) / R, 1]; } }
      const lb = cs[endJ + 1] && cs[endJ + 1].d === cur.d ? cs[endJ + 1].o : cs[endJ].c; const r = sgn * (lb - entry) / R; return leg1 === null ? [r, 0] : [0.5 * leg1 + 0.5 * r, 1]; };
    res.M_FULL = sim(entry + sgn * atrDist); res.M_PART = simP(atrDist, false); res.M_PART_BE = simP(atrDist, true); res.M_QUICK = simP(0.5 * R, false); res.M_QUICK_BE = simP(0.5 * R, true); res.M_ATRR = atrDist / R;
    // candle-close-15EMA exit (engine's trend-riding exit) for reference
    let rA = null; for (let j = ei; j <= endJ && rA === null; j++) { const b = cs[j]; if (long ? b.l <= sl : b.h >= sl) rA = -1; else if (em[j] !== null && (long ? b.c < em[j] : b.c > em[j])) rA = sgn * (b.c - entry) / R; } if (rA === null) rA = sim(null)[0];
    rows.push({ sym, d: cur.d, long, m: cur.m, R: R / entry * 100, atrPct, rvT: rvolTod(ci), h: hist10(ci), mfe, mfeAtr: mfe * (R / entry * 100) / atrPct, logReason, res, rA });
  }
}
if (process.argv[5]) { fs.writeFileSync(process.argv[5], JSON.stringify(rows)); process.exit(0); }
rows.sort((a, b) => a.d < b.d ? -1 : 1); const mid = rows[Math.floor(rows.length / 2)].d;
const mean = (a, g) => a.length ? a.reduce((s, x) => s + g(x), 0) / a.length : NaN; const f = (x, d = 3) => Number.isFinite(x) ? x.toFixed(d) : ' n/a ';
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const sets = [['ALL crossover setups', rows], ['STATIC volume  (rvol same-time >= 2.5x)', rows.filter((x) => x.rvT !== null && x.rvT >= 2.5)], ['DYNAMIC volume (own-history z>=1.5 & rvol>=1.5x)', rows.filter((x) => x.h && x.h.z10 >= 1.5 && x.h.rv10 >= 1.5)]];
console.log(`setups ${rows.length}, split ${mid}\n`);
for (const [title, S] of sets) {
  console.log('=== ' + title + `  n=${S.length}`); if (!S.length) continue;
  console.log('candle-close 15EMA exit (trend-riding): meanR', f(mean(S, (x) => x.rA)), '| halves', f(mean(S.filter((x) => x.d < mid), (x) => x.rA)), f(mean(S.filter((x) => x.d >= mid), (x) => x.rA)));
  console.log('MFE (best favourable move before SL/EOD) in R:  median', f(q(S.map((x) => x.mfe), .5), 2), ' p25', f(q(S.map((x) => x.mfe), .25), 2), ' p75', f(q(S.map((x) => x.mfe), .75), 2), '| as fraction of daily ATR: median', f(q(S.map((x) => x.mfeAtr), .5), 2), ' p75', f(q(S.map((x) => x.mfeAtr), .75), 2));
  { const win = (a, k) => a.filter((x) => x.res[k][0] > 0).length / a.length * 100; const M = (a, k) => mean(a, (x) => x.res[k][0]); const H = (a, k) => mean(a, (x) => x.res[k][1]) * 100;
    const sd = (a, k) => { const m = M(a, k); return Math.sqrt(a.reduce((s2, x) => s2 + (x.res[k][0] - m) ** 2, 0) / (a.length - 1)); };
    console.log('MODES (whole-position result in R, hard structural SL, EOD 15:05):  avg T1 distance', f(mean(S, (x) => x.res.M_ATRR), 2), 'R');
    console.log('mode'.padEnd(46), 'T1hit%'.padStart(7), 'win%'.padStart(6), 'meanR'.padStart(7), '±95%'.padStart(6), 'half1'.padStart(7), 'half2'.padStart(7));
    for (const [k, name] of [['M_FULL', 'FULL   single 0.5xATR target, no trail'], ['M_PART', 'PARTIAL 50% @0.5xATR, rest EMA-close trail'], ['M_PART_BE', 'PARTIAL + runner SL to breakeven'], ['M_QUICK', 'QUICK   50% @0.5R, rest EMA-close trail'], ['M_QUICK_BE', 'QUICK + runner SL to breakeven']]) console.log(name.padEnd(46), f(H(S, k), 1).padStart(7), f(win(S, k), 1).padStart(6), f(M(S, k)).padStart(7), f(1.96 * sd(S, k) / Math.sqrt(S.length)).padStart(6), f(M(S.filter((x) => x.d < mid), k)).padStart(7), f(M(S.filter((x) => x.d >= mid), k)).padStart(7));
    console.log('reference: all-in EMA-close trail (no partial)'.padEnd(46), ''.padStart(7), f(S.filter((x) => x.rA > 0).length / S.length * 100, 1).padStart(6), f(mean(S, (x) => x.rA)).padStart(7)); console.log(); }
  console.log('target'.padEnd(26), 'distR'.padStart(6), 'hit%'.padStart(6), 'meanR'.padStart(7), 'half1'.padStart(7), 'half2'.padStart(7));
  const line = (label, key, dist) => { const H = (a) => mean(a, (x) => x.res[key][1]) * 100, M = (a) => mean(a, (x) => x.res[key][0]); console.log(label.padEnd(26), f(dist, 2).padStart(6), f(H(S), 1).padStart(6), f(M(S)).padStart(7), f(M(S.filter((x) => x.d < mid))).padStart(7), f(M(S.filter((x) => x.d >= mid))).padStart(7)); };
  for (const m of RG) line(`fixed ${m}R`, 'R' + m, m);
  for (const a of AG) line(`${a} x daily ATR`, 'ATR' + a, mean(S, (x) => x.res['ATR' + a + 'R']));
  line('CURRENT logical target', 'LOG', mean(S, (x) => x.res.LOGR));
  const rs = {}; for (const x of S) { (rs[x.logReason] = rs[x.logReason] || []).push(x); } console.log('  current-target reasons:', Object.entries(rs).map(([k, v]) => `${k} ${(v.length / S.length * 100).toFixed(0)}% (hit ${(mean(v, (x) => x.res.LOG[1]) * 100).toFixed(0)}%, meanR ${f(mean(v, (x) => x.res.LOG[0]), 2)})`).join(' | '));
  console.log();
}
