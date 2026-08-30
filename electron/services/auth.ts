import type { AppDatabase } from '../db/connection';
import { generatePasswordHash, verifyPassword, nowIso } from './util';
import { audit } from './audit';

export interface UserPublic {
  id: number;
  username: string;
  role: string;
}

export function hasUsers(db: AppDatabase): boolean {
  return (db.value<number>('SELECT COUNT(*) c FROM users') ?? 0) > 0;
}

export function createFirstUser(
  db: AppDatabase,
  username: string,
  password: string,
): UserPublic {
  const uname = username.trim();
  if (!uname) throw new Error('Username is required');
  if (!password) throw new Error('Password is required');
  if (password.length < 4) throw new Error('Password must be at least 4 characters');
  if (hasUsers(db)) throw new Error('An admin account already exists');
  db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [
    uname,
    generatePasswordHash(password),
  ]);
  const id = db.getLastInsertId();
  audit(db, 'AUTH_FIRST_SETUP', 'users', id, `Created admin account "${uname}"`);
  return { id, username: uname, role: 'admin' };
}

export function login(
  db: AppDatabase,
  username: string,
  password: string,
): UserPublic {
  const uname = username.trim();
  const row = db.get<{
    id: number;
    username: string;
    passwordHash: string;
    role: string;
  }>('SELECT * FROM users WHERE username = ?', [uname]);
  if (!row || !verifyPassword(password, row.passwordHash)) {
    throw new Error('Invalid username or password');
  }
  audit(db, 'AUTH_LOGIN', 'users', row.id, `Login by ${row.username}`);
  return { id: row.id, username: row.username, role: row.role };
}

export function listUsers(db: AppDatabase): Array<UserPublic & { createdAt: string }> {
  return db.query<{ id: number; username: string; role: string; createdAt: string }>(
    'SELECT id, username, role, created_at FROM users ORDER BY id',
  );
}

export function changePassword(
  db: AppDatabase,
  userId: number,
  currentPassword: string,
  newPassword: string,
): void {
  if (!currentPassword || !newPassword) {
    throw new Error('Current and new password are required');
  }
  const row = db.get<{ passwordHash: string; username: string }>(
    'SELECT password_hash, username FROM users WHERE id = ?',
    [userId],
  );
  if (!row) throw new Error('User not found');
  if (!verifyPassword(currentPassword, row.passwordHash)) {
    throw new Error('Current password is incorrect');
  }
  if (newPassword.length < 4) {
    throw new Error('New password must be at least 4 characters');
  }
  db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
    generatePasswordHash(newPassword),
    nowIso(),
    userId,
  ]);
  audit(db, 'AUTH_CHANGE_PASSWORD', 'users', userId, `${row.username} changed password`);
}

export function resetDatabaseAuth(db: AppDatabase, username: string, password: string): void {
  // Used by "reset database" flow: wipes all business tables but preserves the user.
  db.transaction(() => {
    const tables = [
      'stock_movements',
      'dispatches',
      'wages',
      'overtime',
      'attendance',
      'productions',
      'recipe_items',
      'recipes',
      'purchase_items',
      'purchases',
      'products',
      'raw_materials',
      'suppliers',
      'employees',
      'unit_conversions',
      'backup_history',
      'audit_logs',
    ];
    for (const t of tables) db.run(`DELETE FROM ${t}`);
    db.run("DELETE FROM sqlite_sequence WHERE name IN ('" + tables.join("','") + "')");
  });
  if (username && password) {
    const uname = username.trim();
    db.run('DELETE FROM users');
    db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [
      uname,
      generatePasswordHash(password),
      'admin',
    ]);
    audit(db, 'AUTH_FIRST_SETUP', 'users', 1, 'Database reset, admin recreated');
  }
}