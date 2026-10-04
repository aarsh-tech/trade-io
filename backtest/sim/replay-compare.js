// Compares replay-<mode>.json (real engine) with the simulator on the same days and rules (no costs, no slippage).
const { loadData } = require('./engine-sim');
const { runOrb } = require('./orb-sim');
const mode = process.argv[2] || 'quote';
const rep = require(`./replay-${mode}.json`);
const data = loadData();
const tr = runOrb(data, { topN: 99, minRvol: 10, stopAtr: 0.2, directions: ['SHORT'], rvolDays: 10, minAvgValueCr: 25, minPrice: 50, costs: false, slipTicks: 0, slipPct: 0 });
let simTot = 0, engTot = 0, same = 0;
for (const r of rep) {
  const ts = tr.filter((t) => t.day === r.day).sort((a, b) => a.entrySlot - b.entrySlot || b.rvol - a.rvol).slice(0, 2);
  const notional = 15000 * 5 * 0.95 / 2;
  const simPnl = ts.reduce((a, t) => a + (t.gross / t.qty) * Math.floor(notional / t.entry), 0);
  simTot += simPnl; engTot += r.pnl;
  const simC = tr.filter((t) => t.day === r.day).map((t) => t.sym);
  const engC = r.candidates.map((c) => c.split(':')[0]);
  const ok = ts.map((t) => t.sym).every((s) => engC.includes(s));
  if (ok) same++;
  console.log(`${r.day} engine ₹${String(r.pnl.toFixed(0)).padStart(6)} sim ₹${String(simPnl.toFixed(0)).padStart(6)} | sim traded [${ts.map((t) => `${t.sym}@${t.entrySlot}:${t.reason}`).join(' ')}] | engine cand [${engC.join(' ')}]`);
}
console.log(`TOTAL engine ₹${engTot.toFixed(0)} sim ₹${simTot.toFixed(0)} | days where sim's trades are among engine candidates: ${same}/${rep.length}`);
