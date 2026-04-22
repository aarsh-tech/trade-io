import { Module } from '@nestjs/common';
import { MarketGateway } from './market.gateway';
import { TickerService } from './ticker.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BrokersModule } from '../brokers/brokers.module';

@Module({
  imports: [PrismaModule, BrokersModule],
  providers: [MarketGateway, TickerService],
  exports: [MarketGateway, TickerService],
})
export class MarketModule { }
