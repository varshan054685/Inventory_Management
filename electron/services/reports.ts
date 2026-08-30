import type { AppDatabase } from '../db/connection';
import { round2, monthOf } from './util';
import { RAW, FINISHED } from '../../src/shared/constants';
import { listItemBalances } from './stock';
import { getProduct, getRawMaterial } from './masters';

// ---------------------------------------------------------------------------
// PURCHASE REPORTS
// ---------------------------------------------------------------------------
export function dailyPurchaseReport(db: AppDatabase, fromDate: string, toDate: string) {
  const rows = db.query(
    `SELECT p.purchase_date AS date, p.purchase_no AS no, COALESCE(s.name,'—') AS supplier,
       p.total_amount AS amount, p.notes
     FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id
     WHERE p.purchase_date BETWEEN ? AND ? ORDER BY p.purchase_date DESC`,
    [fromDate, toDate],
  );
  const total = round2(rows.reduce((a, r) => a + Number(r.amount || 0), 0));
  return { rows, total };
}

export function purchaseReportBySupplier(db: AppDatabase, fromDate: string, toDate: string) {
  const rows = db.query(
    `SELECT COALESCE(s.name,'Direct') AS supplier, COUNT(*) AS count,
       ROUND(SUM(p.total_amount),2) AS amount, COALESCE(s.gst_number,'') AS gstNumber
     FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id
     WHERE p.purchase_date BETWEEN ? AND ? GROUP BY supplier ORDER BY amount DESC`,
    [fromDate, toDate],
  );
  return { rows, total: round2(rows.reduce((a, r) => a + Number(r.amount || 0), 0)) };
}

export function purchaseReportByItem(db: AppDatabase, fromDate: string, toDate: string) {
  const rows = db.query(
    `SELECT rm.name AS item, rm.unit AS unit, COUNT(*) AS orders,
       ROUND(SUM(pi.quantity),2) AS qty, ROUND(SUM(pi.amount),2) AS amount
     FROM purchase_items pi
     JOIN purchases p ON p.id=pi.purchase_id
     JOIN raw_materials rm ON rm.id=pi.raw_material_id
     WHERE p.purchase_date BETWEEN ? AND ? GROUP BY rm.id ORDER BY amount DESC`,
    [fromDate, toDate],
  );
  return { rows, total: round2(rows.reduce((a, r) => a + Number(r.amount || 0), 0)) };
}

export function monthlyPurchaseReport(db: AppDatabase, fromDate: string, toDate: string) {
  const rows = db.query(
    `SELECT substr(purchase_date,1,7) AS month, COUNT(*) AS count, ROUND(SUM(total_amount),2) AS amount
     FROM purchases WHERE purchase_date BETWEEN ? AND ? GROUP BY month ORDER BY month`,
    [fromDate, toDate],
  );
  return { rows, total: round2(rows.reduce((a, r) => a + Number(r.amount || 0), 0)) };
}

// ---------------------------------------------------------------------------
// PRODUCTION REPORTS
// ---------------------------------------------------------------------------
export function dailyProductionReport(db: AppDatabase, fromDate: string, toDate: string) {
  const rows = db.query(
    `SELECT p.production_date AS date, p.production_no AS no, pr.name AS product, pr.unit,
       p.units, p.total_cost AS cost
     FROM productions p JOIN products pr ON pr.id=p.product_id
     WHERE p.production_date BETWEEN ? AND ? ORDER BY p.production_date DESC`,
    [fromDate, toDate],
  );
  const totalUnits = round2(rows.reduce((a, r) => a + Number(r.units || 0), 0));
  const totalCost = round2(rows.reduce((a, r) => a + Number(r.cost || 0), 0));
  return { rows, totalUnits, totalCost };
}

export function productionReportByProduct(db: AppDatabase, fromDate: string, toDate: string) {
  const rows = db.query(
    `SELECT pr.name AS product, COUNT(*) AS batches, ROUND(SUM(p.units),2) AS units,
       ROUND(SUM(p.total_cost),2) AS cost, pr.unit
     FROM productions p JOIN products pr ON pr.id=p.product_id
     WHERE p.production_date BETWEEN ? AND ? GROUP BY pr.id ORDER BY units DESC`,
    [fromDate, toDate],
  );
  return { rows, totalCost: round2(rows.reduce((a, r) => a + Number(r.cost || 0), 0)) };
}

