import { Injectable, Logger } from '@nestjs/common';
import { BrokerAccount } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderGateway } from './order-gateway.service';
import { getFreezeLimit } from './order-rules';
import { sendAlert } from '../common/utils/alert';

export interface FlattenResult {
  cancelled: number;
  closed: string[];
  skipped: string[];
  failed: string[];
}

/** Tag on every flatten order; lets later runs recognise (and not cancel or duplicate) them. */
export const FLATTEN_TAG = 'ALGOFLAT';

const MAX_ATTEMPTS = 3;
const SETTLE_DELAYS_MS = [1_000, 2_000, 3_000];
/** Don't touch a symbol again for this long after a flatten attempt (positions API can lag). */
const COOLDOWN_MS = 60_000;
const PENDING_STATUSES = new Set(['OPEN', 'TRIGGER PENDING', 'PENDING', 'PUT ORDER REQ RECEIVED', 'VALIDATION PENDING']);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Emergency flatten used by the EOD square-off and the kill switch. All exit orders go
 * through OrderGateway (intent EXIT, MARKET with market_protection -1), are idempotent
 * across repeated runs, retried, and raise an alert if a position is still open afterwards.
 *
 * Only MIS positions in symbols an algo strategy traded today are touched, so CNC/NRML and
 * symbols the algo never traded are left alone. (Kite positions are not attributable per
 * order, so a manual MIS position in the very same symbol as an algo trade is still included.)
 */
@Injectable()
export class PositionFlattener {
  private readonly logger = new Logger(PositionFlattener.name);
  private readonly lastAttempt = new Map<string, number>();
  private readonly alerted = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
    private readonly gateway: OrderGateway,
  ) {}

  async flattenAlgoPositions(account: BrokerAccount, reason: string): Promise<FlattenResult> {
    const result: FlattenResult = { cancelled: 0, closed: [], skipped: [], failed: [] };
    const client = this.factory.createClient(account);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const algoOrders = await this.prisma.order.findMany({
      where: {
        brokerAccountId: account.id,
        strategyId: { not: null },
        isPaperTrade: false,
        createdAt: { gte: startOfToday },
      },
      select: { brokerOrderId: true, symbol: true },
    });
    const algoOrderIds = new Set(algoOrders.map((o) => o.brokerOrderId).filter(Boolean));
    const algoSymbols = new Set(algoOrders.map((o) => o.symbol));
    if (algoSymbols.size === 0) return result;

    // 1. Cancel pending algo orders (stray SL/target legs) but never our own flatten orders.
    const orders = await client.getOrders();
    for (const o of orders) {
      if (!PENDING_STATUSES.has(o.status) || o.tag === FLATTEN_TAG) continue;
      const isAlgo =
        algoOrderIds.has(o.orderId) || (algoSymbols.has(o.symbol) && (o.product || 'MIS') === 'MIS');
      if (!isAlgo) continue;
      try {
        await client.cancelOrder(o.orderId);
        result.cancelled++;
        this.logger.warn(`🧹 [${reason}] Cancelled pending algo order ${o.orderId} (${o.symbol})`);
      } catch (err: any) {
        this.logger.error(`Failed to cancel ${o.orderId} (${o.symbol}): ${err?.message}`);
      }
    }

    // 2. Flatten open algo MIS positions.
    const positions = await client.getPositions();
    for (const pos of positions) {
      if (!pos.qty || String(pos.product).toUpperCase() !== 'MIS') continue;
      if (!algoSymbols.has(pos.symbol)) {
        this.logger.log(`🛡 [${reason}] Skipping ${pos.symbol}: no algo trade today (manual position preserved).`);
        continue;
      }

      const key = `${account.id}:${pos.symbol}`;
      const inFlight = orders.some((o) => o.tag === FLATTEN_TAG && o.symbol === pos.symbol && PENDING_STATUSES.has(o.status));
      if (inFlight || Date.now() - (this.lastAttempt.get(key) || 0) < COOLDOWN_MS) {
        result.skipped.push(pos.symbol);
        continue;
      }
      this.lastAttempt.set(key, Date.now());

      const ok = await this.flattenSymbol(account, pos.symbol, pos.exchange || 'NFO', reason);
      (ok ? result.closed : result.failed).push(pos.symbol);
    }
    return result;
  }

  /** Place exit orders for the symbol's remaining quantity, verifying and retrying. */
  private async flattenSymbol(
    account: BrokerAccount,
    symbol: string,
    exchange: string,
    reason: string,
  ): Promise<boolean> {
    const client = this.factory.createClient(account);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const net = (await client.getPositions()).find((p) => p.symbol === symbol && String(p.product).toUpperCase() === 'MIS');
        const remaining = Math.abs(net?.qty || 0);
        if (remaining === 0) return true;

        // A previous attempt's order may still be working at the exchange; wait, don't double up.
        const working = (await client.getOrders()).some(
          (o) => o.tag === FLATTEN_TAG && o.symbol === symbol && PENDING_STATUSES.has(o.status),
        );
        if (!working) {
          const side = net.qty > 0 ? 'SELL' : 'BUY';
          this.logger.warn(`🚨 [${reason}] Flattening ${exchange}:${symbol} ${side} ${remaining} (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
          const chunk = getFreezeLimit(symbol);
          for (let left = remaining; left > 0; left -= chunk) {
            await this.gateway.place(account.userId, account.id, {
              symbol,
              exchange,
              side,
              orderType: 'MARKET',
              product: 'MIS',
              qty: Math.min(left, chunk),
              marketProtection: -1,
              intent: 'EXIT',
              tag: FLATTEN_TAG,
            });
          }
        }
      } catch (err: any) {
        this.logger.error(`❌ [${reason}] Flatten attempt ${attempt + 1} for ${symbol} failed: ${err?.message}`);
      }

      await sleep(SETTLE_DELAYS_MS[attempt]);
    }

    // Final verification
    try {
      const net = (await client.getPositions()).find((p) => p.symbol === symbol && String(p.product).toUpperCase() === 'MIS');
      if (!net?.qty) return true;
    } catch {
      // fall through to alert: we can't confirm the position is closed
    }

    const alertKey = `${account.id}:${symbol}`;
    const msg = `[algo-backend] ${reason}: position ${exchange}:${symbol} still OPEN after ${MAX_ATTEMPTS} flatten attempts (account ${account.id}). Close it manually!`;
    this.logger.error(`🚨 ${msg}`);
    if (!this.alerted.has(alertKey)) {
      this.alerted.add(alertKey);
      void sendAlert(msg);
    }
    return false;
  }
}
