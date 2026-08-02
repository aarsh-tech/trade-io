import { Logger } from '@nestjs/common';
import { detectIntradayMomentum, detectIntradayMomentumShort, DailyCandle } from '../swing-scanner/vcp.analyzer';

// ─── Nifty 500 + Liquid NSE Stocks Universe (200+ Top Stocks) ────────────────
const TOP_LIQUID_STOCKS = [
  // Nifty 50 Heavyweights
  'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'AXISBANK', 'KOTAKBANK', 'SBIN', 'BAJFINANCE', 'HINDUNILVR',
  'TATAMOTORS', 'MARUTI', 'WIPRO', 'SUNPHARMA', 'TITAN', 'BHARTIARTL', 'ADANIENT', 'NTPC', 'POWERGRID', 'LT',
  'HCLTECH', 'TECHM', 'ULTRACEMCO', 'ONGC', 'COALINDIA', 'BPCL', 'GRASIM', 'NESTLEIND', 'DIVISLAB', 'ADANIPORTS',
  'JSWSTEEL', 'TATASTEEL', 'HINDALCO', 'M&M', 'HEROMOTOCO', 'INDUSINDBK', 'LTIM', 'TATACONSUM', 'APOLLOHOSP', 'DLF',
  'SHRIRAMFIN', 'TRENT', 'BEL', 'HAL', 'EICHERMOT', 'DRREDDY', 'CIPLA', 'BAJAJFINSV', 'ASIANPAINT', 'JIOFIN',

  // Nifty Next 50 & High Beta Leaders
  'ZOMATO', 'JINDALSTEL', 'HDFCAMC', 'IOC', 'GAIL', 'VEDL', 'SIEMENS', 'ABB', 'HAVELLS', 'POLYCAB',
  'SRF', 'PIDILITIND', 'PFC', 'RECLTD', 'RVNL', 'IRFC', 'BHEL', 'HAL', 'MAZDOCK', 'COCHINSHIP',
  'BEML', 'HUDCO', 'IREDA', 'OIL', 'NMDCLTD', 'NATIONALUM', 'SAIL', 'HINDPETRO', 'GMRINFRA', 'IDEA',

  // Banking & Financials
  'BANKBARODA', 'CANBK', 'PNB', 'AUBANK', 'FEDERALBNK', 'IDFCFIRSTB', 'BANDHANBNK', 'RBLBANK', 'UNIONBANK', 'IOB',
  'CHOLAFIN', 'MUTHOOTFIN', 'MANAPPURAM', 'M&MFIN', 'LICHSGFIN', 'CANFINHOME', 'SBICARD', 'ICICIGI', 'ICICIPRULI', 'HDFCLIFE',

  // Auto & Consumer Goods
  'BAJAJ-AUTO', 'TATAELXSI', 'ASHOKLEY', 'APOLLOTYRE', 'BALKRISIND', 'BHARATFORG', 'BOSCHLTD', 'EICHERMOT', 'MOTHERSON', 'MRF',
  'DABUR', 'COLPAL', 'GODREJCP', 'MARICO', 'BRITANNIA', 'BERGEPAINT', 'BATAINDIA', 'CROMPTON', 'VOLTAS', 'HAVELLS',

  // IT, Tech & Telecom
  'COFORGE', 'PERSISTENT', 'MPHASIS', 'LTIM', 'LTS', 'BSOFT', 'OFSS', 'TATACOMM', 'INDUSTOWER', 'NAUKRI',
  'CYIENT', 'KPITTECH', 'HCLTECH', 'WIPRO', 'TECHM', 'INFY', 'TCS', 'LTIM',

  // Pharma & Healthcare
  'LUPIN', 'AUROPHARMA', 'BIOCON', 'ALKEM', 'ABBOTINDIA', 'TORNTPHARMA', 'GLENMARK', 'IPCALAB', 'SYNGENE', 'METROPOLIS',
  'LALPATHLAB', 'GRANULES', 'APOLLOHOSP', 'DIVISLAB', 'CIPLA', 'SUNPHARMA',

  // Energy, Infra, Metals & Real Estate
  'TATAPOWER', 'ADANIPOWER', 'ADANIGREEN', 'JISLJALEQS', 'SUZLON', 'DLF', 'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'LODHA',
  'SOBHA', 'AMBUJACEM', 'ACC', 'ASTRAL', 'ATUL', 'DEEPAKNTR', 'SRF', 'UPL', 'CHAMBLFERT', 'COROMANDEL',

  // New Age & High Momentum Midcaps
  'DMART', 'KALYANKJIL', 'POLICYBAZR', 'PAYTM', 'DIXON', 'KAYNES', 'IRCTC', 'MCX', 'IEX', 'PAGEIND'
];

