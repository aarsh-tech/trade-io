import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerClientFactory } from '../brokers/broker-client.factory';

@Injectable()
export class MarketService {
  constructor(
    private prisma: PrismaService,
    private factory: BrokerClientFactory,
  ) { }

  async search(query: string, userId: string, accountId?: string) {
    // Find the broker account to use
    let account = null;
    if (accountId && accountId !== 'null' && accountId !== 'undefined') {
      account = await this.prisma.brokerAccount.findUnique({ where: { id: accountId } });
    } else {
      account = await this.prisma.brokerAccount.findFirst({
        where: { userId, accessToken: { not: null } },
      });
    }

    if (!account || !account.accessToken) {
      console.warn('Market search: no active broker session found.');
      return [];
    }

    let client: any;
    try {
      client = this.factory.createClient(account);
    } catch (e) {
      console.error('Market search: client creation failed:', e.message);
      return [];
    }


    // Use broker's native instrument search
    const instruments = await client.searchInstruments(query);

    if (!instruments || instruments.length === 0) return [];

    // Try to enrich with live LTP — silently skip if subscription not available
    try {
      const symbols = instruments.map((s: any) => `${s.exchange}:${s.symbol}`);
      const quotes = await client.getLTP(symbols);
      const hasQuotes = Object.keys(quotes).length > 0;
      return instruments.map((s: any) => ({
        ...s,
        ltpNSE: hasQuotes ? (quotes[`NSE:${s.symbol}`] || null) : null,
        ltpBSE: hasQuotes ? (quotes[`BSE:${s.symbol}`] || null) : null,
      }));
    } catch {
      // LTP not available — return instruments without price
      return instruments.map((s: any) => ({ ...s, ltpNSE: null, ltpBSE: null }));
    }
  }
}

