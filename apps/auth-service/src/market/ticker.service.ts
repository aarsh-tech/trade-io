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

    this.refreshInterval = setInterval(() => this.syncTickers(), 10000);
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
          if (config.futureSymbol) { // Also subscribe to resolved futures if present
             symbolsByAccount.get(s.brokerAccountId).add(config.futureSymbol);
          }
        } catch (e) {
          this.logger.error(`Error parsing strategy config for ticker: ${e.message}`);
        }
      });

      // Add symbols subscribed by dashboard clients
      const dashboardSymbols = this.marketGateway.getSubscribedSymbols();
      
      // If no active strategies, we still want to provide dashboard ticks for the first available account
      let defaultAccount = activeStrategies[0]?.brokerAccountId;
      if (!defaultAccount && dashboardSymbols.length > 0) {
        const firstActive = await this.prisma.brokerAccount.findFirst({ where: { isActive: true, accessToken: { not: null } }});
        if (firstActive) defaultAccount = firstActive.id;
      }

      if (defaultAccount && dashboardSymbols.length > 0) {
        if (!symbolsByAccount.has(defaultAccount)) symbolsByAccount.set(defaultAccount, new Set());
        dashboardSymbols.forEach(sym => symbolsByAccount.get(defaultAccount).add(sym));
      }

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
      const tickerData = this.tickers.get(accountId);
      const currentTokens = new Set(tickerData.tokens);
      const newTokens = symbols.map(s => tickerData.symbolToToken.get(s)).filter(Boolean) as number[];
      
      const tokensToSubscribe = newTokens.filter(t => !currentTokens.has(t));
      if (tokensToSubscribe.length > 0) {
        this.logger.log(`Subscribing to ${tokensToSubscribe.length} new tokens for account ${accountId}`);
        tickerData.instance.subscribe(tokensToSubscribe);
        tickerData.instance.setMode(tickerData.instance.modeFull, tokensToSubscribe);
        tickerData.tokens = newTokens;
      }
      return;
    }

    const account = await this.prisma.brokerAccount.findUnique({ where: { id: accountId } });
    if (!account || !account.accessToken) return;

    if (account.broker === BrokerType.ZERODHA) {
      this.setupZerodhaTicker(account, symbols);
    }
    // Add other brokers here...
  }

  private async setupZerodhaTicker(account: any, symbols: string[]) {
    try {
      const { KiteTicker } = require('kiteconnect');
      const apiKey = require('../common/utils/crypto').decrypt(account.apiKeyEnc);

      const client = this.brokerFactory.createClient(account);
      const kite = (client as any)['kite'];
      
      // Fetch instruments to map symbol <-> token
      const instruments = await kite.getInstruments('NSE').catch(() => []);
      const bseInstruments = await kite.getInstruments('BSE').catch(() => []);
      const nfoInstruments = await kite.getInstruments('NFO').catch(() => []);
      
      const allInst = [...instruments, ...bseInstruments, ...nfoInstruments];
      const tokenToSymbol = new Map<number, string>();
      const symbolToToken = new Map<string, number>();
      
      // Add standard index tokens manually since they might be missing in some listings
      const indexMap: Record<string, number> = { 'NIFTY 50': 256265, 'BANKNIFTY': 260105, 'SENSEX': 265 };
      Object.entries(indexMap).forEach(([sym, tok]) => {
         tokenToSymbol.set(tok, sym);
         symbolToToken.set(sym, tok);
      });

      allInst.forEach((i: any) => {
        tokenToSymbol.set(i.instrument_token, i.tradingsymbol);
        symbolToToken.set(i.tradingsymbol, i.instrument_token);
      });

      const tokensToSubscribe = symbols.map(s => symbolToToken.get(s)).filter(Boolean) as number[];

      if (tokensToSubscribe.length === 0) return;

      const ticker = new KiteTicker({
        api_key: apiKey,
        access_token: account.accessToken,
      });

      ticker.on('ticks', (ticks: any[]) => {
        const mappedTicks: Record<string, number> = {};
        ticks.forEach((tick) => {
          const sym = tokenToSymbol.get(tick.instrument_token);
          if (sym && tick.last_price) {
            mappedTicks[sym] = tick.last_price;
          }
        });
        if (Object.keys(mappedTicks).length > 0) {
           this.marketGateway.broadcastTicks(mappedTicks);
        }
      });

      ticker.on('connect', () => {
        this.logger.log(`Zerodha Ticker connected for account ${account.clientId}`);
        ticker.subscribe(tokensToSubscribe);
        ticker.setMode(ticker.modeFull, tokensToSubscribe);
      });

      ticker.connect();
      this.tickers.set(account.id, {
        disconnect: () => ticker.disconnect(),
        instance: ticker,
        tokens: tokensToSubscribe,
        symbolToToken,
        tokenToSymbol,
      });
    } catch (err) {
      this.logger.error(`Failed to setup Zerodha Ticker for ${account.id}: ${err.message}`);
    }
  }
}
