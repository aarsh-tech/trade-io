const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./apps/auth-service/src/app.module');
const { BacktestService } = require('./apps/auth-service/src/backtest/backtest.service');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const backtestService = app.get(BacktestService);
  try {
    const res = await backtestService.runBacktest('cmo1rohby0000ui9wy9pjdg41', {
      strategyId: 'cmoizx7ea0003ui8wgod7kmtx',
      symbol: 'BANKNIFTY',
      exchange: 'NSE',
      fromDate: '2026-04-12',
      toDate: '2026-05-12',
      capital: 100000
    });
    console.log('Started:', res);
    
    // Wait for it to complete
    setTimeout(async () => {
      const { PrismaClient } = require('./node_modules/@prisma/client');
      const p = new PrismaClient();
      const b = await p.backtest.findUnique({ where: { id: res.id } });
      console.log('Result:', b);
      await p.$disconnect();
      await app.close();
    }, 5000);
  } catch(e) {
    console.error('Error:', e);
    await app.close();
  }
}
bootstrap();
