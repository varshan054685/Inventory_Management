import { describe, it, expect } from 'vitest';
import {
  calculateDuration,
  to24h,
  from24h,
  formatTime,
  toIsoDate,
  shiftMonth,
} from '../src/utils/format';
import { timeToHours } from '../electron/services/util';

describe('calculateDuration (frontend)', () => {
  it('computes same-day spans', () => {
    expect(calculateDuration('18:00', '20:00')).toBe(2);
    expect(calculateDuration('9:00', '9:30')).toBe(0.5);
  });

  it('supports overnight spans', () => {
    expect(calculateDuration('22:00', '02:00')).toBe(4);
    expect(calculateDuration('23:30', '00:30')).toBe(1);
  });

  it('returns 0 for missing input', () => {
    expect(calculateDuration(undefined, '02:00')).toBe(0);
    expect(calculateDuration('', '')).toBe(0);
  });
});

describe('timeToHours (backend, supports overnight)', () => {
  it('matches frontend overnight logic', () => {
    expect(timeToHours('18:00', '20:00')).toBe(2);
    expect(timeToHours('22:00', '02:00')).toBe(4);
  });
});

describe('AM/PM conversion', () => {
  it('converts 24h to 12h components', () => {
    expect(from24h('18:00')).toEqual({ hour12: 6, minute: 0, pm: true });
    expect(from24h('00:30')).toEqual({ hour12: 12, minute: 30, pm: false });
    expect(from24h('12:00')).toEqual({ hour12: 12, minute: 0, pm: true });
    expect(from24h(null)).toBeNull();
  });

  it('converts 12h components back to 24h', () => {
    expect(to24h(6, 0, true)).toBe('18:00');
    expect(to24h(12, 0, false)).toBe('00:00');
    expect(to24h(12, 0, true)).toBe('12:00');
    expect(to24h(9, 30, false)).toBe('09:30');
  });

  it('formats display strings', () => {
    expect(formatTime('18:00')).toBe('6:00 PM');
    expect(formatTime('09:05')).toBe('9:05 AM');
    expect(formatTime(null)).toBe('—');
  });
});

describe('local date helpers', () => {
  it('builds ISO dates from local Date', () => {
    const d = new Date(2026, 7, 31); // Aug 31
    expect(toIsoDate(d)).toBe('2026-08-31');
  });

  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});