// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyCandle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PatternType = 'VCP' | 'ROCKET_BASE' | 'TIGHT_AREA' | 'INTRADAY_MOMENTUM' | 'DAILY_INSIDE' | 'WEEKLY_INSIDE' | 'MONTHLY_INSIDE';

export interface PatternResult {
  pattern: PatternType;
  score: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  currentPrice: number;
  pivotPrice: number;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  riskReward: number;
  riskPct: number;
  trendStrength: 'WEAK' | 'MODERATE' | 'STRONG';
  volumeSignal: 'DRYING' | 'AVERAGE' | 'EXPANDING';
  contractions: number;
  notes: string[];
}

// ─── Utility functions ────────────────────────────────────────────────────────

function sma(candles: DailyCandle[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    const slice = candles.slice(i - period + 1, i + 1);
    result.push(slice.reduce((s, c) => s + c.close, 0) / period);
  }
  return result;
}

function avgVolume(candles: DailyCandle[], period: number, endIdx: number): number {
  const slice = candles.slice(Math.max(0, endIdx - period), endIdx);
  if (slice.length === 0) return 1;
  return slice.reduce((s, c) => s + c.volume, 0) / slice.length;
}

function aggregateWeeklyCandles(daily: DailyCandle[]): DailyCandle[] {
  if (daily.length === 0) return [];
  const weekly: DailyCandle[] = [];
  const groups = new Map<string, DailyCandle[]>();

  daily.forEach(c => {
    const d = new Date(c.date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    const key = monday.toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  });

  const sortedKeys = Array.from(groups.keys()).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  sortedKeys.forEach(key => {
    const group = groups.get(key)!;
    weekly.push({
      date: group[group.length - 1].date,
      open: group[0].open,
      high: Math.max(...group.map(g => g.high)),
      low: Math.min(...group.map(g => g.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, g) => s + g.volume, 0),
    });
  });
  return weekly;
}

function aggregateMonthlyCandles(daily: DailyCandle[]): DailyCandle[] {
  if (daily.length === 0) return [];
  const monthly: DailyCandle[] = [];
  const groups = new Map<string, DailyCandle[]>();

  daily.forEach(c => {
    const d = new Date(c.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  });

  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    const [y1, m1] = a.split('-').map(Number);
    const [y2, m2] = b.split('-').map(Number);
    return y1 === y2 ? m1 - m2 : y1 - y2;
  });

  sortedKeys.forEach(key => {
    const group = groups.get(key)!;
    monthly.push({
      date: group[group.length - 1].date,
      open: group[0].open,
      high: Math.max(...group.map(g => g.high)),
      low: Math.min(...group.map(g => g.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, g) => s + g.volume, 0),
    });
  });
  return monthly;
}

// ─── Trend Template (relaxed — works with 100+ candles) ──────────────────────

function trendTemplateScore(candles: DailyCandle[]): { score: number; strength: 'WEAK' | 'MODERATE' | 'STRONG' } {
  const n = candles.length - 1;

  // Need at least 50 candles for any useful MA
  if (n < 50) return { score: 0, strength: 'WEAK' };

  const price = candles[n].close;
  const sma50v = sma(candles, Math.min(50, n))[n];
  const sma150v = n >= 149 ? sma(candles, 150)[n] : NaN;
  const sma200v = n >= 199 ? sma(candles, 200)[n] : NaN;

  const lookback52w = Math.min(252, n + 1);
  const high52w = Math.max(...candles.slice(n - lookback52w + 1).map(c => c.high));
  const low52w = Math.min(...candles.slice(n - lookback52w + 1).map(c => c.low));

  // Score each condition
  let pts = 0; let max = 0;

  // Price above 50 SMA (always available)
  max += 2; if (price > sma50v) pts += 2;
  // Within 30% of 52w high
  max += 2; if (price >= high52w * 0.70) pts += 2;
  // At least 20% above 52w low (uptrend)
  max += 1; if (price >= low52w * 1.20) pts += 1;

  if (!isNaN(sma150v)) {
    max += 2; if (price > sma150v) pts += 2;
    if (!isNaN(sma200v)) {
      max += 1; if (sma150v > sma200v) pts += 1;
      max += 1; if (price > sma200v) pts += 1;
      // 200 SMA trending up vs 1 month ago
      const sma200prev = sma(candles, 200)[Math.max(0, n - 20)];
      if (!isNaN(sma200prev)) { max += 1; if (sma200v > sma200prev) pts += 1; }
    }
  }

  const score = Math.round((pts / max) * 100);
  return {
    score,
    strength: score >= 78 ? 'STRONG' : score >= 50 ? 'MODERATE' : 'WEAK',
  };
}

