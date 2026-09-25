import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderIntent, OrderParams } from '../brokers/interfaces/broker-client.interface';
import {
  DEFAULT_MAX_ORDER_QTY,
  buildOrderTag,
  getFreezeLimit,
  mapOrderTypeToDb,
  sanitizeTag,
} from './order-rules';

export interface OrderContext {
  strategyId?: string;
  executionId?: string;
  /** Price used for the fat-finger check when the order carries none (e.g. MARKET). */
  estimatedPrice?: number;
}

export interface PlacedOrder {
  orderId: string;
  tag?: string;
  qty: number;
}

const RATE_WINDOW_MS = 60_000;
const MAX_ENTRIES_PER_WINDOW = 10;
const DEDUP_WINDOW_MS = 2_000;
const CIRCUIT_BREAKER_THRESHOLD = 3;

/**
 * The single door for every order sent to a broker.
 *
 * Pipeline: kill switch → user limits → freeze clamp → rate limit / dedup
 * → broker → DB upsert → record broker success / rejection.
 *
 * Only ENTRY orders are subject to the kill switch, user limits, rate limit and
 * dedup. EXIT and PROTECTIVE orders must always be able to reach the broker so
 * a position can be closed (including by the kill switch flatten itself); they
 * still get the quantity / freeze check because the exchange would reject them anyway.
 *
 * Deliberately depends only on Prisma and the broker factory (not RiskService),
 * so engines and RiskService can both inject it without a circular dependency.
 */
@Injectable()
export class OrderGateway {
  private readonly logger = new Logger(OrderGateway.name);

