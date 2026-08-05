import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const strategies = await prisma.strategy.findMany({
    include: {
      executions: {
        orderBy: { startedAt: 'desc' },
        take: 1,
        include: { orders: true }
      }
    }
  });

  console.log('=== ALL STRATEGIES ===');
  for (const s of strategies) {
    console.log(`Strategy ID: ${s.id} | Name: "${s.name}" | Type: ${s.type} | IsActive: ${s.isActive} | AutoStart: ${s.autoStart}`);
    console.log(`Config:`, s.config);
    if (s.executions.length > 0) {
      const exec = s.executions[0];
      console.log(`  Latest Exec ID: ${exec.id} | Status: ${exec.status} | StartedAt: ${exec.startedAt}`);
      console.log(`  Orders (${exec.orders.length}):`, exec.orders.map(o => `${o.side} ${o.symbol} @ ${o.price} [${o.status}] (${o.createdAt})`));
      try {
        const logs = JSON.parse(exec.logs || '[]');
        console.log(`  Recent Logs (last 10):`);
        logs.slice(-10).forEach((l: string) => console.log('    ', l));
      } catch {}
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
