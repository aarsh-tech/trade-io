const S = require('./strategies/scalper'); const c = require('./lib/core');
// Parameter sweep around the (2026-09-27-revised) engine defaults: pullback+crossover triggers,
// entry from 10:45, ORB off. Compares against the OLD defaults (pullback-only, entry 09:45, ORB on)
// for context, then explores nearby knobs. See git log / IMPROVEMENT_PLAN.md for the backtest
// evidence that motivated the default change (crossover+later-entry turned a net loser into a
// robust winner across a walk-forward split; ORB never paid for itself no matter how it was tuned).
const V = [
  ['OLD defaults (pullback-only, 09:45, ORB on)', { crossover: false, startHhmm: 585, orb: true }],
  ['NEW defaults (current)', {}],
  ['NEW defaults, 4 lots (partial booking active)', { lots: 4 }],
  ['NEW defaults, spread 0.05', { halfSpread: 0.05 }],
  ['NEW defaults, spread 0.20', { halfSpread: 0.20 }],
  ['NEW defaults, no macro bias (control)', { macroBias: false }],
  ['NEW defaults, no volume filter (control)', { volSurge: false }],
  ['NEW defaults, SL 10 / target 15', { sl: 10, target: 15, trailCostAt: 8, lockTrig: 12, lockPts: 7, t1Lock: 10 }],
  ['NEW defaults, SL 7 / target 20', { target: 20 }],
  ['NEW defaults, ATM instead of ITM', { itm: false }],
  ['NEW defaults, strike from spot (not future)', { useSpotForStrike: true }],
  ['NEW defaults, entry 10:30', { startHhmm: 630 }],
  ['NEW defaults, entry 11:00', { startHhmm: 660 }],
  ['NEW defaults, 4 lots + 100% exit at target', { lots: 4, partial: false }],
];
for (const [n, o] of V) { const t = S.run(o); const s = c.stats(t.map((x) => x.net)); console.log(n.padEnd(46), 'n', s.n, 'win%', s.win, 'mean', s.mean, 'CI', JSON.stringify(s.ci95), 'PF', s.pf, 'total', s.total); }
console.log('--- REAL option candles (recent window; older weekly contracts expire off Kite\'s instrument list, so only recent trades are recoverable) ---');
for (const [n, o] of [['NEW defaults, real', {}], ['NEW defaults, 4 lots, real', { lots: 4 }]]) { const t = S.run(o, true); const s = c.stats(t.map((x) => x.net)); console.log(n.padEnd(36), JSON.stringify(s)); const m = S.run(o, false).filter((x) => x.d >= '2026-09-01'); console.log('   model same period', JSON.stringify(c.stats(m.map((x) => x.net)))); }
