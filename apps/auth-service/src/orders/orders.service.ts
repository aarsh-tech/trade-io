import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderSide, OrderType, ProductType, OrderStatus } from '@prisma/client';
import { Trade as ITrade } from '../brokers/interfaces/broker-client.interface';
import { TickerService } from '../market/ticker.service';
import { OrderUpdateEvent } from '../market/market-tick';
import { isTradingDay, istParts } from '../market/market-calendar';
import { parseKiteTime } from './kite-time';

const EOD_SYNC_MINUTE = 15 * 60 + 40;
const EOD_CHECK_INTERVAL_MS = 60_000;

export interface ClosedTrade {
  id: string;
  symbol: string;
  exchange: string;
  product: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: string;
  exitTime: string;
  date: string; // 'YYYY-MM-DD'
  holdingDuration: string;
  realizedPnl: number;
  pnlPct: number;
  status: 'PROFIT' | 'LOSS' | 'BREAKEVEN';
  strategyName?: string;
}

export interface DailyLedgerItem {
  date: string; // 'YYYY-MM-DD'
  formattedDate: string;
  dayOfWeek: string;
  tradesCount: number;
  pnl: number;
  wins: number;
  losses: number;
  winRate: number;
  status: 'PROFIT' | 'LOSS' | 'BREAKEVEN';
  cumulativePnl: number;
  trades: ClosedTrade[];
}

