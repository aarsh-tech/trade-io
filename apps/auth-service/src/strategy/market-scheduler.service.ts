import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { Breakout15MinEngine } from './breakout15min.engine';
import { EmaVwapCrossoverEngine } from './emavwap.engine';
import { StockOptionsBuyingEngine } from './stock-options-buying.engine';
import { NiftyOptionsScalperEngine } from './nifty-options-scalper.engine';
import { GammaBlastExpiryEngine } from './gamma-blast-expiry.engine';
import { RiskService } from '../risk/risk.service';

/**
 * MarketSchedulerService
 * ─────────────────────
 * Runs every 1 s. At exactly 09:15 IST it auto-starts every strategy
 * that has `autoStart = true` and is not already running.
 * At 15:05–15:25 IST it enforces intraday RMS safety square-off.
 * At 15:30 IST it stops all running strategies so they don't poll after market close.
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
   * Timestamp of the last RMS daily loss check.
   */
  private lastLossCheckTime: number = 0;


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
    private readonly gammaBlastEngine: GammaBlastExpiryEngine,
    @Inject(forwardRef(() => RiskService))
    private readonly riskService: RiskService,
  ) { }

  onModuleInit() {
    this.logger.log('Market Scheduler initialised — will auto-start strategies at 09:15:01 IST sharp');
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

  /**
   * Called whenever a user connects or renews their broker session so any armed
   * strategies are started immediately without waiting for the next check tick.
   */
  async triggerImmediateAutoStart() {
    this.logger.log('MarketScheduler: Immediate auto-start requested (broker session updated)');
    await this.autoStartStrategies();
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

    // ── Continuous RMS Daily Loss Watchdog (Every 15s during market hours) ─────────
    if (hhmm >= MARKET_OPEN && hhmm <= MARKET_CLOSE) {
      if (now.getTime() - this.lastLossCheckTime > 15_000) {
        this.lastLossCheckTime = now.getTime();
        this.monitorDailyLosses().catch((e) => this.logger.error(`RMS loss monitor error: ${e?.message}`));
      }
    }

    // ── Auto-start at Market Open (09:15:00 to 09:16:00 IST) ───────────────────
    // Fires once per day at 09:15 IST sharp for all strategies configured with autoStart=true.
    // The 10-second daytime periodic check has been completely removed to prevent zombie restarts.
    if (hhmm >= MARKET_OPEN && hhmm <= MARKET_OPEN + 1) {
      const todayKey = ist.toDateString();
      if (this.lastAutoStartDate !== todayKey) {
        this.lastAutoStartDate = todayKey;
        this.manuallyStoppedToday.clear();
        this.logger.log('🔔 09:15 IST Market Open — Auto-starting configured strategies for today...');
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

        // Check today's latest execution status from DB
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);

        const latestExecToday = await this.prisma.strategyExecution.findFirst({
          where: {
            strategyId: strategy.id,
            startedAt: { gte: todayMidnight },
          },
          orderBy: { startedAt: 'desc' },
        }).catch(() => null);

        if (latestExecToday) {
          if (latestExecToday.status === 'COMPLETED') {
            this.logger.log(`Auto-start: ${strategy.name} was marked COMPLETED today (target/trade limit reached) — skipping auto-start`);
            continue;
          }
          if (latestExecToday.status === 'STOPPED') {
            this.logger.log(`Auto-start: ${strategy.name} was marked STOPPED today — skipping auto-start`);
            continue;
          }
        }

        // Check if strategy's maxTradesPerDay was already reached in DB today
        let maxTrades = 1;
        try {
          const cfg = JSON.parse(strategy.config || '{}');
          if (cfg.maxTradesPerDay) maxTrades = Number(cfg.maxTradesPerDay);
        } catch { }

        const todayCompletedOrdersCount = await this.prisma.order.count({
          where: {
            strategyId: strategy.id,
            createdAt: { gte: todayMidnight },
            status: 'COMPLETE',
            side: 'BUY',
          },
        }).catch(() => 0);

        if (todayCompletedOrdersCount >= maxTrades) {
          this.logger.log(`Auto-start: ${strategy.name} already executed ${todayCompletedOrdersCount}/${maxTrades} trades today — skipping auto-start`);
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

        // Verify broker session token health via deterministic timestamp
        const nowMs = Date.now();
        const hasFreshExpiry = account.tokenExpiry && new Date(account.tokenExpiry).getTime() > nowMs;

        if (!hasFreshExpiry) {
          this.logger.warn(`Auto-start: ${strategy.name} — broker session token is EXPIRED or not refreshed for today. Please log in to your broker before trading.`);
          continue;
        }

        // Token has valid expiry for today — ensure account tokenHealth is marked HEALTHY
        if (account.tokenHealth !== 'HEALTHY') {
          await this.prisma.brokerAccount.update({
            where: { id: account.id },
            data: { tokenHealth: 'HEALTHY', lastHealthCheckAt: new Date() },
          }).catch(() => {});
          account.tokenHealth = 'HEALTHY';
          this.logger.log(`Auto-start: Verified fresh active session for ${strategy.name}. Status: HEALTHY.`);
        }

        // Verify that the user's Kill Switch is NOT active
        const user = await this.prisma.user.findUnique({
          where: { id: strategy.userId },
          select: { killSwitchActive: true },
        });

        if (user?.killSwitchActive) {
          this.logger.warn(`Auto-start: ${strategy.name} — Kill Switch is ACTIVE for user ${strategy.userId}. Skipped for safety.`);
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

          // Get all algo orders placed today for this broker account
          const algoOrdersToday = await this.prisma.order.findMany({
            where: {
              brokerAccountId: account.id,
              createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
            select: { brokerOrderId: true, symbol: true },
          });
          const algoBrokerOrderIds = new Set(algoOrdersToday.map(o => o.brokerOrderId).filter(Boolean));
          const algoSymbols = new Set(algoOrdersToday.map(o => o.symbol));

          // Cancel open/trigger pending orders to avoid stray executions (Algo orders ONLY)
          try {
            const openOrders = await kite.getOrders();
            const pendingOrders = (openOrders || []).filter(
              (o: any) => o.status === 'OPEN' || o.status === 'TRIGGER PENDING'
            );
            for (const po of pendingOrders) {
              if (algoBrokerOrderIds.has(po.order_id) || algoSymbols.has(po.tradingsymbol)) {
                await kite.cancelOrder('regular', po.order_id).catch(() => {});
                this.logger.warn(`🛡 [RMS Safety Net] Cancelled pending algo order ${po.order_id} (${po.tradingsymbol})`);
              } else {
                this.logger.log(`🛡 [RMS Safety Net] Preserving user manual order ${po.order_id} (${po.tradingsymbol})`);
              }
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

            // CRITICAL: NEVER exit NRML, CNC, or manual user positions!
            // Only consider MIS positions that were placed by our algo today.
            if (qty !== 0 && product === 'MIS') {
              if (!algoSymbols.has(pos.tradingsymbol)) {
                this.logger.log(
                  `🛡 [RMS Safety Net] Skipping MIS position ${pos.tradingsymbol} - Not placed by any algo strategy today (Manual position preserved).`
                );
                continue;
              }

              const exitSide = qty > 0 ? 'SELL' : 'BUY';
              const exitQty = Math.abs(qty);
              this.logger.warn(
                `🚨 [RMS Safety Net] Found open algo MIS position on Zerodha: ${pos.exchange}:${pos.tradingsymbol} (Qty: ${qty}). Placing emergency MARKET exit to avoid ₹50+GST penalty!`
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

  // ── RMS Daily Loss Watchdog Helper ──────────────────────────────────────────
  private async monitorDailyLosses() {
    try {
      const activeStrats = await this.prisma.strategy.findMany({
        where: { isActive: true },
        select: { userId: true },
      });
      const uniqueUserIds = Array.from(new Set(activeStrats.map((s) => s.userId)));
      for (const uid of uniqueUserIds) {
        await this.riskService.checkAndEnforceDailyLoss(uid);
      }
    } catch (err: any) {
      this.logger.debug(`RMS monitorDailyLosses notice: ${err?.message}`);
    }
  }

  // ─── Helper ─────────────────────────────────────────────────────────────────

  private getEngine(type: string) {
    if (type === 'BREAKOUT_15MIN') return this.breakoutEngine;
    if (type === 'EMA_VWAP_CROSSOVER') return this.emaVwapEngine;
    if (type === 'STOCK_OPTIONS_BUYING') return this.stockOptionsBuyingEngine;
    if (type === 'NIFTY_OPTIONS_SCALPER') return this.niftyOptionsScalperEngine;
    if (type === 'GAMMA_BLAST_EXPIRY') return this.gammaBlastEngine;
    return null;
  }
}
