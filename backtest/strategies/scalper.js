// Port of nifty-options-scalper.engine.ts using the (2026-09-27-revised) engine defaults.
// (pullback + crossover triggers, entry from 10:45, ORB off by default, 5-minute, SL 7 / target 10
// option points, ITM strike, cost-trail 6, 1 win / 2 loss per day). See git log for the backtest
// evidence behind entryStartTime 09:45->10:45, crossover trigger off->on, and ORB on->off.
const c = require('../lib/core'); const M = require('../lib/market'); const K = require('../lib/kiteopt');
const DEFAULTS = { emaBuffer: 9, minRange: 8, minWick: 0, minRvol: 0.9, volSurge: true, trendBias: true, macroBias: true, startHhmm: 645, cutoffHhmm: 14 * 60 + 15, deadStart: 12 * 60 + 15, deadEnd: 13 * 60 + 15, cooldownMin: 10,
  sl: 7, target: 10, trailCostAt: 6, lockTrig: 8, lockPts: 5, t1Lock: 7, dynTrail: 3.5, stagnMin: 15, stagnLo: -2.8 /* 0.4x sl */, stagnHi: 2.1 /* 0.3x sl, matches the TS engine fix */, maxTrades: 2, maxWins: 1, maxLosses: 2, lots: 1, partial: true, halfSpread: 0.10, ivCE: 0.93, ivPE: 1.02, itm: true, crossover: true, orb: false, orbBufferPts: 0, orbMinClosePct: 0, orbMinRvol: 0, orbWindowEndHhmm: 11 * 60 + 30, capital: 50000, useSpotForStrike: false };
const lot = 65;

function detect(fut, i, P) {
  const cur = fut[i], prev = fut[i - 1]; if (!prev || cur.d !== prev.d) return null;
  const em = P._em, vw = P._vw; const ce = em[i], pe = em[i - 1], cv = vw[i], pv = vw[i - 1]; if (ce === null || cv === null) return null;
  const range = Math.max(0.1, cur.h - cur.l), lowW = (Math.min(cur.o, cur.c) - cur.l) / range, upW = (cur.h - Math.max(cur.o, cur.c)) / range;
  if (range < P.minRange) return null; let side = null, name = '';
  if (cur.m >= P.startHhmm) {
    const ceSlope = pe === null || ce >= pe - 0.5, peSlope = pe === null || ce <= pe + 0.5;
    if (cur.c > cv && cur.l <= ce + P.emaBuffer && cur.c > ce && cur.c > cur.o && cur.h > prev.h && ceSlope && lowW >= P.minWick) { side = 'BUY'; name = 'PULLBACK'; }
    else if (cur.c < cv && cur.h >= ce - P.emaBuffer && cur.c < ce && cur.c < cur.o && cur.l < prev.l && peSlope && upW >= P.minWick) { side = 'SELL'; name = 'PULLBACK'; }
  }
  // Crossover waits for entryStartTime too (matches Pullback); only ORB is allowed to fire earlier.
  if (P.crossover && !side && cur.m >= P.startHhmm && pe !== null && pv !== null) { if (pe <= pv && ce > cv && cur.c >= cv && cur.c >= ce && cur.c >= cur.o) { side = 'BUY'; name = 'XOVER'; } else if (pe >= pv && ce < cv && cur.c <= cv && cur.c <= ce && cur.c <= cur.o) { side = 'SELL'; name = 'XOVER'; } }
  // ORB: 15-min opening-range breakout/breakdown, active 9:30-windowEnd regardless of entryStartTime
  // (that's the whole point — catch the early move entryStartTime would otherwise skip). Tightening knobs:
  // orbBufferPts (clear the level by more than a tick), orbMinClosePct (close near its own high/low, not a
  // weak poke-through), orbMinRvol (its own stricter volume-surge bar), orbWindowEndHhmm (narrower window).
  if (P.orb && !side && P._orbHigh != null && P._orbLow != null && cur.m >= 9 * 60 + 30 && cur.m <= P.orbWindowEndHhmm) {
    const buf = P.orbBufferPts || 0;
    const closeUpStrength = (cur.c - cur.l) / range, closeDownStrength = (cur.h - cur.c) / range;
    let orbSide = null;
    if (cur.c < P._orbLow - buf && prev.c >= P._orbLow && closeDownStrength >= P.orbMinClosePct) orbSide = 'SELL';
    else if (cur.c > P._orbHigh + buf && prev.c <= P._orbHigh && closeUpStrength >= P.orbMinClosePct) orbSide = 'BUY';
    if (orbSide && P.orbMinRvol) {
      let s = 0, n = 0; for (let v = Math.max(0, i - 10); v < i; v++) { s += fut[v].v; n++; }
      const avg = n ? s / n : cur.v;
      if (!(cur.v >= avg * P.orbMinRvol)) orbSide = null;
    }
    if (orbSide) { side = orbSide; name = 'ORB'; }
  }
  if (!side) return null;
  if (P.volSurge) { let s = 0, n = 0; for (let v = Math.max(0, i - 10); v < i; v++) { s += fut[v].v; n++; } const avg = n ? s / n : cur.v; if (!(cur.v >= avg * P.minRvol || cur.v > prev.v)) return null; }
  if (P.trendBias) { if (side === 'BUY' && cur.c < cv) return null; if (side === 'SELL' && cur.c > cv) return null; }
  return { side, name };
}

