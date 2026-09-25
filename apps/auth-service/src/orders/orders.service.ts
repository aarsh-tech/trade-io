import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderSide, OrderType, ProductType, OrderStatus } from '@prisma/client';
import { Trade as ITrade } from '../brokers/interfaces/broker-client.interface';
import { TickerService } from '../market/ticker.service';
import { OrderUpdateEvent } from '../market/market-tick';
import { isTradingDay, istParts } from '../market/market-calendar';
import { parseKiteTime } from './kite-time';
import { isFnoSymbol, orderBrokerage, segmentOf } from './charges';
import { ClosedTrade, Fill, istDate, matchFills, tradeStatus } from './ledger';

const EOD_SYNC_MINUTE = 15 * 60 + 40;
const EOD_CHECK_INTERVAL_MS = 60_000;

export type { ClosedTrade };

export interface DailyLedgerItem {
  date: string; // 'YYYY-MM-DD' (IST)
  formattedDate: string;
  dayOfWeek: string;
  tradesCount: number;
  pnl: number; // net of charges
  grossPnl: number;
  charges: number;
  algoPnl: number;
  manualPnl: number;
  wins: number;
  losses: number;
  winRate: number;
  status: 'PROFIT' | 'LOSS' | 'BREAKEVEN';
  cumulativePnl: number;
}

export interface LedgerQuery {
  month?: number;
  year?: number;
  page?: number;
  pageSize?: number;
  status?: 'ALL' | 'PROFIT' | 'LOSS';
  segment?: 'ALL' | 'EQUITY' | 'FNO';
  /** IST day, YYYY-MM-DD. */
  date?: string;
  q?: string;
}

interface SourceSummary {
  pnl: number;
  trades: number;
  wins: number;
}

