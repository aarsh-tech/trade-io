// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyCandle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PatternType =
  | 'VCP'
  | 'ROCKET_BASE'
  | 'TIGHT_AREA'
  | 'INTRADAY_MOMENTUM'
  | 'DAILY_INSIDE'
  | 'WEEKLY_INSIDE'
  | 'MONTHLY_INSIDE';

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
  direction?: 'LONG' | 'SHORT';
  notes: string[];
}

// ─── Utility Functions ────────────────────────────────────────────────────────

export function sma(candles: DailyCandle[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    const slice = candles.slice(i - period + 1, i + 1);
    result.push(slice.reduce((s, c) => s + c.close, 0) / period);
  }
  return result;
}

export function avgVolume(candles: DailyCandle[], period: number, endIdx: number): number {
  const start = Math.max(0, endIdx - period);
  const slice = candles.slice(start, endIdx);
  if (slice.length === 0) return 1;
  return slice.reduce((s, c) => s + (c.volume || 0), 0) / slice.length;
}

/**
 * Aggregate daily candles into weekly candles (Monday to Friday)
 * Ensures no mutation of date objects.
 */
export function aggregateWeeklyCandles(daily: DailyCandle[]): DailyCandle[] {
  if (daily.length === 0) return [];
  const weekly: DailyCandle[] = [];
  const groups = new Map<string, DailyCandle[]>();

  daily.forEach((c) => {
    const d = new Date(c.date);
    const day = d.getDay(); // 0 is Sun, 1 is Mon...
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.getFullYear(), d.getMonth(), diff);
    monday.setHours(0, 0, 0, 0);
    const key = monday.toISOString().split('T')[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  });

  const sortedKeys = Array.from(groups.keys()).sort();
  sortedKeys.forEach((key) => {
    const group = groups.get(key)!;
    if (group.length === 0) return;
    weekly.push({
      date: group[group.length - 1].date,
      open: group[0].open,
      high: Math.max(...group.map((g) => g.high)),
      low: Math.min(...group.map((g) => g.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, g) => s + (g.volume || 0), 0),
    });
  });
  return weekly;
}

/**
 * Aggregate daily candles into monthly candles
 */
