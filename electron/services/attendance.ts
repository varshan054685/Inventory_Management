import type { AppDatabase } from '../db/connection';
import { nowIso } from './util';
import { audit } from './audit';
import { ATTENDANCE_STATUSES, PRESENT, HALF_DAY } from '../../src/shared/constants';
import type { Attendance, AttendanceStatus } from '../../src/shared/types';

/** Set/update attendance for an employee on a date. Prevents duplicates naturally. */
export function setAttendance(
  db: AppDatabase,
  employeeId: number,
  date: string,
  status: AttendanceStatus,
): void {
  if (!ATTENDANCE_STATUSES.includes(status)) {
    throw new Error(`Invalid attendance status "${status}"`);
  }
  db.run(
    `INSERT INTO attendance (employee_id, date, status) VALUES (?, ?, ?)
     ON CONFLICT(employee_id, date) DO UPDATE SET status=excluded.status, updated_at=?`,
    [employeeId, date, status, nowIso()],
  );
}

export function getAttendance(
  db: AppDatabase,
  employeeId: number,
  date: string,
): AttendanceStatus | null {
  const row = db.get<{ status: AttendanceStatus }>(
    'SELECT status FROM attendance WHERE employee_id=? AND date=?',
    [employeeId, date],
  );
  return row?.status ?? null;
}

export function listAttendanceForMonth(
  db: AppDatabase,
  employeeId: number,
  month: string, // YYYY-MM
): Record<string, AttendanceStatus> {
  const rows = db.query<{ date: string; status: AttendanceStatus }>(
    'SELECT date, status FROM attendance WHERE employee_id=? AND substr(date,1,7)=?',
    [employeeId, month],
  );
  const map: Record<string, AttendanceStatus> = {};
  for (const r of rows) map[r.date] = r.status;
  return map;
}

export interface AttendanceSummary {
  present: number;
  halfDays: number;
  absent: number;
  weeklyOff: number;
  holiday: number;
  total: number;
}

export function attendanceSummaryForMonth(
  db: AppDatabase,
  employeeId: number,
  month: string,
): AttendanceSummary {
  const rows = db.query<{ status: AttendanceStatus }>(
    "SELECT status FROM attendance WHERE employee_id=? AND substr(date,1,7)=? AND status IN ('P','HD','A','WO','H')",
    [employeeId, month],
  );
  const sum: AttendanceSummary = { present: 0, halfDays: 0, absent: 0, weeklyOff: 0, holiday: 0, total: rows.length };
  for (const r of rows) {
    switch (r.status) {
      case PRESENT:
        sum.present++;
        break;
      case HALF_DAY:
        sum.halfDays++;
        break;
      case 'A':
        sum.absent++;
        break;
      case 'WO':
        sum.weeklyOff++;
        break;
      case 'H':
        sum.holiday++;
        break;
    }
  }
  return sum;
}

export function listAttendanceMonth(
  db: AppDatabase,
  month: string,
): Array<{ employeeId: number; employeeName: string; date: string; status: AttendanceStatus }> {
  return db.query(
    `SELECT a.employee_id AS employeeId, e.name AS employeeName, a.date, a.status
     FROM attendance a JOIN employees e ON e.id=a.employee_id
     WHERE substr(a.date,1,7)=? ORDER BY a.date, e.name`,
    [month],
  );
}

/** Mark entire month absent by default is not desired; this is a helper used on employee create. No-op. */
export function getAllAttendance(db: AppDatabase, month: string): Attendance[] {
  return db.query<Attendance>(
    `SELECT a.*, e.name AS employeeName FROM attendance a JOIN employees e ON e.id=a.employee_id
     WHERE substr(a.date,1,7)=? ORDER BY a.date`,
    [month],
  );
}

export { ATTENDANCE_STATUSES, PRESENT, HALF_DAY };