export function monthlyProductionReport(db: AppDatabase, fromDate: string, toDate: string) {
  const rows = db.query(
    `SELECT substr(production_date,1,7) AS month, COUNT(*) AS count,
       ROUND(SUM(units),2) AS units, ROUND(SUM(total_cost),2) AS cost
     FROM productions WHERE production_date BETWEEN ? AND ? GROUP BY month ORDER BY month`,
    [fromDate, toDate],
  );
  return { rows, totalUnits: round2(rows.reduce((a, r) => a + Number(r.units || 0), 0)) };
}

// ---------------------------------------------------------------------------
// STOCK REPORTS
// ---------------------------------------------------------------------------
export interface StockRow {
  itemType: string;
  itemId: number;
  name: string;
  unit: string;
  opening: number;
  received: number;
  consumed: number;
  produced: number;
  dispatched: number;
  adjustedIn: number;
  adjustedOut: number;
  closing: number;
  minStock: number;
  status: string;
}

export function currentStockReport(
  db: AppDatabase,
  opts: { onlyLow?: boolean; type?: 'RAW' | 'FINISHED' | 'ALL' } = {},
): StockRow[] {
  const out: StockRow[] = [];
  const types = opts.type === 'RAW' ? [RAW] : opts.type === 'FINISHED' ? [FINISHED] : [RAW, FINISHED];
  if (types.includes(RAW)) {
    const mats = db.query<{ id: number; name: string; unit: string; minStock: number; status: string }>(
      'SELECT * FROM raw_materials',
    );
    for (const m of mats) {
      const closing = bal(db, RAW, m.id);
      out.push({
        itemType: RAW, itemId: m.id, name: m.name, unit: m.unit,
        opening: 0, received: 0, consumed: 0, produced: 0, dispatched: 0,
        adjustedIn: 0, adjustedOut: 0, closing, minStock: m.minStock, status: m.status,
      });
    }
  }
  if (types.includes(FINISHED)) {
    const prods = db.query<{ id: number; name: string; unit: string; minStock: number; status: string }>(
      'SELECT * FROM products',
    );
    for (const p of prods) {
      const closing = bal(db, FINISHED, p.id);
      out.push({
        itemType: FINISHED, itemId: p.id, name: p.name, unit: p.unit,
        opening: 0, received: 0, consumed: 0, produced: 0, dispatched: 0,
        adjustedIn: 0, adjustedOut: 0, closing, minStock: p.minStock, status: p.status,
      });
    }
  }
  if (opts.onlyLow) {
    return out.filter((r) => r.closing <= r.minStock);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function bal(db: AppDatabase, itemType: string, itemId: number): number {
  return round2(db.value<number>('SELECT COALESCE(SUM(quantity),0) FROM stock_movements WHERE item_type=? AND item_id=?', [itemType, itemId]) ?? 0);
}

export function stockMovementReport(
  db: AppDatabase,
  opts: { fromDate?: string; toDate?: string; type?: string; itemId?: number; limit?: number; offset?: number } = {},
): { rows: Array<Record<string, unknown>>; total: number } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (opts.fromDate) {
    clauses.push('sm.date >= ?');
    params.push(opts.fromDate);
  }
  if (opts.toDate) {
    clauses.push('sm.date <= ?');
    params.push(opts.toDate);
  }
  if (opts.type && opts.type !== 'ALL') {
    clauses.push('sm.item_type=?');
    params.push(opts.type);
  }
  if (opts.itemId) {
    clauses.push('sm.item_id=?');
    params.push(opts.itemId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = db.value<number>(`SELECT COUNT(*) FROM stock_movements sm ${where}`, params) ?? 0;
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;
  params.push(limit, offset);
  const withoutItemQuery = `
    SELECT sm.id, sm.date, sm.item_type AS itemType, sm.item_id AS itemId, sm.quantity, sm.unit,
       sm.movement_type AS movementType, sm.reference_id AS referenceId, sm.notes,
       COALESCE((SELECT name FROM raw_materials r WHERE r.id=sm.item_id) ,
                (SELECT name FROM products p WHERE p.id=sm.item_id), '') AS itemName
    FROM stock_movements sm ${where} ORDER BY sm.id DESC LIMIT ? OFFSET ?`;
  const rows = db.query(withoutItemQuery, params);
  return { rows, total };
}

// ---------------------------------------------------------------------------
// STAFF / ATTENDANCE REPORTS
// ---------------------------------------------------------------------------
export function attendanceReportMonth(
  db: AppDatabase,
  month: string,
): Array<{ employeeId: number; employeeName: string; present: number; halfDays: number; absent: number; weeklyOff: number; holiday: number }> {
  return db.query(
    `SELECT e.id AS employeeId, e.name AS employeeName,
       SUM(CASE WHEN a.status='P' THEN 1 ELSE 0 END) AS present,
       SUM(CASE WHEN a.status='HD' THEN 1 ELSE 0 END) AS halfDays,
       SUM(CASE WHEN a.status='A' THEN 1 ELSE 0 END) AS absent,
       SUM(CASE WHEN a.status='WO' THEN 1 ELSE 0 END) AS weeklyOff,
       SUM(CASE WHEN a.status='H' THEN 1 ELSE 0 END) AS holiday
     FROM employees e LEFT JOIN attendance a ON a.employee_id=e.id AND substr(a.date,1,7)=?
     WHERE e.status='active' GROUP BY e.id ORDER BY e.name`,
    [month],
  );
}

// ---------------------------------------------------------------------------
// WAGE / PAYROLL REPORTS
// ---------------------------------------------------------------------------
export function wageReportMonth(
  db: AppDatabase,
  month: string,
): Array<Record<string, unknown>> {
  return db.query(
    `SELECT w.month, e.name AS employeeName, w.present_days AS presentDays, w.half_days AS halfDays,
       w.normal_wage AS normalWage, w.overtime_amount AS overtimeAmount, w.additions, w.deductions,
       w.total_wage AS totalWage, w.status
     FROM wages w JOIN employees e ON e.id=w.employee_id WHERE w.month=? ORDER BY e.name`,
    [month],
  );
}

export function overtimeReportMonth(db: AppDatabase, month: string) {
  return db.query(
    `SELECT e.name AS employeeName, ROUND(SUM(o.hours),2) AS hours, o.rate,
       ROUND(SUM(o.amount),2) AS amount, COUNT(*) AS days
     FROM overtime o JOIN employees e ON e.id=o.employee_id
     WHERE substr(o.date,1,7)=? GROUP BY e.id ORDER BY amount DESC`,
    [month],
  );
}

export function payrollSummary(db: AppDatabase, fromDate: string, toDate: string) {
  return db.query(
    `SELECT substr(month,1,4) AS year, month, COUNT(*) AS employees,
       ROUND(SUM(normal_wage),2) AS normal, ROUND(SUM(overtime_amount),2) AS overtime,
       ROUND(SUM(additions),2) AS additions, ROUND(SUM(deductions),2) AS deductions,
       ROUND(SUM(total_wage),2) AS total
     FROM wages WHERE month BETWEEN substr(?,1,7) AND substr(?,1,7)
     GROUP BY month ORDER BY month`,
    [fromDate, toDate],
  );
}

// ---------------------------------------------------------------------------
// DISPATCH REPORTS
// ---------------------------------------------------------------------------
export function dailyDispatchReport(db: AppDatabase, fromDate: string, toDate: string) {
  const rows = db.query(
    `SELECT d.dispatch_date AS date, d.dispatch_no AS no, pr.name AS product, d.quantity,
       d.vehicle_number AS vehicle, d.location, d.receiver, d.total_amount AS amount
     FROM dispatches d JOIN products pr ON pr.id=d.product_id
     WHERE d.dispatch_date BETWEEN ? AND ? ORDER BY d.dispatch_date DESC`,
    [fromDate, toDate],
  );
  const totalQty = round2(rows.reduce((a, r) => a + Number(r.quantity || 0), 0));
  return { rows, totalQty };
}

export function dispatchReportByProduct(db: AppDatabase, fromDate: string, toDate: string) {
  const rows = db.query(
    `SELECT pr.name AS product, pr.unit, COUNT(*) AS orders, ROUND(SUM(d.quantity),2) AS qty,
       ROUND(SUM(d.total_amount),2) AS amount
     FROM dispatches d JOIN products pr ON pr.id=d.product_id
     WHERE d.dispatch_date BETWEEN ? AND ? GROUP BY pr.id ORDER BY qty DESC`,
    [fromDate, toDate],
  );
  return rows;
}

export function dispatchReportByVehicle(db: AppDatabase, fromDate: string, toDate: string) {
  return db.query(
    `SELECT COALESCE(d.vehicle_number,'—') AS vehicle, COUNT(*) AS orders, ROUND(SUM(d.quantity),2) AS qty
     FROM dispatches d WHERE d.dispatch_date BETWEEN ? AND ? GROUP BY vehicle ORDER BY qty DESC`,
    [fromDate, toDate],
  );
}

export function dispatchReportByLocation(db: AppDatabase, fromDate: string, toDate: string) {
  return db.query(
    `SELECT COALESCE(d.location,'—') AS location, COUNT(*) AS orders, ROUND(SUM(d.quantity),2) AS qty
     FROM dispatches d WHERE d.dispatch_date BETWEEN ? AND ? GROUP BY location ORDER BY qty DESC`,
    [fromDate, toDate],
  );
}

// ---------------------------------------------------------------------------
// BUSINESS REPORTS
// ---------------------------------------------------------------------------
export function monthlyBusinessSummary(db: AppDatabase, fromDate: string, toDate: string) {
  const purchases = db.query(
    `SELECT substr(purchase_date,1,7) AS month, ROUND(SUM(total_amount),2) AS purchase
     FROM purchases WHERE purchase_date BETWEEN ? AND ? GROUP BY month`,
    [fromDate, toDate],
  );
  const production = db.query(
    `SELECT substr(production_date,1,7) AS month, ROUND(SUM(total_cost),2) AS productionCost
     FROM productions WHERE production_date BETWEEN ? AND ? GROUP BY month`,
    [fromDate, toDate],
  );
  const dispatch = db.query(
    `SELECT substr(dispatch_date,1,7) AS month, ROUND(SUM(total_amount),2) AS dispatchValue, ROUND(SUM(quantity),2) AS qty
     FROM dispatches WHERE dispatch_date BETWEEN ? AND ? GROUP BY month`,
    [fromDate, toDate],
  );
  const wages = db.query(
    `SELECT month, ROUND(SUM(total_wage),2) AS wages FROM wages
     WHERE month BETWEEN substr(?,1,7) AND substr(?,1,7) GROUP BY month`,
    [fromDate, toDate],
  );
  return { purchases, production, dispatch, wages };
}

export function expenseSummary(db: AppDatabase, fromDate: string, toDate: string) {
  const totalPurchases = db.value<number>('SELECT COALESCE(SUM(total_amount),0) FROM purchases WHERE purchase_date BETWEEN ? AND ?', [fromDate, toDate]) ?? 0;
  const totalProduction = db.value<number>('SELECT COALESCE(SUM(total_cost),0) FROM productions WHERE production_date BETWEEN ? AND ?', [fromDate, toDate]) ?? 0;
  const totalWages = db.value<number>('SELECT COALESCE(SUM(total_wage),0) FROM wages WHERE month BETWEEN substr(?,1,7) AND substr(?,1,7)', [fromDate, toDate]) ?? 0;
  return {
    totalPurchases: round2(totalPurchases),
    totalProductionCost: round2(totalProduction),
    totalWages: round2(totalWages),
    totalOvertime: round2(db.value<number>('SELECT COALESCE(SUM(amount),0) FROM overtime WHERE date BETWEEN ? AND ?', [fromDate, toDate]) ?? 0),
  };
}

export { monthOf };