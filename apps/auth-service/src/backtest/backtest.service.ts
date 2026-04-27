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
  ) { }

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
      }).catch(() => { });
    });

    return backtest;
  }

  private async executeSimulation(backtestId: string, dto: RunBacktestDto, strategy: any) {
    try {
      if (strategy.type !== ('BREAKOUT_15MIN' as any) && strategy.type !== ('EMA_VWAP_CROSSOVER' as any)) {
        throw new Error('This strategy is not supported for backtesting currently.');
      }

      const config = JSON.parse(strategy.config);
      // Use symbol from DTO if provided (as requested by user to allow selecting any stock)
      const symbol = dto.symbol || config.symbol;
      const exchange = dto.exchange || config.exchange;

      const userAccount = await this.prisma.brokerAccount.findFirst({
        where: { userId: strategy.userId, isActive: true },
      });

      if (!userAccount || !userAccount.accessToken) {
        throw new Error('No active broker session found to fetch historical data');
      }

      const client = this.factory.createClient(userAccount);

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

      let result;
      if (strategy.type === StrategyType.BREAKOUT_15MIN) {
        result = this.simulateBreakout15Min(candles, config, dto.capital);
      } else {
        result = this.simulateEmaVwapCrossover(candles, config, dto.capital);
      }

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

  private simulateEmaVwapCrossover(candles: any[], config: any, initialCapital: number) {
    const trades: any[] = [];
    let currentCapital = initialCapital;

    // Calculate indicators
    const emas = this.calculateEMA(candles, config.emaPeriod || 15);
    const vwaps = this.calculateVWAP(candles);

    let position: 'LONG' | 'SHORT' | null = null;
    let entryPrice = 0;
    let stopLoss = 0;
    let target = 0;
    let waitingForConfirmation: 'LONG' | 'SHORT' | null = null;
    let confirmationLevel = 0;

    for (let i = 1; i < candles.length; i++) {
      const candle = candles[i];
      const prevEma = emas[i - 1];
      const currEma = emas[i];
      const prevVwap = vwaps[i - 1];
      const currVwap = vwaps[i];

      if (prevEma === null || currEma === null || prevVwap === null || currVwap === null) continue;

      const date = new Date(candle.date).toISOString().split('T')[0];

      if (!position) {
        // Confirmation check
        if (waitingForConfirmation) {
          if (waitingForConfirmation === 'LONG' && candle.high > confirmationLevel) {
            position = 'LONG';
            entryPrice = Math.max(candle.open, confirmationLevel);
            stopLoss = entryPrice - (config.stopLossRs / config.qty);
            target = entryPrice + (config.targetRs / config.qty);
            waitingForConfirmation = null;
          } else if (waitingForConfirmation === 'SHORT' && candle.low < confirmationLevel) {
            if (!config.isOptionBuyingOnly || (config.isOptionBuyingOnly && true)) { // Allow all for backtest or handle specifically
              position = 'SHORT';
              entryPrice = Math.min(candle.open, confirmationLevel);
              stopLoss = entryPrice + (config.stopLossRs / config.qty);
              target = entryPrice - (config.targetRs / config.qty);
              waitingForConfirmation = null;
            }
          }
          // Reset waiting if too much time passes or opposite signal (simplified: reset if new crossover)
        }

        // Crossover check
        if (prevEma <= prevVwap && currEma > currVwap) {
          waitingForConfirmation = 'LONG';
          confirmationLevel = candle.high;
        } else if (prevEma >= prevVwap && currEma < currVwap) {
          waitingForConfirmation = 'SHORT';
          confirmationLevel = candle.low;
        }
      } else {
        // Check for exit
        if (position === 'LONG') {
          if (candle.low <= stopLoss) {
            const pnl = (stopLoss - entryPrice) * config.qty;
            trades.push({ date, type: 'LONG', entry: entryPrice, exit: stopLoss, pnl, result: 'SL' });
            currentCapital += pnl;
            position = null;
          } else if (candle.high >= target) {
            const pnl = (target - entryPrice) * config.qty;
            trades.push({ date, type: 'LONG', entry: entryPrice, exit: target, pnl, result: 'TARGET' });
            currentCapital += pnl;
            position = null;
          }
        } else if (position === 'SHORT') {
          if (candle.high >= stopLoss) {
            const pnl = (entryPrice - stopLoss) * config.qty;
            trades.push({ date, type: 'SHORT', entry: entryPrice, exit: stopLoss, pnl, result: 'SL' });
            currentCapital += pnl;
            position = null;
          } else if (candle.low <= target) {
            const pnl = (entryPrice - target) * config.qty;
            trades.push({ date, type: 'SHORT', entry: entryPrice, exit: target, pnl, result: 'TARGET' });
            currentCapital += pnl;
            position = null;
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

  private calculateEMA(candles: any[], period: number) {
    const emas: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period) return emas;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += candles[i].close;
    let prevEma = sum / period;
    emas[period - 1] = prevEma;
    const multiplier = 2 / (period + 1);
    for (let i = period; i < candles.length; i++) {
      const ema = (candles[i].close - prevEma) * multiplier + prevEma;
      emas[i] = ema;
      prevEma = ema;
    }
    return emas;
  }

  private calculateVWAP(candles: any[]) {
    const vwaps: (number | null)[] = new Array(candles.length).fill(null);
    let cumulativePV = 0;
    let cumulativeV = 0;
    let lastDate = '';
    for (let i = 0; i < candles.length; i++) {
      const date = new Date(candles[i].date).toISOString().split('T')[0];
      if (date !== lastDate) {
        cumulativePV = 0;
        cumulativeV = 0;
        lastDate = date;
      }
      const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
      cumulativePV += typicalPrice * candles[i].volume;
      cumulativeV += candles[i].volume;
      vwaps[i] = cumulativePV / cumulativeV;
    }
    return vwaps;
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