// ─── Swing high/low detection (tighter lookback for more hits) ────────────────

function findSwingHighs(candles: DailyCandle[], lookback = 3): Array<{ idx: number; price: number }> {
  const highs: Array<{ idx: number; price: number }> = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i].high;
    if (
      candles.slice(i - lookback, i).every(x => x.high <= c) &&
      candles.slice(i + 1, i + lookback + 1).every(x => x.high <= c)
    ) highs.push({ idx: i, price: c });
  }
  return highs;
}

function findSwingLows(candles: DailyCandle[], lookback = 3): Array<{ idx: number; price: number }> {
  const lows: Array<{ idx: number; price: number }> = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i].low;
    if (
      candles.slice(i - lookback, i).every(x => x.low >= c) &&
      candles.slice(i + 1, i + lookback + 1).every(x => x.low >= c)
    ) lows.push({ idx: i, price: c });
  }
  return lows;
}

// ─── VCP ─────────────────────────────────────────────────────────────────────

export function detectVCP(candles: DailyCandle[]): PatternResult | null {
  if (candles.length < 120) return null;

  const { score: trendScore, strength: trendStrength } = trendTemplateScore(candles);
  if (trendScore < 33) return null;

  const baseCandles = candles.slice(-90);
  const n = baseCandles.length - 1;

  const highs = findSwingHighs(baseCandles, 3);
  const lows = findSwingLows(baseCandles, 3);

  if (highs.length < 2 || lows.length < 1) return null;

  const swings: number[] = [];
  const minLen = Math.min(highs.length, lows.length);
  for (let i = 0; i < minLen - 1; i++) {
    const depth = (highs[i].price - lows[i].price) / highs[i].price;
    swings.push(depth);
  }

  let contractions = 0;
  for (let i = 1; i < swings.length; i++) {
    if (swings[i] < swings[i - 1] * 0.95) contractions++;
  }

  if (contractions < 1) return null;

  const pivot = highs[highs.length - 1].price;
  const currentPrice = baseCandles[n].close;

  if (currentPrice < pivot * 0.88 || currentPrice > pivot * 1.02) return null;

  const recentVol = avgVolume(baseCandles, 10, n + 1);
  const baseVol = avgVolume(baseCandles, 40, n - 10);
  const volRatio = recentVol / baseVol;
  const volumeSignal: 'DRYING' | 'AVERAGE' | 'EXPANDING' =
    volRatio < 0.75 ? 'DRYING' : volRatio > 1.3 ? 'EXPANDING' : 'AVERAGE';

  const baseLow = Math.min(...lows.map(l => l.price));
  const entryPrice = parseFloat((pivot * 1.005).toFixed(2));
  let stopLoss = parseFloat((baseLow * 0.985).toFixed(2));
  if (entryPrice - stopLoss > entryPrice * 0.05) {
    stopLoss = parseFloat((entryPrice * 0.95).toFixed(2));
  }
  const riskPts = Math.max(0.01, entryPrice - stopLoss);
  const riskPct = parseFloat(((riskPts / entryPrice) * 100).toFixed(2));

  if (riskPct > 5.1) return null;

  const target1 = parseFloat((entryPrice + riskPts).toFixed(2));
  const target2 = parseFloat((entryPrice + riskPts * 2).toFixed(2));
  const target3 = parseFloat((entryPrice + riskPts * 3).toFixed(2));
  const riskReward = 2.0;

  const score = Math.min(100, Math.round(
    trendScore * 0.45 +
    (contractions >= 3 ? 30 : contractions >= 2 ? 22 : 14) +
    (volumeSignal === 'DRYING' ? 20 : 10),
  ));

  return {
    pattern: 'VCP', score,
    confidence: score >= 70 ? 'HIGH' : score >= 48 ? 'MEDIUM' : 'LOW',
    currentPrice, pivotPrice: parseFloat(pivot.toFixed(2)),
    entryPrice, stopLoss, target1, target2, target3, riskReward, riskPct,
    trendStrength, volumeSignal, contractions,
    notes: [
      `Trend score: ${trendScore}/100`,
      `${contractions} volatility contraction(s) detected`,
      `Volume ${volRatio < 1 ? 'drying up' : 'above avg'} (${(volRatio * 100).toFixed(0)}%)`,
      `Breakout pivot: ₹${pivot.toFixed(2)}`,
      `Risk from entry: ${riskPct.toFixed(1)}%`,
    ],
  };
}

