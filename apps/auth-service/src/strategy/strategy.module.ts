import { Module } from '@nestjs/common';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { Breakout15MinEngine } from './breakout15min.engine';
import { EmaVwapCrossoverEngine } from './emavwap.engine';
import { BrokersModule } from '../brokers/brokers.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, BrokersModule],
  controllers: [StrategyController],
  providers: [StrategyService, Breakout15MinEngine, EmaVwapCrossoverEngine],
  exports: [StrategyService, Breakout15MinEngine, EmaVwapCrossoverEngine],
})
export class StrategyModule {}
