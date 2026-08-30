import type { AppDatabase } from '../db/connection';

/** Append an audit record (non-fatal on error). */
export function audit(
  db: AppDatabase,
  action: string,
  entity?: string | null,
  entityId?: number | null,
  description?: string | null,
): void {
  try {
    db.run(
      'INSERT INTO audit_logs (action, entity, entity_id, description) VALUES (?, ?, ?, ?)',
      [action, entity ?? null, entityId ?? null, description ?? null],
    );
  } catch {
    /* audit should never break a transaction */
  }
}

export function listAuditLogs(db: AppDatabase, limit = 200): Array<Record<string, unknown>> {
  return db.query(
    'SELECT * FROM audit_logs ORDER BY at DESC LIMIT ?',
    [limit],
  );
}