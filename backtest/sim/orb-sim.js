// "Stocks in play" opening-range breakout (Zarattini, Barbon & Aziz 2024) on the aligned NSE 5m cache.
// 09:20: rank stocks by first-bar relative volume (vs own 14-session first-bar average), keep the top N with RVOL >= min.
// Direction = colour of the opening range (first `orBars` bars). Stop-entry at the range high (long) / low (short).
// Stop = stopAtr x 14-day ATR (or the opposite end of the range). Exit at 15:05 (or a fixed R target). Zerodha costs.
const { zerodhaCosts } = require('./engine-sim');

const SLOTS = 75;
const tickOf = (p) => (p >= 10000 ? 1 : p >= 5000 ? 0.5 : p >= 2000 ? 0.1 : 0.05);
const pathPts = (o, h, l, c) => (c >= o ? [l, h, c] : [h, l, c]);

const ORB_DEFAULTS = {
  orBars: 1, topN: 20, minRvol: 1, minPrice: 30, minAvgValueCr: 10, minAtrPct: 0,
  stopMode: 'ATR', stopAtr: 0.1, targetR: null, exitSlot: 70, entryDeadlineSlot: 69,
  rankBy: 'RVOL', directions: ['LONG', 'SHORT'], skipDoji: true,
  slipTicks: 1, slipPct: 0.01, notional: 50000, costs: true,
  maxGapPct: null, minGapAlign: false, rvolDays: 14, chaseMax: null,
};

