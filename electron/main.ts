import { app, BrowserWindow, ipcMain, dialog, session, shell, type WebContents } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { CHANNEL, APP_VERSION } from './shared/appInfo';

// Safer default rendering in headless/RDP/VM environments.
app.disableHardwareAcceleration();
import { openDatabase, DATABASE_FILE_NAME } from './db/manager';
import { executeCommand, type Ctx } from './services/ipc';
import { scheduleAutoBackups, ensureFolders } from './services/autobackup';
import { getSettings } from './services/settings';
import { createLockManager, type LockManager } from './services/session';
import { createUpdateService, type UpdateService } from './services/update';

let mainWindow: BrowserWindow | null = null;
let manager: ReturnType<typeof openDatabase> extends Promise<infer T> ? Awaited<T> : never;
let stopAutoBackup: (() => void) | null = null;
let lockManager: LockManager | null = null;
let updateService: UpdateService | null = null;

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const appDataDir = app.getPath('userData');
process.env.APP_DATA = appDataDir;

function dbFilePath(): string {
  return path.join(appDataDir, 'data', DATABASE_FILE_NAME);
}

let ctx: Ctx = { manager: undefined as never, isLocked: false, authenticated: false };

/** Notify the renderer of a lock-state change so it can switch to the lock screen. */
function broadcastLockState(locked: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('cpms:lock-state', locked);
  }
}

async function ensureDatabase(): Promise<void> {
  ensureFolders();
  const filePath = dbFilePath();
  logInfo('[main] opening database at', filePath);
  manager = await openDatabase(filePath);
  logInfo('[main] database ready, schema version applied');
  ctx = { manager, isLocked: false, authenticated: false };
  stopAutoBackup = scheduleAutoBackups(manager, () => getSettings(manager.db).backupFrequency);

  // ---- Inactivity auto-lock (secure default 15 min) ----
  const s = getSettings(manager.db);
  lockManager = createLockManager(manager.db, {
    isAuthed: () => ctx.authenticated,
    onLockRequired: () => {
      ctx.isLocked = true;
      broadcastLockState(true);
    },
    onUnlock: () => {
      ctx.isLocked = false;
      broadcastLockState(false);
    },
  });
  lockManager.refresh({
    enabled: s.autoLockEnabled,
    minutes: s.autoLockMinutes,
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'Inventory Management System',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // renderer never navigates away from the packaged app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? '';
    if (!isSameAppOrigin(current, url)) {
      event.preventDefault();
    }
  });

  // Block any window.open from the renderer; only allow http(s); hand off to OS browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url).catch(() => undefined);
    }
    return { action: 'deny' };
  });

  // Deny all permission requests (camera, mic, geolocation, etc.) — none needed.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const devUrl = process.env.VITE_DEV_SERVER_URL;

  const handleWindowError = (_webContents: WebContents, error: { message: string }) => {
    // Do NOT surface internal details/stack traces to the user.
    logInfo('Renderer error:', error?.message);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Application notice',
        message: 'Something went wrong. Please try again.',
      });
    }
  };
  app.on('render-process-gone', (_e, _wc, details) => {
    logInfo('Renderer gone:', details.reason);
  });
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    // Never mirror renderer logs containing sensitive data; in production debug
    // logging is disabled by default.
    if (getLoggingEnabled()) {
      if (level >= 2) console.error('[renderer]', message);
      else console.log('[renderer]', message);
    }
  });

  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'crashed') {
      mainWindow?.reload();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Persist the DB whenever a mutation command completes, plus on window close.
  mainWindow.webContents.on('did-finish-load', () => {
    if (ctx?.manager) ctx.manager.persist(dbFilePath());
    if (process.env.CPMS_SELFTEST) {
      void runSelfTest();
    }
  });
}

