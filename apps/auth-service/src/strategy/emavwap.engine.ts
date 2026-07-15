import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';
import { EmaVwapCrossoverConfig } from './dto/strategy.dto';
import { autoSelectStock } from './smart-stock-picker';


interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StrategyState {
  executionId: string;
  config: EmaVwapCrossoverConfig;
  brokerAccountId: string;
  isPaperTrade: boolean;
  futureSymbol: string | null;
  futureExchange: string;
  lastEma: number | null;
  lastVwap: number | null;
  waitingForConfirmation: 'LONG' | 'SHORT' | null;
  confirmationHigh: number | null;
  confirmationLow: number | null;
  invalidationPrice: number | null;
  setupTimestamp: number | null;
  entryPrice: number | null;
  stopLossPrice: number | null;
  targetPrice: number | null;
  slOrderId: string | null;
  targetOrderId: string | null;
  entryTriggered: 'LONG' | 'SHORT' | null;
  optionSymbol: string | null;
  tradesPlacedToday: number;
  logs: string[];
}

@Injectable()
export class EmaVwapCrossoverEngine {
  private readonly logger = new Logger(EmaVwapCrossoverEngine.name);
  private readonly running = new Map<string, StrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) { }

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) return { executionId: this.running.get(strategyId)!.executionId };

    const strategy = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
      include: { brokerAccount: true },
    });
    if (!strategy) throw new Error('Strategy not found');

    const config: EmaVwapCrossoverConfig = JSON.parse(strategy.config);
    const execution = await this.prisma.strategyExecution.create({ data: { strategyId, status: 'RUNNING' } });

    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: true } });

    const state: StrategyState = {
      executionId: execution.id,
      config,
      brokerAccountId: strategy.brokerAccountId!,
      isPaperTrade: strategy.isPaperTrade,
      futureSymbol: null,
      futureExchange: 'NFO',
      lastEma: null,
      lastVwap: null,
      waitingForConfirmation: null,
      confirmationHigh: null,
      confirmationLow: null,
      invalidationPrice: null,
      setupTimestamp: null,
      entryPrice: null,
      stopLossPrice: null,
      targetPrice: null,
      slOrderId: null,
      targetOrderId: null,
      entryTriggered: null,
      optionSymbol: null,
      tradesPlacedToday: 0,
      logs: [],
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Strategy started — ${config.symbol}:${config.exchange}`);
    await this.persistLogs(state); // Persist immediately so UI shows "Started"

    const timer = setInterval(() => this.tick(strategyId).catch(e => this.logger.error(e)), 60_000);
    this.timers.set(strategyId, timer);

    this.initialCatchup(strategyId).then(() => {
      this.tick(strategyId).catch(e => this.logger.error(e));
    }).catch(e => this.logger.error(`Catch-up error: ${e.message}`));

    return { executionId: execution.id };
  }

  async stop(strategyId: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      clearInterval(this.timers.get(strategyId));
      this.timers.delete(strategyId);
      this.running.delete(strategyId);
      this.log(state, '⏹ Strategy stopped by user');
      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { status: 'STOPPED', stoppedAt: new Date(), logs: JSON.stringify(state.logs) },
      });
    }
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: false } });
  }

  private async stopWithStatus(strategyId: string, status: 'COMPLETED' | 'STOPPED', logReason: string): Promise<void> {
    const state = this.running.get(strategyId);
    if (state) {
      clearInterval(this.timers.get(strategyId));
      this.timers.delete(strategyId);
      this.running.delete(strategyId);
      this.log(state, logReason);
      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { status, stoppedAt: new Date(), logs: JSON.stringify(state.logs) },
      });
    }
    await this.prisma.strategy.update({ where: { id: strategyId }, data: { isActive: false } });
  }

  isRunning(strategyId: string): boolean {
    return this.running.has(strategyId);
  }

  getLogs(strategyId: string): string[] {
    return this.running.get(strategyId)?.logs || [];
  }

  getState(strategyId: string) {
    const s = this.running.get(strategyId);
    if (!s) return null;
    return {
      entryTriggered: s.entryTriggered,
      tradesToday: s.tradesPlacedToday,
      optionSymbol: s.optionSymbol,
    };
  }

  private async initialCatchup(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;
    const now = new Date();
    if (this.getIstHhmm(now) < 9 * 60 + 20) return;

    this.log(state, `🔍 Running catch-up for today's data...`);
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    try {
      if (state.config.symbol === 'AUTO') {
        const pick = await autoSelectStock(kite, state.config.targetRs, state.config.stopLossRs, this.logger);
        state.config.symbol = pick.symbol;
        state.config.exchange = pick.exchange;
        state.config.qty = pick.qty; // Update quantity
        this.log(state, `🎯 Auto-Selected Stock: ${state.config.symbol} (Catch-up) - Qty: ${state.config.qty}`);
      }

      const upper = state.config.symbol.toUpperCase().trim();
      const isIndex = upper.includes('NIFTY') || upper.includes('BANKNIFTY') || upper.includes('FINNIFTY') || upper.includes('MIDCPNIFTY') || upper.includes('SENSEX');
      if (isIndex && !state.futureSymbol) {
        const res = await this.findFutureSymbol(client, state.config.symbol);
        state.futureSymbol = res.symbol;
        state.futureExchange = res.exchange;
        this.log(state, `Resolved future contract for index: ${state.futureExchange}:${state.futureSymbol}`);
      }

      const candles = await this.fetchCandles(client, state.config, '5minute', now, state.futureSymbol || undefined, state.futureSymbol ? state.futureExchange : undefined);
      const emaPeriod = state.config.emaPeriod || 15;
      if (candles.length < emaPeriod + 2) return;

      const emas = this.calculateEMA(candles, emaPeriod);
      const vwaps = this.calculateVWAP(candles);

      const todayStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
      let optionCandles: Candle[] = [];
      let optionCandleSymbol = '';

      for (let i = emaPeriod + 1; i < candles.length; i++) {
        const currentCandle = candles[i];

        if (state.entryTriggered) {
          const candleTimeMs = currentCandle.date.getTime();
          let currentOptionPriceLow = 0;
          let currentOptionPriceHigh = 0;
          let hasOptionData = false;

          if (state.optionSymbol) {
            if (optionCandleSymbol !== state.optionSymbol) {
              const exchange = state.optionSymbol.includes('-') || state.optionSymbol.startsWith('NIFTY') || state.optionSymbol.startsWith('BANKNIFTY') ? 'NFO' : state.config.exchange;
              const rawData = await client.getHistoricalData(state.optionSymbol, exchange, '5minute', new Date(state.setupTimestamp || currentCandle.date), now);
              optionCandles = (rawData || []).map((c: any) => ({
                date: new Date(c.date),
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume
              }));
              optionCandleSymbol = state.optionSymbol;
            }

            const optCandle = optionCandles.find(c => c.date.getTime() === candleTimeMs);
            if (optCandle) {
              currentOptionPriceLow = optCandle.low;
              currentOptionPriceHigh = optCandle.high;
              hasOptionData = true;
            }
          } else {
            currentOptionPriceLow = currentCandle.low;
            currentOptionPriceHigh = currentCandle.high;
            hasOptionData = true;
          }

          if (hasOptionData) {
            if (currentOptionPriceLow <= state.stopLossPrice!) {
              await this.exitPositionHistorical(state, client, state.stopLossPrice!, 'SL', currentCandle.date);
              optionCandles = [];
              optionCandleSymbol = '';
              continue;
            }
            if (currentOptionPriceHigh >= state.targetPrice!) {
              await this.exitPositionHistorical(state, client, state.targetPrice!, 'TARGET', currentCandle.date);
              optionCandles = [];
              optionCandleSymbol = '';
              continue;
            }
          }
          continue;
        }

        // Only trigger catch-up trades if the crossover is from TODAY's candles
        const candleDateStr = currentCandle.date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
        if (candleDateStr !== todayStr) continue;

        // Crossover check on candle i-1
        const prevEma = emas[i - 2], currEma = emas[i - 1];
        const prevVwap = vwaps[i - 2], currVwap = vwaps[i - 1];
        if (prevEma === null || currEma === null || prevVwap === null || currVwap === null) continue;

        const crossoverLong = prevEma <= prevVwap && currEma > currVwap;
        const crossoverShort = prevEma >= prevVwap && currEma < currVwap;

        if (crossoverLong || crossoverShort) {
          const mother = candles[i - 1];
          const baby = candles[i];
          const isInsideCandle = baby.high <= mother.high && baby.low >= mother.low;

          if (isInsideCandle) {
            const triggerHigh = mother.high;
            const triggerLow = mother.low;

            // Scan subsequent candles to see if breakout happened
            for (let j = i + 1; j < Math.min(i + 4, candles.length); j++) {
              const checkCandle = candles[j];
              
              if (crossoverLong) {
                if (checkCandle.high > triggerHigh) {
                  this.log(state, `🚀 (Catch-up) Found past LONG Breakout at ${this.formatTime(new Date(checkCandle.date))}!`);
                  await this.placeTrade(state, client, account, 'BUY', mother.high, new Date(checkCandle.date), new Date(mother.date));
                  i = j; // Skip to breakout candle index
                  break;
                }
                if (checkCandle.low < triggerLow) {
                  break; // invalidated
                }
              } else {
                if (checkCandle.low < triggerLow) {
                  this.log(state, `🚀 (Catch-up) Found past SHORT Breakout at ${this.formatTime(new Date(checkCandle.date))}!`);
                  await this.placeTrade(state, client, account, 'SELL', mother.low, new Date(checkCandle.date), new Date(mother.date));
                  i = j; // Skip to breakout candle index
                  break;
                }
                if (checkCandle.high > triggerHigh) {
                  break; // invalidated
                }
              }
            }
          }
        }
      }
      if (!state.entryTriggered) this.log(state, `✅ Catch-up complete. No past signals found.`);
      await this.persistLogs(state);
    } catch (err) {
      this.log(state, `⚠ Catch-up failed: ${err.message}`);
      await this.persistLogs(state);
    }
  }

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;
    const now = new Date();
    const hhmm = this.getIstHhmm(now);
    if (hhmm < 9 * 60 + 15 || hhmm >= 15 * 60 + 30) return;

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account || !account.accessToken) return;

    const client = this.factory.createClient(account);
    const { config } = state;
    const kite = client['kite'];

    // ── Check Max Daily Trade Cap ───────────────────────────────────────────
    if (state.tradesPlacedToday >= config.maxTradesPerDay) {
      this.log(state, `⛔ Max daily trade cap (${config.maxTradesPerDay}) reached.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'COMPLETED', `⛔ Auto-Stopped: Max daily trade cap reached`);
      return;
    }

    // ── Phase 3: Monitor Active Position ─────────────────────────────────────
    if (state.entryTriggered) {
      await this.monitorPosition(state, client, kite);
      await this.persistLogs(state);
      return;
    }

    try {
      if (config.symbol === 'AUTO') {
        const pick = await autoSelectStock(kite, config.targetRs, config.stopLossRs, this.logger);
        config.symbol = pick.symbol;
        config.exchange = pick.exchange;
        config.qty = pick.qty; // Update quantity
        this.log(state, `🎯 Auto-Selected Stock: ${config.exchange}:${config.symbol} - Qty: ${config.qty}`);
      }

      const upper = config.symbol.toUpperCase().trim();
      const isIndex = upper.includes('NIFTY') || upper.includes('BANKNIFTY') || upper.includes('FINNIFTY') || upper.includes('MIDCPNIFTY') || upper.includes('SENSEX');
      if (isIndex && !state.futureSymbol) {
        const res = await this.findFutureSymbol(client, config.symbol);
        state.futureSymbol = res.symbol;
        state.futureExchange = res.exchange;
        this.log(state, `Resolved future contract for index: ${state.futureExchange}:${state.futureSymbol}`);
      }

      const candles = await this.fetchCandles(client, config, '5minute', now, state.futureSymbol || undefined, state.futureSymbol ? state.futureExchange : undefined);
      if (candles.length < 2) return;

      // ── Filter for closed candles only ─────────────────────────────────────
      const latestCandle = candles[candles.length - 1];
      const isClosed = (now.getTime() - latestCandle.date.getTime()) >= 5 * 60 * 1000;
      const closedCandles = isClosed ? candles : candles.slice(0, -1);

      if (closedCandles.length < 2) return;

      const emas = this.calculateEMA(closedCandles, config.emaPeriod || 15);
      const vwaps = this.calculateVWAP(closedCandles);

      const lastIdx = closedCandles.length - 1, prevIdx = closedCandles.length - 2;
      const currEma = emas[lastIdx], prevEma = emas[prevIdx];
      const currVwap = vwaps[lastIdx], prevVwap = vwaps[prevIdx];

      if (currEma === null || prevEma === null || currVwap === null || prevVwap === null) return;

      if (state.waitingForConfirmation) {
        // Expiration check: 3 candles (15 mins)
        const timeframeMs = 5 * 60 * 1000;
        const elapsed = now.getTime() - state.setupTimestamp!;
        if (elapsed > 3 * timeframeMs) {
          this.log(state, `⏳ Setup expired (3 candles passed without breakout). Resetting to scanning.`);
          state.waitingForConfirmation = null;
          state.confirmationHigh = null;
          state.confirmationLow = null;
          state.invalidationPrice = null;
          state.setupTimestamp = null;
          return;
        }

        const checkSymbol = state.futureSymbol || config.symbol;
        const checkExchange = state.futureSymbol ? state.futureExchange : config.exchange;
        const ltpData = await kite.getLTP([`${checkExchange}:${checkSymbol}`]);
        const ltp = ltpData[`${checkExchange}:${checkSymbol}`]?.last_price;
        if (ltp) {
          if (state.waitingForConfirmation === 'LONG') {
            if (ltp > state.confirmationHigh!) {
              this.log(state, `🚀 LONG Trigger! LTP ₹${ltp} > ₹${state.confirmationHigh}`);
              await this.placeTrade(state, client, account, 'BUY', ltp);
              state.waitingForConfirmation = null;
              state.confirmationHigh = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
            } else if (ltp < state.invalidationPrice!) {
              this.log(state, `❌ Setup invalidated! LTP ₹${ltp} broke below low ₹${state.invalidationPrice}`);
              state.waitingForConfirmation = null;
              state.confirmationHigh = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
            }
          } else if (state.waitingForConfirmation === 'SHORT') {
            if (ltp < state.confirmationLow!) {
              this.log(state, `🚀 SHORT Trigger! LTP ₹${ltp} < ₹${state.confirmationLow}`);
              await this.placeTrade(state, client, account, 'SELL', ltp);
              state.waitingForConfirmation = null;
              state.confirmationLow = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
            } else if (ltp > state.invalidationPrice!) {
              this.log(state, `❌ Setup invalidated! LTP ₹${ltp} broke above high ₹${state.invalidationPrice}`);
              state.waitingForConfirmation = null;
              state.confirmationLow = null;
              state.invalidationPrice = null;
              state.setupTimestamp = null;
            }
          }
        }
      }

      const crossoverLong = prevEma <= prevVwap && currEma > currVwap;
      const crossoverShort = prevEma >= prevVwap && currEma < currVwap;

      if ((crossoverLong || crossoverShort) && !state.entryTriggered) {
        const mother = closedCandles[prevIdx];
        const baby = closedCandles[lastIdx];
        const isInsideCandle = baby.high <= mother.high && baby.low >= mother.low;

        if (isInsideCandle) {
          if (crossoverLong) {
            state.waitingForConfirmation = 'LONG';
            state.confirmationHigh = mother.high;
            state.invalidationPrice = mother.low;
            state.setupTimestamp = baby.date.getTime();
            this.log(state, `🔔 Bullish crossover setup detected! Inside candle (Mother High: ₹${mother.high.toFixed(2)}, Low: ₹${mother.low.toFixed(2)}). Waiting for break above high...`);
          } else {
            state.waitingForConfirmation = 'SHORT';
            state.confirmationLow = mother.low;
            state.invalidationPrice = mother.high;
            state.setupTimestamp = baby.date.getTime();
            this.log(state, `🔔 Bearish crossover setup detected! Inside candle (Mother High: ₹${mother.high.toFixed(2)}, Low: ₹${mother.low.toFixed(2)}). Waiting for break below low...`);
          }
        }
      }
    } catch (err) { this.log(state, `❌ Tick error: ${err.message}`); }
    await this.persistLogs(state);
  }

  private async placeTrade(state: StrategyState, client: any, account: any, side: 'BUY' | 'SELL', triggerPrice: number, triggerTime?: Date, motherTime?: Date) {
    const { config } = state;
    const kite = client['kite'];
    let symbol = config.symbol, exchange = config.exchange, finalSide: 'BUY' | 'SELL' = side;
    const product = (config as any).product ?? 'MIS';

    if (config.isOptionBuyingOnly) {
      const type = side === 'BUY' ? 'CE' : 'PE';
      const optSym = await this.findOptionSymbol(client, state, triggerPrice, type, triggerTime);
      if (optSym) {
        symbol = optSym; exchange = 'NFO'; finalSide = 'BUY';
        if (triggerTime) {
          if (motherTime) {
            try {
              const optCandles = await client.getHistoricalData(symbol, exchange, '5minute', new Date(motherTime.getTime() - 5 * 60 * 1000), new Date(motherTime.getTime() + 5 * 60 * 1000));
              const motherOptCandle = optCandles.find((c: any) => new Date(c.date).getTime() === motherTime.getTime());
              if (motherOptCandle) {
                // Breakout entry is at the high of the mother option candle (option breakout level)
                triggerPrice = motherOptCandle.high;
                this.log(state, `💡 Selected Option Breakout Entry Price: ₹${triggerPrice.toFixed(2)} (High of Mother Option Candle at ${this.formatTime(motherTime)})`);
              } else {
                const histPrice = await this.getHistoricalOptionPrice(client, symbol, exchange, triggerTime);
                if (histPrice !== null) triggerPrice = histPrice;
              }
            } catch {
              const histPrice = await this.getHistoricalOptionPrice(client, symbol, exchange, triggerTime);
              if (histPrice !== null) triggerPrice = histPrice;
            }
          } else {
            const histPrice = await this.getHistoricalOptionPrice(client, symbol, exchange, triggerTime);
            if (histPrice !== null) {
              triggerPrice = histPrice;
            } else {
              this.log(state, `⚠ Could not fetch historical option price for ${symbol} at ${this.formatTime(triggerTime)}. Using current LTP.`);
              const q = await kite.getLTP([`NFO:${symbol}`]);
              if (q[`NFO:${symbol}`]?.last_price) triggerPrice = q[`NFO:${symbol}`].last_price;
            }
          }
        } else {
          const q = await kite.getLTP([`NFO:${symbol}`]);
          if (q[`NFO:${symbol}`]?.last_price) triggerPrice = q[`NFO:${symbol}`].last_price;
        }
      } else {
        this.log(state, `⚠ No option found. Trading equity directly.`);
      }
    } else {
      this.log(state, `📈 Equity mode — trading ${exchange}:${symbol} directly`);
    }

    const entry = this.roundTick(triggerPrice);
    const sl = finalSide === 'BUY' ? this.roundTick(entry - (config.stopLossRs / config.qty)) : this.roundTick(entry + (config.stopLossRs / config.qty));
    const tgt = finalSide === 'BUY' ? this.roundTick(entry + (config.targetRs / config.qty)) : this.roundTick(entry - (config.targetRs / config.qty));

    this.log(state, `📋 Placing: ${symbol} — Entry: ₹${entry.toFixed(2)} | SL: ₹${sl.toFixed(2)} | Target: ₹${tgt.toFixed(2)}`);
    try {
      const entryId = state.isPaperTrade
        ? `PAPER_${Math.random().toString(36).substring(7).toUpperCase()}`
        : await client.placeOrder({ symbol, exchange, product, qty: config.qty, side: finalSide, orderType: 'LIMIT', price: entry });
      this.log(state, `✅ Entry: ${entryId}`);

      // Track order in DB
      await this.trackOrderInDB(state, finalSide, symbol, exchange, config.qty, entry, entryId, triggerTime);

      const exitSide = finalSide === 'BUY' ? 'SELL' : 'BUY';
      let slOrderId: string | null = null;
      let targetOrderId: string | null = null;

      if (!state.isPaperTrade) {
        slOrderId = await client.placeOrder({ symbol, exchange, product, qty: config.qty, side: exitSide, orderType: 'SL', price: sl, triggerPrice: sl })
          .catch((e: any) => { this.log(state, `❌ SL Failed: ${e.message}`); return null; });
        targetOrderId = await client.placeOrder({ symbol, exchange, product, qty: config.qty, side: exitSide, orderType: 'LIMIT', price: tgt })
          .catch((e: any) => { this.log(state, `❌ Target Failed: ${e.message}`); return null; });
      }

      state.entryTriggered = side === 'BUY' ? 'LONG' : 'SHORT';
      state.optionSymbol = symbol;
      state.entryPrice = entry;
      state.stopLossPrice = sl;
      state.targetPrice = tgt;
      state.slOrderId = slOrderId;
      state.targetOrderId = targetOrderId;
      state.setupTimestamp = triggerTime ? triggerTime.getTime() : Date.now();

      if (!state.isPaperTrade && (!slOrderId || !targetOrderId)) {
        this.log(state, `⚠ Warning: Failed to place SL or Target order at broker. Active monitoring will try to exit if needed.`);
      }
    } catch (err) { this.log(state, `❌ Placement failed: ${err.message}`); }
  }

  private async monitorPosition(state: StrategyState, client: any, kite: any) {
    if (!state.optionSymbol) return;

    try {
      if (state.isPaperTrade) {
        const symbol = state.optionSymbol;
        const exchange = symbol.includes('-') || symbol.startsWith('NIFTY') || symbol.startsWith('BANKNIFTY') ? 'NFO' : state.config.exchange;
        const key = `${exchange}:${symbol}`;
        const ltpData = await kite.getLTP([key]);
        const currentPrice = ltpData[key]?.last_price;
        if (!currentPrice) return;

        const pnlPoints = currentPrice - state.entryPrice!;
        const pnlRs = pnlPoints * state.config.qty;

        this.log(state, `👀 Price ${symbol}: ₹${currentPrice.toFixed(2)} | Target: ₹${state.targetPrice!.toFixed(2)} | SL: ₹${state.stopLossPrice!.toFixed(2)} | P&L: ₹${pnlRs.toFixed(2)}`);

        if (currentPrice <= state.stopLossPrice!) {
          this.log(state, `🛑 Stop Loss Hit at ₹${currentPrice.toFixed(2)}`);
          await this.exitPosition(state, client, currentPrice, 'SL');
        } else if (currentPrice >= state.targetPrice!) {
          this.log(state, `🎯 Target Hit at ₹${currentPrice.toFixed(2)}`);
          await this.exitPosition(state, client, currentPrice, 'TARGET');
        }
      } else {
        const orders = await kite.getOrders();
        const slOrder = orders.find((o: any) => o.order_id === state.slOrderId);
        const targetOrder = orders.find((o: any) => o.order_id === state.targetOrderId);

        if (slOrder && slOrder.status === 'COMPLETE') {
          const avgPrice = Number(slOrder.average_price) || state.stopLossPrice!;
          this.log(state, `🛑 Stop Loss Order filled at ₹${avgPrice.toFixed(2)}`);
          if (state.targetOrderId) {
            await client.cancelOrder(state.targetOrderId).catch(() => {});
          }
          await this.exitPosition(state, client, avgPrice, 'SL');
        } else if (targetOrder && targetOrder.status === 'COMPLETE') {
          const avgPrice = Number(targetOrder.average_price) || state.targetPrice!;
          this.log(state, `🎯 Target Order filled at ₹${avgPrice.toFixed(2)}`);
          if (state.slOrderId) {
            await client.cancelOrder(state.slOrderId).catch(() => {});
          }
          await this.exitPosition(state, client, avgPrice, 'TARGET');
        } else if (slOrder && (slOrder.status === 'REJECTED' || slOrder.status === 'CANCELLED')) {
          this.log(state, `⚠ Stop Loss order was ${slOrder.status}! Checking position status.`);
          if (state.targetOrderId) {
            await client.cancelOrder(state.targetOrderId).catch(() => {});
          }
          const symbol = state.optionSymbol;
          const exchange = symbol.includes('-') || symbol.startsWith('NIFTY') || symbol.startsWith('BANKNIFTY') ? 'NFO' : state.config.exchange;
          const key = `${exchange}:${symbol}`;
          const ltpData = await kite.getLTP([key]);
          const currentPrice = ltpData[key]?.last_price || state.stopLossPrice!;
          await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
        } else if (targetOrder && (targetOrder.status === 'REJECTED' || targetOrder.status === 'CANCELLED')) {
          this.log(state, `⚠ Target order was ${targetOrder.status}! Checking position status.`);
          if (state.slOrderId) {
            await client.cancelOrder(state.slOrderId).catch(() => {});
          }
          const symbol = state.optionSymbol;
          const exchange = symbol.includes('-') || symbol.startsWith('NIFTY') || symbol.startsWith('BANKNIFTY') ? 'NFO' : state.config.exchange;
          const key = `${exchange}:${symbol}`;
          const ltpData = await kite.getLTP([key]);
          const currentPrice = ltpData[key]?.last_price || state.targetPrice!;
          await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
        }
      }
    } catch (e) {
      this.log(state, `⚠ Position monitor error: ${e.message}`);
    }
  }

  private async exitPosition(state: StrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET' | 'FORCE_CLOSE') {
    const { config } = state;
    const symbol = state.optionSymbol!;
    const exchange = symbol.includes('-') || symbol.startsWith('NIFTY') || symbol.startsWith('BANKNIFTY') ? 'NFO' : config.exchange;
    const exitSide = config.isOptionBuyingOnly ? 'SELL' : (state.entryTriggered === 'LONG' ? 'SELL' : 'BUY');
    const qty = config.qty;

    try {
      let exitOrderId = '';
      if (state.isPaperTrade) {
        exitOrderId = `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`;
      } else {
        if (reason === 'FORCE_CLOSE') {
          exitOrderId = await client.placeOrder({ symbol, exchange, product: config.product ?? 'MIS', qty, side: exitSide, orderType: 'MARKET' });
          this.log(state, `✅ Live Force Exit Order placed: ${exitOrderId}`);
        } else {
          exitOrderId = reason === 'SL' ? state.slOrderId! : state.targetOrderId!;
        }
      }

      await this.trackOrderInDB(state, exitSide, symbol, exchange, qty, exitPrice, exitOrderId);
      state.tradesPlacedToday++;

      state.entryTriggered = null;
      state.optionSymbol = null;
      state.entryPrice = null;
      state.stopLossPrice = null;
      state.targetPrice = null;
      state.slOrderId = null;
      state.targetOrderId = null;
      state.waitingForConfirmation = null;
      state.confirmationHigh = null;
      state.confirmationLow = null;
      state.invalidationPrice = null;
      state.setupTimestamp = null;
    } catch (e) {
      this.log(state, `❌ Exit execution failed: ${e.message}`);
    }
  }

  private async exitPositionHistorical(state: StrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET', timestamp: Date) {
    const { config } = state;
    const symbol = state.optionSymbol || config.symbol;
    const exchange = symbol.includes('-') || symbol.startsWith('NIFTY') || symbol.startsWith('BANKNIFTY') ? 'NFO' : config.exchange;
    const exitSide = config.isOptionBuyingOnly ? 'SELL' : (state.entryTriggered === 'LONG' ? 'SELL' : 'BUY');
    const qty = config.qty;

    try {
      const exitOrderId = `PAPER_EXIT_${Math.random().toString(36).substring(7).toUpperCase()}`;
      this.log(state, `🏁 (Catch-up) Paper trade closed (${reason}) at ₹${exitPrice.toFixed(2)}`);
      
      // Track exit order in DB
      await this.trackOrderInDB(state, exitSide, symbol, exchange, qty, exitPrice, exitOrderId, timestamp);
      state.tradesPlacedToday++;

      state.entryTriggered = null;
      state.optionSymbol = null;
      state.entryPrice = null;
      state.stopLossPrice = null;
      state.targetPrice = null;
      state.slOrderId = null;
      state.targetOrderId = null;
      state.waitingForConfirmation = null;
      state.confirmationHigh = null;
      state.confirmationLow = null;
      state.invalidationPrice = null;
      state.setupTimestamp = null;
    } catch (e) {
      this.log(state, `❌ Historical exit failed: ${e.message}`);
    }
  }

  private async trackOrderInDB(state: StrategyState, side: 'BUY' | 'SELL', symbol: string, exchange: string, qty: number, price: number, orderId: string, createdAt?: Date) {
    try {
      const exec = await this.prisma.strategyExecution.findUnique({
        where: { id: state.executionId },
        include: { strategy: true }
      });
      if (!exec) return;

      await this.prisma.order.create({
        data: {
          userId: exec.strategy.userId,
          brokerAccountId: state.brokerAccountId,
          executionId: state.executionId,
          symbol,
          exchange,
          side: side as any,
          orderType: 'LIMIT',
          productType: (state.config as any).product ?? 'MIS',
          qty,
          price,
          status: 'COMPLETE',
          brokerOrderId: orderId,
          isPaperTrade: state.isPaperTrade,
          ...(createdAt ? { createdAt } : {}),
        } as any
      });
    } catch (e) {
      this.logger.error(`Failed to track order in DB: ${e.message}`);
    }
  }

  private calculateEMA(candles: Candle[], period: number) {
    const emas: (number | null)[] = new Array(candles.length).fill(null);
    if (candles.length < period) return emas;
    let sum = 0;
    for (let i = 0; i < period; i++) sum += candles[i].close;
    let prev = sum / period; emas[period - 1] = prev;
    const mult = 2 / (period + 1);
    for (let i = period; i < candles.length; i++) {
      const ema = (candles[i].close - prev) * mult + prev;
      emas[i] = ema; prev = ema;
    }
    return emas;
  }

  private calculateVWAP(candles: Candle[]) {
    const vwaps: (number | null)[] = new Array(candles.length).fill(null);
    let cpv = 0, cv = 0;
    let lastDateStr = '';
    for (let i = 0; i < candles.length; i++) {
      const dateStr = candles[i].date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
      if (dateStr !== lastDateStr) {
        // Reset VWAP accumulation at the start of each new day
        cpv = 0;
        cv = 0;
        lastDateStr = dateStr;
      }
      cpv += ((candles[i].high + candles[i].low + candles[i].close) / 3) * candles[i].volume;
      cv += candles[i].volume; vwaps[i] = cv === 0 ? candles[i].close : cpv / cv;
    }
    return vwaps;
  }

  private async fetchCandles(client: any, config: any, interval: string, now: Date, symbol?: string, exchange?: string): Promise<Candle[]> {
    const istDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    const from = new Date(`${istDateStr} 09:15:00 GMT+0530`);
    from.setDate(from.getDate() - 5); // Go back 5 days to ensure enough historical candles
    const sym = symbol || config.symbol;
    const exch = exchange || config.exchange;
    const data = await client.getHistoricalData(sym, exch, interval, from, now);
    return (data || []).map((c: any) => ({ date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
  }

  private async getHistoricalOptionPrice(client: any, symbol: string, exchange: string, timestamp: Date): Promise<number | null> {
    try {
      const from = new Date(timestamp.getTime() - 10 * 60 * 1000);
      const to = new Date(timestamp.getTime() + 10 * 60 * 1000);
      const data = await client.getHistoricalData(symbol, exchange, '5minute', from, to);
      if (!data || data.length === 0) return null;

      const targetTimeMs = timestamp.getTime();
      const match = data.find((c: any) => new Date(c.date).getTime() === targetTimeMs);
      if (match) {
        return match.close;
      }
      
      let closest = data[0];
      let minDiff = Math.abs(new Date(closest.date).getTime() - targetTimeMs);
      for (const c of data) {
        const diff = Math.abs(new Date(c.date).getTime() - targetTimeMs);
        if (diff < minDiff) {
          minDiff = diff;
          closest = c;
        }
      }
      return closest.close;
    } catch (e) {
      this.logger.error(`Error getting historical option price for ${symbol} at ${timestamp.toISOString()}: ${e.message}`);
      return null;
    }
  }

  private async findOptionSymbol(client: any, state: StrategyState, spotPrice: number, type: 'CE' | 'PE', triggerTime?: Date): Promise<string | null> {
    const { config } = state;
    const upper = config.symbol.toUpperCase().trim();
    const isIndex = upper.includes('NIFTY') || upper.includes('BANKNIFTY') || upper.includes('FINNIFTY') || upper.includes('MIDCPNIFTY') || upper.includes('SENSEX');

    if (!isIndex) return null; // No options for stocks in EMA-VWAP

    let underlying: string;
    if (upper.includes('BANKNIFTY') || upper === 'BANKNIFTY') underlying = 'BANKNIFTY';
    else if (upper === 'NIFTY 50' || upper === 'NIFTY') underlying = 'NIFTY';
    else if (upper.includes('FINNIFTY')) underlying = 'FINNIFTY';
    else if (upper.includes('MIDCPNIFTY')) underlying = 'MIDCPNIFTY';
    else if (upper.includes('SENSEX')) underlying = 'SENSEX';
    else underlying = upper;

    const exchange = underlying === 'SENSEX' ? 'BFO' : 'NFO';
    const segment = underlying === 'SENSEX' ? 'BFO-OPT' : 'NFO-OPT';

    const instruments = await client.getInstruments(exchange);
    const options = instruments.filter((i: any) => i.name === underlying && i.instrument_type === type && i.segment === segment);
    if (options.length === 0) {
      this.log(state, `⚠ No ${type} options found for ${underlying}`);
      return null;
    }

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); // "YYYY-MM-DD"

    const getExpiryStr = (expiry: any): string => {
      if (!expiry) return '';
      const d = new Date(expiry);
      if (isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    };

    const uniqueExpiries = Array.from(new Set(options.map((i: any) => getExpiryStr(i.expiry))))
      .filter(exp => exp !== '' && exp >= todayStr);

    const sortedExpiries = uniqueExpiries.sort();

    if (sortedExpiries.length === 0) {
      this.log(state, `❌ No future expiries found for ${underlying}.`);
      return null;
    }

    const nearestExpiry = sortedExpiries[0];

    const filteredOptions = options.filter((i: any) => getExpiryStr(i.expiry) === nearestExpiry);

    // ── Option 1: Premium range (batched LTP or historical candles) ────────────────────
    if (config.minPremium && config.maxPremium) {
      this.log(state, `🔍 Searching ${type} in premium range ₹${config.minPremium}-₹${config.maxPremium}...`);
      const step = (underlying === 'NIFTY' || underlying === 'FINNIFTY') ? 50 : underlying === 'MIDCPNIFTY' ? 25 : 100;
      const atm = Math.round(spotPrice / step) * step;
      const candidateStrikes = [atm, atm + step, atm - step, atm + 2 * step, atm - 2 * step, atm + 3 * step, atm - 3 * step, atm + 4 * step, atm - 4 * step];

      if (triggerTime) {
        for (const strike of candidateStrikes) {
          const opt = filteredOptions.find((i: any) => Number(i.strike) === strike);
          if (!opt) continue;

          const price = await this.getHistoricalOptionPrice(client, opt.tradingsymbol, exchange, triggerTime);
          if (price !== null && price >= config.minPremium && price <= config.maxPremium) {
            this.log(state, `🎯 Found ${opt.tradingsymbol} in premium range (historical check)`);
            return opt.tradingsymbol;
          }
        }
        this.log(state, `⚠ No option in range. Falling back to ATM.`);
      } else {
        const allSymbols = filteredOptions.map((i: any) => `${exchange}:${i.tradingsymbol}`);
        const quotes: Record<string, any> = {};
        for (let i = 0; i < allSymbols.length; i += 200) {
          try { Object.assign(quotes, await client.getLTP(allSymbols.slice(i, i + 200))); }
          catch (e) { this.log(state, `⚠ LTP batch failed: ${e.message}`); }
        }

        for (const strike of candidateStrikes) {
          const opt = filteredOptions.find((i: any) => Number(i.strike) === strike);
          if (!opt) continue;

          const ltp = quotes[`${exchange}:${opt.tradingsymbol}`]?.last_price;
          if (ltp && ltp >= config.minPremium && ltp <= config.maxPremium) {
            this.log(state, `🎯 Found ${opt.tradingsymbol} in premium range`);
            return opt.tradingsymbol;
          }
        }
        this.log(state, `⚠ No option in range. Falling back to ATM.`);
      }
    }

    // ── Option 2: ATM strike ─────────────────────────────────────────
    const step = (underlying === 'NIFTY' || underlying === 'FINNIFTY') ? 50 : underlying === 'MIDCPNIFTY' ? 25 : 100;
    const atm = Math.round(spotPrice / step) * step;
    const match = filteredOptions.find((i: any) => Number(i.strike) === atm);
    if (match) { this.log(state, `🎯 ATM Strike: ${match.tradingsymbol}`); return match.tradingsymbol; }

    // ── Option 3: Closest available strike (handles stocks & odd steps) ──────
    let closest: any = null, closestD = Infinity;
    for (const opt of filteredOptions) {
      const d = Math.abs(Number(opt.strike) - spotPrice);
      if (d < closestD) { closestD = d; closest = opt; }
    }
    if (closest) { this.log(state, `🎯 Closest strike: ${closest.tradingsymbol}`); return closest.tradingsymbol; }
    return null;
  }

  private getIstHhmm(date: Date): number {
    const istStr = date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hour12: false });
    const parts = istStr.split(':').map(Number);
    return parts[0] * 60 + (parts[1] || 0);
  }

  private roundTick(p: number) { return Math.round(p / 0.05) * 0.05; }
  private formatTime(d: Date) { return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
  private log(state: StrategyState, msg: string) { const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); state.logs.push(`[${ts}] ${msg}`); this.logger.log(`[${state.executionId}] ${msg}`); }
  private async persistLogs(state: StrategyState) { await this.prisma.strategyExecution.update({ where: { id: state.executionId }, data: { logs: JSON.stringify(state.logs.slice(-200)) } }); }
  private async findFutureSymbol(client: any, baseSymbol: string): Promise<{ symbol: string; exchange: string }> {
    const upperSymbol = baseSymbol.toUpperCase().trim();
    const isSensex = upperSymbol === 'SENSEX' || upperSymbol === 'BSE SENSEX';
    const exchange = isSensex ? 'BFO' : 'NFO';
    const segment = isSensex ? 'BFO-FUT' : 'NFO-FUT';
    let underlying = isSensex ? 'SENSEX' : upperSymbol.includes('BANK') ? 'BANKNIFTY' : (upperSymbol.includes('NIFTY 50') || upperSymbol === 'NIFTY') ? 'NIFTY' : upperSymbol.includes('FIN') ? 'FINNIFTY' : upperSymbol.includes('MID') ? 'MIDCPNIFTY' : upperSymbol;

    const instruments = await client.getInstruments(exchange);
    const futures = instruments.filter((i: any) => i.name === underlying && i.instrument_type === 'FUT' && i.segment === segment);
    if (futures.length === 0) throw new Error(`No ${exchange} future for ${baseSymbol}`);
    const sorted = futures.sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
    return { symbol: sorted[0].tradingsymbol, exchange };
  }

  private resetDailyState(state: StrategyState) {
    state.futureSymbol = null;
    state.futureExchange = 'NFO';
    state.entryTriggered = null;
    state.optionSymbol = null;
    state.tradesPlacedToday = 0;
    state.waitingForConfirmation = null;
    state.confirmationHigh = null;
    state.confirmationLow = null;
    state.invalidationPrice = null;
    state.setupTimestamp = null;
    state.entryPrice = null;
    state.stopLossPrice = null;
    state.targetPrice = null;
    state.slOrderId = null;
    state.targetOrderId = null;
  }
}
