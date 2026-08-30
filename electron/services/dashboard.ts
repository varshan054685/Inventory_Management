import type { AppDatabase } from '../db/connection';
import { round2, todayIso, monthOf } from './util';
import { getSettings } from './settings';
import type { DashboardStats, ItemType, Unit } from '../../src/shared/types';
import { RAW, FINISHED } from '../../src/shared/constants';
import { listItemBalances } from './stock';
import { getProduct, getRawMaterial } from './masters';

export function getDashboardStats(db: AppDatabase): DashboardStats {
  const today = todayIso();
  const month = monthOf(today);
  const settings = getSettings(db);

  const todayPurchases =
    db.value<number>('SELECT COALESCE(SUM(total_amount),0) FROM purchases WHERE purchase_date = ?', [today]) ?? 0;
  const todayProduction =
    db.value<number>('SELECT COALESCE(SUM(units),0) FROM productions WHERE production_date = ?', [today]) ?? 0;
  const todayDispatch =
    db.value<number>('SELECT COALESCE(SUM(quantity),0) FROM dispatches WHERE dispatch_date = ?', [today]) ?? 0;

  const rawBalances = listItemBalances(db, RAW);
  const finBalances = listItemBalances(db, FINISHED);
  const rawItems = rawBalances.filter((b) => b.balance !== 0 || true).length;
  const finItems = finBalances.length;

  const staffPresent =
    db.value<number>("SELECT COUNT(DISTINCT employee_id) FROM attendance WHERE date=? AND status IN ('P','HD')", [today]) ?? 0;
  const staffTotal =
    db.value<number>("SELECT COUNT(*) FROM employees WHERE status='active'") ?? 0;
  const staffAbsent = Math.max(0, staffTotal - staffPresent);

  const todayOvertime =
    db.value<number>('SELECT COALESCE(SUM(hours),0) FROM overtime WHERE date=?', [today]) ?? 0;

  const monthWages = monthTotals(db, month);

  // Low stock alert list.
  const lowStock: DashboardStats['lowStock'] = [];
  const thresholdFallback = settings.lowStockThreshold ?? 0;
  for (const b of rawBalances) {
    const mat = getRawMaterial(db, b.itemId);
    const minStock = mat?.minStock ?? thresholdFallback;
    if (b.balance <= minStock) {
      lowStock.push({
        itemType: RAW,
        itemId: b.itemId,
        name: mat?.name ?? `Material #${b.itemId}`,
        closing: b.balance,
        unit: mat?.unit ?? 'KG',
        minStock,
      });
    }
  }
  for (const b of finBalances) {
    const p = getProduct(db, b.itemId);
    const minStock = p?.minStock ?? thresholdFallback;
    if (b.balance <= minStock) {
      lowStock.push({
        itemType: FINISHED,
        itemId: b.itemId,
        name: p?.name ?? `Product #${b.itemId}`,
        closing: b.balance,
        unit: p?.unit ?? 'PIECES',
        minStock,
      });
    }
  }

  return {
    todayPurchasesAmount: round2(todayPurchases),
    todayProductionUnits: round2(todayProduction),
    todayDispatchQuantity: round2(todayDispatch),
    rawMaterialItems: rawItems,
    finishedProductItems: finItems,
    staffPresent,
    staffAbsent,
    todayOvertimeHours: round2(todayOvertime),
    monthWages: round2(monthWages),
    lowStock,
  };
}

function monthTotals(db: AppDatabase, month: string): number {
  return db.value<number>('SELECT COALESCE(SUM(total_wage),0) FROM wages WHERE month=?', [month]) ?? 0;
}

/** Monthly series used by dashboard charts. */
export function getMonthlySeries(
  db: AppDatabase,
  { fromDate, toDate }: { fromDate: string; toDate: string },
): {
  purchases: Array<{ month: string; total: number }>;
  production: Array<{ month: string; units: number; cost: number }>;
  dispatches: Array<{ month: string; quantity: number }>;
} {
  const purchases = db.query<{ month: string; total: number }>(
    `SELECT substr(purchase_date,1,7) AS month, ROUND(SUM(total_amount),2) AS total
     FROM purchases WHERE purchase_date BETWEEN ? AND ? GROUP BY substr(purchase_date,1,7) ORDER BY month`,
    [fromDate, toDate],
  );
  const production = db.query<{ month: string; units: number; cost: number }>(
    `SELECT substr(production_date,1,7) AS month, ROUND(SUM(units),2) AS units, ROUND(SUM(total_cost),2) AS cost
     FROM productions WHERE production_date BETWEEN ? AND ? GROUP BY substr(production_date,1,7) ORDER BY month`,
    [fromDate, toDate],
  );
  const dispatches = db.query<{ month: string; quantity: number }>(
    `SELECT substr(dispatch_date,1,7) AS month, ROUND(SUM(quantity),2) AS quantity
     FROM dispatches WHERE dispatch_date BETWEEN ? AND ? GROUP BY substr(dispatch_date,1,7) ORDER BY month`,
    [fromDate, toDate],
  );
  return { purchases, production, dispatches };
}

export type { ItemType, Unit };