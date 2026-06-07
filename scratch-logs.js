const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const execution = await prisma.strategyExecution.findUnique({
    where: { id: 'cmok8amd10003uigowyte47e5' },
    select: { logs: true }
  });

  const logs = JSON.parse(execution.logs || '[]');
  console.log(`Logs for cmok8amd10003uigowyte47e5:`);
  for (const line of logs) {
    console.log(line);
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
