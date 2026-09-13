/**
 * Trade.io Automated Database Maintenance & Log Pruning Job
 * Run via cron or manually: `pnpm db:cleanup`
 * Reclaims disk space and keeps the database fast and lean on budget VPS environments.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runCleanup() {
  console.log('====================================================');
  console.log('🧹 Starting Trade.io Database Maintenance Job');
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log('====================================================');

  const now = new Date();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // 1. Delete Expired Refresh Tokens
  try {
    const expiredTokens = await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });
    console.log(`✅ [1/5] Purged ${expiredTokens.count} expired refresh tokens.`);
  } catch (err) {
    console.warn(`⚠️ [1/5] Refresh token cleanup skipped or failed: ${err.message}`);
  }

  // 2. Delete Stale Swing Scans older than 7 days
  try {
    const staleScans = await prisma.swingScan.deleteMany({
      where: {
        scannedAt: { lt: sevenDaysAgo },
      },
    });
    console.log(`✅ [2/5] Purged ${staleScans.count} swing scans older than 7 days.`);
  } catch (err) {
    console.warn(`⚠️ [2/5] Swing scan cleanup skipped or failed: ${err.message}`);
  }

  // 3. Delete Stale Paper Trade Orders older than 30 days
  // (Real broker orders are NEVER deleted to ensure tax & audit compliance)
  try {
    const stalePaperOrders = await prisma.order.deleteMany({
      where: {
        isPaperTrade: true,
        createdAt: { lt: thirtyDaysAgo },
      },
    });
    console.log(`✅ [3/5] Purged ${stalePaperOrders.count} paper trade orders older than 30 days.`);
  } catch (err) {
    console.warn(`⚠️ [3/5] Paper trade cleanup skipped or failed: ${err.message}`);
  }

  // 4. Truncate heavy JSON logs for completed/stopped executions older than 7 days
  // Preserves execution record (ID, dates, status, P&L) while reclaiming megabytes of raw log text
  try {
    const clearedLogs = await prisma.strategyExecution.updateMany({
      where: {
        status: { in: ['COMPLETED', 'STOPPED'] },
        startedAt: { lt: sevenDaysAgo },
        logs: { not: '[]' },
      },
      data: {
        logs: '[]',
      },
    });
    console.log(`✅ [4/5] Pruned verbose log payloads from ${clearedLogs.count} completed executions older than 7 days.`);
  } catch (err) {
    console.warn(`⚠️ [4/5] Execution log pruning skipped or failed: ${err.message}`);
  }

  // 5. Run PostgreSQL VACUUM ANALYZE to reclaim OS disk space and optimize query planner
  try {
    console.log('⚡ [5/5] Running PostgreSQL VACUUM ANALYZE...');
    await prisma.$executeRawUnsafe('VACUUM ANALYZE;');
    console.log('✅ [5/5] VACUUM ANALYZE completed successfully. Dead tuples reclaimed.');
  } catch (err) {
    // If running in environment without VACUUM privileges (or in transaction), log advisory note
    console.log(`ℹ️ [5/5] VACUUM ANALYZE note: ${err.message}`);
  }

  console.log('====================================================');
  console.log('🎉 Database Maintenance & Pruning Completed Successfully!');
  console.log('====================================================');
}

runCleanup()
  .catch((e) => {
    console.error('❌ Critical error during db cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
