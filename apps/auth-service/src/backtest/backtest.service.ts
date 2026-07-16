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
      if (
        strategy.type !== ('BREAKOUT_15MIN' as any) &&
        strategy.type !== ('EMA_VWAP_CROSSOVER' as any) &&
        strategy.type !== ('DAILY_SCALPER' as any)
      ) {
        throw new Error('This strategy is not supported for backtesting currently.');
      }

      const config = JSON.parse(strategy.config);
      const symbol = dto.symbol || config.symbol;
      const exchange = dto.exchange || config.exchange;

      const userAccount = await this.prisma.brokerAccount.findFirst({
        where: { userId: strategy.userId, isActive: true },
      });

      if (!userAccount || !userAccount.accessToken) {
        throw new Error('No active broker session found to fetch historical data');
      }

      const client = this.factory.createClient(userAccount);
      const interval = strategy.type === ('DAILY_SCALPER' as any) ? '3minute' : '5minute';

      this.logger.log(`Fetching historical data for ${symbol}...`);
      const candles = await client.getHistoricalData(
        symbol,
        exchange,
        interval,
        new Date(dto.fromDate),
        new Date(dto.toDate)
      );

      if (!candles || candles.length === 0) {
        throw new Error('No historical data found for the selected period');
      }

      let result;
      if (strategy.type === StrategyType.BREAKOUT_15MIN) {
        result = this.simulateBreakout15Min(candles, config, dto.capital);
      } else if (strategy.type === StrategyType.EMA_VWAP_CROSSOVER) {
        result = this.simulateEmaVwapCrossover(candles, config, dto.capital);
      } else if (strategy.type === StrategyType.DAILY_SCALPER) {
        result = this.simulateDailyScalper(candles, config, dto.capital);
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
    let confirmationHigh = 0;
    let confirmationLow = 0;
    let invalidationPrice = 0;
    let setupIndex = 0;

    for (let i = 1; i < candles.length; i++) {
      const candle = candles[i];
      const date = new Date(candle.date).toISOString().split('T')[0];

      if (!position) {
        // Confirmation check
        if (waitingForConfirmation) {
          // Expiration check: 3 candles
          if (i - setupIndex > 3) {
            waitingForConfirmation = null;
          } else {
            if (waitingForConfirmation === 'LONG') {
              if (candle.high > confirmationHigh) {
                position = 'LONG';
                entryPrice = confirmationHigh;
                stopLoss = entryPrice - (config.stopLossRs / config.qty);
                target = entryPrice + (config.targetRs / config.qty);
                waitingForConfirmation = null;
              } else if (candle.low < invalidationPrice) {
                waitingForConfirmation = null;
              }
            } else if (waitingForConfirmation === 'SHORT') {
              if (candle.low < confirmationLow) {
                position = 'SHORT';
                entryPrice = confirmationLow;
                stopLoss = entryPrice + (config.stopLossRs / config.qty);
                target = entryPrice - (config.targetRs / config.qty);
                waitingForConfirmation = null;
              } else if (candle.high > invalidationPrice) {
                waitingForConfirmation = null;
              }
            }
          }
        }

        // Scan for setups
        const mother = candles[i - 1];
        const baby = candles[i];
        const isInsideCandle = baby.high <= mother.high && baby.low >= mother.low;

        if (isInsideCandle) {
          const trend = this.getLatestCrossoverToday(i, candles, emas, vwaps);
          if (trend !== null) {
            if (trend === 'LONG') {
              waitingForConfirmation = 'LONG';
              confirmationHigh = mother.high;
              invalidationPrice = mother.low;
              setupIndex = i;
            } else {
              waitingForConfirmation = 'SHORT';
              confirmationLow = mother.low;
              invalidationPrice = mother.high;
              setupIndex = i;
            }
          }
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

  private calcRSI(candles: any[], period = 14): number {
    if (candles.length < period + 1) return 50;
    const changes: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      changes.push(candles[i].close - candles[i - 1].close);
    }
    const recent = changes.slice(-period);
    const gains = recent.filter(d => d > 0).reduce((s, d) => s + d, 0) / period;
    const losses = recent.filter(d => d < 0).reduce((s, d) => s + Math.abs(d), 0) / period;
    if (losses === 0) return 100;
    return 100 - 100 / (1 + gains / losses);
  }

  private getLatestCrossoverToday(idx: number, candles: any[], emas: (number | null)[], vwaps: (number | null)[]): 'LONG' | 'SHORT' | null {
    let latestCrossover: 'LONG' | 'SHORT' | null = null;
    const todayStr = new Date(candles[idx].date).toISOString().split('T')[0];

    for (let k = 1; k <= idx; k++) {
      const candleDateStr = new Date(candles[k].date).toISOString().split('T')[0];
      if (candleDateStr !== todayStr) continue;

      const prevEma = emas[k - 1], currEma = emas[k];
      const prevVwap = vwaps[k - 1], currVwap = vwaps[k];
      if (prevEma === null || currEma === null || prevVwap === null || currVwap === null) continue;

      if (prevEma <= prevVwap && currEma > currVwap) {
        latestCrossover = 'LONG';
      } else if (prevEma >= prevVwap && currEma < currVwap) {
        latestCrossover = 'SHORT';
      }
    }
    return latestCrossover;
  }

  private simulateDailyScalper(candles: any[], config: any, initialCapital: number) {
    const trades: any[] = [];
    let currentCapital = initialCapital;

    // Calculate indicators
    const emas = this.calculateEMA(candles, 9);
    const vwaps = this.calculateVWAP(candles);

    // Group candles by date
    const days = new Map<string, any[]>();
    candles.forEach(c => {
      const d = new Date(c.date).toISOString().split('T')[0];
      if (!days.has(d)) days.set(d, []);
      days.get(d)!.push(c);
    });

    for (const [date, dayCandles] of days.entries()) {
      let position: 'LONG' | 'SHORT' | null = null;
      let entryPrice = 0;
      let stopLoss = 0;
      let target = 0;
      let isStopLossTrailed = false;
      let dailyPnl = 0;
      let tradesCount = 0;

      const globalIndices = dayCandles.map(dc => candles.findIndex(c => c.date === dc.date));

      for (let i = 0; i < dayCandles.length; i++) {
        const candle = dayCandles[i];
        const globalIdx = globalIndices[i];
        if (globalIdx === -1) continue;

        const dateObj = new Date(candle.date);
        const hh = dateObj.getHours();
        const mm = dateObj.getMinutes();
        const hhmm = hh * 60 + mm;

        if (hhmm < 9 * 60 + 30) continue;

        if (hhmm >= 11 * 60 + 30 && hhmm < 13 * 60 + 30) {
          if (position) {
            const exitPrice = candle.close;
            const pnl = position === 'LONG' ? (exitPrice - entryPrice) * config.qty : (entryPrice - exitPrice) * config.qty;
            trades.push({ date, type: position, entry: entryPrice, exit: exitPrice, pnl, result: 'MID_DAY_EXIT' });
            currentCapital += pnl;
            dailyPnl += pnl;
            position = null;
          }
          continue;
        }

        if (dailyPnl >= config.dailyTargetRs || dailyPnl <= -config.dailyMaxLossRs || tradesCount >= config.maxTradesPerDay) {
          if (position) {
            const exitPrice = candle.close;
            const pnl = position === 'LONG' ? (exitPrice - entryPrice) * config.qty : (entryPrice - exitPrice) * config.qty;
            trades.push({ date, type: position, entry: entryPrice, exit: exitPrice, pnl, result: 'HALT_EXIT' });
            currentCapital += pnl;
            dailyPnl += pnl;
            position = null;
          }
          break;
        }

        if (position) {
          const close = candle.close;
          const high = candle.high;
          const low = candle.low;

          const currentSL = isStopLossTrailed ? entryPrice : stopLoss;

          if (position === 'LONG') {
            const targetPts = config.targetPoints || (config.symbol.toUpperCase().includes('BANK') ? 20 : 10);
            const stopLossPts = config.stopLossPoints || (config.symbol.toUpperCase().includes('BANK') ? 15 : 7);
            
            const futTargetPts = targetPts * 2;
            const futStopLossPts = stopLossPts * 2;
            const breakevenTrigger = futTargetPts / 2;

            if (!isStopLossTrailed && (high - entryPrice) >= breakevenTrigger) {
              isStopLossTrailed = true;
            }

            if (low <= currentSL) {
              const pnl = (currentSL - entryPrice) * config.qty;
              trades.push({ date, type: 'LONG', entry: entryPrice, exit: currentSL, pnl, result: 'SL' });
              currentCapital += pnl;
              dailyPnl += pnl;
              position = null;
            } else if (high >= target) {
              const pnl = (target - entryPrice) * config.qty;
              trades.push({ date, type: 'LONG', entry: entryPrice, exit: target, pnl, result: 'TARGET' });
              currentCapital += pnl;
              dailyPnl += pnl;
              position = null;
            }
          } else if (position === 'SHORT') {
            const targetPts = config.targetPoints || (config.symbol.toUpperCase().includes('BANK') ? 20 : 10);
            const stopLossPts = config.stopLossPoints || (config.symbol.toUpperCase().includes('BANK') ? 15 : 7);
            
            const futTargetPts = targetPts * 2;
            const futStopLossPts = stopLossPts * 2;
            const breakevenTrigger = futTargetPts / 2;

            if (!isStopLossTrailed && (entryPrice - low) >= breakevenTrigger) {
              isStopLossTrailed = true;
            }

            if (high >= currentSL) {
              const pnl = (entryPrice - currentSL) * config.qty;
              trades.push({ date, type: 'SHORT', entry: entryPrice, exit: currentSL, pnl, result: 'SL' });
              currentCapital += pnl;
              dailyPnl += pnl;
              position = null;
            } else if (low <= target) {
              const pnl = (entryPrice - target) * config.qty;
              trades.push({ date, type: 'SHORT', entry: entryPrice, exit: target, pnl, result: 'TARGET' });
              currentCapital += pnl;
              dailyPnl += pnl;
              position = null;
            }
          }

          if (position && hhmm >= 15 * 60 + 15) {
            const exitPrice = candle.close;
            const pnl = position === 'LONG' ? (exitPrice - entryPrice) * config.qty : (entryPrice - exitPrice) * config.qty;
            trades.push({ date, type: position, entry: entryPrice, exit: exitPrice, pnl, result: 'EOD' });
            currentCapital += pnl;
            dailyPnl += pnl;
            position = null;
          }
        }

        if (!position) {
          const rsi = this.calcRSI(candles.slice(0, globalIdx + 1), 14);
          const prevEma = emas[globalIdx - 1];
          const currEma = emas[globalIdx];

          if (prevEma !== null && currEma !== null) {
            const prevVwap = vwaps[globalIdx - 1] || prevEma;
            const currVwap = vwaps[globalIdx] || currEma;

            const bullishCrossover = prevEma <= prevVwap && currEma > currVwap;
            const bearishCrossover = prevEma >= prevVwap && currEma < currVwap;

            const targetPts = config.targetPoints || (config.symbol.toUpperCase().includes('BANK') ? 20 : 10);
            const stopLossPts = config.stopLossPoints || (config.symbol.toUpperCase().includes('BANK') ? 15 : 7);

            const futTargetPts = targetPts * 2;
            const futStopLossPts = stopLossPts * 2;

            if (bullishCrossover && rsi > 55) {
              position = 'LONG';
              entryPrice = candle.close;
              stopLoss = entryPrice - futStopLossPts;
              target = entryPrice + futTargetPts;
              isStopLossTrailed = false;
              tradesCount++;
            } else if (bearishCrossover && rsi < 45) {
              position = 'SHORT';
              entryPrice = candle.close;
              stopLoss = entryPrice + futStopLossPts;
              target = entryPrice - futStopLossPts;
              isStopLossTrailed = false;
              tradesCount++;
            }
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
