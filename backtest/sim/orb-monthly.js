// Monthly P&L with the live engine's sizing: qty = min(capital per slot x leverage x 0.95 / price, maxLoss / stop distance).
// Optional NIFTY filter: shorts only when NIFTY at the entry bar's open is below its 09:15 open.
const { loadData } = require('./engine-sim');
const { runOrb } = require('./orb-sim');
const data = loadData();
const SLOTS = 75; const dayIdx = new Map(data.meta.days.map((d, i) => [d, i]));
function months(trades, r) {
  const { maxPos = 2, cap = 15000, lev = 4, maxLoss = Infinity, sides = ['SHORT'], nifty = false } = r;
  const byDay = new Map();
  for (const t of trades) {
    if (!sides.includes(t.side)) continue;
    if (nifty) { const d = dayIdx.get(t.day); const no = data.niftyO[d * SLOTS], nc = data.niftyO[d * SLOTS + t.entrySlot]; if (no > 0 && nc > 0 && (t.side === 'SHORT' ? nc > no : nc < no)) continue; }
    if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push(t);
  }
  const m = new Map(); let n = 0, riskSum = 0, eq = 0, peak = 0, dd = 0;
  for (const [day, ts] of [...byDay.entries()].sort()) {
    ts.sort((a, b) => a.entrySlot - b.entrySlot || b.rvol - a.rvol);
    let pnl = 0;
    for (const t of ts.slice(0, maxPos)) {
      const stop = t.riskRs / t.qty;
      const q = Math.min(Math.floor(cap / maxPos * lev * 0.95 / t.entry), Math.floor(maxLoss / stop));
      if (q < 1) continue;
      pnl += t.net / t.qty * q; riskSum += stop * q; n++;
    }
    const k = String(day).slice(0, 7); m.set(k, (m.get(k) || 0) + pnl);
    eq += pnl; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq);
  }
  return { m, n, avgRisk: riskSum / n, dd };
}
const runs = JSON.parse(process.argv[2]); const cache = new Map(); const out = []; const all = new Set();
for (const r of runs) {
  const cfg = { topN: 99, minRvol: 10, stopAtr: 0.2, minAvgValueCr: 25, minPrice: 50, ...r.cfg };
  const key = JSON.stringify(cfg); if (!cache.has(key)) cache.set(key, runOrb(data, cfg));
  const res = months(cache.get(key), r); for (const k of res.m.keys()) all.add(k); out.push({ name: r.name, ...res });
}
const ks = [...all].sort();
if (process.env.TABLE) { console.log('month   ' + out.map((o) => o.name.padStart(10)).join('')); for (const k of ks) console.log(k + ' ' + out.map((o) => String(Math.round(o.m.get(k) || 0)).padStart(10)).join('')); }
for (const o of out) {
  const v = ks.map((k) => o.m.get(k) || 0), tot = v.reduce((a, b) => a + b, 0);
  const y1 = v.slice(0, 12).reduce((a, b) => a + b, 0), y2 = tot - y1;
  let w3 = Infinity; for (let i = 0; i + 3 <= v.length; i++) w3 = Math.min(w3, v[i] + v[i + 1] + v[i + 2]);
  console.log(`${o.name.padEnd(16)} Y1 ₹${String(Math.round(y1)).padStart(6)} Y2 ₹${String(Math.round(y2)).padStart(6)} | tr ${String(o.n).padStart(3)} avgRisk ₹${String(Math.round(o.avgRisk)).padStart(4)} | green ${v.filter((x) => x > 0).length}/${v.length} | worst mo ₹${Math.round(Math.min(...v))} | worst 3mo ₹${Math.round(w3)} | maxDD ₹${Math.round(o.dd)}`);
}
