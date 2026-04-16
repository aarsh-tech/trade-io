import { Module } from '@nestjs/common';
import { BrokersService } from './brokers.service';
import { BrokersController } from './brokers.controller';

@Module({
  controllers: [BrokersController],
  providers: [BrokersService],
  exports: [BrokersService],
})
export class BrokersModule {}
