import { Logger } from '@nestjs/common';

/**
 * Optional preference for position lookups. Kite keeps one position row per (symbol, exchange, product), so a manual
 * CNC holding or a BSE trade in the same stock is a different row from the strategy's NSE MIS position. The row that
 * matches exchange AND product wins; only when no such row exists does any row of the symbol count (the old
 * behaviour), so a product that changed (e.g. an NRML fallback before a restart) can never read as "flat".
 */
export interface PositionMatch {
  exchange?: string;
  product?: string;
}

function rowMatches(p: any, cleanSym: string, match?: PositionMatch): boolean {
  if (normalizeSymbol(p?.tradingsymbol) !== cleanSym) return false;
  if (match?.exchange && p.exchange && String(p.exchange).toUpperCase() !== match.exchange.toUpperCase()) return false;
  if (match?.product && p.product && String(p.product).toUpperCase() !== match.product.toUpperCase()) return false;
  return true;
}

export interface BrokerPositionStatus {
  netQty: number;
  dayBuyQty: number;
  daySellQty: number;
  isOpen: boolean;
  product?: string;
  exchange?: string;
  rawPosition?: any;
}

/**
 * Normalizes trading symbols by stripping exchange prefixes (e.g. "NSE:INFY" -> "INFY")
 * and trimming whitespace and uppercase.
 */
export function normalizeSymbol(sym: string): string {
  if (!sym) return '';
  return sym
    .replace(/^NSE:/i, '')
    .replace(/^BSE:/i, '')
    .replace(/^NFO:/i, '')
    .replace(/^BFO:/i, '')
    .replace(/^MCX:/i, '')
    .trim()
    .toUpperCase();
}

/**
 * Robustly inspects both 'net' and 'day' positions from Zerodha Kite API.
 * Handles discrepancies where closed intraday positions may only exist in 'day'
 * or where 'net' quantity is 0.
 */
export async function getLiveBrokerPosition(
  kite: any,
  symbol: string,
  logger?: Logger,
  match?: PositionMatch
): Promise<BrokerPositionStatus> {
  const cleanSym = normalizeSymbol(symbol);
  if (!kite || !kite.getPositions || !cleanSym) {
    return { netQty: 0, dayBuyQty: 0, daySellQty: 0, isOpen: false };
  }

  try {
    const posData = await kite.getPositions();
    const netList: any[] = posData?.net || [];
    const dayList: any[] = posData?.day || [];

    // Find in net positions first
    const pick = (list: any[]) =>
      (match ? list.find((p: any) => rowMatches(p, cleanSym, match)) : undefined) ?? list.find((p: any) => rowMatches(p, cleanSym));
    const netPos = pick(netList);

    // Find in day positions as secondary confirmation
    const dayPos = pick(dayList);

    const targetPos = netPos || dayPos;
    if (!targetPos) {
      // Not present in either net or day positions
      return { netQty: 0, dayBuyQty: 0, daySellQty: 0, isOpen: false };
    }

    const netQty = Number(targetPos.quantity ?? 0);
    const dayBuyQty = Number(targetPos.day_buy_quantity ?? dayPos?.day_buy_quantity ?? 0);
    const daySellQty = Number(targetPos.day_sell_quantity ?? dayPos?.day_sell_quantity ?? 0);
    const isOpen = netQty !== 0;

    return {
      netQty,
      dayBuyQty,
      daySellQty,
      isOpen,
      product: targetPos.product,
      exchange: targetPos.exchange,
      rawPosition: targetPos,
    };
  } catch (err: any) {
    logger?.warn?.(`[BrokerPositionGuard] getLiveBrokerPosition failed for ${cleanSym}: ${err.message}`);
    // In case of network error/rate limit, return neutral state with isOpen: true
    // so we do not prematurely exit on transient errors
    return { netQty: 0, dayBuyQty: 0, daySellQty: 0, isOpen: true };
  }
}

/**
 * Returns true if the position has been completely closed (netQty === 0) on Zerodha.
 */
export async function isPositionClosedAtBroker(
  kite: any,
  symbol: string,
  logger?: Logger
): Promise<boolean> {
  const status = await getLiveBrokerPosition(kite, symbol, logger);
  return !status.isOpen;
}

/**
 * Capital Wipeout Guard:
 * Verifies whether placing an exit order is safe, or if it will accidentally create
 * an unwanted opposite/naked position.
 *
 * For a LONG trade: Exit side is SELL. Only safe if brokerQty > 0.
 * For a SHORT trade: Exit side is BUY. Only safe if brokerQty < 0.
 */
