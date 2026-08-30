import * as path from 'path';
import * as fs from 'fs';
import type { DatabaseManager } from '../db/manager';
import { createBackup, pruneBackups, getBackupSettings } from './backup';

type Timer = ReturnType<typeof setInterval>;

/**
 * Schedules automatic backups based on settings frequency.
 * Returns a stop function.
 */
export function scheduleAutoBackups(
  manager: DatabaseManager,
  getFrequency: () => string,
): () => void {
  let timer: Timer | null = null;
  const runOnce = async () => {
    try {
      const settings = getBackupSettings(manager.db);
      if (settings.frequency === 'never') return;
      await doBackupCheck(manager);
    } catch (err) {
      console.error('Auto-backup error:', err);
    }
  };

  const restart = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    const freq = getFrequency();
    if (freq === 'never') return;
    const intervalMs = freq === 'daily' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    // Run a check shortly after launch, then on the interval.
    setTimeout(runOnce, 30_000);
    timer = setInterval(runOnce, intervalMs);
  };

  restart();
  // Re-evaluate when settings change (caller can call restart via exposing it).
  const api = {
    restart,
    dispose: () => {
      if (timer) clearInterval(timer);
    },
  };
  (scheduleAutoBackups as any).__api = api;
  return () => api.dispose();
}

/** Perform a backup if one hasn't happened recently for the current period, plus prune. */
async function doBackupCheck(manager: DatabaseManager): Promise<void> {
  const settings = getBackupSettings(manager.db);
  if (settings.frequency === 'never') return;
  await createBackup(manager, 'auto');
  pruneBackups(manager.db, settings.retention || 30);
}

export function getAutoBackupApi(): { restart: () => void; dispose: () => void } | null {
  return (scheduleAutoBackups as any).__api ?? null;
}

export function backupFolder(): string {
  return path.join(getAppDataDir(), 'backups');
}

function getAppDataDir(): string {
  if (process.env.APP_DATA) return process.env.APP_DATA;
  return path.join(require('os').homedir(), 'CandyProduction');
}

export function ensureFolders(): void {
  const dataDir = path.join(getAppDataDir(), 'data');
  const bkpDir = path.join(getAppDataDir(), 'backups');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(bkpDir, { recursive: true });
}