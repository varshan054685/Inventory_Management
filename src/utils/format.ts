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
  return new Date().toISOString().slice(0, 10);
}

export function currentMonth(): string {
  return todayIso().slice(0, 7);
}

/** Month label from YYYY-MM, e.g. "August 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const nm = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'long' });
  return `${nm} ${y}`;
}

export function shortDate(iso?: string | null): string {
  if (!iso) return '—';
  return iso;
}

export function formatDate(iso?: string | null, fmt = 'YYYY-MM-DD'): string {
  if (!iso) return '—';
  return iso;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[_ ]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}