// ─── Rocket Base ──────────────────────────────────────────────────────────────

export function detectRocketBase(candles: DailyCandle[]): PatternResult | null {
  if (candles.length < 50) return null;

  const { score: trendScore, strength: trendStrength } = trendTemplateScore(candles);
  if (trendScore < 30) return null;

  const n = candles.length - 1;
  const currentPrice = candles[n].close;

  const price3mAgo = candles[Math.max(0, n - 63)].close;
  const priorMove = (currentPrice - price3mAgo) / price3mAgo;
  if (priorMove < 0.10) return null;

  let baseStart = -1;
  let baseRange = Infinity;

  for (let lookback = 7; lookback <= 30; lookback++) {
    if (n - lookback < 0) continue;
    const slice = candles.slice(n - lookback, n + 1);
    const hi = Math.max(...slice.map(c => c.high));
    const lo = Math.min(...slice.map(c => c.low));
    const range = (hi - lo) / hi;
    if (range < 0.15 && range < baseRange) {
      baseRange = range;
      baseStart = n - lookback;
    }
  }

  if (baseStart < 0 || baseRange >= 0.15) return null;

  const baseSlice = candles.slice(baseStart, n + 1);
  const baseHigh = Math.max(...baseSlice.map(c => c.high));
  const baseLow = Math.min(...baseSlice.map(c => c.low));

  const baseVol = avgVolume(baseSlice, baseSlice.length, baseSlice.length);
  const priorVol = avgVolume(candles, 20, baseStart);
  const volRatio = baseVol / priorVol;
  const volumeSignal: 'DRYING' | 'AVERAGE' | 'EXPANDING' =
    volRatio < 0.75 ? 'DRYING' : volRatio > 1.3 ? 'EXPANDING' : 'AVERAGE';

  if (currentPrice < baseHigh * 0.94) return null;

  const entryPrice = parseFloat((baseHigh * 1.003).toFixed(2));
  let stopLoss = parseFloat((baseLow * 0.985).toFixed(2));
  if (entryPrice - stopLoss > entryPrice * 0.05) {
    stopLoss = parseFloat((entryPrice * 0.95).toFixed(2));
  }
  const riskPts = Math.max(0.01, entryPrice - stopLoss);
  const riskPct = parseFloat(((riskPts / entryPrice) * 100).toFixed(2));
  if (riskPct > 5.1) return null;

  const target1 = parseFloat((entryPrice + riskPts).toFixed(2));
  const target2 = parseFloat((entryPrice + riskPts * 2).toFixed(2));
  const target3 = parseFloat((entryPrice + riskPts * 3).toFixed(2));

  const score = Math.min(100, Math.round(
    trendScore * 0.35 +
    (1 - baseRange / 0.15) * 35 +
    (volumeSignal === 'DRYING' ? 20 : 10) +
    (priorMove > 0.30 ? 10 : priorMove > 0.15 ? 6 : 3),
  ));

  return {
    pattern: 'ROCKET_BASE', score,
    confidence: score >= 65 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW',
    currentPrice, pivotPrice: parseFloat(baseHigh.toFixed(2)),
    entryPrice, stopLoss, target1, target2, target3, riskReward: 2, riskPct,
    trendStrength, volumeSignal, contractions: 0,
    notes: [
      `Prior move: +${(priorMove * 100).toFixed(1)}% in last 3 months`,
      `Base: ${(baseRange * 100).toFixed(1)}% range over ${n - baseStart} days`,
      `Volume ${volRatio < 1 ? 'drying up' : 'above avg'} in base (${(volRatio * 100).toFixed(0)}%)`,
      `Pivot: ₹${baseHigh.toFixed(2)} | Risk: ${riskPct.toFixed(1)}%`,
    ],
  };
}

