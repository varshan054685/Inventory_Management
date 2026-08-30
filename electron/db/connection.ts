import type { Database, SqlJsStatic } from 'sql.js';

export interface Queryable {
  run(sql: string, params?: PValue[]): void;
  query<T = Record<string, unknown>>(sql: string, params?: PValue[]): T[];
  get<T = Record<string, unknown>>(sql: string, params?: PValue[]): T | undefined;
  value<T = unknown>(sql: string, params?: PValue[]): T | undefined;
  exec(sql: string): unknown;
  transaction<T>(fn: () => T): T;
  close(): void;
  raw(): Database;
  getLastInsertId(): number;
  getChanges(): number;
}

export type PValue = null | number | string | Uint8Array;

let SQL: SqlJsStatic | null = null;
let initPromise: Promise<SqlJsStatic> | null = null;

/**
 * Initializes the sql.js WASM module exactly once. After this resolves,
 * callers can construct databases with `new initSqlJs.Database(bytes)`.
 */
export async function initSqlJsModule(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const mod = (await import('sql.js')).default;
    SQL = await mod({
      locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`),
    });
    return SQL;
  })();
  return initPromise;
}

/** Wraps a raw sql.js Database with ergonomic helpers. */
export class AppDatabase implements Queryable {
  private db: Database;
  constructor(db: Database) {
    this.db = db;
    // Enforce foreign key constraints.
    this.db.run('PRAGMA foreign_keys = ON;');
  }

  raw(): Database {
    return this.db;
  }

  run(sql: string, params: PValue[] = []): void {
    this.db.run(sql, params);
  }

  exec(sql: string): unknown {
    return this.db.exec(sql);
  }

  /** Returns all rows as objects (unsafe keys but confirms schema column names). */
  query<T = Record<string, unknown>>(sql: string, params: PValue[] = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as never);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(this.camelize(stmt.getAsObject()) as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  get<T = Record<string, unknown>>(sql: string, params: PValue[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as never);
      if (stmt.step()) {
        return this.camelize(stmt.getAsObject()) as T;
      }
      return undefined;
    } finally {
      stmt.free();
    }
  }

  value<T = unknown>(sql: string, params: PValue[] = []): T | undefined {
    const row = this.get<Record<string, unknown>>(sql, params);
    if (!row) return undefined;
    const keys = Object.keys(row);
    return (row[keys[0]] as T) ?? undefined;
  }

  getLastInsertId(): number {
    return this.value<number>('SELECT last_insert_rowid() as id') ?? 0;
  }

  getChanges(): number {
    return this.value<number>('SELECT changes() as c') ?? 0;
  }

  transaction<T>(fn: () => T): T {
    this.run('BEGIN TRANSACTION');
    try {
      const result = fn();
      this.run('COMMIT');
      return result;
    } catch (err) {
      try {
        this.run('ROLLBACK');
      } catch {
        /* ignore rollback errors */
      }
      throw err;
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }

  /** sql.js returns snake_case columns; normalize to camelCase in-place. */
  private camelize(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const c = key.replace(/_([a-zA-Z0-9])/g, (_m, ch: string) => ch.toUpperCase());
      out[c] = obj[key];
    }
    return out;
  }
}

/** Compose a database from raw bytes (empty DB for fresh installs). */
export function createAppDatabase(db: Database): AppDatabase {
  return new AppDatabase(db);
}