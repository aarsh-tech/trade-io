import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/algotrade?schema=public'
    }
  }
});

async function main() {
  console.log('Querying database...');
  try {
    const executions = await prisma.strategyExecution.findMany({
      orderBy: { startedAt: 'desc' },
      take: 5,
      include: {
        strategy: true
      }
    });

    console.log(`Found ${executions.length} executions:`);
    for (const exec of executions) {
      console.log('----------------------------------------------------');
      console.log(`ID: ${exec.id}`);
      console.log(`Strategy: ${exec.strategy.name} (${exec.strategy.type})`);
      console.log(`Status: ${exec.status}`);
      console.log(`Started: ${exec.startedAt.toISOString()}`);
      console.log(`Stopped: ${exec.stoppedAt?.toISOString() || 'N/A'}`);
      console.log(`ErrorMsg: ${exec.errorMsg || 'None'}`);
      console.log(`Logs (last 10 entries):`);
      try {
        const parsedLogs = JSON.parse(exec.logs);
        if (Array.isArray(parsedLogs)) {
          parsedLogs.slice(-10).forEach(log => console.log(`  ${log}`));
        } else {
          console.log(`  ${exec.logs.substring(0, 500)}`);
        }
      } catch (e) {
        console.log(`  Failed to parse logs: ${e.message}`);
        console.log(`  Raw: ${exec.logs.substring(0, 500)}`);
      }
    }
  } catch (error) {
    console.error('Error querying executions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
