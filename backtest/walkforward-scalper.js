const S = require('./strategies/scalper'); const c = require('./lib/core');
// Split-half walk-forward check: sorts each variant's trades chronologically and reports stats for
// the first half vs the second half of the window separately, not just the aggregate. This is what
// caught the OLD defaults (pullback-only, 09:45, ORB on) looking survivable in aggregate (pf 0.87)
// while actually collapsing in H2 (pf 0.41) — an aggregate number alone would have hidden that. Any
// future parameter change to this strategy should be re-checked here, not just against the
// aggregate pf/total, before being treated as a real improvement.
function halfStats(name, opts) {
  const t = S.run(opts).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
  const mid = Math.floor(t.length / 2);
  const h1 = t.slice(0, mid), h2 = t.slice(mid);
  const s1 = c.stats(h1.map((x) => x.net)), s2 = c.stats(h2.map((x) => x.net)), all = c.stats(t.map((x) => x.net));
  console.log(name.padEnd(46), 'ALL n', String(all.n).padStart(3), 'pf', String(all.pf).padStart(5), 'total', String(all.total).padStart(7),
    '| H1[', h1[0]?.d, '-', h1[h1.length - 1]?.d, '] pf', String(s1.pf).padStart(5), 'total', String(s1.total).padStart(7),
    '| H2[', h2[0]?.d, '-', h2[h2.length - 1]?.d, '] pf', String(s2.pf).padStart(5), 'total', String(s2.total).padStart(7));
}
halfStats('OLD defaults (pullback-only, 09:45, ORB on)', { crossover: false, startHhmm: 585, orb: true });
halfStats('NEW defaults (current)', {});
halfStats('NEW defaults, entry 10:30 (nearby, for comparison)', { startHhmm: 630 });
halfStats('NEW defaults, entry 11:00 (nearby, for comparison)', { startHhmm: 660 });
