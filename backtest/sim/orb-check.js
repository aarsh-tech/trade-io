const { loadData, summarize } = require('./engine-sim');
const { runOrb } = require('./orb-sim');
const data = loadData();
const CAP = 15000, LEV = 5, MAXPOS = 2;
const acct = (tr) => { const byDay = new Map(); for (const t of tr) { if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push(t); }
  const q = new Map(); for (const [day, ts] of byDay) { ts.sort((a, b) => a.entrySlot - b.entrySlot || b.rvol - a.rvol); const k = day.slice(0, 4) + 'Q' + (Math.floor((+day.slice(5, 7) - 1) / 3) + 1); let p = 0; for (const t of ts.slice(0, MAXPOS)) p += t.net / t.notional * CAP * LEV / MAXPOS; const o = q.get(k) || { p: 0, n: 0 }; o.p += p; o.n += Math.min(MAXPOS, ts.length); q.set(k, o); }
  return [...q.entries()].sort().map(([k, o]) => `${k}: ₹${Math.round(o.p)} (${o.n})`).join(' | '); };
for (const days of [10, 14]) {
  const tr = runOrb(data, { topN: 99, minRvol: 10, stopAtr: 0.2, directions: ['SHORT'], rvolDays: days });
  const s = summarize(tr);
  console.log(`\nrvol baseline ${days} sessions: n ${s.n} netR ${s.netR} ±${s.ci} win ${s.win}%`);
  console.log('  quarters (shorts, maxPos 2, ₹15k x5):', acct(tr));
  const atOpen = tr.filter(t => t.entrySlot === 1).length;
  const byExit = {}; for (const t of tr) byExit[t.reason] = (byExit[t.reason] || 0) + 1;
  console.log(`  entries in 09:20 bar: ${atOpen}/${tr.length} | exits ${JSON.stringify(byExit)} | median stop % ${[...tr].map(t => t.slPct).sort((a, b) => a - b)[tr.length >> 1].toFixed(2)} | median entry ₹${[...tr].map(t => t.entry).sort((a, b) => a - b)[tr.length >> 1].toFixed(0)}`);
  const wins = tr.filter(t => t.netR > 0).map(t => t.netR).sort((a, b) => b - a);
  console.log(`  avg win ${(wins.reduce((a, b) => a + b, 0) / wins.length).toFixed(2)}R, top-10 wins ${wins.slice(0, 10).map(x => x.toFixed(1)).join(',')} | share of total from top 5% trades: ${(wins.slice(0, Math.ceil(tr.length * 0.05)).reduce((a, b) => a + b, 0) / tr.reduce((a, t) => a + t.netR, 0) * 100).toFixed(0)}%`);
}
