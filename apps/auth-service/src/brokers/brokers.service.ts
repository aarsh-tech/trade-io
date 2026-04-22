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

  async getLoginUrl(userId: string, accountId: string) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    const apiKey = decrypt(acc.apiKeyEnc);

    switch (acc.broker) {
      case BrokerType.ZERODHA:
        return { url: `https://kite.trade/connect/login?v=3&api_key=${apiKey}` };
      case BrokerType.UPSTOX:
        return { url: `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${apiKey}&redirect_uri=${process.env.UPSTOX_REDIRECT_URI || ''}` };
      case BrokerType.ANGEL:
        return { url: `https://smartapi.angelbroking.com/login?api_key=${apiKey}` }; // Mock/Common pattern
      case BrokerType.FIVEPAISA:
        return { url: `https://www.5paisa.com/open-demat-account` }; // 5Paisa uses a different flow usually
      case BrokerType.ALICEBLUE:
        return { url: `https://ant.aliceblueonline.com/` };
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

    // Zerodha specific: exchange requestToken for accessToken
    if (acc.broker === BrokerType.ZERODHA) {
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
    }

    if (acc.broker === BrokerType.UPSTOX) {
        const apiKey = decrypt(acc.apiKeyEnc);
        const apiSecret = decrypt(acc.apiSecretEnc);
        const axios = require('axios');
        
        try {
            const response = await axios.post('https://api.upstox.com/v2/login/authorization/token', 
              new URLSearchParams({
                code: requestToken,
                client_id: apiKey,
                client_secret: apiSecret,
                redirect_uri: process.env.UPSTOX_REDIRECT_URI || '',
                grant_type: 'authorization_code'
              }).toString()
            );

            await this.prisma.brokerAccount.update({
                where: { id: accountId },
                data: { 
                  accessToken: response.data.access_token,
                  tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
                },
            });
            return { success: true };
        } catch (err) {
            throw new BadRequestException('Failed to exchange Upstox token');
        }
    }

    if (acc.broker === BrokerType.ANGEL || acc.broker === BrokerType.FIVEPAISA || acc.broker === BrokerType.ALICEBLUE) {
        // These brokers often allow direct pasting of session token or use a different flow
        // For now, we allow setting the token directly
        await this.prisma.brokerAccount.update({
            where: { id: accountId },
            data: { 
                accessToken: requestToken,
                tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), 
            },
        });
        return { success: true };
    }
    
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
}