/**
 * Automatically picks the best NSE equity stock for intraday trading
 * based on current momentum and potential for a 3-10% move.
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
    } catch {}
  }
  if (!availableCapital || availableCapital <= 0) {
    availableCapital = 25000; // Fallback capital default if unreadable
  }

  logger?.log(`🎯 Auto-selecting best stock from ${TOP_LIQUID_STOCKS.length} candidates (Available Capital: ₹${availableCapital.toLocaleString('en-IN')})...`);

  // 1. Fetch NSE instruments to get tokens
  const instruments = await kite.getInstruments('NSE');
  const tokenMap = new Map<string, number>();
  instruments.forEach((i: any) => {
    if (i.instrument_type === 'EQ') tokenMap.set(i.tradingsymbol, i.instrument_token);
  });

  // ── Get Live Quotes (LTP, OHLC, Volume) ────────────────────────────────────────────────
  const ltpSymbols = TOP_LIQUID_STOCKS.map(s => `NSE:${s}`);
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

  // Use a 10-stock batch for ultra-fast scanning across 200+ stocks
  for (let i = 0; i < TOP_LIQUID_STOCKS.length; i += 10) {
    const batch = TOP_LIQUID_STOCKS.slice(i, i + 10);
    await Promise.allSettled(batch.map(async (symbol) => {
      try {
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

        // Helper to calculate exact capital-constrained quantity with 5x MIS leverage
        const calcCapitalQty = (price: number, riskPerShare: number) => {
          const riskQty = riskPerShare > 0 ? Math.ceil(stopLossRs / riskPerShare) : 1;
          const maxBuyingPower = (availableCapital || 25000) * 5; // Zerodha 5x MIS leverage
          const maxCapitalQty = Math.floor(maxBuyingPower / price);
          return Math.max(1, Math.min(riskQty, maxCapitalQty));
        };

        // Use both long and short detectors
        const resultLong = detectIntradayMomentum(candles);
        if (resultLong) {
          const ltp = resultLong.currentPrice;
          const riskPerShare = Math.abs(resultLong.entryPrice - resultLong.stopLoss);
          const qty = calcCapitalQty(ltp, riskPerShare);

          candidates.push({ symbol, score: resultLong.score, ltp, qty });
          logger?.log(`  📈 Momentum candidate (LONG): ${symbol} | Score:${resultLong.score} | LTP:₹${ltp.toFixed(2)} | Qty:${qty}`);
        }

        const resultShort = detectIntradayMomentumShort(candles);
        if (resultShort) {
          const ltp = resultShort.currentPrice;
          const riskPerShare = Math.abs(resultShort.entryPrice - resultShort.stopLoss);
          const qty = calcCapitalQty(ltp, riskPerShare);

          candidates.push({ symbol, score: resultShort.score, ltp, qty });
          logger?.log(`  📉 Momentum candidate (SHORT): ${symbol} | Score:${resultShort.score} | LTP:₹${ltp.toFixed(2)} | Qty:${qty}`);
        }
      } catch (e) {
        // Skip on error
      }
    }));
    // Small pause for Zerodha rate limits
    await new Promise(r => setTimeout(r, 50));
  }

  if (candidates.length > 0) {
    // Pick the one with the highest score
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    logger?.log(`✅ Auto-picked: ${best.symbol} (score:${best.score}, qty:${best.qty})`);
    logger?.log(`📋 All momentum candidates: ${candidates.map(c => `${c.symbol}(${c.score})`).join(', ')}`);
    return { symbol: best.symbol, exchange: 'NSE', ltp: best.ltp, qty: best.qty };
  }

  // ── Smarter fallback: pick highest-liquid stock that has live price data ──
  logger?.warn(`⚠ No intraday momentum candidates found from ${TOP_LIQUID_STOCKS.length} stocks. Using liquid fallback.`);

  const fallbackSymbols = ['HDFCBANK', 'ICICIBANK', 'AXISBANK', 'SBIN', 'TCS', 'INFY', 'RELIANCE'];
  for (const sym of fallbackSymbols) {
    const key = `NSE:${sym}`;
    const quote = liveQuotes[key];
    if (quote?.last_price && quote.last_price > 0) {
      const ltp = quote.last_price;
      const maxBuyingPower = (availableCapital || 25000) * 5;
      const qty = Math.max(1, Math.min(Math.ceil(stopLossRs / (ltp * 0.01)), Math.floor(maxBuyingPower / ltp)));
      logger?.warn(`↩ Fallback to ${sym} @ ₹${ltp.toFixed(2)} (Qty: ${qty})`);
      return { symbol: sym, exchange: 'NSE', ltp, qty };
    }
  }

  // Absolute last resort
  const relQuotes = await kite.getLTP([`NSE:RELIANCE`]);
  const ltp = relQuotes['NSE:RELIANCE']?.last_price || 2500;
  const qty = Math.ceil(stopLossRs / (ltp * 0.01));
  logger?.warn(`↩ Absolute fallback to RELIANCE @ ₹${ltp.toFixed(2)}`);
  return { symbol: 'RELIANCE', exchange: 'NSE', ltp, qty };
}
