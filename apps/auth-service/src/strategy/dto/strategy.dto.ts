import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum StrategyTypeEnum {
  BREAKOUT_15MIN = 'BREAKOUT_15MIN',
  EMA_VWAP_CROSSOVER = 'EMA_VWAP_CROSSOVER',
  STOCKS_IN_PLAY = 'STOCKS_IN_PLAY',
  EMA_RSI_OPTIONS = 'EMA_RSI_OPTIONS',
  DAILY_SCALPER = 'DAILY_SCALPER',
  CUSTOM = 'CUSTOM',
}

// ─── Breakout 15-Min Config ────────────────────────────────────────────────────
export interface Breakout15MinConfig {
  symbol: string;
  exchange: string;
  instrumentType: 'INDEX' | 'STOCK' | 'OPTION';
  qty: number;
  product: 'MIS' | 'NRML';
  stopLossRs: number;
  targetRs: number;
  exitExactAtTarget?: boolean;      // Exit immediately at exact target profit (e.g. ₹500) and stop loss (e.g. ₹500) without trailing
  maxTradesPerDay: number;
  minPremium?: number;
  maxPremium?: number;

  // Dynamic & High-Accuracy Volatility Upgrades
  enableDynamicAtr?: boolean;       // Enable live ATR(14) scaling (default: true)
  atrPeriod?: number;              // ATR calculation period (default: 14)
  atrBufferMultiplier?: number;    // Breakout buffer threshold = ATR * multiplier (default: 0.15)
  atrSlMultiplier?: number;        // Stop loss distance = ATR * multiplier (default: 1.0)
  riskRewardRatio?: number;        // Dynamic Risk:Reward target (default: 2.0)
  enableVwapFilter?: boolean;      // Confirm breakout direction with VWAP & 9/21 EMA (default: true)
  enableVolumeFilter?: boolean;    // Require volume confirmation (default: true)
  minRvol?: number;                // Relative volume threshold (default: 1.2)
  enableFakeoutReversal?: boolean; // Capitalize on failed breakouts / liquidity traps (default: true)
  enableBreakevenTrail?: boolean;  // Trail SL to cost upon reaching +0.7R profit (default: true)
  breakevenTriggerR?: number;      // R-multiple to trigger breakeven (default: 0.7)
  enableTrailingSl?: boolean;      // Dynamic candle-by-candle trailing (default: true)
  moneyness?: 'ATM' | 'ITM';       // Option strike moneyness (default: 'ITM')

  // Enterprise Dynamic Sizing, Server SL & Uncapped Trailing Upgrades
  maxCapital?: number;             // Dynamic capital allocation in INR (default: account margin or 15,000)
  lots?: number;                   // Lots for index options (default: 1)
  enableServerSl?: boolean;        // Arm server-side Stop Loss directly on Zerodha exchange (default: true)
  enableUncappedMomentum?: boolean;// Ride momentum runners past Target 1 milestone with dynamic trailing (default: true)
  enableMarketTrendFilter?: boolean;// Align stock breakouts with broader NIFTY 50 trend (default: true)
  enableDailyPnLLock?: boolean;    // Lock trading for the day upon achieving target or max loss (default: true)

  // Institutional Edge & Stop-Loss Elimination Upgrades
  useStructuralCandleSl?: boolean;  // Set SL to breakout candle extreme (45-80 pts) instead of wide 15m range (default: true)
  maxOpeningRangePts?: number;      // Skip days where 15m opening range is overstretched (>300 Bank Nifty, >120 Nifty) (default: 300)
  primeWindowEndTime?: string;      // Restrict breakout entries to morning momentum window (default: '11:30')
  enableRsiFilter?: boolean;        // Momentum trend alignment: RSI(14) > 55 for Long, < 45 for Short (default: true)

  // Dual-Edge Institutional Upgrade: Breakout Retest + Liquidity Sweep Trap Engine
  enableTrapReversal?: boolean;       // Capitalize on failed breakouts / liquidity sweep traps (Turtle Soup / 2B) (default: true)
  enableRetestConfirmation?: boolean; // Require retest bounce or follow-through before entering trend breakout (default: true)
  enableCprFilter?: boolean;          // Central Pivot Range (CPR) trend/range candidate filter (default: true)
  cprNarrowThresholdPct?: number;     // Narrow CPR threshold % for trend day eligibility (default: 0.18)
  trapSlBufferPts?: number;           // Stop loss buffer points beyond sweep extreme (default: 10)

  // Institutional Timeframe & EMA/VWAP Trailing Upgrades
  entryTimeframe?: '1min' | '3min' | '5min';   // Lower timeframe for trap/breakout entries (default: '3min')
  enableEmaVwapTrailing?: boolean;            // Ride trend dynamically along EMA & VWAP (default: true)
  trailingEmaPeriod?: number;                 // Trailing EMA period, e.g. 9 or 15 (default: 9)
  trailingVwapSource?: 'both' | 'ema' | 'vwap'; // Trailing support baseline (default: 'both')

