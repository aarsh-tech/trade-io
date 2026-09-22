import { Logger } from '@nestjs/common';
import { NIFTY_500_UNIVERSE, FO_STOCKS_LIST } from '../market/market.constants';

// ─── Minimal Filter for Pure Penny / Illiquid / Extreme High-Price Symbols ───────────────────
const BLACKLISTED_SLOW_STOCKS = new Set([
  'IDEA', 'VODAFONE', 'JISLJALEQS', 'YESBANK', 'SUZLON', 'IFCI', 'NIACL'
]);

export const globalTickSizeMap = new Map<string, number>();

// In-memory caches to prevent Zerodha "Too many requests" (429) rate limiting
let cachedDynamicStocks: { symbols: string[]; tokenMap: Map<string, number>; tickSizeMap: Map<string, number> } | null = null;
let cachedDynamicStocksTime = 0;
let cachedFnoSymbolsList: string[] = [];
let cachedFnoSymbolsTime = 0;

export function getInstrumentTickSize(symbol: string, ltp?: number): number {
  const cleanSym = (symbol || '').replace('NSE:', '').replace('NFO:', '').trim().toUpperCase();
  if (globalTickSizeMap.has(cleanSym)) {
    const ts = globalTickSizeMap.get(cleanSym);
    if (ts && ts > 0) return ts;
  }
  // Fallback to NSE price-tiered tick size conventions if not found in broker map
  if (ltp && ltp > 0) {
    if (ltp >= 10000) return 1.00; // e.g. SOLARINDS, MRF, PAGEIND
    if (ltp >= 5000) return 0.50;  // e.g. PERSISTENT, BOSCHLTD
    if (ltp >= 2000) return 0.10;  // e.g. LTIM, COFORGE, DIXON
  }
  return 0.05; // Standard NSE equity & F&O tick size
}

export function roundToInstrumentTick(price: number, tickSize: number = 0.05): number {
  if (!price || isNaN(price)) return 0;
  const tick = tickSize > 0 ? tickSize : 0.05;
  const rounded = Math.round(price / tick) * tick;
  return parseFloat(rounded.toFixed(2));
}

/**
 * Dynamically fetches the active liquid stock universe directly from Zerodha Kite API.
 * Combines full NIFTY 500 universe (Top Gainers/Losers, Midcaps, RRKABEL, IFCI, etc.)
 * with all 180+ liquid F&O stocks and maps them to their NSE equity instrument tokens.
 */
