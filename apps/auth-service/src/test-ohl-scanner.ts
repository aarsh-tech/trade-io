import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { OhlScannerService } from './market/ohl-scanner.service';

async function bootstrap() {
  console.log('🚀 Testing OhlScannerService...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const scanner = app.get(OhlScannerService);

  try {
    const res = await scanner.scan(undefined, 'fno', 0.05, 'all');
    console.log('✅ Scan successful!');
    console.log('Total stocks scanned:', res.totalScanned);
    console.log('Summary:', res.summary);
    console.log('\n--- TOP 5 STOCKS ---');
    res.stocks.slice(0, 5).forEach((s) => {
      console.log(
        `${s.symbol} | LTP: ₹${s.ltp} | Open: ₹${s.open} | High: ₹${s.high} | Low: ₹${s.low} | Signal: ${s.signal} (${s.signalType}) | O-L Diff: ${s.diffOpenLowPct}% | O-H Diff: ${s.diffOpenHighPct}%`
      );
    });

    const openLow = res.stocks.filter((s) => s.signal === 'OPEN_LOW');
    console.log(`\n🟢 Open = Low Stocks (${openLow.length}):`, openLow.map((s) => s.symbol).join(', ') || 'None in sample');

    const openHigh = res.stocks.filter((s) => s.signal === 'OPEN_HIGH');
    console.log(`🔴 Open = High Stocks (${openHigh.length}):`, openHigh.map((s) => s.symbol).join(', ') || 'None in sample');
  } catch (err) {
    console.error('❌ Scan error:', err);
  } finally {
    await app.close();
  }
}

bootstrap();