export interface MonthlyLedgerResponse {
  success: boolean;
  selectedMonth: number; // 1 - 12
  selectedYear: number;
  availableMonths: Array<{ month: number; year: number; label: string }>;
  summary: {
    /** Net of charges. */
    totalRealizedPnl: number;
    totalGrossPnl: number;
    totalCharges: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    breakevenTrades: number;
    winRate: number;
    totalGrossProfit: number;
    totalGrossLoss: number;
    profitFactor: number;
    tradingDaysCount: number;
    profitableDays: number;
    lossDays: number;
    breakevenDays: number;
    avgDailyPnl: number;
    avgTradePnl: number;
    avgWin: number;
    avgLoss: number;
    bestTrade: ClosedTrade | null;
    worstTrade: ClosedTrade | null;
    algo: SourceSummary;
    manual: SourceSummary;
  };
  chartSeries: Array<{ date: string; dailyPnl: number; cumulativePnl: number }>;
  dailyLedger: DailyLedgerItem[];
  /** One page of the (filtered) trade journal, newest first. */
  closedTrades: ClosedTrade[];
  counts: {
    segment: { all: number; equity: number; fno: number };
    status: { all: number; wins: number; losses: number };
  };
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const round2 = (n: number) => Number(n.toFixed(2));

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrdersService.name);
  private unsubscribeOrderUpdates?: () => void;
  private eodTimer?: NodeJS.Timeout;
  private eodRunning = false;
  private lastEodSyncDate: string | null = null;
  private accountOwners = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
    private readonly ticker: TickerService,
  ) {}

  onModuleInit() {
    this.unsubscribeOrderUpdates = this.ticker.registerOrderListener((accountId, update) => {
      this.applyOrderUpdate(accountId, update).catch((err) =>
        this.logger.warn(`order_update ${update.orderId} for account ${accountId} not saved: ${err?.message || err}`),
      );
    });
    this.eodTimer = setInterval(() => void this.runEodSyncIfDue(), EOD_CHECK_INTERVAL_MS);
    // Catch up if the process was down at 15:40 (the broker's order/trade book lives until the next morning).
    void this.runEodSyncIfDue();
  }

  onModuleDestroy() {
    this.unsubscribeOrderUpdates?.();
    if (this.eodTimer) clearInterval(this.eodTimer);
  }

  private mapStatus(raw?: string | null): OrderStatus {
    const s = (raw || '').toUpperCase();
    if (s === 'COMPLETE') return OrderStatus.COMPLETE;
    if (s === 'REJECTED') return OrderStatus.REJECTED;
    if (s.includes('CANCEL')) return OrderStatus.CANCELLED;
    return OrderStatus.OPEN;
  }

  private mapProduct(raw?: string | null): ProductType {
    const p = (raw || '').toUpperCase();
    if (p === 'CNC') return ProductType.CNC;
    if (p === 'NRML') return ProductType.NRML;
    return ProductType.MIS;
  }

  private mapOrderType(raw?: string | null): OrderType {
    const t = (raw || '').toUpperCase();
    if (t === 'LIMIT') return OrderType.LIMIT;
    if (t === 'SL-M' || t === 'SL_M') return OrderType.SL_M;
    if (t.includes('SL')) return OrderType.SL;
    return OrderType.MARKET;
  }

  private guessExchange(symbol: string, exchange?: string | null): string {
    return exchange || (/(CE|PE|FUT)$/.test(symbol) ? 'NFO' : 'NSE');
  }

  private positive(n: unknown): number | null {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  /**
   * Idempotent write of one broker order, keyed on (brokerAccountId, brokerOrderId). Safe to race with the
   * OrderGateway's own upsert: whichever runs first creates the row, the other only fills in what it knows.
   */
  private upsertBrokerOrder(userId: string, accountId: string, bo: {
    orderId: string; symbol: string; exchange?: string | null; type?: string | null; side?: string | null;
    product?: string | null; status?: string | null; qty?: number | null; filledQty?: number | null;
    price?: number | null; triggerPrice?: number | null; avgPrice?: number | null; variety?: string | null;
    tag?: string | null; orderTime?: unknown;
  }) {
    const filledQty = Number(bo.filledQty) || 0;
    const qty = Number(bo.qty) || filledQty || 1;
    const price = this.positive(bo.price);
    const triggerPrice = this.positive(bo.triggerPrice);
    const avgPrice = this.positive(bo.avgPrice);
    const status = this.mapStatus(bo.status);
    const exchange = this.guessExchange(bo.symbol, bo.exchange);
    const productType = this.mapProduct(bo.product);
    const variety = bo.variety ? String(bo.variety).toLowerCase() : null;
    const tag = bo.tag || null;

    return this.prisma.order.upsert({
      where: { brokerAccountId_brokerOrderId: { brokerAccountId: accountId, brokerOrderId: bo.orderId } },
      create: {
        userId,
        brokerAccountId: accountId,
        brokerOrderId: bo.orderId,
        symbol: bo.symbol,
        exchange,
        side: (bo.side || '').toUpperCase() === 'SELL' ? OrderSide.SELL : OrderSide.BUY,
        orderType: this.mapOrderType(bo.type),
        productType,
        qty,
        price,
        triggerPrice,
        avgPrice: avgPrice ?? price,
        variety,
        tag,
        status,
        filledQty,
        isPaperTrade: false,
        createdAt: parseKiteTime(bo.orderTime) ?? new Date(),
      },
      // Fields the broker doesn't send (null) never overwrite what we already have; attribution is never touched.
      update: {
        status,
        filledQty,
        qty,
        productType,
        exchange,
        ...(avgPrice !== null && { avgPrice }),
        ...(price !== null && { price }),
        ...(triggerPrice !== null && { triggerPrice }),
        ...(variety && { variety }),
        ...(tag && { tag }),
      },
    });
  }

  /** Applies a Kite websocket `order_update` to the DB row (drops updates older than what we already hold). */
  async applyOrderUpdate(accountId: string, u: OrderUpdateEvent): Promise<void> {
    if (!u.orderId || !u.tradingsymbol) return;
    let userId = this.accountOwners.get(accountId);
    if (!userId) {
      const account = await this.prisma.brokerAccount.findUnique({ where: { id: accountId }, select: { userId: true } });
      if (!account) return;
      userId = account.userId;
      this.accountOwners.set(accountId, userId);
    }

    const existing = await this.prisma.order.findUnique({
      where: { brokerAccountId_brokerOrderId: { brokerAccountId: accountId, brokerOrderId: u.orderId } },
      select: { status: true, filledQty: true },
    });
    const incomingStatus = this.mapStatus(u.status);
    const incomingFilled = Number(u.filledQuantity) || 0;
    if (existing) {
      const terminal = existing.status !== OrderStatus.OPEN && existing.status !== OrderStatus.PENDING;
      // Out-of-order delivery: never move a finished order back to open, or a fill count backwards.
      if ((terminal && incomingStatus === OrderStatus.OPEN) || incomingFilled < existing.filledQty) return;
    }

    await this.upsertBrokerOrder(userId, accountId, {
      orderId: u.orderId,
      symbol: u.tradingsymbol,
      exchange: u.exchange,
      type: u.orderType,
      side: u.transactionType,
      product: u.product,
      status: u.status,
      qty: u.quantity,
      filledQty: incomingFilled,
      price: u.price,
      triggerPrice: u.triggerPrice,
      avgPrice: u.averagePrice,
      variety: u.variety,
      tag: u.tag,
      orderTime: u.exchangeTs,
    });
  }

  /** Pulls today's fills from Kite `/trades` into the `trades` table (idempotent on tradeId). */
  private async syncAccountTrades(userId: string, accountId: string, client: { getTrades(): Promise<ITrade[]> }): Promise<number> {
    const trades = await client.getTrades();
    const rows = trades
      .filter((t) => t.tradeId && t.orderId && t.symbol && t.qty > 0)
      .map((t) => ({
        userId,
        brokerAccountId: accountId,
        tradeId: t.tradeId,
        brokerOrderId: t.orderId,
        symbol: t.symbol,
        exchange: this.guessExchange(t.symbol, t.exchange),
        side: (t.side || '').toUpperCase() === 'SELL' ? OrderSide.SELL : OrderSide.BUY,
        productType: this.mapProduct(t.product),
        qty: t.qty,
        price: t.price,
        filledAt: parseKiteTime(t.filledAt) ?? new Date(),
      }));
    if (rows.length === 0) return 0;
    const res = await this.prisma.trade.createMany({ data: rows, skipDuplicates: true });
    return res.count;
  }

  /**
   * Syncs orders and fills from all active broker accounts into the local DB. A failure on one account (or on
   * one of orders/trades) is logged and does not stop the others.
   */
  async syncBrokerOrders(userId: string): Promise<{ syncedCount: number; tradesSynced: number; message: string }> {
    // Kite's order book is per day, so anything still OPEN from before today (IST) can no longer be live.
    const startOfTodayIst = new Date(`${istParts().date}T00:00:00+05:30`);
    await this.prisma.order.updateMany({
      where: { userId, status: OrderStatus.OPEN, createdAt: { lt: startOfTodayIst } },
      data: { status: OrderStatus.CANCELLED },
    }).catch(() => {});

    const accounts = await this.prisma.brokerAccount.findMany({ where: { userId, isActive: true } });
    let totalSynced = 0;
    let tradesSynced = 0;

    for (const account of accounts) {
      if (!account.accessToken) continue;
      const client = this.factory.createClient(account);

      try {
        const brokerOrders = await client.getOrders();
        const valid = brokerOrders.filter((bo) => bo.orderId);
        for (let i = 0; i < valid.length; i += 50) {
          await this.prisma.$transaction(valid.slice(i, i + 50).map((bo) => this.upsertBrokerOrder(userId, account.id, bo)));
        }
        totalSynced += valid.length;
      } catch (err: any) {
        this.logger.warn(`Error syncing orders for account ${account.id}: ${err?.message || err}`);
      }

      try {
        tradesSynced += await this.syncAccountTrades(userId, account.id, client);
      } catch (err: any) {
        this.logger.warn(`Error syncing trades for account ${account.id}: ${err?.message || err}`);
      }
    }

    return {
      syncedCount: totalSynced,
      tradesSynced,
      message: `Synchronized ${totalSynced} orders and ${tradesSynced} new fills from active broker accounts`,
    };
  }

  /** 15:40 IST sync for every user with an active, authenticated broker account, once per trading day. */
  private async runEodSyncIfDue(): Promise<void> {
    if (this.eodRunning) return;
    const now = istParts();
    if (!isTradingDay() || now.minute < EOD_SYNC_MINUTE || this.lastEodSyncDate === now.date) return;
    this.eodRunning = true;
    try {
      const users = await this.prisma.brokerAccount.findMany({
        where: { isActive: true, accessToken: { not: null } },
        select: { userId: true },
        distinct: ['userId'],
      });
      for (const { userId } of users) {
        await this.syncBrokerOrders(userId).catch((err) =>
          this.logger.warn(`EOD sync failed for user ${userId}: ${err?.message || err}`),
        );
      }
      this.lastEodSyncDate = now.date;
      this.logger.log(`EOD order/trade sync done for ${users.length} user(s) (${now.date})`);
    } catch (err: any) {
      this.logger.error(`EOD sync failed: ${err?.message || err}`);
    } finally {
      this.eodRunning = false;
    }
  }

  private lastSyncByUser = new Map<string, number>();

  /**
   * Retrieves all orders for the user, triggering a sync if not synced recently
   */
  async getUserOrders(userId: string) {
    const lastSync = this.lastSyncByUser.get(userId) || 0;
    // Auto-sync from broker with a 2.5s race timeout so first load has fresh broker orders
    if (Date.now() - lastSync > 60_000) {
      this.lastSyncByUser.set(userId, Date.now());
      await Promise.race([
        this.syncBrokerOrders(userId).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    }

    // Return all orders for the user (both Live and Paper), so algo trades started from mobile are ALWAYS visible on desktop
    return this.prisma.order.findMany({
      where: {
        userId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        execution: {
          include: {
            strategy: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Every real fill for the user up to `before`: broker trades where we have them, otherwise the order's own
   * average price (history from before the `trades` table existed). Paper orders are never included.
   */
  private async loadFills(userId: string, before: Date): Promise<Fill[]> {
    const [trades, orders] = await Promise.all([
      this.prisma.trade.findMany({ where: { userId, filledAt: { lt: before } }, orderBy: { filledAt: 'asc' } }),
      this.prisma.order.findMany({
        where: {
          userId,
          isPaperTrade: false,
          filledQty: { gt: 0 },
          createdAt: { lt: before },
          brokerOrderId: { not: null },
          NOT: { brokerOrderId: { startsWith: 'PAPER_' } },
        },
        select: {
          brokerAccountId: true,
          brokerOrderId: true,
          symbol: true,
          exchange: true,
          side: true,
          productType: true,
          status: true,
          filledQty: true,
          avgPrice: true,
          price: true,
          strategyId: true,
          executionId: true,
          createdAt: true,
          execution: { select: { strategy: { select: { name: true } } } },
        },
      }),
    ]);

    const keyOf = (accountId: string | null, orderId: string | null) => `${accountId ?? '-'}|${orderId}`;
    const attribution = new Map<string, { algo: boolean; strategyName?: string }>();
    for (const o of orders) {
      attribution.set(keyOf(o.brokerAccountId, o.brokerOrderId), {
        algo: !!(o.strategyId || o.executionId),
        strategyName: o.execution?.strategy?.name,
      });
    }

    // Brokerage is charged per executed order, so spread each order's brokerage over its filled units.
    const orderTotals = new Map<string, { qty: number; value: number }>();
    for (const t of trades) {
      const k = keyOf(t.brokerAccountId, t.brokerOrderId);
      const cur = orderTotals.get(k) || { qty: 0, value: 0 };
      orderTotals.set(k, { qty: cur.qty + t.qty, value: cur.value + t.qty * t.price });
    }

    const fills: Fill[] = [];
    for (const t of trades) {
      const k = keyOf(t.brokerAccountId, t.brokerOrderId);
      const total = orderTotals.get(k)!;
      const segment = segmentOf(t.exchange, t.symbol, t.productType);
      const attr = attribution.get(k);
      fills.push({
        accountId: t.brokerAccountId,
        orderId: t.brokerOrderId,
        symbol: t.symbol,
        exchange: t.exchange,
        product: t.productType,
        side: t.side,
        qty: t.qty,
        price: t.price,
        at: t.filledAt,
        brokeragePerUnit: total.qty > 0 ? orderBrokerage(segment, total.value) / total.qty : 0,
        algo: attr?.algo ?? false,
        strategyName: attr?.strategyName,
      });
    }

    for (const o of orders) {
      const k = keyOf(o.brokerAccountId, o.brokerOrderId);
      if (orderTotals.has(k) || o.status !== OrderStatus.COMPLETE) continue;
      const price = o.avgPrice || o.price || 0;
      const segment = segmentOf(o.exchange, o.symbol, o.productType);
      const attr = attribution.get(k);
      fills.push({
        accountId: o.brokerAccountId,
        orderId: o.brokerOrderId!,
        symbol: o.symbol,
        exchange: o.exchange || 'NSE',
        product: o.productType,
        side: o.side,
        qty: o.filledQty,
        price,
        at: o.createdAt,
        brokeragePerUnit: o.filledQty > 0 ? orderBrokerage(segment, o.filledQty * price) / o.filledQty : 0,
        algo: attr?.algo ?? false,
        strategyName: attr?.strategyName,
      });
    }
    return fills;
  }

  /** Months (IST) in which the user has any fill, newest first, for the month picker. */
  private async fillMonths(userId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ m: string }>>`
      SELECT DISTINCT to_char(("filledAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS m
        FROM "trades" WHERE "userId" = ${userId}
      UNION
      SELECT DISTINCT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')
        FROM "orders" WHERE "userId" = ${userId} AND "isPaperTrade" = false AND "filledQty" > 0
      ORDER BY m DESC`;
    return rows.map((r) => r.m);
  }

  /**
   * Today's (IST) realized P&L from real fills, net of charges, split algo vs manual. Same FIFO matching as the
   * ledger, so the status bar and the ledger always agree. Reads only the DB.
   */
  async getDayRealizedPnl(userId: string) {
    const today = istDate(new Date());
    const tomorrowStartIst = new Date(new Date(`${today}T00:00:00+05:30`).getTime() + 24 * 3600_000);
    const trades = matchFills(await this.loadFills(userId, tomorrowStartIst)).filter((t) => t.date === today);
    const sum = (list: ClosedTrade[]) => round2(list.reduce((a, t) => a + t.realizedPnl, 0));
    return {
      date: today,
      realizedPnl: sum(trades),
      grossPnl: round2(trades.reduce((a, t) => a + t.grossPnl, 0)),
      charges: round2(trades.reduce((a, t) => a + t.charges, 0)),
      algoPnl: sum(trades.filter((t) => t.source === 'ALGO')),
      manualPnl: sum(trades.filter((t) => t.source === 'MANUAL')),
      trades: trades.length,
    };
  }

  /**
   * Monthly realized P&L from real fills: FIFO round trips, net of charges, bucketed by IST day/month, split into
   * algo vs manual, with a paginated/filterable trade journal. Reads only the DB (no broker call); the DB is kept
   * current by order_update events, the manual sync and the 15:40 IST job.
   */
  async getMonthlyLedger(userId: string, query: LedgerQuery = {}): Promise<MonthlyLedgerResponse> {
    const nowIst = istDate(new Date());
    const currentYear = Number(nowIst.slice(0, 4));
    const currentMonth = Number(nowIst.slice(5, 7));
    const selectedMonth = query.month && query.month >= 1 && query.month <= 12 ? query.month : currentMonth;
    const selectedYear = query.year && query.year >= 2000 && query.year <= 2100 ? query.year : currentYear;
    const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    const nextMonthStartIst = new Date(
      `${selectedMonth === 12 ? selectedYear + 1 : selectedYear}-${String(selectedMonth === 12 ? 1 : selectedMonth + 1).padStart(2, '0')}-01T00:00:00+05:30`,
    );

    const [fills, monthKeys] = await Promise.all([this.loadFills(userId, nextMonthStartIst), this.fillMonths(userId)]);
    const monthTrades = matchFills(fills).filter((t) => t.date.startsWith(monthKey));

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const labelled = new Set([...monthKeys, `${currentYear}-${String(currentMonth).padStart(2, '0')}`, monthKey]);
    const availableMonths = Array.from(labelled)
      .sort()
      .reverse()
      .map((k) => {
        const year = Number(k.slice(0, 4));
        const month = Number(k.slice(5, 7));
        return { month, year, label: `${monthNames[month - 1]} ${year}` };
      });

    // ── Aggregates over the whole month (never affected by journal filters/pages) ──
    const byDay = new Map<string, ClosedTrade[]>();
    for (const t of monthTrades) {
      const list = byDay.get(t.date);
      if (list) list.push(t);
      else byDay.set(t.date, [t]);
    }

    const sumPnl = (list: ClosedTrade[]) => round2(list.reduce((a, t) => a + t.realizedPnl, 0));
    const chartSeries: MonthlyLedgerResponse['chartSeries'] = [];
    const dailyAsc: DailyLedgerItem[] = [];
    let cumulative = 0;
    let profitableDays = 0;
    let lossDays = 0;
    let breakevenDays = 0;

    for (const date of Array.from(byDay.keys()).sort()) {
      const trades = byDay.get(date)!;
      const pnl = sumPnl(trades);
      const wins = trades.filter((t) => t.status === 'PROFIT').length;
      const losses = trades.filter((t) => t.status === 'LOSS').length;
      cumulative = round2(cumulative + pnl);
      chartSeries.push({ date, dailyPnl: pnl, cumulativePnl: cumulative });
      const status = tradeStatus(pnl);
      if (status === 'PROFIT') profitableDays++;
      else if (status === 'LOSS') lossDays++;
      else breakevenDays++;

      const dateObj = new Date(`${date}T12:00:00.000+05:30`);
      dailyAsc.push({
        date,
        formattedDate: new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(dateObj),
        dayOfWeek: new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(dateObj),
        tradesCount: trades.length,
        pnl,
        grossPnl: round2(trades.reduce((a, t) => a + t.grossPnl, 0)),
        charges: round2(trades.reduce((a, t) => a + t.charges, 0)),
        algoPnl: sumPnl(trades.filter((t) => t.source === 'ALGO')),
        manualPnl: sumPnl(trades.filter((t) => t.source === 'MANUAL')),
        wins,
        losses,
        winRate: trades.length > 0 ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
        status,
        cumulativePnl: cumulative,
      });
    }

    const winners = monthTrades.filter((t) => t.status === 'PROFIT');
    const losers = monthTrades.filter((t) => t.status === 'LOSS');
    const grossProfit = winners.reduce((a, t) => a + t.realizedPnl, 0);
    const grossLoss = Math.abs(losers.reduce((a, t) => a + t.realizedPnl, 0));
    const totalRealizedPnl = sumPnl(monthTrades);
    const totalTrades = monthTrades.length;
    const tradingDaysCount = byDay.size;
    const bucket = (source: ClosedTrade['source']) => {
      const list = monthTrades.filter((t) => t.source === source);
      return { pnl: sumPnl(list), trades: list.length, wins: list.filter((t) => t.status === 'PROFIT').length };
    };
    let bestTrade: ClosedTrade | null = null;
    let worstTrade: ClosedTrade | null = null;
    for (const t of monthTrades) {
      if (!bestTrade || t.realizedPnl > bestTrade.realizedPnl) bestTrade = t;
      if (!worstTrade || t.realizedPnl < worstTrade.realizedPnl) worstTrade = t;
    }

    // ── Journal: filters + pagination ──
    const search = (query.q || '').trim().toLowerCase();
    const inScope = monthTrades.filter((t) => !query.date || t.date === query.date);
    const counts = {
      segment: {
        all: inScope.length,
        equity: inScope.filter((t) => !isFnoSymbol(t.exchange, t.symbol)).length,
        fno: inScope.filter((t) => isFnoSymbol(t.exchange, t.symbol)).length,
      },
      status: {
        all: inScope.filter((t) => t.status !== 'BREAKEVEN').length,
        wins: inScope.filter((t) => t.status === 'PROFIT').length,
        losses: inScope.filter((t) => t.status === 'LOSS').length,
      },
    };
    const journal = inScope
      .filter((t) => !query.status || query.status === 'ALL' || t.status === query.status)
      .filter((t) => {
        if (!query.segment || query.segment === 'ALL') return true;
        return isFnoSymbol(t.exchange, t.symbol) === (query.segment === 'FNO');
      })
      .filter((t) => !search || t.symbol.toLowerCase().includes(search) || (t.strategyName || '').toLowerCase().includes(search))
      .sort((a, b) => b.exitTime.localeCompare(a.exitTime));
    const pageSize = Math.min(Math.max(query.pageSize || 100, 1), 1000);
    const totalPages = Math.max(1, Math.ceil(journal.length / pageSize));
    const page = Math.min(Math.max(query.page || 1, 1), totalPages);

    return {
      success: true,
      selectedMonth,
      selectedYear,
      availableMonths,
      summary: {
        totalRealizedPnl,
        totalGrossPnl: round2(monthTrades.reduce((a, t) => a + t.grossPnl, 0)),
        totalCharges: round2(monthTrades.reduce((a, t) => a + t.charges, 0)),
        totalTrades,
        winningTrades: winners.length,
        losingTrades: losers.length,
        breakevenTrades: totalTrades - winners.length - losers.length,
        winRate: totalTrades > 0 ? Number(((winners.length / totalTrades) * 100).toFixed(1)) : 0,
        totalGrossProfit: round2(grossProfit),
        totalGrossLoss: round2(grossLoss),
        profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.9 : 0,
        tradingDaysCount,
        profitableDays,
        lossDays,
        breakevenDays,
        avgDailyPnl: tradingDaysCount > 0 ? round2(totalRealizedPnl / tradingDaysCount) : 0,
        avgTradePnl: totalTrades > 0 ? round2(totalRealizedPnl / totalTrades) : 0,
        avgWin: winners.length > 0 ? round2(grossProfit / winners.length) : 0,
        avgLoss: losers.length > 0 ? round2(grossLoss / losers.length) : 0,
        bestTrade,
        worstTrade,
        algo: bucket('ALGO'),
        manual: bucket('MANUAL'),
      },
      chartSeries,
      dailyLedger: dailyAsc.reverse(),
      closedTrades: journal.slice((page - 1) * pageSize, page * pageSize),
      counts,
      pagination: { page, pageSize, total: journal.length, totalPages },
    };
  }
}
