const fs = require('fs');

function calculateEMA(candles, period) {
  const result = [];
  const k = 2 / (period + 1);
  let ema = null;
  for (let i = 0; i < candles.length; i++) {
    const close = candles[i].close;
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += candles[j].close;
      ema = sum / period;
      result.push(ema);
    } else {
      ema = close * k + ema * (1 - k);
      result.push(ema);
    }
  }
  return result;
}

function calculateVWAP(candles) {
  const result = [];
  let cumVol = 0;
  let cumVolPrice = 0;
  let currentDay = '';

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const day = new Date(c.date).toISOString().split('T')[0];
    if (day !== currentDay) {
      currentDay = day;
      cumVol = 0;
      cumVolPrice = 0;
    }
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1000;
    cumVol += vol;
    cumVolPrice += typicalPrice * vol;
    result.push(cumVol > 0 ? cumVolPrice / cumVol : c.close);
  }
  return result;
}

function calculateATR(candles, period = 14) {
  const atrs = new Array(candles.length).fill(0);
  if (candles.length === 0) return atrs;
  const trs = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trs.push(candles[i].high - candles[i].low);
    } else {
      const prevClose = candles[i - 1].close;
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - prevClose),
        Math.abs(candles[i].low - prevClose)
      );
      trs.push(tr);
    }
  }

  let sum = 0;
  for (let i = 0; i < Math.min(period, trs.length); i++) {
    sum += trs[i];
    atrs[i] = sum / (i + 1);
  }
  for (let i = period; i < trs.length; i++) {
    atrs[i] = (atrs[i - 1] * (period - 1) + trs[i]) / period;
  }
  return atrs;
}

function calculateRSI(candles, period = 14) {
  const rsi = new Array(candles.length).fill(null);
  if (candles.length <= period) return rsi;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }
  return rsi;
}

function formatISTTime(d) {
  return new Date(d).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
}

function getIstDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}

// ───────────────────────────────────────────────────────────────────────────────────
// CONFIGURATION CONSTANTS (Supports Bank Nifty & BSE SENSEX)
// ───────────────────────────────────────────────────────────────────────────────────
const targetArg = (process.argv[2] || 'banknifty').toLowerCase();
const isSensex = targetArg.includes('sensex') || targetArg.includes('bsesn');

const SYMBOL = isSensex ? '^BSESN' : '^NSEBANK';
const INDEX_NAME = isSensex ? 'BSE SENSEX' : 'Bank Nifty';
const LOT_SIZE = isSensex ? 20 : 30;               // 1 Lot = 30 Qty on NSE Bank Nifty, 20 on BSE
const MAX_OPENING_RANGE_PTS = isSensex ? 350 : 300; // Opening 15m Range Cap (~0.55% of 51,000 spot)
const MIN_STRUCTURAL_SL = isSensex ? 50 : 45;      // Minimum candle SL points
const MAX_STRUCTURAL_SL = isSensex ? 100 : 80;     // Maximum candle SL points

function calculateCPR(prevCandles) {
  if (!prevCandles || prevCandles.length === 0) return null;
  const high = Math.max(...prevCandles.map(c => c.high));
  const low = Math.min(...prevCandles.map(c => c.low));
  const close = prevCandles[prevCandles.length - 1].close;
  const pivot = (high + low + close) / 3;
  const bc = (high + low) / 2;
  const tc = (pivot - bc) + pivot;
  const width = Math.abs(tc - bc);
  const widthPct = (width / pivot) * 100;
  return {
    pivot,
    bc,
    tc,
    width,
    widthPct,
    isNarrow: widthPct <= 0.18,
  };
}

