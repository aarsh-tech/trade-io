import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { BrokersModule } from './brokers/brokers.module';
import { MarketModule } from './market/market.module';
import { StrategyModule } from './strategy/strategy.module';
import { BacktestModule } from './backtest/backtest.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    PrismaModule,
    UsersModule,
    AuthModule,
    BrokersModule,
    MarketModule,
    StrategyModule,
    BacktestModule,
  ],
})

export class AppModule {}
