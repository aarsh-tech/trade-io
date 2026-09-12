const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 [Desktop Prep] Starting Ultra-Fast Standalone Bundle Preparation...');

const rootDir = path.resolve(__dirname, '..');
const webDir = path.join(rootDir, 'apps', 'web');
const standaloneWebDir = path.join(webDir, '.next', 'standalone', 'apps', 'web');
const authServiceDir = path.join(rootDir, 'apps', 'auth-service');
const standaloneBackendDir = path.join(authServiceDir, 'standalone');

// 1. Copy web static & public folders to web standalone
const srcStatic = path.join(webDir, '.next', 'static');
const destStatic = path.join(standaloneWebDir, '.next', 'static');
if (fs.existsSync(srcStatic)) {
  console.log(`📦 Syncing .next/static -> ${destStatic}`);
  fs.mkdirSync(path.dirname(destStatic), { recursive: true });
  fs.cpSync(srcStatic, destStatic, { recursive: true });
  console.log('✅ .next/static copied.');
} else {
  console.warn('⚠️  apps/web/.next/static not found. Running web build first...');
  execSync('pnpm --filter web build', { stdio: 'inherit', cwd: rootDir });
  fs.mkdirSync(path.dirname(destStatic), { recursive: true });
  fs.cpSync(srcStatic, destStatic, { recursive: true });
}

const srcPublic = path.join(webDir, 'public');
const destPublic = path.join(standaloneWebDir, 'public');
if (fs.existsSync(srcPublic)) {
  console.log(`📦 Syncing public -> ${destPublic}`);
  fs.mkdirSync(destPublic, { recursive: true });
  fs.cpSync(srcPublic, destPublic, { recursive: true });
  console.log('✅ public copied.');
}

// 2. Ensure Next.js runtime @swc helper packages are present without duplicating next
const swcSrc = path.join(webDir, '.next', 'standalone', 'node_modules', '.pnpm', 'node_modules', '@swc');
const swcDest = path.join(webDir, '.next', 'standalone', 'node_modules', '@swc');
if (fs.existsSync(swcSrc)) {
  console.log('📦 Syncing @swc helpers into standalone node_modules...');
  fs.cpSync(swcSrc, swcDest, { recursive: true, force: true });
  console.log('✅ @swc helpers synced.');
}
// Clean up duplicated next in standalone root if present
const duplicatedNext = path.join(webDir, '.next', 'standalone', 'node_modules', 'next');
if (fs.existsSync(duplicatedNext)) {
  fs.rmSync(duplicatedNext, { recursive: true, force: true });
}

// 2. Ensure auth-service dist exists
const srcBackendDist = path.join(authServiceDir, 'dist', 'main.js');
if (!fs.existsSync(srcBackendDist)) {
  console.log('🔨 Compiling auth-service NestJS...');
  execSync('pnpm --filter @algo-trade/auth-service build', { stdio: 'inherit', cwd: rootDir });
}

// 3. Bundle auth-service into a single lean JS file via @vercel/ncc (~3.5MB)
console.log('⚡ Bundling auth-service into a single standalone executable file (~3.5MB)...');
if (fs.existsSync(standaloneBackendDir)) {
  try {
    fs.rmSync(standaloneBackendDir, { recursive: true, force: true });
  } catch {
    execSync(`cmd /c "rmdir /s /q \\"${standaloneBackendDir}\\""`, { stdio: 'ignore' });
  }
}
fs.mkdirSync(standaloneBackendDir, { recursive: true });

execSync(
  `npx @vercel/ncc build "${srcBackendDist}" -o "${standaloneBackendDir}" -m --external @prisma/client`,
  { stdio: 'inherit', cwd: rootDir }
);

if (fs.existsSync(path.join(standaloneBackendDir, 'index.js'))) {
  fs.renameSync(
    path.join(standaloneBackendDir, 'index.js'),
    path.join(standaloneBackendDir, 'main.bundle.js')
  );
}
console.log('✅ Auth-service bundled into main.bundle.js.');

// 4. Generate SQLite Prisma Client and install in standalone/node_modules
console.log('🗄️  Generating SQLite Prisma Client...');
execSync('npx prisma generate --schema=./prisma/schema.sqlite.prisma', { stdio: 'inherit', cwd: rootDir });

const generatedPrismaDir = path.join(rootDir, 'prisma', 'client-sqlite');
const destDotPrisma = path.join(standaloneBackendDir, 'node_modules', '.prisma', 'client');
fs.mkdirSync(destDotPrisma, { recursive: true });
fs.cpSync(generatedPrismaDir, destDotPrisma, { recursive: true });

// Create minimal @prisma/client wrapper
const destAtPrisma = path.join(standaloneBackendDir, 'node_modules', '@prisma', 'client');
fs.mkdirSync(destAtPrisma, { recursive: true });
fs.writeFileSync(
  path.join(destAtPrisma, 'package.json'),
  JSON.stringify({ name: '@prisma/client', version: '6.2.1', main: 'index.js' }, null, 2)
);
fs.writeFileSync(
  path.join(destAtPrisma, 'index.js'),
  "module.exports = require('.prisma/client/default');\n"
);
console.log('✅ SQLite Prisma client linked cleanly.');

// Copy .env to standalone
const srcEnv = path.join(authServiceDir, '.env');
if (fs.existsSync(srcEnv)) {
  fs.copyFileSync(srcEnv, path.join(standaloneBackendDir, '.env'));
} else {
  fs.writeFileSync(path.join(standaloneBackendDir, '.env'), 'PORT=3002\n');
}

// 5. Build Desktop Electron TypeScript Main
console.log('⚡ Building Electron Desktop main process...');
execSync('pnpm --filter @algo-trade/desktop run build:main', { stdio: 'inherit', cwd: rootDir });

console.log('🎉 [Desktop Prep] Ultra-compact standalone bundles are ready for instant electron packaging!');