export async function getDynamicLiquidStocks(kite: any, logger?: Logger): Promise<{ symbols: string[]; tokenMap: Map<string, number>; tickSizeMap: Map<string, number> }> {
  if (cachedDynamicStocks && (Date.now() - cachedDynamicStocksTime) < 4 * 60 * 60 * 1000) {
    return cachedDynamicStocks;
  }

  const tokenMap = new Map<string, number>();
  const tickSizeMap = new Map<string, number>();

  // 1. Fetch NSE Equity instruments
  let nseInstruments: any[] = [];
  try {
    nseInstruments = await kite.getInstruments('NSE');
  } catch (err: any) {
    logger?.warn(`Failed to fetch NSE instruments from Zerodha: ${err.message}`);
  }

  const allNseSymbols = new Set<string>();
  nseInstruments.forEach((i: any) => {
    if (i.instrument_type === 'EQ' && i.exchange === 'NSE') {
      const sym = (i.tradingsymbol || '').trim().toUpperCase();
      if (sym && !sym.includes(' ')) {
        // Exclude non-standard equity instruments (ETFs, index funds, gold/silver bees, SME series, illiquid series)
        const isExcludedType = sym.endsWith('-BE') || sym.endsWith('-BZ') || sym.endsWith('-SM') || sym.endsWith('-BL') ||
          sym.endsWith('-IL') || sym.endsWith('-SG') || sym.startsWith('NIFTY') || sym.startsWith('BANKNIFTY') ||
          sym.includes('BEES') || sym.includes('GOLD') || sym.includes('SILVER') || sym.includes('LIQUID') ||
          sym.includes('ETF') || sym.includes('SENSEX');
        if (!isExcludedType) {
          tokenMap.set(sym, i.instrument_token);
          if (i.tick_size && i.tick_size > 0) {
            tickSizeMap.set(sym, i.tick_size);
            globalTickSizeMap.set(sym, i.tick_size);
          }
          allNseSymbols.add(sym);
        }
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
  } catch (err: any) {
    logger?.warn(`Could not fetch NFO universe: ${err.message}`);
  }

  // 3. Build Full Dynamic NSE Scanner Universe:
  // Order: F&O symbols first, then NIFTY 500, then all other active NSE equities (GABRIEL, MEESHO, JAINREC, CEMPRO, etc.)
  const combinedSet = new Set<string>();
  const liquidSymbols: string[] = [];

  // Priority 1: Liquid F&O stocks
  for (const sym of fnoSymbols) {
    if (allNseSymbols.has(sym) && !BLACKLISTED_SLOW_STOCKS.has(sym) && !combinedSet.has(sym)) {
      combinedSet.add(sym);
      liquidSymbols.push(sym);
    }
  }

  // Priority 2: NIFTY 500 universe
  for (const sym of (NIFTY_500_UNIVERSE || [])) {
    if (allNseSymbols.has(sym) && !BLACKLISTED_SLOW_STOCKS.has(sym) && !combinedSet.has(sym)) {
      combinedSet.add(sym);
      liquidSymbols.push(sym);
    }
  }

  // Priority 3: All remaining active NSE liquid equities (ensures no intraday runner is missed)
  for (const sym of allNseSymbols) {
    if (!BLACKLISTED_SLOW_STOCKS.has(sym) && !combinedSet.has(sym)) {
      combinedSet.add(sym);
      liquidSymbols.push(sym);
    }
  }

  logger?.log(`🎯 Active stock scanner universe ready: ${liquidSymbols.length} active NSE equity stocks (F&O + NIFTY 500 + Full NSE Equities)`);
  cachedDynamicStocks = { symbols: liquidSymbols, tokenMap, tickSizeMap };
  cachedDynamicStocksTime = Date.now();
  return cachedDynamicStocks;
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
  excludedSymbols?: Set<string>,
  minStockPrice: number = 50,
): Promise<{ symbol: string; exchange: string; ltp: number; qty: number }> {
  // 0. Detect available Zerodha equity capital
  let availableCapital = maxCapital;
  if (!availableCapital || availableCapital <= 0) {
    try {
      const margins = await kite.getMargins().catch(() => null);
      const liveCash = margins?.equity?.available?.live_balance ?? margins?.equity?.available?.cash ?? margins?.available?.live_balance ?? margins?.available?.cash ?? 0;
      if (liveCash > 0) {
        availableCapital = liveCash;
        logger?.log(`💰 Detected live Zerodha available capital: ₹${liveCash.toLocaleString('en-IN')}`);
      }
    } catch { }
  }
  if (!availableCapital || availableCapital <= 0) {
    availableCapital = 15000; // Safe default capital
  }

  const topCandidates = await getTopCandidateStocks(kite, targetRs, stopLossRs, logger, availableCapital, 10, excludedSymbols, minStockPrice);
  if (topCandidates.length > 0) {
    const top = topCandidates[0];
    const pdhInfo = top.pdh ? ` | PDH: ₹${top.pdh.toFixed(2)}${top.isAbovePdh ? ' (Above PDH 🔥)' : ''}` : '';
    logger?.log(`✅ Auto-picked Top Momentum Leader: ${top.symbol} (Score: ${top.score}, LTP: ₹${top.ltp.toFixed(2)}, Trend: ${top.trend || 'ACTIVE'}, Qty: ${top.qty}${pdhInfo})`);
    return { symbol: top.symbol, exchange: top.exchange, ltp: top.ltp, qty: top.qty };
  }

  // Fallback
  const fallbackSym = 'TRENT';
  const relQuotes = await kite.getLTP([`NSE:${fallbackSym}`]).catch(() => ({}));
  const ltp = relQuotes[`NSE:${fallbackSym}`]?.last_price || 6500;
  const maxLossFallback = stopLossRs && stopLossRs > 0 ? stopLossRs : 500;
  const riskPerShare = Math.max(0.50, ltp * 0.01);
  const maxRiskQty = Math.max(1, Math.floor(maxLossFallback / riskPerShare));
  const maxCapQty = Math.max(1, Math.floor((availableCapital * 0.25 * 5) / ltp));
  const qty = Math.min(maxRiskQty, maxCapQty);
  logger?.warn(`↩ Fallback to high-momentum leader ${fallbackSym} @ ₹${ltp.toFixed(2)} (Qty: ${qty})`);
  return { symbol: fallbackSym, exchange: 'NSE', ltp, qty };
}

export interface CandidateStock {
  symbol: string;
  exchange: string;
  ltp: number;
  qty: number;
  score: number;
  trend: 'LONG' | 'SHORT';
  changeFromOpenPct: number;
  dayChangePct: number;
  dayRangePct: number;
  turnoverCr: number;
  open: number;
  high: number;
  low: number;
  isOpenLow?: boolean;
  isOpenHigh?: boolean;
  pdh?: number;
  pdl?: number;
  prevClose?: number;
  isAbovePdh?: boolean;
  isBelowPdl?: boolean;
  distToPdhPct?: number;
  distToPdlPct?: number;
}

/**
 * Returns top N ranked momentum candidate stocks from the full active NSE universe
 * with multi-factor scoring (Intraday % Move, Day Range, Volume Surge, PDH/PDL Support & Resistance Confirmation).
 */
export async function getTopCandidateStocks(
  kite: any,
  targetRs: number,
  stopLossRs: number,
  logger?: Logger,
  maxCapital?: number,
  limit: number = 20,
  excludedSymbols?: Set<string>,
  minStockPrice: number = 50,
): Promise<CandidateStock[]> {
  const result: CandidateStock[] = [];

  let availableCapital = maxCapital;
  if (!availableCapital || availableCapital <= 0) {
    try {
      const margins = await kite.getMargins().catch(() => null);
      const liveCash = margins?.equity?.available?.live_balance ?? margins?.equity?.available?.cash ?? margins?.available?.live_balance ?? margins?.available?.cash ?? 0;
      if (liveCash > 0) availableCapital = liveCash;
    } catch { }
  }
  if (!availableCapital || availableCapital <= 0) availableCapital = 15000;

  const { symbols: targetSymbols, tokenMap } = await getDynamicLiquidStocks(kite, logger);

  // Batch get quotes (up to 150 symbols per batch)
  const ltpSymbols = targetSymbols
    .filter(s => !BLACKLISTED_SLOW_STOCKS.has(s) && (!excludedSymbols || !excludedSymbols.has(s)))
    .map(s => `NSE:${s}`);

  let liveQuotes: Record<string, any> = {};
  for (let i = 0; i < ltpSymbols.length; i += 150) {
    const batch = ltpSymbols.slice(i, i + 150);
    try {
      const quotes = await kite.getQuote(batch);
      Object.assign(liveQuotes, quotes);
    } catch (err: any) {
      logger?.warn(`Live quotes batch fetch failed: ${err.message}`);
    }
    // Throttle slightly between chunks to respect Zerodha API rate limit
    if (i + 150 < ltpSymbols.length) {
      await new Promise(resolve => setTimeout(resolve, 80));
    }
  }

  // Current time in IST to adjust volume/turnover expectations for market open
  const istDate = new Date(new Date().getTime() + 330 * 60000 + new Date().getTimezoneOffset() * 60000);
  const istHhmm = istDate.getHours() * 60 + istDate.getMinutes();
  const isMarketOpening = istHhmm <= (9 * 60 + 20); // 09:15 to 09:20 AM
  const maxBuyingPower = (availableCapital || 15000) * 5; // Zerodha 5x MIS leverage

  for (const sym of targetSymbols) {
    if (BLACKLISTED_SLOW_STOCKS.has(sym)) continue;
    if (excludedSymbols && excludedSymbols.has(sym)) continue;

    const key = `NSE:${sym}`;
    const quote = liveQuotes[key];
    if (quote?.last_price && quote.last_price > 0 && quote.ohlc?.close) {
      const ltp = quote.last_price;

      // ── 1. Capital-Constrained Price Filter ────────────────────────────────
      // Allows active institutional stocks (MEESHO ₹236, SWIGGY ₹279, ENGINEERSIN ₹295, etc.) down to ₹50
      const effectiveMinPrice = Math.max(50, minStockPrice ?? 50);
      if (ltp < effectiveMinPrice || ltp > maxBuyingPower) continue;

      const prevClose = quote.ohlc.close;
      const todayOpen = quote.ohlc.open || ltp;
      const todayHigh = quote.ohlc.high || ltp;
      const todayLow = quote.ohlc.low || ltp;
      const liveVolume = quote.volume || 0;

      // Filter out extreme overnight gap (>8.0%) — event/earnings binary risk
      const gapPct = Math.abs((todayOpen - prevClose) / prevClose) * 100;
      if (gapPct > 8.0) continue;

      const changeFromOpenPct = ((ltp - todayOpen) / todayOpen) * 100;
      const dayChangePct = ((ltp - prevClose) / prevClose) * 100;
      const dayRangePct = todayOpen > 0 ? ((todayHigh - todayLow) / todayOpen) * 100 : 0;
      const turnoverCr = (liveVolume * ltp) / 10000000; // Rupee Turnover in Crores

      // Scaled liquidity filter: During 09:15-09:20 AM opening, accept turnover >= 0.05 Cr so fast movers are not skipped
      const minTurnoverCr = isMarketOpening ? 0.05 : 0.30;
      const minVolume = isMarketOpening ? 500 : 5000;
      if (turnoverCr < minTurnoverCr && liveVolume < minVolume) continue;

      const diffOpenLowPct = todayOpen > 0 ? Math.abs(todayOpen - todayLow) / todayOpen : 1;
      const diffOpenHighPct = todayOpen > 0 ? Math.abs(todayHigh - todayOpen) / todayOpen : 1;

      const isOpenLow = (diffOpenLowPct <= 0.0025) && (ltp > todayOpen) && (changeFromOpenPct >= 0.20);
      const isOpenHigh = (diffOpenHighPct <= 0.0025) && (ltp < todayOpen) && (changeFromOpenPct <= -0.20);

      // ── 2. Multi-Factor Directional Momentum Scoring ────────────────────────
      // Measures real trending velocity (e.g. fresh 0.5% - 2.5% move from open)
      const absChangeFromOpen = Math.abs(changeFromOpenPct);
      const absDayChange = Math.abs(dayChangePct);

      // Minimum move filter to skip flat/dormant stocks (e.g. rangebound chop)
      const moveFromLowPct = todayLow > 0 ? ((ltp - todayLow) / todayLow) * 100 : 0;
      const moveFromHighPct = todayHigh > 0 ? ((todayHigh - ltp) / todayHigh) * 100 : 0;
      if (absChangeFromOpen < 0.20 && absDayChange < 0.50 && dayRangePct < 0.6 && !isOpenLow && !isOpenHigh) continue;

      // Circuit Proximity Guard:
      // Only skip stocks approaching circuit limits (>= 18.0%) to avoid order rejection or freeze.
      // True intraday leaders (Top Gainers / Losers like GABRIEL, MEESHO, POONAWALLA, WELCORP)
      // that are up or down 3% to 14% offer the cleanest pullback continuation trends!
      if (absDayChange >= 18.0 || absChangeFromOpen >= 16.0) continue;

      // ── Relative Volume (RVOL) Institutional Participation Gauge ───────────
      const marketMinutesElapsed = Math.max(5, Math.min(375, istHhmm - (9 * 60 + 15)));
      const baselineVol = isMarketOpening ? 1000 : Math.max(5000, Math.round(50000 * (marketMinutesElapsed / 375)));
      const rvol = liveVolume > 0 ? (liveVolume / baselineVol) : 1;
      const rvolScore = Math.min(250, Math.round(rvol * 35));

      // Short momentum score (for selloffs/breakdowns / Top Losers)
      const shortDropFromOpen = Math.max(0, -changeFromOpenPct);
      const shortDropFromPrev = Math.max(0, -dayChangePct);
      const shortScore = Math.round(
        (shortDropFromPrev * 160) +          // Heavy weight on Zerodha Top Losers (% change from prev close)
        (shortDropFromOpen * 150) +          // Intraday continuous selling drive
        (moveFromHighPct * 90) +             // Rejection from highs
        (dayRangePct * 80) +                 // Intraday expansion range
        (Math.min(turnoverCr, 100) * 15) +   // Institutional liquidity
        rvolScore +                          // Relative Volume surge
        (isOpenHigh ? 200 : 0)               // Confluence boost for Open=High
      );

      // Long momentum score (for rallies/breakouts / Top Gainers)
      const longGainFromOpen = Math.max(0, changeFromOpenPct);
      const longGainFromPrev = Math.max(0, dayChangePct);
      const longScore = Math.round(
        (longGainFromPrev * 160) +           // Heavy weight on Zerodha Top Gainers (% change from prev close)
        (longGainFromOpen * 150) +           // Intraday continuous buying drive
        (moveFromLowPct * 90) +              // Bounce off lows
        (dayRangePct * 80) +                 // Intraday expansion range
        (Math.min(turnoverCr, 100) * 15) +   // Institutional liquidity
        rvolScore +                          // Relative Volume surge
        (isOpenLow ? 200 : 0)                // Confluence boost for Open=Low
      );

      const trend: 'LONG' | 'SHORT' = longScore >= shortScore ? 'LONG' : 'SHORT';
      const score = Math.max(longScore, shortScore);

      // ── 3. Strict Risk-Based & Conservative Capital Sizing ───────────────────
      const maxAllowedLoss = (stopLossRs && stopLossRs > 0) ? stopLossRs : 500;
      const estimatedRiskPerShare = Math.max(0.50, ltp * 0.01); // Baseline 1.0% structural stop distance
      const riskAllowedQty = Math.max(1, Math.floor(maxAllowedLoss / estimatedRiskPerShare));
      const capitalAllowedQty = Math.max(1, Math.floor(((availableCapital || 15000) * 0.50 * 5) / ltp));
      const maxAffordableQty = Math.max(1, Math.floor(maxBuyingPower / ltp));
      const qty = Math.max(1, Math.min(riskAllowedQty, capitalAllowedQty, maxAffordableQty));

      result.push({
        symbol: sym,
        exchange: 'NSE',
        ltp,
        qty,
        score,
        trend,
        changeFromOpenPct,
        dayChangePct,
        dayRangePct,
        turnoverCr,
        open: todayOpen,
        high: todayHigh,
        low: todayLow,
        isOpenLow,
        isOpenHigh,
      });
    }
  }

  // Sort preliminary candidates descending by momentum score
  result.sort((a, b) => b.score - a.score);

  // ── 4. Enrich Top Candidates with Previous Day High (PDH) & Low (PDL) ─────
  // High Conviction: Cleared PDH/PDL (+400 pts). Resistance Gate: Trapped under PDH (-500 pts).
  const topCandidates = result.slice(0, Math.max(limit, 12));
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const istDateStr = new Date(now.getTime() + 330 * 60000 + now.getTimezoneOffset() * 60000).toISOString().split('T')[0];

  for (const cand of topCandidates) {
    const token = tokenMap?.get(cand.symbol);
    if (!token) continue;
    try {
      const dailyCandles = await kite.getHistoricalData(token, 'day', from, now, false).catch(() => null);
      if (Array.isArray(dailyCandles) && dailyCandles.length >= 2) {
        const pastCandles = dailyCandles.filter((c: any) => {
          const cDate = new Date(c.date);
          const cStr = new Date(cDate.getTime() + 330 * 60000 + cDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];
          return cStr !== istDateStr;
        });
        if (pastCandles.length > 0) {
          const prevDay = pastCandles[pastCandles.length - 1];
          cand.pdh = Number(prevDay.high);
          cand.pdl = Number(prevDay.low);
          cand.prevClose = Number(prevDay.close);

          // ── Support / Resistance Confirmation Scoring ──
          if (cand.trend === 'LONG' && cand.pdh > 0) {
            if (cand.ltp >= cand.pdh) {
              cand.isAbovePdh = true;
              cand.score += 400; // High conviction boost: PDH flipped into strong support floor
              logger?.log(`🔥 [High Conviction] ${cand.symbol}: Price ₹${cand.ltp.toFixed(2)} cleared Previous Day High (₹${cand.pdh.toFixed(2)}). PDH is active SUPPORT! (+400 score)`);
            } else {
              cand.distToPdhPct = ((cand.pdh - cand.ltp) / cand.ltp) * 100;
              if (cand.distToPdhPct < 0.8) {
                cand.score -= 500; // Heavy penalty: trapped right under PDH resistance ceiling
                logger?.warn(`⛔ [PDH Resistance Hurdle] ${cand.symbol}: Long setup @ ₹${cand.ltp.toFixed(2)} is only ${cand.distToPdhPct.toFixed(2)}% below PDH (₹${cand.pdh.toFixed(2)}). Penalizing to avoid false breakout trap.`);
              }
            }
          } else if (cand.trend === 'SHORT' && cand.pdl > 0) {
            if (cand.ltp <= cand.pdl) {
              cand.isBelowPdl = true;
              cand.score += 400; // High conviction boost: PDL flipped into resistance ceiling
              logger?.log(`🔥 [High Conviction] ${cand.symbol}: Price ₹${cand.ltp.toFixed(2)} cleared Previous Day Low (₹${cand.pdl.toFixed(2)}). PDL is active RESISTANCE! (+400 score)`);
            } else {
              cand.distToPdlPct = ((cand.ltp - cand.pdl) / cand.ltp) * 100;
              if (cand.distToPdlPct < 0.8) {
                cand.score -= 500; // Heavy penalty: trapped right above PDL support floor
                logger?.warn(`⛔ [PDL Support Hurdle] ${cand.symbol}: Short setup @ ₹${cand.ltp.toFixed(2)} is only ${cand.distToPdlPct.toFixed(2)}% above PDL (₹${cand.pdl.toFixed(2)}). Penalizing to avoid floor bounce trap.`);
              }
            }
          }
        }
      }
    } catch {
      // Historical data unavailable; keep baseline score
    }
  }

  // Re-sort after PDH/PDL conviction adjustments
  result.sort((a, b) => b.score - a.score);
  return result.slice(0, limit);
}

export interface FnoCandidateStock {
  symbol: string;
  exchange: string;
  ltp: number;
  score: number;
  trend: 'LONG' | 'SHORT';
  changeFromOpenPct: number;
  dayChangePct: number;
  dayRangePct: number;
  turnoverCr: number;
  isOpenLow?: boolean;
  isOpenHigh?: boolean;
}

/**
 * Returns top N ranked momentum candidate stocks strictly from the F&O universe (180+ liquid stocks with active options).
 * Evaluates 5%–10% day move potential, institutional Open=High / Open=Low, volume surge, and respects direction bias.
 */
export async function getTopFnoCandidates(
  kite: any,
  directionBias: 'BOTH' | 'CALL_ONLY' | 'PUT_ONLY' = 'BOTH',
  limit: number = 10,
  logger?: Logger,
  excludedSymbols?: Set<string>,
  minStockPrice: number = 50,
): Promise<FnoCandidateStock[]> {
  const result: FnoCandidateStock[] = [];

  // 1. Resolve pure F&O universe from cache, live NFO instruments, or FO_STOCKS_LIST
  let fnoSymbols: string[] = [];
  if (cachedFnoSymbolsList.length > 0 && (Date.now() - cachedFnoSymbolsTime) < 4 * 60 * 60 * 1000) {
    fnoSymbols = cachedFnoSymbolsList;
  } else {
    try {
      const nfoInstruments = await kite.getInstruments('NFO');
      const fnoSet = new Set<string>();
      nfoInstruments.forEach((i: any) => {
        if (i.name && i.segment === 'NFO-OPT') {
          const sym = i.name.toUpperCase().trim();
          if (sym && !sym.startsWith('NIFTY') && !sym.startsWith('BANKNIFTY') && !sym.startsWith('FINNIFTY') && !sym.startsWith('MIDCPNIFTY')) {
            fnoSet.add(sym);
          }
        }
      });
      fnoSymbols = Array.from(fnoSet);
      if (fnoSymbols.length > 0) {
        cachedFnoSymbolsList = fnoSymbols;
        cachedFnoSymbolsTime = Date.now();
      }
    } catch (err: any) {
      logger?.warn(`Could not fetch live NFO instruments: ${err.message}`);
    }
  }

  if (fnoSymbols.length === 0) {
    fnoSymbols = (FO_STOCKS_LIST || [])
      .filter((s: any) => s.category !== 'Indices')
      .map((s: any) => s.symbol);
  }

  // Remove blacklisted slow-moving stocks
  const candidateSymbols = fnoSymbols.filter(s => !BLACKLISTED_SLOW_STOCKS.has(s) && (!excludedSymbols || !excludedSymbols.has(s)));

  // 2. Batch fetch live quotes
  const ltpSymbols = candidateSymbols.map(s => `NSE:${s}`);
  let liveQuotes: Record<string, any> = {};
  for (let i = 0; i < ltpSymbols.length; i += 150) {
    const batch = ltpSymbols.slice(i, i + 150);
    try {
      const quotes = await kite.getQuote(batch);
      Object.assign(liveQuotes, quotes);
    } catch (err: any) {
      logger?.warn(`Batch quote fetch failed for F&O universe: ${err.message}`);
    }
  }

  const istDate = new Date(new Date().getTime() + 330 * 60000 + new Date().getTimezoneOffset() * 60000);
  const istHhmm = istDate.getHours() * 60 + istDate.getMinutes();
  const isMarketOpening = istHhmm <= (9 * 60 + 20);
  const effectiveMinPrice = Math.max(50, minStockPrice ?? 50);

  for (const sym of candidateSymbols) {
    const key = `NSE:${sym}`;
    const quote = liveQuotes[key];
    if (quote?.last_price && quote.last_price > 0 && quote.ohlc?.close) {
      const ltp = quote.last_price;
      if (ltp < effectiveMinPrice) continue;
      const prevClose = quote.ohlc.close;
      const todayOpen = quote.ohlc.open || ltp;
      const todayHigh = quote.ohlc.high || ltp;
      const todayLow = quote.ohlc.low || ltp;
      const liveVolume = quote.volume || 0;

      // Filter extreme overnight gap (>8%) to avoid binary event/earnings gap traps
      const gapPct = Math.abs((todayOpen - prevClose) / prevClose) * 100;
      if (gapPct > 8.0) continue;

      const changeFromOpenPct = ((ltp - todayOpen) / todayOpen) * 100;
      const dayChangePct = ((ltp - prevClose) / prevClose) * 100;
      const dayRangePct = todayOpen > 0 ? ((todayHigh - todayLow) / todayOpen) * 100 : 0;
      const turnoverCr = (liveVolume * ltp) / 10000000;

      // Minimum liquidity threshold
      const minTurnoverCr = isMarketOpening ? 0.05 : 0.25;
      if (turnoverCr < minTurnoverCr && liveVolume < 1000) continue;

      // Institutional Open=Low & Open=High footprints (within 0.25% buffer)
      const diffOpenLowPct = todayOpen > 0 ? Math.abs(todayOpen - todayLow) / todayOpen : 1;
      const diffOpenHighPct = todayOpen > 0 ? Math.abs(todayHigh - todayOpen) / todayOpen : 1;
      const isOpenLow = (diffOpenLowPct <= 0.0025) && (ltp > todayOpen) && (changeFromOpenPct >= 0.20);
      const isOpenHigh = (diffOpenHighPct <= 0.0025) && (ltp < todayOpen) && (changeFromOpenPct <= -0.20);

      // Exhaustion Guard (Anti-Chasing):
      // Skip stocks that have already moved > 3.0% from open or > 4.5% on the day.
      // Buying options on an exhausted move leads to rapid theta burn & severe reversals.
      const absChangeFromOpen = Math.abs(changeFromOpenPct);
      const absDayChange = Math.abs(dayChangePct);
      if (absChangeFromOpen > 3.0 || absDayChange > 4.5) continue;

      // Multi-factor momentum scoring (targeted for 5%–10% intraday velocity)
      const shortDropFromOpen = Math.max(0, -changeFromOpenPct);
      const shortDropFromPrev = Math.max(0, -dayChangePct);
      const shortScore = Math.round(
        (shortDropFromOpen * 200) +
        (shortDropFromPrev * 150) +
        (dayRangePct * 100) +
        (Math.min(turnoverCr / 2, 50) * 20) +
        (isOpenHigh ? 250 : 0)
      );

      const longGainFromOpen = Math.max(0, changeFromOpenPct);
      const longGainFromPrev = Math.max(0, dayChangePct);
      const longScore = Math.round(
        (longGainFromOpen * 200) +
        (longGainFromPrev * 150) +
        (dayRangePct * 100) +
        (Math.min(turnoverCr / 2, 50) * 20) +
        (isOpenLow ? 250 : 0)
      );

      let trend: 'LONG' | 'SHORT' = longScore >= shortScore ? 'LONG' : 'SHORT';
      let score = Math.max(longScore, shortScore);

      // Direction Bias Filtering
      if (directionBias === 'CALL_ONLY') {
        if (changeFromOpenPct < 0 && !isOpenLow) continue;
        trend = 'LONG';
        score = longScore;
      } else if (directionBias === 'PUT_ONLY') {
        if (changeFromOpenPct > 0 && !isOpenHigh) continue;
        trend = 'SHORT';
        score = shortScore;
      }

      if (score < 40) continue;

      result.push({
        symbol: sym,
        exchange: 'NSE',
        ltp,
        score,
        trend,
        changeFromOpenPct,
        dayChangePct,
        dayRangePct,
        turnoverCr,
        isOpenLow,
        isOpenHigh,
      });
    }
  }

  // Sort descending by highest momentum score
  result.sort((a, b) => b.score - a.score);
  return result.slice(0, limit);
}



