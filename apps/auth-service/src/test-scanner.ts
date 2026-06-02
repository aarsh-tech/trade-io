import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwingScannerService } from './swing-scanner/swing-scanner.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const scannerService = app.get(SwingScannerService);
  
  const userId = 'cmo1rohby0000ui9wy9pjdg41'; // from database
  
  console.log('🚀 Running swing scan via test script...');
  try {
    const res = await scannerService.runScan(userId);
    console.log('✅ Scan complete!');
    console.log('Scanned count:', res.totalScanned);
    console.log('Results count:', res.results.length);
    if (res.results.length > 0) {
      console.log('Sample result:', JSON.stringify(res.results[0], null, 2));
    }
  } catch (err) {
    console.error('❌ Scan execution failed with error:', err);
  } finally {
    await app.close();
  }
}

bootstrap();
