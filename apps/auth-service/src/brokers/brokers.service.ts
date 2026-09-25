import { KiteRateLimiter } from './kite-rate-limiter';
import { Injectable, ConflictException, NotFoundException, BadRequestException, HttpException, Logger } from '@nestjs/common';
import { OrderGateway } from '../order-gateway/order-gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectBrokerDto } from './dto/broker.dto';
import { encrypt, decrypt } from '../common/utils/crypto';
import { isKiteAuthError } from '../common/utils/kite-errors';
import { BrokerClientFactory } from './broker-client.factory';
import { BrokerType } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { nextKiteTokenExpiry } from '../market/market-calendar';
import { resolveJwtSecret } from '../auth/jwt-secret';


@Injectable()
export class BrokersService {
  private readonly logger = new Logger(BrokersService.name);
  private cache = new Map<string, { data: any; expiresAt: number }>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
    private gateway: OrderGateway,
  ) { }

  private isTokenExpiredError(err: any): boolean {
    // Only Kite's TokenException / HTTP 403 means the session is dead.
    // Network errors, 429s and 5xx are transient and must not flag EXPIRED.
    return isKiteAuthError(err);
  }

  private async markTokenExpired(accountId: string) {
    try {
      await this.prisma.brokerAccount.update({
        where: { id: accountId },
        data: { tokenHealth: 'EXPIRED', lastHealthCheckAt: new Date() },
      });
      this.logger.warn(`Broker ${accountId} access token has expired or is invalid. Flagged tokenHealth=EXPIRED.`);
    } catch {
      // Ignore update error
    }
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.data as T;
    }
    return null;
  }

  private setInCache<T>(key: string, data: T, ttlMs: number): T {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  }

  clearAccountCache(accountId: string, userId?: string) {
    this.cache.delete(`holdings:${accountId}`);
    this.cache.delete(`positions:${accountId}`);
    this.cache.delete(`margins:${accountId}`);
    if (userId) {
      this.cache.delete(`overview:${userId}`);
    }
    for (const key of Array.from(this.cache.keys())) {
      if (key.includes(accountId)) {
        this.cache.delete(key);
      }
    }
  }

  async getHoldings(userId: string, accountId: string) {
    const cacheKey = `holdings:${accountId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');
    if (!acc.accessToken || acc.tokenHealth === 'EXPIRED') return [];

    const client = this.factory.createClient(acc);
    try {
      const result = await client.getHoldings();
      return this.setInCache(cacheKey, result, 10_000); // 10s cache
    } catch (err: any) {
      if (this.isTokenExpiredError(err)) {
        await this.markTokenExpired(accountId);
        return this.setInCache(cacheKey, [], 60_000);
      }
      this.logger.warn(`Failed to fetch holdings for broker ${accountId}: ${err?.message || err}`);
      return [];
    }
  }

  async getPositions(userId: string, accountId: string) {
    const cacheKey = `positions:${accountId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');
    if (!acc.accessToken || acc.tokenHealth === 'EXPIRED') return [];

    const client = this.factory.createClient(acc);
    try {
      const result = await client.getPositions();
      return this.setInCache(cacheKey, result, 3_000); // 3s cache
    } catch (err: any) {
      if (this.isTokenExpiredError(err)) {
        await this.markTokenExpired(accountId);
        return this.setInCache(cacheKey, [], 60_000);
      }
      this.logger.warn(`Failed to fetch positions for broker ${accountId}: ${err?.message || err}`);
      return [];
    }
  }

  async getMargins(userId: string, accountId: string) {
    const cacheKey = `margins:${accountId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');
    if (!acc.accessToken || acc.tokenHealth === 'EXPIRED') return null;

    const client = this.factory.createClient(acc);
    try {
      const result = await client.getMargins();
      if (result) {
        return this.setInCache(cacheKey, result, 10_000); // 10s cache
      }
      return null;
    } catch (err: any) {
      if (this.isTokenExpiredError(err)) {
        await this.markTokenExpired(accountId);
        return this.setInCache(cacheKey, null, 60_000);
      }
      this.logger.warn(`Failed to fetch margins for broker ${accountId}: ${err?.message || err}`);
      return null;
    }
  }

  async getLoginUrl(userId: string, accountId: string) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    const apiKey = decrypt(acc.apiKeyEnc);

    if (!apiKey) {
      throw new BadRequestException('API Key not found for this broker account. Please reconnect the broker.');
    }

    switch (acc.broker) {
      case BrokerType.ZERODHA:
        // Kite echoes redirect_params on the redirect back; the signed state binds the callback
        // to this user + account so a forged redirect can't attach someone else's session.
        const state = this.signLoginState(userId, accountId);
        const redirectParams = encodeURIComponent(`state=${state}`);
        return { url: `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey)}&redirect_params=${redirectParams}` };
      default:
        throw new BadRequestException('Login URL not available for this broker');
    }
  }

  private static readonly LOGIN_STATE_TTL_MS = 15 * 60_000;

  private loginStateMac(userId: string, accountId: string, issuedAt: string, nonce: string) {
    return createHmac('sha256', resolveJwtSecret(process.env.JWT_SECRET))
      .update(`kite-login|${userId}|${accountId}|${issuedAt}|${nonce}`)
      .digest('hex');
  }

  /** Stateless, expiring login state: `<issuedAtMs>.<nonce>.<hmac>` (URL-safe). */
  private signLoginState(userId: string, accountId: string): string {
    const issuedAt = String(Date.now());
    const nonce = randomBytes(8).toString('hex');
    return `${issuedAt}.${nonce}.${this.loginStateMac(userId, accountId, issuedAt, nonce)}`;
  }

  private verifyLoginState(userId: string, accountId: string, state: string): boolean {
    const [issuedAt, nonce, mac] = String(state || '').split('.');
    if (!issuedAt || !nonce || !mac || !/^\d+$/.test(issuedAt)) return false;
    const age = Date.now() - Number(issuedAt);
    if (age < 0 || age > BrokersService.LOGIN_STATE_TTL_MS) return false;
    const expected = Buffer.from(this.loginStateMac(userId, accountId, issuedAt, nonce));
    const given = Buffer.from(mac);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async placeOrder(userId: string, accountId: string, orderData: any) {
    try {
      // Manual orders are always treated as ENTRY: the client cannot pick its own intent
      // and thereby bypass the kill switch, user limits, rate limit or dedup.
      const { orderId } = await this.gateway.place(userId, accountId, { ...orderData, intent: 'ENTRY' });
      this.clearAccountCache(accountId, userId);
      return { orderId };
    } catch (err: any) {
      // Rule rejections and "account not found" already carry the right HTTP status.
      if (err instanceof HttpException) throw err;
      throw new BadRequestException(err?.message || 'Broker failed to place order');
    }
  }

  async placeGtt(userId: string, accountId: string, orderData: any) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    const client = this.factory.createClient(acc);
    let triggerId: string;

    try {
      triggerId = await client.placeGtt(orderData);
    } catch (err: any) {
      throw new BadRequestException(err.message || 'Broker failed to place GTT order');
    }

    return { triggerId };
  }

  async getTickSize(userId: string, accountId: string, symbol: string, exchange: string): Promise<number> {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    const client = this.factory.createClient(acc);
    return client.getTickSize(symbol, exchange);
  }


  async setSession(userId: string, accountId: string, requestToken: string, state?: string) {
    const acc = await this.prisma.brokerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acc || acc.userId !== userId) throw new NotFoundException('Account not found');

    if (acc.broker !== BrokerType.ZERODHA) {
      throw new BadRequestException('Session refresh logic not implemented for this broker');
    }

    // Kite echoes redirect_params on the redirect back; a supplied state must be ours and fresh.
    if (state !== undefined && state !== null && state !== '' && !this.verifyLoginState(userId, accountId, state)) {
      throw new BadRequestException('Broker login state is invalid or expired. Please start the login again.');
    }

    const { KiteConnect } = require('kiteconnect');
    const apiKey = decrypt(acc.apiKeyEnc);
    const apiSecret = decrypt(acc.apiSecretEnc);

    const kite = new KiteConnect({ api_key: apiKey });
    const session = await KiteRateLimiter.forKey(apiKey).run<any>('general', () => kite.generateSession(requestToken, apiSecret));

    const expiry = nextKiteTokenExpiry();

    const updatedAcc = await this.prisma.brokerAccount.update({
      where: { id: accountId },
      data: {
        accessToken: encrypt(session.access_token),
        tokenExpiry: expiry,
        isActive: true,
        tokenHealth: 'HEALTHY',
        lastHealthCheckAt: new Date(),
      },
    });

    // 1. Invalidate client factory instance
    this.factory.invalidateClient(accountId);

    // 2. Clear all cached portfolio data for this account
    this.clearAccountCache(accountId, userId);

    // 3. Pre-warm fresh client & eager-load live data immediately
    const client = this.factory.createClient(updatedAcc);
    let freshMargins: any = null;
    let freshHoldings: any[] = [];
    let freshPositions: any[] = [];

    try {
      [freshMargins, freshHoldings, freshPositions] = await Promise.all([
        client.getMargins().catch((err: any) => {
          console.warn('Initial margins sync warning:', err?.message || err);
          return null;
        }),
        client.getHoldings().catch((err: any) => {
          console.warn('Initial holdings sync warning:', err?.message || err);
          return [];
        }),
        client.getPositions().catch((err: any) => {
          console.warn('Initial positions sync warning:', err?.message || err);
          return [];
        }),
      ]);

      if (freshMargins) {
        this.setInCache(`margins:${accountId}`, freshMargins, 15_000);
      }
      if (freshHoldings && freshHoldings.length > 0) {
        this.setInCache(`holdings:${accountId}`, freshHoldings, 30_000);
      }
      if (freshPositions && freshPositions.length > 0) {
        this.setInCache(`positions:${accountId}`, freshPositions, 5_000);
      }
    } catch (e: any) {
      console.warn('Post-login pre-warm notice:', e?.message || e);
    }

    return {
      success: true,
      data: {
        margins: freshMargins,
        holdings: freshHoldings,
        positions: freshPositions,
      },
      message: 'Broker session established and portfolio synchronized',
    };
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
        tokenHealth: true,
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
    const cacheKey = `overview:${userId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const account = await this.prisma.brokerAccount.findFirst({
      where: { userId, broker: BrokerType.ZERODHA, isActive: true },
    });

    if (!account || !account.accessToken) {
      return { connected: false, indices: [], stocks: [] };
    }

    try {
      const client = this.factory.createClient(account);
      const indexKeys = ['NSE:NIFTY 50', 'NSE:NIFTY BANK', 'BSE:SENSEX'];
      const stockKeys = ['NSE:RELIANCE', 'NSE:TCS', 'NSE:HDFCBANK', 'NSE:INFY'];
      // OHLC carries the previous close, so change figures are real rather than invented
      const kite = (client as any)['kite'];
      const quotes = await kite.getOHLC([...indexKeys, ...stockKeys]);

      const toRow = (key: string) => {
        const q = quotes?.[key];
        if (!q) return null;
        const price = q.last_price;
        const prev = q.ohlc?.close;
        const changeAbs = prev ? price - prev : 0;
        const change = prev ? (changeAbs / prev) * 100 : 0;
        return { symbol: key.split(':')[1], price, change, changeAbs };
      };

      const overviewData = {
        connected: true,
        indices: indexKeys.map(toRow).filter(Boolean),
        stocks: stockKeys.map(toRow).filter(Boolean),
      };
      return this.setInCache(cacheKey, overviewData, 10_000); // 10s cache
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
      return { connected: false, indices: [], stocks: [], error: 'Session expired. Please login again.' };
    }
  }
}
