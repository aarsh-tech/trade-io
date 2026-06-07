const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const execution = await prisma.strategyExecution.findUnique({
    where: { id: 'cmok8amd10003uigowyte47e5' },
    include: {
      orders: true
    }
  });

  console.log(`Execution ${execution.id} status: ${execution.status}`);
  for (const o of execution.orders) {
    console.log(`Order ID: ${o.id}`);
    console.log(`  Symbol: ${o.symbol}`);
    console.log(`  Side: ${o.side}`);
    console.log(`  Type: ${o.orderType}`);
    console.log(`  Status: ${o.status}`);
    console.log(`  Qty: ${o.qty}`);
    console.log(`  Price: ${o.price}`);
    console.log(`  TriggerPrice: ${o.triggerPrice}`);
    console.log(`  isPaperTrade: ${o.isPaperTrade}`);
    console.log(`  CreatedAt: ${o.createdAt}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
