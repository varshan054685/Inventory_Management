export function currency(n: number | null | undefined, symbol = '₹'): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return `${symbol}0`;
  return `${symbol}${Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function number(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '0';
  return Number(n).toLocaleString('en-IN', {
    maximumFractionDigits: digits,
  });
}

export function todayIso(): string {
  // Local calendar date (YYYY-MM-DD) — never UTC, to avoid timezone day shifts.
  const d = new Date();
  return toIsoDate(d);
}

export function currentMonth(): string {
  return todayIso().slice(0, 7);
}

/** Build a local YYYY-MM-DD from a Date without UTC conversion. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Build YYYY-MM from a Date. */
export function toIsoMonth(d: Date): string {
  return toIsoDate(d).slice(0, 7);
}

/** Parse YYYY-MM-DD into a local Date (never UTC). */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Month label from YYYY-MM, e.g. "August 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const nm = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'long' });
  return `${nm} ${y}`;
}

/** Short label e.g. "Aug 2026". */
export function monthLabelShort(month: string): string {
  const [y, m] = month.split('-');
  const nm = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short' });
  return `${nm} ${y}`;
}

/** Shift a YYYY-MM by delta months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return toIsoMonth(d);
}

/** Shift a YYYY-MM-DD by delta months (keeps day). */
export function shiftDateMonth(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1 + delta, d || 1);
  return toIsoDate(dt);
}

export function shortDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = fromIsoDate(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Display date like "31 Aug 2026" (avoids timezone surprises; parses local). */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return shortDate(iso);
}

// ---------------------------------------------------------------------------
// TIME helpers (24h HH:MM storage <-> compact AM/PM display)
// ---------------------------------------------------------------------------

/** Format "18:00" -> "6:00 PM". */
export function formatTime(hhmm?: string | null): string {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Convert 12h hour + minute + AM/PM to 24h "HH:MM". */
export function to24h(hour12: number, minute: number, pm: boolean): string {
  let h = hour12 % 12;
  if (pm) h += 12;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Convert "HH:MM" to { hour (12h), minute, pm }. */
export function from24h(hhmm: string | null | undefined): { hour12: number; minute: number; pm: boolean } | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute: m % 60, pm: h >= 12 };
}

/**
 * Duration in hours between two 24h times (supports overnight spans):
 * 18:00 -> 20:00 = 2h ; 22:00 -> 02:00 = 4h.
 */
export function calculateDuration(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return 0;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight
  return Math.round((mins / 60) * 100) / 100;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[_ ]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}