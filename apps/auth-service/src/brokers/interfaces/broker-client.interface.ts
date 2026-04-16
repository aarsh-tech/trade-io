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

export interface IBrokerClient {
  getHoldings(): Promise<Holding[]>;
  getPositions(): Promise<Position[]>;
  // Future: placeOrder, cancelOrder, etc.
}
