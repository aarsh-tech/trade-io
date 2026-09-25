/** One instrument's live quote as sent to browsers. Keyed by the canonical `EXCH:SYMBOL`. */
export interface MarketTick {
  /** Canonical key, e.g. `NSE:RELIANCE`. */
  key: string;
  symbol: string;
  exchange: string;
  ltp: number;
  /** Previous session close (Kite `ohlc.close`); null when the feed did not carry one. */
  close: number | null;
  /** Absolute change vs previous close; null when there is no close (never a fake 0). */
  change: number | null;
  /** Percent change vs previous close; null when there is no close. */
  changePct: number | null;
  volume: number | null;
  /**
   * Exchange timestamp (ISO). Present for REST quotes and index packets; quote-mode websocket packets for
   * stocks/derivatives do not carry one (null) - use `ts` there. The feed-level clock is `FeedStatus.lastExchangeTs`.
   */
  exchangeTs: string | null;
  /** Server receive time (ISO). */
  ts: string;
  /** `ws` = live websocket tick; `rest` = snapshot served while the websocket feed is stale. */
  source: 'ws' | 'rest';
}

export type FeedState = 'connected' | 'stale' | 'closed';

export interface FeedStatus {
  status: FeedState;
  /** Latest exchange timestamp seen on this user's feed, if any. */
  lastExchangeTs: string | null;
  /** Last time anything (tick or heartbeat) arrived from Kite. */
  lastMessageAt: string | null;
}

export const CLOSED_FEED: FeedStatus = { status: 'closed', lastExchangeTs: null, lastMessageAt: null };

/** Order postback fields forwarded to the owning user. */
export interface OrderUpdateEvent {
  orderId: string;
  status: string;
  exchange?: string;
  tradingsymbol?: string;
  transactionType?: string;
  orderType?: string;
  product?: string;
  variety?: string;
  quantity?: number;
  filledQuantity?: number;
  pendingQuantity?: number;
  price?: number;
  triggerPrice?: number;
  averagePrice?: number;
  statusMessage?: string | null;
  tag?: string | null;
  exchangeTs?: string | null;
}
