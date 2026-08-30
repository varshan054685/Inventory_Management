import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseManager } from '../db/manager';
import type { AppDatabase } from '../db/connection';
import { getSettings } from './settings';
import { todayIso } from './util';
import { audit } from './audit';
import { DATABASE_FILE_NAME } from '../db/manager';

export interface BackupInfo {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  kind: 'manual' | 'auto';
}

export interface BackupSettings {
  frequency: string; // never | daily | weekly
  retention: number;
  autoBackupFolder: string;
}

export function getBackupSettings(db: AppDatabase): BackupSettings {
  const s = getSettings(db);
  return {
    frequency: s.backupFrequency || 'weekly',
    retention: s.backupRetention || 30,
    autoBackupFolder: s.companyName ? path.join(getDefaultBackupDir(), 'auto') : getDefaultBackupDir(),
  };
}

export function getDefaultBackupDir(): string {
  // In browser testing there is no process.env.APP_DATA; fallback.
  return process.env.APP_DATA || path.join(require('os').homedir(), 'CandyProduction', 'backups');
}

/** Create a timestamped backup file. Returns info about it. */
export async function createBackup(manager: DatabaseManager, kind: 'manual' | 'auto'): Promise<BackupInfo> {
  const stamp = `${todayIso().replace(/-/g, '')}_${new Date().toTimeString().slice(0, 5).replace(':', '-')}`;
  const folder =
    kind === 'auto'
      ? getBackupSettings(manager.db).autoBackupFolder
      : getBackupSettings(manager.db).autoBackupFolder;
  const fileName = `CandyBackup_${stamp}.db`;
  const target = path.join(folder, fileName);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  // Write via manager.persist so we reuse the atomic temp+rename pattern.
  manager.persist(target);

  const sizeBytes = fs.statSync(target).size;
  manager.db.run(
    'INSERT INTO backup_history (file_name, file_path, size_bytes, kind) VALUES (?, ?, ?, ?)',
    [fileName, target, sizeBytes, kind],
  );
  audit(manager.db, 'BACKUP_CREATE', 'backup_history', undefined, `Backup ${fileName} (${kind})`);
  return { fileName, filePath: target, sizeBytes, createdAt: todayIso(), kind };
}

export function listBackups(db: AppDatabase): Array<BackupInfo & { id: number }> {
  return db.query(`
    SELECT bh.id, bh.file_name AS fileName, bh.file_path AS filePath, bh.size_bytes AS sizeBytes,
           bh.created_at AS createdAt, bh.kind FROM backup_history bh ORDER BY bh.id DESC
  `);
}

/** Clean up old backups beyond retention window. */
export function pruneBackups(db: AppDatabase, keep: number): number {
  const rows = db.query<{ id: number; filePath: string | null }>(
    'SELECT id, file_path AS filePath FROM backup_history WHERE kind=? ORDER BY id DESC',
    ['auto'],
  );
  const removed: Buffer[] = [];
  let pruned = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (i >= keep && r.filePath && fs.existsSync(r.filePath)) {
      try {
        fs.unlinkSync(r.filePath);
        pruned++;
      } catch {
        /* ignore */
      }
    }
    if (i >= keep) db.run('DELETE FROM backup_history WHERE id=?', [r.id]);
  }
  return pruned;
}

/**
 * Restore from a backup file. Replaces current database contents.
 * Creates a safety backup of the current DB before doing so.
 */
export async function restoreBackup(
  manager: DatabaseManager,
  backupPath: string,
): Promise<{ restored: boolean; message?: string }> {
  if (!fs.existsSync(backupPath)) {
    throw new Error('Backup file not found on disk');
  }
  const stat = fs.statSync(backupPath);
  if (stat.size === 0) throw new Error('Backup file is empty or invalid');
  const bytes = fs.readFileSync(backupPath);
  // Basic validation: must be a valid SQLite file (header magic).
  const magic = bytes.subarray(0, 16).toString('utf8');
  if (!magic.startsWith('SQLite format 3')) {
    throw new Error('Not a valid SQLite backup file');
  }

  // Safety backup of current DB.
  await createBackup(manager, 'auto');

  // Replace in-memory DB with the new bytes.
  if (!manager.replaceFromBytes(bytes)) {
    throw new Error('Could not apply the backup contents');
  }
  audit(manager.db, 'BACKUP_RESTORE', undefined, undefined, `Restored from ${path.basename(backupPath)}`);
  return { restored: true };
}

export { DATABASE_FILE_NAME };

/** Locate the active database file given an app data dir. */
export function locateDatabaseFile(appDataDir: string): string {
  return path.join(appDataDir, 'data', DATABASE_FILE_NAME);
}