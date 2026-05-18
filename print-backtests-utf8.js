const { PrismaClient } = require('./node_modules/@prisma/client');
const fs = require('fs');
const p = new PrismaClient();
p.backtest.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }).then(b => fs.writeFileSync('backtests-utf8.json', JSON.stringify(b, null, 2))).catch(console.error).finally(() => p.$disconnect());
