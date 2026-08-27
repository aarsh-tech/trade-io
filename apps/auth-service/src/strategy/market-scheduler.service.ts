import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { Breakout15MinEngine } from './breakout15min.engine';
import { EmaVwapCrossoverEngine } from './emavwap.engine';
import { StockOptionsBuyingEngine } from './stock-options-buying.engine';
import { NiftyOptionsScalperEngine } from './nifty-options-scalper.engine';

/**
 * MarketSchedulerService
 * ─────────────────────
 * Runs every 60 s. At exactly 09:15 IST it auto-starts every strategy
 * that has `autoStart = true` and is not already running.
 * At 15:30 IST it stops all running strategies so they don't poll
 * after market close.
 */
@Injectable()
export class MarketSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  /**
   * Tracks the IST date string (e.g. "Mon Apr 28 2026") of the last
   * auto-start run so we fire it at most once per trading day even
   * though the detection window is 09:15 – 09:16 (two ticks).
   */
  private lastAutoStartDate: string | null = null;

  /**
   * Tracks the IST date string of the last auto-stop run.
   */
  private lastAutoStopDate: string | null = null;

  /**
   * Tracks the last minute when enforceEodSquareOff ran so it runs once per minute.
   */
  private lastEodMinute: number = -1;

  /**
   * Strategy IDs that the user explicitly stopped during the current
   * server session.  The scheduler will not restart these until the
   * next calendar day (i.e. the next auto-start cycle).
   */
  private readonly manuallyStoppedToday = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
    private readonly breakoutEngine: Breakout15MinEngine,
    private readonly emaVwapEngine: EmaVwapCrossoverEngine,
    private readonly stockOptionsBuyingEngine: StockOptionsBuyingEngine,
    private readonly niftyOptionsScalperEngine: NiftyOptionsScalperEngine,
  ) { }

  onModuleInit() {
    this.logger.log('Market Scheduler initialised — will auto-start strategies at 09:15:05 IST sharp');
    // Check immediately on boot (handles the case where the server restarts mid-session)
    this.checkAndAct().catch((e) => this.logger.error(e));
    // High-precision 1-second check loop
    this.timer = setInterval(() => this.checkAndAct().catch((e) => this.logger.error(e)), 1_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Called by StrategyController whenever the user manually stops a
   * strategy so the scheduler won't immediately re-start it.
   */
  notifyManualStop(strategyId: string) {
    this.manuallyStoppedToday.add(strategyId);
    this.logger.log(`Scheduler: strategy ${strategyId} marked as manually stopped — will not auto-restart today`);
  }

  // ── Core scheduler loop ──────────────────────────────────────────────────────

  private async checkAndAct() {
    const now = new Date();
    // Deterministic IST calculation using UTC offset (UTC+5:30 = 330 mins)
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utcMs + (330 * 60000));
    const day = ist.getDay(); // 0 = Sunday, 6 = Saturday

    // Skip auto-start/auto-stop on weekends when Indian markets are closed
    if (day === 0 || day === 6) {
      return;
    }

    const h = ist.getHours();
    const m = ist.getMinutes();
    const s = ist.getSeconds();
    const hhmm = h * 60 + m;

    const MARKET_OPEN = 9 * 60 + 15; // 09:15
    const MARKET_CLOSE = 15 * 60 + 30; // 15:30

    // ── Auto-start at exactly 09:15:05 IST (or boot mid-session during market hours) ──
    const isExactAutoStartTime = (h === 9 && m === 15 && s >= 5) || (h === 9 && m === 16);
    const isMidSessionStart = hhmm > MARKET_OPEN && hhmm < MARKET_CLOSE && this.lastAutoStartDate === null;

    if (isExactAutoStartTime || isMidSessionStart) {
      const todayKey = ist.toDateString();
      if (this.lastAutoStartDate !== todayKey) {
        this.lastAutoStartDate = todayKey;
        // Reset the manual-stop exclusion list for the new trading day
        this.manuallyStoppedToday.clear();
        await this.autoStartStrategies();
      }
    }

    // ── 3:05 PM – 3:25 PM IST Mandatory Safety Square-Off Window (Runs once per minute) ───
    if (hhmm >= 15 * 60 + 5 && hhmm <= 15 * 60 + 25) {
      if (this.lastEodMinute !== hhmm) {
        this.lastEodMinute = hhmm;
        await this.enforceEodSquareOff();
      }
    }

    // ── Auto-stop at exactly 15:30:00 IST sharp ──────────────────────────────
    if (hhmm >= MARKET_CLOSE && hhmm <= MARKET_CLOSE + 1) {
      const todayKey = ist.toDateString();
      if (this.lastAutoStopDate !== todayKey) {
        this.lastAutoStopDate = todayKey;
        await this.autoStopStrategies();
      }
    }
  }

  // ── Auto-start all strategies marked autoStart=true ──────────────────────────

  private async autoStartStrategies() {
    try {
      const strategies = await this.prisma.strategy.findMany({
        where: { autoStart: true } as any,
        include: { brokerAccount: true },
      });

      if (strategies.length === 0) {
        this.logger.log('Auto-start: no strategies configured for auto-start');
        return;
      }

      for (const strategy of strategies) {
        const engine = this.getEngine(strategy.type as string);
        if (!engine) continue;

        if (engine.isRunning(strategy.id)) {
          this.logger.log(`Auto-start: ${strategy.name} already running — skipped`);
          continue;
        }

        // Skip strategies that the user manually stopped this session
        if (this.manuallyStoppedToday.has(strategy.id)) {
          this.logger.log(`Auto-start: ${strategy.name} was manually stopped today — skipped`);
          continue;
        }

        // Ensure there is a valid broker session before starting
        const account = strategy.brokerAccount ?? await this.prisma.brokerAccount.findFirst({
          where: { userId: strategy.userId, isActive: true, accessToken: { not: null } },
        });

        if (!account?.accessToken) {
          this.logger.warn(`Auto-start: ${strategy.name} — no active broker session, skipping`);
          continue;
        }

        try {
          const { executionId } = await engine.start(strategy.id);
          this.logger.log(`✅ Auto-started "${strategy.name}" (execution: ${executionId})`);
        } catch (err) {
          this.logger.error(`❌ Auto-start failed for "${strategy.name}": ${err.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`Auto-start error: ${err.message}`);
    }
  }

  // ── Auto-stop all running strategies at market close ─────────────────────────

  private async enforceEodSquareOff() {
    try {
      // 1. Enforce squareOff on all active running strategy engines
      const strategies = await this.prisma.strategy.findMany({
        where: { isActive: true } as any,
      });

      for (const strategy of strategies) {
        const engine = this.getEngine(strategy.type as string);
        if (!engine) continue;
        if (!engine.isRunning(strategy.id)) continue;

        try {
          if ((engine as any).squareOff) {
            const state = (engine as any).getState ? (engine as any).getState(strategy.id) : null;
            if (state && (state.entryTriggered || state.stateType === 'ACTIVE_POSITION')) {
              this.logger.warn(`⏰ Scheduler enforcing 3:05 PM EOD Square Off for "${strategy.name}"...`);
              await (engine as any).squareOff(strategy.id);
            }
          }
        } catch (err) {
          this.logger.error(`EOD Square-Off enforcement error for "${strategy.name}": ${err.message}`);
        }
      }

      // 2. Direct Broker RMS Safety Net: Check all broker accounts for any open MIS intraday positions
      const activeAccounts = await this.prisma.brokerAccount.findMany({
        where: { isActive: true, accessToken: { not: null } },
      });

      for (const account of activeAccounts) {
        try {
          const client = this.factory.createClient(account);
          const kite = client['kite'];
          if (!kite) continue;

          // Cancel open/trigger pending orders to avoid stray executions
          try {
            const openOrders = await kite.getOrders();
            const pendingOrders = (openOrders || []).filter(
              (o: any) => o.status === 'OPEN' || o.status === 'TRIGGER PENDING'
            );
            for (const po of pendingOrders) {
              await kite.cancelOrder('regular', po.order_id).catch(() => {});
              this.logger.warn(`🛡 [RMS Safety Net] Cancelled pending broker order ${po.order_id} (${po.tradingsymbol})`);
            }
          } catch (ordErr: any) {
            this.logger.debug?.(`RMS Safety Net order check notice: ${ordErr?.message}`);
          }

          // Inspect live net positions directly on Zerodha
          const positionsData = await kite.getPositions().catch(() => null);
          const netPositions = positionsData?.net || [];

          for (const pos of netPositions) {
            const qty = Number(pos.quantity);
            const product = String(pos.product).toUpperCase();

            // If an intraday MIS position is open, square it off with a MARKET order
            if (qty !== 0 && product === 'MIS') {
              const exitSide = qty > 0 ? 'SELL' : 'BUY';
              const exitQty = Math.abs(qty);
              this.logger.warn(
                `🚨 [RMS Safety Net] Found open MIS position on Zerodha: ${pos.exchange}:${pos.tradingsymbol} (Qty: ${qty}). Placing emergency MARKET exit to avoid ₹50+GST penalty!`
              );

              try {
                const res = await kite.placeOrder('regular', {
                  exchange: pos.exchange,
                  tradingsymbol: pos.tradingsymbol,
                  transaction_type: exitSide,
                  quantity: exitQty,
                  product: 'MIS',
                  order_type: 'MARKET',
                });
                this.logger.log(`✅ [RMS Safety Net] Emergency exit placed: ${res.order_id || 'SUCCESS'}`);
              } catch (placeErr: any) {
                this.logger.error(`❌ [RMS Safety Net] Failed emergency exit for ${pos.tradingsymbol}: ${placeErr?.message}`);
              }
            }
          }
        } catch (accErr: any) {
          this.logger.error(`RMS Safety Net account check error (${account.id}): ${accErr?.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`enforceEodSquareOff error: ${err.message}`);
    }
  }

  private async autoStopStrategies() {
    try {
      const strategies = await this.prisma.strategy.findMany({
        where: { isActive: true } as any,
      });

      for (const strategy of strategies) {
        const engine = this.getEngine(strategy.type as string);
        if (!engine) continue;
        if (!engine.isRunning(strategy.id)) continue;

        try {
          await engine.stop(strategy.id);
          this.logger.log(`⏹ Auto-stopped "${strategy.name}" at market close`);
        } catch (err) {
          this.logger.error(`Auto-stop failed for "${strategy.name}": ${err.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`Auto-stop error: ${err.message}`);
    }
  }

  // ─── Helper ─────────────────────────────────────────────────────────────────

  private getEngine(type: string) {
    if (type === 'BREAKOUT_15MIN') return this.breakoutEngine;
    if (type === 'EMA_VWAP_CROSSOVER') return this.emaVwapEngine;
    if (type === 'STOCK_OPTIONS_BUYING') return this.stockOptionsBuyingEngine;
    if (type === 'NIFTY_OPTIONS_SCALPER') return this.niftyOptionsScalperEngine;
    return null;
  }
}
