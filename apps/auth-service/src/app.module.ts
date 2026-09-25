import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpThrottlerGuard } from './auth/guards/http-throttler.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { BrokersModule } from './brokers/brokers.module';
import { MarketModule } from './market/market.module';
import { StrategyModule } from './strategy/strategy.module';
import { SwingScannerModule } from './swing-scanner/swing-scanner.module';
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';
import { RiskModule } from './risk/risk.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 500 }]),
    PrismaModule,
    UsersModule,
    AuthModule,
    AdminModule,
    BrokersModule,
    MarketModule,
    StrategyModule,
    SwingScannerModule,
    OrdersModule,
    RiskModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: HttpThrottlerGuard }],
})
export class AppModule {}


