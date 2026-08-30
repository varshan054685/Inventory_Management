import type { AppDatabase } from '../db/connection';
import { DISPATCH_OUT, FINISHED } from '../../src/shared/constants';
import { round2, todayIso, padNo } from './util';
import { audit } from './audit';
import { addStockMovement, deleteStockMovementsForReference } from './stock';
import { getProduct } from './masters';
import { getAllowNegativeStock } from './settings';
import type { Dispatch } from '../../src/shared/types';

export interface DispatchInput {
  dispatchDate?: string;
  productId: number;
  quantity: number;
  vehicleNumber?: string | null;
  location?: string | null;
  receiver?: string | null;
  notes?: string | null;
  unitPrice?: number | null;
}

function nextDispatchNo(db: AppDatabase): string {
  const seq = (db.value<number>('SELECT COUNT(*) c FROM dispatches') ?? 0) + 1;
  return `DSP-${padNo(seq)}`;
}

export function nextSuggestedDispatchNo(db: AppDatabase): string {
  return nextDispatchNo(db);
}

/** Availability check helper exposed for UI to show "Available: X, Requested: Y". */
export function getDispatchAvailability(
  db: AppDatabase,
  productId: number,
): { available: number; productName: string; unit: string } {
  const product = getProduct(db, productId);
  if (!product) throw new Error('Select a valid product');
  let available = 0;
  const r = db.get<{ s: number }>(
    'SELECT COALESCE(SUM(quantity),0) s FROM stock_movements WHERE item_type=? AND item_id=?',
    [FINISHED, productId],
  );
  available = r?.s ?? 0;
  return { available: round2(available), productName: product.name, unit: product.unit };
}

