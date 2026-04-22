import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum StrategyTypeEnum {
  BREAKOUT_15MIN = 'BREAKOUT_15MIN',
  EMA_CROSSOVER = 'EMA_CROSSOVER',
  CUSTOM = 'CUSTOM',
}

// ─── Breakout 15-Min Config ────────────────────────────────────────────────────
export interface Breakout15MinConfig {
  symbol: string;           // e.g. NIFTY 50, BANKNIFTY, RELIANCE
  exchange: string;         // NSE | BSE | NFO
  instrumentType: 'INDEX' | 'STOCK';
  qty: number;              // Quantity / lots
  product: 'MIS' | 'NRML'; // Intraday or overnight
  stopLossRs: number;       // Fixed ₹ stop loss
  targetRs: number;         // Fixed ₹ target
  maxTradesPerDay: number;  // Safety cap
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
