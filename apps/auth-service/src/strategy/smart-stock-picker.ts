import { Logger } from '@nestjs/common';
import { detectIntradayMomentum, detectIntradayMomentumShort, DailyCandle } from '../swing-scanner/vcp.analyzer';

// ─── Blacklist of Slow-Moving / Low-Volatility / Low-Beta / Penny Stocks ──────────
const BLACKLISTED_SLOW_STOCKS = new Set([
  'MOTHERSON', 'MOTHERSUMI', 'IDEA', 'VODAFONE', 'NMDC', 'NMDCLTD',
  'SAIL', 'NHPC', 'SJVN', 'IRFC', 'RVNL', 'HUDCO', 'IREDA',
  'IOB', 'UNIONBANK', 'PNB', 'IDFCFIRSTB', 'BANDHANBNK', 'GMRINFRA',
  'SUZLON', 'JISLJALEQS', 'AMBUJACEM', 'ACC', 'BERGEPAINT', 'BATAINDIA',
  'CROMPTON', 'DABUR', 'MARICO', 'COLPAL', 'ICICIPRULI', 'SBICARD',
  'NATIONALUM', 'OIL', 'PETRONET', 'IOC', 'BPCL', 'HINDPETRO', 'POWERGRID', 'NTPC', 'COALINDIA'
]);

/**
 * Calculates Average True Range (ATR) over N periods
 */
function calculateATR(candles: DailyCandle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;
  let trSum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const current = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prevClose),
      Math.abs(current.low - prevClose)
    );
    trSum += tr;
  }
  return trSum / period;
}

/**
 * Dynamically fetches the active liquid stock universe directly from Zerodha Kite API.
 * Uses NFO instruments to extract all 180+ liquid F&O underlying stocks (Nifty 50, Nifty Next 50 & Midcap liquid leaders)
 * and maps them to their NSE equity instrument tokens.
 */
export async function getDynamicLiquidStocks(kite: any, logger?: Logger): Promise<{ symbols: string[]; tokenMap: Map<string, number> }> {
  const tokenMap = new Map<string, number>();

  // 1. Fetch NSE Equity instruments
  let nseInstruments: any[] = [];
  try {
    nseInstruments = await kite.getInstruments('NSE');
  } catch (err) {
    logger?.warn(`Failed to fetch NSE instruments from Zerodha: ${err.message}`);
  }

  const allNseSymbols = new Set<string>();
  nseInstruments.forEach((i: any) => {
    if (i.instrument_type === 'EQ' && i.exchange === 'NSE') {
      const sym = (i.tradingsymbol || '').trim().toUpperCase();
      if (sym && !sym.includes(' ') && !sym.startsWith('NIFTY') && !sym.startsWith('BANKNIFTY')) {
        tokenMap.set(sym, i.instrument_token);
        allNseSymbols.add(sym);
      }
    }
  });

  // 2. Fetch NFO instruments to get Zerodha's official F&O liquid stock universe
  let fnoSymbols: string[] = [];
  try {
    const nfoInstruments = await kite.getInstruments('NFO');
    const fnoSet = new Set<string>();
    nfoInstruments.forEach((i: any) => {
      if (i.name) {
        const sym = i.name.toUpperCase().trim();
        if (allNseSymbols.has(sym)) {
          fnoSet.add(sym);
        }
      }
    });
    fnoSymbols = Array.from(fnoSet);
    if (fnoSymbols.length > 0) {
      logger?.log(`⚡ Loaded ${fnoSymbols.length} liquid F&O stocks dynamically from Zerodha API`);
    }
  } catch (err) {
    logger?.warn(`Could not fetch NFO universe, falling back to NSE equity universe: ${err.message}`);
  }

  const rawUniverse = fnoSymbols.length >= 30 ? fnoSymbols : Array.from(allNseSymbols);

  // Filter blacklisted slow-moving stocks
  const liquidSymbols = rawUniverse.filter(sym => !BLACKLISTED_SLOW_STOCKS.has(sym));
  return { symbols: liquidSymbols, tokenMap };
}

/**
 * Automatically picks the best NSE equity stock for intraday trading
 * based on current live momentum and potential for a 3-10% move.
 */
