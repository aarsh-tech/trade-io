import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderSide, OrderType, ProductType, OrderStatus } from '@prisma/client';

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
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
  ) {}

  /**
   * Syncs orders from all active broker accounts into local PostgreSQL DB
   */
  async syncBrokerOrders(userId: string): Promise<{ syncedCount: number; message: string }> {
    // 1. Auto-cancel any stale OPEN orders from prior days since daily market sessions expire daily
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    await this.prisma.order.updateMany({
      where: {
        userId,
        status: OrderStatus.OPEN,
        createdAt: { lt: startOfToday },
      },
      data: {
        status: OrderStatus.CANCELLED,
      },
    }).catch(() => {});

    const accounts = await this.prisma.brokerAccount.findMany({
      where: { userId, isActive: true },
    });

    let totalSynced = 0;

    for (const account of accounts) {
      if (!account.accessToken) continue;

      try {
        const client = this.factory.createClient(account);
        const brokerOrders = await client.getOrders();

        for (const bo of brokerOrders) {
          if (!bo.orderId) continue;

          // Find existing order in our database
          const existing = await this.prisma.order.findFirst({
            where: { userId, brokerOrderId: bo.orderId },
          });

          let dbStatus: OrderStatus = OrderStatus.OPEN;
          const statusUpper = (bo.status || '').toUpperCase();
          if (statusUpper === 'COMPLETE') dbStatus = OrderStatus.COMPLETE;
          else if (statusUpper === 'REJECTED') dbStatus = OrderStatus.REJECTED;
          else if (statusUpper === 'CANCELLED') dbStatus = OrderStatus.CANCELLED;
          else if (statusUpper === 'OPEN' || statusUpper.includes('PENDING') || statusUpper.includes('TRIGGER')) dbStatus = OrderStatus.OPEN;

          const dbAvgPrice = bo.avgPrice && bo.avgPrice > 0 ? Number(bo.avgPrice) : null;
          const dbPrice = bo.price && bo.price > 0 ? Number(bo.price) : null;
          const dbTriggerPrice = bo.triggerPrice && bo.triggerPrice > 0 ? Number(bo.triggerPrice) : null;
          const filledQty = Number(bo.filledQty) || 0;
          const totalQty = Number(bo.qty) || filledQty || 1;

          // Determine product type
          let productType: ProductType = ProductType.MIS;
          const prodUpper = (bo.product || '').toUpperCase();
          if (prodUpper === 'CNC') productType = ProductType.CNC;
          else if (prodUpper === 'NRML') productType = ProductType.NRML;

          const exchange = bo.exchange || (bo.symbol.includes('CE') || bo.symbol.includes('PE') || bo.symbol.includes('FUT') ? 'NFO' : 'NSE');

          if (existing) {
            await this.prisma.order.update({
              where: { id: existing.id },
              data: {
                status: dbStatus,
                filledQty,
                qty: totalQty,
                avgPrice: dbAvgPrice ?? existing.avgPrice,
                price: dbPrice ?? existing.price,
                triggerPrice: dbTriggerPrice ?? existing.triggerPrice,
                productType,
                exchange,
              },
            });
            totalSynced++;
          } else {
            const side: OrderSide = (bo.side || '').toUpperCase() === 'SELL' ? OrderSide.SELL : OrderSide.BUY;
            
            let orderType: OrderType = OrderType.MARKET;
            const typeUpper = (bo.type || '').toUpperCase();
            if (typeUpper === 'LIMIT') orderType = OrderType.LIMIT;
            else if (typeUpper === 'SL' || typeUpper === 'STOPLOSS') orderType = OrderType.SL;
            else if (typeUpper === 'SL-M' || typeUpper === 'SL_M' || typeUpper.includes('SL')) orderType = OrderType.SL_M;

            const orderDate = bo.orderTime ? new Date(bo.orderTime) : new Date();

            await this.prisma.order.create({
              data: {
                userId,
                brokerAccountId: account.id,
                symbol: bo.symbol,
                exchange,
                side,
                orderType,
                productType,
                qty: totalQty,
                price: dbPrice,
                triggerPrice: dbTriggerPrice,
                avgPrice: dbAvgPrice || dbPrice,
                brokerOrderId: bo.orderId,
                status: dbStatus,
                filledQty,
                createdAt: isNaN(orderDate.getTime()) ? new Date() : orderDate,
                isPaperTrade: false,
              },
            });
            totalSynced++;
          }
        }
      } catch (err: any) {
        this.logger.warn(`Error syncing orders for account ${account.id}: ${err?.message || err}`);
      }
    }

    return {
      syncedCount: totalSynced,
      message: `Successfully synchronized ${totalSynced} orders from active broker accounts`,
    };
  }

  private lastSyncByUser = new Map<string, number>();

  /**
   * Retrieves all orders for the user, triggering a background sync if not synced recently
   */
  async getUserOrders(userId: string) {
    const lastSync = this.lastSyncByUser.get(userId) || 0;
    // Auto-sync from broker in background at most once every 60 seconds
    if (Date.now() - lastSync > 60_000) {
      this.lastSyncByUser.set(userId, Date.now());
      this.syncBrokerOrders(userId).catch(() => {});
    }

    // Fetch and return all genuine Zerodha broker orders sorted by createdAt desc
    return this.prisma.order.findMany({
      where: {
        userId,
        isPaperTrade: false,
        brokerOrderId: {
          not: null,
        },
        NOT: {
          brokerOrderId: { startsWith: 'PAPER_' },
        },
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