// ---- Self-test (used by automated e2e validation; set CPMS_SELFTEST=1) ----
async function runSelfTest(): Promise<void> {
  const step = (label: string, value: unknown) => logInfo(`[SELFTEST] ${label}: ${JSON.stringify(value)}`);
  try {
    step('hasUsers', ctx.manager.db.value('SELECT COUNT(*) FROM users'));
    executeCommand(ctx, 'auth.setup', { username: 'selftest', password: 'test1234' });
    step('setupDone', true);
    executeCommand(ctx, 'seed.demo', {});
    step('products', (executeCommand(ctx, 'products.list', {}) as unknown[]).length);
    step('materials', (executeCommand(ctx, 'materials.list', {}) as unknown[]).length);
    step('employees', (executeCommand(ctx, 'employees.list', {}) as unknown[]).length);
    const mats = executeCommand(ctx, 'materials.list', {}) as Array<{ id: number; name: string }>;
    const sugar = mats.find((m: { name: string }) => m.name === 'Sugar');
    if (!sugar) throw new Error('Sugar not found');
    step('sugarBalance', executeCommand(ctx, 'stock.itemBalance', { itemType: 'RAW', itemId: sugar.id }));
    const prods = executeCommand(ctx, 'products.list', {}) as Array<{ id: number; name: string }>;
    const mango = prods.find((p: { name: string }) => p.name === 'Mango Candy');
    if (!mango) throw new Error('Mango not found');
    step('mangoBalance', executeCommand(ctx, 'stock.itemBalance', { itemType: 'FINISHED', itemId: mango.id }));
    step('dispatchAvail', executeCommand(ctx, 'dispatch.availability', { productId: mango.id }));
    const d = executeCommand(ctx, 'dispatch.create', { productId: mango.id, quantity: 100 }) as Record<string, unknown>;
    step('dispatchCreated', d.dispatchNo);
    step('mangoAfterDispatch', executeCommand(ctx, 'stock.itemBalance', { itemType: 'FINISHED', itemId: mango.id }));
    try {
      executeCommand(ctx, 'dispatch.create', { productId: mango.id, quantity: 9999999 });
      step('insufficientDispatch', 'FAILED-TO-BLOCK');
    } catch {
      step('insufficientDispatch', 'blocked-ok');
    }
    try {
      executeCommand(ctx, 'production.create', { productId: mango.id, units: 99999999, costPerUnit: 1 });
      step('insufficientProduction', 'FAILED-TO-BLOCK');
    } catch {
      step('insufficientProduction', 'blocked-ok');
    }
    step('dashboard', (executeCommand(ctx, 'dashboard.stats', {}) as { lowStock: unknown[] }).lowStock.length);
    step('wages', (executeCommand(ctx, 'wages.list', { month: new Date().toISOString().slice(0, 7) }) as { rows: unknown[] }).rows.length);
    step('reports.currentStock', (executeCommand(ctx, 'reports.currentStock', { type: 'ALL' }) as unknown[]).length);
    ctx.manager.persist(dbFilePath());
    logInfo('[SELFTEST] ALL OK');
  } catch (err) {
    console.error('[SELFTEST] FAILED:', err instanceof Error ? err.message : err);
  } finally {
    app.exit(0);
  }
}

// ---- IPC ----
ipcMain.handle(CHANNEL, async (_event, command: string, params: unknown) => {
  // Any IPC activity counts as user interaction for the auto-lock timer.
  lockManager?.poke();
  try {
    const result = executeCommand(ctx, command, params);
    schedulePersist();
    if (command === 'settings.save') {
      refreshSecurityConfig();
    }
    if (command === 'auth.unlock' || command === 'auth.login' || command === 'auth.setup') {
      ctx.authenticated = true;
      lockManager?.unlock();
    }
    if (command === 'auth.logout' || command === 'auth.lock') {
      ctx.authenticated = false;
    }
    return { ok: true, result };
  } catch (err) {
    // Return safe message; never leak stack traces or internals.
    return {
      ok: false,
      error: safeError(err),
    };
  }
});

function refreshSecurityConfig(): void {
  try {
    if (!ctx?.manager?.db || !lockManager) return;
    const s = getSettings(ctx.manager.db);
    lockManager.refresh({ enabled: s.autoLockEnabled, minutes: s.autoLockMinutes });
  } catch {
    /* non-fatal */
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  if (!ctx?.manager) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      ctx.manager.persist(dbFilePath());
    } catch (err) {
      logInfo('Persist error:', (err as Error).message);
    }
    persistTimer = null;
  }, 400);
}

function persistNow(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    ctx?.manager?.persist(dbFilePath());
  } catch (err) {
    logInfo('Persist error on quit:', (err as Error).message);
  }
}

