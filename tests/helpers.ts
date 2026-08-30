import { AppDatabase } from '../electron/db/connection';
import { migrate } from '../electron/db/manager';

let inited = false;
let SQL: ConstructorParameters<typeof AppDatabase>[0];

async function ensureInit() {
  if (inited) return;
  inited = true;
  const mod = (await import('sql.js')).default;
  SQL = await mod();
}

/** Create a fresh in-memory DB with migrations applied. */
export async function createTestDb(): Promise<AppDatabase> {
  await ensureInit();
  const db = new AppDatabase(new SQL.Database());
  migrate(db);
  return db;
}

export async function withDb<T>(fn: (db: AppDatabase) => T): Promise<T> {
  const db = await createTestDb();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}