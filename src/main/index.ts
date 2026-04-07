import path from 'node:path';
import { app, BrowserWindow, nativeTheme } from 'electron';
import { registerIpcHandlers } from './ipc/handlers';
import { createTray, destroyTray } from './tray';
import { getSetting } from './db/settings';
import { scanOrchestrator } from './scanner/index';
import { initDb, closeDatabase } from './db/index';

// ─── Single-instance lock ─────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ─── Window ───────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  nativeTheme.themeSource = 'dark';

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: true,
    backgroundColor: '#0f0f0f',
    show: false,            // Show only after the renderer is ready.
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,       // Required for preload to import Node built-ins.
    },
  });

  // Load renderer.
  if (process.env['NODE_ENV'] === 'development' || process.env['VITE_DEV_SERVER_URL']) {
    const devUrl = process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:5180';
    win.loadURL(devUrl).catch(console.error);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html')).catch(console.error);
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('close', (event) => {
    const minimizeToTray = getSetting('minimizeToTray');
    if (minimizeToTray) {
      event.preventDefault();
      win.hide();
    }
  });

  return win;
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.on('second-instance', () => {
  // Focus the existing window if a second instance tries to start.
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  await initDb();

  mainWindow = createWindow();
  registerIpcHandlers(mainWindow);
  createTray(mainWindow);

  // Trigger a scan on startup if the setting is enabled.
  mainWindow.webContents.once('did-finish-load', () => {
    const scanOnStartup = getSetting('scanOnStartup');
    if (scanOnStartup && mainWindow) {
      scanOrchestrator.runScan(mainWindow).catch((err: unknown) => {
        console.error('[startup] Scan failed:', err);
      });
    }
  });
}).catch(console.error);

app.on('window-all-closed', () => {
  // On macOS the convention is to keep the app running until Cmd+Q.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  } else {
    mainWindow?.show();
  }
});

app.on('before-quit', () => {
  destroyTray();
  closeDatabase();
});
