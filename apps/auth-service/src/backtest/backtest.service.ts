import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { RunBacktestDto } from './dto/backtest.dto';
import { StrategyType } from '@prisma/client';

@Injectable()
export class BacktestService {
  private readonly logger = new Logger(BacktestService.name);

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) {}

  async runBacktest(userId: string, dto: RunBacktestDto) {
    const { strategyId, symbol, exchange, fromDate, toDate, capital } = dto;

    const strategy = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) throw new Error('Strategy not found');

    // 1. Create Backtest record
    const backtest = await this.prisma.backtest.create({
      data: {
        userId,
        strategyId,
        symbol,
        exchange,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        capital,
        status: 'RUNNING',
      },
    });

    // Run simulation in background
    this.executeSimulation(backtest.id, dto, strategy).catch((err) => {
      this.logger.error(`Backtest ${backtest.id} failed: ${err.message}`);
      this.prisma.backtest.update({
        where: { id: backtest.id },
        data: { status: 'FAILED' },
      }).catch(() => {});
    });

    return backtest;
  }

  private async executeSimulation(backtestId: string, dto: RunBacktestDto, strategy: any) {
    try {
      // For now, only BREAKOUT_15MIN is supported
      if (strategy.type !== StrategyType.BREAKOUT_15MIN) {
        throw new Error('Only 15-Min Breakout strategy is supported for backtesting currently.');
      }

      const config = JSON.parse(strategy.config);
      const symbol = config.symbol;
      const exchange = config.exchange;
      
      // Need an active broker account to fetch historical data
      const userAccount = await this.prisma.brokerAccount.findFirst({
        where: { userId: strategy.userId, isActive: true },
      });

      if (!userAccount || !userAccount.accessToken) {
        throw new Error('No active broker session found to fetch historical data');
      }

      const client = this.factory.createClient(userAccount);
      
      // 1. Fetch candles
      this.logger.log(`Fetching historical data for ${symbol}...`);
      const candles = await client.getHistoricalData(
        symbol,
        exchange,
        '5minute',
        new Date(dto.fromDate),
        new Date(dto.toDate)
      );

      if (!candles || candles.length === 0) {
        throw new Error('No historical data found for the selected period');
      }

      // 2. Run simulation logic
      const result = this.simulateBreakout15Min(candles, config, dto.capital);

      // 3. Update DB
      await this.prisma.backtest.update({
        where: { id: backtestId },
        data: {
          status: 'DONE',
          result: JSON.stringify(result),
          completedAt: new Date(),
        },
      });

    } catch (err) {
      await this.prisma.backtest.update({
        where: { id: backtestId },
        data: { status: 'FAILED' },
      });
      throw err;
    }
  }

  private simulateBreakout15Min(candles: any[], config: any, initialCapital: number) {
    const trades: any[] = [];
    let currentCapital = initialCapital;
    
    // Group candles by date
    const days = new Map<string, any[]>();
    candles.forEach(c => {
      const d = new Date(c.date).toISOString().split('T')[0];
      if (!days.has(d)) days.set(d, []);
      days.get(d)!.push(c);
    });

    for (const [date, dayCandles] of days.entries()) {
      // 15-min reference (9:15 - 9:30) => first 3 candles of 5-min
      if (dayCandles.length < 4) continue;

      const refCandles = dayCandles.slice(0, 3);
      const high = Math.max(...refCandles.map(c => c.high));
      const low = Math.min(...refCandles.map(c => c.low));

      let position: 'LONG' | 'SHORT' | null = null;
      let entryPrice = 0;
      let stopLoss = 0;
      let target = 0;

      for (let i = 3; i < dayCandles.length; i++) {
        const candle = dayCandles[i];
        
        if (!position) {
          // Check for entry
          if (candle.close > high) {
            position = 'LONG';
            entryPrice = candle.close;
            stopLoss = entryPrice - (config.stopLossRs / config.qty);
            target = entryPrice + (config.targetRs / config.qty);
          } else if (candle.close < low) {
            position = 'SHORT';
            entryPrice = candle.close;
            stopLoss = entryPrice + (config.stopLossRs / config.qty);
            target = entryPrice - (config.targetRs / config.qty);
          }
        } else {
          // Check for exit
          if (position === 'LONG') {
            if (candle.low <= stopLoss) {
              const pnl = (stopLoss - entryPrice) * config.qty;
              trades.push({ date, type: 'LONG', entry: entryPrice, exit: stopLoss, pnl, result: 'SL' });
              currentCapital += pnl;
              break;
            } else if (candle.high >= target) {
              const pnl = (target - entryPrice) * config.qty;
              trades.push({ date, type: 'LONG', entry: entryPrice, exit: target, pnl, result: 'TARGET' });
              currentCapital += pnl;
              break;
            }
          } else if (position === 'SHORT') {
            if (candle.high >= stopLoss) {
              const pnl = (entryPrice - stopLoss) * config.qty;
              trades.push({ date, type: 'SHORT', entry: entryPrice, exit: stopLoss, pnl, result: 'SL' });
              currentCapital += pnl;
              break;
            } else if (candle.low <= target) {
              const pnl = (entryPrice - target) * config.qty;
              trades.push({ date, type: 'SHORT', entry: entryPrice, exit: target, pnl, result: 'TARGET' });
              currentCapital += pnl;
              break;
            }
          }
          
          // EOD Exit
          if (i === dayCandles.length - 1) {
            const pnl = position === 'LONG' ? (candle.close - entryPrice) * config.qty : (entryPrice - candle.close) * config.qty;
            trades.push({ date, type: position, entry: entryPrice, exit: candle.close, pnl, result: 'EOD' });
            currentCapital += pnl;
          }
        }
      }
    }

    const netPnl = currentCapital - initialCapital;
    const winRate = (trades.filter(t => t.pnl > 0).length / trades.length) * 100 || 0;

    return {
      initialCapital,
      finalCapital: currentCapital,
      netPnl,
      netPnlPercent: (netPnl / initialCapital) * 100,
      winRate,
      totalTrades: trades.length,
      trades
    };
  }

  async getBacktests(userId: string) {
    return this.prisma.backtest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
