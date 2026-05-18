const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();
p.backtest.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }).then(b => console.log(JSON.stringify(b, null, 2))).catch(console.error).finally(() => p.$disconnect());
