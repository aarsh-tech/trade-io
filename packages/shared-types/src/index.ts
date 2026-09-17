// ─── Enums ───────────────────────────────────────────────────────────────────

export enum BrokerType {
  ZERODHA = 'ZERODHA',
  ANGEL = 'ANGEL',
  UPSTOX = 'UPSTOX',
  FIVEPAISA = 'FIVEPAISA',
}

export enum StrategyType {
  BREAKOUT_15MIN = 'BREAKOUT_15MIN',
  EMA_VWAP_CROSSOVER = 'EMA_VWAP_CROSSOVER',
  STOCK_OPTIONS_BUYING = 'STOCK_OPTIONS_BUYING',
  DAILY_SCALPER = 'DAILY_SCALPER',
  NIFTY_OPTIONS_SCALPER = 'NIFTY_OPTIONS_SCALPER',
  GAMMA_BLAST_EXPIRY = 'GAMMA_BLAST_EXPIRY',
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
  stopLossRs: number;
  targetRs: number;
  startTime: string; // "09:15"
  entryTimeframe?: '1min' | '3min' | '5min';
  enableEmaVwapTrailing?: boolean;
  trailingEmaPeriod?: number;
  trailingVwapSource?: 'both' | 'ema' | 'vwap';
  maxLossesPerDay?: number;
  enableMiddayChopFilter?: boolean;
  middayDeadZoneStart?: string;
  middayDeadZoneEnd?: string;
  enablePartialBooking?: boolean;
  partialBookingPct?: number;
  partialBookingR?: number;
  enableCprSupportResistance?: boolean;
  enableParabolicVwapLock?: boolean;
  enableTwoCandleEmaConfirmation?: boolean;
  enableTrendReEntry?: boolean;
}

export interface EmaVwapCrossoverConfig {
  symbol: string;
  exchange: string;
  qty: number;
  emaPeriod: number;  // default 15
  vwapSource?: 'close' | 'hlc3';
  interval: '1min' | '5min' | '15min';
  stopLossRs: number;
  targetRs: number;
  isOptionBuyingOnly?: boolean;
  enableParabolicVwapLock?: boolean;
  enableTwoCandleEmaConfirmation?: boolean;
  enableTrendReEntry?: boolean;
  minStockPrice?: number;
  exitExactAtTarget?: boolean;
  enableHybridTrailing?: boolean;
}

export interface GammaBlastExpiryConfig {
  symbol: 'AUTO' | 'NIFTY' | 'SENSEX';
  exchange: 'NFO' | 'BFO' | 'NSE';
  lots: number;
  qty?: number;
  product: 'MIS' | 'NRML';
  maxTradesPerDay: number;
  maxWinsPerDay?: number;
  autoSelectStrike?: boolean;
  minPremiumNifty?: number;
  maxPremiumNifty?: number;
  minPremiumSensex?: number;
  maxPremiumSensex?: number;
  startTime: string; // default '09:20' (09:20 AM Full Day Scalper)
  endTime: string;   // default '15:25'
  tradingMode?: 'FULL_DAY_SCALPER' | 'AFTERNOON_GAMMA_ONLY'; // default: 'FULL_DAY_SCALPER'
  enableOrbMorningTrigger?: boolean; // default: true
  enableMiddayBreakout?: boolean;    // default: true
  enableOiFilter?: boolean;
  enableVolumeSurge?: boolean;
  enableRatchetTrailing?: boolean;
  enablePeakTrailing?: boolean;
  peakTrailingPct?: number;
  enableEmaExit?: boolean;
  emaPeriod?: number;
  costLockMultiple?: number;
  profitLock2xMultiple?: number;
  enableHighConvictionBoost?: boolean;
  maxConvictionLots?: number;
  enablePartialProfitBooking?: boolean;
  initialSlPct?: number;
  stopLossRs?: number;
  targetRs?: number;
  stopLossPoints?: number;
  targetPoints?: number;
  exitExactAtTarget?: boolean;
}

export interface CreateStrategyDto {
  name: string;
  type: StrategyType;
  brokerAccountId: string;
  config: Breakout15MinConfig | EmaVwapCrossoverConfig | GammaBlastExpiryConfig | Record<string, any>;
}

export interface StrategyDto {
  id: string;
  name: string;
  type: StrategyType;
  config: Breakout15MinConfig | EmaVwapCrossoverConfig | GammaBlastExpiryConfig | Record<string, any>;
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
