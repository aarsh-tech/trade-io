import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { IBrokerClient, OrderIntent, OrderParams } from '../brokers/interfaces/broker-client.interface';
import { withKiteRetry } from '../brokers/kite-errors';
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

/** An order an engine wants reflected in the DB (its own view of a paper or live order). */
export interface EngineOrderRecord {
  userId: string;
  accountId?: string | null;
  strategyId?: string | null;
  executionId?: string | null;
  symbol: string;
  exchange: string;
  side: 'BUY' | 'SELL';
  orderType: string;
  product: string;
  qty: number;
  price?: number | null;
  triggerPrice?: number | null;
  brokerOrderId?: string | null;
  status: 'OPEN' | 'COMPLETE';
  isPaper: boolean;
  createdAt?: Date;
}

/** Engine placeholders (PAPER_*, ORDER_*) are not broker order ids. */
const isBrokerOrderId = (id?: string | null): id is string => !!id && !/^(PAPER_|ORDER_)/i.test(id);

export interface PlacedOrder {
  orderId: string;
  tag?: string;
  qty: number;
}

const WORKING_STATUSES = new Set(['OPEN', 'TRIGGER PENDING', 'PUT ORDER REQ RECEIVED', 'VALIDATION PENDING']);

/** Midnight of the current IST day; today's orders are the only ones a restart can inherit. */
function istStartOfDay(now = new Date()): Date {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  return new Date(`${day}T00:00:00.000+05:30`);
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

  /** `${accountId}:${symbol}:${side}` -> tail of the protective-order queue for that leg */
  private readonly protectiveLocks = new Map<string, Promise<unknown>>();

  async place(
    userId: string,
    accountId: string,
    params: OrderParams,
    ctx: OrderContext = {},
  ): Promise<PlacedOrder> {
    // Two SL requests for the same leg (e.g. overlapping ticks) must not both pass the
    // "is an SL already working?" check before either has reached the broker, so they queue.
    if (params.intent === 'PROTECTIVE' && (params.orderType === 'SL' || params.orderType === 'SL-M')) {
      const key = `${accountId}:${params.symbol}:${params.side}`;
      const prev = this.protectiveLocks.get(key) ?? Promise.resolve();
      const run = prev.catch(() => undefined).then(() => this.placeUnlocked(userId, accountId, params, ctx));
      const tail = run.catch(() => undefined);
      this.protectiveLocks.set(key, tail);
      try {
        return await run;
      } finally {
        if (this.protectiveLocks.get(key) === tail) this.protectiveLocks.delete(key);
      }
    }
    return this.placeUnlocked(userId, accountId, params, ctx);
  }

  private async placeUnlocked(
    userId: string,
    accountId: string,
    params: OrderParams,
    ctx: OrderContext,
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

    // 3b. Idempotent protection: never arm a second SL next to a live one (restart recovery,
    //     retries after a lost response). Reuses the existing order when it is still working.
    if (intent === 'PROTECTIVE' && (params.orderType === 'SL' || params.orderType === 'SL-M')) {
      const existing = await this.reuseWorkingProtective(client, accountId, params, qty);
      if (existing) return existing;
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

  /**
   * Looks for an SL already working for the same account/symbol/side/product. The broker is the
   * source of truth; if it can't be read, our own OPEN records from today stand in (an unreadable
   * broker must not read as "no SL"). When found, its quantity/trigger are aligned by modifying it;
   * if that modify fails (e.g. the order was just cancelled) the caller places a fresh SL instead.
   */
  private async reuseWorkingProtective(
    client: IBrokerClient,
    accountId: string,
    params: OrderParams,
    qty: number,
  ): Promise<PlacedOrder | null> {
    let found: { orderId: string; qty: number; triggerPrice: number; tag?: string; verified: boolean } | null = null;

    try {
      const orders = await withKiteRetry(() => client.getOrders());
      const hit = orders.find(
        (o) =>
          o.symbol === params.symbol &&
          (o.exchange || params.exchange) === params.exchange &&
          o.side === params.side &&
          (o.product || params.product) === params.product &&
          (o.type === 'SL' || o.type === 'SL-M') &&
          WORKING_STATUSES.has(String(o.status).toUpperCase()),
      );
      if (hit) {
        found = { orderId: hit.orderId, qty: Number(hit.qty) || 0, triggerPrice: Number(hit.triggerPrice) || 0, tag: hit.tag, verified: true };
      }
    } catch (err: any) {
      this.logger.warn(`Cannot read broker orders to check for an existing SL on ${params.symbol}: ${err?.message}`);
      try {
        const row = await this.prisma.order.findFirst({
          where: {
            brokerAccountId: accountId,
            symbol: params.symbol,
            side: params.side,
            status: 'OPEN',
            orderType: { in: ['SL', 'SL_M'] as any },
            isPaperTrade: false,
            createdAt: { gte: istStartOfDay() },
            brokerOrderId: { not: null },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (row?.brokerOrderId) {
          found = { orderId: row.brokerOrderId, qty: Number(row.qty) || 0, triggerPrice: Number(row.triggerPrice) || 0, tag: row.tag ?? undefined, verified: false };
        }
      } catch {
        /* DB unreadable too: fall through and place, an unprotected position is the worse outcome */
      }
    }

    if (!found) return null;

    const trigger = Number(params.triggerPrice) || 0;
    const needsModify = found.qty !== qty || (trigger > 0 && Math.abs(found.triggerPrice - trigger) > 1e-6);
    if (needsModify) {
      try {
        await client.modifyOrder?.(found.orderId, {
          quantity: qty,
          ...(trigger > 0 && { triggerPrice: trigger }),
          ...(params.price && { price: Number(params.price) }),
        });
      } catch (err: any) {
        this.logger.warn(`Existing SL ${found.orderId} on ${params.symbol} could not be modified (${err?.message}); placing a fresh SL.`);
        return null;
      }
    }
    this.logger.warn(
      `🛡 Reusing existing ${found.verified ? '' : '(unverified) '}SL ${found.orderId} on ${params.symbol} instead of placing a duplicate.`,
    );
    return { orderId: found.orderId, tag: found.tag, qty };
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

  /**
   * The single way engines write their own order rows. Never a plain `create`:
   * - Live orders are keyed on the real (brokerAccountId, brokerOrderId), the same key the gateway and broker sync
   *   use. If the row exists it only gets attribution; status, fills and prices stay owned by the broker (sync /
   *   order_update). A live record without a real broker order id is skipped, since the gateway already saved the
   *   real order and a second row would be counted twice in P&L.
   * - Paper orders get a unique PAPER_ id and are always isPaperTrade, so they can never look like real fills.
   * Never throws: a DB problem must not disturb order handling.
   */
  async recordEngineOrder(o: EngineOrderRecord): Promise<void> {
    try {
      const base = {
        userId: o.userId,
        strategyId: o.strategyId ?? null,
        executionId: o.executionId ?? null,
        symbol: o.symbol,
        exchange: o.exchange,
        side: o.side,
        orderType: mapOrderTypeToDb(o.orderType),
        productType: o.product as any,
        qty: Math.max(1, Math.round(o.qty)),
        price: o.price ?? null,
        triggerPrice: o.triggerPrice ?? null,
        status: o.status,
        filledQty: o.status === 'COMPLETE' ? Math.max(1, Math.round(o.qty)) : 0,
        avgPrice: o.status === 'COMPLETE' ? (o.price ?? null) : null,
        ...(o.createdAt ? { createdAt: o.createdAt } : {}),
      };

      if (o.isPaper) {
        // Engines encode meaning in paper ids (e.g. ..._TARGET, ..._SL), so keep a supplied id as it is.
        const brokerOrderId = o.brokerOrderId || `PAPER_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
        await this.prisma.order.create({
          data: { ...base, brokerAccountId: o.accountId ?? null, brokerOrderId, isPaperTrade: true },
        });
        return;
      }

      if (!o.accountId || !isBrokerOrderId(o.brokerOrderId)) {
        this.logger.warn(`Live order record for ${o.symbol} skipped: no broker order id (gateway/broker sync holds the real row)`);
        return;
      }
      await this.prisma.order.upsert({
        where: { brokerAccountId_brokerOrderId: { brokerAccountId: o.accountId, brokerOrderId: o.brokerOrderId } },
        create: { ...base, brokerAccountId: o.accountId, brokerOrderId: o.brokerOrderId, isPaperTrade: false },
        update: {
          ...(o.strategyId && { strategyId: o.strategyId }),
          ...(o.executionId && { executionId: o.executionId }),
        },
      });
    } catch (err: any) {
      this.logger.error(`Could not record ${o.isPaper ? 'paper' : 'live'} order ${o.brokerOrderId ?? ''} (${o.symbol}): ${err?.message}`);
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
