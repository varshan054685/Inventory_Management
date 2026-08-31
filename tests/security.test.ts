import { describe, it, expect } from 'vitest';
import { withDb } from './helpers';
import { validateParams } from '../electron/services/validation';
import {
  encryptBackup,
  decryptBackup,
  isEncryptedBackup,
  HEADER_SIZE,
} from '../electron/services/backupCrypto';
import { createProduct, deleteProduct } from '../electron/services/masters';
import { openDatabase } from '../electron/db/manager';

describe('IPC validation', () => {
  it('accepts valid login params', () => {
    expect(validateParams('auth.login', { username: 'admin', password: 'secret1' })).toEqual({
      username: 'admin',
      password: 'secret1',
    });
  });

  it('rejects unknown params / missing required fields', () => {
    expect(() => validateParams('auth.login', {})).toThrow();
    expect(() => validateParams('products.get', { id: 'abc' })).toThrow();
    expect(() => validateParams('auth.login', { username: '', password: 'x' })).toThrow();
  });

  it('rejects malformed nested purchase items', () => {
    expect(() =>
      validateParams('purchases.create', { items: [{ quantity: -5 }] }),
    ).toThrow();
  });

  it('strips unknown extra properties (Zod default strips)', () => {
    const parsed = validateParams('auth.login', {
      username: 'admin',
      password: 'secret1',
      inject: { evil: true },
    }) as Record<string, unknown>;
    expect(parsed.inject).toBeUndefined();
  });
});

describe('Encrypted backups (AES-256-GCM + scrypt)', () => {
  it('round-trips encrypted and decrypted bytes', () => {
    const payload = Buffer.from('SQLite format 3\x00' + 'some database bytes');
    const enc = encryptBackup(payload, { password: 'correct horse' });
    expect(isEncryptedBackup(enc)).toBe(true);
    expect(enc.length).toBeGreaterThan(HEADER_SIZE);
    const dec = decryptBackup(enc, 'correct horse');
    expect(Buffer.compare(dec, payload)).toBe(0);
  });

  it('rejects a wrong password via the GCM auth tag', () => {
    const payload = Buffer.from('secret business data');
    const enc = encryptBackup(payload, { password: 'right-password' });
    expect(() => decryptBackup(enc, 'wrong-password')).toThrow();
  });

  it('rejects non-encrypted blobs', () => {
    expect(() => decryptBackup(Buffer.from('not an encrypted file'), 'pw')).toThrow();
    expect(isEncryptedBackup(Buffer.from('SQLite format 3\x00...'))).toBe(false);
  });

  it('creates and restores an encrypted backup through the service', async () => {
    // Give the manager a temp file path so persistence works.
    const manager = await openDatabase();
    try {
      manager.filePath = __dirname + '/tmp-manager-' + Date.now() + '.sqlite';
      const { createBackup, restoreBackup } = await import('../electron/services/backup');
      const info = await createBackup(manager, 'manual', { password: 'pw-here' });
      expect(info.encrypted).toBe(true);
      expect(info.fileName.endsWith('.enc')).toBe(true);
      const res = await restoreBackup(manager, info.filePath, { password: 'pw-here' });
      expect(res.restored).toBe(true);
    } finally {
      manager.db.close();
    }
  });

  it('rejects encrypted restore without the correct password', async () => {
    const manager = await openDatabase();
    try {
      manager.filePath = __dirname + '/tmp-manager-' + Date.now() + '.sqlite';
      const { createBackup, restoreBackup } = await import('../electron/services/backup');
      const info = await createBackup(manager, 'manual', { password: 'pw-here' });
      await expect(restoreBackup(manager, info.filePath)).rejects.toThrow(/password/);
      await expect(
        restoreBackup(manager, info.filePath, { password: 'nope' }),
      ).rejects.toThrow();
    } finally {
      manager.db.close();
    }
  });
});

describe('Delete policy', () => {
  it('blocks hard-delete of a product that has a recipe (history)', async () => {
    await withDb((db) => {
      const product = createProduct(db, { name: 'Candy', unit: 'PIECES', sellingPrice: 1 });
      db.run(
        'INSERT INTO recipes (product_id, name, output_quantity, output_unit, status) VALUES (?, ?, 1, ?, ?)',
        [product.id, 'BOM', 'PIECES', 'active'],
      );
      expect(() => deleteProduct(db, product.id)).toThrow(/Deactivate/i);
      expect(db.query('SELECT id FROM products WHERE id=?', [product.id]).length).toBe(1);
    });
  });

  it('allows hard-delete of a never-referenced product', async () => {
    await withDb((db) => {
      const product = createProduct(db, { name: 'New Candy', unit: 'PIECES', sellingPrice: 1 });
      deleteProduct(db, product.id);
      expect(db.query('SELECT id FROM products WHERE id=?', [product.id]).length).toBe(0);
    });
  });
});