  // Systematic Profitability & Capital Preservation Pillars
  maxLossesPerDay?: number;                   // '1 Loss & Done' shield: Halt on 1 SL hit to prevent chop drawdowns (default: 1)
  enableMiddayChopFilter?: boolean;          // Skip new entries during 11:45-13:00 European transition chop (default: true)
  middayDeadZoneStart?: string;              // Dead zone start time IST (default: '11:45')
  middayDeadZoneEnd?: string;                // Dead zone end time IST (default: '13:00')
  enablePartialBooking?: boolean;            // The Banker & The Runner: Book 50% at 1.8R, trail remainder on EMA/VWAP (default: true)
  partialBookingPct?: number;                // Percentage of position to book (default: 50)
  partialBookingR?: number;                  // R-multiple trigger for partial booking (default: 1.8)
  enableCprSupportResistance?: boolean;      // Live Zerodha CPR Support/Resistance hurdle & regime gate (default: true)
  enableParabolicVwapLock?: boolean;         // Lock profits using VWAP when trade goes parabolic (>2.5% gain or +2R) (default: true)
  enableTwoCandleEmaConfirmation?: boolean;  // Require 2nd candle confirmation before exiting on EMA to prevent shakeouts (default: true)
  enableTrendReEntry?: boolean;              // Allow 1 trend continuation re-entry if price reclaims EMA with volume (default: true)
}

export interface EmaVwapCrossoverConfig {
  symbol: string;
  exchange: string;
  emaPeriod: number;
  vwapSource?: 'close' | 'hlc3';
  entryTimeframe?: '1min' | '5min'; // Candles used to FIND entries (default '5min'). 1min is equity-only and starts at 09:16; the stop-loss and the 15-EMA trend exit always use 5m structure.
  isOptionBuyingOnly: boolean;
  qty: number;
  lots: number;
  product: 'MIS' | 'NRML';
  maxTradesPerDay: number;
  stopLossRs: number;
  targetRs: number;
  exitExactAtTarget?: boolean;      // Exit immediately at exact target profit (e.g. ₹500) and stop loss (e.g. ₹500) without trailing
  minPremium?: number;
  maxPremium?: number;
  enableProfitFloor?: boolean;
  profitFloorBufferRs?: number;
  enableOpenLowHighTrigger?: boolean; // Enable Open = Low (Buy) & Open = High (Sell) Opening Drive (default: true)
  enableMarketTrendFilter?: boolean;  // Optional: block trades against NIFTY 50 direction (default: OFF — stocks often move independently)
  enableRvolVolumeFilter?: boolean;   // Volume confirmation on every setup's signal candle (time-of-day RVOL) (default: true)
  enableDynamicVolume?: boolean;      // Judge volume against each stock's OWN same-time history (10 sessions) instead of one flat multiple (default: true)
  minVolumeZ?: number;                // Dynamic gate: min z-score of the signal candle's volume vs own history (default: 1.5)
  minRvolFloor?: number;              // Dynamic gate: also require at least this multiple of the stock's own average (default: 1.5)
  minRvol?: number;                   // Fallback flat multiple vs. other days' same-time-slot volume, when a stock has no 10-session history yet (default: 2.5)
  trailingRvolFloor?: number;         // Last-resort flat multiple vs. today's own preceding candles, used only when no cross-day baseline exists at all (default: 1.3, kept low because the baseline is already inflated by the same trend it's checking)
  targetMode?: 'FULL' | 'PARTIAL' | 'QUICK' | 'EMA'; // Exit target (default FULL): FULL = one volatility target, no trailing | PARTIAL = book part at the volatility target, rest rides the 15-EMA candle-close exit | QUICK = book part at a small ~0.5R target, rest rides | EMA = no target, the whole position rides the 15-EMA candle-close exit. Ignored when exitExactAtTarget (₹ target) is on.
  targetAtrMultiple?: number;         // FULL/PARTIAL first target = this x the stock's daily ATR% (default 0.5)
  quickTargetR?: number;              // QUICK first target in R multiples of the structural stop (default 0.5)
  partialBookFraction?: number;       // PARTIAL/QUICK: fraction of the position sold at the first target (default 0.5)
  stagnationMinutes?: number;         // Close a trade still within 0.25% of entry after this many minutes (default 35, 0 = off)
  maxStopPct?: number;                // Widest structural stop-loss, % of entry (default 2.2). Tighter = bigger qty for the same ₹ risk
  profitLock?: boolean;               // EMA target mode: at +1.5R move the stop to +0.5R, at +3R to +2R (default true)
  minDayMovePct?: number;             // Skip entries less than this % past the previous close in the trade's direction (default 1.5, 0 = off)
  slowTrail?: boolean;                // EMA target mode: once +1.5R, exit on a 5m close across the 40-EMA instead of the 15-EMA (default true)
  partialMoveSlToBreakeven?: boolean; // PARTIAL/QUICK: move the runner's stop to break-even after booking (default true)
  enableTickTrailExit?: boolean;      // Intra-candle EMA/VWAP trailing exits (default: OFF). OFF = exit only on a 5m candle CLOSE across the 15-EMA + structural SL
  enableDailyPnLLock?: boolean;       // One-and-Done rule: lock day on hitting profit target or max loss (default: true)
  enableParabolicVwapLock?: boolean;  // Lock profits using VWAP when trade goes parabolic (>2.5% gain or +2R) (default: true)
  enableTwoCandleEmaConfirmation?: boolean; // Require 2nd candle confirmation before exiting on EMA to prevent shakeouts (default: true)
  enableEmaCandleExit?: boolean;      // Exit immediately when a confirmed 5m candle closes against trend across 15-EMA (default: true)
  enableTrendReEntry?: boolean;       // Allow 1 trend continuation re-entry if price reclaims EMA with volume (default: true)
  minStockPrice?: number;             // Minimum stock price floor for auto scanner (default: ₹300)
  scanDepth?: number;                 // Auto mode: top-ranked stocks checked for a setup on every scan; the best-scoring setup is traded (default: 20, max 25)
  maxArmedSetups?: number;            // Auto mode: setups watched at once (tracked one included); the first to trigger is entered, ties by score (default 1 = only the tracked one, max 5)
  enableHybridTrailing?: boolean;     // Hybrid mode: In Exact Target mode, trail SL to 15-EMA & VWAP with 0.30% noise buffer once Break-Even is locked (default: true)
  entryCutoffTime?: string;           // Optional user-set entry cutoff, IST (default: none; hard stop at 15:00 because of the 15:05 square-off)
  disabledSetupTypes?: string[];      // Setup types to skip (default: ['TREND_BREAKOUT'] — negative expectancy in backtest)
}

