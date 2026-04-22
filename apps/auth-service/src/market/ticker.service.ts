import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { MarketGateway } from './market.gateway';
import { BrokerClientFactory } from '../brokers/broker-client.factory';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerType } from '@prisma/client';

@Injectable()
export class TickerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TickerService.name);
  private tickers = new Map<string, any>();
  private refreshInterval: NodeJS.Timeout;

  constructor(
    private readonly marketGateway: MarketGateway,
    private readonly brokerFactory: BrokerClientFactory,
    private readonly prisma: PrismaService,
  ) { }

  async onModuleInit() {
    this.logger.log('Initializing Ticker Service...');
    await this.syncTickers();

    this.refreshInterval = setInterval(() => this.syncTickers(), 60000);
  }

  onModuleDestroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.tickers.forEach((ticker) => ticker.disconnect());
  }

  /**
   * Sync tickers based on active strategies and connected brokers
   */
  async syncTickers() {
    try {
      // Find all active strategies to see which symbols we need to monitor
      const activeStrategies = await this.prisma.strategy.findMany({
        where: { isActive: true },
        select: {
          brokerAccountId: true,
          config: true,
        }
      });

      // Group symbols by broker account
      const symbolsByAccount = new Map<string, Set<string>>();
      activeStrategies.forEach((s) => {
        if (!s.brokerAccountId) return;
        if (!symbolsByAccount.has(s.brokerAccountId)) {
          symbolsByAccount.set(s.brokerAccountId, new Set());
        }

        try {
          const config = JSON.parse(s.config as string);
          if (config.symbol) {
            symbolsByAccount.get(s.brokerAccountId).add(config.symbol);
          }
        } catch (e) {
          this.logger.error(`Error parsing strategy config for ticker: ${e.message}`);
        }
      });

      // For each account, ensure a ticker is running and subscribed
      for (const [accountId, symbols] of symbolsByAccount.entries()) {
        await this.ensureTickerRunning(accountId, Array.from(symbols));
      }
    } catch (err) {
      this.logger.error(`Failed to sync tickers: ${err.message}`);
    }
  }

  private async ensureTickerRunning(accountId: string, symbols: string[]) {
    if (this.tickers.has(accountId)) {
      // Already running, just update subscriptions if needed
      // Note: Real implementation would handle incremental subscription changes
      return;
    }

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: accountId } });
    if (!account || !account.accessToken) return;

    if (account.broker === BrokerType.ZERODHA) {
      this.setupZerodhaTicker(account, symbols);
    }
    // Add other brokers here...
  }

  private setupZerodhaTicker(account: any, symbols: string[]) {
    try {
      const { KiteTicker } = require('kiteconnect');
      const apiKey = require('../common/utils/crypto').decrypt(account.apiKeyEnc);

      const ticker = new KiteTicker({
        api_key: apiKey,
        access_token: account.accessToken,
      });

      ticker.on('ticks', (ticks: any[]) => {
        const mappedTicks: Record<string, number> = {};
        ticks.forEach((tick) => {
          // Zerodha uses instrument_token, we might need a mapping to tradingsymbol
          // For simplicity in this demo, we assume the gateway handles tokens or symbols
          // In production, we'd maintain a token -> symbol map
          mappedTicks[tick.instrument_token.toString()] = tick.last_price;
        });
        this.marketGateway.broadcastTicks(mappedTicks);
      });

      ticker.on('connect', () => {
        this.logger.log(`Zerodha Ticker connected for account ${account.clientId}`);
        // Subscribe to instruments (need tokens)
        // ticker.subscribe([tokens]);
      });

      ticker.connect();
      this.tickers.set(account.id, ticker);
    } catch (err) {
      this.logger.error(`Failed to setup Zerodha Ticker for ${account.id}: ${err.message}`);
    }
  }
}
