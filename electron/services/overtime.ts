import type { AppDatabase } from '../db/connection';
import { round2, timeToHours } from './util';
import { audit } from './audit';
import { getEmployee } from './masters';
import type { Overtime, Status } from '../../src/shared/types';

export interface OvertimeInput {
  employeeId: number;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  hours?: number;
  reason?: string | null;
}

export function computeOvertime(
  db: AppDatabase,
  input: OvertimeInput,
): { hours: number; rate: number; amount: number } {
  const emp = getEmployee(db, input.employeeId);
  if (!emp) throw new Error('Select a valid employee');
  const hours =
    input.hours !== undefined && input.hours !== null
      ? Number(input.hours)
      : timeToHours(input.startTime, input.endTime);
  if (!(hours > 0)) throw new Error('Overtime hours must be > 0');
  const rate = emp.overtimeRate || 0;
  return { hours: round2(hours), rate, amount: round2(hours * rate) };
}

export function createOvertime(db: AppDatabase, input: OvertimeInput): Overtime {
  const emp = getEmployee(db, input.employeeId);
  if (!emp) throw new Error('Select a valid employee');
  const { hours, rate, amount } = computeOvertime(db, input);
  db.run(
    `INSERT INTO overtime (employee_id, date, start_time, end_time, hours, rate, amount, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.employeeId,
      input.date,
      input.startTime ?? null,
      input.endTime ?? null,
      hours,
      rate,
      amount,
      input.reason ?? null,
      'active',
    ],
  );
  const id = db.getLastInsertId();
  audit(db, 'OVERTIME_CREATE', 'overtime', id, `Overtime ${hours}h for ${emp.name}`);
  return getOvertime(db, id)!;
}

export function updateOvertime(db: AppDatabase, id: number, input: OvertimeInput): Overtime {
  const existing = getOvertime(db, id);
  if (!existing) throw new Error('Overtime not found');
  const emp = getEmployee(db, input.employeeId);
  if (!emp) throw new Error('Select a valid employee');
  const { hours, rate, amount } = computeOvertime(db, input);
  db.run(
    `UPDATE overtime SET employee_id=?, date=?, start_time=?, end_time=?, hours=?, rate=?, amount=?, reason=? WHERE id=?`,
    [
      input.employeeId,
      input.date,
      input.startTime ?? null,
      input.endTime ?? null,
      hours,
      rate,
      amount,
      input.reason ?? null,
      id,
    ],
  );
  audit(db, 'OVERTIME_UPDATE', 'overtime', id, `Overtime #${id} updated`);
  return getOvertime(db, id)!;
}

export function deleteOvertime(db: AppDatabase, id: number): void {
  db.run('DELETE FROM overtime WHERE id=?', [id]);
  audit(db, 'OVERTIME_DELETE', 'overtime', id, `Overtime #${id} deleted`);
}

export function getOvertime(db: AppDatabase, id: number): Overtime | undefined {
  return db.get<Overtime>(
    `SELECT o.*, e.name AS employeeName FROM overtime o JOIN employees e ON e.id=o.employee_id WHERE o.id=?`,
    [id],
  );
}

export function listOvertime(
  db: AppDatabase,
  opts: { month?: string; fromDate?: string; toDate?: string; search?: string; limit?: number; offset?: number } = {},
): { rows: Overtime[]; total: number } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (opts.month) {
    clauses.push("substr(o.date,1,7) = ?");
    params.push(opts.month);
  }
  if (opts.fromDate) {
    clauses.push('o.date >= ?');
    params.push(opts.fromDate);
  }
  if (opts.toDate) {
    clauses.push('o.date <= ?');
    params.push(opts.toDate);
  }
  if (opts.search) {
    clauses.push('e.name LIKE ?');
    params.push(`%${opts.search}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = db.value<number>(`SELECT COUNT(*) c FROM overtime o JOIN employees e ON e.id=o.employee_id ${where}`, params) ?? 0;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  params.push(limit, offset);
  const rows = db.query<Overtime>(
    `SELECT o.*, e.name AS employeeName FROM overtime o JOIN employees e ON e.id=o.employee_id ${where}
     ORDER BY o.date DESC, o.id DESC LIMIT ? OFFSET ?`,
    params,
  );
  return { rows, total };
}

/** Monthly overtime totals per employee. */
export function overtimeSummaryByEmployee(
  db: AppDatabase,
  month: string,
): Array<{ employeeId: number; employeeName: string; totalHours: number; amount: number }> {
  return db.query(
    `SELECT o.employee_id AS employeeId, e.name AS employeeName,
       ROUND(SUM(o.hours),2) AS totalHours, ROUND(SUM(o.amount),2) AS amount
     FROM overtime o JOIN employees e ON e.id=o.employee_id
     WHERE substr(o.date,1,7)=? GROUP BY o.employee_id ORDER BY e.name`,
    [month],
  );
}

export type { Overtime, Status };