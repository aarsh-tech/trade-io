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
  type: string;
  side: 'BUY' | 'SELL';
  status: string;
  qty: number;
  filledQty: number;
  price: number;
  avgPrice: number;
  orderTime: string;
  statusMessage?: string;
}

export interface OrderParams {
  symbol: string;
  exchange: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  product: 'CNC' | 'MIS' | 'NRML';
  qty: number;
  price?: number;
  triggerPrice?: number;
  variety?: 'regular' | 'amo' | 'bo' | 'co';
}

export interface IBrokerClient {
  getHoldings(): Promise<Holding[]>;
  getPositions(): Promise<Position[]>;
  getOrders(): Promise<Order[]>;
  placeOrder(params: OrderParams): Promise<string>;
  getLTP(symbols: string[]): Promise<Record<string, number>>;
  searchInstruments(query: string): Promise<{ symbol: string; name: string; exchange: string }[]>;
  getHistoricalData(symbol: string, exchange: string, interval: string, from: Date, to: Date): Promise<any[]>;
}



