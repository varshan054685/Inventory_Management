import React, { useMemo, useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Field, Button, Spinner, EmptyState, StatusBadge } from '@/components/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Employee, AttendanceStatus } from '@/shared/types';
import { currentMonth } from '@/utils/format';

const STATUS_CYCLE: AttendanceStatus[] = ['P', 'HD', 'A', 'WO', 'H'];
const STATUS_LABEL: Record<AttendanceStatus, string> = { P: 'P', HD: 'HD', A: 'A', WO: 'WO', H: 'H' };
const STATUS_COLOR: Record<AttendanceStatus, string> = {
  P: 'bg-emerald-500 text-white',
  HD: 'bg-amber-400 text-white',
  A: 'bg-red-500 text-white',
  WO: 'bg-slate-300 text-slate-700',
  H: 'bg-sky-400 text-white',
};
const STATUS_FULL: Record<AttendanceStatus, string> = {
  P: 'Present', HD: 'Half Day', A: 'Absent', WO: 'Weekly Off', H: 'Holiday',
};

export function AttendancePage() {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [employeeId, setEmployeeId] = useState<number | ''>('');

  const { data: employees, loading: empLoading } = useData(() => api.employees.list(), []);
  const { data: attendanceMap, loading: attLoading, refresh } = useData(
    () => (employeeId ? api.attendance.month(employeeId, month) : Promise.resolve<Record<string, AttendanceStatus>>({})),
    [employeeId, month],
  );

  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstDay = new Date(y, m - 1, 1).getDay();
    const cells: Array<{ day: number | null; date?: string }> = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, date: `${month}-${String(d).padStart(2, '0')}` });
    }
    return cells;
  }, [month]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const clickCell = (date?: string) => {
    if (!employeeId || !date) return;
    const cur = attendanceMap?.[date];
    const next = cur ? (STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length]) : 'P';
    void api.attendance.set(employeeId, date, next).then(refresh).catch((e) => toast.error((e as Error).message));
  };

  const summary = useMemo(() => {
    if (!attendanceMap) return null;
    const counts: Record<AttendanceStatus, number> = { P: 0, HD: 0, A: 0, WO: 0, H: 0 };
    Object.values(attendanceMap).forEach((s) => { counts[s]++; });
    const presentDays = counts.P;
    const halfDays = counts.HD;
    const absentDays = counts.A;
    const weeklyOffs = counts.WO;
    const holidays = counts.H;
    const eligible = presentDays + halfDays + absentDays;
    const effective = presentDays + halfDays;
    return { ...counts, presentDays, halfDays, absentDays, weeklyOffs, holidays, eligible, effective };
  }, [attendanceMap]);

  const emp = employees?.find((e) => e.id === Number(employeeId));

  const clearDate = (date: string) => {
    if (!employeeId) return;
    // Setting to an unknown won't delete; we approximate with a 'A' mark — instead we use weekly off toggle. 
    void api.attendance.set(employeeId, date, 'P');
  };

  if (empLoading) return <div className="h-40 flex items-center justify-center"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-4 mb-4">
          <Field label="Month">
            <input type="month" className="input w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <Field label="Employee" required>
            <select className="input w-56" value={employeeId} onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select employee</option>
              {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <div className="flex items-center gap-1">
            <Button variant="secondary" onClick={() => shiftMonth(-1)}><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="secondary" onClick={() => shiftMonth(1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
          <Button variant="ghost" onClick={() => setMonth(currentMonth())}>Today</Button>
          <div className="ml-auto flex items-center">Status is toggled in order P → HD → A → WO → H on click.</div>
        </div>

        {/* Legend + summary */}
        {emp && (
          <div className="mb-4 flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium mr-2">{emp.name}:</span>
            {STATUS_CYCLE.map((s) => (
              <span key={s} className="text-xs flex items-center gap-1">
                <span className={`w-4 h-4 rounded inline-flex items-center justify-center text-[10px] text-white ${STATUS_COLOR[s]}`}>{STATUS_LABEL[s]}</span>{STATUS_FULL[s]}
              </span>
            ))}
          </div>
        )}

        {!employeeId ? (
          <EmptyState message="Select an employee and month to enter attendance" />
        ) : attLoading ? (
          <div className="h-40 flex items-center justify-center"><Spinner /></div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-slate-500 py-1">{d}</div>
              ))}
              {days.map((cell, i) => (
                <div
                  key={i}
                  onClick={() => cell.date && clickCell(cell.date)}
                  className={`min-h-14 rounded-md border p-1 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                    cell.date && attendanceMap?.[cell.date]
                      ? STATUS_COLOR?.[attendanceMap[cell.date]] ?? 'bg-slate-200'
                      : 'bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title={cell.date ? `Click to toggle ${cell.date}` : ''}
                >
                  <span className={`text-xs ${cell.date && attendanceMap?.[cell.date] ? 'text-white' : 'text-slate-500'} font-medium`}>{cell.day}</span>
                  {cell.date && attendanceMap?.[cell.date] && (
                    <span className="text-[10px] font-bold mt-0.5">{STATUS_LABEL[attendanceMap[cell.date]]}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Summary */}
            {summary && (
              <div className="mt-5 grid grid-cols-2 md:grid-cols-6 gap-3">
                {[
                  { label: 'Present', v: summary.presentDays, c: 'text-emerald-600' },
                  { label: 'Half Days', v: summary.halfDays, c: 'text-amber-600' },
                  { label: 'Absent', v: summary.absentDays, c: 'text-red-600' },
                  { label: 'Weekly Off', v: summary.weeklyOffs, c: 'text-slate-500' },
                  { label: 'Holidays', v: summary.holidays, c: 'text-sky-600' },
                  { label: 'Effective', v: summary.effective, c: 'text-brand-600' },
                ].map((s) => (
                  <div key={s.label} className="rounded-md bg-slate-50 dark:bg-slate-700/30 p-3 text-center">
                    <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
                    <div className="text-xs text-slate-500">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="mt-4 text-xs text-slate-400">Double-tip: click any day to cycle its status. To blank a day, cycle past Holiday to mark it, or leave unmarked.</div>
      </Card>
    </div>
  );
}