function simulateEngine(rawCandles, candleMap, daysMap, targetDays, allTradingDays, mode = 'DUAL_EDGE') {
  const isOld = mode === 'OLD';
  const isDualEdge = mode === 'DUAL_EDGE';
  const dailySummaries = [];

  for (const day of targetDays) {
    const dayCandles = daysMap.get(day);
    if (!dayCandles || dayCandles.length < 3) continue;

    const orCandles = dayCandles.slice(0, 3);
    const refHigh = Math.max(...orCandles.map(c => c.high));
    const refLow = Math.min(...orCandles.map(c => c.low));
    const rangePts = refHigh - refLow;
    const openPrice = orCandles[0].open;
    const rangePct = (rangePts / openPrice) * 100;
    const currentAtr = candleMap.get(orCandles[2].date.toISOString())?.atr || 80;
    const isWideCandle = rangePct > 0.80;
    const midpoint = (refHigh + refLow) / 2;

    // Previous day CPR calculation
    const dayIdx = allTradingDays.indexOf(day);
    const prevDay = dayIdx > 0 ? allTradingDays[dayIdx - 1] : null;
    const prevCandles = prevDay ? daysMap.get(prevDay) : null;
    const cpr = prevCandles ? calculateCPR(prevCandles) : null;

    // Rule 3: Range Width Compression Filter (Skip days > MAX_OPENING_RANGE_PTS)
    if (!isOld && rangePts > MAX_OPENING_RANGE_PTS) {
      dailySummaries.push({
        date: day,
        refRange: `${refHigh.toFixed(0)} - ${refLow.toFixed(0)} (${rangePts.toFixed(0)} pts)`,
        tradesCount: 0,
        trades: [],
        dayPnlPts: 0,
        dayPnlRs: 0,
        skippedReason: `Range (${rangePts.toFixed(0)} pts > ${MAX_OPENING_RANGE_PTS} pts) exhausted daily ATR. Skipped to eliminate false breakout trap.`
      });
      continue;
    }

    const candidateCandles = dayCandles.slice(3);
    let tradeState = {
      inTrade: false,
      tradeType: null, // 'TREND_BREAKOUT' or 'TRAP_REVERSAL'
      side: null,
      entryPrice: null,
      entryTime: null,
      slPrice: null,
      initialRisk: null,
      initialSlPrice: null,
      targetPrice: null,
      exitPrice: null,
      exitTime: null,
      exitReason: null,
      pnlPts: 0,
      pnlRs: 0,
      peakLtp: null,
      isBreakevenTrailed: false,
      isProfitLockTrailed: false,
      isDynamicTrailingActive: false,
    };

    let sweptHigh = false, sweptHighPrice = 0, candlesSinceHighSweep = 0;
    let sweptLow = false, sweptLowPrice = 0, candlesSinceLowSweep = 0;
    const maxSweepPts = isSensex ? 90 : 65;
    let tradesToday = 0;
    const dayTrades = [];

    for (let i = 0; i < candidateCandles.length; i++) {
      const c = candidateCandles[i];
      const timeStr = formatISTTime(c.date);
      const fullInfo = candleMap.get(c.date.toISOString());
      const vwap = fullInfo.vwap;
      const curEma9 = fullInfo.ema9;
      const curEma21 = fullInfo.ema21;
      const curRsi = fullInfo.rsi;

      // Track Liquidity Sweeps (Must be shallow wick sweep <= maxSweepPts and reclaim within 3 candles)
      if (c.high > refHigh) {
        if ((c.high - refHigh) <= maxSweepPts) {
          sweptHigh = true;
          sweptHighPrice = Math.max(sweptHighPrice, c.high);
          candlesSinceHighSweep = 0;
        } else {
          sweptHigh = false; // Penetrated too deep (breakout attempt, not a trap)
        }
      } else if (sweptHigh) {
        candlesSinceHighSweep++;
        if (candlesSinceHighSweep > 3) sweptHigh = false; // Stale sweep expired
      }

      if (c.low < refLow) {
        if ((refLow - c.low) <= maxSweepPts) {
          sweptLow = true;
          sweptLowPrice = sweptLowPrice === 0 ? c.low : Math.min(sweptLowPrice, c.low);
          candlesSinceLowSweep = 0;
        } else {
          sweptLow = false; // Dumped too deep (breakdown attempt, not a trap)
        }
      } else if (sweptLow) {
        candlesSinceLowSweep++;
        if (candlesSinceLowSweep > 3) sweptLow = false; // Stale sweep expired
      }

      // Position Monitoring
      if (tradeState.inTrade) {
        const isLong = tradeState.side === 'BUY';
        if (isLong) {
          tradeState.peakLtp = Math.max(tradeState.peakLtp, c.high);
          const currentPnlPts = c.close - tradeState.entryPrice;
          const peakPnlPts = tradeState.peakLtp - tradeState.entryPrice;

          // Breakeven: Enhanced/Dual-Edge = +0.7R, Old = +1.0R
          const beTriggerR = isOld ? 1.0 : 0.7;
          if (!tradeState.isBreakevenTrailed && peakPnlPts >= (tradeState.initialRisk * beTriggerR)) {
            tradeState.slPrice = tradeState.entryPrice;
            tradeState.isBreakevenTrailed = true;
          }

          // Profit Lock (+1.5R)
          if (!tradeState.isProfitLockTrailed && peakPnlPts >= (tradeState.initialRisk * 1.5)) {
            tradeState.isProfitLockTrailed = true;
            tradeState.slPrice = tradeState.entryPrice + (tradeState.initialRisk * 0.75);
          }

          // Target 1 (+2R) -> Uncapped Momentum Trailing
          if (!tradeState.isDynamicTrailingActive && peakPnlPts >= (tradeState.initialRisk * 2.0)) {
            tradeState.isDynamicTrailingActive = true;
            tradeState.slPrice = tradeState.entryPrice + (tradeState.initialRisk * 1.25);
          }

          // Momentum Ratchet
          if (tradeState.isDynamicTrailingActive) {
            const trailDist = tradeState.initialRisk * 0.60;
            const newSl = c.high - trailDist;
            if (newSl > tradeState.slPrice) tradeState.slPrice = newSl;
          }

          // Target Hit
          if (tradeState.targetPrice && c.high >= tradeState.targetPrice) {
            tradeState.exitPrice = tradeState.targetPrice;
            tradeState.exitTime = timeStr;
            tradeState.exitReason = 'TARGET_HIT';
            tradeState.pnlPts = tradeState.exitPrice - tradeState.entryPrice;
            tradeState.pnlRs = tradeState.pnlPts * LOT_SIZE;
            tradeState.inTrade = false;
            dayTrades.push({ ...tradeState });
            continue;
          }

          // Check SL Hit
          if (c.low <= tradeState.slPrice) {
            tradeState.exitPrice = tradeState.slPrice;
            tradeState.exitTime = timeStr;
            tradeState.exitReason = tradeState.exitPrice >= tradeState.entryPrice ? 'TRAILING_PROFIT_EXIT' : 'INITIAL_SL_HIT';
            tradeState.pnlPts = tradeState.exitPrice - tradeState.entryPrice;
            tradeState.pnlRs = tradeState.pnlPts * LOT_SIZE;
            tradeState.inTrade = false;
            dayTrades.push({ ...tradeState });
            continue;
          }
        } else {
          // SHORT
          tradeState.peakLtp = Math.min(tradeState.peakLtp, c.low);
          const currentPnlPts = tradeState.entryPrice - c.close;
          const peakPnlPts = tradeState.entryPrice - tradeState.peakLtp;

          const beTriggerR = isOld ? 1.0 : 0.7;
          if (!tradeState.isBreakevenTrailed && peakPnlPts >= (tradeState.initialRisk * beTriggerR)) {
            tradeState.slPrice = tradeState.entryPrice;
            tradeState.isBreakevenTrailed = true;
          }

          if (!tradeState.isProfitLockTrailed && peakPnlPts >= (tradeState.initialRisk * 1.5)) {
            tradeState.isProfitLockTrailed = true;
            tradeState.slPrice = tradeState.entryPrice - (tradeState.initialRisk * 0.75);
          }

          if (!tradeState.isDynamicTrailingActive && peakPnlPts >= (tradeState.initialRisk * 2.0)) {
            tradeState.isDynamicTrailingActive = true;
            tradeState.slPrice = tradeState.entryPrice - (tradeState.initialRisk * 1.25);
          }

          if (tradeState.isDynamicTrailingActive) {
            const trailDist = tradeState.initialRisk * 0.60;
            const newSl = c.low + trailDist;
            if (newSl < tradeState.slPrice) tradeState.slPrice = newSl;
          }

          // Target Hit
          if (tradeState.targetPrice && c.low <= tradeState.targetPrice) {
            tradeState.exitPrice = tradeState.targetPrice;
            tradeState.exitTime = timeStr;
            tradeState.exitReason = 'TARGET_HIT';
            tradeState.pnlPts = tradeState.entryPrice - tradeState.exitPrice;
            tradeState.pnlRs = tradeState.pnlPts * LOT_SIZE;
            tradeState.inTrade = false;
            dayTrades.push({ ...tradeState });
            continue;
          }

          if (c.high >= tradeState.slPrice) {
            tradeState.exitPrice = tradeState.slPrice;
            tradeState.exitTime = timeStr;
            tradeState.exitReason = tradeState.exitPrice <= tradeState.entryPrice ? 'TRAILING_PROFIT_EXIT' : 'INITIAL_SL_HIT';
            tradeState.pnlPts = tradeState.entryPrice - tradeState.exitPrice;
            tradeState.pnlRs = tradeState.pnlPts * LOT_SIZE;
            tradeState.inTrade = false;
            dayTrades.push({ ...tradeState });
            continue;
          }
        }

        // 03:15 PM EOD
        if (timeStr >= '15:15') {
          tradeState.exitPrice = c.close;
          tradeState.exitTime = timeStr;
          tradeState.exitReason = 'INTRADAY_EOD_SQUAREOFF';
          tradeState.pnlPts = isLong ? (c.close - tradeState.entryPrice) : (tradeState.entryPrice - c.close);
          tradeState.pnlRs = tradeState.pnlPts * LOT_SIZE;
          tradeState.inTrade = false;
          dayTrades.push({ ...tradeState });
          break;
        }

        continue;
      }

      // Max trades limit
      if (tradesToday >= (isDualEdge ? 2 : 2)) continue;

      // Prime Window Cutoff (09:30 - 11:30 AM)
      if (!isOld && timeStr > '11:30') continue;
      if (isOld && timeStr > '14:45') continue;

      const isStrongBull = curEma9 > curEma21;
      const isStrongBear = curEma9 < curEma21;
      const isVwapBull = c.close > vwap;
      const isVwapBear = c.close < vwap;
      const isRsiBull = isOld || (curRsi !== null && curRsi >= 55);
      const isRsiBear = isOld || (curRsi !== null && curRsi <= 45);

      // ─── DUAL-EDGE MODULE 1: LIQUIDITY SWEEP TRAP REVERSAL (TURTLE SOUP / 2B) ───
      if (isDualEdge) {
        const canTakeBearishTrap = (!cpr || !cpr.isNarrow || isStrongBear) && (curRsi ? curRsi <= 55 : true);
        const canTakeBullishTrap = (!cpr || !cpr.isNarrow || isStrongBull) && (curRsi ? curRsi >= 45 : true);

        // Bull Trap (Price swept above 15m high, failed and closed back inside below VWAP)
        if (sweptHigh && c.close < refHigh && isVwapBear && (curEma9 ? c.close <= curEma9 : true) && c.close < c.open && canTakeBearishTrap) {
          const entry = c.close;
          const sl = Math.min(entry + MAX_STRUCTURAL_SL, sweptHighPrice + 10);
          const risk = Math.max(MIN_STRUCTURAL_SL, sl - entry);
          const tgt = refLow; // target 15m range bottom

          tradeState = {
            inTrade: true,
            tradeType: 'BULL_TRAP_SHORT',
            side: 'SELL',
            entryPrice: entry,
            entryTime: timeStr,
            slPrice: sl,
            initialSlPrice: sl,
            initialRisk: risk,
            targetPrice: tgt,
            peakLtp: entry,
            isBreakevenTrailed: false,
            isProfitLockTrailed: false,
            isDynamicTrailingActive: false,
          };
          tradesToday++;
          sweptHigh = false;
          continue;
        }
        // Bear Trap (Price swept below 15m low, failed and reclaimed range above VWAP)
        else if (sweptLow && c.close > refLow && isVwapBull && (curEma9 ? c.close >= curEma9 : true) && c.close > c.open && canTakeBullishTrap) {
          const entry = c.close;
          const sl = Math.max(entry - MAX_STRUCTURAL_SL, sweptLowPrice - 10);
          const risk = Math.max(MIN_STRUCTURAL_SL, entry - sl);
          const tgt = refHigh; // target 15m range top

          tradeState = {
            inTrade: true,
            tradeType: 'BEAR_TRAP_LONG',
            side: 'BUY',
            entryPrice: entry,
            entryTime: timeStr,
            slPrice: sl,
            initialSlPrice: sl,
            initialRisk: risk,
            targetPrice: tgt,
            peakLtp: entry,
            isBreakevenTrailed: false,
            isProfitLockTrailed: false,
            isDynamicTrailingActive: false,
          };
          tradesToday++;
          sweptLow = false;
          continue;
        }
      }

      // ─── DUAL-EDGE MODULE 2: TREND BREAKOUT WITH RETEST & CPR CONFIRMATION ───
      const buffer = Math.max(5, currentAtr * 0.10);
      const candleRange = Math.max(0.1, c.high - c.low);
      const candleBody = Math.abs(c.close - c.open);
      const bodyRatio = candleBody / candleRange;
      const isRetestOk = isOld || bodyRatio >= 0.40;
      const isCprOk = isOld || !cpr || cpr.isNarrow;

      if (c.close > (refHigh + buffer)) {
        if (!isStrongBull || !isVwapBull || !isRsiBull) continue;
        if (!isOld && (!isCprOk || !isRetestOk)) continue; // avoid wide CPR / weak wick breakouts

        const entry = c.close;
        let sl;
        let risk;

        if (!isOld) {
          const candleLow = c.low - 5;
          const rawRisk = entry - candleLow;
          risk = Math.max(MIN_STRUCTURAL_SL, Math.min(MAX_STRUCTURAL_SL, rawRisk));
          sl = entry - risk;
        } else {
          sl = isWideCandle ? midpoint : refLow;
          const rawRisk = entry - sl;
          if (rawRisk > (currentAtr * 1.8)) sl = entry - (currentAtr * 1.5);
          risk = Math.max(MIN_STRUCTURAL_SL, entry - sl);
        }

        const tgt = entry + (risk * 2.0);

        tradeState = {
          inTrade: true,
          tradeType: 'TREND_BREAKOUT_LONG',
          side: 'BUY',
          entryPrice: entry,
          entryTime: timeStr,
          slPrice: sl,
          initialSlPrice: sl,
          initialRisk: risk,
          targetPrice: tgt,
          peakLtp: entry,
          isBreakevenTrailed: false,
          isProfitLockTrailed: false,
          isDynamicTrailingActive: false,
        };
        tradesToday++;
        continue;
      } else if (c.close < (refLow - buffer)) {
        if (!isStrongBear || !isVwapBear || !isRsiBear) continue;
        if (!isOld && (!isCprOk || !isRetestOk)) continue;

        const entry = c.close;
        let sl;
        let risk;

        if (!isOld) {
          const candleHigh = c.high + 5;
          const rawRisk = candleHigh - entry;
          risk = Math.max(MIN_STRUCTURAL_SL, Math.min(MAX_STRUCTURAL_SL, rawRisk));
          sl = entry + risk;
        } else {
          sl = isWideCandle ? midpoint : refHigh;
          const rawRisk = sl - entry;
          if (rawRisk > (currentAtr * 1.8)) sl = entry + (currentAtr * 1.5);
          risk = Math.max(MIN_STRUCTURAL_SL, sl - entry);
        }

        const tgt = entry - (risk * 2.0);

        tradeState = {
          inTrade: true,
          tradeType: 'TREND_BREAKDOWN_SHORT',
          side: 'SELL',
          entryPrice: entry,
          entryTime: timeStr,
          slPrice: sl,
          initialSlPrice: sl,
          initialRisk: risk,
          targetPrice: tgt,
          peakLtp: entry,
          isBreakevenTrailed: false,
          isProfitLockTrailed: false,
          isDynamicTrailingActive: false,
        };
        tradesToday++;
        continue;
      }
    }

    const dayPnlPts = dayTrades.reduce((acc, t) => acc + t.pnlPts, 0);
    const dayPnlRs = dayTrades.reduce((acc, t) => acc + t.pnlRs, 0);

    dailySummaries.push({
      date: day,
      refRange: `${refHigh.toFixed(0)} - ${refLow.toFixed(0)} (${rangePts.toFixed(0)} pts)`,
      cprInfo: cpr ? `CPR: ${cpr.width.toFixed(1)} pts (${cpr.widthPct.toFixed(2)}% - ${cpr.isNarrow ? 'NARROW' : 'WIDE'})` : 'CPR: N/A',
      tradesCount: dayTrades.length,
      trades: dayTrades,
      dayPnlPts,
      dayPnlRs,
    });
  }

  return dailySummaries;
}

