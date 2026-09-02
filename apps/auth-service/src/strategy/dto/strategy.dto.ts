import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum StrategyTypeEnum {
  BREAKOUT_15MIN = 'BREAKOUT_15MIN',
  EMA_VWAP_CROSSOVER = 'EMA_VWAP_CROSSOVER',
  EMA_RSI_OPTIONS = 'EMA_RSI_OPTIONS',
  DAILY_SCALPER = 'DAILY_SCALPER',
  STOCK_OPTIONS_BUYING = 'STOCK_OPTIONS_BUYING',
  NIFTY_OPTIONS_SCALPER = 'NIFTY_OPTIONS_SCALPER',
  GAMMA_BLAST_EXPIRY = 'GAMMA_BLAST_EXPIRY',
  CUSTOM = 'CUSTOM',
}

// ─── Gamma Blast Expiry Config ───────────────────────────────────────────────
export interface GammaBlastExpiryConfig {
  symbol: 'AUTO' | 'NIFTY' | 'SENSEX'; // 'AUTO' detects Tuesday NIFTY / Thursday SENSEX
  exchange: 'NFO' | 'BFO' | 'NSE';
  lots: number;                        // default 1 lot
  qty?: number;                        // Resolved dynamically (65 for Nifty, 20 for Sensex)
  product: 'MIS' | 'NRML';             // default 'NRML' / 'MIS'
  maxTradesPerDay: number;             // default 2
  maxWinsPerDay?: number;              // default 1
  minPremiumNifty: number;             // default 8.0
  maxPremiumNifty: number;             // default 15.0
  minPremiumSensex: number;            // default 12.0
  maxPremiumSensex: number;            // default 25.0
  startTime: string;                   // default '13:00' (1:00 PM)
  endTime: string;                     // default '15:05' (3:05 PM)
  enableOiFilter?: boolean;            // Confirm with live Call/Put OI unwinding & PCR (default: true)
  enableVolumeSurge?: boolean;         // Require >= 2.5x volume surge on breakout (default: true)
  enableRatchetTrailing?: boolean;     // Sub-second 1.4x Cost lock, 2x +50% lock, 3x+ Peak trail (default: true)
  enablePeakTrailing?: boolean;        // High-water mark dynamic peak trailing (default: true)
  peakTrailingPct?: number;            // Peak pullback buffer % (default: 25%)
  enableEmaExit?: boolean;             // Exit when option candle closes below EMA (default: true)
  emaPeriod?: number;                  // EMA period for trend trailing (default: 15)
  costLockMultiple?: number;           // Multiplier to move SL to Cost (default: 1.4)
  profitLock2xMultiple?: number;       // Multiplier to lock +50% profit (default: 2.0)
  enableHighConvictionBoost?: boolean;// Automatically boost to 2 lots on A+ 4/4 confluence (default: true)
  enablePartialProfitBooking?: boolean;// Book 50% lots at 2.0x milestone, trailing remainder (default: true)
  initialSlPct?: number;               // Initial SL % from entry premium (default: 50%)
  stopLossRs?: number;                 // Max daily loss in INR
  targetRs?: number;                   // Target profit in INR
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
  enableBreakevenTrail?: boolean;  // Trail SL to cost upon reaching +1R profit (default: true)
  breakevenTriggerR?: number;      // R-multiple to trigger breakeven (default: 1.0)
  enableTrailingSl?: boolean;      // Dynamic candle-by-candle trailing (default: true)
  moneyness?: 'ATM' | 'ITM';       // Option strike moneyness (default: 'ITM')
}

