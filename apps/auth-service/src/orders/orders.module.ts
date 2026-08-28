import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { BrokersModule } from '../brokers/brokers.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, BrokersModule, AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
