import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BrokersModule } from '../brokers/brokers.module';
import { StrategyModule } from '../strategy/strategy.module';
import { AuthModule } from '../auth/auth.module';
import { RiskService } from './risk.service';
import { RiskController } from './risk.controller';

@Module({
  imports: [
    PrismaModule,
    BrokersModule,
    forwardRef(() => StrategyModule),
    AuthModule,
  ],
  controllers: [RiskController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
