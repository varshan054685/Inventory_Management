import type { AppDatabase } from '../db/connection';
import { round2, monthOf } from './util';
import { audit } from './audit';
import { getEmployee, listEmployees } from './masters';
import { attendanceSummaryForMonth } from './attendance';
import { overtimeSummaryByEmployee } from './overtime';
import { WAGE_DRAFT, WAGE_LOCKED } from '../../src/shared/constants';
import type { Wage } from '../../src/shared/types';

export interface WageCalculation {
  employeeId: number;
  employeeName: string;
  month: string;
  presentDays: number;
  halfDays: number;
  normalWage: number;
  overtimeAmount: number;
  additions: number;
  deductions: number;
  totalWage: number;
  dailyWage: number;
  halfDayWage: number;
  locked: boolean;
}

/** Calculate one employee's monthly wage from attendance + overtime. Pure math. */
export function calculateEmployeeWage(
  db: AppDatabase,
  employeeId: number,
  month: string,
): WageCalculation {
  const emp = getEmployee(db, employeeId);
  if (!emp) throw new Error('Employee not found');
  const att = attendanceSummaryForMonth(db, employeeId, month);
  const normalWage = round2(att.present * emp.dailyWage + att.halfDays * emp.halfDayWage);
  const ot = overtimeSummaryByEmployee(db, month).find((o) => o.employeeId === employeeId);
  const overtimeAmount = round2(ot?.amount ?? 0);

  const existing = getWage(db, employeeId, month);
  const additions = existing?.additions || 0;
  const deductions = existing?.deductions || 0;
  const totalWage = round2(normalWage + overtimeAmount + additions - deductions);

  return {
    employeeId,
    employeeName: emp.name,
    month,
    presentDays: att.present,
    halfDays: att.halfDays,
    normalWage,
    overtimeAmount,
    additions,
    deductions,
    totalWage,
    dailyWage: emp.dailyWage,
    halfDayWage: emp.halfDayWage,
    locked: existing?.status === WAGE_LOCKED,
  };
}

/** Preview wages for all active employees for a month. */
export function previewMonthWages(db: AppDatabase, month: string): WageCalculation[] {
  return listEmployees(db)
    .filter((e) => e.status === 'active')
    .map((e) => calculateEmployeeWage(db, e.id, month));
}

function applyCalculation(db: AppDatabase, calc: WageCalculation): Wage {
  db.run(
    `INSERT INTO wages (employee_id, month, present_days, half_days, normal_wage, overtime_amount, additions, deductions, total_wage, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
     ON CONFLICT(employee_id, month) DO UPDATE SET
       present_days=excluded.present_days, half_days=excluded.half_days,
       normal_wage=excluded.normal_wage, overtime_amount=excluded.overtime_amount,
       additions=excluded.additions, deductions=excluded.deductions,
       total_wage=excluded.total_wage,
       status = CASE WHEN wages.status='locked' THEN 'locked' ELSE 'draft' END,
       updated_at=datetime('now','localtime')`,
    [
      calc.employeeId,
      calc.month,
      calc.presentDays,
      calc.halfDays,
      calc.normalWage,
      calc.overtimeAmount,
      calc.additions,
      calc.deductions,
      calc.totalWage,
    ],
  );
  return getWage(db, calc.employeeId, calc.month)!;
}

/** Recalculate (refresh) one employee's wage row from current attendance/OT. */
export function calculateAndSaveWage(db: AppDatabase, employeeId: number, month: string): Wage {
  const existing = getWage(db, employeeId, month);
  if (existing?.status === WAGE_LOCKED) {
    throw new Error('This payroll is locked. Unlock it before recalculating.');
  }
  const calc = calculateEmployeeWage(db, employeeId, month);
  return db.transaction(() => applyCalculation(db, calc));
}

