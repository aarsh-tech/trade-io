import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum StrategyTypeEnum {
  BREAKOUT_15MIN = 'BREAKOUT_15MIN',
  EMA_VWAP_CROSSOVER = 'EMA_VWAP_CROSSOVER',
  EMA_RSI_OPTIONS = 'EMA_RSI_OPTIONS',
  GAMMA_BLAST = 'GAMMA_BLAST',
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
  isOptionBuyingOnly: boolean;
  qty: number;
  lots: number;
  product: 'MIS' | 'NRML';
  maxTradesPerDay: number;
  stopLossRs: number;
  targetRs: number;
  minPremium?: number;
  maxPremium?: number;
}

// ─── EMA-RSI Options Config ────────────────────────────────────────────────────
export interface EmaRsiOptionsConfig {
  symbol: string;          // 'NIFTY 50' | 'BANKNIFTY' | 'SENSEX'
  exchange: string;        // 'NSE' | 'BSE'
  emaFast: number;         // 9
  emaSlow: number;         // 21
  rsiPeriod: number;       // 14
  rsiEntryMin: number;     // 45
  rsiEntryMax: number;     // 65
  optionLots: number;      // 1
  targetPct: number;       // 45
  slPct: number;           // 25
  maxTradesPerDay: number; // 2
  product: string;         // MIS
  startAfterMin: number;   // 25
}

// ─── Gamma Blast Config ────────────────────────────────────────────────────────
export interface GammaBlastConfig {
  symbol: string;              // 'NIFTY 50' | 'BANKNIFTY'
  exchange: string;            // 'NSE'
  expiryMode: 'weekly' | 'monthly-last';
  expiryDay: number;           // 0-6 (0=Sun..6=Sat). Default: 2 (Tuesday)
  lots: number;                // 1, 2, 3...
  minPremium: number;          // Default: 2
  maxPremium: number;          // Default: 10
  strikesOTM: number;          // Default: 5
  atrMultiplier: number;       // Default: 2.5
  premiumVelocityX: number;    // Default: 2.0
  vixSpikeThreshold: number;   // Default: 3.0 (%)
  vwapDivergence: number;      // Default: 0.3 (%)
  minSignalScore: number;      // Default: 70
  trailTier1: number;          // Default: 40 (%) — ₹5–15
  trailTier2: number;          // Default: 30 (%) — ₹15–50
  trailTier3: number;          // Default: 25 (%) — ₹50–100
  trailTier4: number;          // Default: 20 (%) — ₹100+
  maxTradesPerDay: number;     // Default: 3
  maxLossPerDay: number;       // Default: 2000 (₹)
  forceExitMinBefore: number;  // Default: 15
  product: string;             // 'MIS'
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