export interface StocksInPlayConfig {
  setup?: 'ORB' | 'FADE' | 'TREND' | 'OI'; // ORB = break of the first candle (default); FADE = short the overbought rollover of a gap-up stock in play, 09:20-09:45; TREND = first 15/40 EMA crossover of the top-RVOL stock(s), with the gap; OI = short yesterday's top futures-OI short build-up in the 09:00-09:07 pre-open auction (stopPct default 1, targetR 3, 1 trade/day)
  watchCount?: number;                 // TREND: stocks watched from 09:20, highest first-candle RVOL first (default 1, max 10)
  withGapOnly?: boolean;               // TREND: never short a gap-up stock or buy a gap-down one (default true)
  stopPct?: number;                    // FADE: stop distance as % of the fill (default 1.2)
  targetR?: number;                    // FADE: target at this multiple of the stop (default 3; 0 = no target, exit at the stop or 15:05)
  breakevenAtR?: number;               // FADE: stop moved to the entry at this multiple of the stop in profit (default 1; 0 = off)
  breakevenLockR?: number;             // FADE: profit that first stop move locks in R (default 0.2; 0 = the entry)
  skipNearPdlR?: number;               // FADE: skip a signal when yesterday's low (short) / high (long) is less than this many R ahead (default 0 = off)
  profitLock?: boolean;                // FADE: then lock +0.5R at +1.5R and +1.5R at +2.5R (default true)
  fadeLongs?: boolean;                 // FADE: also buy gap-down stocks on an oversold turn-up + first-candle-high break (default false; maxPositions = trades a day over both sides)
  stopLossRs: number;                  // Max loss per trade (₹): qty = stopLossRs / stop distance, capped by capital
  maxPositions?: number;               // positions open together and trades per day (default 2, max 5)
  minRvol?: number;                    // first 5m candle volume vs its 10-session average (default 10)
  stopAtrFraction?: number;            // stop distance as a fraction of the 14-day ATR (default 0.2)
  minAvgValueCr?: number;              // min average daily traded value over 14 sessions, ₹ crore (default 25)
  minPrice?: number;                   // min stock price (default ₹50)
  allowShorts?: boolean;               // trade red first candles short (default true)
  allowLongs?: boolean;                // trade green first candles long (default false: no edge in the backtest)
  leverage?: number;                   // intraday leverage used for sizing (default 4, max 5)
  // Capital is not configurable: sized on the free Zerodha funds at each entry (paper: the same, else ₹15,000).
  entryCutoffTime?: string;            // no new entries from this IST time (default '15:00'; square-off is 15:05)
}


export class CreateStrategyDto {
  @ApiProperty({ example: 'Nifty 15-Min Breakout' })
  @IsString()
  name: string;

  @ApiProperty({ enum: StrategyTypeEnum })
  @IsEnum(StrategyTypeEnum)
  type: StrategyTypeEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brokerAccountId?: string;

  @ApiProperty({ description: 'JSON-serialised strategy config' })
  @IsString()
  config: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isPaperTrade?: boolean;
}

export class UpdateStrategyDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ enum: StrategyTypeEnum })
  @IsEnum(StrategyTypeEnum)
  @IsOptional()
  type?: StrategyTypeEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  config?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brokerAccountId?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isPaperTrade?: boolean;
}
