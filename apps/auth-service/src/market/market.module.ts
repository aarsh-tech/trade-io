import { Module } from '@nestjs/common';
import { MarketGateway } from './market.gateway';
import { TickerService } from './ticker.service';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { OhlScannerService } from './ohl-scanner.service';
import { DailyAdvisoryService } from './daily-advisory.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BrokersModule } from '../brokers/brokers.module';

@Module({
  imports: [PrismaModule, BrokersModule],
  controllers: [MarketController],
  providers: [MarketGateway, TickerService, MarketService, OhlScannerService, DailyAdvisoryService],
  exports: [MarketGateway, TickerService, MarketService, OhlScannerService, DailyAdvisoryService],
})
export class MarketModule { }

