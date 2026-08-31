import type { AppDatabase } from '../db/connection';
import type { SettingsData } from '../../src/shared/types';
import { audit } from './audit';

// Keys whose values are never written to the audit log (e.g. none today, but
// guard rails for any future secret-bearing settings).
const SENSITIVE_SETTING_KEYS = new Set<string>([]);

const DEFAULTS: SettingsData = {
  companyName: 'My Candy Company',
  companyAddress: '',
  phone: '',
  email: '',
  currency: 'INR',
  defaultUnit: 'PIECES',
  lowStockThreshold: 10,
  allowNegativeStock: false,
  autoBackup: 'never',
  backupFrequency: 'weekly',
  backupRetention: 30,
  dateFormat: 'YYYY-MM-DD',
  theme: 'light',
  // Security / session (secure defaults per spec).
  requireAuth: true,
  autoLockEnabled: true,
  autoLockMinutes: 15,
  debugLogging: false,
  // Updates.
  updateAutoCheck: true,
  updateAutoDownload: true,
  updateChannel: 'stable',
};

export function getSettings(db: AppDatabase): SettingsData {
  const rows = db.query<{ key: string; value: string }>('SELECT `key`, `value` FROM settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS) as Array<keyof SettingsData>) {
    const v = map.get(k);
    if (v === undefined || v === null) continue;
    const dflt = DEFAULTS[k];
    if (typeof dflt === 'boolean') (out as Record<string, unknown>)[k] = v === 'true';
    else if (typeof dflt === 'number') (out as Record<string, unknown>)[k] = Number(v);
    else (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function saveSettings(db: AppDatabase, patch: Partial<SettingsData>): SettingsData {
  const current = getSettings(db);
  const next = { ...current, ...patch };
  db.transaction(() => {
    for (const [k, v] of Object.entries(next)) {
      db.run('INSERT OR REPLACE INTO settings (`key`, `value`) VALUES (?, ?)', [
        k,
        String(v),
      ]);
    }
  });
  // Audit which keys changed (never their values, in case a future value is
  // sensitive). Only log keys that actually changed.
  const changed = Object.keys(patch).filter((k) => current[k as keyof SettingsData] !== patch[k as keyof SettingsData]);
  if (changed.length > 0) {
    const safeKeys = changed.filter((k) => !SENSITIVE_SETTING_KEYS.has(k));
    if (safeKeys.length > 0) {
      audit(db, 'SETTINGS_CHANGE', 'settings', undefined, `Settings changed: ${safeKeys.join(', ')}`);
    }
  }
  return next;
}

export function getSetting(db: AppDatabase, key: string, fallback = ''): string {
  return db.value<string>('SELECT `value` FROM settings WHERE `key` = ?', [key]) ?? fallback;
}

export function getAllowNegativeStock(db: AppDatabase): boolean {
  return getSettings(db).allowNegativeStock;
}

export function getCurrency(db: AppDatabase): string {
  return getSettings(db).currency;
}