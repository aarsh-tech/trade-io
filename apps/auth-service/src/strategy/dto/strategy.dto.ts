import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum StrategyTypeEnum {
  BREAKOUT_15MIN = 'BREAKOUT_15MIN',
  EMA_VWAP_CROSSOVER = 'EMA_VWAP_CROSSOVER',
  STOCK_OPTIONS_BUYING = 'STOCK_OPTIONS_BUYING',
  NIFTY_OPTIONS_SCALPER = 'NIFTY_OPTIONS_SCALPER',
  CUSTOM = 'CUSTOM',
}

// ─── Breakout 15-Min Config ────────────────────────────────────────────────────
export interface Breakout15MinConfig {
  symbol: string;
  exchange: string;
  instrumentType: 'INDEX' | 'STOCK';
  qty: number;
  product: 'MIS' | 'NRML';
  stopLossRs: number;
  targetRs: number;
  maxTradesPerDay: number;
  minPremium?: number;
  maxPremium?: number;
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