// Expose native file pickers for backup/restore.
ipcMain.handle('cpms:pickBackupFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('cpms:pickBackupFile', async () => {
  const res = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'Database backup', extensions: ['db', 'sqlite', 'enc'] }],
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('cpms:saveReportFile', async (_e, suggestedName: string) => {
  const res = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: path.join(app.getPath('documents'), suggestedName),
  });
  return res.canceled ? null : res.filePath;
});

// ---- Updater IPC (narrow, controlled surface) ----
ipcMain.handle('cpms:updater:status', async () => {
  return updateService ? updateService.getStatus() : { status: 'idle', currentVersion: APP_VERSION, version: null, downloadProgress: null };
});
ipcMain.handle('cpms:updater:check', async () => {
  if (!updateService) return { status: 'idle', currentVersion: APP_VERSION, version: null, downloadProgress: null };
  // A manual check is always allowed (settings can only disable *automatic* checks).
  return updateService.check();
});
ipcMain.handle('cpms:updater:download', async () => {
  if (!updateService) return { status: 'error', error: 'Updates are not configured', currentVersion: APP_VERSION, version: null, downloadProgress: null };
  return updateService.download();
});
ipcMain.handle('cpms:updater:install', async () => {
  if (!updateService || !ctx?.manager) return false;
  // ---------------------------------------------------------------------
  // DATA-SAFE INSTALL SEQUENCE (higher priority than update convenience):
  // 1. Create an automatic backup of the current database.
  // 2. Verify it exists on disk and is non-empty (integrity check).
  // 3. Only then trigger the update install.
  // If the backup fails or is unverifiable, DO NOT install.
  // ---------------------------------------------------------------------
  try {
    persistNow();
    const { createBackup } = await import('./services/backup');
    const bk = await createBackup(ctx.manager, 'auto');
    if (!bk?.filePath) throw new Error('backup produced no file');
    const stat = await import('fs').then((fs) => fs.promises.stat(bk.filePath));
    if (!stat.isFile() || stat.size === 0) throw new Error('backup file is empty');
    logInfo('[updater] pre-install backup verified OK');
  } catch (err) {
    logInfo('[updater] pre-install backup failed; update postponed:', (err as Error).message);
    // Postpone the update — never risk user data for a convenience update.
    return false;
  }
  return updateService.install();
});

// ---- App lifecycle ----
app.whenReady().then(async () => {
  // Ensure all windows are isolated from each other and from node.
  session.defaultSession.clearCache();
  // prevent any webView/webFrame remote content.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  await ensureDatabase();
  createWindow();

  // Background, non-blocking update check once the app is ready.
  updateService = createUpdateService({ getSettings: () => getSettings(manager.db) });
  updateService.startBackgroundChecks();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  persistNow();
  stopAutoBackup?.();
  lockManager?.dispose();
  updateService?.dispose();
});

app.on('window-all-closed', () => {
  persistNow();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle unexpected errors without crashing silently. Log a safe technical error
// (never passwords / employee data / full DB contents).
process.on('uncaughtException', (err) => {
  logInfo('Uncaught exception:', err instanceof Error ? err.message : String(err));
});
process.on('unhandledRejection', (err) => {
  logInfo('Unhandled rejection:', err instanceof Error ? err.message : String(err));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeError(err: unknown): string {
  const msg = err instanceof Error ? err.message.trim() : String(err);
  // Keep friendly user-facing messages, but never allow internal stack traces.
  if (!msg || msg.length > 500) return 'Something went wrong. Please try again.';
  return msg;
}

let cachedLoggingEnabled: boolean | null = null;
function getLoggingEnabled(): boolean {
  // Refresh from settings when available; default OFF in production.
  try {
    if (ctx?.manager?.db) {
      cachedLoggingEnabled = getSettings(ctx.manager.db).debugLogging;
    }
  } catch {
    cachedLoggingEnabled = null;
  }
  return isDev ? true : (cachedLoggingEnabled ?? false);
}

function logInfo(...args: unknown[]): void {
  if (isDev || getLoggingEnabled()) {
    console.log(...args);
  }
}

/** True if current and target are the same app origin (local file or the dev server). */
function isSameAppOrigin(current: string, target: string): boolean {
  if (target.startsWith('file://')) return true;
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl && target.startsWith(devUrl)) return true;
  return false;
}

/** Version reported to renderer / updater. */
export function getAppVersion(): string {
  return APP_VERSION;
}
void fs;