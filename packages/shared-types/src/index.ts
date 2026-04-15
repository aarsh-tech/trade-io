// ─── Enums ───────────────────────────────────────────────────────────────────

export enum BrokerType {
  ZERODHA = 'ZERODHA',
  ANGEL = 'ANGEL',
  UPSTOX = 'UPSTOX',
  FIVEPAISA = 'FIVEPAISA',
}

export enum StrategyType {
  BREAKOUT_15MIN = 'BREAKOUT_15MIN',
  EMA_CROSSOVER = 'EMA_CROSSOVER',
  CUSTOM = 'CUSTOM',
}

export enum ExecStatus {
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
  COMPLETED = 'COMPLETED',
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  SL = 'SL',
  SL_M = 'SL_M',
}

export enum ProductType {
  CNC = 'CNC',
  MIS = 'MIS',
  NRML = 'NRML',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  COMPLETE = 'COMPLETE',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum BacktestStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginDto {
  email: string;
  password: string;
  totpCode?: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  twoFaEnabled: boolean;
  createdAt: string;
}

// ─── Broker ───────────────────────────────────────────────────────────────────

export interface BrokerAccountDto {
  id: string;
  broker: BrokerType;
  isActive: boolean;
  tokenExpiry?: string;
  createdAt: string;
}

export interface ConnectBrokerDto {
  broker: BrokerType;
  apiKey: string;
  apiSecret: string;
  clientId?: string;
}

export interface Quote {
  symbol: string;
  exchange: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
}

export interface Position {
  symbol: string;
  exchange: string;
  side: OrderSide;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  pnlPercent: number;
  productType: ProductType;
}

// ─── Strategy ─────────────────────────────────────────────────────────────────

export interface Breakout15MinConfig {
  symbol: string;
  exchange: string;
  qty: number;
  stopLossPercent: number;
  targetPercent: number;
  startTime: string; // "09:15"
}

export interface EmaCrossoverConfig {
  symbol: string;
  exchange: string;
  qty: number;
  fastPeriod: number;  // default 9
  slowPeriod: number;  // default 15
  interval: '1min' | '5min' | '15min';
}

export interface CreateStrategyDto {
  name: string;
  type: StrategyType;
  brokerAccountId: string;
  config: Breakout15MinConfig | EmaCrossoverConfig;
}

export interface StrategyDto {
  id: string;
  name: string;
  type: StrategyType;
  config: Breakout15MinConfig | EmaCrossoverConfig;
  isActive: boolean;
  brokerAccountId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyExecutionDto {
  id: string;
  strategyId: string;
  status: ExecStatus;
  startedAt: string;
  stoppedAt?: string;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface PlaceOrderDto {
  symbol: string;
  exchange: string;
  side: OrderSide;
  orderType: OrderType;
  productType: ProductType;
  qty: number;
  price?: number;
  triggerPrice?: number;
}

export interface OrderDto {
  id: string;
  symbol: string;
  exchange: string;
  side: OrderSide;
  orderType: OrderType;
  productType: ProductType;
  qty: number;
  price?: number;
  status: OrderStatus;
  filledQty: number;
  avgPrice?: number;
  brokerOrderId?: string;
  createdAt: string;
}

// ─── Market Data ──────────────────────────────────────────────────────────────

export interface Candle {
  time: string;  // ISO timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickMessage {
  type: 'tick';
  symbol: string;
  exchange: string;
  ltp: number;
  bid: number;
  ask: number;
  volume: number;
  timestamp: string;
}

export interface CandleMessage {
  type: 'candle';
  symbol: string;
  exchange: string;
  interval: string;
  candle: Candle;
}

// ─── Backtesting ──────────────────────────────────────────────────────────────

export interface SubmitBacktestDto {
  strategyId: string;
  symbol: string;
  exchange: string;
  fromDate: string;
  toDate: string;
  capital: number;
}

export interface BacktestTradeResult {
  entryTime: string;
  exitTime: string;
  side: OrderSide;
  entry: number;
  exit: number;
  qty: number;
  pnl: number;
  pnlPercent: number;
}

export interface BacktestResult {
  netPnl: number;
  netPnlPercent: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: BacktestTradeResult[];
  equityCurve: { time: string; value: number }[];
}

export interface BacktestDto {
  id: string;
  strategyId: string;
  symbol: string;
  exchange: string;
  fromDate: string;
  toDate: string;
  status: BacktestStatus;
  result?: BacktestResult;
  createdAt: string;
  completedAt?: string;
}

// ─── API Response envelope ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  success: false;
  error: string;
  statusCode: number;
  details?: unknown;
}
