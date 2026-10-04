const { loadData } = require('./engine-sim');
const { runOrb } = require('./orb-sim');
const data = loadData();
const split = data.meta.days[Math.floor(data.D / 2)];
const CAP = 15000, LEV = 5, MAXPOS = 2;
const acct = (tr) => { const byDay = new Map(); for (const t of tr) { if (!byDay.has(t.day)) byDay.set(t.day, []); byDay.get(t.day).push(t); }
  let y1 = 0, y2 = 0, eq = 0, pk = 0, dd = 0; for (const [day, ts] of [...byDay].sort()) { ts.sort((a, b) => a.entrySlot - b.entrySlot || b.rvol - a.rvol); let p = 0; for (const t of ts.slice(0, MAXPOS)) p += t.net / t.notional * CAP * LEV / MAXPOS; if (day < split) y1 += p; else y2 += p; eq += p; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  return `Y1 ₹${Math.round(y1)} | Y2 ₹${Math.round(y2)} | maxDD ₹${Math.round(dd)}`; };
for (const chase of [null, 2, 1, 0.5]) for (const rvolDays of [10]) {
  const tr = runOrb(data, { topN: 99, minRvol: 10, stopAtr: 0.2, directions: ['SHORT'], rvolDays, minAvgValueCr: 25, minPrice: 50, chaseMax: chase });
  console.log(`chaseMax ${chase} (engine baseline: 10 sessions, value>=25Cr, price>=50): ${acct(tr)} | trades ${tr.length}`);
}
