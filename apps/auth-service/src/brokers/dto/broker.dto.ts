import { IsEnum, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BrokerType } from '@prisma/client';

export class ConnectBrokerDto {
  @ApiProperty({ enum: BrokerType })
  @IsEnum(BrokerType)
  broker: BrokerType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  apiSecret: string;
}