/** Adjust additions/deductions before final approval. Enforces lock. */
export function adjustWage(
  db: AppDatabase,
  employeeId: number,
  month: string,
  additions: number,
  deductions: number,
): Wage {
  const existing = getWage(db, employeeId, month);
  if (existing?.status === WAGE_LOCKED) {
    throw new Error('This payroll is locked. Unlock it before adjusting.');
  }
  if (additions < 0 || deductions < 0) throw new Error('Additions and deductions cannot be negative');
  const calc = calculateEmployeeWage(db, employeeId, month);
  const w = db.transaction(() => {
    db.run(
      `INSERT INTO wages (employee_id, month, present_days, half_days, normal_wage, overtime_amount, additions, deductions, total_wage, status)
       VALUES (?,?,?,?,?,?,?,?,?, 'draft')
       ON CONFLICT(employee_id, month) DO UPDATE SET additions=?, deductions=?,
       total_wage = normal_wage + overtime_amount + ? - ?, updated_at=datetime('now','localtime')`,
      [
        employeeId, month, calc.presentDays, calc.halfDays, calc.normalWage, calc.overtimeAmount,
        additions, deductions, round2(calc.normalWage + calc.overtimeAmount + additions - deductions),
        additions, deductions, additions, deductions,
      ],
    );
    return getWage(db, employeeId, month)!;
  });
  audit(db, 'WAGE_ADJUST', 'wages', w.id, `Adjusted wage for month ${month}`);
  return w;
}

/** Lock (finalize) a payroll for an employee/month. */
export function lockWage(db: AppDatabase, employeeId: number, month: string): Wage {
  const existing = getWage(db, employeeId, month);
  if (!existing) throw new Error('No payroll record to lock. Calculate wages first.');
  db.run("UPDATE wages SET status='locked', updated_at=datetime('now','localtime') WHERE employee_id=? AND month=?", [
    employeeId,
    month,
  ]);
  audit(db, 'WAGE_LOCK', 'wages', existing.id, `Locked wages for ${month}`);
  return getWage(db, employeeId, month)!;
}

/** Unlock a payroll so it can be edited. */
export function unlockWage(db: AppDatabase, employeeId: number, month: string): Wage {
  const existing = getWage(db, employeeId, month);
  if (!existing) throw new Error('No payroll record to unlock');
  db.run("UPDATE wages SET status='unlocked', updated_at=datetime('now','localtime') WHERE employee_id=? AND month=?", [
    employeeId,
    month,
  ]);
  audit(db, 'WAGE_UNLOCK', 'wages', existing.id, `Unlocked wages for ${month}`);
  return getWage(db, employeeId, month)!;
}

export function calculateAllWagesForMonth(db: AppDatabase, month: string): Wage[] {
  const calcs = previewMonthWages(db, month);
  return db.transaction(() => {
    const saved: Wage[] = [];
    for (const c of calcs) {
      const existing = getWage(db, c.employeeId, month);
      if (existing?.status === WAGE_LOCKED) continue; // skip locked rows
      saved.push(applyCalculation(db, c));
    }
    return saved;
  });
}

export function getWage(
  db: AppDatabase,
  employeeId: number,
  month: string,
): Wage | undefined {
  const row = db.get<Wage>(
    `SELECT w.*, e.name AS employeeName FROM wages w JOIN employees e ON e.id=w.employee_id
     WHERE w.employee_id=? AND w.month=?`,
    [employeeId, month],
  );
  return row;
}

export function listWages(
  db: AppDatabase,
  opts: { month?: string; search?: string; limit?: number; offset?: number } = {},
): { rows: Wage[]; total: number } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (opts.month) {
    clauses.push('w.month = ?');
    params.push(opts.month);
  }
  if (opts.search) {
    clauses.push('e.name LIKE ?');
    params.push(`%${opts.search}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = db.value<number>(`SELECT COUNT(*) c FROM wages w JOIN employees e ON e.id=w.employee_id ${where}`, params) ?? 0;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  params.push(limit, offset);
  const rows = db.query<Wage>(
    `SELECT w.*, e.name AS employeeName FROM wages w JOIN employees e ON e.id=w.employee_id ${where}
     ORDER BY w.month DESC, e.name LIMIT ? OFFSET ?`,
    params,
  );
  return { rows, total };
}

export function monthTotals(db: AppDatabase, month: string): {
  totalWages: number;
  totalOvertime: number;
  count: number;
} {
  const row = db.get<{ totalWages: number; totalOvertime: number; count: number }>(
    `SELECT ROUND(COALESCE(SUM(total_wage),0),2) AS totalWages,
       ROUND(COALESCE(SUM(overtime_amount),0),2) AS totalOvertime,
       COUNT(*) AS count FROM wages WHERE month=?`,
    [month],
  );
  return row ?? { totalWages: 0, totalOvertime: 0, count: 0 };
}

export { WAGE_DRAFT, WAGE_LOCKED, monthOf };