export async function isSafeToExit(
  kite: any,
  symbol: string,
  intendedExitSide: 'BUY' | 'SELL',
  logger?: Logger,
  match?: PositionMatch
): Promise<{ safe: boolean; brokerQty: number; reason?: string }> {
  if (!kite || !kite.getPositions) {
    // If no broker client (e.g. paper trading), allow exit
    return { safe: true, brokerQty: 0 };
  }

  const status = await getLiveBrokerPosition(kite, symbol, logger, match);
  const qty = status.netQty;

  if (intendedExitSide === 'SELL') {
    // Exiting a LONG: requires positive net quantity on broker
    if (qty <= 0) {
      const msg = `🛑 [CAPITAL WIPEOUT SHIELD] Aborted SELL exit order for ${symbol}! Broker Net Qty is ${qty} (already flat or short). Placing a SELL order would create a dangerous naked short!`;
      logger?.warn?.(msg);
      return { safe: false, brokerQty: qty, reason: msg };
    }
  } else if (intendedExitSide === 'BUY') {
    // Exiting a SHORT: requires negative net quantity on broker
    if (qty >= 0) {
      const msg = `🛑 [CAPITAL WIPEOUT SHIELD] Aborted BUY exit order for ${symbol}! Broker Net Qty is ${qty} (already flat or long). Placing a BUY order would create a dangerous unintended long!`;
      logger?.warn?.(msg);
      return { safe: false, brokerQty: qty, reason: msg };
    }
  }

  return { safe: true, brokerQty: qty };
}

/**
 * Safely cancels pending broker orders (SL, Target, etc.) without crashing or throwing.
 */
export async function safeCancelPendingOrders(
  kite: any,
  client: any,
  orderIds: (string | null | undefined)[],
  logger?: Logger
): Promise<void> {
  const validIds = orderIds.filter((id): id is string => !!id && id !== 'FAILED' && !id.startsWith('PAPER_'));
  for (const orderId of validIds) {
    try {
      if (client && client.cancelOrder) {
        await client.cancelOrder(orderId).catch(() => {});
      } else if (kite && kite.cancelOrder) {
        await kite.cancelOrder('regular', orderId).catch(() => {});
      }
      logger?.log?.(`🧹 [BrokerPositionGuard] Safely cancelled pending broker order: ${orderId}`);
    } catch (err: any) {
      logger?.debug?.(`Notice while cancelling order ${orderId}: ${err.message}`);
    }
  }
}

/**
 * Reconciles the executed broker exit order (SL or Target or Market Exit) from Zerodha Kite.
 * Finds the filled exit order ID, average fill price, filled quantity, and order type.
 */
export async function getCompletedBrokerExitDetails(
  kite: any,
  symbol: string,
  slOrderId?: string | null,
  targetOrderId?: string | null,
  expectedExitSide?: 'BUY' | 'SELL',
  logger?: Logger,
  match?: PositionMatch
): Promise<{
  orderId: string;
  exitPrice: number;
  filledQty: number;
  orderType: string;
  found: boolean;
}> {
  const cleanSym = normalizeSymbol(symbol);
  if (!kite || !kite.getOrders) {
    return { orderId: slOrderId || 'BROKER_SYNC_EXIT', exitPrice: 0, filledQty: 0, orderType: 'UNKNOWN', found: false };
  }

  try {
    const orders: any[] = await kite.getOrders();
    const completeOrders = (orders || []).filter(
      (o: any) =>
        normalizeSymbol(o.tradingsymbol) === cleanSym &&
        (o.status === 'COMPLETE' || Number(o.filled_quantity) > 0)
    );

    // 1. Check known SL order ID
    if (slOrderId) {
      const slMatch = completeOrders.find((o: any) => o.order_id === slOrderId);
      if (slMatch) {
        const avg = Number(slMatch.average_price) || Number(slMatch.price) || 0;
        const filled = Number(slMatch.filled_quantity) || 0;
        return { orderId: slOrderId, exitPrice: avg, filledQty: filled, orderType: slMatch.order_type || 'SL', found: true };
      }
    }

    // 2. Check known Target order ID
    if (targetOrderId) {
      const tgtMatch = completeOrders.find((o: any) => o.order_id === targetOrderId);
      if (tgtMatch) {
        const avg = Number(tgtMatch.average_price) || Number(tgtMatch.price) || 0;
        const filled = Number(tgtMatch.filled_quantity) || 0;
        return { orderId: targetOrderId, exitPrice: avg, filledQty: filled, orderType: tgtMatch.order_type || 'LIMIT', found: true };
      }
    }

    // 3. Fallback: match by expected exit side among recent complete orders (same exchange/product when given,
    //    so a manual trade in the same stock is not taken for the strategy's exit)
    if (expectedExitSide) {
      const onSide = completeOrders.filter((o: any) => (o.transaction_type || '').toUpperCase() === expectedExitSide.toUpperCase());
      const exact = match ? onSide.filter((o: any) => rowMatches(o, cleanSym, match)) : [];
      const sideMatches = (exact.length > 0 ? exact : onSide)
        .sort((a, b) => new Date(b.order_timestamp || 0).getTime() - new Date(a.order_timestamp || 0).getTime());

      if (sideMatches.length > 0) {
        const latest = sideMatches[0];
        const avg = Number(latest.average_price) || Number(latest.price) || 0;
        const filled = Number(latest.filled_quantity) || 0;
        return {
          orderId: latest.order_id || 'BROKER_SYNC_EXIT',
          exitPrice: avg,
          filledQty: filled,
          orderType: latest.order_type || 'MARKET',
          found: true,
        };
      }
    }
  } catch (err: any) {
    logger?.debug?.(`[BrokerPositionGuard] getCompletedBrokerExitDetails notice for ${cleanSym}: ${err.message}`);
  }

  return {
    orderId: slOrderId || 'BROKER_SYNC_EXIT',
    exitPrice: 0,
    filledQty: 0,
    orderType: 'SL',
    found: false,
  };
}

