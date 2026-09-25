export interface Holding {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  pnlPct: number;
}

export interface Position {
  symbol: string;
  exchange?: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  side: 'BUY' | 'SELL';
  product: string;
}

export interface Order {
  orderId: string;
  symbol: string;
  exchange?: string;
  type: string;
  side: 'BUY' | 'SELL';
  product?: string;
  status: string;
  qty: number;
  filledQty: number;
  price: number;
  triggerPrice?: number;
  avgPrice: number;
  variety?: string;
  tag?: string;
  orderTime: string;
  statusMessage?: string;
}

/**
 * Why an order is being placed. Only ENTRY orders are subject to the kill switch,
 * per-order user limits, rate limiting and dedup; exits and protective (SL/target)
 * orders must always be able to reach the broker so positions can be closed.
 */
export type OrderIntent = 'ENTRY' | 'EXIT' | 'PROTECTIVE';

export interface OrderParams {
  symbol: string;
  exchange: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  product: 'CNC' | 'MIS' | 'NRML';
  qty: number;
  price?: number;
  triggerPrice?: number;
  variety?: string;
  validity?: string;
  disclosedQty?: number;
  marketProtection?: number;
  autoslice?: boolean;
  /** Kite tag: max 20 chars, alphanumeric. Set by OrderGateway when omitted. */
  tag?: string;
  /** Defaults to ENTRY (the strictest treatment) when omitted. */
  intent?: OrderIntent;
}

export interface IBrokerClient {
  getHoldings(): Promise<Holding[]>;
  getPositions(): Promise<Position[]>;
  getOrders(): Promise<Order[]>;
  placeOrder(params: OrderParams): Promise<string>;
  getLTP(symbols: string[]): Promise<Record<string, number>>;
  /** Quotes with previous close, volume and exchange time, keyed by `EXCH:SYMBOL`. */
  getQuotes(
    symbols: string[],
  ): Promise<Record<string, { ltp: number; close: number | null; volume: number | null; exchangeTs: string | null }>>;
  getMargins(): Promise<any>;
  getOrder(orderId: string): Promise<Order>;
  cancelOrder(orderId: string): Promise<void>;
  modifyOrder?(orderId: string, params: { price?: number; triggerPrice?: number; quantity?: number; variety?: string }): Promise<void>;
  searchInstruments(query: string): Promise<{ symbol: string; name: string; exchange: string; lotSize?: number; segment?: string }[]>;
  getLotSize?(symbol: string): Promise<number>;
  getHistoricalData(symbol: string, exchange: string, interval: string, from: Date, to: Date): Promise<any[]>;
  getInstruments(exchange: string): Promise<any[]>;
  getTickSize(symbol: string, exchange: string): Promise<number>;
  placeGtt(params: GttParams): Promise<string>;
  createTicker?(): any;
  getProfile?(): Promise<any>;
}

export interface GttParams {
  symbol: string;
  exchange: string;
  side: 'BUY' | 'SELL';
  product: 'CNC' | 'NRML';
  qty: number;
  entryPrice: number;
  slTriggerPrice: number;
  slLimitPrice: number;
  targetPrice: number;
}



