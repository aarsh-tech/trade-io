import { OrderIntent } from '../brokers/interfaces/broker-client.interface';

/**
 * Exchange freeze quantities per underlying (contracts' units, i.e. shares).
 * These change with NSE/BSE circulars; keep this the single copy.
 */
export const EXCHANGE_FREEZE_LIMITS: Record<string, number> = {
  BANKNIFTY: 900,
  FINNIFTY: 1800,
  MIDCPNIFTY: 2800,
  NIFTY: 1800,
  SENSEX: 500,
  BANKEX: 600,
};

export const DEFAULT_FREEZE_LIMIT = 1800;
export const DEFAULT_MAX_ORDER_QTY = 1800;

/** Kite rejects tags that are not alphanumeric or longer than 20 characters. */
export const MAX_TAG_LENGTH = 20;

/**
 * Freeze limit for a trading symbol. Longer prefixes are checked first so that
 * BANKNIFTY / FINNIFTY / MIDCPNIFTY are not swallowed by the plain NIFTY entry.
 */
export function getFreezeLimit(symbol: string): number {
  const upper = (symbol || '').toUpperCase().trim();
  const prefixes = Object.keys(EXCHANGE_FREEZE_LIMITS).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (upper.includes(prefix)) return EXCHANGE_FREEZE_LIMITS[prefix];
  }
  return DEFAULT_FREEZE_LIMIT;
}

export function sanitizeTag(tag?: string): string | undefined {
  if (!tag) return undefined;
  const clean = tag.replace(/[^A-Za-z0-9]/g, '').slice(0, MAX_TAG_LENGTH);
  return clean || undefined;
}

const INTENT_TAG_SUFFIX: Record<OrderIntent, string> = {
  ENTRY: 'E',
  EXIT: 'X',
  PROTECTIVE: 'S',
};

/** `S<last 8 alphanumerics of strategy id><E|X|S>` — attributable in Kite's order book. */
export function buildOrderTag(strategyId: string, intent: OrderIntent): string {
  const short = strategyId.replace(/[^A-Za-z0-9]/g, '').slice(-8);
  return `S${short}${INTENT_TAG_SUFFIX[intent]}`;
}

export function mapOrderTypeToDb(orderType: string): 'MARKET' | 'LIMIT' | 'SL' | 'SL_M' {
  return orderType === 'SL-M' ? 'SL_M' : (orderType as 'MARKET' | 'LIMIT' | 'SL');
}
