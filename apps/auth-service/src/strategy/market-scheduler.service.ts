import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PositionFlattener } from '../order-gateway/position-flattener.service';
import { Breakout15MinEngine } from './breakout15min.engine';
import { EmaVwapCrossoverEngine } from './emavwap.engine';
import { StockOptionsBuyingEngine } from './stock-options-buying.engine';
import { NiftyOptionsScalperEngine } from './nifty-options-scalper.engine';
import { GammaBlastExpiryEngine } from './gamma-blast-expiry.engine';
import { RiskService } from '../risk/risk.service';
import { isTradingDay, closedReason } from '../market/market-calendar';

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

  /** Process start time; boot reconciliation waits a few seconds for tickers/DB to settle. */
  private readonly bootAt = Date.now();
  private bootReconciled = false;

  /**
   * Strategy IDs that the user explicitly stopped during the current
   * server session.  The scheduler will not restart these until the
   * next calendar day (i.e. the next auto-start cycle).
   */
  private readonly manuallyStoppedToday = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly flattener: PositionFlattener,
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
    // Mid-session restarts are handled by reconcileOnBoot() once the process has settled
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
    if (!isTradingDay()) {
      this.logger.log(`MarketScheduler: immediate auto-start skipped — market closed today (${closedReason()})`);
      return;
    }
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

    // ── Boot reconciliation (once per process, ~5s after start) ─────────────────
    if (!this.bootReconciled && Date.now() - this.bootAt >= 5_000) {
      this.bootReconciled = true;
      await this.reconcileOnBoot(ist, day);
    }

    // Skip auto-start/auto-stop on weekends and exchange holidays
    if (!isTradingDay(now)) {
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

    // ── Auto-start at Market Open ─────────────────────────────────────────────
    // Fires once per IST day for all strategies with autoStart=true (or still active from before a
    // restart). The session-wide window (not just 09:15-09:16) makes a late start or a restart
    // idempotent: per-strategy guards in autoStartStrategies() skip anything already running,
    // stopped, or completed today.
    if (hhmm >= MARKET_OPEN && hhmm < 15 * 60 + 25) {
      const todayKey = ist.toDateString();
      if (this.lastAutoStartDate !== todayKey) {
        this.lastAutoStartDate = todayKey;
        this.manuallyStoppedToday.clear();
        this.logger.log('🔔 Market session — auto-starting configured strategies for today...');
        await this.autoStartStrategies(true);
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

  // ── Boot recovery ───────────────────────────────────────────────────────────

  /**
   * Runs once after a (re)start. During the trading session it re-starts every strategy that was
   * still active when the process died (engine.start re-adopts open broker positions), then closes
   * any execution/isActive flag left dangling so the UI never shows a dead strategy as running.
   * A user stop clears isActive/autoStart in the DB, so manually stopped strategies stay stopped.
   */
  private async reconcileOnBoot(ist: Date, day: number) {
    try {
      const hhmm = ist.getHours() * 60 + ist.getMinutes();
      const inSession = isTradingDay() && hhmm >= 9 * 60 + 15 && hhmm < 15 * 60 + 25;
      if (!isTradingDay()) {
        this.logger.log(`Boot recovery: market closed today (${closedReason()}) — not resuming strategies`);
      }
      if (inSession) {
        this.lastAutoStartDate = ist.toDateString();
        this.logger.log('♻ Boot recovery: resuming strategies that were active before restart...');
        await this.autoStartStrategies(true);
      }

      const strategies = await this.prisma.strategy.findMany({
        select: { id: true, type: true, name: true, isActive: true },
      });
      for (const strategy of strategies) {
        const engine = this.getEngine(strategy.type as string);
        if (engine?.isRunning(strategy.id)) continue;
        await this.prisma.strategyExecution.updateMany({
          where: { strategyId: strategy.id, status: 'RUNNING' },
          data: { status: 'STOPPED', stoppedAt: new Date() },
        });
        if (strategy.isActive) {
          await this.prisma.strategy.update({ where: { id: strategy.id }, data: { isActive: false } });
          this.logger.warn(`Boot recovery: "${strategy.name}" could not be resumed — marked inactive`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Boot recovery error: ${err?.message}`);
    }
  }

  // ── Auto-start all strategies marked autoStart=true ──────────────────────────

  private async autoStartStrategies(includeActive = false) {
    try {
      const strategies = await this.prisma.strategy.findMany({
        where: (includeActive ? { OR: [{ autoStart: true }, { isActive: true }] } : { autoStart: true }) as any,
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

        // A strategy still flagged active was running when the process died: never skip it on the trade
        // cap here — it may hold an open position that the engine must re-adopt (the engine itself
        // completes the strategy if there is nothing to recover).
        if (!strategy.isActive && todayCompletedOrdersCount >= maxTrades) {
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

      // 2. Broker safety net via the OrderGateway: cancel stray algo orders and flatten any
      //    algo MIS position still open (MARKET, market_protection -1, retried, alerts on failure).
      const activeAccounts = await this.prisma.brokerAccount.findMany({
        where: { isActive: true, accessToken: { not: null } },
      });

      for (const account of activeAccounts) {
        try {
          const res = await this.flattener.flattenAlgoPositions(account, 'EOD SQUARE-OFF');
          if (res.cancelled || res.closed.length || res.failed.length) {
            this.logger.warn(
              `🛡 [RMS Safety Net] Account ${account.id}: cancelled ${res.cancelled}, closed [${res.closed.join(', ')}], FAILED [${res.failed.join(', ')}]`,
            );
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
