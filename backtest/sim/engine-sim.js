// EMA-VWAP AUTO-mode pipeline simulator on the aligned 5m cache (sim/prep.js).
// Mirrors apps/auth-service/src/strategy/smart-stock-picker.ts (getTopCandidateStocks) and emavwap.engine.ts
// (auto scan -> evaluateStockSetupRaw + volume gate -> arm -> trigger -> placeTrade SL/target/qty -> exits -> daily locks),
// at 5m resolution with an OHLC path model (green bar o->l->h->c, red bar o->h->l->c), Zerodha intraday costs and slippage.
// Every rule that differs from the live engine is a named option in DEFAULTS so variants can be compared.
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, 'cache');
const SLOTS = 75;

function loadData() {
  const meta = JSON.parse(fs.readFileSync(path.join(CACHE, 'meta.json'), 'utf8'));
  const S = meta.stocks.length, D = meta.days.length, N = D * SLOTS;
  const f = {};
  for (const name of meta.fields) {
    const buf = fs.readFileSync(path.join(CACHE, `${name}.f32`));
    f[name] = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  }
  const rd = (n) => { const b = fs.readFileSync(path.join(CACHE, n)); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
  const niftyC = rd('nifty_c.f32'), niftyO = rd('nifty_o.f32');
  // Per stock-day summaries.
  const SD = S * D;
  const dOpen = new Float32Array(SD).fill(NaN), dHigh = new Float32Array(SD).fill(NaN), dLow = new Float32Array(SD).fill(NaN), dClose = new Float32Array(SD).fill(NaN);
  const dVal = new Float32Array(SD).fill(0); // traded value (Rs) of the whole day
  for (let st = 0; st < S; st++) {
    const base = st * N;
    for (let d = 0; d < D; d++) {
      let o = NaN, h = -Infinity, l = Infinity, c = NaN, val = 0;
      for (let s = 0; s < SLOTS; s++) {
        const k = base + d * SLOTS + s; const cc = f.c[k];
        if (!(cc > 0)) continue;
        if (Number.isNaN(o)) o = f.o[k];
        if (f.h[k] > h) h = f.h[k];
        if (f.l[k] < l) l = f.l[k];
        c = cc; val += cc * f.v[k];
      }
      const j = st * D + d;
      if (!Number.isNaN(o)) { dOpen[j] = o; dHigh[j] = h; dLow[j] = l; dClose[j] = c; dVal[j] = val; }
    }
  }
  return { meta, S, D, N, f, niftyC, niftyO, dOpen, dHigh, dLow, dClose, dVal };
}

const DEFAULTS = {
  capital: 15000,          // live free cash (sizing + price filter)
  stopLossRs: 500,         // max loss per trade (risk sizing) and daily loss lock
  targetRs: 500,           // daily profit lock
  maxTradesPerDay: 2,
  dailyLock: true,
  scanDepth: 20,
  // picker
  turnoverW: 20, turnoverCap: 200,
  wPrev: 220, wOpen: 180, wExt: 90, wRange: 80,
  rvolBoost: true, pdhBoost: true,
  minPrice: 30,
  chaseMaxFromOpenPct: null,   // skip candidates already this far from the open (null = off, live)
  chaseMaxDayPct: null,
  minTurnoverCr: 0,            // extra liquidity floor at scan time
  // setups
  setups: ['DIRECT', 'OPEN_DRIVE', 'PULLBACK_REJECTION', 'TREND_BREAKDOWN', 'TREND_CONT_SHORT', 'INSIDE_CANDLE'],
  longTrendBreakout: false,    // TREND_BREAKOUT is disabled for longs in live config
  requireTrendMatch: false,    // setup direction must equal the picker's LONG/SHORT
  directions: ['LONG', 'SHORT'],
  volumeGate: true, minZ: 1.5, rvolFloor: 1.5, minRvolFallback: 2.5,
  // timing (slot = 5m bar index, 0 = 09:15)
  firstEntrySlot: 0,           // earliest setup candle (0 = 09:15 bar -> scan at 09:20)
  entryCutoffSlot: 69,         // no entries at/after 15:00
  // stop / target
  minSlPct: 0.85, maxSlPct: 2.2,
  targetMode: 'FULL',          // FULL (0.5 x ATR, 0.5R..2R) | R (fixed multiple) | EMA (5m close beyond 15-EMA) | PARTIAL
  targetAtrMult: 0.5, targetMinR: 0.5, targetMaxR: 2,
  targetR: 1.5,
  stagnation: true, stagnationBars: 7, stagnationPct: 0.25,
  reEntry: false,              // live: the scanner moves activeSymbol off the exited (cooled-down) stock, which drops the re-entry
  marketFilterPct: null,       // block LONG when NIFTY < -x% from open, SHORT when > +x% (null = off)
  // costs
  slipTicks: 1, slipPct: 0.01, // adverse per stop/market fill: ticks + % of price
  costs: true,
};

const tickOf = (p) => (p >= 10000 ? 1 : p >= 5000 ? 0.5 : p >= 2000 ? 0.1 : 0.05);
const roundTick = (p, t) => Math.round(p / t) * t;

function zerodhaCosts(buyVal, sellVal) {
  const brk = Math.min(20, 0.0003 * buyVal) + Math.min(20, 0.0003 * sellVal);
  const stt = 0.00025 * sellVal;
  const exch = 0.0000297 * (buyVal + sellVal);
  const sebi = 0.000001 * (buyVal + sellVal);
  const gst = 0.18 * (brk + exch + sebi);
  const stamp = 0.00003 * buyVal;
  return brk + stt + exch + sebi + gst + stamp;
}

// First level crossed along an OHLC path that starts at `start` (price) and visits `pts` in order.
// checks: [{ level, up }] (up = triggers when price >= level). Returns { i, price, seg } or null.
function firstHit(start, pts, checks) {
  let prev = start;
  for (const c of checks) if (c.up ? prev >= c.level : prev <= c.level) return { i: checks.indexOf(c), price: prev, seg: 0, gap: true };
  for (let p = 0; p < pts.length; p++) {
    const next = pts[p];
    let best = null, bestDist = Infinity;
    for (let ci = 0; ci < checks.length; ci++) {
      const c = checks[ci];
      const hit = c.up ? (prev < c.level && next >= c.level) : (prev > c.level && next <= c.level);
      if (hit) { const dist = Math.abs(c.level - prev); if (dist < bestDist) { bestDist = dist; best = ci; } }
    }
    if (best !== null) return { i: best, price: checks[best].level, seg: p, gap: false };
    prev = next;
  }
  return null;
}
const pathPts = (o, h, l, c) => (c >= o ? [l, h, c] : [h, l, c]);

function makeSim(data, userCfg = {}) {
  const cfg = { ...DEFAULTS, ...userCfg };
  const { S, D, N, f, dOpen, dHigh, dLow, dClose } = data;
  const setupsOn = new Set(cfg.setups);
  const dirsOn = new Set(cfg.directions);

  const K = (st, d, s) => st * N + d * SLOTS + s;
  const valid = (k) => f.c[k] > 0;

  // previous valid bar index (crosses into earlier days), or -1
  const prevBar = (st, d, s) => {
    let dd = d, ss = s - 1;
    for (let guard = 0; guard < 200; guard++) {
      if (ss < 0) { dd--; ss = SLOTS - 1; if (dd < 0) return -1; }
      const k = K(st, dd, ss); if (valid(k)) return k; ss--;
    }
    return -1;
  };
  // last n valid bars ending at (d, s), most recent last
  const lastBars = (st, d, s, n) => {
    const out = [];
    let dd = d, ss = s;
    for (let guard = 0; guard < 300 && out.length < n; guard++) {
      if (ss < 0) { dd--; ss = SLOTS - 1; if (dd < 0) break; }
      const k = K(st, dd, ss); if (valid(k)) out.push(k); ss--;
    }
    return out.reverse();
  };
  // engine fetches ~5 calendar days -> ~3 prior sessions
  const atrPct = (st, d) => {
    let sum = 0, n = 0;
    for (let k = 1; k <= 3 && d - k >= 0; k++) { const j = st * D + d - k; if (dOpen[j] > 0) { sum += (dHigh[j] - dLow[j]) / dOpen[j] * 100; n++; } }
    const a = n ? sum / n : 2.5;
    return Math.max(1.2, Math.min(10, a));
  };

  function volumeOk(st, d, s) {
    if (!cfg.volumeGate) return true;
    const k = K(st, d, s); const vol = f.v[k];
    const hist = [];
    for (let back = 1; back <= 14 && hist.length < 10 && d - back >= 0; back++) { const v = f.v[K(st, d - back, s)]; if (v > 0) hist.push(v); }
    if (vol > 0 && hist.length >= 6) {
      const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
      const logs = hist.map(Math.log); const lm = logs.reduce((a, b) => a + b, 0) / logs.length;
      const sd = Math.max(0.2, Math.sqrt(logs.reduce((a, b) => a + (b - lm) ** 2, 0) / (logs.length - 1)));
      return (Math.log(vol) - lm) / sd >= cfg.minZ && vol / mean >= cfg.rvolFloor;
    }
    if (hist.length >= 2) { const base = hist.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, hist.length); return vol / base >= cfg.minRvolFallback; }
    return true;
  }

  // ── evaluateStockSetupRaw port. Returns setup or null. ──
  function evalSetup(st, d, s) {
    const kc = K(st, d, s); if (!valid(kc)) return null;
    const kp = prevBar(st, d, s); if (kp < 0) return null;
    const cl = f.c[kc], op = f.o[kc], hi = f.h[kc], lo = f.l[kc];
    const ce = f.ema[kc], cv = f.vwap[kc], pe = f.ema[kp];
    if (!(ce > 0) || !(cv > 0) || !(pe > 0)) return null;
    // today's bars
    const today = [];
    for (let ss = 0; ss <= s; ss++) { const k = K(st, d, ss); if (valid(k)) today.push(k); }
    if (!today.length) return null;
    const dayOpen = f.o[today[0]];
    let dayHigh = -Infinity, dayLow = Infinity;
    for (const k of today) { if (f.h[k] > dayHigh) dayHigh = f.h[k]; if (f.l[k] < dayLow) dayLow = f.l[k]; }
    const moveFromOpenPct = dayOpen > 0 ? (cl - dayOpen) / dayOpen * 100 : 0;
    const atr = atrPct(st, d);
    const extPct = Math.max(4.5, Math.min(14, atr * 1.6));
    const exhaustPct = Math.max(3, Math.min(12, atr * 1.35));
    const recent = lastBars(st, d, s, 10);
    const avgRangePct = recent.reduce((a, k) => a + (f.h[k] - f.l[k]) / (f.c[k] || 1) * 100, 0) / Math.max(1, recent.length);
    const dynMaxEmaDist = Math.max(0.75, Math.min(2.2, avgRangePct * 1.8));
    const lookback = Math.min(6, Math.max(3, today.length));
    const shelf = today.slice(Math.max(0, today.length - lookback));
    let shelfLow = Infinity, shelfHigh = -Infinity;
    for (const k of shelf) { if (f.l[k] < shelfLow) shelfLow = f.l[k]; if (f.h[k] > shelfHigh) shelfHigh = f.h[k]; }
    const tick = tickOf(cl);
    const vb = Math.max(tick * 4, cl * (avgRangePct * 0.01 * 0.35));
    const minB = Math.max(tick * 8, cl * cfg.minSlPct / 100), maxB = Math.max(tick * 15, cl * cfg.maxSlPct / 100);
    const shelfSl = (dir, ext) => {
      if (dir === 'LONG') {
        const sw = (dayLow > 0 && cl - dayLow <= maxB) ? Math.min(dayLow, shelfLow, ext) : Math.min(shelfLow, ext);
        return roundTick(cl - Math.min(maxB, Math.max(minB, cl - (sw - vb))), tick);
      }
      const sw = (dayHigh > 0 && dayHigh - cl <= maxB) ? Math.max(dayHigh, shelfHigh, ext) : Math.max(shelfHigh, ext);
      return roundTick(cl + Math.min(maxB, Math.max(minB, sw + vb - cl)), tick);
    };
    const mk = (trend, type, trig, sl, candleSlot, boost) => ({ trend, type, trigger: trig, sl, candleSlot, boost, atr });

    // 1. fresh crossover (latest today, within 2 bars, still valid, not exhausted)
    if (setupsOn.has('DIRECT')) {
      let latest = null, ci = -1;
      for (let ss = 1; ss <= s; ss++) {
        const k = K(st, d, ss), k0 = K(st, d, ss - 1);
        if (!valid(k) || !valid(k0)) continue;
        const e0 = f.ema[k0], e1 = f.ema[k], v0 = f.vwap[k0], v1 = f.vwap[k];
        if (!(e0 > 0 && e1 > 0)) continue;
        const c1 = f.c[k], o1 = f.o[k];
        if (e0 <= v0 && e1 > v1 && c1 >= v1 && c1 >= e1 && c1 >= o1) { latest = 'LONG'; ci = ss; }
        else if (e0 >= v0 && e1 < v1 && c1 <= v1 && c1 <= e1 && c1 <= o1) { latest = 'SHORT'; ci = ss; }
      }
      if (latest && s - ci <= 2 && Math.abs(cl - dayOpen) / dayOpen * 100 <= exhaustPct) {
        const ok = latest === 'LONG' ? (ce > cv && cl >= cv * 0.998) : (ce < cv && cl <= cv * 1.002);
        if (ok) {
          const kx = K(st, d, ci); const isL = latest === 'LONG';
          return mk(latest, 'DIRECT', isL ? f.h[kx] : f.l[kx], shelfSl(latest, isL ? f.l[kx] : f.h[kx]), ci, 500);
        }
      }
    }
    // 2. opening range drive (2..8 bars today)
    if (setupsOn.has('OPEN_DRIVE') && today.length >= 2 && today.length <= 8) {
      const orh = f.h[today[0]], orl = f.l[today[0]];
      if (cl < op && cl <= cv && cl <= ce) {
        const broke = lo <= orl * 1.002 || cl < orl;
        const rej = dayHigh > 0 && (dayHigh - cl) / dayHigh >= 0.015;
        const dist = (ce - cl) / cl * 100;
        if ((broke || rej) && dist <= Math.max(4, dynMaxEmaDist * 2) && Math.abs(moveFromOpenPct) <= extPct) return mk('SHORT', 'OPEN_DRIVE', lo, shelfSl('SHORT', Math.max(hi, cv)), s, 520);
      }
      if (cl > op && cl >= cv && cl >= ce) {
        const broke = hi >= orh * 0.998 || cl > orh;
        const bnc = dayLow > 0 && (cl - dayLow) / dayLow >= 0.015;
        const dist = (cl - ce) / cl * 100;
        if ((broke || bnc) && dist <= Math.max(4, dynMaxEmaDist * 2) && moveFromOpenPct <= extPct) return mk('LONG', 'OPEN_DRIVE', hi, shelfSl('LONG', Math.min(lo, cv)), s, 520);
      }
    }
    const down = cl <= cv && cl <= ce, up = cl >= cv && cl >= ce;
    // 3. pullback rejection
    if (setupsOn.has('PULLBACK_REJECTION') && today.length >= 3) {
      if (down && (f.h[kp] >= pe * 0.998 || hi >= ce * 0.998) && cl < op && cl < ce) return mk('SHORT', 'PULLBACK_REJECTION', lo, shelfSl('SHORT', hi), s, 450);
      if (up && (f.l[kp] <= pe * 1.002 || lo <= ce * 1.002) && cl > op && cl > ce) return mk('LONG', 'PULLBACK_REJECTION', hi, shelfSl('LONG', lo), s, 450);
    }
    // 4. day-low breakdown / day-high breakout
    if (today.length >= 2) {
      let sumV = 0; for (const k of today) sumV += f.v[k];
      const surge = f.v[kc] >= sumV / today.length * 1.15;
      if (setupsOn.has('TREND_BREAKDOWN') && down) {
        let pl = Infinity; for (let i = 0; i < today.length - 1; i++) pl = Math.min(pl, f.l[today[i]]); if (pl === Infinity) pl = lo;
        const dist = (ce - cl) / cl * 100;
        const over = dist > Math.max(3.8, dynMaxEmaDist * 2) || Math.abs(moveFromOpenPct) > extPct;
        if (!over && (lo <= pl * 1.003 || moveFromOpenPct <= -1)) {
          const pdl = dLow[st * D + d - 1];
          return mk('SHORT', 'TREND_BREAKDOWN', Math.min(pl, lo), shelfSl('SHORT', hi), s, 350 + Math.round(Math.abs(moveFromOpenPct) * 40) + (surge ? 80 : 0) + (pdl && lo <= pdl ? 120 : 0));
        }
      }
      if (cfg.longTrendBreakout && up) {
        let ph = -Infinity; for (let i = 0; i < today.length - 1; i++) ph = Math.max(ph, f.h[today[i]]); if (ph === -Infinity) ph = hi;
        const dist = (cl - ce) / cl * 100;
        const over = dist > Math.max(3.8, dynMaxEmaDist * 2) || moveFromOpenPct > extPct;
        if (!over && (hi >= ph * 0.997 || moveFromOpenPct >= 1)) return mk('LONG', 'TREND_BREAKOUT', Math.max(ph, hi), shelfSl('LONG', lo), s, 350 + Math.round(moveFromOpenPct * 40) + (surge ? 80 : 0));
      }
      // 5. trend continuation
      if (setupsOn.has('TREND_CONT_SHORT') && down) {
        const dist = (ce - cl) / cl * 100;
        if (dist <= Math.max(4, dynMaxEmaDist * 2) && Math.abs(moveFromOpenPct) <= extPct) return mk('SHORT', 'TREND_CONT_SHORT', lo, shelfSl('SHORT', Math.max(hi, ce)), s, 320 + (surge ? 60 : 0));
      }
      if (cfg.longTrendBreakout && up) {
        const dist = (cl - ce) / cl * 100;
        if (dist <= Math.max(4, dynMaxEmaDist * 2) && moveFromOpenPct <= extPct) return mk('LONG', 'TREND_CONT_LONG', hi, shelfSl('LONG', Math.min(lo, ce)), s, 320 + (surge ? 60 : 0));
      }
    }
    // 6. inside candle
    if (setupsOn.has('INSIDE_CANDLE') && (up || down) && hi <= f.h[kp] && lo >= f.l[kp]) {
      const tr = up ? 'LONG' : 'SHORT';
      return mk(tr, 'INSIDE_CANDLE', tr === 'LONG' ? f.h[kp] : f.l[kp], shelfSl(tr, tr === 'LONG' ? f.l[kp] : f.h[kp]), s, 180);
    }
    return null;
  }

  function evalSetupGated(st, d, s) {
    const su = evalSetup(st, d, s);
    if (!su || !dirsOn.has(su.trend)) return null;
    if (!volumeOk(st, d, su.candleSlot)) return null;
    return su;
  }

  // ── smart picker at the close of bar s ──
  // expCum: per stock expected cumulative volume curve for day d (avg of prior 10 sessions), computed once per day.
  function pickerTopN(d, s, run, expCum, excluded) {
    const maxBP = cfg.capital * 5;
    const opening = s === 0; // quote at 09:20 = after the first bar
    const res = [];
    for (let st = 0; st < S; st++) {
      if (excluded.has(st)) continue;
      const k = K(st, d, s); if (!valid(k)) continue;
      const ltp = f.c[k];
      if (ltp < Math.max(30, cfg.minPrice) || ltp > maxBP) continue;
      const pc = dClose[st * D + d - 1]; if (!(pc > 0)) continue;
      const ro = run.open[st], rh = run.high[st], rl = run.low[st], vol = run.vol[st];
      if (!(ro > 0)) continue;
      if (Math.abs(ro - pc) / pc * 100 > 15) continue;
      const fromOpen = (ltp - ro) / ro * 100, day = (ltp - pc) / pc * 100, range = (rh - rl) / ro * 100;
      const turnCr = vol * ltp / 1e7;
      if (turnCr < (opening ? 0.1 : 0.3) && vol < (opening ? 1000 : 5000)) continue;
      if (turnCr < cfg.minTurnoverCr) continue;
      const isOL = Math.abs(ro - rl) / ro <= 0.0025 && ltp > ro && fromOpen >= 0.2;
      const isOH = Math.abs(rh - ro) / ro <= 0.0025 && ltp < ro && fromOpen <= -0.2;
      if (Math.abs(fromOpen) < 0.2 && Math.abs(day) < 0.5 && range < 0.6 && !isOL && !isOH) continue;
      if (Math.abs(day) >= 19 || Math.abs(fromOpen) >= 17) continue;
      if (cfg.chaseMaxFromOpenPct !== null && Math.abs(fromOpen) > cfg.chaseMaxFromOpenPct) continue;
      if (cfg.chaseMaxDayPct !== null && Math.abs(day) > cfg.chaseMaxDayPct) continue;
      const fromLow = rl > 0 ? (ltp - rl) / rl * 100 : 0, fromHigh = rh > 0 ? (rh - ltp) / rh * 100 : 0;
      const tw = Math.min(turnCr, cfg.turnoverCap) * cfg.turnoverW;
      const shortScore = Math.round(Math.max(0, -day) * cfg.wPrev + Math.max(0, -fromOpen) * cfg.wOpen + fromHigh * cfg.wExt + range * cfg.wRange + tw + (isOH ? 250 : 0));
      const longScore = Math.round(Math.max(0, day) * cfg.wPrev + Math.max(0, fromOpen) * cfg.wOpen + fromLow * cfg.wExt + range * cfg.wRange + tw + (isOL ? 250 : 0));
      res.push({ st, ltp, trend: longScore >= shortScore ? 'LONG' : 'SHORT', score: Math.max(longScore, shortScore), vol });
    }
    res.sort((a, b) => b.score - a.score);
    if (cfg.rvolBoost) {
      for (const c of res.slice(0, 40)) {
        const e = expCum[c.st]; if (!e) continue;
        const exp = e[s]; if (exp > 0) c.score += Math.min(250, Math.round(c.vol / exp * 60));
      }
      res.sort((a, b) => b.score - a.score);
    }
    const top = res.slice(0, Math.max(cfg.scanDepth, 12));
    if (cfg.pdhBoost) {
      for (const c of top) {
        const j = c.st * D + d - 1; const pdh = dHigh[j], pdl = dLow[j], pdc = dClose[j];
        if (c.trend === 'LONG' && pdh > 0) { if (c.ltp >= pdh) c.score += 400; else if ((pdh - c.ltp) / c.ltp * 100 < 0.8) c.score -= 500; }
        else if (c.trend === 'SHORT' && pdl > 0) { if (c.ltp <= pdl) c.score += 400; else if ((c.ltp - pdl) / c.ltp * 100 < 0.8) c.score -= 500; }
        if (pdc > 0 && ((c.trend === 'LONG' && c.ltp > pdc) || (c.trend === 'SHORT' && c.ltp < pdc))) c.score += 200;
      }
    }
    // live re-sorts the whole list after the boosts, then slices to the limit
    res.sort((a, b) => b.score - a.score);
    return res.slice(0, cfg.scanDepth);
  }

  // placeTrade: SL + target + qty
  function sizeTrade(st, d, side, entry, motherLow, motherHigh, atr) {
    const tick = tickOf(entry);
    const maxD = Math.max(tick * 15, entry * cfg.maxSlPct / 100), minD = Math.max(tick * 8, entry * cfg.minSlPct / 100);
    let sl;
    if (side === 'LONG') {
      let raw;
      if (motherLow && motherLow < entry) { const b = Math.max(tick * 4, motherLow * 0.002); raw = motherLow <= entry - b ? motherLow - b : entry - b; }
      else raw = entry - Math.max(tick * 10, entry * 0.011);
      sl = roundTick(Math.min(entry - minD, Math.max(raw, entry - maxD)), tick);
      if (sl >= entry) sl = roundTick(entry - tick * 5, tick);
    } else {
      let raw;
      if (motherHigh && motherHigh > entry) { const b = Math.max(tick * 4, motherHigh * 0.002); raw = motherHigh >= entry + b ? motherHigh + b : entry + b; }
      else raw = entry + Math.max(tick * 10, entry * 0.011);
      sl = roundTick(Math.max(entry + minD, Math.min(raw, entry + maxD)), tick);
      if (sl <= entry) sl = roundTick(entry + tick * 5, tick);
    }
    const risk = Math.max(tick, Math.abs(entry - sl));
    let dist;
    if (cfg.targetMode === 'R') dist = risk * cfg.targetR;
    else dist = Math.min(risk * cfg.targetMaxR, Math.max(risk * cfg.targetMinR, entry * atr / 100 * cfg.targetAtrMult));
    dist = Math.max(dist, tick * 3);
    const tgt = roundTick(side === 'LONG' ? entry + dist : entry - dist, tick);
    const deploy = cfg.capital * 0.85;
    const affordable = Math.floor(deploy / (entry / 5));
    if (affordable < 1) return null;
    const riskQty = Math.floor(cfg.stopLossRs / risk);
    if (riskQty < 1) return null;
    const capQty = Math.max(1, Math.floor(cfg.capital * 0.5 * 5 / entry));
    const qty = Math.max(1, Math.min(riskQty, capQty, affordable));
    return { sl, tgt, risk, qty, tick };
  }

  function run(dayFrom = 0, dayTo = D) {
    const trades = [];
    const ring = Array.from({ length: S }, () => []); // last 10 cumulative-volume curves per stock
    for (let d = 0; d < D; d++) {
      // expected cumulative curve for today from prior sessions
      const expCum = new Array(S);
      for (let st = 0; st < S; st++) {
        const r = ring[st]; if (r.length < 3) { expCum[st] = null; continue; }
        const e = new Float32Array(SLOTS);
        for (let s = 0; s < SLOTS; s++) { let sum = 0; for (const cur of r) sum += cur[s]; e[s] = sum / r.length; }
        expCum[st] = e;
      }
      if (d >= dayFrom && d < dayTo && d >= 11) simulateDay(d, expCum, trades);
      // push today's curve
      for (let st = 0; st < S; st++) {
        const cur = new Float32Array(SLOTS); let run = 0, any = false;
        for (let s = 0; s < SLOTS; s++) { const v = f.v[K(st, d, s)]; if (v > 0) { run += v; any = true; } cur[s] = run; }
        if (any) { ring[st].push(cur); if (ring[st].length > 10) ring[st].shift(); }
      }
    }
    return trades;
  }

  function simulateDay(d, expCum, trades) {
    const run = { open: new Float32Array(S).fill(NaN), high: new Float32Array(S), low: new Float32Array(S), vol: new Float32Array(S) };
    let pos = null, armed = null, nTrades = 0, dayPnl = 0, locked = false, reEntry = null, reEntryUsed = false;
    const cooldown = new Map(); // st -> slot until (exclusive)
    const invalidated = new Set(); // `${st}:${candleSlot}`
    const nC = data.niftyC, nO = data.niftyO;
    const niftyOpen = nO[d * SLOTS];

    const closeTrade = (exitPx, slot, reason) => {
      const p = pos; const long = p.side === 'LONG';
      const gross = (long ? exitPx - p.entry : p.entry - exitPx) * p.qty;
      const buyVal = (long ? p.entry : exitPx) * p.qty, sellVal = (long ? exitPx : p.entry) * p.qty;
      const cost = cfg.costs ? zerodhaCosts(buyVal, sellVal) : 0;
      const riskRs = p.risk * p.qty;
      trades.push({ day: data.meta.days[d], sym: data.meta.stocks[p.st], side: p.side, type: p.type, entrySlot: p.slot, exitSlot: slot, entry: p.entry, exit: exitPx, qty: p.qty, riskRs, gross, cost, net: gross - cost, R: gross / riskRs, netR: (gross - cost) / riskRs, reason, slPct: p.risk / p.entry * 100, notional: p.entry * p.qty });
      dayPnl += gross;
      cooldown.set(p.st, slot + 9); // 45 min
      if (cfg.reEntry && reason === 'TARGET' && long && !reEntryUsed) reEntry = { st: p.st, swing: exitPx };
      pos = null;
      if (cfg.dailyLock && (dayPnl >= cfg.targetRs || dayPnl <= -cfg.stopLossRs)) locked = true;
    };
    const slip = (px, tick, adverse) => px + adverse * (cfg.slipTicks * tick + px * cfg.slipPct / 100);

    const openTrade = (st, side, entryPx, slot, type, motherLow, motherHigh, atr) => {
      if (locked || nTrades >= cfg.maxTradesPerDay) return false;
      if (cfg.marketFilterPct !== null && niftyOpen > 0) {
        const nc = nC[d * SLOTS + slot]; const chg = (nc - niftyOpen) / niftyOpen * 100;
        if (side === 'LONG' && chg < -cfg.marketFilterPct) return false;
        if (side === 'SHORT' && chg > cfg.marketFilterPct) return false;
      }
      const z = sizeTrade(st, d, side, entryPx, motherLow, motherHigh, atr);
      if (!z) return false;
      const fill = slip(entryPx, z.tick, side === 'LONG' ? 1 : -1);
      pos = { st, side, entry: fill, sl: z.sl, tgt: z.tgt, risk: Math.abs(fill - z.sl), qty: z.qty, slot, type, tick: z.tick, atr };
      nTrades++;
      return true;
    };

    // manage open position along bar `s` path starting at `startPx` (after entry) / bar open
    const manage = (s, startPx, pts, entryBar) => {
      const p = pos; const long = p.side === 'LONG';
      const checks = [{ level: p.sl, up: !long, kind: 'SL' }];
      if (cfg.targetMode === 'FULL' || cfg.targetMode === 'R') checks.push({ level: long ? p.tgt + p.tick : p.tgt - p.tick, up: long, kind: 'TARGET' });
      const stag = cfg.stagnation && !entryBar && s - p.slot >= cfg.stagnationBars;
      if (stag) {
        const up = p.entry * (1 + cfg.stagnationPct / 100), dn = p.entry * (1 - cfg.stagnationPct / 100);
        if (startPx <= up && startPx >= dn) { closeTrade(slip(startPx, p.tick, long ? -1 : 1), s, 'STAGNATION'); return; }
        checks.push({ level: startPx > up ? up : dn, up: !(startPx > up), kind: 'STAGNATION' });
      }
      const hit = firstHit(startPx, pts, checks);
      if (!hit) return;
      const c = checks[hit.i];
      if (c.kind === 'SL') closeTrade(slip(hit.gap ? hit.price : p.sl, p.tick, long ? -1 : 1), s, 'SL');
      else if (c.kind === 'TARGET') closeTrade(hit.gap ? hit.price : p.tgt, s, 'TARGET');
      else closeTrade(slip(c.level, p.tick, long ? -1 : 1), s, 'STAGNATION');
    };

    for (let s = 0; s < SLOTS; s++) {
      // running day stats including bar s (quote at its close)
      for (let st = 0; st < S; st++) {
        const k = K(st, d, s); if (!valid(k)) continue;
        if (Number.isNaN(run.open[st])) { run.open[st] = f.o[k]; run.high[st] = f.h[k]; run.low[st] = f.l[k]; run.vol[st] = 0; }
        if (f.h[k] > run.high[st]) run.high[st] = f.h[k];
        if (f.l[k] < run.low[st]) run.low[st] = f.l[k];
        run.vol[st] += f.v[k];
      }

      // 15:05 square-off at the open of the 15:05 bar
      if (pos && s >= 70) { let px = NaN; for (let ss = s; ss >= 0 && !(px > 0); ss--) { const k = K(pos.st, d, ss); if (valid(k)) px = ss === s ? f.o[k] : f.c[k]; } closeTrade(slip(px, pos.tick, pos.side === 'LONG' ? -1 : 1), s, 'EOD'); }

      // intrabar: open position
      if (pos) {
        const k = K(pos.st, d, s);
        if (valid(k)) {
          const p = pos;
          manage(s, f.o[k], pathPts(f.o[k], f.h[k], f.l[k], f.c[k]), false);
          // 15-EMA candle-close exit (EMA mode) at the bar close
          if (pos === p && cfg.targetMode === 'EMA') { const long = p.side === 'LONG'; if (long ? f.c[k] < f.ema[k] : f.c[k] > f.ema[k]) closeTrade(slip(f.c[k], p.tick, long ? -1 : 1), s, 'EMA'); }
        }
      }

      // intrabar: armed setup waiting for its trigger
      if (!pos && armed && s > armed.slot) {
        const k = K(armed.st, d, s);
        if (s > armed.slot + armed.maxWait) {
          cooldown.set(armed.st, s + 3); invalidated.add(`${armed.st}:${armed.candleSlot}`); armed = null;
        } else if (valid(k)) {
          const long = armed.trend === 'LONG';
          const o = f.o[k], pts = pathPts(o, f.h[k], f.l[k], f.c[k]);
          const checks = [{ level: armed.trigger, up: long }];
          if (armed.inv) checks.push({ level: armed.inv, up: !long });
          const hit = firstHit(o, pts, checks);
          if (hit && hit.i === 0 && s < cfg.entryCutoffSlot) {
            const a = armed; armed = null;
            const px = hit.gap ? o : a.trigger;
            if (openTrade(a.st, a.trend, px, s, a.type, long ? a.inv : a.trigger, long ? a.trigger : a.inv, a.atr)) {
              const rest = pts.slice(hit.seg);
              manage(s, px, rest, true);
              if (pos && cfg.targetMode === 'EMA') { /* candle-close exit only from the next bar */ }
            }
          } else if (hit && hit.i === 1) {
            cooldown.set(armed.st, s + 3); invalidated.add(`${armed.st}:${armed.candleSlot}`); armed = null;
          } else if (hit && hit.i === 0) armed = null; // after cutoff
        }
      }

      // ── decisions at the close of bar s ──
      if (pos || locked || nTrades >= cfg.maxTradesPerDay) continue;
      if (s < cfg.firstEntrySlot || s + 1 >= cfg.entryCutoffSlot) continue; // instant entries at 15:00 are blocked

      // trend re-entry (long only, once a day): close above EMA, VWAP and the exit price
      if (reEntry && !armed) {
        const k = K(reEntry.st, d, s);
        if (valid(k) && f.c[k] > f.ema[k] && f.c[k] > f.vwap[k] && f.c[k] > reEntry.swing) {
          const r = reEntry; reEntry = null; reEntryUsed = true;
          openTrade(r.st, 'LONG', f.c[k], s + 1, 'REENTRY', Math.min(f.l[k], f.ema[k]), r.swing, atrPct(r.st, d));
          if (pos) continue;
        }
      }

      const idle = armed && s >= armed.slot + 1;
      if (armed && !idle) continue;
      const excluded = new Set();
      for (const [st, until] of cooldown) if (s < until) excluded.add(st);
      const cands = pickerTopN(d, s, run, expCum, excluded);
      let best = null;
      for (const c of cands) {
        const su = evalSetupGated(c.st, d, s);
        if (!su) continue;
        if (cfg.requireTrendMatch && su.trend !== c.trend) continue;
        if (invalidated.has(`${c.st}:${su.candleSlot}`)) continue;
        const score = c.score + su.boost;
        if (!best || score > best.score) best = { ...su, st: c.st, score };
      }
      if (!best) continue;
      if (armed) { if (best.st === armed.st || best.score <= 2300) continue; armed = null; }
      armed = { st: best.st, trend: best.trend, trigger: best.trigger, inv: best.sl, slot: s, candleSlot: best.candleSlot, type: best.type, atr: best.atr, maxWait: best.type === 'OPEN_DRIVE' ? 4 : 2 };
      // instant trigger: LTP (= close) already through the trigger
      const ltp = f.c[K(best.st, d, s)];
      if (armed.trend === 'LONG' ? ltp >= armed.trigger : ltp <= armed.trigger) {
        const a = armed; armed = null;
        openTrade(a.st, a.trend, ltp, s + 1, a.type, a.trend === 'LONG' ? a.inv : a.trigger, a.trend === 'LONG' ? a.trigger : a.inv, a.atr);
      }
    }
    if (pos) { const k = K(pos.st, d, SLOTS - 1); closeTrade(f.c[k] || pos.entry, SLOTS - 1, 'EOD'); }
  }

  return { run, cfg };
}