export function createDispatch(db: AppDatabase, input: DispatchInput): Dispatch {
  const product = getProduct(db, input.productId);
  if (!product) throw new Error('Select a valid product');
  if (!(input.quantity > 0)) throw new Error('Dispatch quantity must be > 0');

  const allowNegative = getAllowNegativeStock(db);
  const available = getDispatchAvailability(db, input.productId).available;
  if (!allowNegative && input.quantity > available) {
    throw new Error(
      `Insufficient stock. Available: ${available} ${product.unit}, Requested: ${input.quantity} ${product.unit}`,
    );
  }

  const dispatchDate = input.dispatchDate ?? todayIso();
  const unitPrice = Number(input.unitPrice ?? 0) ?? 0;
  const totalAmount = round2(input.quantity * unitPrice);

  return db.transaction(() => {
    db.run(
      `INSERT INTO dispatches (dispatch_no, dispatch_date, product_id, quantity, vehicle_number, location, receiver, notes, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nextDispatchNo(db),
        dispatchDate,
        input.productId,
        Number(input.quantity),
        input.vehicleNumber ?? null,
        input.location ?? null,
        input.receiver ?? null,
        input.notes ?? null,
        totalAmount,
      ],
    );
    const dispatchId = db.getLastInsertId();
    addStockMovement(db, {
      date: dispatchDate,
      itemType: FINISHED,
      itemId: input.productId,
      quantity: -Number(input.quantity),
      unit: product.unit,
      movementType: DISPATCH_OUT,
      referenceId: dispatchId,
      notes: `Dispatch ${dispatchId}`,
    });
    audit(db, 'DISPATCH_CREATE', 'dispatches', dispatchId, `Dispatch #${dispatchId} for ${product.name}`);
    return getDispatch(db, dispatchId)!;
  });
}

export function updateDispatch(db: AppDatabase, id: number, input: DispatchInput): Dispatch {
  const existing = getDispatch(db, id);
  if (!existing) throw new Error('Dispatch not found');
  const product = getProduct(db, input.productId);
  if (!product) throw new Error('Select a valid product');
  if (!(input.quantity > 0)) throw new Error('Dispatch quantity must be > 0');

  const allowNegative = getAllowNegativeStock(db);
  const dispatchDate = input.dispatchDate ?? existing.dispatchDate;
  const unitPrice = Number(input.unitPrice ?? 0);
  const totalAmount = round2(input.quantity * unitPrice);

  return db.transaction(() => {
    // Check availability: current stock + restored old quantity (if decreasing).
    deleteStockMovementsForReference(db, id, DISPATCH_OUT);
    const available = getDispatchAvailability(db, input.productId).available;
    if (!allowNegative && input.quantity > available) {
      // Re-apply old movement to keep state consistent before abort.
      addStockMovement(db, {
        date: existing.dispatchDate,
        itemType: FINISHED,
        itemId: existing.productId,
        quantity: -existing.quantity,
        unit: existing.productUnit ?? product.unit,
        movementType: DISPATCH_OUT,
        referenceId: id,
        notes: `Dispatch ${id}`,
      });
      throw new Error(
        `Insufficient stock. Available: ${available} ${product.unit}, Requested: ${input.quantity} ${product.unit}`,
      );
    }
    db.run(
      `UPDATE dispatches SET dispatch_date=?, product_id=?, quantity=?, vehicle_number=?, location=?,
         receiver=?, notes=?, total_amount=? WHERE id=?`,
      [
        dispatchDate,
        input.productId,
        Number(input.quantity),
        input.vehicleNumber ?? null,
        input.location ?? null,
        input.receiver ?? null,
        input.notes ?? null,
        totalAmount,
        id,
      ],
    );
    addStockMovement(db, {
      date: dispatchDate,
      itemType: FINISHED,
      itemId: input.productId,
      quantity: -Number(input.quantity),
      unit: product.unit,
      movementType: DISPATCH_OUT,
      referenceId: id,
      notes: `Dispatch ${id}`,
    });
    audit(db, 'DISPATCH_UPDATE', 'dispatches', id, `Dispatch #${id} updated`);
    return getDispatch(db, id)!;
  });
}

export function deleteDispatch(db: AppDatabase, id: number): void {
  if (!getDispatch(db, id)) throw new Error('Dispatch not found');
  db.transaction(() => {
    deleteStockMovementsForReference(db, id, DISPATCH_OUT);
    db.run('DELETE FROM dispatches WHERE id=?', [id]);
  });
  audit(db, 'DISPATCH_DELETE', 'dispatches', id, `Dispatch #${id} deleted`);
}

export function getDispatch(db: AppDatabase, id: number): Dispatch | undefined {
  return db.get<Dispatch>(
    `SELECT d.*, p.name AS productName, p.unit AS productUnit FROM dispatches d
     JOIN products p ON p.id=d.product_id WHERE d.id=?`,
    [id],
  );
}

export function listDispatches(
  db: AppDatabase,
  opts: { search?: string; fromDate?: string; toDate?: string; limit?: number; offset?: number } = {},
): { rows: Dispatch[]; total: number } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (opts.fromDate) {
    clauses.push('d.dispatch_date >= ?');
    params.push(opts.fromDate);
  }
  if (opts.toDate) {
    clauses.push('d.dispatch_date <= ?');
    params.push(opts.toDate);
  }
  if (opts.search) {
    clauses.push('(d.dispatch_no LIKE ? OR p.name LIKE ? OR COALESCE(d.vehicle_number,\'\') LIKE ?)');
    const like = `%${opts.search}%`;
    params.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total =
    db.value<number>(
      `SELECT COUNT(*) c FROM dispatches d JOIN products p ON p.id=d.product_id ${where}`,
      params,
    ) ?? 0;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  params.push(limit, offset);
  const rows = db.query<Dispatch>(
    `SELECT d.*, p.name AS productName, p.unit AS productUnit FROM dispatches d
     JOIN products p ON p.id=d.product_id ${where}
     ORDER BY d.dispatch_date DESC, d.id DESC LIMIT ? OFFSET ?`,
    params,
  );
  return { rows, total };
}