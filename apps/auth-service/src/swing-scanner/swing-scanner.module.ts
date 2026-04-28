import { Module } from '@nestjs/common';
import { SwingScannerController } from './swing-scanner.controller';
import { SwingScannerService } from './swing-scanner.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BrokersModule } from '../brokers/brokers.module';

@Module({
  imports: [PrismaModule, BrokersModule],
  controllers: [SwingScannerController],
  providers: [SwingScannerService],
  exports: [SwingScannerService],
})
export class SwingScannerModule {}