export interface MonthlyLedgerResponse {
  success: boolean;
  selectedMonth: number; // 1 - 12
  selectedYear: number;
  availableMonths: Array<{ month: number; year: number; label: string }>;
  summary: {
    totalRealizedPnl: number;
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
  };
  chartSeries: Array<{ date: string; dailyPnl: number; cumulativePnl: number }>;
  dailyLedger: DailyLedgerItem[];
  closedTrades: ClosedTrade[];
}

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
   * Computes monthly P&L Ledger by matching completed BUY and SELL executions (FIFO matching)
   */
  async getMonthlyLedger(userId: string, monthParam?: number, yearParam?: number): Promise<MonthlyLedgerResponse> {
    // 1. Sync latest orders from broker
    await this.syncBrokerOrders(userId).catch(() => {});

    // 2. Fetch all genuine COMPLETE orders for the user
    const orders = await this.prisma.order.findMany({
      where: {
        userId,
        status: OrderStatus.COMPLETE,
        filledQty: { gt: 0 },
        isPaperTrade: false,
        brokerOrderId: {
          not: null,
        },
        NOT: {
          brokerOrderId: { startsWith: 'PAPER_' },
        },
      },
      orderBy: { createdAt: 'asc' }, // FIFO chronological order
      include: {
        execution: {
          include: {
            strategy: {
              select: { name: true },
            },
          },
        },
      },
    });

    // 3. FIFO Match BUY & SELL orders per symbol
    const closedTrades: ClosedTrade[] = [];
    const openLotsBySymbol = new Map<string, Array<{
      orderId: string;
      side: OrderSide;
      qty: number;
      price: number;
      createdAt: Date;
      exchange: string;
      product: string;
      strategyName?: string;
    }>>();

    for (const order of orders) {
      const sym = order.symbol;
      const fillPrice = order.avgPrice || order.price || 0;
      let remainingQty = order.filledQty || order.qty;
      const exchange = order.exchange || 'NSE';
      const product = order.productType || 'MIS';
      const strategyName = order.execution?.strategy?.name || 'Intraday Algo';

      if (!openLotsBySymbol.has(sym)) {
        openLotsBySymbol.set(sym, []);
      }

      const lots = openLotsBySymbol.get(sym)!;

      while (remainingQty > 0 && lots.length > 0 && lots[0].side !== order.side) {
        const opposingLot = lots[0];
        const matchQty = Math.min(remainingQty, opposingLot.qty);

        let realizedPnl = 0;
        let pnlPct = 0;
        let side: 'LONG' | 'SHORT' = 'LONG';
        let entryPrice = 0;
        let exitPrice = 0;
        let entryTime = opposingLot.createdAt;
        let exitTime = order.createdAt;

        if (opposingLot.side === OrderSide.BUY && order.side === OrderSide.SELL) {
          // LONG trade closed
          side = 'LONG';
          entryPrice = opposingLot.price;
          exitPrice = fillPrice;
          realizedPnl = (exitPrice - entryPrice) * matchQty;
          pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
        } else {
          // SHORT trade closed
          side = 'SHORT';
          entryPrice = opposingLot.price;
          exitPrice = fillPrice;
          realizedPnl = (entryPrice - exitPrice) * matchQty;
          pnlPct = entryPrice > 0 ? ((entryPrice - exitPrice) / entryPrice) * 100 : 0;
        }

        // Format holding duration
        const durationMs = Math.max(0, exitTime.getTime() - entryTime.getTime());
        const durationMins = Math.round(durationMs / 60000);
        let holdingDuration = `${durationMins}m`;
        if (durationMins >= 60) {
          const hrs = Math.floor(durationMins / 60);
          const mins = durationMins % 60;
          holdingDuration = `${hrs}h ${mins}m`;
        }

        const exitDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(exitTime);

        closedTrades.push({
          id: `${opposingLot.orderId}_${order.id}_${closedTrades.length}`,
          symbol: sym,
          exchange,
          product,
          side,
          qty: matchQty,
          entryPrice: Number(entryPrice.toFixed(2)),
          exitPrice: Number(exitPrice.toFixed(2)),
          entryTime: entryTime.toISOString(),
          exitTime: exitTime.toISOString(),
          date: exitDateStr,
          holdingDuration,
          realizedPnl: Number(realizedPnl.toFixed(2)),
          pnlPct: Number(pnlPct.toFixed(2)),
          status: realizedPnl > 0.5 ? 'PROFIT' : realizedPnl < -0.5 ? 'LOSS' : 'BREAKEVEN',
          strategyName: opposingLot.strategyName || strategyName,
        });

        opposingLot.qty -= matchQty;
        remainingQty -= matchQty;

        if (opposingLot.qty <= 0) {
          lots.shift();
        }
      }

      if (remainingQty > 0) {
        lots.push({
          orderId: order.id,
          side: order.side,
          qty: remainingQty,
          price: fillPrice,
          createdAt: order.createdAt,
          exchange,
          product,
          strategyName,
        });
      }
    }

    // 4. Determine available months from closed trades
    const availableMonthsMap = new Map<string, { month: number; year: number; label: string }>();
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Default current month
    const defaultKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    availableMonthsMap.set(defaultKey, {
      month: currentMonth,
      year: currentYear,
      label: `${monthNames[currentMonth - 1]} ${currentYear}`,
    });

    closedTrades.forEach((t) => {
      const d = new Date(t.exitTime);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const k = `${y}-${String(m).padStart(2, '0')}`;
      if (!availableMonthsMap.has(k)) {
        availableMonthsMap.set(k, {
          month: m,
          year: y,
          label: `${monthNames[m - 1]} ${y}`,
        });
      }
    });

    const availableMonths = Array.from(availableMonthsMap.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });

    const selectedMonth = monthParam || currentMonth;
    const selectedYear = yearParam || currentYear;

    // 5. Filter trades for the selected month/year
    const filteredTrades = closedTrades.filter((t) => {
      const d = new Date(t.exitTime);
      return (d.getMonth() + 1) === selectedMonth && d.getFullYear() === selectedYear;
    });

    // 6. Aggregate by day
    const dailyMap = new Map<string, ClosedTrade[]>();
    filteredTrades.forEach((t) => {
      if (!dailyMap.has(t.date)) {
        dailyMap.set(t.date, []);
      }
      dailyMap.get(t.date)!.push(t);
    });

    // Sort days ascending to calculate cumulative curve
    const sortedDates = Array.from(dailyMap.keys()).sort();
    let runningCumulativePnl = 0;
    const chartSeries: Array<{ date: string; dailyPnl: number; cumulativePnl: number }> = [];
    const dailyLedgerAsc: DailyLedgerItem[] = [];

    let totalGrossProfit = 0;
    let totalGrossLoss = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let breakevenTrades = 0;

    let profitableDays = 0;
    let lossDays = 0;
    let breakevenDays = 0;

    let bestTrade: ClosedTrade | null = null;
    let worstTrade: ClosedTrade | null = null;

    filteredTrades.forEach((t) => {
      if (t.realizedPnl > 0.5) {
        winningTrades++;
        totalGrossProfit += t.realizedPnl;
      } else if (t.realizedPnl < -0.5) {
        losingTrades++;
        totalGrossLoss += Math.abs(t.realizedPnl);
      } else {
        breakevenTrades++;
      }

      if (!bestTrade || t.realizedPnl > bestTrade.realizedPnl) bestTrade = t;
      if (!worstTrade || t.realizedPnl < worstTrade.realizedPnl) worstTrade = t;
    });

    sortedDates.forEach((dateStr) => {
      const dayTrades = dailyMap.get(dateStr)!;
      const dayPnl = Number(dayTrades.reduce((acc, t) => acc + t.realizedPnl, 0).toFixed(2));
      const dayWins = dayTrades.filter((t) => t.realizedPnl > 0.5).length;
      const dayLosses = dayTrades.filter((t) => t.realizedPnl < -0.5).length;
      const dayWinRate = dayTrades.length > 0 ? Number(((dayWins / dayTrades.length) * 100).toFixed(1)) : 0;

      runningCumulativePnl = Number((runningCumulativePnl + dayPnl).toFixed(2));
      chartSeries.push({
        date: dateStr,
        dailyPnl: dayPnl,
        cumulativePnl: runningCumulativePnl,
      });

      if (dayPnl > 0.5) profitableDays++;
      else if (dayPnl < -0.5) lossDays++;
      else breakevenDays++;

      const dateObj = new Date(`${dateStr}T12:00:00.000+05:30`);
      const formattedDate = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(dateObj);

      const dayOfWeek = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
      }).format(dateObj);

      dailyLedgerAsc.push({
        date: dateStr,
        formattedDate,
        dayOfWeek,
        tradesCount: dayTrades.length,
        pnl: dayPnl,
        wins: dayWins,
        losses: dayLosses,
        winRate: dayWinRate,
        status: dayPnl > 0.5 ? 'PROFIT' : dayPnl < -0.5 ? 'LOSS' : 'BREAKEVEN',
        cumulativePnl: runningCumulativePnl,
        trades: dayTrades.sort((a, b) => new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime()),
      });
    });

    const totalRealizedPnl = Number(filteredTrades.reduce((acc, t) => acc + t.realizedPnl, 0).toFixed(2));
    const totalTrades = filteredTrades.length;
    const winRate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;
    const profitFactor = totalGrossLoss > 0 ? Number((totalGrossProfit / totalGrossLoss).toFixed(2)) : totalGrossProfit > 0 ? 99.9 : 0;
    const tradingDaysCount = sortedDates.length;
    const avgDailyPnl = tradingDaysCount > 0 ? Number((totalRealizedPnl / tradingDaysCount).toFixed(2)) : 0;
    const avgTradePnl = totalTrades > 0 ? Number((totalRealizedPnl / totalTrades).toFixed(2)) : 0;
    const avgWin = winningTrades > 0 ? Number((totalGrossProfit / winningTrades).toFixed(2)) : 0;
    const avgLoss = losingTrades > 0 ? Number((totalGrossLoss / losingTrades).toFixed(2)) : 0;

    return {
      success: true,
      selectedMonth,
      selectedYear,
      availableMonths,
      summary: {
        totalRealizedPnl,
        totalTrades,
        winningTrades,
        losingTrades,
        breakevenTrades,
        winRate,
        totalGrossProfit: Number(totalGrossProfit.toFixed(2)),
        totalGrossLoss: Number(totalGrossLoss.toFixed(2)),
        profitFactor,
        tradingDaysCount,
        profitableDays,
        lossDays,
        breakevenDays,
        avgDailyPnl,
        avgTradePnl,
        avgWin,
        avgLoss,
        bestTrade,
        worstTrade,
      },
      chartSeries,
      dailyLedger: dailyLedgerAsc.reverse(), // Show latest day on top
      closedTrades: filteredTrades.sort((a, b) => new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime()),
    };
  }
}