export function aggregateMonthlyCandles(daily: DailyCandle[]): DailyCandle[] {
  if (daily.length === 0) return [];
  const monthly: DailyCandle[] = [];
  const groups = new Map<string, DailyCandle[]>();

  daily.forEach((c) => {
    const d = new Date(c.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  });

  const sortedKeys = Array.from(groups.keys()).sort();
  sortedKeys.forEach((key) => {
    const group = groups.get(key)!;
    if (group.length === 0) return;
    monthly.push({
      date: group[group.length - 1].date,
      open: group[0].open,
      high: Math.max(...group.map((g) => g.high)),
      low: Math.min(...group.map((g) => g.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, g) => s + (g.volume || 0), 0),
    });
  });
  return monthly;
}

// ─── Trend Template (Minervini Stage 2 Filter) ───────────────────────────────

function trendTemplateScore(candles: DailyCandle[]): { score: number; strength: 'WEAK' | 'MODERATE' | 'STRONG' } {
  const n = candles.length - 1;
  if (n < 30) return { score: 50, strength: 'MODERATE' };

  const price = candles[n].close;
  const sma20 = sma(candles, Math.min(20, n))[n];
  const sma50 = n >= 49 ? sma(candles, 50)[n] : sma20;
  const sma200 = n >= 199 ? sma(candles, 200)[n] : NaN;

  const lookback = Math.min(252, n + 1);
  const high52w = Math.max(...candles.slice(n - lookback + 1).map((c) => c.high));
  const low52w = Math.min(...candles.slice(n - lookback + 1).map((c) => c.low));

  let pts = 0;
  let max = 0;

  // Price above 20 & 50 SMA
  max += 2;
  if (price >= sma20) pts += 1;
  if (price >= sma50) pts += 1;

  // Within 35% of 52-week High
  max += 2;
  if (high52w > 0 && price >= high52w * 0.65) pts += 2;

  // At least 15% above 52-week Low
  max += 1;
  if (low52w > 0 && price >= low52w * 1.15) pts += 1;

  // SMA 50 above SMA 200 (Stage 2)
  if (!isNaN(sma200)) {
    max += 2;
    if (price >= sma200) pts += 1;
    if (sma50 >= sma200) pts += 1;
  }

  const score = Math.round((pts / Math.max(1, max)) * 100);
  return {
    score,
    strength: score >= 70 ? 'STRONG' : score >= 40 ? 'MODERATE' : 'WEAK',
  };
}

// ─── 1. VCP (Volatility Contraction Pattern) ──────────────────────────────────
// Detects multi-stage contractions (2T, 3T, 4T) where volatility narrows towards pivot.

export function detectVCP(candles: DailyCandle[]): PatternResult | null {
  if (candles.length < 45) return null;

  const n = candles.length - 1;
  const currentPrice = candles[n].close;

  // Analyze the last 60-90 trading days (or available length)
  const baseLookback = Math.min(90, candles.length);
  const baseCandles = candles.slice(candles.length - baseLookback);
  const baseLen = baseCandles.length;

  const { score: trendScore, strength: trendStrength } = trendTemplateScore(candles);

  // Divide base into 3 rolling windows to measure volatility contraction (T1, T2, T3)
  const partSize = Math.floor(baseLen / 3);
  if (partSize < 8) return null;

  const w1 = baseCandles.slice(0, partSize);
  const w2 = baseCandles.slice(partSize, partSize * 2);
  const w3 = baseCandles.slice(partSize * 2);

  const depth1 = (Math.max(...w1.map((c) => c.high)) - Math.min(...w1.map((c) => c.low))) / Math.max(...w1.map((c) => c.high));
  const depth2 = (Math.max(...w2.map((c) => c.high)) - Math.min(...w2.map((c) => c.low))) / Math.max(...w2.map((c) => c.high));
  const depth3 = (Math.max(...w3.map((c) => c.high)) - Math.min(...w3.map((c) => c.low))) / Math.max(...w3.map((c) => c.high));

  let contractions = 0;
  // Check if volatility depth is decreasing: depth1 > depth2 OR depth2 > depth3
  if (depth2 <= depth1 * 1.05) contractions++;
  if (depth3 <= depth2 * 1.05) contractions++;

  // Must have contraction in final stage (depth3 <= 12%)
  const isContracting = (contractions >= 1 && depth3 <= 0.14) || depth3 <= 0.08;
  if (!isContracting) return null;

  // Base High is the Pivot
  const pivot = Math.max(...baseCandles.map((c) => c.high));
  const recentHigh = Math.max(...w3.map((c) => c.high));
  const pivotToUse = recentHigh >= pivot * 0.95 ? recentHigh : pivot;

  // Current price must be near pivot (within 12%)
  if (currentPrice < pivotToUse * 0.86 || currentPrice > pivotToUse * 1.04) return null;

  // Volume analysis: volume drying up in the last contraction
  const recentVol = avgVolume(baseCandles, Math.min(10, partSize), baseLen);
  const baseVol = avgVolume(candles, Math.min(50, candles.length), candles.length);
  const volRatio = recentVol / Math.max(1, baseVol);
  const volumeSignal: 'DRYING' | 'AVERAGE' | 'EXPANDING' =
    volRatio < 0.85 ? 'DRYING' : volRatio > 1.25 ? 'EXPANDING' : 'AVERAGE';

  // Entry at pivot breakout + 0.15%
  const entryPrice = parseFloat((pivotToUse * 1.002).toFixed(2));
  // Stop-loss at the lowest low of the last contraction stage
  const lastStageLow = Math.min(...w3.map((c) => c.low));
  let stopLoss = parseFloat((lastStageLow * 0.995).toFixed(2));

  // Cap risk percentage at max 7.5%
  const rawRiskPct = ((entryPrice - stopLoss) / entryPrice) * 100;
  if (rawRiskPct > 7.5) {
    stopLoss = parseFloat((entryPrice * 0.935).toFixed(2));
  }
  const riskPts = Math.max(0.01, entryPrice - stopLoss);
  const riskPct = parseFloat(((riskPts / entryPrice) * 100).toFixed(2));

  const target1 = parseFloat((entryPrice + riskPts * 1.5).toFixed(2));
  const target2 = parseFloat((entryPrice + riskPts * 2.5).toFixed(2));
  const target3 = parseFloat((entryPrice + riskPts * 3.5).toFixed(2));

  const contractionCount = depth3 < depth2 && depth2 < depth1 ? 3 : 2;
  const score = Math.min(
    100,
    Math.round(
      40 +
      trendScore * 0.3 +
      (volumeSignal === 'DRYING' ? 20 : 10) +
      (depth3 <= 0.06 ? 15 : 8) +
      (contractions >= 2 ? 15 : 5)
    )
  );

  return {
    pattern: 'VCP',
    score,
    confidence: score >= 70 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW',
    currentPrice,
    pivotPrice: parseFloat(pivotToUse.toFixed(2)),
    entryPrice,
    stopLoss,
    target1,
    target2,
    target3,
    riskReward: 2.0,
    riskPct,
    trendStrength,
    volumeSignal,
    contractions: contractionCount,
    direction: 'LONG',
    notes: [
      `VCP ${contractionCount}T Setup: Volatility contracted from ${(depth1 * 100).toFixed(1)}% → ${(depth2 * 100).toFixed(1)}% → ${(depth3 * 100).toFixed(1)}%`,
      `Volume ${volRatio < 1 ? 'drying up' : 'stable'} (${(volRatio * 100).toFixed(0)}% of 50-day avg)`,
      `Breakout Pivot: ₹${pivotToUse.toFixed(2)}`,
      `Stop-Loss: ₹${stopLoss.toFixed(2)} (${riskPct}% risk)`,
    ],
  };
}

// ─── 2. Rocket Base (High Momentum Flat Consolidation) ─────────────────────────

export function detectRocketBase(candles: DailyCandle[]): PatternResult | null {
  if (candles.length < 35) return null;

  const n = candles.length - 1;
  const currentPrice = candles[n].close;

  // Measure prior run-up in the last 2-3 months (at least +8%)
  const lookbackRun = Math.min(60, n);
  const runUpStartPrice = candles[n - lookbackRun].close;
  const priorMove = (currentPrice - runUpStartPrice) / Math.max(1, runUpStartPrice);
  if (priorMove < 0.06) return null;

  // Base consolidation: last 7 to 25 candles trading in a tight range (<= 16%)
  let baseStart = -1;
  let baseRange = Infinity;

  for (let days = 6; days <= Math.min(25, n); days++) {
    const slice = candles.slice(n - days, n + 1);
    const hi = Math.max(...slice.map((c) => c.high));
    const lo = Math.min(...slice.map((c) => c.low));
    const range = (hi - lo) / Math.max(1, hi);
    if (range <= 0.16 && range < baseRange) {
      baseRange = range;
      baseStart = n - days;
    }
  }

  if (baseStart < 0) return null;

  const baseSlice = candles.slice(baseStart, n + 1);
  const baseHigh = Math.max(...baseSlice.map((c) => c.high));
  const baseLow = Math.min(...baseSlice.map((c) => c.low));

  // Current price must be within 8% of base high
  if (currentPrice < baseHigh * 0.91) return null;

  const baseVol = avgVolume(baseSlice, baseSlice.length, baseSlice.length);
  const priorVol = avgVolume(candles, 20, baseStart);
  const volRatio = baseVol / Math.max(1, priorVol);
  const volumeSignal: 'DRYING' | 'AVERAGE' | 'EXPANDING' =
    volRatio < 0.85 ? 'DRYING' : volRatio > 1.25 ? 'EXPANDING' : 'AVERAGE';

  const entryPrice = parseFloat((baseHigh * 1.002).toFixed(2));
  let stopLoss = parseFloat((baseLow * 0.995).toFixed(2));
  const rawRiskPct = ((entryPrice - stopLoss) / entryPrice) * 100;
  if (rawRiskPct > 7.0) {
    stopLoss = parseFloat((entryPrice * 0.94).toFixed(2));
  }
  const riskPts = Math.max(0.01, entryPrice - stopLoss);
  const riskPct = parseFloat(((riskPts / entryPrice) * 100).toFixed(2));

  const target1 = parseFloat((entryPrice + riskPts * 1.5).toFixed(2));
  const target2 = parseFloat((entryPrice + riskPts * 2.5).toFixed(2));
  const target3 = parseFloat((entryPrice + riskPts * 3.5).toFixed(2));

  const score = Math.min(
    100,
    Math.round(
      45 +
      (priorMove > 0.15 ? 25 : 15) +
      (1 - baseRange / 0.16) * 20 +
      (volumeSignal === 'DRYING' ? 15 : 5)
    )
  );

  return {
    pattern: 'ROCKET_BASE',
    score,
    confidence: score >= 65 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW',
    currentPrice,
    pivotPrice: parseFloat(baseHigh.toFixed(2)),
    entryPrice,
    stopLoss,
    target1,
    target2,
    target3,
    riskReward: 2.0,
    riskPct,
    trendStrength: 'STRONG',
    volumeSignal,
    contractions: 0,
    direction: 'LONG',
    notes: [
      `Rocket Base: Prior momentum +${(priorMove * 100).toFixed(1)}%`,
      `Tight Consolidation: ${(baseRange * 100).toFixed(1)}% base range over ${n - baseStart} days`,
      `Breakout Pivot: ₹${baseHigh.toFixed(2)}`,
      `Stop-Loss: ₹${stopLoss.toFixed(2)} (${riskPct}% risk)`,
    ],
  };
}

// ─── 3. Tight Area (Multi-Week Tight Closes) ───────────────────────────────────

export function detectTightArea(candles: DailyCandle[]): PatternResult | null {
  if (candles.length < 25) return null;

  const n = candles.length - 1;
  const currentPrice = candles[n].close;

  let bestWindow = -1;
  let bestRange = Infinity;

  // Check 8, 10, 12, 15 days window
  for (const days of [8, 10, 12, 15]) {
    if (n < days) continue;
    const win = candles.slice(n - days, n + 1);
    const closes = win.map((c) => c.close);
    const maxClose = Math.max(...closes);
    const minClose = Math.min(...closes);
    const range = (maxClose - minClose) / Math.max(1, maxClose);
    if (range <= 0.065 && range < bestRange) {
      bestRange = range;
      bestWindow = days;
    }
  }

  if (bestWindow < 0) return null;

  const winSlice = candles.slice(n - bestWindow, n + 1);
  const baseHigh = Math.max(...winSlice.map((c) => c.high));
  const baseLow = Math.min(...winSlice.map((c) => c.low));

  const entryPrice = parseFloat((baseHigh * 1.002).toFixed(2));
  let stopLoss = parseFloat((baseLow * 0.995).toFixed(2));
  const rawRiskPct = ((entryPrice - stopLoss) / entryPrice) * 100;
  if (rawRiskPct > 6.0) {
    stopLoss = parseFloat((entryPrice * 0.95).toFixed(2));
  }
  const riskPts = Math.max(0.01, entryPrice - stopLoss);
  const riskPct = parseFloat(((riskPts / entryPrice) * 100).toFixed(2));

  const target1 = parseFloat((entryPrice + riskPts * 1.5).toFixed(2));
  const target2 = parseFloat((entryPrice + riskPts * 2.5).toFixed(2));
  const target3 = parseFloat((entryPrice + riskPts * 3.5).toFixed(2));

  const score = Math.min(100, Math.round(50 + (1 - bestRange / 0.065) * 35 + 15));

  return {
    pattern: 'TIGHT_AREA',
    score,
    confidence: score >= 65 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW',
    currentPrice,
    pivotPrice: parseFloat(baseHigh.toFixed(2)),
    entryPrice,
    stopLoss,
    target1,
    target2,
    target3,
    riskReward: 2.0,
    riskPct,
    trendStrength: 'MODERATE',
    volumeSignal: 'AVERAGE',
    contractions: 0,
    direction: 'LONG',
    notes: [
      `${bestWindow}-day Tight Area: Closes within ${(bestRange * 100).toFixed(1)}%`,
      `Range: ₹${baseLow.toFixed(2)} — ₹${baseHigh.toFixed(2)}`,
      `Breakout Pivot: ₹${baseHigh.toFixed(2)}`,
      `Stop-Loss: ₹${stopLoss.toFixed(2)} (${riskPct}% risk)`,
    ],
  };
}

// ─── 4. Inside Candle Setup (1D Inside, Weekly Inside, Monthly Inside) ─────────
// Robust multi-timeframe inside candle analyzer for LONG & SHORT setups.

export function detectInsideCandle(candles: DailyCandle[], type: 'DAILY' | 'WEEKLY' | 'MONTHLY'): PatternResult[] {
  if (!candles || candles.length < 2) return [];
  const n = candles.length - 1;

  let insideCandle: DailyCandle | null = null;
  let motherCandle: DailyCandle | null = null;
  let isBreakoutDay = false;

  // Case A: Today / Current period is INSIDE the previous mother period
  // (Current High <= Previous High and Current Low >= Previous Low)
  const curr = candles[n];
  const prev = candles[n - 1];

  if (curr.high <= prev.high * 1.002 && curr.low >= prev.low * 0.998 && curr.high > curr.low) {
    insideCandle = curr;
    motherCandle = prev;
    isBreakoutDay = false;
  }
  // Case B: Previous period was an inside candle (testing breakout now)
  else if (n >= 2) {
    const prev2 = candles[n - 2];
    if (prev.high <= prev2.high * 1.002 && prev.low >= prev2.low * 0.998 && prev.high > prev.low) {
      insideCandle = prev;
      motherCandle = prev2;
      isBreakoutDay = true;
    }
  }
  // Case C: 2 periods ago was an inside candle (for weekly/monthly consolidations)
  if (!insideCandle && n >= 3 && (type === 'WEEKLY' || type === 'MONTHLY')) {
    const prev2 = candles[n - 2];
    const prev3 = candles[n - 3];
    if (prev2.high <= prev3.high * 1.002 && prev2.low >= prev3.low * 0.998 && prev2.high > prev2.low) {
      insideCandle = prev2;
      motherCandle = prev3;
      isBreakoutDay = true;
    }
  }

  if (!insideCandle || !motherCandle) return [];


  const currentPrice = candles[n].close;
  const motherHigh = motherCandle.high;
  const motherLow = motherCandle.low;
  const insideHigh = insideCandle.high;
  const insideLow = insideCandle.low;

  const patternMap: Record<string, PatternType> = {
    DAILY: 'DAILY_INSIDE',
    WEEKLY: 'WEEKLY_INSIDE',
    MONTHLY: 'MONTHLY_INSIDE',
  };

  const scoreBase: Record<string, number> = {
    DAILY: 92,
    WEEKLY: 88,
    MONTHLY: 84,
  };

  const results: PatternResult[] = [];
  const label = type === 'DAILY' ? '1D Inside Bar' : type === 'WEEKLY' ? 'Weekly Inside Bar' : 'Monthly Inside Bar';

  // ── 1. LONG Setup (Breakout above Mother / Inside High) ───────────────
  const entryPriceLong = parseFloat((insideHigh * 1.002).toFixed(2));
  let stopLossLong = parseFloat((insideLow * 0.998).toFixed(2));
  const rawRiskLong = ((entryPriceLong - stopLossLong) / entryPriceLong) * 100;
  if (rawRiskLong > 6.5) {
    stopLossLong = parseFloat((entryPriceLong * 0.945).toFixed(2));
  }
  const riskPtsLong = Math.max(0.01, entryPriceLong - stopLossLong);
  const riskPctLong = parseFloat(((riskPtsLong / entryPriceLong) * 100).toFixed(2));

  const target1Long = parseFloat((entryPriceLong + riskPtsLong * 1.5).toFixed(2));
  const target2Long = parseFloat((entryPriceLong + riskPtsLong * 2.5).toFixed(2));
  const target3Long = parseFloat((entryPriceLong + riskPtsLong * 3.5).toFixed(2));

  results.push({
    pattern: patternMap[type],
    score: scoreBase[type],
    confidence: 'HIGH',
    currentPrice,
    pivotPrice: parseFloat(motherHigh.toFixed(2)),
    entryPrice: entryPriceLong,
    stopLoss: stopLossLong,
    target1: target1Long,
    target2: target2Long,
    target3: target3Long,
    riskReward: 1.5,
    riskPct: riskPctLong,
    trendStrength: 'MODERATE',
    volumeSignal: 'AVERAGE',
    contractions: 0,
    direction: 'LONG',
    notes: [
      `🟢 ${label} Setup (LONG)`,
      `Mother Range: ₹${motherLow.toFixed(2)} → ₹${motherHigh.toFixed(2)}`,
      `Inside Range: ₹${insideLow.toFixed(2)} → ₹${insideHigh.toFixed(2)}`,
      `Long Trigger: Buy above ₹${entryPriceLong.toFixed(2)} | SL: ₹${stopLossLong.toFixed(2)}`,
      isBreakoutDay ? `⚡ Breakout in progress today` : `⏳ Consolidation ready for breakout`,
    ],
  });

  // ── 2. SHORT Setup (Breakdown below Mother / Inside Low) ──────────────
  const entryPriceShort = parseFloat((insideLow * 0.998).toFixed(2));
  let stopLossShort = parseFloat((insideHigh * 1.002).toFixed(2));
  const rawRiskShort = ((stopLossShort - entryPriceShort) / entryPriceShort) * 100;
  if (rawRiskShort > 6.5) {
    stopLossShort = parseFloat((entryPriceShort * 1.055).toFixed(2));
  }
  const riskPtsShort = Math.max(0.01, stopLossShort - entryPriceShort);
  const riskPctShort = parseFloat(((riskPtsShort / entryPriceShort) * 100).toFixed(2));

  const target1Short = parseFloat((entryPriceShort - riskPtsShort * 1.5).toFixed(2));
  const target2Short = parseFloat((entryPriceShort - riskPtsShort * 2.5).toFixed(2));
  const target3Short = parseFloat((entryPriceShort - riskPtsShort * 3.5).toFixed(2));

  results.push({
    pattern: patternMap[type],
    score: scoreBase[type] - 2,
    confidence: 'HIGH',
    currentPrice,
    pivotPrice: parseFloat(motherLow.toFixed(2)),
    entryPrice: entryPriceShort,
    stopLoss: stopLossShort,
    target1: target1Short,
    target2: target2Short,
    target3: target3Short,
    riskReward: 1.5,
    riskPct: riskPctShort,
    trendStrength: 'MODERATE',
    volumeSignal: 'AVERAGE',
    contractions: 0,
    direction: 'SHORT',
    notes: [
      `🔴 ${label} Setup (SHORT)`,
      `Mother Range: ₹${motherLow.toFixed(2)} → ₹${motherHigh.toFixed(2)}`,
      `Inside Range: ₹${insideLow.toFixed(2)} → ₹${insideHigh.toFixed(2)}`,
      `Short Trigger: Sell below ₹${entryPriceShort.toFixed(2)} | SL: ₹${stopLossShort.toFixed(2)}`,
      isBreakoutDay ? `⚡ Breakdown in progress today` : `⏳ Consolidation ready for breakdown`,
    ],
  });

  return results;
}

// ─── 5. Intraday Momentum Surge (Long & Short) ────────────────────────────────

export function detectIntradayMomentum(candles: DailyCandle[]): PatternResult | null {
  if (!candles || candles.length < 20) return null;
  const n = candles.length - 1;
  const curr = candles[n];

  const currentPrice = curr.close;
  const dayRange = curr.high - curr.low;
  if (dayRange <= 0) return null;

  // Bullish: Closed in the upper 40% of the day's range
  const closeRel = (currentPrice - curr.low) / dayRange;
  const returnToday = (curr.close - curr.open) / Math.max(1, curr.open);

  if (closeRel < 0.60 || returnToday < 0.004) return null;

  const baseVol = avgVolume(candles, 20, n);
  const volRatio = (curr.volume || 1) / Math.max(1, baseVol);

  const entryPrice = parseFloat((curr.high * 1.001).toFixed(2));
  const stopLoss = parseFloat((curr.low * 0.995).toFixed(2));
  const riskPts = Math.max(0.01, entryPrice - stopLoss);
  const riskPct = parseFloat(((riskPts / entryPrice) * 100).toFixed(2));

  const target1 = parseFloat((entryPrice + riskPts * 1.5).toFixed(2));
  const target2 = parseFloat((entryPrice + riskPts * 2.5).toFixed(2));
  const target3 = parseFloat((entryPrice + riskPts * 3.5).toFixed(2));

  const score = Math.min(100, Math.round(55 + (returnToday > 0.02 ? 25 : 15) + (volRatio > 1.2 ? 20 : 10)));

  return {
    pattern: 'INTRADAY_MOMENTUM',
    score,
    confidence: score >= 75 ? 'HIGH' : 'MEDIUM',
    currentPrice,
    pivotPrice: parseFloat(curr.high.toFixed(2)),
    entryPrice,
    stopLoss,
    target1,
    target2,
    target3,
    riskReward: 1.5,
    riskPct,
    trendStrength: 'STRONG',
    volumeSignal: volRatio > 1.2 ? 'EXPANDING' : 'AVERAGE',
    contractions: 0,
    direction: 'LONG',
    notes: [
      `🔥 Bullish Momentum: +${(returnToday * 100).toFixed(1)}% gain`,
      `Volume Pace: ${(volRatio).toFixed(1)}x 20-day average`,
      `Day High Breakout: ₹${curr.high.toFixed(2)}`,
      `SL: ₹${stopLoss.toFixed(2)}`,
    ],
  };
}

export function detectIntradayMomentumShort(candles: DailyCandle[]): PatternResult | null {
  if (!candles || candles.length < 20) return null;
  const n = candles.length - 1;
  const curr = candles[n];

  const currentPrice = curr.close;
  const dayRange = curr.high - curr.low;
  if (dayRange <= 0) return null;

  // Bearish: Closed in the lower 40% of the day's range
  const closeRel = (currentPrice - curr.low) / dayRange;
  const returnToday = (curr.close - curr.open) / Math.max(1, curr.open);

  if (closeRel > 0.40 || returnToday > -0.004) return null;

  const baseVol = avgVolume(candles, 20, n);
  const volRatio = (curr.volume || 1) / Math.max(1, baseVol);

  const entryPrice = parseFloat((curr.low * 0.999).toFixed(2));
  const stopLoss = parseFloat((curr.high * 1.005).toFixed(2));
  const riskPts = Math.max(0.01, stopLoss - entryPrice);
  const riskPct = parseFloat(((riskPts / entryPrice) * 100).toFixed(2));

  const target1 = parseFloat((entryPrice - riskPts * 1.5).toFixed(2));
  const target2 = parseFloat((entryPrice - riskPts * 2.5).toFixed(2));
  const target3 = parseFloat((entryPrice - riskPts * 3.5).toFixed(2));

  const score = Math.min(100, Math.round(55 + (returnToday < -0.02 ? 25 : 15) + (volRatio > 1.2 ? 20 : 10)));

  return {
    pattern: 'INTRADAY_MOMENTUM',
    score,
    confidence: score >= 75 ? 'HIGH' : 'MEDIUM',
    currentPrice,
    pivotPrice: parseFloat(curr.low.toFixed(2)),
    entryPrice,
    stopLoss,
    target1,
    target2,
    target3,
    riskReward: 1.5,
    riskPct,
    trendStrength: 'STRONG',
    volumeSignal: volRatio > 1.2 ? 'EXPANDING' : 'AVERAGE',
    contractions: 0,
    direction: 'SHORT',
    notes: [
      `📉 Bearish Momentum: ${(returnToday * 100).toFixed(1)}% drop`,
      `Volume Pace: ${(volRatio).toFixed(1)}x 20-day average`,
      `Day Low Breakdown: ₹${curr.low.toFixed(2)}`,
      `SL: ₹${stopLoss.toFixed(2)}`,
    ],
  };
}

// ─── Master Analyzer ─────────────────────────────────────────────────────────

export function analyzeStock(_symbol: string, candles: DailyCandle[]): PatternResult[] {
  if (!candles || candles.length < 15) return [];

  const results: PatternResult[] = [];

  // 1. VCP Pattern
  const vcp = detectVCP(candles);
  if (vcp) results.push(vcp);

  // 2. Rocket Base Pattern
  const rocket = detectRocketBase(candles);
  if (rocket) results.push(rocket);

  // 3. Tight Area Pattern
  const tight = detectTightArea(candles);
  if (tight) results.push(tight);

  // 4. Intraday Momentum Long / Short
  const momentumLong = detectIntradayMomentum(candles);
  if (momentumLong) results.push(momentumLong);

  const momentumShort = detectIntradayMomentumShort(candles);
  if (momentumShort) results.push(momentumShort);

  // 5. 1D Inside Bar
  const dailyInside = detectInsideCandle(candles, 'DAILY');
  results.push(...dailyInside);

  // 6. Weekly Inside Bar
  const weeklyCandles = aggregateWeeklyCandles(candles);
  const weeklyInside = detectInsideCandle(weeklyCandles, 'WEEKLY');
  results.push(...weeklyInside);

  // 7. Monthly Inside Bar
  const monthlyCandles = aggregateMonthlyCandles(candles);
  const monthlyInside = detectInsideCandle(monthlyCandles, 'MONTHLY');
  results.push(...monthlyInside);

  return results;
}
