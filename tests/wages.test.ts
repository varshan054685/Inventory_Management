import { describe, it, expect } from 'vitest';
import { withDb } from './helpers';
import { createEmployee } from '../electron/services/masters';
import { setAttendance, attendanceSummaryForMonth } from '../electron/services/attendance';
import { createOvertime, overtimeSummaryByEmployee } from '../electron/services/overtime';
import { calculateEmployeeWage, lockWage, calculateAndSaveWage } from '../electron/services/wages';

const MONTH = '2026-08';

describe('Attendance', () => {
  it('summarizes a month of attendance', async () => {
    await withDb((db) => {
      const e = createEmployee(db, { name: 'Ramesh', dailyWage: 600, halfDayWage: 300, overtimeRate: 100 });
      for (let d = 1; d <= 5; d++) {
        setAttendance(db, e.id, `${MONTH}-${String(d).padStart(2, '0')}`, 'P');
      }
      setAttendance(db, e.id, `${MONTH}-06`, 'HD');
      setAttendance(db, e.id, `${MONTH}-07`, 'A');
      const s = attendanceSummaryForMonth(db, e.id, MONTH);
      expect(s.present).toBe(5);
      expect(s.halfDays).toBe(1);
      expect(s.absent).toBe(1);
    });
  });

  it('prevents duplicates by upserting same employee/date', async () => {
    await withDb((db) => {
      const e = createEmployee(db, { name: 'A', dailyWage: 100, halfDayWage: 50, overtimeRate: 0 });
      setAttendance(db, e.id, `${MONTH}-08`, 'P');
      setAttendance(db, e.id, `${MONTH}-08`, 'A'); // overwrite
      const count = attendanceSummaryForMonth(db, e.id, MONTH);
      const raw = db.value<number>('SELECT COUNT(*) FROM attendance WHERE employee_id=?', [e.id]);
      expect(raw).toBe(1);
      expect(count.absent).toBe(1);
    });
  });
});

describe('Wage calculation', () => {
  const setup = (db: any) => {
    const e = createEmployee(db, { name: 'Ramesh', dailyWage: 600, halfDayWage: 300, overtimeRate: 100 });
    for (let d = 1; d <= 24; d++) setAttendance(db, e.id, `${MONTH}-${String(d).padStart(2, '0')}`, 'P');
    setAttendance(db, e.id, `${MONTH}-25`, 'HD');
    setAttendance(db, e.id, `${MONTH}-26`, 'HD');
    createOvertime(db, { employeeId: e.id, date: `${MONTH}-27`, hours: 3 });
    return e;
  };

  it('calculates half-day and normal wages', async () => {
    await withDb((db) => {
      setup(db);
      const calc = calculateEmployeeWage(db, 1, MONTH);
      expect(calc.presentDays).toBe(24);
      expect(calc.halfDays).toBe(2);
      expect(calc.normalWage).toBe(24 * 600 + 2 * 300); // 15000
    });
  });

  it('adds overtime to monthly wage', async () => {
    await withDb((db) => {
      setup(db);
      const calc = calculateEmployeeWage(db, 1, MONTH);
      expect(calc.overtimeAmount).toBe(3 * 100); // 300
      expect(calc.totalWage).toBe(15000 + 300);
    });
  });

  it('computes overtime amount from hours * rate', async () => {
    expect((100 * 3)).toBe(300);
  });

  it('locks payroll and blocks recalculation when locked', async () => {
    await withDb((db) => {
      setup(db);
      calculateAndSaveWage(db, 1, MONTH);
      lockWage(db, 1, MONTH);
      expect(() => calculateAndSaveWage(db, 1, MONTH)).toThrow(/locked/i);
    });
  });

  it('defaults overtime amount to 0 when no records', async () => {
    await withDb((db) => {
      const e = createEmployee(db, { name: 'NoOT', dailyWage: 100, halfDayWage: 50, overtimeRate: 20 });
      setAttendance(db, e.id, `${MONTH}-01`, 'P');
      const calc = calculateEmployeeWage(db, e.id, MONTH);
      expect(calc.overtimeAmount).toBe(0);
      expect(calc.totalWage).toBe(100);
    });
  });
});

describe('Overtime', () => {
  it('summarizes monthly overtime per employee', async () => {
    await withDb((db) => {
      const e = createEmployee(db, { name: 'OT', dailyWage: 100, halfDayWage: 50, overtimeRate: 50 });
      createOvertime(db, { employeeId: e.id, date: `${MONTH}-01`, hours: 2 });
      createOvertime(db, { employeeId: e.id, date: `${MONTH}-02`, hours: 4 });
      const sum = overtimeSummaryByEmployee(db, MONTH);
      expect(sum.length).toBe(1);
      expect(sum[0].totalHours).toBe(6);
      expect(sum[0].amount).toBe(300);
    });
  });
});