// ─── Tight Area (3-week tight closes) ────────────────────────────────────────

export function detectTightArea(candles: DailyCandle[]): PatternResult | null {
  if (candles.length < 40) return null;

  const { score: trendScore, strength: trendStrength } = trendTemplateScore(candles);
  if (trendScore < 30) return null;

  const n = candles.length - 1;
  const currentPrice = candles[n].close;

  let bestWindow = -1;
  let bestRange = Infinity;

  for (const days of [10, 12, 15]) {
    if (n < days) continue;
    const win = candles.slice(n - days, n + 1);
    const closes = win.map(c => c.close);
    const rng = (Math.max(...closes) - Math.min(...closes)) / Math.max(...closes);
    if (rng < 0.06 && rng < bestRange) { bestRange = rng; bestWindow = days; }
  }

  if (bestWindow < 0) return null;

  const window = candles.slice(n - bestWindow, n + 1);
  const baseHigh = Math.max(...window.map(c => c.high));
  const baseLow = Math.min(...window.map(c => c.low));

  const baseVol = avgVolume(window, window.length, window.length);
  const priorVol = avgVolume(candles, 20, n - bestWindow);
  const volRatio = baseVol / priorVol;
  const volumeSignal: 'DRYING' | 'AVERAGE' | 'EXPANDING' =
    volRatio < 0.75 ? 'DRYING' : volRatio > 1.3 ? 'EXPANDING' : 'AVERAGE';

  const entryPrice = parseFloat((baseHigh * 1.003).toFixed(2));
  let stopLoss = parseFloat((baseLow * 0.985).toFixed(2));
  if (entryPrice - stopLoss > entryPrice * 0.05) {
    stopLoss = parseFloat((entryPrice * 0.95).toFixed(2));
  }
  const riskPts = Math.max(0.01, entryPrice - stopLoss);
  const riskPct = parseFloat(((riskPts / entryPrice) * 100).toFixed(2));
  if (riskPct > 5.1) return null;

  const target1 = parseFloat((entryPrice + riskPts).toFixed(2));
  const target2 = parseFloat((entryPrice + riskPts * 2).toFixed(2));
  const target3 = parseFloat((entryPrice + riskPts * 3).toFixed(2));

  const score = Math.min(100, Math.round(
    trendScore * 0.4 +
    (1 - bestRange / 0.06) * 35 +
    (volumeSignal === 'DRYING' ? 20 : 10),
  ));

  return {
    pattern: 'TIGHT_AREA', score,
    confidence: score >= 65 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW',
    currentPrice, pivotPrice: parseFloat(baseHigh.toFixed(2)),
    entryPrice, stopLoss, target1, target2, target3, riskReward: 2, riskPct,
    trendStrength, volumeSignal, contractions: 0,
    notes: [
      `${bestWindow}-day tight: closes within ${(bestRange * 100).toFixed(1)}%`,
      `Volume ${volRatio < 1 ? 'drying' : 'above avg'} (${(volRatio * 100).toFixed(0)}%)`,
      `Breakout pivot: ₹${baseHigh.toFixed(2)} | Risk: ${riskPct.toFixed(1)}%`,
    ],
  };
}

