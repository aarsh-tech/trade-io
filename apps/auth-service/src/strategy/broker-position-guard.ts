import { Logger } from '@nestjs/common';

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
  logger?: Logger
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
    const netPos = netList.find(
      (p: any) => normalizeSymbol(p.tradingsymbol) === cleanSym
    );

    // Find in day positions as secondary confirmation
    const dayPos = dayList.find(
      (p: any) => normalizeSymbol(p.tradingsymbol) === cleanSym
    );

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
  logger?: Logger
): Promise<{ safe: boolean; brokerQty: number; reason?: string }> {
  if (!kite || !kite.getPositions) {
    // If no broker client (e.g. paper trading), allow exit
    return { safe: true, brokerQty: 0 };
  }

  const status = await getLiveBrokerPosition(kite, symbol, logger);
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
