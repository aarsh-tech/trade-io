import { Module } from '@nestjs/common';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { Breakout15MinEngine } from './breakout15min.engine';
import { BrokersModule } from '../brokers/brokers.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, BrokersModule],
  controllers: [StrategyController],
  providers: [StrategyService, Breakout15MinEngine],
  exports: [StrategyService, Breakout15MinEngine],
})
export class StrategyModule {}
