import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const dbUrl = process.env.DATABASE_URL;
    super(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);
    this.logger.log(`Prisma initialized with URL: ${dbUrl}`);
  }

  async onModuleInit() {
    this.logger.log(`Connecting to Prisma database...`);
    await this.$connect();
    this.logger.log(`Prisma database connected successfully.`);
    await this.initSchema();
    await this.seedDefaultUser();
  }

  private async initSchema() {
    try {
      // Create tables for SQLite if they don't exist
      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "users" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "email" TEXT NOT NULL UNIQUE,
          "name" TEXT NOT NULL,
          "passwordHash" TEXT NOT NULL,
          "totpSecret" TEXT,
          "twoFaEnabled" BOOLEAN NOT NULL DEFAULT 0,
          "resetToken" TEXT UNIQUE,
          "resetExpires" DATETIME,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "refresh_tokens" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "token" TEXT NOT NULL UNIQUE,
          "expiresAt" DATETIME NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "broker_accounts" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "broker" TEXT NOT NULL,
          "apiKeyEnc" TEXT NOT NULL,
          "apiSecretEnc" TEXT NOT NULL,
          "clientId" TEXT,
          "accessToken" TEXT,
          "tokenExpiry" DATETIME,
          "isActive" BOOLEAN NOT NULL DEFAULT 1,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "strategies" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "brokerAccountId" TEXT,
          "name" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "config" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL DEFAULT 0,
          "isPaperTrade" BOOLEAN NOT NULL DEFAULT 1,
          "autoStart" BOOLEAN NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("brokerAccountId") REFERENCES "broker_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
      `);

      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "strategy_executions" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "strategyId" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'RUNNING',
          "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "stoppedAt" DATETIME,
          "logs" TEXT NOT NULL DEFAULT '[]',
          "errorMsg" TEXT,
          FOREIGN KEY ("strategyId") REFERENCES "strategies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "orders" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "brokerAccountId" TEXT,
          "strategyId" TEXT,
          "executionId" TEXT,
          "symbol" TEXT NOT NULL,
          "exchange" TEXT NOT NULL,
          "side" TEXT NOT NULL,
          "orderType" TEXT NOT NULL,
          "productType" TEXT NOT NULL,
          "qty" INTEGER NOT NULL,
          "price" REAL,
          "triggerPrice" REAL,
          "brokerOrderId" TEXT,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "filledQty" INTEGER NOT NULL DEFAULT 0,
          "avgPrice" REAL,
          "isPaperTrade" BOOLEAN NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          FOREIGN KEY ("brokerAccountId") REFERENCES "broker_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
          FOREIGN KEY ("executionId") REFERENCES "strategy_executions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
      `);

      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "backtests" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "strategyId" TEXT NOT NULL,
          "symbol" TEXT NOT NULL,
          "exchange" TEXT NOT NULL,
          "fromDate" DATETIME NOT NULL,
          "toDate" DATETIME NOT NULL,
          "capital" REAL NOT NULL DEFAULT 100000,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "result" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "completedAt" DATETIME,
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY ("strategyId") REFERENCES "strategies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "swing_scans" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "symbol" TEXT NOT NULL,
          "exchange" TEXT NOT NULL DEFAULT 'NSE',
          "pattern" TEXT NOT NULL,
          "score" REAL NOT NULL,
          "confidence" TEXT NOT NULL,
          "trendStrength" TEXT NOT NULL,
          "volumeSignal" TEXT NOT NULL,
          "currentPrice" REAL NOT NULL,
          "pivotPrice" REAL NOT NULL,
          "entryPrice" REAL NOT NULL,
          "stopLoss" REAL NOT NULL,
          "target1" REAL NOT NULL,
          "target2" REAL NOT NULL,
          "target3" REAL NOT NULL,
          "riskReward" REAL NOT NULL,
          "riskPct" REAL NOT NULL,
          "contractions" INTEGER NOT NULL DEFAULT 0,
          "suggestedQty" INTEGER NOT NULL DEFAULT 0,
          "notes" TEXT NOT NULL DEFAULT '[]',
          "isFnO" BOOLEAN NOT NULL DEFAULT 0,
          "lotSize" INTEGER NOT NULL DEFAULT 1,
          "optionSymbol" TEXT,
          "optionLtp" REAL,
          "optionStrike" REAL,
          "optionExpiry" TEXT,
          "optionType" TEXT,
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      await this.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "swing_scans_userId_scannedAt_idx" ON "swing_scans"("userId", "scannedAt");
      `);

      await this.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "watchlists" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "name" TEXT NOT NULL DEFAULT 'Default',
          "symbols" TEXT NOT NULL DEFAULT '[]',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);

      await this.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "watchlists_userId_idx" ON "watchlists"("userId");
      `);

      this.logger.log('Database tables verified / initialized successfully.');
    } catch (err: any) {
      this.logger.warn(`Schema initialization notice: ${err?.message || err}`);
    }
  }

  private async seedDefaultUser() {
    try {
      const email = process.env.DEFAULT_USER_EMAIL || 'aarsh@trade.io';
      const password = process.env.DEFAULT_USER_PASSWORD || 'aarsh1234';
      const name = process.env.DEFAULT_USER_NAME || 'Aarsh';

      const existingUser = await this.user.findUnique({
        where: { email },
      });

      if (!existingUser) {
        this.logger.log(`Pre-seeding user account: ${email}...`);
        const passwordHash = await bcrypt.hash(password, 12);
        await this.user.create({
          data: {
            email,
            name,
            passwordHash,
            twoFaEnabled: false,
          },
        });
        this.logger.log(`Pre-seeded default user [${email}] successfully!`);
      } else {
        const passwordMatches = await bcrypt.compare(password, existingUser.passwordHash);
        if (!passwordMatches) {
          const passwordHash = await bcrypt.hash(password, 12);
          await this.user.update({
            where: { email },
            data: { passwordHash },
          });
          this.logger.log(`Updated credentials for user [${email}].`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error during user pre-seeding: ${err?.message || err}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
