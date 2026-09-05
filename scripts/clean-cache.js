const fs = require('fs');
const path = require('path');

// Always resolve to the monorepo root directory (one level up from scripts/)
const rootDir = path.resolve(__dirname, '..');

function getDirectorySize(dirPath) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          size += getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          size += fs.statSync(fullPath).size;
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch {
    // Directory might not be readable or already removed
  }
  return size;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function findCacheDirectories() {
  const targets = [
    path.join(rootDir, '.turbo'),
    path.join(rootDir, 'node_modules', '.cache'),
  ];

  const parentFolders = ['apps', 'packages'];

  for (const parent of parentFolders) {
    const fullParent = path.join(rootDir, parent);
    if (!fs.existsSync(fullParent)) continue;

    try {
      const children = fs.readdirSync(fullParent, { withFileTypes: true });
      for (const child of children) {
        if (!child.isDirectory()) continue;
        const childPath = path.join(fullParent, child.name);

        targets.push(path.join(childPath, '.turbo'));
        targets.push(path.join(childPath, '.next'));
        targets.push(path.join(childPath, 'node_modules', '.cache'));
      }
    } catch {
      // Ignore reading error
    }
  }

  // Filter only existing paths and ensure uniqueness
  return Array.from(new Set(targets)).filter((target) => fs.existsSync(target));
}

function cleanCache() {
  console.log('\n🧹 Searching for Turbo and Next.js cache directories...\n');

  const cacheDirs = findCacheDirectories();

  if (cacheDirs.length === 0) {
    console.log('✨ No cache directories found. Everything is already clean!\n');
    return;
  }

  let totalFreed = 0;
  let successCount = 0;
  let failCount = 0;

  for (const dir of cacheDirs) {
    const relativePath = path.relative(rootDir, dir);
    const size = getDirectorySize(dir);
    const sizeStr = formatBytes(size);

    process.stdout.write(`  • Removing ${relativePath} (${sizeStr})... `);

    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      console.log('✅ Done');
      totalFreed += size;
      successCount++;
    } catch (err) {
      console.log('❌ Failed');
      console.error(`    ⚠️ Error removing ${relativePath}: ${err.message}`);
      console.error('    (Make sure dev servers or processes using these files are stopped)');
      failCount++;
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`🎉 Cache cleanup completed!`);
  console.log(`   Directories cleaned : ${successCount}`);
  if (failCount > 0) {
    console.log(`   Failed to delete    : ${failCount} (files in use)`);
  }
  console.log(`   Total space freed   : ${formatBytes(totalFreed)}`);
  console.log('─'.repeat(50) + '\n');
}

cleanCache();
