import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';
import { StockOptionsBuyingConfig } from './dto/strategy.dto';
import { autoSelectStock } from './smart-stock-picker';
import { strategyEvents } from '../common/events';

interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StrategyState {
  strategyId: string;
  executionId: string;
  config: StockOptionsBuyingConfig;
  brokerAccountId: string;
  isPaperTrade: boolean;
  
  // Strategy Execution State
  stateType: 'SCANNING' | 'WAITING_FOR_TRIGGER' | 'ACTIVE_POSITION';
  signalSide: 'CALL' | 'PUT' | null;
  optionSymbol: string | null;
  entryTriggerPrice: number | null;
  stopLossPrice: number | null;
  targetPrice: number | null;
  target1Price?: number | null;
  target2Price?: number | null;
  highestPriceReached?: number;
  isT1Reached?: boolean;
  positionQty: number;
  entryOrderId: string | null;
  lotSize: number;
  
  // High-Accuracy Upgrades State
  entryTime?: number;
  spotEntryPrice?: number;
  spotStopLossPrice?: number;
  isSlTrailedToCost?: boolean;
  orderPlacedTimestamp?: number;
  executionLatencyMs?: number;
  
  // Duplicate prevention & logs
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
      strategyId,
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
    this.log(
      state,
      `▶ High-Accuracy Stock Options Buying engine started — Stock: ${config.symbol} | Capital: ₹${config.maxCapital} | Mode: ${strategy.isPaperTrade ? 'PAPER' : 'LIVE'}`,
    );
    await this.persistLogs(state);

    // Tick every 15 seconds for rapid position monitoring & trigger checks
    const timer = setInterval(
      () => this.tick(strategyId).catch(e => this.logger.error(e)),
      15_000,
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
      executionLatencyMs: s.executionLatencyMs,
      isSlTrailedToCost: s.isSlTrailedToCost,
    };
  }

  // ─── Main tick loop ──────────────────────────────────────────────────────────

  private async tick(strategyId: string) {
    const state = this.running.get(strategyId);
    if (!state) return;

    // Resolve AUTO symbol if configured
    if (state.config.symbol === 'AUTO') {
      const account = await this.prisma.brokerAccount.findUnique({ where: { id: state.brokerAccountId } });
      if (account?.accessToken) {
        try {
          const client = this.factory.createClient(account);
          const kite = client['kite'];
          this.log(state, `🔍 Symbol is AUTO. Selecting best liquid momentum stock...`);
          const pick = await autoSelectStock(kite, 1000, 500, this.logger, state.config.maxCapital);
          state.config.symbol = pick.symbol;
          state.config.exchange = pick.exchange;
          this.log(state, `🎯 Auto-Selected Stock: ${state.config.symbol}`);
        } catch (err) {
          this.log(state, `❌ Failed to auto-select stock: ${err.message}`);
          await this.persistLogs(state);
          return;
        }
      } else {
        this.log(state, '⚠ No active broker session to resolve AUTO symbol');
        await this.persistLogs(state);
        return;
      }
    }

    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const h = ist.getHours();
    const m = ist.getMinutes();
    const hhmm = h * 60 + m;

    const MARKET_OPEN = 9 * 60 + 15;
    const MARKET_CLOSE = 15 * 60 + 30;

    // Reset daily state before market opens
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

  // ─── Upgrade 1: Multi-Filter Signal Scanning (RVOL + Volume SMA) ────────────

  private async scanForSetup(state: StrategyState, client: any, kite: any) {
    try {
      const interval = state.config.timeframe === '5min' ? '5minute' : '15minute';
      const candles = await this.fetchCandles(client, state.config.symbol, state.config.exchange, interval);
      const emaPeriod = state.config.emaPeriod ?? 15;

      if (candles.length < emaPeriod + 20) {
        this.log(state, `⏳ Insufficient candles for volume SMA & EMA (need ${emaPeriod + 20}, got ${candles.length})`);
        return;
      }

      // Check if last candle is closed
      const now = new Date();
      const timeframeMs = state.config.timeframe === '5min' ? 5 * 60_000 : 15 * 60_000;
      const latestCandle = candles[candles.length - 1];
      const isClosed = (now.getTime() - latestCandle.date.getTime()) >= timeframeMs;
      const closedCandles = isClosed ? candles : candles.slice(0, -1);

      if (closedCandles.length < emaPeriod + 20) return;

      const n = closedCandles.length - 1;
      const lastClosedCandleTime = closedCandles[n].date.getTime();

      // Prevent recalculating the same closed candles
      if (lastClosedCandleTime <= state.lastProcessedTimestamp) return;
      state.lastProcessedTimestamp = lastClosedCandleTime;

      const emas = this.calculateEMA(closedCandles, emaPeriod);
      const vwaps = this.calculateVWAP(closedCandles);

      const timeStr = new Date(lastClosedCandleTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
      const currEma = emas[n];
      const currVwap = vwaps[n];
      this.log(state, `🔍 Scanning candle closed at ${timeStr} | EMA: ₹${currEma?.toFixed(2)}, VWAP: ₹${currVwap?.toFixed(2)}`);

      const mother = closedCandles[n - 1];
      const baby = closedCandles[n];
      const isInsideCandle = baby.high <= mother.high && baby.low >= mother.low;

      if (isInsideCandle) {
        // Upgrade 1: Calculate Relative Volume (RVOL) against 20-candle Volume SMA
        const volSma = this.calculateVolumeSMA(closedCandles, 20, n);
        const rvol = volSma > 0 ? (baby.volume / volSma) : 1.0;
        const minRvol = state.config.minRvol ?? 1.5;

        this.log(
          state,
          `✨ Inside Candle Detected! Mother High: ₹${mother.high.toFixed(2)}, Low: ₹${mother.low.toFixed(2)} | RVOL: ${rvol.toFixed(2)}x (Min Required: ${minRvol.toFixed(2)}x)`,
        );

        if (rvol < minRvol) {
          this.log(state, `⏳ Breakout setup rejected: RVOL ${rvol.toFixed(2)}x is below required ${minRvol.toFixed(2)}x volume threshold`);
          return;
        }

        const trend = this.getLatestCrossoverToday(n, closedCandles, emas, vwaps);
        if (trend !== null) {
          const side = trend === 'LONG' ? 'CALL' : 'PUT';

          // Upgrade: Higher Timeframe (15-Min) Trend Filter
          if (state.config.enableHtfFilter ?? true) {
            const htfInterval = state.config.htfTimeframe === '60min' ? '60minute' : '15minute';
            const htfCandles = await this.fetchCandles(client, state.config.symbol, state.config.exchange, htfInterval);
            const htfPeriod = state.config.htfEmaPeriod ?? 50;

            if (htfCandles.length >= htfPeriod) {
              const htfEmas = this.calculateEMA(htfCandles, htfPeriod);
              const lastHtfClose = htfCandles[htfCandles.length - 1].close;
              const lastHtfEma = htfEmas[htfEmas.length - 1];

              if (lastHtfEma !== null) {
                if (side === 'CALL' && lastHtfClose < lastHtfEma) {
                  this.log(state, `⏳ 15-Min HTF trend check failed: Price (₹${lastHtfClose.toFixed(2)}) < EMA${htfPeriod} (₹${lastHtfEma.toFixed(2)}). Skipping CALL entry.`);
                  return;
                }
                if (side === 'PUT' && lastHtfClose > lastHtfEma) {
                  this.log(state, `⏳ 15-Min HTF trend check failed: Price (₹${lastHtfClose.toFixed(2)}) > EMA${htfPeriod} (₹${lastHtfEma.toFixed(2)}). Skipping PUT entry.`);
                  return;
                }
                this.log(state, `🌐 15-Min HTF Trend Confirmation Passed! Price: ₹${lastHtfClose.toFixed(2)} vs HTF EMA${htfPeriod}: ₹${lastHtfEma.toFixed(2)}`);
              }
            }
          }

          this.log(state, `✅ High-RVOL & HTF Confirmation Passed! Signal Direction: ${side}`);
          await this.setupBreakoutTrigger(state, client, kite, side, mother.date, side === 'CALL' ? mother.low : mother.high);
        }
      }
    } catch (e) {
      this.log(state, `❌ Scanning error: ${e.message}`);
    }
  }

  // ─── Upgrade 2 & 3: Smart Option Contract Selection & Precision Order Execution ──

  private async setupBreakoutTrigger(
    state: StrategyState, client: any, kite: any,
    side: 'CALL' | 'PUT', motherTimestamp: Date, motherSpotSl: number
  ) {
    try {
      const ltpData = await kite.getLTP([`${state.config.exchange}:${state.config.symbol}`]);
      const spotPrice = ltpData[`${state.config.exchange}:${state.config.symbol}`]?.last_price;
      if (!spotPrice) {
        this.log(state, `❌ Failed to fetch spot price for option strike selection`);
        return;
      }

      // Upgrade 2: Smart Option Contract & Liquidity Filter
      const moneyness = state.config.moneyness ?? 'ATM';
      const optionSymbol = await this.findSmartOptionContract(
        client, kite, state.config.symbol, spotPrice, side === 'CALL' ? 'CE' : 'PE', moneyness, state
      );

      if (!optionSymbol) {
        this.log(state, `❌ Could not find active liquid option symbol for ${state.config.symbol}`);
        return;
      }

      // Fetch Option candles to find the Mother Candle's High/Low
      const interval = state.config.timeframe === '5min' ? '5minute' : '15minute';
      const optCandles = await this.fetchCandles(client, optionSymbol, 'NFO', interval);
      const motherOptCandle = optCandles.find(c => c.date.getTime() === motherTimestamp.getTime());

      if (!motherOptCandle) {
        this.log(state, `⚠ Option candle missing at mother timestamp. Skipping illiquid strike ${optionSymbol}`);
        return;
      }

      const H_om = motherOptCandle.high;
      const L_om = motherOptCandle.low;

      // Calculate trigger prices
      const entryPrice = this.roundTick(H_om + (state.config.triggerOffset ?? 0.50));
      const slPrice = this.roundTick(L_om);
      const risk = entryPrice - slPrice;

      if (risk <= 0) {
        this.log(state, `❌ Invalid dynamic risk (SL: ₹${slPrice} >= Entry: ₹${entryPrice})`);
        return;
      }

      const target1Price = this.roundTick(entryPrice + risk * (state.config.target1RR ?? 1.5));
      const target2Price = this.roundTick(entryPrice + risk * (state.config.target2RR ?? 3.0));
      
      // Fetch Lot Size
      const instruments = await client.getInstruments('NFO');
      const optInst = instruments.find((i: any) => i.tradingsymbol === optionSymbol);
      const lotSize = optInst?.lot_size ?? 1;

      // Dynamic Capital-Based Lot Check
      const costPerLot = entryPrice * lotSize;
      const maxAffordableLots = Math.floor(state.config.maxCapital / costPerLot);
      const lotsToTrade = Math.min(state.config.lots ?? 1, maxAffordableLots);

      if (lotsToTrade < 1) {
        this.log(state, `❌ Capital check failed: 1 lot of ${optionSymbol} costs ₹${costPerLot.toFixed(2)}, exceeding your capital limit ₹${state.config.maxCapital}`);
        return;
      }

      // Update State
      state.optionSymbol = optionSymbol;
      state.signalSide = side;
      state.entryTriggerPrice = entryPrice;
      state.stopLossPrice = slPrice;
      state.targetPrice = target2Price; // Final 100% ROI target
      state.target1Price = target1Price; // T1 +50% ROI target
      state.target2Price = target2Price; // T2 +100% ROI target
      state.highestPriceReached = entryPrice;
      state.isT1Reached = false;
      state.lotSize = lotSize;
      state.positionQty = lotSize * lotsToTrade;
      state.spotEntryPrice = spotPrice;
      state.spotStopLossPrice = motherSpotSl;
      state.isSlTrailedToCost = false;

      this.log(state, `🎯 Smart Resolved Strike: NFO:${optionSymbol} (${moneyness}, Lot Size: ${lotSize}, Lots Allocated: ${lotsToTrade})`);
      this.log(state, `📋 Entry: ₹${entryPrice.toFixed(2)} | SL: ₹${slPrice.toFixed(2)} | T1 (+50% ROI): ₹${target1Price.toFixed(2)} | T2 (+100% ROI): ₹${target2Price.toFixed(2)} | Total Capital Required: ₹${(costPerLot * lotsToTrade).toFixed(2)}`);

      // Upgrade 3: Precision Order Execution with Ask Offset & Timeout
      state.orderPlacedTimestamp = Date.now();

      if (state.isPaperTrade) {
        state.entryOrderId = `PAPER_${Date.now().toString(36).toUpperCase()}`;
        state.stateType = 'WAITING_FOR_TRIGGER';
        this.log(state, `📝 Simulated Breakout Trigger order placed. Waiting for break above ₹${entryPrice}...`);
      } else {
        // Fetch current Ask for limit order precision
        const quoteKey = `NFO:${optionSymbol}`;
        const quoteMap = await kite.getQuote([quoteKey]);
        const bestAsk = quoteMap[quoteKey]?.depth?.sell?.[0]?.price || entryPrice;
        const limitPrice = this.roundTick(Math.max(entryPrice, bestAsk + 0.20));

        const params: OrderParams = {
          symbol: optionSymbol,
          exchange: 'NFO',
          side: 'BUY',
          orderType: 'SL',
          price: limitPrice,
          triggerPrice: entryPrice,
          product: state.config.product ?? 'MIS',
          qty: state.positionQty,
        };

        const orderId = await client.placeOrder(params);
        state.entryOrderId = orderId;
        state.stateType = 'WAITING_FOR_TRIGGER';
        this.log(state, `✅ Precision SL Limit Order placed at exchange: ${orderId} (Trigger: ₹${entryPrice}, Limit: ₹${limitPrice})`);
      }

      await this.trackOrder(state, entryPrice, 'OPEN');
    } catch (e) {
      this.log(state, `❌ Setup trigger error: ${e.message}`);
    }
  }

  // ─── Upgrade 3 (Contd.): Check Breakout Trigger Fill & Timeout Monitor ────────

  private async checkBreakoutTrigger(state: StrategyState, client: any, kite: any) {
    if (!state.optionSymbol || !state.entryTriggerPrice) return;

    try {
      const key = `NFO:${state.optionSymbol}`;
      const ltpData = await kite.getLTP([key]);
      const currentPrice = ltpData[key]?.last_price;

      if (!currentPrice) return;

      // Check Order Timeout (Default 5s timeout)
      const timeoutSec = state.config.orderTimeoutSec ?? 5;
      const elapsedSec = (Date.now() - (state.orderPlacedTimestamp ?? Date.now())) / 1000;

      if (state.isPaperTrade) {
        if (currentPrice >= state.entryTriggerPrice) {
          state.executionLatencyMs = Math.round((Date.now() - (state.orderPlacedTimestamp ?? Date.now())));
          this.log(state, `🚀 Breakout Triggered! Option LTP ₹${currentPrice} broke above trigger ₹${state.entryTriggerPrice}`);
          this.log(state, `⚡ Execution Latency [PAPER]: ${state.executionLatencyMs}ms`);
          
          state.stateType = 'ACTIVE_POSITION';
          state.entryTime = Date.now();
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
            state.executionLatencyMs = Math.round((Date.now() - (state.orderPlacedTimestamp ?? Date.now())));
            state.entryTriggerPrice = avgPrice;
            state.stateType = 'ACTIVE_POSITION';
            state.entryTime = Date.now();

            this.log(state, `🛒 Position Opened [LIVE]: Filled ${state.positionQty} of ${state.optionSymbol} at Avg ₹${avgPrice.toFixed(2)}`);
            this.log(state, `⚡ Execution Latency [LIVE]: ${state.executionLatencyMs}ms`);
            await this.updateOrderStatus(state.entryOrderId!, 'COMPLETE', avgPrice);
          } else if (brokerOrder.status === 'REJECTED' || brokerOrder.status === 'CANCELLED') {
            this.log(state, `❌ Trigger order was ${brokerOrder.status}. Reason: ${brokerOrder.status_message || 'N/A'}`);
            await this.updateOrderStatus(state.entryOrderId!, brokerOrder.status, null);
            this.resetStateToScanning(state);
          } else if ((brokerOrder.status === 'OPEN' || brokerOrder.status === 'TRIGGER PENDING') && elapsedSec > timeoutSec) {
            // Execution timeout: cancel pending order to prevent unexpected floating fills
            this.log(state, `⏱ Order Execution Timeout (${elapsedSec.toFixed(1)}s > ${timeoutSec}s limit). Cancelling pending trigger ${state.entryOrderId}`);
            try {
              await client.cancelOrder(state.entryOrderId);
            } catch {}
            this.resetStateToScanning(state);
          }
        }
      }
    } catch (e) {
      this.log(state, `⚠ Breakout check error: ${e.message}`);
    }
  }

  // ─── Upgrade 4: Dynamic Exit Engine (Spot SL, Trailing SL & 45-Min Time Exit) ──

  private async monitorPosition(state: StrategyState, client: any, kite: any) {
    if (!state.optionSymbol || !state.entryTriggerPrice || !state.stopLossPrice || !state.targetPrice) return;

    try {
      const key = `NFO:${state.optionSymbol}`;
      const spotKey = `${state.config.exchange}:${state.config.symbol}`;
      const ltpData = await kite.getLTP([key, spotKey]);
      
      const currentPrice = ltpData[key]?.last_price;
      const currentSpot = ltpData[spotKey]?.last_price;

      if (!currentPrice) return;

      const pnlPoints = currentPrice - state.entryTriggerPrice;
      const pnlRs = pnlPoints * state.positionQty;
      const heldMinutes = Math.round((Date.now() - (state.entryTime ?? Date.now())) / 60_000);

      this.log(
        state,
        `👀 ${state.optionSymbol}: ₹${currentPrice.toFixed(2)} | Target: ₹${state.targetPrice.toFixed(2)} | SL: ₹${state.stopLossPrice.toFixed(2)} | P&L: ₹${pnlRs.toFixed(2)} | Held: ${heldMinutes}m`,
      );

      // Update highest price peak reached
      state.highestPriceReached = Math.max(state.highestPriceReached ?? currentPrice, currentPrice);

      // Upgrade 4A: Spot Price SL Breach Check
      if (currentSpot && state.spotStopLossPrice) {
        const isSpotBreached = state.signalSide === 'CALL' 
          ? currentSpot < state.spotStopLossPrice 
          : currentSpot > state.spotStopLossPrice;

        if (isSpotBreached) {
          this.log(state, `🛑 Underlying Spot Price breached SL level (Spot: ₹${currentSpot.toFixed(2)}, SL: ₹${state.spotStopLossPrice.toFixed(2)})`);
          await this.exitPosition(state, client, currentPrice, 'SPOT_SL');
          return;
        }
      }

      // Upgrade 4B: Target 1 (+50% Gain) -> Trail SL to Cost (Risk-Free) & Dynamic Trailing
      const t1Price = state.target1Price || (state.entryTriggerPrice + 1.5 * (state.entryTriggerPrice - state.stopLossPrice));
      const t2Price = state.target2Price || (state.entryTriggerPrice + 3.0 * (state.entryTriggerPrice - state.stopLossPrice));

      if (currentPrice >= t1Price && !state.isT1Reached && (state.config.enableTrailingSl ?? true)) {
        state.isT1Reached = true;
        state.stopLossPrice = Math.max(state.stopLossPrice, state.entryTriggerPrice);
        state.isSlTrailedToCost = true;
        this.log(state, `🛡 Target 1 (+50% Gain / 1:1.5 RR) Reached at ₹${currentPrice.toFixed(2)}! Trailing SL moved to Cost (₹${state.entryTriggerPrice.toFixed(2)}) — Trade is now 100% RISK-FREE!`);
      }

      // Dynamic Trailing SL after T1: Trail specified % behind peak price reached
      if (state.isT1Reached && (state.config.enableTrailingSl ?? true)) {
        const trailingStepPct = (state.config.trailingStepPct ?? 20) / 100;
        const dynamicSl = this.roundTick((state.highestPriceReached ?? currentPrice) * (1 - trailingStepPct));
        if (dynamicSl > state.stopLossPrice) {
          state.stopLossPrice = dynamicSl;
          this.log(state, `📈 Dynamic Trailing SL updated to ₹${dynamicSl.toFixed(2)} (Peak Price: ₹${state.highestPriceReached?.toFixed(2)})`);
        }
      }

      // Upgrade 4C: Time-Based Stagnant Position Exit (Default 45 Minutes)
      const maxStagnantTime = state.config.maxStagnantTimeMin ?? 45;
      if (heldMinutes >= maxStagnantTime && !state.isT1Reached) {
        this.log(state, `⏰ Stagnant position held for ${heldMinutes}m (> ${maxStagnantTime}m limit). Exiting to prevent Theta decay.`);
        await this.exitPosition(state, client, currentPrice, 'TIME_EXIT');
        return;
      }

      // Standard SL & Target 2 (+100% ROI) Checks
      if (currentPrice <= state.stopLossPrice) {
        const slReason = state.isT1Reached ? 'Trailing Stop Loss' : 'Stop Loss';
        this.log(state, `🛑 ${slReason} Hit at ₹${currentPrice.toFixed(2)}`);
        await this.exitPosition(state, client, currentPrice, 'SL');
      } else if (currentPrice >= t2Price) {
        this.log(state, `🎯 Target 2 (+100% ROI / 2x Premium) Hit at ₹${currentPrice.toFixed(2)}! Exiting 1 lot with peak profit!`);
        await this.exitPosition(state, client, currentPrice, 'TARGET');
      }
    } catch (e) {
      this.log(state, `⚠ Position monitor error: ${e.message}`);
    }
  }

  private async exitPosition(state: StrategyState, client: any, exitPrice: number, reason: 'SL' | 'TARGET' | 'SPOT_SL' | 'TIME_EXIT' | 'FORCE_CLOSE') {
    try {
      // Upgrade 5: Paper Trading Realistic Slippage Simulation
      let actualExitPrice = exitPrice;
      if (state.isPaperTrade) {
        const simulatedSlippage = 0.15; // 0.15 pts spread slippage
        actualExitPrice = this.roundTick(Math.max(0.05, exitPrice - simulatedSlippage));
      }

      const profit = (actualExitPrice - state.entryTriggerPrice!) * state.positionQty;
      this.log(state, `📤 Exiting Position — Reason: ${reason} | Price: ₹${actualExitPrice.toFixed(2)} | P&L: ₹${profit.toFixed(2)}`);

      if (state.isPaperTrade) {
        this.log(state, `📝 PAPER TRADE — Exit simulated with ₹0.15 slippage model`);
      } else {
        if (state.entryOrderId) {
          try {
            await client.cancelOrder(state.entryOrderId);
          } catch {}
        }

        const protectionPrice = this.roundTick(actualExitPrice * 0.90);
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
          price: actualExitPrice,
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

  // ─── Upgrade 2: Smart Option Selector & Liquidity Guard ──────────────────────

  private async findSmartOptionContract(
    client: any, kite: any, baseSymbol: string, spotPrice: number,
    type: 'CE' | 'PE', moneyness: 'ATM' | 'ITM', state: StrategyState
  ): Promise<string | null> {
    const exchange = 'NFO';
    const segment = 'NFO-OPT';
    const underlying = baseSymbol.toUpperCase().trim();

    const instruments = await client.getInstruments(exchange);
    const options = instruments.filter((i: any) =>
      i.name === underlying && i.instrument_type === type && i.segment === segment
    );
    if (options.length === 0) return null;

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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

    // Sort by strike
    filteredOptions.sort((a: any, b: any) => Number(a.strike) - Number(b.strike));

    // Find ATM strike index
    let atmIndex = 0, minDiff = Infinity;
    for (let i = 0; i < filteredOptions.length; i++) {
      const diff = Math.abs(Number(filteredOptions[i].strike) - spotPrice);
      if (diff < minDiff) {
        minDiff = diff;
        atmIndex = i;
      }
    }

    // Determine target index based on Moneyness
    let targetIndex = atmIndex;
    if (moneyness === 'ITM') {
      if (type === 'CE' && atmIndex > 0) targetIndex = atmIndex - 1; // 1 strike lower for ITM Call
      if (type === 'PE' && atmIndex < filteredOptions.length - 1) targetIndex = atmIndex + 1; // 1 strike higher for ITM Put
    }

    const candidate = filteredOptions[targetIndex];
    if (!candidate) return null;

    // Liquidity & Spread Guard Check
    try {
      const quoteKey = `NFO:${candidate.tradingsymbol}`;
      const quoteMap = await kite.getQuote([quoteKey]);
      const quote = quoteMap[quoteKey];

      if (quote) {
        const ltp = quote.last_price || candidate.strike;
        const buyDepth = quote.depth?.buy?.[0]?.price || 0;
        const sellDepth = quote.depth?.sell?.[0]?.price || 0;

        if (buyDepth > 0 && sellDepth > 0 && ltp > 0) {
          const spreadPct = ((sellDepth - buyDepth) / ltp) * 100;
          const maxSpreadAllowed = state.config.maxBidAskSpreadPct ?? 1.5;

          if (spreadPct > maxSpreadAllowed) {
            this.log(state, `⚠️ Liquidity Warning: ${candidate.tradingsymbol} Bid-Ask spread (${spreadPct.toFixed(2)}%) exceeds max allowed (${maxSpreadAllowed}%).`);
          } else {
            this.log(state, `💧 Liquidity Filter Passed: ${candidate.tradingsymbol} Spread: ${spreadPct.toFixed(2)}% | Volume: ${quote.volume || 0}`);
          }
        }
      }
    } catch {}

    return candidate.tradingsymbol;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private calculateVolumeSMA(candles: Candle[], period: number, endIdx: number): number {
    const startIdx = Math.max(0, endIdx - period + 1);
    let sum = 0, count = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      sum += candles[i].volume;
      count++;
    }
    return count > 0 ? sum / count : 0;
  }

  private async fetchCandles(client: any, symbol: string, exchange: string, interval: string): Promise<Candle[]> {
    const now = new Date();
    const istDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    const from = new Date(`${istDateStr} 09:15:00 GMT+0530`);
    from.setDate(from.getDate() - 5); // last 5 days
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
    state.target1Price = null;
    state.target2Price = null;
    state.highestPriceReached = undefined;
    state.isT1Reached = undefined;
    state.entryOrderId = null;
    state.entryTime = undefined;
    state.spotEntryPrice = undefined;
    state.spotStopLossPrice = undefined;
    state.isSlTrailedToCost = undefined;
    state.orderPlacedTimestamp = undefined;
    state.executionLatencyMs = undefined;
  }

  private getLatestCrossoverToday(idx: number, candles: Candle[], emas: (number | null)[], vwaps: (number | null)[]): 'LONG' | 'SHORT' | null {
    let latestCrossover: 'LONG' | 'SHORT' | null = null;
    let crossoverIdx = -1;
    const todayStr = candles[idx].date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });

    for (let k = 1; k <= idx; k++) {
      const candleDateStr = candles[k].date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
      if (candleDateStr !== todayStr) continue;

      const prevDateStr = candles[k - 1].date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
      if (prevDateStr !== todayStr) continue;

      const prevEma = emas[k - 1], currEma = emas[k];
      const prevVwap = vwaps[k - 1], currVwap = vwaps[k];
      if (prevEma === null || currEma === null || prevVwap === null || currVwap === null) continue;

      if (prevEma <= prevVwap && currEma > currVwap) {
        latestCrossover = 'LONG';
        crossoverIdx = k;
      } else if (prevEma >= prevVwap && currEma < currVwap) {
        latestCrossover = 'SHORT';
        crossoverIdx = k;
      }
    }

    if (latestCrossover !== null && (idx - crossoverIdx) > 3) {
      return null;
    }

    return latestCrossover;
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
    try {
      await this.prisma.strategyExecution.update({
        where: { id: state.executionId },
        data: { logs: JSON.stringify(state.logs.slice(-200)) },
      });
      strategyEvents.emit('strategy.update', {
        strategyId: state.strategyId,
        logs: state.logs,
        state: this.getState(state.strategyId),
      });
    } catch {}
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