function runOrb(data, userCfg = {}) {
  const cfg = { ...ORB_DEFAULTS, ...userCfg };
  const { S, D, N, f, dOpen, dHigh, dLow, dClose, dVal } = data;
  const K = (st, d, s) => st * N + d * SLOTS + s;
  const dirs = new Set(cfg.directions);
  const trades = [];
  const slip = (px, tick, adv) => px + adv * (cfg.slipTicks * tick + px * cfg.slipPct / 100);
  const ob = cfg.orBars;

  for (let d = 15; d < D; d++) {
    const cands = [];
    for (let st = 0; st < S; st++) {
      // opening range = first ob bars, all present
      let oo = NaN, oh = -Infinity, ol = Infinity, oc = NaN, ov = 0, ok = true;
      for (let s = 0; s < ob; s++) { const k = K(st, d, s); if (!(f.c[k] > 0)) { ok = false; break; } if (s === 0) oo = f.o[k]; oh = Math.max(oh, f.h[k]); ol = Math.min(ol, f.l[k]); oc = f.c[k]; ov += f.v[k]; }
      if (!ok || oc < cfg.minPrice) continue;
      // first-ob-bar volume over `rvolDays` sessions; daily range (ATR) and traded value over 14 sessions
      let vs = 0, vn = 0, tr = 0, tn = 0, val = 0;
      for (let b = 1; b <= Math.max(14, cfg.rvolDays); b++) {
        const dd = d - b; const j = st * D + dd;
        if (dd < 0 || !(dOpen[j] > 0)) continue;
        if (b <= cfg.rvolDays) {
          let v = 0, okv = true; for (let s = 0; s < ob; s++) { const x = f.v[K(st, dd, s)]; if (!(x > 0)) { okv = false; break; } v += x; }
          if (okv) { vs += v; vn++; }
        }
        if (b <= 14) {
          const pc = dClose[j - 1] > 0 ? dClose[j - 1] : dOpen[j];
          tr += Math.max(dHigh[j], pc) - Math.min(dLow[j], pc); tn++; val += dVal[j];
        }
      }
      if (vn < Math.min(10, cfg.rvolDays - 2) || tn < 10) continue;
      const atr = tr / tn, avgValCr = val / tn / 1e7;
      if (avgValCr < cfg.minAvgValueCr) continue;
      if (atr / oc * 100 < cfg.minAtrPct) continue;
      const rvol = ov / (vs / vn);
      if (rvol < cfg.minRvol) continue;
      const dir = oc > oo ? 'LONG' : oc < oo ? 'SHORT' : null;
      if (!dir && cfg.skipDoji) continue;
      if (!dirs.has(dir)) continue;
      const pc = dClose[st * D + d - 1]; const gap = pc > 0 ? (oo - pc) / pc * 100 : 0;
      if (cfg.maxGapPct !== null && Math.abs(gap) > cfg.maxGapPct) continue;
      if (cfg.minGapAlign && (dir === 'LONG' ? gap < 0 : gap > 0)) continue;
      cands.push({ st, dir, oh, ol, oc, atr, rvol, gap });
    }
    cands.sort((a, b) => b.rvol - a.rvol);
    for (const c of cands.slice(0, cfg.topN)) {
      const long = c.dir === 'LONG';
      const trig = long ? c.oh : c.ol;
      const tick = tickOf(trig);
      let entry = null, es = -1, sl = null, risk = null, exitPx = null, reason = null, xs = -1;
      for (let s = ob; s < SLOTS; s++) {
        const k = K(c.st, d, s); if (!(f.c[k] > 0)) continue;
        const o = f.o[k], pts = pathPts(o, f.h[k], f.l[k], f.c[k]);
        if (entry === null) {
          if (s >= cfg.entryDeadlineSlot) break;
          let start = o, seg = -1, px = null;
          if (long ? o >= trig : o <= trig) { px = o; seg = 0; }
          else { let prev = o; for (let p = 0; p < pts.length; p++) { if (long ? (prev < trig && pts[p] >= trig) : (prev > trig && pts[p] <= trig)) { px = trig; seg = p; break; } prev = pts[p]; } }
          if (px === null) continue;
          if (cfg.chaseMax !== null && Math.abs(px - trig) > cfg.chaseMax * (cfg.stopMode === 'RANGE' ? (c.oh - c.ol) : cfg.stopAtr * c.atr)) break;
          entry = slip(px, tick, long ? 1 : -1); es = s;
          const stopDist = cfg.stopMode === 'RANGE' ? Math.max(tick * 4, c.oh - c.ol) : Math.max(tick * 4, cfg.stopAtr * c.atr);
          sl = long ? entry - stopDist : entry + stopDist; risk = stopDist;
          const tgt = cfg.targetR ? (long ? entry + cfg.targetR * risk : entry - cfg.targetR * risk) : null;
          // rest of the entry bar
          let prev = px; const rest = pts.slice(seg);
          for (const q of rest) { if (long ? q <= sl : q >= sl) { exitPx = slip(sl, tick, long ? -1 : 1); reason = 'SL'; xs = s; break; } if (tgt !== null && (long ? q >= tgt : q <= tgt)) { exitPx = tgt; reason = 'TARGET'; xs = s; break; } prev = q; }
          if (exitPx !== null) break;
          c.tgt = tgt;
          continue;
        }
        if (s >= cfg.exitSlot) { exitPx = slip(o, tick, long ? -1 : 1); reason = 'EOD'; xs = s; break; }
        // gap through stop/target at the open
        if (long ? o <= sl : o >= sl) { exitPx = slip(o, tick, long ? -1 : 1); reason = 'SL'; xs = s; break; }
        if (c.tgt != null && (long ? o >= c.tgt : o <= c.tgt)) { exitPx = o; reason = 'TARGET'; xs = s; break; }
        let prev = o, done = false;
        for (const q of pts) {
          if (long ? (prev > sl && q <= sl) : (prev < sl && q >= sl)) { exitPx = slip(sl, tick, long ? -1 : 1); reason = 'SL'; xs = s; done = true; break; }
          if (c.tgt != null && (long ? (prev < c.tgt && q >= c.tgt) : (prev > c.tgt && q <= c.tgt))) { exitPx = c.tgt; reason = 'TARGET'; xs = s; done = true; break; }
          prev = q;
        }
        if (done) break;
      }
      if (entry === null) continue;
      if (exitPx === null) { for (let s = SLOTS - 1; s >= 0; s--) { const k = K(c.st, d, s); if (f.c[k] > 0) { exitPx = f.c[k]; break; } } reason = 'EOD'; }
      const qty = Math.max(1, Math.floor(cfg.notional / entry));
      const gross = (long ? exitPx - entry : entry - exitPx) * qty;
      const cost = cfg.costs ? zerodhaCosts((long ? entry : exitPx) * qty, (long ? exitPx : entry) * qty) : 0;
      const riskRs = risk * qty;
      trades.push({ day: data.meta.days[d], sym: data.meta.stocks[c.st], side: c.dir, type: 'ORB', entrySlot: es, exitSlot: xs, entry, exit: exitPx, qty, riskRs, gross, cost, net: gross - cost, R: gross / riskRs, netR: (gross - cost) / riskRs, reason, slPct: risk / entry * 100, rvol: c.rvol, gap: c.gap, notional: entry * qty });
    }
  }
  return trades;
}

module.exports = { runOrb, ORB_DEFAULTS };
