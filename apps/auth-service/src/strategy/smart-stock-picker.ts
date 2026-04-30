import { Logger } from '@nestjs/common';

// ─── Top liquid NSE stocks (Nifty 50 / Nifty 100 F&O eligible) ────────────────
// Ordered roughly by liquidity / trading activity
const TOP_LIQUID_STOCKS = [
  'RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS',
  'AXISBANK', 'KOTAKBANK', 'SBIN', 'BAJFINANCE', 'HINDUNILVR',
  'TATAMOTORS', 'MARUTI', 'WIPRO', 'SUNPHARMA', 'TITAN',
  'BHARTIARTL', 'ADANIENT', 'NTPC', 'POWERGRID', 'LT',
  'HCLTECH', 'TECHM', 'ULTRACEMCO', 'ONGC', 'COALINDIA',
  'BPCL', 'IOC', 'GRASIM', 'NESTLEIND', 'DIVISLAB',
];

/**
 * Automatically picks the best NSE equity stock for intraday trading
 * based on the strategy's target and stop-loss amounts.
 *
 * Selection criteria:
 *  - Fetch live LTP for all top liquid stocks (single batched call)
 *  - Assume expected intraday move = 1.5% of LTP (conservative estimate)
 *  - Required qty = ceil(targetRs / expectedMove)
 *  - Prefer stocks where qty is in a reasonable range (10–300 shares)
 *  - Pick the stock that requires the qty closest to an "ideal" of 50 shares
 */
export async function autoSelectStock(
  kite: any,
  targetRs: number,
  stopLossRs: number,
  logger?: Logger,
): Promise<{ symbol: string; exchange: string; ltp: number; qty: number }> {
  const symbols = TOP_LIQUID_STOCKS.map(s => `NSE:${s}`);
  let quotes: Record<string, any> = {};

  try {
    // Batch: all 30 symbols fit in one LTP call
    quotes = await kite.getLTP(symbols);
  } catch (e) {
    logger?.warn(`autoSelectStock: LTP fetch failed — ${e.message}. Falling back to RELIANCE.`);
  }

  const riskPerShare = Math.min(targetRs, stopLossRs); // use smaller for conservative qty
  let bestSymbol = 'RELIANCE';
  let bestLtp = 1400;
  let bestQty = Math.ceil(riskPerShare / (bestLtp * 0.015));
  let bestScore = Infinity;

  for (const stock of TOP_LIQUID_STOCKS) {
    const ltp = quotes[`NSE:${stock}`]?.last_price;
    if (!ltp || ltp <= 0) continue;

    // Expected intraday move: 1.5% of LTP
    const expectedMove = ltp * 0.015;
    const reqQty = Math.ceil(riskPerShare / expectedMove);

    // Accept qty between 5 and 500 (avoids penny stocks & too-heavy positions)
    if (reqQty < 5 || reqQty > 500) continue;

    // Score: prefer qty close to 50 (sweet spot for liquidity + capital)
    const score = Math.abs(reqQty - 50);
    if (score < bestScore) {
      bestScore = score;
      bestSymbol = stock;
      bestLtp = ltp;
      bestQty = reqQty;
    }
  }

  return { symbol: bestSymbol, exchange: 'NSE', ltp: bestLtp, qty: bestQty };
}