// ─── Intraday Momentum ───────────────────────────────────────────────────────

export function detectIntradayMomentum(candles: DailyCandle[]): PatternResult | null {
  if (candles.length < 50) return null;

  let n = candles.length - 1;
  while (n > 0 && (candles[n].volume === 0 || candles[n].high === candles[n].low)) {
    n--;
  }

  if (n < 20) return null;

  const currentPrice = candles[n].close;

  const sma50v = sma(candles, 50)[n];
  if (currentPrice < sma50v) return null;

  const recentVol = candles[n].volume;
  const baseVol = avgVolume(candles, 20, n);
  const volRatio = recentVol / baseVol;

  if (volRatio < 0.95) return null;

  const dayRange = candles[n].high - candles[n].low;
  if (dayRange === 0) return null;

  const closeRelativePos = (currentPrice - candles[n].low) / dayRange;
  if (closeRelativePos < 0.70) return null;

  const todayReturn = (candles[n].close - candles[n].open) / candles[n].open;
  if (todayReturn < 0.003) return null;

  const volumeSignal: 'DRYING' | 'AVERAGE' | 'EXPANDING' = volRatio > 1.3 ? 'EXPANDING' : 'AVERAGE';

  const entryPrice = parseFloat((candles[n].high * 1.001).toFixed(2));
  const stopLoss = parseFloat((candles[n].close * 0.985).toFixed(2));
  const riskPts = Math.max(0.01, entryPrice - stopLoss);
  const riskPct = parseFloat(((riskPts / entryPrice) * 100).toFixed(2));

  if (riskPct > 6.0) return null;

  const target1 = parseFloat((entryPrice * 1.03).toFixed(2));
  const target2 = parseFloat((entryPrice * 1.05).toFixed(2));
  const target3 = parseFloat((entryPrice * 1.10).toFixed(2));

  const score = Math.min(100, Math.round(
    50 +
    (volRatio > 2 ? 30 : volRatio > 1.2 ? 20 : 10) +
    (todayReturn > 0.03 ? 20 : 10)
  ));

  return {
    pattern: 'INTRADAY_MOMENTUM', score,
    confidence: score >= 80 ? 'HIGH' : score >= 65 ? 'MEDIUM' : 'LOW',
    currentPrice, pivotPrice: parseFloat(candles[n].high.toFixed(2)),
    entryPrice, stopLoss, target1, target2, target3, riskReward: 2.0, riskPct,
    trendStrength: 'STRONG', volumeSignal, contractions: 0,
    notes: [
      `🔥 Momentum Signal: +${(todayReturn * 100).toFixed(1)}% on ${candles[n].date.toLocaleDateString()}`,
      `📊 Volume: ${(volRatio).toFixed(1)}x average`,
      `✨ Bullish Close: Finished in top 30% of day range`,
      `🚀 Breakout Level: Buy above ₹${candles[n].high.toFixed(2)}`,
    ],
  };
}

// ─── Inside Candle ──────────────────────────────────────────────────────────

