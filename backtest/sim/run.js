// Runs named variants of the EMA-VWAP pipeline and prints in-sample (year 1) vs out-of-sample (year 2) results.
// Usage: node sim/run.js baseline [variant ...]     (variants defined in sim/variants.js)
//        DETAIL=1 node sim/run.js baseline           (adds breakdowns)
const { loadData, makeSim, summarize, breakdown } = require('./engine-sim');
const VARIANTS = require('./variants');

const t0 = Date.now();
const data = loadData();
const D = data.D;
const split = Math.floor(D / 2);
console.log(`loaded ${data.S} stocks x ${D} days in ${((Date.now() - t0) / 1000).toFixed(1)}s | split ${data.meta.days[split]} (year1 = in-sample, year2 = out-of-sample)`);

const fmt = (s) => s.n ? `n ${String(s.n).padStart(4)} win ${String(s.win).padStart(5)}% grossR ${s.grossR.toFixed(3).padStart(6)} cost ${s.costR.toFixed(3)} netR ${s.netR.toFixed(3).padStart(6)} ±${s.ci.toFixed(3)} net ₹${String(s.netRs).padStart(7)} PF ${s.pf} DD ₹${s.maxDD}` : 'n 0';
const names = process.argv.slice(2);
for (const name of names.length ? names : ['baseline']) {
  const v = VARIANTS[name];
  if (!v) { console.log(`unknown variant ${name}`); continue; }
  const t1 = Date.now();
  const sim = makeSim(data, v);
  const trades = sim.run();
  const y1 = trades.filter((t) => t.day < data.meta.days[split]), y2 = trades.filter((t) => t.day >= data.meta.days[split]);
  console.log(`\n== ${name} (${((Date.now() - t1) / 1000).toFixed(0)}s)`);
  console.log(`  ALL   ${fmt(summarize(trades))}`);
  console.log(`  YEAR1 ${fmt(summarize(y1))}`);
  console.log(`  YEAR2 ${fmt(summarize(y2))}`);
  if (process.env.DETAIL) {
    for (const [title, fn] of [['setup', (t) => t.type], ['side', (t) => t.side], ['exit', (t) => t.reason], ['hour', (t) => String(9 + Math.floor((15 + t.entrySlot * 5) / 60)).padStart(2, '0')], ['setup+side', (t) => `${t.type}/${t.side}`]]) {
      console.log(`  -- by ${title}`);
      for (const s of breakdown(trades, fn)) console.log(`    ${String(s.label).padEnd(28)} ${fmt(s)}`);
    }
  }
  if (process.env.DUMP) require('fs').writeFileSync(`${process.env.DUMP}-${name}.json`, JSON.stringify(trades));
}
