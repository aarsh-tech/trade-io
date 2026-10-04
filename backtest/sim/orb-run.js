// Runs ORB "stocks in play" variants: year 1 (in-sample) vs year 2 (out-of-sample).
// Usage: node sim/orb-run.js [variant ...]   DETAIL=1 for breakdowns
const { loadData, summarize, breakdown } = require('./engine-sim');
const { runOrb } = require('./orb-sim');

const V = {
  paper: {},                                   // the paper's rules: top 20, RVOL>=1, stop 10% ATR, hold to close
  stop20: { stopAtr: 0.2 },
  stop35: { stopAtr: 0.35 },
  stop50: { stopAtr: 0.5 },
  range: { stopMode: 'RANGE' },
  top5: { topN: 5 },
  top5s35: { topN: 5, stopAtr: 0.35 },
  top1s35: { topN: 1, stopAtr: 0.35 },
  rv2s35: { minRvol: 2, stopAtr: 0.35 },
  or15s35: { orBars: 3, stopAtr: 0.35 },
  or15range: { orBars: 3, stopMode: 'RANGE' },
  s35long: { stopAtr: 0.35, directions: ['LONG'] },
  s35short: { stopAtr: 0.35, directions: ['SHORT'] },
  s35liq50: { stopAtr: 0.35, minAvgValueCr: 50 },
  s35t2: { stopAtr: 0.35, targetR: 2 },
  s35gapAlign: { stopAtr: 0.35, minGapAlign: true },
};

const data = loadData();
const split = data.meta.days[Math.floor(data.D / 2)];
const pctN = (ts) => ts.length ? (ts.reduce((a, t) => a + t.net / t.notional, 0) / ts.length * 100).toFixed(3) : '-';
const fmt = (s, ts) => s.n ? `n ${String(s.n).padStart(5)} win ${String(s.win).padStart(5)}% grossR ${s.grossR.toFixed(3).padStart(6)} cost ${s.costR.toFixed(3)} netR ${s.netR.toFixed(3).padStart(6)} ±${s.ci.toFixed(3)} net%/trade ${pctN(ts)} PF ${s.pf}` : 'n 0';
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(V)) {
  const t0 = Date.now();
  const trades = runOrb(data, V[name]);
  const y1 = trades.filter((t) => t.day < split), y2 = trades.filter((t) => t.day >= split);
  console.log(`== ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s) ${JSON.stringify(V[name])}`);
  console.log(`  YEAR1 ${fmt(summarize(y1), y1)}`);
  console.log(`  YEAR2 ${fmt(summarize(y2), y2)}`);
  if (process.env.DETAIL) for (const [title, fn] of [['side', (t) => t.side], ['exit', (t) => t.reason], ['rvol', (t) => (t.rvol >= 5 ? '5+' : t.rvol >= 3 ? '3-5' : t.rvol >= 2 ? '2-3' : '1-2')]]) {
    console.log(`  -- by ${title}`);
    for (const g of breakdown(trades, fn)) console.log(`    ${String(g.label).padEnd(10)} ${fmt(g, trades.filter((t) => fn(t) === g.label))}`);
  }
}
