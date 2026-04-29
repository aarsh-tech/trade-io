import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const strategies = await prisma.strategy.findMany();
  strategies.forEach(s => {
    console.log(`NAME: ${s.name}`);
    console.log(`TYPE: ${s.type}`);
    console.log(`CONFIG: ${s.config}`);
    console.log('---');
  });
}
main();
