const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();
p.strategy.findMany().then(s => console.log(JSON.stringify(s, null, 2))).catch(console.error).finally(() => p.$disconnect());
