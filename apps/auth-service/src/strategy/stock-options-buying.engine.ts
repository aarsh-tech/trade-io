import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';
import { StockOptionsBuyingConfig } from './dto/strategy.dto';

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
  config: StockOptionsBuyingConfig;
  brokerAccountId: string;
  isPaperTrade: boolean;
  
  // Strategy State
  stateType: 'SCANNING' | 'WAITING_FOR_TRIGGER' | 'ACTIVE_POSITION';
  signalSide: 'CALL' | 'PUT' | null;
  optionSymbol: string | null;
  entryTriggerPrice: number | null;
  stopLossPrice: number | null;
  targetPrice: number | null;
  positionQty: number;
  entryOrderId: string | null;
  lotSize: number;
  
  // Prevent duplicate execution on the same inside candle setup
  lastProcessedTimestamp: number;
  tradesPlacedToday: number;
  logs: string[];
}

@Injectable()
export class StockOptionsBuyingEngine {
  private readonly logger = new Logger(StockOptionsBuyingEngine.name);
  private readonly running = new Map<string, StrategyState>();
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) {}

  async start(strategyId: string): Promise<{ executionId: string }> {
    if (this.running.has(strategyId)) {
      return { executionId: this.running.get(strategyId)!.executionId };
    }

    const strategy = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
      include: { brokerAccount: true },
    });
    if (!strategy) throw new Error('Strategy not found');

    let brokerAccount = strategy.brokerAccount;
    if (!brokerAccount) {
      brokerAccount = await this.prisma.brokerAccount.findFirst({
        where: { userId: strategy.userId, isActive: true },
      });
      if (!brokerAccount) throw new Error('No active broker account found');
      await this.prisma.strategy.update({
        where: { id: strategyId },
        data: { brokerAccountId: brokerAccount.id },
      });
    }

    const config: StockOptionsBuyingConfig = JSON.parse(strategy.config);
    const execution = await this.prisma.strategyExecution.create({
      data: { strategyId, status: 'RUNNING' },
    });
    await this.prisma.strategy.update({
      where: { id: strategyId },
      data: { isActive: true },
    });

    const state: StrategyState = {
      executionId: execution.id,
      config,
      brokerAccountId: brokerAccount.id,
      isPaperTrade: strategy.isPaperTrade,
      stateType: 'SCANNING',
      signalSide: null,
      optionSymbol: null,
      entryTriggerPrice: null,
      stopLossPrice: null,
      targetPrice: null,
      positionQty: 0,
      entryOrderId: null,
      lotSize: 0,
      lastProcessedTimestamp: 0,
      tradesPlacedToday: 0,
      logs: [],
    };

    this.running.set(strategyId, state);
    this.log(state, `▶ Stock Options Buying strategy started — Stock: ${config.symbol} | Capital: ₹${config.maxCapital}`);
    await this.persistLogs(state);

    // Tick every 30 seconds for checking crossovers & monitoring positions
    const timer = setInterval(
      () => this.tick(strategyId).catch(e => this.logger.error(e)),
      30_000,
    );
    this.timers.set(strategyId, timer);
    this.tick(strategyId).catch(e => this.logger.error(e));

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

  isRunning(strategyId: string) { return this.running.has(strategyId); }
  getLogs(strategyId: string): string[] { return this.running.get(strategyId)?.logs ?? []; }

  getState(strategyId: string) {
    const s = this.running.get(strategyId);
    if (!s) return null;
    return {
      symbol: s.config.symbol,
      optionSymbol: s.optionSymbol,
      stateType: s.stateType,
      signalSide: s.signalSide,
      entryTrigger: s.entryTriggerPrice,
      stopLoss: s.stopLossPrice,
      target: s.targetPrice,
      lotSize: s.lotSize,
      tradesToday: s.tradesPlacedToday,
    };
  }

  // ─── Main tick loop ──────────────────────────────────────────────────────────

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const h = ist.getHours();
    const m = ist.getMinutes();
    const hhmm = h * 60 + m;

    const MARKET_OPEN = 9 * 60 + 15;
    const MARKET_CLOSE = 15 * 60 + 30;

    // Reset daily logs & trade counter before market opens
    if (hhmm < MARKET_OPEN) {
      this.resetDailyState(state);
      await this.persistLogs(state);
      return;
    }

    // Auto close positions at 15:15 IST
    if (hhmm >= 15 * 60 + 15 && state.stateType !== 'SCANNING') {
      await this.forceExit(state);
      await this.persistLogs(state);
      return;
    }

    if (hhmm >= MARKET_CLOSE) {
      await this.persistLogs(state);
      return;
    }

    // Check Max Trades limit
    if (state.tradesPlacedToday >= state.config.maxTradesPerDay) {
      this.log(state, `⛔ Max ${state.config.maxTradesPerDay} daily trades reached. Auto-stopping.`);
      await this.persistLogs(state);
      await this.stopWithStatus(strategyId, 'COMPLETED', `⛔ Stopped: Daily trade limit reached.`);
      return;
    }

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (!account?.accessToken) {
      this.log(state, '⚠ No active broker session');
      await this.persistLogs(state);
      return;
    }

    const client = this.factory.createClient(account);
    const kite = client['kite'];

    // ── Phase 1: Monitor Active Position ─────────────────────────────────────
    if (state.stateType === 'ACTIVE_POSITION') {
      await this.monitorPosition(state, client, kite);
      await this.persistLogs(state);
      return;
    }

    // ── Phase 2: Check for Crossover & Inside Candle breakout ────────────────
    if (state.stateType === 'SCANNING') {
      await this.scanForSetup(state, client, kite);
    } else if (state.stateType === 'WAITING_FOR_TRIGGER') {
      await this.checkBreakoutTrigger(state, client, kite);
    }

    await this.persistLogs(state);
  }

  // ─── Phase 2A: Scan for Inside Candle Setup ──────────────────────────────────

  private async scanForSetup(state: StrategyState, client: any, kite: any) {
    try {
      const interval = state.config.timeframe === '5min' ? '5minute' : '15minute';
      const candles = await this.fetchCandles(client, state.config.symbol, state.config.exchange, interval);
      const emaPeriod = state.config.emaPeriod ?? 15;

      if (candles.length < emaPeriod + 2) {
        this.log(state, `⏳ Insufficient candles (need ${emaPeriod + 2}, got ${candles.length})`);
        return;
      }

      // Check if last candle is closed
      const now = new Date();
      const timeframeMs = state.config.timeframe === '5min' ? 5 * 60_000 : 15 * 60_000;
      const latestCandle = candles[candles.length - 1];
      const isClosed = (now.getTime() - latestCandle.date.getTime()) >= timeframeMs;
      const closedCandles = isClosed ? candles : candles.slice(0, -1);

      if (closedCandles.length < emaPeriod + 2) return;

      const n = closedCandles.length - 1;
      const lastClosedCandleTime = closedCandles[n].date.getTime();

      // Prevent recalculating the same closed candles
      if (lastClosedCandleTime <= state.lastProcessedTimestamp) return;

      const emas = this.calculateEMA(closedCandles, emaPeriod);
      const vwaps = this.calculateVWAP(closedCandles);

      // We look at:
      // Index n-1: Crossover Candle (which becomes the Mother Candle if next is inside)
      // Index n: Baby Candle (Inside Candle)
      const prevEma = emas[n - 2];
      const currEma = emas[n - 1];
      const prevVwap = vwaps[n - 2];
      const currVwap = vwaps[n - 1];

      if (prevEma === null || currEma === null || prevVwap === null || currVwap === null) return;

      const bullishCrossover = prevEma <= prevVwap && currEma > currVwap;
      const bearishCrossover = prevEma >= prevVwap && currEma < currVwap;

      if (bullishCrossover || bearishCrossover) {
        const mother = closedCandles[n - 1];
        const baby = closedCandles[n];

        // Inside candle condition: baby high <= mother high AND baby low >= mother low
        const isInsideCandle = baby.high <= mother.high && baby.low >= mother.low;

        if (isInsideCandle) {
          const side = bullishCrossover ? 'CALL' : 'PUT';
          this.log(state, `✨ Inside Candle Detected! Mother candle high: ₹${mother.high.toFixed(2)}, low: ₹${mother.low.toFixed(2)} | Crossover: ${side}`);
          state.lastProcessedTimestamp = lastClosedCandleTime;
          await this.setupBreakoutTrigger(state, client, kite, side, mother.date);
        }
      }
    } catch (e) {
      this.log(state, `❌ Scanning error: ${e.message}`);
    }
  }

  // ─── Setup Trigger Levels on Option ──────────────────────────────────────────

  private async setupBreakoutTrigger(
    state: StrategyState, client: any, kite: any,
    side: 'CALL' | 'PUT', motherTimestamp: Date
  ) {
    try {
      const ltpData = await kite.getLTP([`${state.config.exchange}:${state.config.symbol}`]);
      const spotPrice = ltpData[`${state.config.exchange}:${state.config.symbol}`]?.last_price;
      if (!spotPrice) {
        this.log(state, `❌ Failed to fetch spot price for option strike selection`);
        return;
      }

      // 1. Resolve ATM option contract
      const optionSymbol = await this.findATMOption(client, state.config.symbol, spotPrice, side === 'CALL' ? 'CE' : 'PE');
      if (!optionSymbol) {
        this.log(state, `❌ Could not find active option symbol for ${state.config.symbol}`);
        return;
      }

      // 2. Fetch Option candles to find the Mother Candle's High/Low
      const interval = state.config.timeframe === '5min' ? '5minute' : '15minute';
      const optCandles = await this.fetchCandles(client, optionSymbol, 'NFO', interval);
      const motherOptCandle = optCandles.find(c => c.date.getTime() === motherTimestamp.getTime());

      if (!motherOptCandle) {
        this.log(state, `⚠ Option candle missing at mother timestamp. Skipping illiquid strike ${optionSymbol}`);
        return;
      }

      const H_om = motherOptCandle.high;
      const L_om = motherOptCandle.low;

      // 3. Calculate trigger prices
      const entryPrice = this.roundTick(H_om + (state.config.triggerOffset ?? 0.50));
      const slPrice = this.roundTick(L_om);
      const risk = entryPrice - slPrice;

      if (risk <= 0) {
        this.log(state, `❌ Invalid dynamic risk (SL: ₹${slPrice} >= Entry: ₹${entryPrice})`);
        return;
      }

      const targetPrice = this.roundTick(entryPrice + risk * (state.config.riskRewardRatio ?? 2));
      
      // Get Lot Size
      const instruments = await client.getInstruments('NFO');
      const optInst = instruments.find((i: any) => i.tradingsymbol === optionSymbol);
      const lotSize = optInst?.lot_size ?? 1;

      // 4. Capital Check
      const requiredCapital = entryPrice * lotSize * (state.config.lots ?? 1);
      if (requiredCapital > state.config.maxCapital) {
        this.log(state, `❌ Capital check failed: 1 lot of ${optionSymbol} needs ₹${requiredCapital.toFixed(2)}, which exceeds limit ₹${state.config.maxCapital}`);
        return;
      }

      // 5. Update State & Place Trigger Order
      state.optionSymbol = optionSymbol;
      state.signalSide = side;
      state.entryTriggerPrice = entryPrice;
      state.stopLossPrice = slPrice;
      state.targetPrice = targetPrice;
      state.lotSize = lotSize;
      state.positionQty = lotSize * (state.config.lots ?? 1);

      this.log(state, `🎯 Resolved Target Strike: NFO:${optionSymbol} (Lot Size: ${lotSize})`);
      this.log(state, `📋 Entry Trigger: ₹${entryPrice.toFixed(2)} | SL (Mother Low): ₹${slPrice.toFixed(2)} | Target: ₹${targetPrice.toFixed(2)} (RR 1:${state.config.riskRewardRatio})`);

      if (state.isPaperTrade) {
        state.entryOrderId = `PAPER_${Date.now().toString(36).toUpperCase()}`;
        state.stateType = 'WAITING_FOR_TRIGGER';
        this.log(state, `📝 Simulated Breakout Trigger order placed. Waiting for break above ₹${entryPrice}...`);
      } else {
        const protectionPrice = this.roundTick(entryPrice * (1 + (state.config.protectionBufferPct ?? 10) / 100));
        
        const params: OrderParams = {
          symbol: optionSymbol,
          exchange: 'NFO',
          side: 'BUY',
          orderType: 'SL',
          price: protectionPrice,
          triggerPrice: entryPrice,
          product: state.config.product ?? 'MIS',
          qty: state.positionQty,
        };

        const orderId = await client.placeOrder(params);
        state.entryOrderId = orderId;
        state.stateType = 'WAITING_FOR_TRIGGER';
        this.log(state, `✅ SL-L Buy Order placed at exchange: ${orderId} (Trigger: ₹${entryPrice}, Max Protection Limit: ₹${protectionPrice})`);
      }

      await this.trackOrder(state, entryPrice, 'OPEN');
    } catch (e) {
      this.log(state, `❌ Setup trigger error: ${e.message}`);
    }
  }

  // ─── Phase 2B: Check Breakout Trigger Fill ───────────────────────────────────

  private async checkBreakoutTrigger(state: StrategyState, client: any, kite: any) {
    if (!state.optionSymbol || !state.entryTriggerPrice) return;

    try {
      const key = `NFO:${state.optionSymbol}`;
      const ltpData = await kite.getLTP([key]);
      const currentPrice = ltpData[key]?.last_price;

      if (!currentPrice) return;

      if (state.isPaperTrade) {
        if (currentPrice >= state.entryTriggerPrice) {
          this.log(state, `🚀 Breakout Triggered! Option LTP ₹${currentPrice} broke above target trigger ₹${state.entryTriggerPrice}`);
          state.stateType = 'ACTIVE_POSITION';
          this.log(state, `🛒 Position Opened [PAPER]: Bought ${state.positionQty} of ${state.optionSymbol} at Avg ₹${state.entryTriggerPrice.toFixed(2)}`);
          await this.updateOrderStatus(state.entryOrderId!, 'COMPLETE', state.entryTriggerPrice);
        }
      } else {
        // Query order status from Zerodha
        const orders = await kite.getOrders();
        const brokerOrder = orders.find((o: any) => o.order_id === state.entryOrderId);

        if (brokerOrder) {
          if (brokerOrder.status === 'COMPLETE') {
            const avgPrice = Number(brokerOrder.average_price) || state.entryTriggerPrice;
            state.entryTriggerPrice = avgPrice; // update entry price with actual fill price
            state.stateType = 'ACTIVE_POSITION';
            this.log(state, `🛒 Position Opened [LIVE]: Filled ${state.positionQty} of ${state.optionSymbol} at Avg ₹${avgPrice.toFixed(2)}`);
            await this.updateOrderStatus(state.entryOrderId!, 'COMPLETE', avgPrice);
          } else if (brokerOrder.status === 'REJECTED' || brokerOrder.status === 'CANCELLED') {
            this.log(state, `❌ Trigger order was ${brokerOrder.status}. Reason: ${brokerOrder.status_message || 'N/A'}`);
            await this.updateOrderStatus(state.entryOrderId!, brokerOrder.status, null);
            this.resetStateToScanning(state);
          }
        }
      }
    } catch (e) {
      this.log(state, `⚠ Breakout check error: ${e.message}`);
    }
  }

  // ─── Phase 1: Monitor Active Position & Exits ────────────────────────────────

  private async monitorPosition(state: StrategyState, client: any, kite: any) {
    if (!state.optionSymbol || !state.entryTriggerPrice || !state.stopLossPrice || !state.targetPrice) return;

    try {
      const key = `NFO:${state.optionSymbol}`;
      const ltpData = await kite.getLTP([key]);
      const currentPrice = ltpData[key]?.last_price;

      if (!currentPrice) return;

      const pnlPoints = currentPrice - state.entryTriggerPrice;
      const pnlRs = pnlPoints * state.positionQty;

      this.log(state, `👀 Premium ${state.optionSymbol}: ₹${currentPrice.toFixed(2)} | Target: ₹${state.targetPrice.toFixed(2)} | SL (Low): ₹${state.stopLossPrice.toFixed(2)} | P&L: ₹${pnlRs.toFixed(2)}`);

      if (currentPrice <= state.stopLossPrice) {
        this.log(state, `🛑 Stop Loss Hit at ₹${currentPrice.toFixed(2)} (Mother candle low)`);
        await this.exitPosition(state, client, currentPrice, 'SL');
      } else if (currentPrice >= state.targetPrice) {
        this.log(state, `🎯 Target Hit at ₹${currentPrice.toFixed(2)} (RR Ratio: ${state.config.riskRewardRatio})`);
        await this.exitPosition(state, client, currentPrice, 'TARGET');
      }
    } catch (e) {
      this.log(state, `⚠ Position monitor error: ${e.message}`);
    }
  }

  private async exitPosition(state: StrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET' | 'FORCE_CLOSE') {
    try {
      const profit = (exitPrice - state.entryTriggerPrice!) * state.positionQty;
      this.log(state, `📤 Exiting Position — Reason: ${reason} | Price: ₹${exitPrice.toFixed(2)} | P&L: ₹${profit.toFixed(2)}`);

      if (state.isPaperTrade) {
        this.log(state, `📝 PAPER TRADE — Exit simulated`);
      } else {
        // Cancel any pending trigger/limit order if any
        if (state.entryOrderId) {
          try {
            await client.cancelOrder(state.entryOrderId);
          } catch {}
        }

        const protectionPrice = this.roundTick(exitPrice * 0.90); // limit order 10% lower to sell immediately
        const params: OrderParams = {
          symbol: state.optionSymbol!,
          exchange: 'NFO',
          side: 'SELL',
          orderType: 'LIMIT',
          price: protectionPrice,
          product: state.config.product ?? 'MIS',
          qty: state.positionQty,
        };

        const exitOrderId = await client.placeOrder(params);
        this.log(state, `✅ Live Exit Order placed: ${exitOrderId}`);
      }

      // Record exit order in DB
      await this.prisma.order.create({
        data: {
          userId: (await this.prisma.strategyExecution.findUnique({ where: { id: state.executionId }, include: { strategy: true } }))?.strategy.userId!,
          brokerAccountId: state.brokerAccountId,
          executionId: state.executionId,
          symbol: state.optionSymbol!,
          exchange: 'NFO',
          side: 'SELL',
          orderType: 'LIMIT',
          productType: state.config.product as any ?? 'MIS',
          qty: state.positionQty,
          price: exitPrice,
          status: 'COMPLETE',
          isPaperTrade: state.isPaperTrade,
        } as any,
      });

      state.tradesPlacedToday++;
      this.resetStateToScanning(state);
    } catch (e) {
      this.log(state, `❌ Exit execution failed: ${e.message}`);
    }
  }

  private async forceExit(state: StrategyState) {
    if (state.stateType === 'SCANNING') return;
    
    this.log(state, `⏰ Market closing hour (15:15 IST). Closing triggers and positions.`);
    
    const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
    if (account?.accessToken) {
      const client = this.factory.createClient(account);
      const kite = client['kite'];
      
      if (state.stateType === 'WAITING_FOR_TRIGGER') {
        if (!state.isPaperTrade && state.entryOrderId) {
          try {
            await client.cancelOrder(state.entryOrderId);
            this.log(state, `✅ Cancelled trigger order ${state.entryOrderId}`);
          } catch {}
        }
        this.resetStateToScanning(state);
      } else if (state.stateType === 'ACTIVE_POSITION') {
        const key = `NFO:${state.optionSymbol}`;
        const ltpData = await kite.getLTP([key]);
        const currentPrice = ltpData[key]?.last_price || state.entryTriggerPrice!;
        await this.exitPosition(state, client, currentPrice, 'FORCE_CLOSE');
      }
    } else {
      this.resetStateToScanning(state);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async fetchCandles(client: any, symbol: string, exchange: string, interval: string): Promise<Candle[]> {
    const now = new Date();
    const istDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    const from = new Date(`${istDateStr} 09:15:00 GMT+0530`);
    from.setDate(from.getDate() - 3); // last 3 days
    const data = await client.getHistoricalData(symbol, exchange, interval, from, now);
    return (data || []).map((c: any) => ({
      date: new Date(c.date), open: c.open, high: c.high,
      low: c.low, close: c.close, volume: c.volume,
    }));
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
        cpv = 0;
        cv = 0;
        lastDateStr = dateStr;
      }
      cpv += ((candles[i].high + candles[i].low + candles[i].close) / 3) * candles[i].volume;
      cv += candles[i].volume;
      vwaps[i] = cv === 0 ? candles[i].close : cpv / cv;
    }
    return vwaps;
  }

  private async findATMOption(client: any, baseSymbol: string, spotPrice: number, type: 'CE' | 'PE'): Promise<string | null> {
    const exchange = 'NFO';
    const segment = 'NFO-OPT';
    const underlying = baseSymbol.toUpperCase().trim();

    const instruments = await client.getInstruments(exchange);
    const options = instruments.filter((i: any) =>
      i.name === underlying && i.instrument_type === type && i.segment === segment
    );
    if (options.length === 0) return null;

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
    if (sortedExpiries.length === 0) return null;

    const nearExpiry = sortedExpiries[0];
    const filteredOptions = options.filter((i: any) => getExpiryStr(i.expiry) === nearExpiry);

    // Find closest strike
    let closest: any = null, closestD = Infinity;
    for (const opt of filteredOptions) {
      const d = Math.abs(Number(opt.strike) - spotPrice);
      if (d < closestD) { closestD = d; closest = opt; }
    }
    return closest ? closest.tradingsymbol : null;
  }

  private roundTick(price: number): number {
    return Math.round(price / 0.05) * 0.05;
  }

  private resetStateToScanning(state: StrategyState) {
    state.stateType = 'SCANNING';
    state.optionSymbol = null;
    state.signalSide = null;
    state.entryTriggerPrice = null;
    state.stopLossPrice = null;
    state.targetPrice = null;
    state.entryOrderId = null;
  }

  private resetDailyState(state: StrategyState) {
    this.resetStateToScanning(state);
    state.tradesPlacedToday = 0;
    state.lastProcessedTimestamp = 0;
  }

  private log(state: StrategyState, msg: string) {
    const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    state.logs.push(`[${ts}] ${msg}`);
    this.logger.log(`[${state.executionId}] ${msg}`);
  }

  private async persistLogs(state: StrategyState) {
    await this.prisma.strategyExecution.update({
      where: { id: state.executionId },
      data: { logs: JSON.stringify(state.logs.slice(-200)) },
    });
  }

  private async trackOrder(state: StrategyState, price: number, status: 'OPEN' | 'COMPLETE') {
    try {
      const strategy = await this.prisma.strategy.findUnique({ where: { id: (await this.prisma.strategyExecution.findUnique({ where: { id: state.executionId } }))?.strategyId } });
      await this.prisma.order.create({
        data: {
          userId: strategy?.userId!,
          brokerAccountId: state.brokerAccountId,
          executionId: state.executionId,
          symbol: state.optionSymbol!,
          exchange: 'NFO',
          side: 'BUY',
          orderType: 'SL',
          productType: state.config.product as any ?? 'MIS',
          qty: state.positionQty,
          price,
          brokerOrderId: state.entryOrderId,
          status: state.isPaperTrade ? 'COMPLETE' : status,
          isPaperTrade: state.isPaperTrade,
        } as any,
      });
    } catch (e) {
      this.logger.error(`Failed to track trigger order: ${e.message}`);
    }
  }

  private async updateOrderStatus(brokerOrderId: string, status: string, filledPrice: number | null) {
    try {
      await this.prisma.order.updateMany({
        where: { brokerOrderId },
        data: {
          status: status as any,
          ...(filledPrice && { avgPrice: filledPrice, price: filledPrice }),
        },
      });
    } catch (e) {
      this.logger.error(`Failed to update trigger order status: ${e.message}`);
    }
  }
}