function summarize(trades, label = '') {
  const n = trades.length;
  if (!n) return { label, n: 0 };
  const sum = (a, g) => a.reduce((x, t) => x + g(t), 0);
  const netR = trades.map((t) => t.netR);
  const mean = netR.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(netR.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const net = sum(trades, (t) => t.net);
  const grossWin = sum(trades.filter((t) => t.net > 0), (t) => t.net), grossLoss = -sum(trades.filter((t) => t.net <= 0), (t) => t.net);
  let eq = 0, peak = 0, dd = 0;
  for (const t of trades) { eq += t.net; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  return {
    label, n, win: +(100 * trades.filter((t) => t.net > 0).length / n).toFixed(1),
    grossR: +(sum(trades, (t) => t.R) / n).toFixed(3), netR: +mean.toFixed(3), ci: +(1.96 * sd / Math.sqrt(n)).toFixed(3),
    costR: +(sum(trades, (t) => t.cost / t.riskRs) / n).toFixed(3),
    netRs: Math.round(net), pf: +(grossWin / Math.max(1, grossLoss)).toFixed(2), maxDD: Math.round(dd),
  };
}

function breakdown(trades, keyFn) {
  const g = new Map();
  for (const t of trades) { const k = keyFn(t); if (!g.has(k)) g.set(k, []); g.get(k).push(t); }
  return Array.from(g.entries()).sort((a, b) => (a[0] > b[0] ? 1 : -1)).map(([k, v]) => summarize(v, k));
}

module.exports = { loadData, makeSim, summarize, breakdown, DEFAULTS, zerodhaCosts };
