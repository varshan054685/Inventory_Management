import * as fs from 'fs';
import * as path from 'path';
import { AppDatabase, initSqlJsModule, type PValue } from './connection';
import { MIGRATIONS, LATEST_VERSION } from './schema';

export interface DatabaseManager {
  db: AppDatabase;
  /** File path the database is persisted to (may be null in tests). */
  filePath: string | null;
  /** Serialize the in-memory DB to bytes. */
  exportBytes(): Uint8Array;
  /** Persist to the configured file path atomically. */
  persist(filePath?: string): string;
  /** Replace contents from raw bytes. Returns true on success. */
  replaceFromBytes(bytes: Uint8Array): boolean;
}

export const DATABASE_FILE_NAME = 'candy.sqlite';

/**
 * Opens a database, wiring the WASM module, applying migrations, and (when)
 * given a file path) loading existing data if present.
 */
export async function openDatabase(filePath?: string): Promise<DatabaseManager> {
  const SQL = await initSqlJsModule();
  let db: ConstructorParameters<typeof AppDatabase>[0];

  if (filePath && fs.existsSync(filePath)) {
    const bytes = fs.readFileSync(filePath);
    db = new SQL.Database(bytes);
  } else {
    db = new SQL.Database();
  }

  const app = new AppDatabase(db);
  migrate(app);

  const manager: DatabaseManager = {
    db: app,
    filePath: filePath ?? null,
    exportBytes: () => app.raw().export(),
    persist: (target?: string) => persistToFile(manager.exportBytes(), target ?? filePath),
    replaceFromBytes: (bytes: Uint8Array) => {
      // Reinitialize the underlying database.
      const next = new SQL.Database(bytes);
      app.close();
      // Swap the private raw handle (internal to this module's wrapper).
      (app as unknown as { db: unknown }).db = next;
      try {
        app.raw().run('PRAGMA foreign_keys = ON;');
      } catch {
        /* ignore */
      }
      return true;
    },
  };

  return manager;
}

/** Applies pending migrations. */
export function migrate(app: AppDatabase): void {
  app.run(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
     )`,
  );

  const applied = new Set<number>(
    app.query<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version),
  );

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    app.transaction(() => {
      app.exec(m.sql);
      app.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [
        m.version,
        m.name,
      ]);
    });
  }
}

/** Atomic write: temp file + rename to avoid corruption on crash. */
export function persistToFile(bytes: Uint8Array, target?: string): string {
  if (!target) throw new Error('No database file path configured to persist to');
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(target)}.tmp`);
  fs.writeFileSync(tmp, Buffer.from(bytes));
  fs.renameSync(tmp, target);
  return target;
}

/** Quick helper for parameter arrays in tests. */
export type { PValue };