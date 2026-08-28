import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { BrokerClientFactory } from './brokers/broker-client.factory';
import { NIFTY_500_UNIVERSE } from './market/market.constants';


async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const factory = app.get(BrokerClientFactory);

  const account = await prisma.brokerAccount.findFirst({
    where: { isActive: true, accessToken: { not: null } },
  });

  if (!account?.accessToken) {
    console.log('No active broker token found.');
    await app.close();
    return;
  }

  const client = factory.createClient(account);
  const kite = (client as any)['kite'];

  console.log(`Scanning all ${NIFTY_500_UNIVERSE.length} Nifty 500 stocks for Top Gainers & Top Losers...`);

  const chunkSize = 150;
  const results: any[] = [];

  for (let i = 0; i < NIFTY_500_UNIVERSE.length; i += chunkSize) {
    const chunk = NIFTY_500_UNIVERSE.slice(i, i + chunkSize);
    const keys = chunk.map((s) => `NSE:${s}`);
    const quotes = await kite.getOHLC(keys).catch(() => ({}));

    for (const sym of chunk) {
      const q = quotes[`NSE:${sym}`] || quotes[sym];
      if (q && q.last_price > 0) {
        const ltp = q.last_price;
        const close = q.ohlc?.close || q.close_price || ltp;
        const change = ltp - close;
        const changePercent = close > 0 ? ((ltp - close) / close) * 100 : 0;
        results.push({
          symbol: sym,
          exchange: 'NSE',
          ltp: Number(ltp.toFixed(2)),
          change: Number(change.toFixed(2)),
          changePercent: Number(changePercent.toFixed(2)),
        });
      }
    }
  }

  const topGainers = [...results].sort((a, b) => b.changePercent - a.changePercent).slice(0, 10);
  const topLosers = [...results].sort((a, b) => a.changePercent - b.changePercent).slice(0, 10);

  console.log('\n================ TOP GAINERS (NIFTY 500) ================');
  topGainers.forEach((g, i) => {
    console.log(`${i + 1}. ${g.symbol} | LTP: ₹${g.ltp} | Change: +${g.changePercent}% (₹${g.change})`);
  });

  console.log('\n================ TOP LOSERS (NIFTY 500) ================');
  topLosers.forEach((l, i) => {
    console.log(`${i + 1}. ${l.symbol} | LTP: ₹${l.ltp} | Change: ${l.changePercent}% (₹${l.change})`);
  });

  await app.close();
}

main();
