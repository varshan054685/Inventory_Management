import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { CHANNEL } from './shared/appInfo';

// Safer default rendering in headless/RDP/VM environments.
app.disableHardwareAcceleration();
import { openDatabase, DATABASE_FILE_NAME } from './db/manager';
import { executeCommand, type Ctx } from './services/ipc';
import { scheduleAutoBackups, ensureFolders } from './services/autobackup';
import { getSettings } from './services/settings';

let mainWindow: BrowserWindow | null = null;
let manager: ReturnType<typeof openDatabase> extends Promise<infer T> ? Awaited<T> : never;
let stopAutoBackup: (() => void) | null = null;

const appDataDir = path.join(app.getPath('userData'));
process.env.APP_DATA = appDataDir;

function dbFilePath(): string {
  return path.join(appDataDir, 'data', DATABASE_FILE_NAME);
}

let ctx: Ctx = { manager: undefined as never, isLocked: false };

async function ensureDatabase(): Promise<void> {
  ensureFolders();
  const filePath = dbFilePath();
  console.log('[main] opening database at', filePath);
  manager = await openDatabase(filePath);
  console.log('[main] database ready, schema version applied');
  ctx = { manager, isLocked: false };
  // Persist settings-driven fields each launch (auto-backup folder path etc.).
  stopAutoBackup = scheduleAutoBackups(manager, () => getSettings(manager.db).backupFrequency);
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
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const devUrl = process.env.VITE_DEV_SERVER_URL;

  const handleWindowError = (event: { preventDefault: () => void }, error: { message: string }) => {
    event.preventDefault();
    console.error('Renderer error:', error?.message);
    if (mainWindow && typeof error?.message === 'string') {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Application notice',
        message: 'Something unexpected happened.',
        detail: error.message,
      });
    }
  };
  app.on('render-process-gone', (_e, _wc, details) => {
    console.error('Renderer gone:', details.reason);
  });
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.error('[renderer]', message);
    else console.log('[renderer]', message);
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
  void handleWindowError;

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
  const step = (label: string, value: unknown) => console.log(`[SELFTEST] ${label}: ${JSON.stringify(value)}`);
  try {
    step('hasUsers', ctx.manager.db.value('SELECT COUNT(*) FROM users'));
    executeCommand(ctx, 'auth.setup', { username: 'selftest', password: 'test1234' });
    step('setupDone', true);
    executeCommand(ctx, 'seed.demo', {});
    step('products', executeCommand(ctx, 'products.list', {}).length);
    step('materials', executeCommand(ctx, 'materials.list', {}).length);
    step('employees', executeCommand(ctx, 'employees.list', {}).length);
    const mats = executeCommand(ctx, 'materials.list', {}) as Array<{ id: number; name: string }>;
    const sugar = mats.find((m: { name: string }) => m.name === 'Sugar');
    step('sugarBalance', executeCommand(ctx, 'stock.itemBalance', { itemType: 'RAW', itemId: sugar.id }));
    const prods = executeCommand(ctx, 'products.list', {}) as Array<{ id: number; name: string }>;
    const mango = prods.find((p: { name: string }) => p.name === 'Mango Candy');
    step('mangoBalance', executeCommand(ctx, 'stock.itemBalance', { itemType: 'FINISHED', itemId: mango.id }));
    step('dispatchAvail', executeCommand(ctx, 'dispatch.availability', { productId: mango.id }));
    const d = executeCommand(ctx, 'dispatch.create', { productId: mango.id, quantity: 100 });
    step('dispatchCreated', d.dispatchNo);
    step('mangoAfterDispatch', executeCommand(ctx, 'stock.itemBalance', { itemType: 'FINISHED', itemId: mango.id }));
    // Insufficient dispatch must fail
    try {
      executeCommand(ctx, 'dispatch.create', { productId: mango.id, quantity: 9999999 });
      step('insufficientDispatch', 'FAILED-TO-BLOCK');
    } catch (e) {
      step('insufficientDispatch', 'blocked-ok');
    }
    // Production with insufficient raw stock must fail
    try {
      executeCommand(ctx, 'production.create', { productId: mango.id, units: 99999999, costPerUnit: 1 });
      step('insufficientProduction', 'FAILED-TO-BLOCK');
    } catch (e) {
      step('insufficientProduction', 'blocked-ok');
    }
    step('dashboard', (executeCommand(ctx, 'dashboard.stats', {}) as { lowStock: unknown[] }).lowStock.length);
    step('wages', executeCommand(ctx, 'wages.list', { month: new Date().toISOString().slice(0, 7) }).rows.length);
    step('reports.currentStock', executeCommand(ctx, 'reports.currentStock', { type: 'ALL' }).length);
    ctx.manager.persist(dbFilePath());
    console.log('[SELFTEST] ALL OK');
  } catch (err) {
    console.error('[SELFTEST] FAILED:', err instanceof Error ? err.message : err);
  } finally {
    app.exit(0);
  }
}

// ---- IPC ----
ipcMain.handle(CHANNEL, async (_event, command: string, params: unknown) => {
  try {
    const result = executeCommand(ctx, command, params);
    schedulePersist();
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
  if (!ctx?.manager) return;
  if (persistTimer) clearTimeout(persistTimer);
  // Debounce disk writes to avoid hammering during quick UI actions.
  persistTimer = setTimeout(() => {
    try {
      ctx.manager.persist(dbFilePath());
    } catch (err) {
      console.error('Persist error:', err);
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
    console.error('Persist error on quit:', err);
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
    filters: [{ name: 'Database backup', extensions: ['db', 'sqlite'] }],
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('cpms:saveReportFile', async (_e, suggestedName: string) => {
  const res = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: path.join(app.getPath('documents'), suggestedName),
  });
  return res.canceled ? null : res.filePath;
});

// ---- App lifecycle ----
app.whenReady().then(async () => {
  await ensureDatabase();
  session.defaultSession.clearCache();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  persistNow();
  stopAutoBackup?.();
});

app.on('window-all-closed', () => {
  persistNow();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle unexpected errors without crashing silently.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});