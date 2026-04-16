import { Module } from '@nestjs/common';
import { BrokersService } from './brokers.service';
import { BrokersController } from './brokers.controller';
import { BrokerClientFactory } from './broker-client.factory';

@Module({
  controllers: [BrokersController],
  providers: [BrokersService, BrokerClientFactory],
  exports: [BrokersService],
})
export class BrokersModule {}
