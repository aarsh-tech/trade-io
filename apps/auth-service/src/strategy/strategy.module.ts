import { Module } from '@nestjs/common';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { StrategyGateway } from './strategy.gateway';
import { Breakout15MinEngine } from './breakout15min.engine';
import { EmaVwapCrossoverEngine } from './emavwap.engine';
import { StockOptionsBuyingEngine } from './stock-options-buying.engine';
import { NiftyOptionsScalperEngine } from './nifty-options-scalper.engine';
import { MarketSchedulerService } from './market-scheduler.service';
import { BrokersModule } from '../brokers/brokers.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SwingScannerModule } from '../swing-scanner/swing-scanner.module';
import { MarketModule } from '../market/market.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, BrokersModule, MarketModule, AuthModule],
  controllers: [StrategyController],
  providers: [
    StrategyService,
    StrategyGateway,
    Breakout15MinEngine,
    EmaVwapCrossoverEngine,
    StockOptionsBuyingEngine,
    NiftyOptionsScalperEngine,
    MarketSchedulerService,
  ],
  exports: [
    StrategyService,
    StrategyGateway,
    Breakout15MinEngine,
    EmaVwapCrossoverEngine,
    StockOptionsBuyingEngine,
    NiftyOptionsScalperEngine,
  ],
})
export class StrategyModule {}


