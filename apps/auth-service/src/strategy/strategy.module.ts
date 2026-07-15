import { Module } from '@nestjs/common';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { Breakout15MinEngine } from './breakout15min.engine';
import { EmaVwapCrossoverEngine } from './emavwap.engine';
import { EmaRsiOptionsEngine } from './ema-rsi-options.engine';
import { DailyScalperEngine } from './daily-scalper.engine';
import { StockOptionsBuyingEngine } from './stock-options-buying.engine';
import { MarketSchedulerService } from './market-scheduler.service';
import { BrokersModule } from '../brokers/brokers.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SwingScannerModule } from '../swing-scanner/swing-scanner.module';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [PrismaModule, BrokersModule, MarketModule],
  controllers: [StrategyController],
  providers: [
    StrategyService,
    Breakout15MinEngine,
    EmaVwapCrossoverEngine,
    EmaRsiOptionsEngine,
    DailyScalperEngine,
    StockOptionsBuyingEngine,
    MarketSchedulerService,
  ],
  exports: [
    StrategyService,
    Breakout15MinEngine,
    EmaVwapCrossoverEngine,
    EmaRsiOptionsEngine,
    DailyScalperEngine,
    StockOptionsBuyingEngine,
  ],
})
export class StrategyModule {}

