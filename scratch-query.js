const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const strategies = await prisma.strategy.findMany({
    include: {
      executions: {
        include: {
          orders: true
        }
      }
    }
  });
  console.log("Strategies count:", strategies.length);
  for (const s of strategies) {
    console.log(`Strategy: ${s.name} (${s.id})`);
    console.log(`Executions: ${s.executions.length}`);
    for (const e of s.executions) {
      console.log(`  Execution: ${e.id} (${e.status})`);
      console.log(`  Orders: ${e.orders.length}`);
      for (const o of e.orders) {
        console.log(`    Order: ${o.symbol} ${o.side} ${o.status} Qty: ${o.qty} Price: ${o.price}`);
      }
    }
  }
}
main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
