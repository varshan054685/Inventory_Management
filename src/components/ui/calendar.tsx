import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import {
  monthLabel,
  monthLabelShort,
  shiftMonth,
  toIsoDate,
  toIsoMonth,
  fromIsoDate,
  todayIso,
  shiftDateMonth,
  to24h,
  from24h,
  formatTime,
} from '@/utils/format';

// ---------------------------------------------------------------------------
// MonthPicker — fast [ < ] Month Year [ > ] controls plus Today.
// Used by month-driven screens (Attendance, Wages, Overtime, Reports).
// ---------------------------------------------------------------------------
export function MonthPicker({
  value,
  onChange,
  showToday = true,
  label,
}: {
  value: string; // YYYY-MM
  onChange: (month: string) => void;
  showToday?: boolean;
  label?: string;
}) {
  const go = (delta: number) => onChange(shiftMonth(value, delta));
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5">
      <button type="button" onClick={() => go(-1)} title="Previous month" aria-label="Previous month" className="btn-ghost p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div className="min-w-[6.5rem] text-center text-sm font-semibold text-slate-700 dark:text-slate-200" title={label ? undefined : monthLabel(value)}>
        {label ? label : monthLabel(value)}
      </div>
      <button type="button" onClick={() => go(1)} title="Next month" aria-label="Next month" className="btn-ghost p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
        <ChevronRight className="w-4 h-4" />
      </button>
      {showToday && (
        <button
          type="button"
          onClick={() => onChange(todayIso().slice(0, 7))}
          className="ml-1 text-xs font-medium text-brand-600 dark:text-brand-300 hover:underline"
        >
          Today
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DatePicker — click to open a compact inline calendar; instant navigation.
// ---------------------------------------------------------------------------
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function daysInMonthGrid(month: string): Array<{ day: number | null; date?: string }> {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDay = new Date(y, m - 1, 1).getDay();
  const cells: Array<{ day: number | null; date?: string }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, date: `${month}-${String(d).padStart(2, '0')}` });
  }
  return cells;
}

export function DatePicker({
  value, // YYYY-MM-DD (or '')
  onChange,
  placeholder = 'Select date',
  allowEmpty = true,
}: {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(value ? value.slice(0, 7) : todayIso().slice(0, 7));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Close on outside click.
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the view month in sync when the selected date changes externally.
  useEffect(() => {
    if (value) setViewMonth(value.slice(0, 7));
  }, [value]);

  const cells = useMemo(() => daysInMonthGrid(viewMonth), [viewMonth]);
  const today = todayIso();

  const pick = (date: string) => {
    onChange(date);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input flex items-center gap-2 text-left"
        aria-haspopup="true"
        aria-label="Open date picker"
      >
        <CalendarIcon className="w-4 h-4 text-slate-400" />
        <span className={value ? '' : 'text-slate-400'}>{value ? formatDateFallback(value) : placeholder}</span>
        {!allowEmpty && value && (
          <span className="ml-auto" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl p-2">
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <button type="button" onClick={() => setViewMonth(shiftMonth(viewMonth, -1))} aria-label="Previous month" className="btn-ghost p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="text-sm font-semibold text-slate-800 dark:text-slate-100"
              onClick={() => setViewMonth(todayIso().slice(0, 7))}
              title="Jump to current month"
            >
              {(() => { const [y, m] = viewMonth.split('-').map(Number); return `${MONTHS_NAMES[(m || 1) - 1]} ${y}`; })()}
            </button>
            <button type="button" onClick={() => setViewMonth(shiftMonth(viewMonth, 1))} aria-label="Next month" className="btn-ghost p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-slate-400 mb-0.5">
            {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) =>
              cell.date ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(cell.date!)}
                  className={[
                    'aspect-square rounded-md text-xs font-medium flex items-center justify-center',
                    cell.date === value
                      ? 'bg-brand-600 text-white'
                      : cell.date === today
                        ? 'ring-1 ring-inset ring-brand-400 text-brand-600 dark:text-brand-300'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700',
                  ].join(' ')}
                >
                  {cell.day}
                </button>
              ) : (
                <div key={i} />
              ),
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700">
            <button
              type="button"
              onClick={() => pick(today)}
              className="text-xs font-medium text-brand-600 dark:text-brand-300 hover:underline"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onChange(shiftDateMonth(value || today, -1))}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Previous day
            </button>
            <button
              type="button"
              onClick={() => { pick(shiftDateMonth(value || today, 1)); }}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Next day
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateFallback(iso: string): string {
  const d = fromIsoDate(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// DateRangePicker — two connected DatePickers for from/to filters.
// ---------------------------------------------------------------------------
export function DateRangePicker({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <DatePicker value={from} onChange={onFrom} placeholder="From" allowEmpty={false} />
      <span className="text-slate-400 text-sm">→</span>
      <DatePicker value={to} onChange={onTo} placeholder="To" allowEmpty={false} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimePicker — compact AM/PM hour+minute selector with keyboard support.
// Stores/returns 24h \"HH:MM\". value can be '' for empty.
// ---------------------------------------------------------------------------
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,...55

export function TimePicker({
  value, // 'HH:MM' or ''
  onChange,
  label,
  allowEmpty = false,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  allowEmpty?: boolean;
  compact?: boolean;
}) {
  const parsed = from24h(value) ?? { hour12: 12, minute: 0, pm: value ? value.slice(0, 2) >= '12' : false };
  const [hour, setHour] = useState(parsed.hour12);
  const [min, setMin] = useState(parsed.minute);
  const [pm, setPm] = useState(parsed.pm);

  // Sync internal state when the value changes externally.
  useEffect(() => {
    const p = from24h(value);
    if (p) {
      setHour(p.hour12);
      setMin(p.minute);
      setPm(p.pm);
    }
  }, [value]);

  const commit = (h: number, m: number, p: boolean) => {
    onChange(to24h(h, m, p));
  };

  const select = [
    // hour
    <select
      key="h"
      className="input px-2 py-1.5 text-center font-mono"
      value={hour}
      aria-label={label ? `${label} hour` : 'Hour'}
      onChange={(e) => { const h = Number(e.target.value); setHour(h); commit(h, min, pm); }}
    >
      {HOURS_12.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}</option>)}
    </select>,
    <span key="c1" className="text-slate-400 font-bold">:</span>,
    <select
      key="m"
      className="input px-1.5 py-1.5 text-center font-mono"
      value={min}
      aria-label={label ? `${label} minute` : 'Minute'}
      onChange={(e) => { const m = Number(e.target.value); setMin(m); commit(hour, m, pm); }}
    >
      {MINUTES.map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
    </select>,
    <span key="c2" className="text-slate-400 font-bold" />,
    <select
      key="p"
      className="input px-1 py-1.5 text-center"
      value={pm ? 'PM' : 'AM'}
      aria-label={label ? `${label} AM/PM` : 'AM/PM'}
      onChange={(e) => { const p = e.target.value === 'PM'; setPm(p); commit(hour, min, p); }}
    >
      <option value="AM">AM</option>
      <option value="PM">PM</option>
    </select>,
  ];

  return (
    <div className={`flex items-center gap-1 ${compact ? '' : ''}`}>
      <Clock className="w-4 h-4 text-slate-400" />
      {select}
      {allowEmpty && (
        <button
          type="button"
          onClick={() => onChange('')}
          title="Clear time"
          className="btn-ghost p-1 text-xs text-slate-400 hover:text-red-500"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export { formatTime, monthLabelShort };