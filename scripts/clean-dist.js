const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const releaseDir = path.resolve(__dirname, '..', 'apps', 'desktop', 'release');
const winUnpacked = path.join(releaseDir, 'win-unpacked');

if (fs.existsSync(winUnpacked)) {
  console.log('🧹 Cleaning temporary build folder (win-unpacked)...');
  try {
    fs.rmSync(winUnpacked, { recursive: true, force: true });
  } catch {
    try {
      execSync(`cmd /c "rmdir /s /q \\"${winUnpacked}\\""`, { stdio: 'ignore' });
    } catch {}
  }
}

// Remove any non-exe files and temporary folders in release directory
if (fs.existsSync(releaseDir)) {
  const entries = fs.readdirSync(releaseDir);
  for (const entry of entries) {
    const entryPath = path.join(releaseDir, entry);
    try {
      const stat = fs.statSync(entryPath);
      if (stat.isDirectory()) {
        try {
          fs.rmSync(entryPath, { recursive: true, force: true });
        } catch {
          execSync(`cmd /c "rmdir /s /q \"${entryPath}\""`, { stdio: 'ignore' });
        }
      } else if (!entry.toLowerCase().endsWith('.exe')) {
        fs.unlinkSync(entryPath);
      }
    } catch {}
  }
}

console.log('✨ Cleanup complete: ONLY clean standalone .exe is preserved in release/ folder!');
