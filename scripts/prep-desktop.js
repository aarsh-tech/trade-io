const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 [Desktop Prep] Starting Electron standalone asset preparation...');

const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'apps', 'web');
const standaloneDir = path.join(webDir, '.next', 'standalone', 'apps', 'web');

// 1. Copy static folder to web standalone
const srcStatic = path.join(webDir, '.next', 'static');
const destStatic = path.join(standaloneDir, '.next', 'static');

if (fs.existsSync(srcStatic)) {
  console.log(`📦 Copying .next/static -> ${destStatic}`);
  fs.mkdirSync(path.dirname(destStatic), { recursive: true });
  fs.cpSync(srcStatic, destStatic, { recursive: true });
  console.log('✅ .next/static copied successfully.');
} else {
  console.warn('⚠️  apps/web/.next/static not found. Make sure to run `pnpm --filter web build` first.');
}

// 2. Copy public folder to web standalone
const srcPublic = path.join(webDir, 'public');
const destPublic = path.join(standaloneDir, 'public');

if (fs.existsSync(srcPublic)) {
  console.log(`📦 Copying public -> ${destPublic}`);
  fs.mkdirSync(destPublic, { recursive: true });
  fs.cpSync(srcPublic, destPublic, { recursive: true });
  console.log('✅ public folder copied successfully.');
} else {
  console.log('ℹ️  apps/web/public does not exist or is empty.');
}

// 3. Ensure auth-service standalone directory is deployed with production dependencies
const authServiceDir = path.join(rootDir, 'apps', 'auth-service');
const destBackendNodeModules = path.join(authServiceDir, 'standalone', 'node_modules');
if (!fs.existsSync(destBackendNodeModules)) {
  console.log('📦 Deploying isolated standalone production dependencies for auth-service...');
  execSync('pnpm --filter=@algo-trade/auth-service deploy apps/auth-service/standalone --prod', { stdio: 'inherit', cwd: rootDir });
  console.log('✅ Standalone production dependencies deployed.');
}

const srcBackendDist = path.join(authServiceDir, 'dist');
const destBackendDist = path.join(authServiceDir, 'standalone', 'dist');

if (fs.existsSync(srcBackendDist)) {
  console.log(`📦 Copying backend dist -> ${destBackendDist}`);
  fs.mkdirSync(destBackendDist, { recursive: true });
  fs.cpSync(srcBackendDist, destBackendDist, { recursive: true });
  console.log('✅ backend dist copied to standalone successfully.');
}

// 4. Generate SQLite Prisma Client and sync to standalone
console.log('🗄️  Generating SQLite Prisma Client...');
execSync('npx prisma generate --schema=./prisma/schema.sqlite.prisma', { stdio: 'inherit', cwd: rootDir });

// Copy generated SQLite client to auth-service standalone node_modules
const pnpmPrismaSources = [
  path.join(rootDir, 'node_modules', '.pnpm', '@prisma+client@6.2.1_prisma@6.2.1', 'node_modules', '.prisma', 'client'),
  path.join(rootDir, 'node_modules', '.prisma', 'client'),
];
const generatedPrismaDir = pnpmPrismaSources.find((p) => fs.existsSync(p));

if (generatedPrismaDir) {
  const destPrismaDirs = [
    path.join(authServiceDir, 'standalone', 'node_modules', '.pnpm', '@prisma+client@6.2.1_prisma@6.2.1', 'node_modules', '.prisma', 'client'),
    path.join(authServiceDir, 'standalone', 'node_modules', '.prisma', 'client'),
  ];

  for (const dest of destPrismaDirs) {
    console.log(`📦 Syncing SQLite Prisma client -> ${dest}`);
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(generatedPrismaDir, dest, { recursive: true });
  }
  console.log('✅ SQLite Prisma client synced to standalone node_modules successfully.');
} else {
  console.warn('⚠️  Could not find generated .prisma/client in root node_modules.');
}

// 5. Build Desktop Electron TypeScript Main
console.log('⚡ Building Electron Desktop main process...');
execSync('pnpm --filter @algo-trade/desktop run build:main', { stdio: 'inherit', cwd: rootDir });

console.log('🎉 [Desktop Prep] All desktop assets, SQLite schema, and standalone bundles are ready for electron-builder packaging!');

