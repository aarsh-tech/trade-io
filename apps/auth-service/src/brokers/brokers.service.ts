import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectBrokerDto } from './dto/broker.dto';
import { encrypt, decrypt } from '../common/utils/crypto';
import { BrokerClientFactory } from './broker-client.factory';
import { BrokerType } from '@prisma/client';


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

  async getMargins(userId: string, accountId: string) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    const client = this.factory.createClient(acc);
    return client.getMargins();
  }

  async getLoginUrl(userId: string, accountId: string) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    const apiKey = decrypt(acc.apiKeyEnc);

    switch (acc.broker) {
      case BrokerType.ZERODHA:
        return { url: `https://kite.trade/connect/login?v=3&api_key=${apiKey}` };
      default:
        throw new BadRequestException('Login URL not available for this broker');
    }

  }

  async placeOrder(userId: string, accountId: string, orderData: any) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    const client = this.factory.createClient(acc);
    let orderId: string;
    
    try {
      orderId = await client.placeOrder(orderData);
    } catch (err: any) {
      throw new BadRequestException(err.message || 'Broker failed to place order');
    }

    // Track order in our DB
    await this.prisma.order.create({
        data: {
            userId,
            brokerAccountId: accountId,
            symbol: orderData.symbol,
            exchange: orderData.exchange,
            side: orderData.side,
            orderType: orderData.orderType,
            productType: orderData.product,
            qty: Number(orderData.qty),
            price: orderData.price ? Number(orderData.price) : null,
            triggerPrice: orderData.triggerPrice ? Number(orderData.triggerPrice) : null,
            brokerOrderId: orderId,
            status: 'OPEN',
        }
    });

    return { orderId };
  }


  async setSession(userId: string, accountId: string, requestToken: string) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    if (acc.broker !== BrokerType.ZERODHA) {
        throw new BadRequestException('Session refresh logic not implemented for this broker');
    }

    const { KiteConnect } = require('kiteconnect');
    const apiKey = decrypt(acc.apiKeyEnc);
    const apiSecret = decrypt(acc.apiSecretEnc);
    
    const kite = new KiteConnect({ api_key: apiKey });
    const session = await kite.generateSession(requestToken, apiSecret);
    
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 1);
    expiry.setHours(6, 0, 0, 0);

    await this.prisma.brokerAccount.update({
        where: { id: accountId },
        data: { accessToken: session.access_token, tokenExpiry: expiry },
    });
    return { success: true };
    
    throw new BadRequestException('Session refresh logic not implemented for this broker');


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

  async getMarketOverview(userId: string) {
    const account = await this.prisma.brokerAccount.findFirst({
      where: { userId, broker: BrokerType.ZERODHA, isActive: true },
    });

    if (!account || !account.accessToken) {
      return { 
        connected: false, 
        indices: [
          { symbol: 'NIFTY 50', price: 22419.55, change: 0.85, changeAbs: 189.4 },
          { symbol: 'NIFTY BANK', price: 48494.95, change: -0.12, changeAbs: -58.2 },
        ],
        stocks: []
      };
    }

    try {
      const client = this.factory.createClient(account);
      const symbols = [
        'NSE:NIFTY 50', 'NSE:NIFTY BANK', 'BSE:SENSEX',
        'NSE:RELIANCE', 'NSE:TCS', 'NSE:HDFCBANK', 'NSE:INFY'
      ];
      const ltp = await client.getLTP(symbols);
      
      // Mock changes for now as Kite LTP API only gives current price
      // In a real app, we would fetch quotes to get prev close
      return {
        connected: true,
        indices: [
          { symbol: 'NIFTY 50', price: ltp['NSE:NIFTY 50'] || 0, change: 0.45, changeAbs: 102.5 },
          { symbol: 'NIFTY BANK', price: ltp['NSE:NIFTY BANK'] || 0, change: -0.22, changeAbs: -108.3 },
          { symbol: 'SENSEX', price: ltp['BSE:SENSEX'] || 0, change: 0.38, changeAbs: 284.1 },
        ],
        stocks: [
          { symbol: 'RELIANCE', price: ltp['NSE:RELIANCE'] || 0, change: 1.2 },
          { symbol: 'TCS', price: ltp['NSE:TCS'] || 0, change: -0.5 },
          { symbol: 'HDFCBANK', price: ltp['NSE:HDFCBANK'] || 0, change: 0.8 },
          { symbol: 'INFY', price: ltp['NSE:INFY'] || 0, change: 1.5 },
        ]
      };
    } catch (err: any) {
      if (err?.error_type === 'TokenException') {
        console.warn('Zerodha session expired for user:', userId);
        // Automatically mark as inactive so we stop spamming the API
        await this.prisma.brokerAccount.update({
          where: { id: account.id },
          data: { isActive: false, accessToken: null }
        });
      }
      console.error('Market Overview Error:', err.message || err);
      return { connected: false, error: 'Session expired. Please login again.' };
    }
  }
}
