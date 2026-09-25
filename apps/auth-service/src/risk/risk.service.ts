import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { OrderParams } from '../brokers/interfaces/broker-client.interface';
import { Breakout15MinEngine } from '../strategy/breakout15min.engine';
import { EmaVwapCrossoverEngine } from '../strategy/emavwap.engine';
import { StockOptionsBuyingEngine } from '../strategy/stock-options-buying.engine';
import { NiftyOptionsScalperEngine } from '../strategy/nifty-options-scalper.engine';
import { GammaBlastExpiryEngine } from '../strategy/gamma-blast-expiry.engine';
import { UpdateRiskSettingsDto } from './dto/risk.dto';
import { OrderStatus } from '@prisma/client';
import { isKiteAuthError } from '../common/utils/kite-errors';

export interface ExchangeFreezeLimit {
  [symbolOrPrefix: string]: number;
}

const EXCHANGE_FREEZE_LIMITS: ExchangeFreezeLimit = {
  NIFTY: 1800,
  BANKNIFTY: 900,
  SENSEX: 500,
  FINNIFTY: 1800,
  MIDCPNIFTY: 2800,
  BANKEX: 600,
};

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  // In-memory sliding window for order rate limiting: key = `${userId}:${symbol}` -> timestamps[]
  private readonly orderTimestamps = new Map<string, number[]>();

  // In-memory idempotency deduplication cache: key = `${userId}:${symbol}:${side}:${qty}:${orderType}` -> timestamp
  private readonly recentOrders = new Map<string, number>();

  // Consecutive broker order rejection counter: key = `${userId}` -> count
  private readonly consecutiveRejections = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: BrokerClientFactory,
    @Inject(forwardRef(() => Breakout15MinEngine))
    private readonly breakoutEngine: Breakout15MinEngine,
    @Inject(forwardRef(() => EmaVwapCrossoverEngine))
    private readonly emaVwapEngine: EmaVwapCrossoverEngine,
    @Inject(forwardRef(() => StockOptionsBuyingEngine))
    private readonly stockOptionsEngine: StockOptionsBuyingEngine,
    @Inject(forwardRef(() => NiftyOptionsScalperEngine))
    private readonly niftyScalperEngine: NiftyOptionsScalperEngine,
    @Inject(forwardRef(() => GammaBlastExpiryEngine))
    private readonly gammaBlastEngine: GammaBlastExpiryEngine,
  ) {}

  /**
   * ── PRE-TRADE VALIDATION ──────────────────────────────────────────────────
   * Validates and clamps orders before they are transmitted to Zerodha / Angel.
   */
  async validateOrderSafety(
    userId: string,
    params: OrderParams,
    estimatedPrice?: number,
  ): Promise<{ approved: boolean; sanitizedQty: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        maxDailyLoss: true,
        maxOrderValue: true,
        maxOrderQty: true,
        killSwitchActive: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found for RMS evaluation');
    }

    // 1. Kill Switch Check
    if (user.killSwitchActive) {
      const msg = `🛑 [RMS KILL SWITCH] Trading is currently locked for user ${userId}. All new order placement is suspended!`;
      this.logger.warn(msg);
      throw new BadRequestException(msg);
    }

    // 2. Determine Maximum Allowed Quantity (Freeze limit & user config)
    const upperSym = (params.symbol || '').toUpperCase().trim();
    let maxAllowedQty = user.maxOrderQty || 1800;

    for (const [prefix, freezeLimit] of Object.entries(EXCHANGE_FREEZE_LIMITS)) {
      if (upperSym.includes(prefix)) {
        maxAllowedQty = Math.min(maxAllowedQty, freezeLimit);
        break;
      }
    }

    const orderQty = Number(params.qty) || 0;
    if (orderQty <= 0) {
      throw new BadRequestException(`🛑 [RMS SAFETY] Invalid order quantity: ${orderQty}`);
    }

    if (orderQty > maxAllowedQty) {
      const msg = `🛑 [RMS FREEZE CLAMP] Order quantity ${orderQty} exceeds allowed maximum of ${maxAllowedQty} for ${params.symbol}. Order rejected to protect margin and prevent exchange rejection.`;
      this.logger.warn(msg);
      throw new BadRequestException(msg);
    }

    // 3. Max Order Value Clamp (Fat-Finger Guard)
    const effectivePrice = Number(params.price) || Number(params.triggerPrice) || Number(estimatedPrice) || 0;
    if (effectivePrice > 0 && user.maxOrderValue) {
      const totalOrderValue = orderQty * effectivePrice;
      if (totalOrderValue > user.maxOrderValue) {
        const msg = `🛑 [RMS FAT-FINGER GUARD] Order value ₹${totalOrderValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })} exceeds maximum permitted order value ₹${user.maxOrderValue.toLocaleString('en-IN')}.`;
        this.logger.warn(msg);
        throw new BadRequestException(msg);
      }
    }

    // 4. Order Rate Limiting (Rapid-Fire / Runaway Loop Breaker - Entries ONLY)
    const isExitOrSl = Boolean(
      params.tag?.toUpperCase().includes('EXIT') ||
      params.tag?.toUpperCase().includes('SL') ||
      params.tag?.toUpperCase().includes('TARGET') ||
      params.tag?.toUpperCase().includes('SQUARE') ||
      params.orderType === 'SL' ||
      params.orderType === 'SL-M'
    );

    // Exits and Stop-Loss orders are NEVER rate-limited to ensure positions can always be closed
    if (!isExitOrSl) {
      const rateKey = `${userId}:${upperSym}`;
      const now = Date.now();
      const windowMs = 60_000;
      const maxOrdersPerWindow = 10;

      const timestamps = (this.orderTimestamps.get(rateKey) || []).filter(
        (ts) => now - ts < windowMs,
      );

      if (timestamps.length >= maxOrdersPerWindow) {
        const msg = `🛑 [RMS RUNAWAY BREAKER] Rate limit exceeded: ${timestamps.length} entry orders placed for ${upperSym} within 60 seconds. Order blocked to prevent runaway loops.`;
        this.logger.warn(msg);
        throw new BadRequestException(msg);
      }

      // 5. 2-Second Idempotency / Deduplication Window (Entries ONLY)
      const dedupKey = `${userId}:${upperSym}:${params.side}:${params.qty}:${params.orderType}:${params.price || 0}`;
      const lastDedupTime = this.recentOrders.get(dedupKey) || 0;
      if (now - lastDedupTime < 2_000) {
        const msg = `🛑 [RMS DEDUP] Identical entry order for ${upperSym} detected within 2 seconds. Blocked to prevent double submission.`;
        this.logger.warn(msg);
        throw new BadRequestException(msg);
      }

      // Record order timestamp
      timestamps.push(now);
      this.orderTimestamps.set(rateKey, timestamps);
      this.recentOrders.set(dedupKey, now);
    }

    return { approved: true, sanitizedQty: orderQty };
  }

  /**
   * Records consecutive broker rejections to trip circuit breaker if broker repeatedly errors
   */
  recordBrokerRejection(userId: string, reason: string): void {
    const count = (this.consecutiveRejections.get(userId) || 0) + 1;
    this.consecutiveRejections.set(userId, count);
    this.logger.warn(`⚠️ [RMS Circuit Breaker] User ${userId} consecutive broker rejection #${count}: ${reason}`);

    if (count >= 3) {
      this.logger.error(
        `🚨 [RMS Circuit Breaker Tripped] 3 consecutive broker order rejections for user ${userId}. Halting strategy entries.`,
      );
    }
  }

  recordBrokerSuccess(userId: string): void {
    this.consecutiveRejections.delete(userId);
  }

  /**
   * ── LIVE P&L MONITORING & RISK STATUS ────────────────────────────────────
   */
  async getRiskStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        maxDailyLoss: true,
        maxOrderValue: true,
        maxOrderQty: true,
        killSwitchActive: true,
        killSwitchTriggeredAt: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Calculate today's realized P&L from orders
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const completedOrders = await this.prisma.order.findMany({
      where: {
        userId,
        status: OrderStatus.COMPLETE,
        createdAt: { gte: startOfToday },
        isPaperTrade: false,
      },
    });

    // Approximate realized P&L from today's matched buys & sells
    let realizedPnl = 0;
    const buysBySymbol = new Map<string, { qty: number; cost: number }>();

    for (const ord of completedOrders) {
      const sym = ord.symbol;
      const price = ord.avgPrice || ord.price || 0;
      const qty = ord.filledQty || ord.qty;

      if (ord.side === 'BUY') {
        const cur = buysBySymbol.get(sym) || { qty: 0, cost: 0 };
        buysBySymbol.set(sym, { qty: cur.qty + qty, cost: cur.cost + qty * price });
      } else if (ord.side === 'SELL') {
        const cur = buysBySymbol.get(sym);
        if (cur && cur.qty > 0) {
          const matchedQty = Math.min(qty, cur.qty);
          const avgBuyPrice = cur.cost / cur.qty;
          realizedPnl += matchedQty * (price - avgBuyPrice);
          cur.qty -= matchedQty;
          cur.cost -= matchedQty * avgBuyPrice;
        }
      }
    }

    // Calculate live unrealized P&L from active broker accounts
    let unrealizedPnl = 0;
    const brokerAccounts = await this.prisma.brokerAccount.findMany({
      where: { userId, isActive: true, accessToken: { not: null } },
    });

    for (const acc of brokerAccounts) {
      try {
        const client = this.factory.createClient(acc);
        const positions = await client.getPositions();
        for (const pos of positions) {
          unrealizedPnl += Number(pos.pnl || 0);
        }
      } catch (err: any) {
        this.logger.debug(`Could not fetch live positions for account ${acc.id}: ${err.message}`);
      }
    }

    const totalDailyPnl = Number((realizedPnl + unrealizedPnl).toFixed(2));
    const maxDailyLoss = user.maxDailyLoss || 5000;
    const lossUsagePct =
      totalDailyPnl < 0
        ? Math.min(100, parseFloat(((Math.abs(totalDailyPnl) / maxDailyLoss) * 100).toFixed(1)))
        : 0;

    return {
      userId,
      killSwitchActive: user.killSwitchActive,
      killSwitchTriggeredAt: user.killSwitchTriggeredAt,
      maxDailyLoss,
      maxOrderValue: user.maxOrderValue || 200000,
      maxOrderQty: user.maxOrderQty || 1800,
      realizedPnl: Number(realizedPnl.toFixed(2)),
      unrealizedPnl: Number(unrealizedPnl.toFixed(2)),
      totalDailyPnl,
      lossUsagePct,
      isLossLimitBreached: totalDailyPnl <= -Math.abs(maxDailyLoss),
    };
  }

  /**
   * Periodically called by MarketSchedulerService to check daily loss thresholds
   */
  async checkAndEnforceDailyLoss(userId: string): Promise<boolean> {
    const status = await this.getRiskStatus(userId);
    if (!status.killSwitchActive && status.isLossLimitBreached) {
      this.logger.warn(
        `🚨 [RMS BREACH DETECTED] User ${userId} daily loss (₹${status.totalDailyPnl}) exceeded limit of ₹${status.maxDailyLoss}. Triggering automated Emergency Kill Switch!`,
      );
      await this.triggerKillSwitch(
        userId,
        `Automated RMS: Daily loss limit ₹${status.maxDailyLoss} exceeded (Current P&L: ₹${status.totalDailyPnl})`,
      );
      return true;
    }
    return false;
  }

  /**
   * ── EMERGENCY KILL SWITCH ─────────────────────────────────────────────────
   * 1. Cancels all pending/trigger orders on broker
   * 2. Calls squareOff() on all active strategy engines
   * 3. Stops running strategies
   * 4. Marks killSwitchActive = true in DB to block new orders today
   */
  async triggerKillSwitch(userId: string, reason: string = 'Manual emergency shutdown') {
    this.logger.warn(`🛑 [KILL SWITCH INITIATED] For User: ${userId} | Reason: ${reason}`);

    // 1. Flag in database immediately
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        killSwitchActive: true,
        killSwitchTriggeredAt: new Date(),
      },
    });

    // 2. Fetch all active strategies for this user
    const strategies = await this.prisma.strategy.findMany({
      where: { userId },
      include: { brokerAccount: true },
    });

    // 3. Square off all running strategies and stop them
    for (const strat of strategies) {
      const engine = this.getEngine(strat.type as string);
      if (engine && engine.isRunning(strat.id)) {
        try {
          if ((engine as any).squareOff) {
            this.logger.warn(`🛑 [KILL SWITCH] Squaring off positions for strategy "${strat.name}"...`);
            await (engine as any).squareOff(strat.id);
          }
          await engine.stop(strat.id);
          this.logger.log(`⏹ [KILL SWITCH] Stopped strategy "${strat.name}"`);
        } catch (err: any) {
          this.logger.error(`Error stopping/squaring off strategy ${strat.name}: ${err?.message}`);
        }
      }
    }

    // 4. Broker Direct Safety Clean-up: Cancel pending orders and square off any remaining algo MIS positions
    const brokerAccounts = await this.prisma.brokerAccount.findMany({
      where: { userId, isActive: true, accessToken: { not: null } },
    });

    for (const acc of brokerAccounts) {
      try {
        const client = this.factory.createClient(acc);
        const kite = client['kite'];
        if (!kite) continue;

        // Fetch algo orders placed today to only cancel algo orders
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const todayAlgoOrders = await this.prisma.order.findMany({
          where: {
            userId,
            brokerAccountId: acc.id,
            createdAt: { gte: startOfToday },
          },
          select: { brokerOrderId: true, symbol: true },
        });

        const algoOrderIds = new Set(todayAlgoOrders.map((o) => o.brokerOrderId).filter(Boolean));
        const algoSymbols = new Set(todayAlgoOrders.map((o) => o.symbol));

        // Cancel open/trigger pending broker orders
        const openOrders = await kite.getOrders().catch(() => []);
        const pending = (openOrders || []).filter(
          (o: any) => o.status === 'OPEN' || o.status === 'TRIGGER PENDING',
        );

        for (const po of pending) {
          if (algoOrderIds.has(po.order_id) || algoSymbols.has(po.tradingsymbol)) {
            await kite.cancelOrder('regular', po.order_id).catch(() => {});
            this.logger.log(`🧹 [KILL SWITCH] Cancelled pending broker order: ${po.order_id} (${po.tradingsymbol})`);
          }
        }

        // Direct Broker Position Square-Off for open MIS algo positions
        const positionsData = await kite.getPositions().catch(() => null);
        const netPositions = positionsData?.net || [];

        for (const pos of netPositions) {
          const qty = Number(pos.quantity);
          const product = String(pos.product).toUpperCase();

          if (qty !== 0 && product === 'MIS' && algoSymbols.has(pos.tradingsymbol)) {
            const exitSide = qty > 0 ? 'SELL' : 'BUY';
            const exitQty = Math.abs(qty);
            this.logger.warn(
              `🚨 [KILL SWITCH] Emergency market square-off on Zerodha: ${pos.tradingsymbol} (Qty: ${exitQty}, Side: ${exitSide})`,
            );
            await kite.placeOrder('regular', {
              exchange: pos.exchange,
              tradingsymbol: pos.tradingsymbol,
              transaction_type: exitSide,
              quantity: exitQty,
              product: 'MIS',
              order_type: 'MARKET',
            }).catch((err: any) => {
              this.logger.error(`Failed emergency market square-off for ${pos.tradingsymbol}: ${err?.message}`);
            });
          }
        }
      } catch (err: any) {
        this.logger.error(`Kill switch broker cleanup failed for account ${acc.id}: ${err?.message}`);
      }
    }

    return {
      success: true,
      message: `Kill Switch successfully executed. All algo positions flattened, orders cancelled, and trading suspended. Reason: ${reason}`,
      triggeredAt: new Date(),
    };
  }

  /**
   * Resets the Kill Switch so trading can be manually resumed
   */
  async resetKillSwitch(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        killSwitchActive: false,
        killSwitchTriggeredAt: null,
      },
    });

    this.consecutiveRejections.delete(userId);
    this.logger.log(`✅ [KILL SWITCH RESET] Trading safety lock released for user ${userId}`);

    return {
      success: true,
      message: 'Kill Switch has been reset. Trading is re-enabled.',
    };
  }

  /**
   * Update User Risk Settings
   */
  async updateRiskSettings(userId: string, dto: UpdateRiskSettingsDto) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.maxDailyLoss !== undefined && { maxDailyLoss: dto.maxDailyLoss }),
        ...(dto.maxOrderValue !== undefined && { maxOrderValue: dto.maxOrderValue }),
        ...(dto.maxOrderQty !== undefined && { maxOrderQty: dto.maxOrderQty }),
      },
      select: {
        id: true,
        maxDailyLoss: true,
        maxOrderValue: true,
        maxOrderQty: true,
        killSwitchActive: true,
      },
    });

    return {
      success: true,
      data: updated,
      message: 'Risk settings updated successfully',
    };
  }

  /**
   * ── PRE-MARKET BROKER SESSION & TOKEN HEALTH CHECKER ─────────────────────
   * Runs at 08:30 AM IST (or on-demand) to verify that broker tokens are alive.
   */
  async checkBrokerSessionHealth(userId?: string) {
    const whereClause: any = { isActive: true, accessToken: { not: null } };
    if (userId) {
      whereClause.userId = userId;
    }

    const accounts = await this.prisma.brokerAccount.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    const results: Array<{
      accountId: string;
      broker: string;
      userId: string;
      userEmail: string;
      tokenHealth: 'HEALTHY' | 'EXPIRED' | 'UNKNOWN';
      message: string;
    }> = [];

    for (const acc of accounts) {
      try {
        const client = this.factory.createClient(acc);
        if (client.getProfile) {
          await client.getProfile();
        } else {
          await client.getMargins();
        }

        await this.prisma.brokerAccount.update({
          where: { id: acc.id },
          data: {
            tokenHealth: 'HEALTHY',
            lastHealthCheckAt: new Date(),
          },
        });

        results.push({
          accountId: acc.id,
          broker: acc.broker,
          userId: acc.userId,
          userEmail: acc.user?.email || '',
          tokenHealth: 'HEALTHY',
          message: 'Broker session token is valid and active.',
        });
      } catch (err: any) {
        // Only a genuine Kite TokenException / HTTP 403 means the session is dead.
        // Network errors, 429s and 5xx are transient: keep the previous health value.
        const isAuthError = isKiteAuthError(err);

        if (isAuthError) {
          await this.prisma.brokerAccount.update({
            where: { id: acc.id },
            data: { tokenHealth: 'EXPIRED', lastHealthCheckAt: new Date() },
          });

          this.logger.warn(
            `⚠️ [Broker Health Check Failed] Account ${acc.id} (${acc.broker}) for ${acc.user?.email}: ${err.message}`,
          );

          results.push({
            accountId: acc.id,
            broker: acc.broker,
            userId: acc.userId,
            userEmail: acc.user?.email || '',
            tokenHealth: 'EXPIRED',
            message: `Broker token expired or invalid: ${err.message}. Please re-login before market open at 09:15 AM IST!`,
          });
        } else {
          await this.prisma.brokerAccount.update({
            where: { id: acc.id },
            data: { lastHealthCheckAt: new Date() },
          });

          this.logger.warn(
            `⚠️ [Broker Health Check Inconclusive] Account ${acc.id} (${acc.broker}) for ${acc.user?.email}: ${err?.message || err} (transient, token status unchanged)`,
          );

          results.push({
            accountId: acc.id,
            broker: acc.broker,
            userId: acc.userId,
            userEmail: acc.user?.email || '',
            tokenHealth: 'UNKNOWN',
            message: `Could not verify broker session (temporary error: ${err?.message || 'unknown'}). Token status left unchanged; will retry.`,
          });
        }
      }
    }

    return results;
  }

  // ── Engine Helper ─────────────────────────────────────────────────────────
  private getEngine(type: string) {
    if (type === 'BREAKOUT_15MIN') return this.breakoutEngine;
    if (type === 'EMA_VWAP_CROSSOVER') return this.emaVwapEngine;
    if (type === 'STOCK_OPTIONS_BUYING') return this.stockOptionsEngine;
    if (type === 'NIFTY_OPTIONS_SCALPER') return this.niftyScalperEngine;
    if (type === 'GAMMA_BLAST_EXPIRY') return this.gammaBlastEngine;
    return null;
  }
}