  /** `${accountId}:${symbol}` -> entry timestamps within the sliding window */
  private readonly entryTimestamps = new Map<string, number[]>();
  /** dedup key -> last entry time */
  private readonly recentEntries = new Map<string, number>();
  /** userId -> consecutive broker rejections */
  private readonly consecutiveRejections = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
  ) {}

  async place(
    userId: string,
    accountId: string,
    params: OrderParams,
    ctx: OrderContext = {},
  ): Promise<PlacedOrder> {
    const intent: OrderIntent = params.intent ?? 'ENTRY';
    if (!params.intent) {
      this.logger.warn(`Order for ${params.symbol} has no intent; treating as ENTRY (strictest checks).`);
    }

    const [user, account] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, maxOrderValue: true, maxOrderQty: true, killSwitchActive: true },
      }),
      this.prisma.brokerAccount.findUnique({ where: { id: accountId } }),
    ]);
    if (!user) throw new BadRequestException('User not found for RMS evaluation');
    if (!account || account.userId !== userId) throw new NotFoundException('Account not found');

    // 1. Kill switch (entries only — exits must always be able to flatten)
    if (intent === 'ENTRY' && user.killSwitchActive) {
      throw this.reject(
        `🛑 [RMS KILL SWITCH] Trading is locked for user ${userId}. New entry orders are suspended.`,
      );
    }

    const qty = Number(params.qty) || 0;
    if (qty <= 0) throw this.reject(`🛑 [RMS SAFETY] Invalid order quantity: ${qty}`);

    // 2. User limits (entries only: an exit can never exceed what an entry was allowed to open)
    const client = this.factory.createClient(account);
    if (intent === 'ENTRY') {
      const maxQty = user.maxOrderQty || DEFAULT_MAX_ORDER_QTY;
      if (qty > maxQty) {
        throw this.reject(
          `🛑 [RMS USER LIMIT] Order quantity ${qty} exceeds your maximum of ${maxQty} per order for ${params.symbol}.`,
        );
      }
      await this.checkOrderValue(client, params, qty, user.maxOrderValue, ctx.estimatedPrice);
    }

    // 3. Exchange freeze quantity (all intents; the exchange rejects these regardless)
    const freezeLimit = getFreezeLimit(params.symbol);
    if (qty > freezeLimit) {
      throw this.reject(
        `🛑 [RMS FREEZE CLAMP] Order quantity ${qty} exceeds the exchange freeze limit of ${freezeLimit} for ${params.symbol}.`,
      );
    }

    // 4. Rate limit + dedup (entries only). The slot is reserved before the broker
    //    call so concurrent identical entries can't both slip through.
    const dedupKey =
      intent === 'ENTRY' ? this.reserveEntrySlot(accountId, params, qty) : undefined;

    const tag =
      sanitizeTag(params.tag) ??
      (ctx.strategyId ? buildOrderTag(ctx.strategyId, intent) : undefined);
    const outgoing: OrderParams = { ...params, qty, tag, intent };

    // 5. Broker
    let orderId: string;
    try {
      orderId = await client.placeOrder(outgoing);
    } catch (err: any) {
      if (dedupKey) this.recentEntries.delete(dedupKey); // allow a legitimate retry
      this.recordBrokerRejection(userId, err?.message || 'unknown error');
      throw err;
    }
    this.recordBrokerSuccess(userId);

    // 6. DB upsert. The order is live at the broker, so a DB failure must not fail the call.
    await this.persist(userId, accountId, orderId, outgoing, ctx);

    return { orderId, tag, qty };
  }

  getConsecutiveRejections(userId: string): number {
    return this.consecutiveRejections.get(userId) || 0;
  }

  resetCircuitBreaker(userId: string): void {
    this.consecutiveRejections.delete(userId);
  }

  private reject(message: string): BadRequestException {
    this.logger.warn(message);
    return new BadRequestException(message);
  }

  private async checkOrderValue(
    client: { getLTP(symbols: string[]): Promise<Record<string, number>> },
    params: OrderParams,
    qty: number,
    maxOrderValue: number | null,
    estimatedPrice?: number,
  ): Promise<void> {
    if (!maxOrderValue) return;

    let price =
      Number(params.price) || Number(params.triggerPrice) || Number(estimatedPrice) || 0;
    if (price <= 0) {
      // MARKET entry without a price: look one up rather than skip the fat-finger guard.
      const key = `${params.exchange}:${params.symbol}`;
      try {
        price = Number((await client.getLTP([key]))[key]) || 0;
      } catch {
        price = 0;
      }
      if (price <= 0) {
        throw this.reject(
          `🛑 [RMS FAT-FINGER GUARD] Could not determine a price for ${params.symbol} to check the order value limit. Entry blocked.`,
        );
      }
    }

    const value = qty * price;
    if (value > maxOrderValue) {
      throw this.reject(
        `🛑 [RMS FAT-FINGER GUARD] Order value ₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })} exceeds your maximum of ₹${maxOrderValue.toLocaleString('en-IN')}.`,
      );
    }
  }

  private reserveEntrySlot(accountId: string, params: OrderParams, qty: number): string {
    const now = Date.now();
    const symbol = params.symbol.toUpperCase().trim();

    const rateKey = `${accountId}:${symbol}`;
    const recent = (this.entryTimestamps.get(rateKey) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= MAX_ENTRIES_PER_WINDOW) {
      throw this.reject(
        `🛑 [RMS RUNAWAY BREAKER] ${recent.length} entry orders for ${symbol} in the last 60s. Order blocked to prevent a runaway loop.`,
      );
    }

    const dedupKey = `${accountId}:${symbol}:${params.side}:${qty}:${params.orderType}:${params.price || 0}`;
    if (now - (this.recentEntries.get(dedupKey) || 0) < DEDUP_WINDOW_MS) {
      throw this.reject(
        `🛑 [RMS DEDUP] Identical entry order for ${symbol} within ${DEDUP_WINDOW_MS / 1000}s. Blocked to prevent double submission.`,
      );
    }

    recent.push(now);
    this.entryTimestamps.set(rateKey, recent);
    this.recentEntries.set(dedupKey, now);
    this.pruneEntryState(now);
    return dedupKey;
  }

  /** Keeps the in-memory maps bounded over a long-running process. */
  private pruneEntryState(now: number): void {
    if (this.recentEntries.size > 1000) {
      for (const [key, ts] of this.recentEntries) {
        if (now - ts >= DEDUP_WINDOW_MS) this.recentEntries.delete(key);
      }
    }
    if (this.entryTimestamps.size > 500) {
      for (const [key, list] of this.entryTimestamps) {
        if (!list.some((t) => now - t < RATE_WINDOW_MS)) this.entryTimestamps.delete(key);
      }
    }
  }

  private async persist(
    userId: string,
    accountId: string,
    orderId: string,
    params: OrderParams,
    ctx: OrderContext,
  ): Promise<void> {
    const variety = (params.variety || 'regular').toLowerCase();
    try {
      await this.prisma.order.upsert({
        where: { brokerAccountId_brokerOrderId: { brokerAccountId: accountId, brokerOrderId: orderId } },
        create: {
          userId,
          brokerAccountId: accountId,
          brokerOrderId: orderId,
          strategyId: ctx.strategyId ?? null,
          executionId: ctx.executionId ?? null,
          symbol: params.symbol,
          exchange: params.exchange,
          side: params.side,
          orderType: mapOrderTypeToDb(params.orderType),
          productType: params.product,
          qty: Number(params.qty),
          price: params.price ? Number(params.price) : null,
          triggerPrice: params.triggerPrice ? Number(params.triggerPrice) : null,
          variety,
          tag: params.tag ?? null,
          status: 'OPEN',
        },
        // A broker sync may already have written the row with a fresher status; only add attribution.
        update: {
          variety,
          tag: params.tag ?? null,
          ...(ctx.strategyId && { strategyId: ctx.strategyId }),
          ...(ctx.executionId && { executionId: ctx.executionId }),
        },
      });
    } catch (err: any) {
      this.logger.error(`Order ${orderId} was placed but could not be saved to the DB: ${err?.message}`);
    }
  }

  private recordBrokerRejection(userId: string, reason: string): void {
    const count = (this.consecutiveRejections.get(userId) || 0) + 1;
    this.consecutiveRejections.set(userId, count);
    this.logger.warn(`⚠️ [RMS] User ${userId} consecutive broker rejection #${count}: ${reason}`);
    if (count >= CIRCUIT_BREAKER_THRESHOLD) {
      this.logger.error(
        `🚨 [RMS] ${count} consecutive broker order rejections for user ${userId}. Investigate before continuing.`,
      );
    }
  }

  private recordBrokerSuccess(userId: string): void {
    this.consecutiveRejections.delete(userId);
  }
}
