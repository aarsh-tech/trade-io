import { Module } from '@nestjs/common';
import { BrokersService } from './brokers.service';
import { BrokersController } from './brokers.controller';
import { BrokerClientFactory } from './broker-client.factory';
import { OrderGateway } from '../order-gateway/order-gateway.service';
import { PositionFlattener } from '../order-gateway/position-flattener.service';

// OrderGateway lives here (not in its own module) because BrokersService needs it and it
// needs BrokerClientFactory; a separate module would create a circular module import.
@Module({
  controllers: [BrokersController],
  providers: [BrokersService, BrokerClientFactory, OrderGateway, PositionFlattener],
  exports: [BrokersService, BrokerClientFactory, OrderGateway, PositionFlattener],
})
export class BrokersModule {}
