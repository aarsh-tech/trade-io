const S = require('./strategies/scalper'); const c = require('./lib/core');
// ORB tightening sweep. Finding (2026-09-27): no amount of tightening (buffer distance past the
// opening range, minimum strong-close percentage, a stricter own-RVOL bar, a narrower window) makes
// ORB net-positive on its own, and stacking ORB (in any of these forms) on top of the new
// crossover+later-entry defaults always makes the combined result worse, not better. Kept as a
// reference/regression check in case future data suggests revisiting enableOrbTrigger.
const V = [
  ['baseline (pullback+crossover, ORB off = current default)', { orb: false }],
  ['ORB plain (no tightening)', { orb: true }],
  ['ORB buf=1pt', { orb: true, orbBufferPts: 1 }],
  ['ORB buf=2, closePct=0.5', { orb: true, orbBufferPts: 2, orbMinClosePct: 0.5 }],
  ['ORB rvol=1.5', { orb: true, orbMinRvol: 1.5 }],
  ['ORB buf=2 closePct=0.6 rvol=1.5', { orb: true, orbBufferPts: 2, orbMinClosePct: 0.6, orbMinRvol: 1.5 }],
  ['ORB buf=3 closePct=0.7 rvol=2.0', { orb: true, orbBufferPts: 3, orbMinClosePct: 0.7, orbMinRvol: 2.0 }],
  ['ORB buf=2 c=0.6 rvol=1.5 win->10:15', { orb: true, orbBufferPts: 2, orbMinClosePct: 0.6, orbMinRvol: 1.5, orbWindowEndHhmm: 10 * 60 + 15 }],
  ['ORB buf=2 c=0.6 rvol=1.5 win->10:00', { orb: true, orbBufferPts: 2, orbMinClosePct: 0.6, orbMinRvol: 1.5, orbWindowEndHhmm: 10 * 60 }],
  ['ORB buf=4 c=0.75 rvol=2.5', { orb: true, orbBufferPts: 4, orbMinClosePct: 0.75, orbMinRvol: 2.5 }],
];
for (const [n, o] of V) {
  const t = S.run(o);
  const all = c.stats(t.map(x => x.net));
  const orbOnly = c.stats(t.filter(x => x.setup === 'ORB').map(x => x.net));
  console.log(n.padEnd(46), 'ALL n', String(all.n).padStart(3), 'pf', String(all.pf).padStart(5), 'total', String(all.total).padStart(9), '| ORB-only n', String(orbOnly.n).padStart(3), 'total', String(orbOnly.total).padStart(8));
}
