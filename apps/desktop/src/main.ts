import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import * as path from "path";
import * as fs from "fs";
import { fork, ChildProcess } from "child_process";
import * as http from "http";

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let webProcess: ChildProcess | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let isAppLoaded = false;

const BACKEND_PORT = 3002;
const FRONTEND_PORT = 3000;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

function getUserDataDir(): string {
  const userDir = path.join(app.getPath("userData"), "TradeIOData");
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return userDir;
}

function getDatabasePath(): string {
  const dataDir = getUserDataDir();
  return path.join(dataDir, "tradeio.db");
}

function checkHttpService(url: string, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const req = http.get(url, (res) => {
      if (!resolved) {
        resolved = true;
        resolve(true);
      }
    });

    req.on("error", () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
  });
}

function findBackendEntry(): string | null {
  const candidates = [
    path.join(process.resourcesPath, "backend/main.js"),
    path.resolve(__dirname, "../../auth-service/dist/main.js"),
    path.resolve(process.cwd(), "apps/auth-service/dist/main.js"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function findWebEntry(): string | null {
  const candidates = [
    path.join(process.resourcesPath, "web-server/apps/web/server.js"),
    path.resolve(__dirname, "../../web/.next/standalone/apps/web/server.js"),
    path.resolve(process.cwd(), "apps/web/.next/standalone/apps/web/server.js"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function startBackend(): Promise<void> {
  const isAlreadyRunning = await checkHttpService(`http://127.0.0.1:${BACKEND_PORT}`);
  if (isAlreadyRunning) {
    console.log(`Backend is already running on port ${BACKEND_PORT}`);
    return;
  }

  const backendEntry = findBackendEntry();
  if (!backendEntry) {
    console.warn("Backend dist entry not found. Will await external service.");
    return;
  }

  const dbPath = getDatabasePath().replace(/\\/g, "/");
  const sqliteUrl = `file:${dbPath}`;
  const env: Record<string, string> = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    DATABASE_URL: sqliteUrl,
    JWT_SECRET: process.env.JWT_SECRET || "tradeio-standalone-desktop-jwt-secret-2026",
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "tradeio-standalone-desktop-refresh-secret-2026",
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "tradeio-32-byte-standalone-secret-key!",
    DEFAULT_USER_EMAIL: "aarsh@trade.io",
    DEFAULT_USER_PASSWORD: "aarsh1234",
    DEFAULT_USER_NAME: "Aarsh",
    NODE_ENV: "production",
    ELECTRON_RUN_AS_NODE: "1",
  };

  console.log(`Auto-starting backend process from: ${backendEntry} with DB: ${sqliteUrl}`);
  try {
    backendProcess = fork(backendEntry, [], {
      env,
      cwd: path.dirname(backendEntry),
      stdio: "pipe",
    });

    backendProcess.stdout?.on("data", (data) => {
      console.log(`[Backend] ${data}`);
    });

    backendProcess.stderr?.on("data", (data) => {
      console.error(`[Backend Error] ${data}`);
    });
  } catch (err) {
    console.error("Failed to fork backend process:", err);
  }
}

async function startFrontend(): Promise<void> {
  const isAlreadyRunning = await checkHttpService(`http://127.0.0.1:${FRONTEND_PORT}`);
  if (isAlreadyRunning) {
    console.log(`Frontend is already running on port ${FRONTEND_PORT}`);
    return;
  }

  const webEntry = findWebEntry();
  if (!webEntry) {
    console.warn("Frontend standalone entry not found. Will await external service.");
    return;
  }

  const env: Record<string, string> = {
    PORT: String(FRONTEND_PORT),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    ELECTRON_RUN_AS_NODE: "1",
  };

  console.log(`Auto-starting frontend web server from: ${webEntry}`);
  try {
    webProcess = fork(webEntry, [], {
      env: { ...process.env, ...env },
      cwd: path.dirname(webEntry),
      stdio: "pipe",
    });

    webProcess.stdout?.on("data", (data) => {
      console.log(`[Web] ${data}`);
    });

    webProcess.stderr?.on("data", (data) => {
      console.error(`[Web Error] ${data}`);
    });
  } catch (err) {
    console.error("Failed to fork web process:", err);
  }
}

function killChildProcesses(): void {
  if (backendProcess && typeof backendProcess.kill === "function") {
    try {
      backendProcess.kill();
    } catch { }
    backendProcess = null;
  }
  if (webProcess && typeof webProcess.kill === "function") {
    try {
      webProcess.kill();
    } catch { }
    webProcess = null;
  }
}

function getLoadingHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TradeIO - Starting Engine</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #080b11;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow: hidden;
      user-select: none;
      background-image: 
        radial-gradient(circle at 50% 20%, rgba(14, 165, 233, 0.12) 0%, transparent 50%),
        radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.08) 0%, transparent 40%);
    }

    .container {
      width: 100%;
      max-width: 500px;
      padding: 36px;
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      backdrop-filter: blur(20px);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(14, 165, 233, 0.1);
      text-align: center;
      animation: fadeIn 0.4s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .logo-badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: rgba(14, 165, 233, 0.12);
      border: 1px solid rgba(14, 165, 233, 0.3);
      padding: 6px 14px;
      border-radius: 9999px;
      margin-bottom: 20px;
    }

    .logo-badge svg {
      width: 18px;
      height: 18px;
      color: #38bdf8;
    }

    .logo-badge span {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.06em;
      color: #38bdf8;
      text-transform: uppercase;
    }

    h1 {
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }

    p.subtitle {
      font-size: 14px;
      color: #94a3b8;
      margin-bottom: 24px;
      line-height: 1.5;
    }

    .services-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
      text-align: left;
    }

    .service-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      background: rgba(30, 41, 59, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      transition: all 0.2s ease;
    }

    .service-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .service-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }

    .service-name {
      font-size: 13.5px;
      font-weight: 600;
      color: #e2e8f0;
    }

    .service-url {
      font-size: 11px;
      color: #64748b;
      font-family: monospace;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
    }

    .status-pill.connecting {
      background: rgba(234, 179, 8, 0.15);
      color: #facc15;
      border: 1px solid rgba(234, 179, 8, 0.3);
    }

    .status-pill.ready {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .status-pill.offline {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }

    .dot.pulse {
      animation: pulseAnim 1.5s infinite;
    }

    @keyframes pulseAnim {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .progress-bar-container {
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      overflow: hidden;
      margin-bottom: 22px;
    }

    .progress-bar {
      width: 40%;
      height: 100%;
      background: linear-gradient(90deg, #0ea5e9, #10b981);
      border-radius: 999px;
      animation: loadingAnim 1.6s infinite ease-in-out;
    }

    @keyframes loadingAnim {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }

    .actions {
      display: flex;
      gap: 10px;
      justify-content: center;
    }

    button {
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      padding: 10px 18px;
      border-radius: 10px;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: none;
      outline: none;
    }

    .btn-primary {
      background: #0ea5e9;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.35);
    }

    .btn-primary:hover {
      background: #0284c7;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #cbd5e1;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.14);
      color: #ffffff;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-badge">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <span>TradeIO Desktop Engine</span>
    </div>

    <h1>Initializing Platform</h1>
    <p class="subtitle">Starting local services and preparing your trading dashboard...</p>

    <div class="progress-bar-container">
      <div class="progress-bar"></div>
    </div>

    <div class="services-grid">
      <div class="service-card">
        <div class="service-info">
          <div class="service-icon">🌐</div>
          <div>
            <div class="service-name">Web Interface</div>
          </div>
        </div>
        <div id="web-status" class="status-pill connecting">
          <span class="dot pulse"></span>
          <span>Starting...</span>
        </div>
      </div>

      <div class="service-card">
        <div class="service-info">
          <div class="service-icon">⚡</div>
          <div>
            <div class="service-name">Auth & Market API</div>
          </div>
        </div>
        <div id="api-status" class="status-pill connecting">
          <span class="dot pulse"></span>
          <span>Starting...</span>
        </div>
      </div>
    </div>

    <div class="actions">
      <button class="btn-primary" id="retry-btn">
        <span>🔄 Retry Now</span>
      </button>
      <button class="btn-secondary" id="devtools-btn">
        <span>🐞 Toggle DevTools</span>
      </button>
    </div>
  </div>

  <script>
    const webStatusEl = document.getElementById('web-status');
    const apiStatusEl = document.getElementById('api-status');
    const retryBtn = document.getElementById('retry-btn');
    const devtoolsBtn = document.getElementById('devtools-btn');

    function updatePill(el, isOnline) {
      if (isOnline) {
        el.className = 'status-pill ready';
        el.innerHTML = '<span class="dot"></span><span>Ready</span>';
      } else {
        el.className = 'status-pill connecting';
        el.innerHTML = '<span class="dot pulse"></span><span>Starting...</span>';
      }
    }

    if (window.electronAPI) {
      window.electronAPI.onStatusUpdate((data) => {
        updatePill(webStatusEl, data.web);
        updatePill(apiStatusEl, data.api);
      });

      retryBtn.addEventListener('click', async () => {
        retryBtn.style.opacity = '0.6';
        retryBtn.textContent = 'Checking...';
        await window.electronAPI.retryConnection();
        setTimeout(() => {
          retryBtn.style.opacity = '1';
          retryBtn.textContent = '🔄 Retry Now';
        }, 1000);
      });

      devtoolsBtn.addEventListener('click', () => {
        window.electronAPI.openDevTools();
      });
    }
  </script>
</body>
</html>`;
}

function showLoadingScreen(): void {
  if (!mainWindow || isAppLoaded) return;
  const html = getLoadingHtml();
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function performHealthCheck(): Promise<{ web: boolean; api: boolean }> {
  const [webReady, apiReady] = await Promise.all([
    checkHttpService(`http://127.0.0.1:${FRONTEND_PORT}`),
    checkHttpService(`http://127.0.0.1:${BACKEND_PORT}`),
  ]);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("status-update", {
      web: webReady,
      api: apiReady,
      timestamp: Date.now(),
    });
  }

  if (webReady && apiReady && mainWindow && !isAppLoaded) {
    isAppLoaded = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    console.log("Both Frontend and Backend ready! Navigating to TradeIO application...");
    mainWindow.loadURL(FRONTEND_URL);
  }

  return { web: webReady, api: apiReady };
}

function startPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(performHealthCheck, 1500);
  performHealthCheck();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: "TradeIO - Algorithmic Trading Platform",
    backgroundColor: "#080b11",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  showLoadingScreen();

  // Handle external links (e.g., Kite Connect Login, broker OAuth, docs) in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith("https://") ||
      (url.startsWith("http://") &&
        !url.includes(`localhost:${FRONTEND_PORT}`) &&
        !url.includes(`127.0.0.1:${FRONTEND_PORT}`))
    ) {
      console.log(`Opening external URL in system browser: ${url}`);
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, _errorDescription, validatedURL) => {
    console.warn(`Page load failed (${errorCode}) for: ${validatedURL}`);
    if (validatedURL.includes(`localhost:${FRONTEND_PORT}`) || validatedURL.includes(`127.0.0.1:${FRONTEND_PORT}`)) {
      isAppLoaded = false;
      showLoadingScreen();
      startPolling();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    killChildProcesses();
  });

  startPolling();
}

// IPC Handlers
ipcMain.handle("retry-connection", async () => {
  return await performHealthCheck();
});

ipcMain.handle("get-service-status", async () => {
  const [webReady, apiReady] = await Promise.all([
    checkHttpService(`http://127.0.0.1:${FRONTEND_PORT}`),
    checkHttpService(`http://127.0.0.1:${BACKEND_PORT}`),
  ]);
  return { web: webReady, api: apiReady };
});

ipcMain.handle("open-devtools", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.toggleDevTools();
  }
});

app.whenReady().then(async () => {
  try {
    createWindow();
    await Promise.all([startBackend(), startFrontend()]);
  } catch (err: any) {
    dialog.showErrorBox("Startup Error", `Failed to initialize TradeIO: ${err?.message || err}`);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  killChildProcesses();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  killChildProcesses();
});
