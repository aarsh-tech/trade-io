// Account-level ORB results: one position at a time (first trigger wins) vs capital split across up to N positions.
const { loadData, summarize } = require('./engine-sim');
const { runOrb } = require('./orb-sim');
const data = loadData();
const split = data.meta.days[Math.floor(data.D / 2)];
const CAP = 15000, LEV = 5;
function account(trades, maxPos, shortsOnly) {
  const byDay = new Map();
  for (const t of trades) { if (shortsOnly && t.side !== 'SHORT') continue; if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push(t); }
  const res = { Y1: 0, Y2: 0, n1: 0, n2: 0, days: 0, posDays: 0, worst: 0, eq: [] };
  let eq = 0, peak = 0, dd = 0;
  for (const [day, ts] of [...byDay.entries()].sort()) {
    ts.sort((a, b) => a.entrySlot - b.entrySlot || b.rvol - a.rvol);
    const take = ts.slice(0, maxPos);
    const notional = CAP * LEV / maxPos;
    let pnl = 0;
    for (const t of take) pnl += t.net / t.notional * notional; // scale to this account's notional per slot
    if (day < split) { res.Y1 += pnl; res.n1 += take.length; } else { res.Y2 += pnl; res.n2 += take.length; }
    res.days++; if (pnl > 0) res.posDays++;
    eq += pnl; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq);
  }
  res.dd = dd;
  return res;
}
for (const [stop, slipMul] of [[0.1, 1], [0.15, 1], [0.2, 1], [0.1, 2], [0.15, 2], [0.2, 2]]) {
  const tr = runOrb(data, { topN: 99, minRvol: 10, stopAtr: stop, slipTicks: slipMul, slipPct: 0.01 * slipMul });
  for (const so of [false, true]) for (const mp of [1, 2, 3, 4]) {
    const a = account(tr, mp, so);
    console.log(`stop ${stop} slip x${slipMul} ${so ? 'SHORTS' : 'BOTH  '} maxPos ${mp}: Y1 ₹${Math.round(a.Y1).toString().padStart(7)} (${a.n1} tr) | Y2 ₹${Math.round(a.Y2).toString().padStart(7)} (${a.n2} tr) | green days ${a.posDays}/${a.days} | maxDD ₹${Math.round(a.dd)}`);
  }
}
