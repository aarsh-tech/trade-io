import { Module } from '@nestjs/common';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { Breakout15MinEngine } from './breakout15min.engine';
import { EmaVwapCrossoverEngine } from './emavwap.engine';
import { EmaRsiOptionsEngine } from './ema-rsi-options.engine';
import { MarketSchedulerService } from './market-scheduler.service';
import { BrokersModule } from '../brokers/brokers.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SwingScannerModule } from '../swing-scanner/swing-scanner.module';

@Module({
  imports: [PrismaModule, BrokersModule, SwingScannerModule],
  controllers: [StrategyController],
  providers: [StrategyService, Breakout15MinEngine, EmaVwapCrossoverEngine, EmaRsiOptionsEngine, MarketSchedulerService],
  exports: [StrategyService, Breakout15MinEngine, EmaVwapCrossoverEngine, EmaRsiOptionsEngine],
})
export class StrategyModule {}