export interface EmaVwapCrossoverConfig {
  symbol: string;
  exchange: string;
  emaPeriod: number;
  vwapSource?: 'close' | 'hlc3';
  isOptionBuyingOnly: boolean;
  qty: number;
  lots: number;
  product: 'MIS' | 'NRML';
  maxTradesPerDay: number;
  stopLossRs: number;
  targetRs: number;
  minPremium?: number;
  maxPremium?: number;
  enableProfitFloor?: boolean;
  profitFloorBufferRs?: number;
  enableOpenLowHighTrigger?: boolean; // Enable Open = Low (Buy) & Open = High (Sell) Opening Drive (default: true)
  enableMarketTrendFilter?: boolean;  // Align trades with broader NIFTY 50 trend (default: true)
  enableRvolVolumeFilter?: boolean;   // Require institutional volume spike (RVOL >= 1.25x) (default: true)
  enableDailyPnLLock?: boolean;       // One-and-Done rule: lock day on hitting profit target or max loss (default: true)
}

export interface NiftyOptionsScalperConfig {
  symbol: string;
  exchange: string;
  emaPeriod: number;
  vwapSource?: 'close' | 'hlc3';
  isOptionBuyingOnly: true;
  qty: number;
  lots: number;
  product: 'MIS' | 'NRML';
  maxTradesPerDay: number;
  maxWinsPerDay?: number;
  stopLossPoints: number;
  targetPoints: number;
  trailCostAtPoints?: number;
  stopLossRs: number;
  targetRs: number;
  minPremium?: number;
  maxPremium?: number;
  enableOrbTrigger?: boolean;
  enablePullbackTrigger?: boolean;
  enableRsiFilter?: boolean;       // Require 5m Stochastic RSI (14, 14, 3, 3) confirmation (%K >= %D for CE, %K <= %D for PE) (default: true)
  enableRangeFilter?: boolean;     // Skip candles with small range < 8 pts to avoid choppiness (default: true)
  enableStagnancyExit?: boolean;   // Auto-exit if trade stays flat for 15+ mins without momentum (default: true)
  stagnancyMinutes?: number;       // Max minutes to hold stagnant trade (default: 15)
  moneyness?: 'ATM' | 'ITM';       // Option strike moneyness ('ITM' gives Delta >= 0.55 for fastest 10-pt target) (default: 'ITM')
}

// ─── Stock Options Buying Config ───────────────────────────────────────────────
export interface StockOptionsBuyingConfig {
  symbol: string;               // Stock symbol, e.g., 'BPCL'
  exchange: string;             // 'NSE'
  timeframe: '5min' | '15min';  // Candle timeframe
  emaPeriod: number;            // default 15
  riskRewardRatio: number;      // default 2 (1:2 RR ratio)
  maxCapital: number;           // default 25000 (INR)
  lots: number;                 // default 1
  maxTradesPerDay: number;      // default 2
  product: 'MIS' | 'NRML';      // default 'MIS'
  startAfterMin: number;        // default 25
  triggerOffset: number;        // default 0.50 (points above option mother high)
  protectionBufferPct: number;  // default 10 (%)
  
  // High Accuracy & 100% ROI Upgrades
  minRvol?: number;             // Relative Volume multiplier (default: 1.5)
  moneyness?: 'ATM' | 'ITM';    // Option Strike type (default: 'ATM')
  maxBidAskSpreadPct?: number;  // Max allowed bid-ask spread % (default: 1.5)
  minOptionVolumeLots?: number; // Minimum required option traded lots (default: 500)
  orderTimeoutSec?: number;     // Order execution timeout seconds (default: 5)
  maxStagnantTimeMin?: number;  // Max stagnant position holding time in min (default: 45)
  enableTrailingSl?: boolean;   // Trailing SL to cost after 50% target (default: true)
  target1RR?: number;           // Target 1 RR ratio (default: 1.5 / +50% gain)
  target2RR?: number;           // Target 2 RR ratio (default: 3.0 / +100% gain)
  trailingStepPct?: number;     // Trailing SL distance % behind peak once T1 hit (default: 20%)
  enableHtfFilter?: boolean;   // Enable 15-min HTF trend filter (default: true)
  htfTimeframe?: '15min' | '60min'; // HTF trend timeframe (default: '15min')
  htfEmaPeriod?: number;        // HTF EMA period (default: 50)
  spotStopLossPct?: number;     // Optional underlying spot-based stop loss %
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
