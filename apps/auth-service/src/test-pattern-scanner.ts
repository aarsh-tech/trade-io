import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { BrokerClientFactory } from './brokers/broker-client.factory';
import { analyzeStock, DailyCandle } from './swing-scanner/vcp.analyzer';

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const factory = app.get(BrokerClientFactory);

  const account = await prisma.brokerAccount.findFirst({
    where: { isActive: true, accessToken: { not: null } },
  });

  if (!account?.accessToken) {
    console.log('No broker account found.');
    await app.close();
    return;
  }

  const client = factory.createClient(account);
  const kite = (client as any)['kite'];

  const testSymbols = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'LT', 'ITC', 'BAJFINANCE', 'TATAMOTORS', 'PERSISTENT', 'OFSS', 'CONCOR', 'WIPRO', 'HCLTECH', 'CROMPTON', 'VOLTAS', 'TRENT', 'BEL', 'HAL', 'DIVISLAB', 'DIXON'];

  console.log(`Testing pattern detection for ${testSymbols.length} sample stocks...`);

  const instruments = await kite.getInstruments('NSE').catch(() => []);
  const tokenMap = new Map<string, number>();
  instruments.forEach((i: any) => tokenMap.set(i.tradingsymbol, i.instrument_token));

  const counts: Record<string, number> = {
    VCP: 0,
    ROCKET_BASE: 0,
    TIGHT_AREA: 0,
    INTRADAY_MOMENTUM: 0,
    DAILY_INSIDE: 0,
    WEEKLY_INSIDE: 0,
    MONTHLY_INSIDE: 0,
  };

  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 365);

  for (const sym of testSymbols) {
    const token = tokenMap.get(sym);
    if (!token) continue;

    try {
      const raw = await kite.getHistoricalData(token, 'day', from, to);
      const candles: DailyCandle[] = raw.map((c: any) => ({
        date: new Date(c.date),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      const patterns = analyzeStock(sym, candles);
      console.log(`\nStock ${sym} (${candles.length} candles): ${patterns.length} patterns detected:`);
      patterns.forEach((p) => {
        counts[p.pattern] = (counts[p.pattern] || 0) + 1;
        console.log(`  - [${p.pattern}] Score: ${p.score} | Pivot: ₹${p.pivotPrice} | Risk: ${p.riskPct}% | Notes: ${p.notes[0]}`);
      });
    } catch (e: any) {
      console.log(`Error ${sym}: ${e.message}`);
    }
  }

  console.log('\n======================================');
  console.log('SUMMARY PATTERN COUNTS:');
  console.log(counts);
  console.log('======================================');

  await app.close();
}

test();
