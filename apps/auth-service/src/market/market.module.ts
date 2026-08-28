import { Module } from '@nestjs/common';
import { MarketGateway } from './market.gateway';
import { TickerService } from './ticker.service';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { OhlScannerService } from './ohl-scanner.service';
import { WhatsAppService } from './whatsapp.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BrokersModule } from '../brokers/brokers.module';

@Module({
  imports: [PrismaModule, BrokersModule],
  controllers: [MarketController],
  providers: [MarketGateway, TickerService, MarketService, OhlScannerService, WhatsAppService],
  exports: [MarketGateway, TickerService, MarketService, OhlScannerService, WhatsAppService],
})
export class MarketModule { }
