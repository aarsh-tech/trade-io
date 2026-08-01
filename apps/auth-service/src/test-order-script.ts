import { PrismaClient } from '@prisma/client';
import { BrokerClientFactory } from './brokers/broker-client.factory';

async function main() {
  const prisma = new PrismaClient();
  try {
    const accounts = await prisma.brokerAccount.findMany({ where: { isActive: true } });
    console.log(`\n========================================`);
    console.log(`Found ${accounts.length} active broker accounts in DB:`);
    for (const acc of accounts) {
      console.log(`👉 Broker: ${acc.broker} | Client ID: ${acc.clientId} | Token Present: ${!!acc.accessToken}`);
      
      if (acc.accessToken) {
        const factory = new BrokerClientFactory();
        const client = factory.createClient(acc);
        console.log(`📡 Connecting to Zerodha KiteConnect API for ${acc.clientId}...`);
        
        try {
          const margins = await client.getMargins();
          console.log(`✅ Connection Successful!`);
          console.log(`💰 Available Margin: ₹${margins?.equity?.available?.cash ?? 'N/A'}`);
          
          console.log(`🚀 Sending test Order API call to Zerodha for SBIN (1 qty @ ₹800)...`);
          try {
            const orderId = await client.placeOrder({
              symbol: 'SBIN',
              exchange: 'NSE',
              side: 'BUY',
              orderType: 'LIMIT',
              product: 'CNC',
              qty: 1,
              price: 800.0,
            });
            console.log(`🎉 ORDER PLACED SUCCESSFULLY! Zerodha Order ID: ${orderId}`);
          } catch (orderErr: any) {
            console.log(`📋 ZERODHA EXCHANGE PIPELINE RESPONSE:\n   "${orderErr.message}"`);
          }
        } catch (apiErr: any) {
          console.log(`❌ API Error for ${acc.clientId}: ${apiErr.message}`);
        }
      }
    }
    console.log(`========================================\n`);
  } catch (err: any) {
    console.error(`Error:`, err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