function run(P0 = {}, real = false) {
  const P = { ...DEFAULTS, ...P0 }; const fut = c.load('5minute', 'NIFTY26SEPFUT'), spot = c.load('5minute', 'NIFTY 50'); const vix = c.load('day', 'INDIA VIX');
  const spotByT = new Map(spot.map((x) => [x.t, x])); P._em = c.ema(fut, 15); P._vw = c.vwap(fut, 'close');
  const days = c.byDay(fut); const dayKeys = [...days.keys()]; const trades = []; const spotBars = new Map(); for (const [d, a] of c.byDay(spot)) spotBars.set(d, a);
  for (let di = 1; di < dayKeys.length; di++) {
    const d = dayKeys[di]; const dayC = days.get(d); const prevClose = days.get(dayKeys[di - 1]).slice(-1)[0].c; const dayOpen = dayC[0].o; const isBull = dayOpen >= prevClose;
    P._orbHigh = dayC.length >= 3 ? Math.max(dayC[0].h, dayC[1].h, dayC[2].h) : null;
    P._orbLow = dayC.length >= 3 ? Math.min(dayC[0].l, dayC[1].l, dayC[2].l) : null;
    const pvix = [...vix].filter((x) => x.d < d).pop(); if (!pvix) continue; const vixv = pvix.c / 100; const expiry = M.weeklyTuesday(d);
    let nTrades = 0, wins = 0, losses = 0, lastExit = 0, busyUntil = 0; const sb = spotBars.get(d) || [];
    const earliestPossible = P.orb ? Math.min(P.startHhmm, 9 * 60 + 30) : P.startHhmm; // ORB gets its own earlier gate
    for (let j = 1; j < dayC.length; j++) {
      const cur = dayC[j]; const i = fut.indexOf(cur); const T = cur.t + 300e3, hhmm = cur.m + 5;
      if (T < busyUntil) continue; if (hhmm < earliestPossible || hhmm >= P.cutoffHhmm) continue; if (hhmm >= P.deadStart && hhmm < P.deadEnd) continue;
      if (nTrades >= P.maxTrades || wins >= P.maxWins || losses >= P.maxLosses) break; if (lastExit && cur.t - lastExit < P.cooldownMin * 60e3) continue;
      const sg = detect(fut, i, P); if (!sg) continue;
      if (P.macroBias && sg.name === 'PULLBACK') { if (isBull && sg.side === 'SELL') continue; if (!isBull && sg.side === 'BUY') continue; }
      const type = sg.side === 'BUY' ? 'CE' : 'PE'; const spotNow = (spotByT.get(cur.t) || {}).c; if (!spotNow) continue;
      const step = 50, atm = Math.round((P.useSpotForStrike ? spotNow : cur.c) / step) * step; const strike = P.itm ? (type === 'CE' ? atm - step : atm + step) : atm;
      const iv = vixv * (type === 'CE' ? P.ivCE : P.ivPE); const px = (S, t) => c.bs(S, strike, c.tYears(t, expiry), iv, type);
      let ob = null; if (real) { const ins = K.chain('NIFTY', expiry, type).find((x) => +x.strike === strike); const bars = ins ? K.loadOpt(ins.tradingsymbol) : null; if (!bars) continue; const m = new Map(bars.map((b) => [b.t, b])); let lastC = null; ob = (b) => { const x = m.get(b.t); if (x) { lastC = x.c; return { o: x.o, h: x.h, l: x.l, c: x.c }; } return lastC === null ? null : { o: lastC, h: lastC, l: lastC, c: lastC }; }; const eb = m.get(cur.t); if (!eb) continue; lastC = eb.c; }
      const optBar = ob || ((b) => (type === 'CE' ? { o: px(b.o, b.t), h: px(b.h, b.t), l: px(b.l, b.t), c: px(b.c, b.t) } : { o: px(b.o, b.t), h: px(b.l, b.t), l: px(b.h, b.t), c: px(b.c, b.t) }));
      const curBar = spotByT.get(cur.t); const eBar = optBar(curBar); if (!eBar) continue; const ltp = eBar.c; const entry = c.tick(ltp + P.halfSpread); const raw = ltp;
      let sl = c.tick(raw - P.sl), tgt = c.tick(raw + P.target); const perLot = entry * lot; const lots = Math.max(1, Math.min(25, Math.floor(Math.max(2000, P.capital - Math.max(1000, P.capital * 0.15)) / perLot))) ; const useLots = P.lots > 0 ? P.lots : lots; const qty = useLots * lot;
      let costTrailed = false, locked = false, dynActive = false, partialDone = false, qtyLeft = qty; let realized = 0; let exitP = null, reason = '';
      const after = sb.filter((b) => b.t > cur.t && b.t >= T - 1);
      for (let bi = 0; bi < after.length; bi++) { const b = after[bi]; if (b.m >= 15 * 60 + 5) break; const o = optBar(b); if (!o) continue; const heldMin = (b.t + 300e3 - T) / 60e3;
        if (b.m >= 15 * 60) { exitP = o.c; reason = 'EOD'; break; }
        if (o.l <= sl) { exitP = Math.min(o.o, sl); reason = sl >= raw ? 'TRAIL' : 'SL'; break; }
        const pnlH = o.h - raw;
        if (!costTrailed && pnlH >= P.trailCostAt) { costTrailed = true; sl = Math.max(sl, c.tick(raw + 0.5)); }
        if (pnlH >= P.lockTrig && sl < raw + P.lockPts) { locked = true; sl = raw + P.lockPts; }
        if (pnlH >= P.target && !dynActive) { dynActive = true; if (sl < raw + P.t1Lock) sl = raw + P.t1Lock;
          if (!P.partial) { exitP = c.tick(raw + P.target); reason = 'TARGET'; break; }
          if (!partialDone && qtyLeft >= 2 * lot) { const bq = Math.max(1, Math.floor(qtyLeft / lot * 0.5)) * lot; realized += (c.tick(raw + P.target) - P.halfSpread - entry) * bq - c.optCharges('SELL', bq, raw + P.target); qtyLeft -= bq; partialDone = true; } }
        if (dynActive && o.h >= raw + P.target) { const d2 = c.tick(o.h - P.dynTrail); if (d2 > sl) sl = d2; }
        if (o.c <= sl) { exitP = sl; reason = sl >= raw ? 'TRAIL' : 'SL'; break; }
        if (!dynActive && heldMin >= P.stagnMin) { const pp = o.c - raw; if (pp >= P.stagnLo && pp <= P.stagnHi) { exitP = o.c; reason = 'STAGNANT'; break; } } }
      if (exitP === null) { const lb = after[after.length - 1]; const o = lb && optBar(lb); exitP = o ? o.c : raw; reason = 'EOD'; }
      const exitNet = Math.max(0.05, c.tick(exitP - P.halfSpread));
      const net = realized + (exitNet - entry) * qtyLeft - c.optCharges('BUY', qty, entry) - c.optCharges('SELL', qtyLeft, exitNet);
      const win = net > 0 && exitP >= raw + P.target * 0.99; nTrades++; if (exitP >= raw + P.target) wins++; if (net < 0) losses++; lastExit = T + 300e3 * 2; busyUntil = T + 300e3;
      trades.push({ d, side: sg.side, setup: sg.name, hhmm, strike, iv, entry: raw, exit: exitP, reason, net: Math.round(net), qty, lots: useLots, partialDone, points: exitP - raw });
      const endT = after.find((b) => b.t + 300e3 > 0 && exitP !== null) ? T : T; busyUntil = T + 300e3 * 3;
    }
  }
  return trades;
}
module.exports = { DEFAULTS, run };
if (require.main === module) { const real = process.argv[3] === 'real'; const t = run(JSON.parse(process.argv[2] || '{}'), real); const s = c.stats(t.map((x) => x.net)); console.log(JSON.stringify(s)); const rs = {}; t.forEach((x) => (rs[x.reason] = (rs[x.reason] || 0) + 1)); console.log(rs, 'avg pts', (t.reduce((a, b) => a + b.points, 0) / t.length).toFixed(2), 'days traded', new Set(t.map((x) => x.d)).size); }
