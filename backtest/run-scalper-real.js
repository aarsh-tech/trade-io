const S = require('./strategies/scalper'); const K = require('./lib/kiteopt'); const M = require('./lib/market'); const c = require('./lib/core');
// Validates the (2026-09-27-revised) defaults against REAL Kite option premiums instead of the
// Black-Scholes model. Caveat: Kite's instrument dump only lists currently-tradable contracts, so
// weekly NIFTY option contracts more than a couple of weeks old silently drop out and can't be
// fetched retroactively — real-data coverage here is necessarily limited to the most recent window
// (and to whatever was already cached from earlier runs). Treat a small `n` as inconclusive, not
// as a real refutation of the model backtest; the split-half walk-forward in walkforward-scalper.js
// is the stronger evidence for robustness until enough real-data history accumulates naturally.
(async () => {
  const variants = [
    ['OLD defaults (pullback-only, 09:45, ORB on)', { crossover: false, startHhmm: 585, orb: true }],
    ['NEW defaults (current)', {}],
    ['NEW defaults, 4 lots', { lots: 4 }],
  ];
  const need = new Set();
  for (const [, P] of variants) {
    for (const t of S.run(P, false)) {
      if (t.d < '2026-08-28') continue;
      const type = t.side === 'BUY' ? 'CE' : 'PE';
      const ins = K.chain('NIFTY', M.weeklyTuesday(t.d), type).find((x) => +x.strike === t.strike);
      if (ins) need.add(ins.tradingsymbol);
    }
  }
  console.log('contracts needed', need.size, 'newly fetched', await K.ensure([...need], '2026-08-28'), '(rest already cached or no longer available)');
  for (const [n, o] of variants) {
    const r = S.run(o, true), m = S.run(o, false).filter((x) => x.d >= '2026-08-28');
    console.log(n.padEnd(42), 'REAL', JSON.stringify(c.stats(r.map((x) => x.net))));
    console.log(''.padEnd(42), 'MODEL(same window)', JSON.stringify(c.stats(m.map((x) => x.net))));
  }
})().catch(e => console.error('ERR', e));