async function main() {
  console.log('===================================================================================');
  console.log(`📊 ${INDEX_NAME} 15-MIN BREAKOUT STRATEGY: 25-DAY HISTORICAL BACKTEST`);
  console.log('   Comparing Old Naive System vs. Dual-Edge Institutional System (Breakout + Trap)');
  console.log('===================================================================================\n');

  console.log(`📡 Fetching ${INDEX_NAME} (${SYMBOL}) 5-minute historical candles from Yahoo Finance...`);
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMBOL)}?interval=5m&range=40d`);
  const json = await res.json();
  const result = json.chart.result[0];
  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];

  const rawCandles = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (quote.open[i] !== null && quote.close[i] !== null) {
      rawCandles.push({
        date: new Date(timestamps[i] * 1000),
        open: quote.open[i],
        high: quote.high[i],
        low: quote.low[i],
        close: quote.close[i],
        volume: quote.volume[i] || 1000
      });
    }
  }

  const daysMap = new Map();
  for (const c of rawCandles) {
    const dayStr = getIstDateStr(c.date);
    if (!daysMap.has(dayStr)) daysMap.set(dayStr, []);
    daysMap.get(dayStr).push(c);
  }

  const allTradingDays = Array.from(daysMap.keys()).sort();
  const targetDays = allTradingDays.slice(-25);
  console.log(`Loaded ${rawCandles.length} candles across ${targetDays.length} trading days:`);
  console.log(`From ${targetDays[0]} to ${targetDays[targetDays.length - 1]}\n`);

  const vwaps = calculateVWAP(rawCandles);
  const ema9 = calculateEMA(rawCandles, 9);
  const ema21 = calculateEMA(rawCandles, 21);
  const atrs = calculateATR(rawCandles, 14);
  const rsis = calculateRSI(rawCandles, 14);

  const candleMap = new Map();
  rawCandles.forEach((c, idx) => {
    candleMap.set(`${c.date.toISOString()}`, {
      ...c,
      idx,
      vwap: vwaps[idx],
      ema9: ema9[idx],
      ema21: ema21[idx],
      atr: atrs[idx],
      rsi: rsis[idx]
    });
  });

  // Run Both Systems
  const oldResults = simulateEngine(rawCandles, candleMap, daysMap, targetDays, allTradingDays, 'OLD');
  const dualResults = simulateEngine(rawCandles, candleMap, daysMap, targetDays, allTradingDays, 'DUAL_EDGE');

  console.log('───────────────────────────────────────────────────────────────────────────────────');
  console.log(`📅 25-DAY DAY-BY-DAY COMPARATIVE SUMMARY (${INDEX_NAME})`);
  console.log('───────────────────────────────────────────────────────────────────────────────────');
  console.log(`Day #  Date        15m Range (Width)       Old System P&L (Losses)   Dual-Edge Institutional P&L`);
  console.log(`-----------------------------------------------------------------------------------`);

  let oldTotalPts = 0, oldTotalRs = 0, oldTotalTrades = 0, oldLosses = 0, oldWins = 0, oldBe = 0;
  let dualTotalPts = 0, dualTotalRs = 0, dualTotalTrades = 0, dualLosses = 0, dualWins = 0, dualBe = 0;
  let skippedDays = 0;

  for (let idx = 0; idx < targetDays.length; idx++) {
    const day = targetDays[idx];
    const oldDay = oldResults.find(d => d.date === day) || { dayPnlPts: 0, dayPnlRs: 0, tradesCount: 0, trades: [] };
    const dualDay = dualResults.find(d => d.date === day) || { dayPnlPts: 0, dayPnlRs: 0, tradesCount: 0, trades: [] };

    oldTotalPts += oldDay.dayPnlPts;
    oldTotalRs += oldDay.dayPnlRs;
    oldTotalTrades += oldDay.tradesCount;
    const dayOldLosses = oldDay.trades.filter(t => t.pnlPts < 0).length;
    const dayOldWins = oldDay.trades.filter(t => t.pnlPts > 0).length;
    const dayOldBe = oldDay.trades.filter(t => t.pnlPts === 0).length;
    oldLosses += dayOldLosses;
    oldWins += dayOldWins;
    oldBe += dayOldBe;

    dualTotalPts += dualDay.dayPnlPts;
    dualTotalRs += dualDay.dayPnlRs;
    dualTotalTrades += dualDay.tradesCount;
    const dayDualLosses = dualDay.trades.filter(t => t.pnlPts < 0).length;
    const dayDualWins = dualDay.trades.filter(t => t.pnlPts > 0).length;
    const dayDualBe = dualDay.trades.filter(t => t.pnlPts === 0).length;
    dualLosses += dayDualLosses;
    dualWins += dayDualWins;
    dualBe += dayDualBe;

    let dualOutcome = '';
    if (dualDay.skippedReason) {
      skippedDays++;
      dualOutcome = `🛡 Skipped (>${MAX_OPENING_RANGE_PTS} pt range cap)`;
    } else if (dualDay.tradesCount === 0) {
      dualOutcome = 'ℹ Inside Range (0 Trades)';
    } else {
      const sign = dualDay.dayPnlPts >= 0 ? '+' : '';
      dualOutcome = `${sign}${dualDay.dayPnlPts.toFixed(1)} pts (${dayDualWins}W / ${dayDualBe}BE / ${dayDualLosses}L)`;
    }

    const oldSign = oldDay.dayPnlPts >= 0 ? '+' : '';
    const oldStr = `${oldSign}${oldDay.dayPnlPts.toFixed(1)} pts (${dayOldLosses} SL)`;
    const rangeStr = dualDay.refRange || oldDay.refRange || 'N/A';

    console.log(
      `${String(idx + 1).padStart(2, ' ')}.   ${day}  ${rangeStr.padEnd(24, ' ')}  ${oldStr.padEnd(24, ' ')}  ${dualOutcome}`
    );
  }

  console.log('\n===================================================================================');
  console.log(`🏆 25-DAY EXECUTIVE COMPARATIVE SCOREBOARD (${INDEX_NAME})`);
  console.log('===================================================================================');
  console.log(`Performance Metric         Old Naive Breakout          Dual-Edge Institutional System`);
  console.log(`-----------------------------------------------------------------------------------`);
  console.log(`Total Trading Days         ${targetDays.length} days                     ${targetDays.length} days`);
  console.log(`Exhausted Days Skipped     0 days                      ${skippedDays} days (Cap > ${MAX_OPENING_RANGE_PTS} pts)`);
  console.log(`Total Trades Executed      ${oldTotalTrades} trades                   ${dualTotalTrades} trades (Selective Setups)`);
  console.log(`Stop-Loss Losses           ${oldLosses} LOSSES (Frequent SL!)       ${dualLosses} LOSSES (Slashed!)`);
  console.log(`Breakeven / Scratch Exits  ${oldBe} trades                     ${dualBe} trades (Capital Protected)`);
  console.log(`Winning Trades             ${oldWins} trades                     ${dualWins} trades (High Reward Traps)`);
  console.log(`Win + Breakeven Rate       ${(((oldTotalTrades - oldLosses) / Math.max(1, oldTotalTrades)) * 100).toFixed(1)}%                      ${(((dualTotalTrades - dualLosses) / Math.max(1, dualTotalTrades)) * 100).toFixed(1)}%`);
  console.log(`Net Points Gained          ${oldTotalPts >= 0 ? '+' : ''}${oldTotalPts.toFixed(1)} pts                 ${dualTotalPts >= 0 ? '+' : ''}${dualTotalPts.toFixed(1)} pts`);
  console.log(`Net Realized P&L (1 Lot)   ${oldTotalRs >= 0 ? '+' : ''}₹${oldTotalRs.toLocaleString('en-IN')}             ${dualTotalRs >= 0 ? '+' : ''}₹${dualTotalRs.toLocaleString('en-IN')}`);
  console.log(`Net Profit Difference      Baseline                    +₹${(dualTotalRs - oldTotalRs).toLocaleString('en-IN')} PROFIT BOOST`);
  console.log('\n===================================================================================');
  console.log(`📝 DETAILED TRADE-BY-TRADE JOURNAL (${INDEX_NAME} DUAL-EDGE SYSTEM)`);
  console.log('===================================================================================');
  for (let idx = 0; idx < targetDays.length; idx++) {
    const day = targetDays[idx];
    const dualDay = dualResults.find(d => d.date === day);
    console.log(`\n📅 Day ${idx + 1}: ${day} | 15m Range: ${dualDay?.refRange || 'N/A'} | ${dualDay?.cprInfo || ''}`);
    if (dualDay?.skippedReason) {
      console.log(`   ⛔ NO TRADES TAKEN: ${dualDay.skippedReason}`);
    } else if (!dualDay || dualDay.trades.length === 0) {
      console.log(`   ℹ NO TRADES TAKEN: Price stayed inside opening range during morning prime window.`);
    } else {
      dualDay.trades.forEach((t, tIdx) => {
        const sign = t.pnlPts >= 0 ? '+' : '';
        const initSl = t.initialSlPrice || (t.side === 'BUY' ? (t.entryPrice - t.initialRisk) : (t.entryPrice + t.initialRisk));
        console.log(`   Trade #${tIdx + 1}: [${t.tradeType || t.side}] Entry @ ${t.entryTime} (${t.entryPrice.toFixed(1)}) | SL: ${initSl.toFixed(1)} -> Exit @ ${t.exitTime} (${t.exitPrice.toFixed(1)})`);
        console.log(`            Result: ${t.exitReason} | P&L: ${sign}${t.pnlPts.toFixed(1)} pts (${sign}₹${t.pnlRs.toFixed(0)})`);
      });
      console.log(`   👉 Day Total: ${dualDay.dayPnlPts >= 0 ? '+' : ''}${dualDay.dayPnlPts.toFixed(1)} pts (${dualDay.dayPnlRs >= 0 ? '+' : ''}₹${dualDay.dayPnlRs.toFixed(0)})`);
    }
  }
}

main().catch(console.error);
