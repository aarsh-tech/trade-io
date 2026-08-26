import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStrategyDto, UpdateStrategyDto } from './dto/strategy.dto';

@Injectable()
export class StrategyService {
  constructor(private prisma: PrismaService) { }

  async list(userId: string) {
    const strategies = await this.prisma.strategy.findMany({
      where: { userId },
      include: {
        brokerAccount: {
          select: { broker: true, clientId: true },
        },
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { id: true, status: true, startedAt: true, stoppedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return strategies.map((s) => ({
      ...s,
      config: this.parseConfig(s.config),
      latestExecution: s.executions[0] || null,
    }));
  }

  async get(userId: string, id: string) {
    const strategy = await this.prisma.strategy.findUnique({
      where: { id },
      include: {
        brokerAccount: {
          select: { broker: true, clientId: true },
        },
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 50,
          select: {
            id: true,
            status: true,
            startedAt: true,
            stoppedAt: true,
            logs: true,
            errorMsg: true,
            orders: {
              where: { status: 'COMPLETE' },
            },
          },
        },
      },
    });

    if (!strategy) throw new NotFoundException('Strategy not found');
    if (strategy.userId !== userId) throw new ForbiddenException();

    const performance = this.calculatePerformance(strategy.executions, strategy.type);

    return {
      ...strategy,
      config: this.parseConfig(strategy.config),
      performance
    };
  }

  async create(userId: string, dto: CreateStrategyDto) {
    return this.prisma.strategy.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type as any,
        config: dto.config,
        brokerAccountId: dto.brokerAccountId || null,
        isActive: false,
        isPaperTrade: dto.isPaperTrade !== undefined ? dto.isPaperTrade : true,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateStrategyDto) {
    await this.assertOwner(userId, id);
    return this.prisma.strategy.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.config && { config: dto.config }),
        ...(dto.brokerAccountId !== undefined && {
          brokerAccountId: dto.brokerAccountId,
        }),
        ...(dto.isPaperTrade !== undefined && {
          isPaperTrade: dto.isPaperTrade,
        }),
      },
    });
  }

  async delete(userId: string, id: string) {
    await this.assertOwner(userId, id);
    await this.prisma.strategy.delete({ where: { id } });
    return { success: true };
  }

  async setActive(userId: string, id: string, active: boolean) {
    await this.assertOwner(userId, id);
    return this.prisma.strategy.update({
      where: { id },
      data: { isActive: active },
    });
  }

  async setAutoStart(userId: string, id: string, autoStart: boolean) {
    await this.assertOwner(userId, id);
    return this.prisma.strategy.update({
      where: { id },
      data: { autoStart } as any,
    });
  }

  async getExecutions(userId: string, strategyId: string) {
    await this.assertOwner(userId, strategyId);
    return this.prisma.strategyExecution.findMany({
      where: { strategyId },
      orderBy: { startedAt: 'desc' },
      include: { orders: true },
      take: 100,
    });
  }

  async getLatestExecution(strategyId: string) {
    return this.prisma.strategyExecution.findFirst({
      where: { strategyId },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getExecutionOrders(executionId: string) {
    return this.prisma.order.findMany({
      where: { executionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  private async assertOwner(userId: string, id: string) {
    const s = await this.prisma.strategy.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Strategy not found');
    if (s.userId !== userId) throw new ForbiddenException();
    return s;
  }

  private parseConfig(raw: string) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private calculatePerformance(executions: any[], strategyType: string) {
    const completedTrades: any[] = [];

    for (const exec of executions) {
      const orders = exec.orders || [];
      let execTrades: any[] = [];

      // Approach 1: Try to calculate trades from completed orders in DB
      if (orders.length > 0) {
        const symbolOrders: Record<string, any[]> = {};
        for (const o of orders) {
          if (!symbolOrders[o.symbol]) {
            symbolOrders[o.symbol] = [];
          }
          symbolOrders[o.symbol].push(o);
        }

        for (const symbol in symbolOrders) {
          const list = symbolOrders[symbol].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

          let position = 0;
          let cashFlow = 0;
          let entryPrice = 0;
          let entryQty = 0;
          let entrySide = null;

          for (const o of list) {
            const price = o.price || o.avgPrice || 0;
            if (price === 0) continue;

            if (position === 0) {
              entryPrice = price;
              entryQty = o.qty;
              entrySide = o.side;
            }

            if (o.side === 'BUY') {
              position += o.qty;
              cashFlow -= price * o.qty;
            } else {
              position -= o.qty;
              cashFlow += price * o.qty;
            }

            if (position === 0) {
              const pnl = cashFlow;
              execTrades.push({
                symbol,
                entryPrice,
                exitPrice: price,
                qty: entryQty,
                side: entrySide,
                pnl,
                isWin: pnl > 0,
                createdAt: o.createdAt,
                source: 'order'
              });
              cashFlow = 0;
            }
          }
        }
      }

      // Approach 2: If no completed trades could be parsed from orders, fall back to parsing logs
      if (execTrades.length === 0) {
        let logs: string[] = [];
        try {
          logs = JSON.parse(exec.logs || '[]');
        } catch (e) {
          logs = [];
        }
        if (logs.length > 0) {
          execTrades = this.parseTradesFromLogs(logs, strategyType);
        }
      }

      completedTrades.push(...execTrades.map(t => ({ ...t, executionId: exec.id })));
    }

    const totalTrades = completedTrades.length;
    const wins = completedTrades.filter(t => t.isWin);
    const losses = completedTrades.filter(t => !t.isWin);

    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
    const netPnl = completedTrades.reduce((sum, t) => sum + t.pnl, 0);

    const totalProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 99.9 : 0;

    const avgProfitPerWin = wins.length > 0 ? totalProfit / wins.length : 0;

    return {
      totalTrades,
      winRate,
      netPnl,
      profitFactor,
      avgProfitPerWin
    };
  }

  private parseTradesFromLogs(logs: string[], strategyType: string) {
    const trades: any[] = [];
    let openTrade: any = null;

    for (const line of logs) {
      if (strategyType === 'STOCK_OPTIONS_BUYING') {
        const entryMatch = line.match(/Position\s+Opened\s+\[(LIVE|PAPER)\]:\s+(Filled|Bought)\s+(\d+)\s+of\s+(\S+)\s+at\s+Avg\s+₹([\d.]+)/i);
        if (entryMatch) {
          openTrade = {
            side: 'BUY',
            symbol: entryMatch[4],
            entryPrice: parseFloat(entryMatch[5]),
            qty: parseInt(entryMatch[3])
          };
        }

        const exitMatch = line.match(/Exiting\s+Position\s+—\s+Reason:\s+(\w+)\s+\|\s+Price:\s+₹([\d.]+)\s+\|\s+P&L:\s*([+-]?)\s*₹?\s*([\d.]+)/i);
        if (exitMatch && openTrade) {
          const sign = exitMatch[3] === '-' ? -1 : 1;
          const pnl = sign * parseFloat(exitMatch[4]);
          trades.push({
            symbol: openTrade.symbol,
            entryPrice: openTrade.entryPrice,
            exitPrice: parseFloat(exitMatch[2]),
            qty: openTrade.qty,
            side: openTrade.side,
            pnl,
            isWin: pnl > 0,
            reason: exitMatch[1],
            source: 'log'
          });
          openTrade = null;
        }
      }

      if (strategyType === 'BREAKOUT_15MIN') {
        const entryMatch = line.match(/Placing\s+(?:🚀\s+BREAKOUT|⚡\s+REVERSAL)?:\s+(\S+)\s+—\s+Entry:\s+₹([\d.]+)/i);
        if (entryMatch) {
          const isShort = line.toLowerCase().includes('short') || line.toLowerCase().includes('sell');
          openTrade = {
            side: isShort ? 'SELL' : 'BUY',
            symbol: entryMatch[1],
            entryPrice: parseFloat(entryMatch[2]),
            qty: 1
          };
        }

        const exitMatch = line.match(/(?:PAPER\s+TARGET\s+HIT|Target\s+Hit|PAPER\s+SL\s+HIT|Stop\s+Loss\s+Hit|Paper\s+trade\s+closed).*?(?:at|@)\s+₹([\d.]+)/i);
        if (exitMatch && openTrade) {
          const exitPrice = parseFloat(exitMatch[1]);
          const pnlPoints = openTrade.side === 'BUY' ? (exitPrice - openTrade.entryPrice) : (openTrade.entryPrice - exitPrice);
          const pnl = pnlPoints * openTrade.qty;
          const isTarget = line.toLowerCase().includes('target');
          trades.push({
            symbol: openTrade.symbol,
            entryPrice: openTrade.entryPrice,
            exitPrice,
            qty: openTrade.qty,
            side: openTrade.side,
            pnl,
            isWin: pnl > 0,
            reason: isTarget ? 'TARGET' : 'SL',
            source: 'log'
          });
          openTrade = null;
        }
      }

      if (strategyType === 'EMA_VWAP_CROSSOVER' || strategyType === 'NIFTY_OPTIONS_SCALPER') {
        const optionEntryMatch = line.match(/Placed\s+Option\s+Trade:\s+(\S+)\s+—\s+Entry:\s+₹([\d.]+)/i);
        const equityEntryMatch = line.match(/Placing:\s+(\S+)\s+—\s+Qty:\s+(\d+)\s+\|\s+Entry:\s+₹([\d.]+)/i);
        const trendMatch = line.match(/(?:Found past|Detected|Triggered!)\s+(LONG|SHORT)/i) || line.match(/Trend:\s*(LONG|SHORT)/i);

        if (optionEntryMatch) {
          openTrade = {
            side: 'BUY',
            symbol: optionEntryMatch[1],
            entryPrice: parseFloat(optionEntryMatch[2]),
            qty: 65
          };
        } else if (equityEntryMatch) {
          openTrade = {
            side: trendMatch && trendMatch[1].toUpperCase() === 'SHORT' ? 'SELL' : 'BUY',
            symbol: equityEntryMatch[1],
            qty: parseInt(equityEntryMatch[2]),
            entryPrice: parseFloat(equityEntryMatch[3]),
          };
        }

        const exitMatch = line.match(/(?:Target Hit|Stop Loss Hit|Candle closed across EMA|Paper trade closed|Auto-squaring off position|Price crossed EMA).*?(?:at|@)\s+₹([\d.]+)/i);
        const pnlExplicitMatch = line.match(/(?:Final P&L|Final Realized P&L|Realized P&L|P&L):\s*₹?([+-]?[\d.]+)/i);

        if (exitMatch && openTrade) {
          const exitPrice = parseFloat(exitMatch[1]);
          let pnl = 0;
          if (pnlExplicitMatch) {
            pnl = parseFloat(pnlExplicitMatch[1]);
          } else {
            const pnlPoints = openTrade.side === 'BUY' ? (exitPrice - openTrade.entryPrice) : (openTrade.entryPrice - exitPrice);
            pnl = pnlPoints * openTrade.qty;
          }

          const isTarget = line.toLowerCase().includes('target') || line.toLowerCase().includes('realized');
          trades.push({
            symbol: openTrade.symbol,
            entryPrice: openTrade.entryPrice,
            exitPrice,
            qty: openTrade.qty,
            side: openTrade.side,
            pnl,
            isWin: pnl > 0,
            reason: isTarget ? 'TARGET' : 'SL',
            source: 'log'
          });
          openTrade = null;
        }
      }
    }

    return trades;
  }
}