export async function autoSelectStock(
  kite: any,
  targetRs: number,
  stopLossRs: number,
  logger?: Logger,
  maxCapital?: number,
): Promise<{ symbol: string; exchange: string; ltp: number; qty: number }> {
  // 0. Detect available Zerodha equity capital
  let availableCapital = maxCapital;
  if (!availableCapital || availableCapital <= 0) {
    try {
      const margins = await kite.getMargins('equity').catch(() => null);
      const liveCash = margins?.available?.live_balance ?? margins?.available?.cash ?? 0;
      if (liveCash > 0) {
        availableCapital = liveCash;
        logger?.log(`💰 Detected live Zerodha available capital: ₹${liveCash.toLocaleString('en-IN')}`);
      }
    } catch { }
  }
  if (!availableCapital || availableCapital <= 0) {
    availableCapital = 25000; // Fallback capital default if unreadable
  }

  // 1. Fetch live stock universe dynamically from Zerodha API
  const { symbols: targetSymbols, tokenMap } = await getDynamicLiquidStocks(kite, logger);

  logger?.log(`🎯 Auto-selecting best stock dynamically from ${targetSymbols.length} live Zerodha liquid stocks (Available Capital: ₹${availableCapital.toLocaleString('en-IN')})...`);

  // ── Get Live Quotes (LTP, OHLC, Volume) ────────────────────────────────────────────────
  const ltpSymbols = targetSymbols.map(s => `NSE:${s}`);
  let liveQuotes: Record<string, any> = {};
  try {
    liveQuotes = await kite.getQuote(ltpSymbols);
  } catch (err) {
    logger?.warn(`Live quotes fetch failed in auto-picker: ${err.message}`);
  }

  const candidates: Array<{ symbol: string; score: number; ltp: number; qty: number }> = [];

  // 2. Scan each stock for momentum (using historical daily data)
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 100);

  // Use a 3-stock batch with 150ms pause to comply with Zerodha 3 req/sec rate limit
  for (let i = 0; i < targetSymbols.length; i += 3) {
    const batch = targetSymbols.slice(i, i + 3);
    await Promise.allSettled(batch.map(async (symbol) => {
      try {
        // ── 0. Blacklist Check ──
        if (BLACKLISTED_SLOW_STOCKS.has(symbol)) {
          return;
        }

        const token = tokenMap.get(symbol);
        if (!token) return;

        const data = await kite.getHistoricalData(token, 'day', from, to, false);
        if (!data || data.length < 50) return;

        const candles: DailyCandle[] = data.map((c: any) => ({
          date: new Date(c.date),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume
        }));

        // ── Inject Live Data ────────────────────────────────────────────────
        const quote = liveQuotes[`NSE:${symbol}`];
        if (quote && quote.last_price) {
          const liveLtp = quote.last_price;
          const liveOhlc = quote.ohlc || {};
          const liveVol = quote.volume || 0;

          const lastCandle = candles[candles.length - 1];
          const now = new Date();
          const isToday = lastCandle.date.toDateString() === now.toDateString();

          if (isToday) {
            lastCandle.close = liveLtp;
            lastCandle.high = Math.max(lastCandle.high, liveLtp, liveOhlc.high || liveLtp);
            lastCandle.low = Math.min(lastCandle.low, liveLtp, liveOhlc.low || liveLtp);
            lastCandle.volume = Math.max(lastCandle.volume, liveVol);
          } else if (now.getHours() >= 9) {
            candles.push({
              date: now,
              open: liveOhlc.open || liveLtp,
              high: Math.max(liveOhlc.high || liveLtp, liveLtp),
              low: Math.min(liveOhlc.low || liveLtp, liveLtp),
              close: liveLtp,
              volume: liveVol || lastCandle.volume,
            });
          }
        }

        // ── 1. ATR % Volatility Check (Skip Slow Movers) ────────────────────
        const atr14 = calculateATR(candles, 14);
        const lastCandle = candles[candles.length - 1];
        const atrPct = lastCandle.close > 0 ? (atr14 / lastCandle.close) * 100 : 0;
        if (atrPct < 1.8) {
          logger?.log(`  🚫 Skipping ${symbol}: Low volatility ATR% (${atrPct.toFixed(2)}% < 1.8% min threshold) — stock moves too slowly`);
          return;
        }

        // ── 2. Event / Corporate Action / Earnings Announcement Filters ──────
        if (candles.length >= 22) {
          const todayCandle = candles[candles.length - 1];
          const prevDayCandle = candles[candles.length - 2];

          // A. Tight Overnight Gap Filter (>1.5% gap indicates event/earnings risk)
          const gapPct = Math.abs((todayCandle.open - prevDayCandle.close) / prevDayCandle.close) * 100;
          if (gapPct > 1.5) {
            logger?.log(`  🚫 Skipping ${symbol}: Abnormal gap ${gapPct.toFixed(1)}% (likely event/earnings result)`);
            return;
          }

          // B. Abnormal Volume Spike (>2.0x 20-day avg volume indicates event day activity)
          const recentCandles = candles.slice(-22, -2); // last 20 trading days (excluding today)
          const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;
          if (avgVolume > 0 && todayCandle.volume > avgVolume * 2.0) {
            logger?.log(`  🚫 Skipping ${symbol}: Volume spike ${(todayCandle.volume / avgVolume).toFixed(1)}x avg (likely event/result)`);
            return;
          }

          // C. Intraday Range Expansion Spike (>2.2x ATR indicates pre/post-event volatility spike)
          const todayRange = todayCandle.high - todayCandle.low;
          if (atr14 > 0 && todayRange > atr14 * 2.2) {
            logger?.log(`  🚫 Skipping ${symbol}: Intraday range spike ${(todayRange / atr14).toFixed(1)}x ATR (abnormal event volatility)`);
            return;
          }
        }

        // Helper to calculate exact capital-constrained quantity with 5x MIS leverage
        const calcCapitalQty = (price: number, riskPerShare: number) => {
          const riskQty = riskPerShare > 0 ? Math.ceil(stopLossRs / riskPerShare) : 1;
          const maxBuyingPower = (availableCapital || 20000) * 5; // Zerodha 5x MIS leverage
          const maxCapitalQty = Math.floor(maxBuyingPower / price);
          return Math.max(1, Math.min(riskQty, maxCapitalQty));
        };

        // Use both long and short detectors
        const resultLong = detectIntradayMomentum(candles);
        if (resultLong) {
          const ltp = resultLong.currentPrice;
          const riskPerShare = Math.abs(resultLong.entryPrice - resultLong.stopLoss);
          const qty = calcCapitalQty(ltp, riskPerShare);

          candidates.push({ symbol, score: resultLong.score + Math.round(atrPct * 10), ltp, qty });
          logger?.log(`  📈 Momentum candidate (LONG): ${symbol} | Score:${resultLong.score} | ATR%:${atrPct.toFixed(2)}% | LTP:₹${ltp.toFixed(2)} | Qty:${qty}`);
        }

        const resultShort = detectIntradayMomentumShort(candles);
        if (resultShort) {
          const ltp = resultShort.currentPrice;
          const riskPerShare = Math.abs(resultShort.entryPrice - resultShort.stopLoss);
          const qty = calcCapitalQty(ltp, riskPerShare);

          candidates.push({ symbol, score: resultShort.score + Math.round(atrPct * 10), ltp, qty });
          logger?.log(`  📉 Momentum candidate (SHORT): ${symbol} | Score:${resultShort.score} | ATR%:${atrPct.toFixed(2)}% | LTP:₹${ltp.toFixed(2)} | Qty:${qty}`);
        }
      } catch (e) {
        // Skip on error
      }
    }));
    // 150ms pause for Zerodha rate limits (3 req/sec)
    await new Promise(r => setTimeout(r, 150));
  }

  if (candidates.length > 0) {
    // Pick the one with the highest score
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    logger?.log(`✅ Auto-picked: ${best.symbol} (score:${best.score}, qty:${best.qty})`);
    logger?.log(`📋 All momentum candidates: ${candidates.map(c => `${c.symbol}(${c.score})`).join(', ')}`);
    return { symbol: best.symbol, exchange: 'NSE', ltp: best.ltp, qty: best.qty };
  }

  // ── Smarter fallback: dynamically pick the highest momentum gainer/loser from liveQuotes ──
  logger?.warn(`⚠ No strict VCP pattern candidates found. Ranking liquid high-beta stocks dynamically...`);

  const dynamicRankings: Array<{ symbol: string; score: number; ltp: number; qty: number }> = [];

  for (const sym of targetSymbols) {
    if (BLACKLISTED_SLOW_STOCKS.has(sym)) continue;
    const key = `NSE:${sym}`;
    const quote = liveQuotes[key];
    if (quote?.last_price && quote.last_price > 0 && quote.ohlc?.close) {
      const ltp = quote.last_price;
      const prevClose = quote.ohlc.close;
      const todayOpen = quote.ohlc.open || ltp;
      const changePct = Math.abs((ltp - prevClose) / prevClose) * 100;
      const dayRangePct = ((quote.ohlc.high - quote.ohlc.low) / ltp) * 100;

      // Skip stocks with abnormal overnight gap (>1.5%) — likely event/result
      const gapPct = Math.abs((todayOpen - prevClose) / prevClose) * 100;
      if (gapPct > 1.5) continue;

      // Exclude slow-moving / low-volatility stocks (less than 1.8% day range or 1.0% change)
      if (dayRangePct < 1.8 && changePct < 1.0) continue;

      const score = Math.round((changePct * 50) + (dayRangePct * 30));
      const maxBuyingPower = (availableCapital || 25000) * 5;
      const qty = Math.max(1, Math.min(Math.ceil(stopLossRs / (ltp * 0.015)), Math.floor(maxBuyingPower / ltp)));
      dynamicRankings.push({ symbol: sym, score, ltp, qty });
    }
  }

  if (dynamicRankings.length > 0) {
    dynamicRankings.sort((a, b) => b.score - a.score);
    const topDynamic = dynamicRankings[0];
    logger?.log(`🚀 Dynamic Momentum Pick: ${topDynamic.symbol} (Score: ${topDynamic.score}, LTP: ₹${topDynamic.ltp.toFixed(2)}, Qty: ${topDynamic.qty})`);
    return { symbol: topDynamic.symbol, exchange: 'NSE', ltp: topDynamic.ltp, qty: topDynamic.qty };
  }

  // Absolute last resort (High Volatility, High Beta leader)
  const fallbackSym = 'TRENT';
  const relQuotes = await kite.getLTP([`NSE:${fallbackSym}`]);
  const ltp = relQuotes[`NSE:${fallbackSym}`]?.last_price || 6500;
  const qty = Math.ceil(stopLossRs / (ltp * 0.015));
  logger?.warn(`↩ Fallback to high-momentum leader ${fallbackSym} @ ₹${ltp.toFixed(2)}`);
  return { symbol: fallbackSym, exchange: 'NSE', ltp, qty };
}


