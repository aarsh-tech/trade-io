import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectBrokerDto } from './dto/broker.dto';
import { encrypt, decrypt } from '../common/utils/crypto';
import { BrokerClientFactory } from './broker-client.factory';

@Injectable()
export class BrokersService {
  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) {}

  async getHoldings(userId: string, accountId: string) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    const client = this.factory.createClient(acc);
    return client.getHoldings();
  }

  async getPositions(userId: string, accountId: string) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    const client = this.factory.createClient(acc);
    return client.getPositions();
  }

  async getLoginUrl(userId: string, accountId: string) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    if (acc.broker === 'ZERODHA') {
        const apiKey = decrypt(acc.apiKeyEnc);
        return { url: `https://kite.trade/connect/login?v=3&api_key=${apiKey}` };
    }
    
    throw new BadRequestException('Login URL not available for this broker');
  }

  async setSession(userId: string, accountId: string, requestToken: string) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    // Zerodha specific: exchange requestToken for accessToken
    if (acc.broker === 'ZERODHA') {
        const { KiteConnect } = require('kiteconnect');
        const apiKey = decrypt(acc.apiKeyEnc);
        const apiSecret = decrypt(acc.apiSecretEnc);
        
        const kite = new KiteConnect({ api_key: apiKey });
        const session = await kite.generateSession(requestToken, apiSecret);
        
        console.log(`Successfully generated session for ${acc.clientId}`);

        // Zerodha tokens expire at 6:00 AM next day
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 1);
        expiry.setHours(6, 0, 0, 0);

        await this.prisma.brokerAccount.update({
            where: { id: accountId },
            data: { 
              accessToken: session.access_token,
              tokenExpiry: expiry,
            },
        });
        
        return { success: true };
    }
    
    throw new BadRequestException('Session refresh not supported for this broker');
  }

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
