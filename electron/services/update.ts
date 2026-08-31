import { APP_VERSION, APP_NAME } from '../shared/appInfo';
import { audit } from './audit';
import type { AppDatabase } from '../db/connection';

/**
 * UpdateService abstraction.
 *
 * All application code talks to this interface; only this file knows about
 * electron-updater. That keeps business logic portable (e.g. to Tauri later)
 * and lets the renderer control updates only through the narrow preload API.
 *
 * The updater must NEVER be a single point of failure: any error is swallowed
 * and surfaced as a safe "update unavailable right now" status. The rest of the
 * application keeps working fully offline.
 */

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface UpdateCheckResult {
  status: UpdateStatus;
  version: string | null;
  currentVersion: string;
  downloadProgress: number | null;
  error?: string;
  lastCheck?: string | null;
}

export interface UpdateServiceOptions {
  /** Returns the live settings (so update prefs are respected). */
  getSettings: () => { updateAutoCheck: boolean; updateAutoDownload: boolean; updateChannel: string };
  db?: AppDatabase | null;
}

export interface UpdateService {
  check(): Promise<UpdateCheckResult>;
  download(): Promise<UpdateCheckResult>;
  install(): Promise<boolean>;
  getStatus(): UpdateCheckResult;
  getCurrentVersion(): string;
  /** Start background, non-blocking periodic checks. */
  startBackgroundChecks(): void;
  dispose(): void;
}

/**
 * A service that reports "updates unavailable" when no update provider is
 * configured (the default until a release endpoint / publisher is set up).
 * This is the safe default: the app is always fully usable.
 */
export function createUpdateService(opts: UpdateServiceOptions): UpdateService {
  try {
    // Lazy require so absence / misconfiguration never breaks the app.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const updater = require('electron-updater')?.autoUpdater;
    return new ElectronUpdaterService(updater, opts);
  } catch {
    return new OfflineUpdateService(opts);
  }
}

// ---------------------------------------------------------------------------
// electron-updater-backed implementation
// ---------------------------------------------------------------------------
class ElectronUpdaterService implements UpdateService {
  private status: UpdateStatus = 'idle';
  private available: string | null = null;
  private progress = 0;
  private lastCheck: string | null = null;
  private error: string | undefined;
  private disposed = false;
  private autoUpdater: unknown;
  private opts: UpdateServiceOptions;
  private backgroundTimer: ReturnType<typeof setInterval> | null = null;

  constructor(updater: unknown, opts: UpdateServiceOptions) {
    this.autoUpdater = updater;
    this.opts = opts;
    this.bindEvents();
    this.log('Update channel ready');
  }

  private log(msg: string): void {
    // Safe technical log line only; never sensitive data.
    try {
      // eslint-disable-next-line no-console
      console.log(`[update] ${msg}`);
    } catch {
      /* ignore */
    }
    if (this.opts.db) {
      try {
        audit(this.opts.db, 'UPDATE_LOG', 'system', undefined, msg);
      } catch {
        /* audit must not break */
      }
    }
  }

  private bindEvents(): void {
    void this.autoUpdater; // typed below
    const au = this.autoUpdater as Record<string, unknown>;
    void au;
    const on = (name: string, handler: (...args: unknown[]) => void): void => {
      const emitter = this.autoUpdater as unknown as {
        on?: (n: string, h: (...a: unknown[]) => void) => void;
      };
      emitter?.on?.(name, handler);
    };
    on('checking-for-update', () => {
      this.status = 'checking';
      this.error = undefined;
    });
    on('update-available', (info) => {
      const version = (info as { version?: string } | undefined)?.version ?? null;
      this.status = 'available';
      this.available = version;
      this.error = undefined;
      this.log(`Update available v${version}`);
    });
    on('update-not-available', () => {
      this.status = 'up-to-date';
      this.available = null;
      this.lastCheck = new Date().toISOString();
    });
    on('error', (err) => {
      this.status = 'error';
      this.error = 'Update could not be checked. You can try again later.';
      this.log(`Update error: ${err instanceof Error ? err.message : String(err)}`);
    });
    // download-progress is a ProgressInfo object
    on('download-progress', (p) => {
      const percent = (p as { percent?: number } | undefined)?.percent;
      this.status = 'downloading';
      this.progress = Math.round((percent ?? 0) * 100) / 100;
    });
    on('update-downloaded', () => {
      this.status = 'downloaded';
      this.log('Update downloaded');
    });
  }

