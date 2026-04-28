import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum StrategyTypeEnum {
  BREAKOUT_15MIN = 'BREAKOUT_15MIN',
  EMA_VWAP_CROSSOVER = 'EMA_VWAP_CROSSOVER',
  EMA_RSI_OPTIONS = 'EMA_RSI_OPTIONS',
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
