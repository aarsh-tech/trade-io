import { Logger } from '@nestjs/common';
import { NIFTY_500_UNIVERSE, FO_STOCKS_LIST } from '../market/market.constants';

// ─── Minimal Filter for Pure Penny / Illiquid / Extreme High-Price Symbols ───────────────────
const BLACKLISTED_SLOW_STOCKS = new Set([
  'IDEA', 'VODAFONE', 'JISLJALEQS', 'YESBANK', 'SUZLON'
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
      if (sym && !sym.includes(' ') && !sym.startsWith('NIFTY') && !sym.startsWith('BANKNIFTY')) {
        tokenMap.set(sym, i.instrument_token);
        if (i.tick_size && i.tick_size > 0) {
          tickSizeMap.set(sym, i.tick_size);
          globalTickSizeMap.set(sym, i.tick_size);
        }
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
  } catch (err: any) {
    logger?.warn(`Could not fetch NFO universe: ${err.message}`);
  }

  // 3. Combine NIFTY 500 Universe (RRKABEL, IFCI, INDOCO, UFLEX, etc.) + F&O Symbols
  const combinedSet = new Set<string>([...(NIFTY_500_UNIVERSE || []), ...fnoSymbols]);
  const validSymbols = Array.from(combinedSet).filter(sym => allNseSymbols.has(sym));
  const rawUniverse = validSymbols.length >= 50 ? validSymbols : Array.from(allNseSymbols);

  // Filter blacklisted slow-moving stocks
  const liquidSymbols = rawUniverse.filter(sym => !BLACKLISTED_SLOW_STOCKS.has(sym));
  logger?.log(`🎯 Active stock scanner universe ready: ${liquidSymbols.length} high-momentum NSE stocks (NIFTY 500 + F&O)`);
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

  const topCandidates = await getTopCandidateStocks(kite, targetRs, stopLossRs, logger, availableCapital, 10, excludedSymbols);
  if (topCandidates.length > 0) {
    const top = topCandidates[0];
    logger?.log(`✅ Auto-picked Top Momentum Leader: ${top.symbol} (Score: ${top.score}, LTP: ₹${top.ltp.toFixed(2)}, Trend: ${top.trend || 'ACTIVE'}, Qty: ${top.qty})`);
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
}

/**
 * Returns top N ranked momentum candidate stocks from Zerodha's 180+ liquid F&O universe
 * with multi-factor scoring (Intraday % Move, Day Range, Volume Surge, Trend Direction).
 */
export async function getTopCandidateStocks(
  kite: any,
  targetRs: number,
  stopLossRs: number,
  logger?: Logger,
  maxCapital?: number,
  limit: number = 20,
  excludedSymbols?: Set<string>,
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

  const { symbols: targetSymbols } = await getDynamicLiquidStocks(kite, logger);

  // Batch get quotes (up to 200 symbols per batch)
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
      // Allow any liquid F&O or NIFTY 500 stock affordable by user's 5x MIS leverage (min ₹15 to exclude non-tradable illiquid pennies)
      if (ltp < 15 || ltp > maxBuyingPower) continue;

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

      // Minimum move filter to skip flat/dormant stocks
      if (absChangeFromOpen < 0.20 && dayRangePct < 0.5 && !isOpenLow && !isOpenHigh) continue;

      // Exhaustion Guard (Anti-Chasing):
      // Skip stocks that have already dumped or rallied > 3.0% from open or > 4.5% on the day (like PVRINOX dumping 7% at open).
      // Stocks that have already made an extreme move have exhausted their daily ATR and are prone to violent mean-reversion spikes.
      if (absChangeFromOpen > 3.0 || absDayChange > 4.5) continue;

      // Short momentum score (for selloffs/breakdowns like HEROMOTOCO / SHRIRAMFIN)
      const shortDropFromOpen = Math.max(0, -changeFromOpenPct);
      const shortDropFromPrev = Math.max(0, -dayChangePct);
      const shortScore = Math.round(
        (shortDropFromOpen * 180) +
        (shortDropFromPrev * 120) +
        (dayRangePct * 80) +
        (Math.min(turnoverCr / 2, 40) * 15) +
        (isOpenHigh ? 180 : 0) // Confluence boost for Open=High
      );

      // Long momentum score (for rallies/breakouts)
      const longGainFromOpen = Math.max(0, changeFromOpenPct);
      const longGainFromPrev = Math.max(0, dayChangePct);
      const longScore = Math.round(
        (longGainFromOpen * 180) +
        (longGainFromPrev * 120) +
        (dayRangePct * 80) +
        (Math.min(turnoverCr / 2, 40) * 15) +
        (isOpenLow ? 180 : 0) // Confluence boost for Open=Low
      );

      const trend: 'LONG' | 'SHORT' = longScore >= shortScore ? 'LONG' : 'SHORT';
      const score = Math.max(longScore, shortScore);

      // ── 3. Strict Risk-Based & Conservative Capital Sizing ───────────────────
      // Sizing is strictly tied to the user's defined stop loss (e.g. ₹500), NOT full margin.
      // Conservative capital allocation: deploys max 25% of account capital per trade (5x MIS leverage).
      // Guarantees account preservation and avoids oversized drawdown on single stock spikes.
      const maxAllowedLoss = (stopLossRs && stopLossRs > 0) ? stopLossRs : 500;
      const estimatedRiskPerShare = Math.max(0.50, ltp * 0.01); // Baseline 1.0% structural stop distance
      const riskAllowedQty = Math.max(1, Math.floor(maxAllowedLoss / estimatedRiskPerShare));
      const capitalAllowedQty = Math.max(1, Math.floor(((availableCapital || 15000) * 0.25 * 5) / ltp));
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

  // Sort descending by highest momentum score
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

  for (const sym of candidateSymbols) {
    const key = `NSE:${sym}`;
    const quote = liveQuotes[key];
    if (quote?.last_price && quote.last_price > 0 && quote.ohlc?.close) {
      const ltp = quote.last_price;
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