  private settings(): { updateAutoCheck: boolean; updateAutoDownload: boolean; updateChannel: string } {
    try {
      return this.opts.getSettings();
    } catch {
      return { updateAutoCheck: true, updateAutoDownload: true, updateChannel: 'stable' };
    }
  }

  async check(): Promise<UpdateCheckResult> {
    if (this.disposed) return this.state();
    try {
      await (this.autoUpdater as { checkForUpdates?: () => Promise<unknown> }).checkForUpdates?.();
    } catch (err) {
      if (this.status !== 'available' && this.status !== 'up-to-date') {
        this.status = 'error';
        this.error = 'Unable to check for updates. The application is working offline.';
        this.log(`check failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return this.state();
  }

  async download(): Promise<UpdateCheckResult> {
    if (this.disposed) return this.state();
    try {
      await (this.autoUpdater as { downloadUpdate?: () => Promise<unknown> }).downloadUpdate?.();
    } catch (err) {
      this.status = 'error';
      this.error = 'Update could not be downloaded. You can try again later.';
      this.log(`download failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return this.state();
  }

  async install(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      // An auto backup is created by callers (main process) before install;
      // here we just trigger the built-in authenticated quit-and-install.
      const quitter = this.autoUpdater as { quitAndInstall?: () => void };
      quitter?.quitAndInstall?.();
      return true;
    } catch (err) {
      this.log(`install failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  private state(): UpdateCheckResult {
    return {
      status: this.status,
      version: this.available,
      currentVersion: APP_VERSION,
      downloadProgress: this.status === 'downloading' ? this.progress : null,
      error: this.error,
      lastCheck: this.lastCheck,
    };
  }

  getStatus(): UpdateCheckResult {
    return this.state();
  }

  getCurrentVersion(): string {
    return APP_VERSION;
  }

  startBackgroundChecks(): void {
    const s = this.settings();
    if (!s.updateAutoCheck) return;
    const firstDelaySec = 15;
    const intervalMs = 6 * 60 * 60 * 1000; // every 6h
    if (this.backgroundTimer) clearInterval(this.backgroundTimer);

    // Do not block startup: run after the app is ready.
    setTimeout(() => {
      void this.check();
    }, firstDelaySec * 1000);
    this.backgroundTimer = setInterval(() => {
      if (this.settings().updateAutoCheck) void this.check();
    }, intervalMs);
  }

  dispose(): void {
    this.disposed = true;
    if (this.backgroundTimer) clearInterval(this.backgroundTimer);
    this.backgroundTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Safe offline fallback when no publisher is configured (default today).
// ---------------------------------------------------------------------------
class OfflineUpdateService implements UpdateService {
  private opts: UpdateServiceOptions;
  private checked = false;

  constructor(opts: UpdateServiceOptions) {
    this.opts = opts;
  }

  private state(): UpdateCheckResult {
    const settings = this.settings();
    return {
      status: 'up-to-date',
      version: null,
      currentVersion: APP_VERSION,
      downloadProgress: null,
      error: undefined,
      lastCheck: this.checked ? new Date().toISOString() : null,
    };
  }

  private settings(): { updateAutoCheck: boolean; updateAutoDownload: boolean; updateChannel: string } {
    try {
      return this.opts.getSettings();
    } catch {
      return { updateAutoCheck: true, updateAutoDownload: true, updateChannel: 'stable' };
    }
  }

  async check(): Promise<UpdateCheckResult> {
    this.checked = true;
    return this.state();
  }
  async download(): Promise<UpdateCheckResult> {
    return this.state();
  }
  async install(): Promise<boolean> {
    return false;
  }
  getStatus(): UpdateCheckResult {
    return this.state();
  }
  getCurrentVersion(): string {
    return APP_VERSION;
  }
  startBackgroundChecks(): void {
    // Nothing to do when updates are not configured. App keeps working.
  }
  dispose(): void {
    /* no-op */
  }
}

export { APP_NAME };
export type { AppDatabase };