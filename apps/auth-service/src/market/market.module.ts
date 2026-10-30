import { Module } from '@nestjs/common';
import { MarketGateway } from './market.gateway';
import { TickerService } from './ticker.service';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { OhlScannerService } from './ohl-scanner.service';
import { MoveAlertScannerService } from './move-alert-scanner.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BrokersModule } from '../brokers/brokers.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, BrokersModule, AuthModule],
  controllers: [MarketController],
  providers: [MarketGateway, TickerService, MarketService, OhlScannerService, MoveAlertScannerService],
  exports: [MarketGateway, TickerService, MarketService, OhlScannerService, MoveAlertScannerService],
})
export class MarketModule { }

