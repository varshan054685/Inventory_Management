import * as crypto from 'crypto';

/**
 * Encrypted backup container format (AES-256-GCM + scrypt key derivation).
 *
 * Byte layout:
 *   [0..15)   magic   "CANDYBKUPENC\0\0"  (16-byte file signature)
 *   [16..48)  salt    32 bytes (for scrypt)
 *   [48..60)  iv      12 bytes (GCM nonce)
 *   [60..76)  authTag 16 bytes (GCM authentication tag)
 *   [76..END) ciphertext (encrypted SQLite bytes)
 *
 * No encryption keys are ever stored in the file. The key is derived from the
 * user-supplied password with scrypt (an established KDF), so the same file is
 * unrecoverable without the correct password.
 */

const MAGIC = Buffer.from('CANDYBKUPENC');
const MAGIC_SIZE = 16;
const SALT_SIZE = 32;
const IV_SIZE = 12;
const TAG_SIZE = 16;
export const HEADER_SIZE = MAGIC_SIZE + SALT_SIZE + IV_SIZE + TAG_SIZE;

export interface EncryptOptions {
  password: string;
  /** scrypt cost parameters. Use non-defaults only for tests. */
  N?: number;
}

/** Derive a 32-byte AES-256 key from a password + random salt. */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32, { N: 1 << 15, maxmem: 64 * 1024 * 1024 });
}

/** Wrap raw bytes (e.g. an SQLite export) into an authenticated, encrypted blob. */
export function encryptBackup(bytes: Uint8Array, options: EncryptOptions): Buffer {
  if (!options.password || options.password.length < 4) {
    throw new Error('A password of at least 4 characters is required to encrypt a backup.');
  }
  const salt = crypto.randomBytes(SALT_SIZE);
  const iv = crypto.randomBytes(IV_SIZE);
  const key = deriveKey(options.password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(bytes)), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const header = Buffer.alloc(HEADER_SIZE);
  MAGIC.copy(header, 0);
  salt.copy(header, MAGIC_SIZE);
  iv.copy(header, MAGIC_SIZE + SALT_SIZE);
  authTag.copy(header, MAGIC_SIZE + SALT_SIZE + IV_SIZE);
  return Buffer.concat([header, ciphertext]);
}

/** Decrypt an encrypted backup blob. Throws on wrong password or corruption. */
export function decryptBackup(blob: Buffer, password: string): Buffer {
  if (blob.length < HEADER_SIZE || blob.subarray(0, MAGIC.length).compare(MAGIC) !== 0) {
    throw new Error('This file is not an encrypted CandyProduction backup.');
  }
  const salt = blob.subarray(MAGIC_SIZE, MAGIC_SIZE + SALT_SIZE);
  const iv = blob.subarray(MAGIC_SIZE + SALT_SIZE, MAGIC_SIZE + SALT_SIZE + IV_SIZE);
  const authTag = blob.subarray(
    MAGIC_SIZE + SALT_SIZE + IV_SIZE,
    MAGIC_SIZE + SALT_SIZE + IV_SIZE + TAG_SIZE,
  );
  const ciphertext = blob.subarray(HEADER_SIZE);

  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('Decryption failed. The password is incorrect or the backup is corrupted.');
  }
}

/** True when a file is an encrypted (not plaintext SQLite) backup. */
export function isEncryptedBackup(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, MAGIC.length));
  return bytes.length >= MAGIC_SIZE && head.compare(MAGIC) === 0;
}