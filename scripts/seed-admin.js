const { PrismaClient } = require('@prisma/client');
const path = require('path');

let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  bcrypt = require(path.resolve(__dirname, '../apps/auth-service/node_modules/bcryptjs'));
}

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || 'admin@tradeio.com').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '@#AdminTrade001@#';
  const name = process.env.ADMIN_NAME || 'System Administrator';

  console.log(`Setting up dedicated Admin account: ${email}`);
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      name,
    },
    create: {
      email,
      name,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  console.log('✅ Admin account configured successfully:');
  console.log({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    isActive: admin.isActive,
  });
}

main()
  .catch((e) => {
    console.error('❌ Failed to seed admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
