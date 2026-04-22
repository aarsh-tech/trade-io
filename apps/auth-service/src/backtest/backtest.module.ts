import { Module } from '@nestjs/common';
import { BacktestService } from './backtest.service';
import { BacktestController } from './backtest.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { BrokersModule } from '../brokers/brokers.module';

@Module({
  imports: [PrismaModule, BrokersModule],
  controllers: [BacktestController],
  providers: [BacktestService],
  exports: [BacktestService],
})
export class BacktestModule {}
