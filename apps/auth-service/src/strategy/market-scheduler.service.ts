import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Breakout15MinEngine } from './breakout15min.engine';
import { EmaVwapCrossoverEngine } from './emavwap.engine';
import { EmaRsiOptionsEngine } from './ema-rsi-options.engine';

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
   * Strategy IDs that the user explicitly stopped during the current
   * server session.  The scheduler will not restart these until the
   * next calendar day (i.e. the next auto-start cycle).
   */
  private readonly manuallyStoppedToday = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly breakoutEngine: Breakout15MinEngine,
    private readonly emaVwapEngine: EmaVwapCrossoverEngine,
    private readonly emaRsiEngine: EmaRsiOptionsEngine,
  ) {}

  onModuleInit() {
    this.logger.log('Market Scheduler initialised — will auto-start strategies at 09:15 IST');
    // Check immediately on boot (handles the case where the server restarts mid-session)
    this.checkAndAct().catch((e) => this.logger.error(e));
    // Then every 60 s
    this.timer = setInterval(() => this.checkAndAct().catch((e) => this.logger.error(e)), 60_000);
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
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const h = ist.getHours();
    const m = ist.getMinutes();
    const hhmm = h * 60 + m;

    const MARKET_OPEN  = 9 * 60 + 15; // 09:15
    const MARKET_CLOSE = 15 * 60 + 30; // 15:30

    // ── Auto-start window: 09:15 – 09:16 ────────────────────────────────────
    // Guard: fire at most once per calendar day so the 09:16 tick does
    // not re-start a strategy the user just stopped during the 09:15 tick.
    if (hhmm === MARKET_OPEN || hhmm === MARKET_OPEN + 1) {
      const todayKey = ist.toDateString();
      if (this.lastAutoStartDate !== todayKey) {
        this.lastAutoStartDate = todayKey;
        // Reset the manual-stop exclusion list for the new trading day
        this.manuallyStoppedToday.clear();
        await this.autoStartStrategies();
      }
    }

    // ── Auto-stop: 15:30 – 15:31 ─────────────────────────────────────────────
    if (hhmm === MARKET_CLOSE || hhmm === MARKET_CLOSE + 1) {
      await this.autoStopStrategies();
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
    if (type === 'EMA_RSI_OPTIONS') return this.emaRsiEngine;
    return null;
  }
}
