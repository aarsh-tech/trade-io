import { IsString, IsDateString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RunBacktestDto {
  @ApiProperty()
  @IsString()
  strategyId: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  symbol?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  exchange?: string;

  @ApiProperty()
  @IsDateString()
  fromDate: string;

  @ApiProperty()
  @IsDateString()
  toDate: string;

  @ApiProperty()
  @IsNumber()
  capital: number;
}
