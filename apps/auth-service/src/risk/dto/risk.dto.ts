import { IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class UpdateRiskSettingsDto {
  @ApiPropertyOptional({ description: 'Maximum allowable daily loss in INR before Kill Switch triggers', example: 5000 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxDailyLoss?: number;

  @ApiPropertyOptional({ description: 'Maximum allowable single order value in INR', example: 200000 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  maxOrderValue?: number;

  @ApiPropertyOptional({ description: 'Maximum quantity allowed per single order', example: 1800 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxOrderQty?: number;
}

export class TriggerKillSwitchDto {
  @ApiPropertyOptional({ description: 'Reason for manually triggering the Kill Switch', example: 'Extreme market volatility' })
  @IsOptional()
  @IsString()
  reason?: string;
}
