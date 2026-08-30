import * as crypto from 'crypto';

/** Round to a fixed number of decimal places (reduces float noise in money). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** YYYY-MM-DD -> YYYY-MM (month key). */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Generate a document number, e.g. PUR-0001 for a given next-sequence. */
export function padNo(seq: number): string {
  return String(seq).padStart(4, '0');
}

export function purgeDiacritics(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

/** Term extraction for search. Splits into tokens, cleans punctuation. */
export function tokens(s: string): string[] {
  return purgeDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function doesTextMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const nTok = tokens(needle);
  const hTok = tokens(haystack);
  if (nTok.length === 0) return true;
  return nTok.every((nt) => hTok.some((ht) => ht.startsWith(nt)));
}

export function generatePasswordHash(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Convert an 8-char HH:MM string to hours (decimal). */
export function timeToHours(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((x) => !Number.isFinite(x))) return 0;
  const mins = eh * 60 + em - (sh * 60 + sm);
  return Math.max(0, mins / 60);
}