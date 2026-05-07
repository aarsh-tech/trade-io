import { Logger } from '@nestjs/common';
import { analyzeStock, DailyCandle } from '../swing-scanner/vcp.analyzer';

// ─── Top liquid NSE stocks (Nifty 50 + Momentum leaders) ─────────────────────
const TOP_LIQUID_STOCKS = [
  'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS',
  'AXISBANK', 'KOTAKBANK', 'SBIN', 'BAJFINANCE', 'HINDUNILVR',
  'TATAMOTORS', 'MARUTI', 'WIPRO', 'SUNPHARMA', 'TITAN',
  'BHARTIARTL', 'ADANIENT', 'NTPC', 'POWERGRID', 'LT',
  'HCLTECH', 'TECHM', 'ULTRACEMCO', 'ONGC', 'COALINDIA',
  'BPCL', 'IOC', 'GRASIM', 'NESTLEIND', 'DIVISLAB',
  'ADANIPORTS', 'JSWSTEEL', 'TATASTEEL', 'HINDALCO', 'M&M',
  'HAL', 'BEL', 'RVNL', 'IRFC', 'BHEL', 'PFC', 'RECLTD',
  'ZOMATO', 'TRENT', 'DMART', 'KALYANKJIL', 'MAZDOCK'
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
): Promise<{ symbol: string; exchange: string; ltp: number; qty: number }> {
  logger?.log(`🎯 Auto-selecting best stock from ${TOP_LIQUID_STOCKS.length} candidates...`);

  // 1. Fetch NSE instruments to get tokens
  const instruments = await kite.getInstruments('NSE');
  const tokenMap = new Map<string, number>();
  instruments.forEach((i: any) => {
    if (i.instrument_type === 'EQ') tokenMap.set(i.tradingsymbol, i.instrument_token);
  });

  // ── Get Live Quotes (LTP) ────────────────────────────────────────────────
  const ltpSymbols = TOP_LIQUID_STOCKS.map(s => `NSE:${s}`);
  let liveQuotes: Record<string, { last_price: number }> = {};
  try {
    liveQuotes = await kite.getLTP(ltpSymbols);
  } catch (err) {
    logger?.warn(`Live quotes fetch failed in auto-picker: ${err.message}`);
  }

  const candidates: Array<{ symbol: string; score: number; ltp: number; qty: number }> = [];

  // 2. Scan each stock for momentum (using historical daily data)
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 100);

  // Use a smaller batch to avoid Zerodha timeouts/rate limits
  for (let i = 0; i < TOP_LIQUID_STOCKS.length; i += 5) {
    const batch = TOP_LIQUID_STOCKS.slice(i, i + 5);
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
        const liveLtp = liveQuotes[`NSE:${symbol}`]?.last_price;
        if (liveLtp) {
          const lastCandle = candles[candles.length - 1];
          const now = new Date();
          const isToday = lastCandle.date.toDateString() === now.toDateString();

          if (isToday) {
            lastCandle.close = liveLtp;
            lastCandle.high = Math.max(lastCandle.high, liveLtp);
            lastCandle.low = Math.min(lastCandle.low, liveLtp);
          } else if (now.getHours() >= 9) {
            candles.push({
              date: now, open: liveLtp, high: liveLtp, low: liveLtp, close: liveLtp,
              volume: lastCandle.volume,
            });
          }
        }

        const result = analyzeStock(symbol, candles);
        if (result && result.pattern === 'INTRADAY_MOMENTUM') {
          const ltp = result.currentPrice;
          const riskPerShare = result.entryPrice - result.stopLoss;
          const qty = riskPerShare > 0 ? Math.ceil(stopLossRs / riskPerShare) : 1;

          candidates.push({ symbol, score: result.score, ltp, qty });
        }
      } catch (e) {
        // Skip on error
      }
    }));
    // Small pause
    await new Promise(r => setTimeout(r, 200));
  }

  if (candidates.length > 0) {
    // Pick the one with the highest score
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    logger?.log(`✅ Picked ${best.symbol} with score ${best.score}. Qty: ${best.qty}`);
    return { symbol: best.symbol, exchange: 'NSE', ltp: best.ltp, qty: best.qty };
  }

  logger?.warn(`⚠ No momentum candidates found. Falling back to RELIANCE.`);

  // Fallback to RELIANCE with basic sizing
  const relToken = tokenMap.get('RELIANCE') || 738561;
  const relQuotes = await kite.getLTP([`NSE:RELIANCE`]);
  const ltp = relQuotes['NSE:RELIANCE']?.last_price || 2500;
  const qty = Math.ceil(stopLossRs / (ltp * 0.01)); // assume 1% SL

  return { symbol: 'RELIANCE', exchange: 'NSE', ltp, qty };
}