export function detectInsideCandle(candles: DailyCandle[], type: 'DAILY' | 'WEEKLY' | 'MONTHLY'): PatternResult | null {
  if (candles.length < 3) return null;
  const n = candles.length - 1;

  let insideIdx = -1;
  let motherIdx = -1;

  // Simple Check: Current candle is inside previous
  if (candles[n].high > candles[n].low && 
      candles[n].high <= candles[n - 1].high && 
      candles[n].low >= candles[n - 1].low) {
    insideIdx = n;
    motherIdx = n - 1;
  } 
  // Simple Check: Previous was inside (breakout day)
  else if (candles[n - 1].high > candles[n - 1].low && 
           candles[n - 1].high <= candles[n - 2].high && 
           candles[n - 1].low >= candles[n - 2].low) {
    // Only if price hasn't escaped yet
    if (candles[n].close <= candles[n - 2].high * 1.005) {
      insideIdx = n - 1;
      motherIdx = n - 2;
    }
  }

  if (insideIdx === -1) return null;

  const mother = candles[motherIdx];
  const inside = candles[insideIdx];
  const currentPrice = candles[n].close;

  // Strict Mathematical Check: Current candle must be STRICTLY inside the Mother High/Low
  // We check both the high/low of the day AND the current price to be absolutely safe.
  if (candles[n].high >= mother.high || candles[n].low <= mother.low) return null;
  if (currentPrice >= mother.high || currentPrice <= mother.low) return null;

  const entryPrice = parseFloat((mother.high * 1.002).toFixed(2));
  let stopLoss = parseFloat((mother.low * 0.998).toFixed(2));
  const motherLowRisk = (entryPrice - stopLoss) / entryPrice;
  
  if (motherLowRisk > 0.05) {
    stopLoss = parseFloat((inside.low * 0.995).toFixed(2));
  }

  const riskPts = Math.max(0.01, entryPrice - stopLoss);
  const riskPct = parseFloat(((riskPts / entryPrice) * 100).toFixed(2));
  if (riskPct > 10.0) return null;

  const target1 = parseFloat((entryPrice + riskPts * 1.5).toFixed(2));
  const target2 = parseFloat((entryPrice + riskPts * 2.5).toFixed(2));
  const target3 = parseFloat((entryPrice + riskPts * 3.5).toFixed(2));

  const patternMap: Record<string, PatternType> = {
    'DAILY': 'DAILY_INSIDE',
    'WEEKLY': 'WEEKLY_INSIDE',
    'MONTHLY': 'MONTHLY_INSIDE'
  };

  const scoreMap: Record<string, number> = {
    'DAILY': 95,
    'WEEKLY': 92,
    'MONTHLY': 85
  };

  return {
    pattern: patternMap[type],
    score: scoreMap[type],
    confidence: 'HIGH',
    currentPrice,
    pivotPrice: mother.high,
    entryPrice, stopLoss, target1, target2, target3,
    riskReward: 1.5, riskPct,
    trendStrength: 'MODERATE',
    volumeSignal: 'AVERAGE',
    contractions: 0,
    notes: [
      `${type.charAt(0) + type.slice(1).toLowerCase()} Inside Candle Setup`,
      `Mother Breakout Pivot: ₹${mother.high.toFixed(2)}`,
      `Risk: ${riskPct.toFixed(1)}%`
    ]
  };
}

// ─── Main Logic ──────────────────────────────────────────────────────────────

export function analyzeStock(_symbol: string, candles: DailyCandle[]): PatternResult[] {
  const results: PatternResult[] = [];

  const vcp = detectVCP(candles);
  const rocket = detectRocketBase(candles);
  const tight = detectTightArea(candles);
  const momentum = detectIntradayMomentum(candles);

  if (vcp) results.push(vcp);
  if (rocket) results.push(rocket);
  if (tight) results.push(tight);
  if (momentum) results.push(momentum);

  const dailyInside = detectInsideCandle(candles, 'DAILY');
  if (dailyInside) results.push(dailyInside);

  const weeklyCandles = aggregateWeeklyCandles(candles);
  const weeklyInside = detectInsideCandle(weeklyCandles, 'WEEKLY');
  if (weeklyInside) results.push(weeklyInside);

  const monthlyCandles = aggregateMonthlyCandles(candles);
  const monthlyInside = detectInsideCandle(monthlyCandles, 'MONTHLY');
  if (monthlyInside) results.push(monthlyInside);

  return results;
}
