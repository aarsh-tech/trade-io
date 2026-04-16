import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectBrokerDto } from './dto/broker.dto';
import { encrypt } from '../common/utils/crypto';

@Injectable()
export class BrokersService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.brokerAccount.findMany({
      where: { userId },
      select: {
        id: true,
        broker: true,
        clientId: true,
        isActive: true,
        tokenExpiry: true,
        createdAt: true,
      },
    });
  }

  async connect(userId: string, dto: ConnectBrokerDto) {
    // Check if already exists for this user and broker
    const exists = await this.prisma.brokerAccount.findFirst({
      where: { userId, broker: dto.broker },
    });

    if (exists) {
      throw new ConflictException(`You already have a ${dto.broker} account connected.`);
    }

    const apiKeyEnc = encrypt(dto.apiKey);
    const apiSecretEnc = encrypt(dto.apiSecret);

    return this.prisma.brokerAccount.create({
      data: {
        userId,
        broker: dto.broker,
        clientId: dto.clientId,
        apiKeyEnc,
        apiSecretEnc,
      },
    });
  }

  async disconnect(userId: string, accountId: string) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });

    if (!acc || acc.userId !== userId) {
      throw new NotFoundException('Broker account not found');
    }

    await this.prisma.brokerAccount.delete({
      where: { id: accountId },
    });

    return { success: true };
  }
}
