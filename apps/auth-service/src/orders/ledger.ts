import { legCharges, segmentOf } from './charges';

/** One executed fill, from the broker trade book or (for history before `trades` existed) an order row. */
export interface Fill {
  accountId: string | null;
  orderId: string;
  symbol: string;
  exchange: string;
  product: string;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
  at: Date;
  /** Brokerage for one unit of this fill's order (order brokerage / order qty). */
  brokeragePerUnit: number;
  /** True when the fill belongs to an order placed by a strategy engine. */
  algo: boolean;
  strategyName?: string;
}

export interface ClosedTrade {
  id: string;
  symbol: string;
  exchange: string;
  product: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: string;
  exitTime: string;
  /** IST exit date, YYYY-MM-DD. */
  date: string;
  holdingDuration: string;
  /** Points P&L before charges. */
  grossPnl: number;
  charges: number;
  /** Net of charges; this is the headline number everywhere in the ledger. */
  realizedPnl: number;
  pnlPct: number;
  status: 'PROFIT' | 'LOSS' | 'BREAKEVEN';
  source: 'ALGO' | 'MANUAL';
  strategyName?: string;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const istDate = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const round2 = (n: number) => Number(n.toFixed(2));
export const tradeStatus = (pnl: number): ClosedTrade['status'] => (pnl > 0.5 ? 'PROFIT' : pnl < -0.5 ? 'LOSS' : 'BREAKEVEN');

function holding(from: Date, to: Date): string {
  const mins = Math.round(Math.max(0, to.getTime() - from.getTime()) / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

interface Lot {
  fill: Fill;
  remaining: number;
}

/**
 * FIFO-matches fills into closed round trips (long or short), per broker account + symbol + product.
 * MIS positions are squared off by the broker each day, so they never carry across IST days; CNC/NRML do.
 * Unmatched quantity (an open position) simply stays open and is not a closed trade.
 */
export function matchFills(fills: Fill[]): ClosedTrade[] {
  const sorted = [...fills].sort((a, b) => a.at.getTime() - b.at.getTime());
  const books = new Map<string, Lot[]>();
  const closed: ClosedTrade[] = [];

  for (const fill of sorted) {
    if (fill.qty <= 0 || !(fill.price > 0)) continue;
    const key = `${fill.accountId ?? '-'}|${fill.symbol}|${fill.product}${fill.product === 'MIS' ? `|${istDate(fill.at)}` : ''}`;
    let lots = books.get(key);
    if (!lots) books.set(key, (lots = []));

    let remaining = fill.qty;
    while (remaining > 0 && lots.length > 0 && lots[0].fill.side !== fill.side) {
      const lot = lots[0];
      const matched = Math.min(remaining, lot.remaining);
      const isLong = lot.fill.side === 'BUY';
      const buy = isLong ? lot.fill : fill;
      const sell = isLong ? fill : lot.fill;
      const date = istDate(fill.at);
      const segment = segmentOf(fill.exchange, fill.symbol, fill.product);

      const gross = (sell.price - buy.price) * matched;
      const charges =
        legCharges(segment, 'BUY', matched, buy.price, buy.brokeragePerUnit * matched, istDate(buy.at)) +
        legCharges(segment, 'SELL', matched, sell.price, sell.brokeragePerUnit * matched, date);
      const net = gross - charges;
      const entry = lot.fill;

      closed.push({
        id: `${entry.orderId}_${fill.orderId}_${closed.length}`,
        symbol: fill.symbol,
        exchange: fill.exchange,
        product: fill.product,
        side: isLong ? 'LONG' : 'SHORT',
        qty: matched,
        entryPrice: round2(entry.price),
        exitPrice: round2(fill.price),
        entryTime: entry.at.toISOString(),
        exitTime: fill.at.toISOString(),
        date,
        holdingDuration: holding(entry.at, fill.at),
        grossPnl: round2(gross),
        charges: round2(charges),
        realizedPnl: round2(net),
        pnlPct: round2(((isLong ? fill.price - entry.price : entry.price - fill.price) / entry.price) * 100),
        status: tradeStatus(net),
        source: entry.algo ? 'ALGO' : 'MANUAL',
        strategyName: entry.algo ? entry.strategyName || 'Intraday Algo' : 'Manual',
      });

      lot.remaining -= matched;
      remaining -= matched;
      if (lot.remaining <= 0) lots.shift();
    }
    if (remaining > 0) lots.push({ fill, remaining });
  }
  return closed;
}
