// Edge by RVOL rank / level for the ORB setup, gross and net, per year.
const { loadData, summarize } = require('./engine-sim');
const { runOrb } = require('./orb-sim');
const data = loadData();
const split = data.meta.days[Math.floor(data.D / 2)];
const fmt = (ts) => { const s = summarize(ts); return s.n ? `n ${String(s.n).padStart(5)} grossR ${s.grossR.toFixed(3).padStart(6)} netR ${s.netR.toFixed(3).padStart(6)} ±${s.ci.toFixed(3)} win ${s.win}%` : 'n 0'; };
for (const stopAtr of [0.1, 0.2, 0.35, 0.5]) {
  const tr = runOrb(data, { topN: 60, stopAtr });
  // rank within day by rvol
  const byDay = new Map(); for (const t of tr) { if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push(t); }
  for (const a of byDay.values()) { a.sort((x, y) => y.rvol - x.rvol); a.forEach((t, i) => t.rank = i + 1); }
  console.log(`\n== stop ${stopAtr} ATR`);
  for (const [lab, fn] of [['rank 1', t => t.rank === 1], ['rank 2-3', t => t.rank >= 2 && t.rank <= 3], ['rank 4-5', t => t.rank >= 4 && t.rank <= 5], ['rank 6-10', t => t.rank >= 6 && t.rank <= 10], ['rank 11-20', t => t.rank >= 11 && t.rank <= 20], ['rank 21-60', t => t.rank > 20], ['rvol>=10', t => t.rvol >= 10], ['rvol 5-10', t => t.rvol >= 5 && t.rvol < 10], ['rvol 3-5', t => t.rvol >= 3 && t.rvol < 5], ['rvol <3', t => t.rvol < 3]]) {
    const g = tr.filter(fn);
    console.log(`  ${lab.padEnd(11)} Y1 ${fmt(g.filter(t => t.day < split))} | Y2 ${fmt(g.filter(t => t.day >= split))}`);
  }
}
