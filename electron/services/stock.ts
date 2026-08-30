import type { AppDatabase } from '../db/connection';
import type {
  ItemType,
  MovementType,
  StockBalance,
  Unit,
} from '../../src/shared/types';
import { RAW, FINISHED } from '../../src/shared/constants';
import { round2 } from './util';

export interface StockMovementInput {
  date: string;
  itemType: ItemType;
  itemId: number;
  quantity: number; // signed: + in, - out
  unit: Unit;
  movementType: MovementType;
  referenceId?: number | null;
  notes?: string | null;
}

export function addStockMovement(
  db: AppDatabase,
  input: StockMovementInput,
): number {
  const quantity = round2(input.quantity);
  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new Error('Stock movement quantity must be non-zero');
  }
  db.run(
    `INSERT INTO stock_movements (date, item_type, item_id, quantity, unit, movement_type, reference_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.date,
      input.itemType,
      input.itemId,
      quantity,
      input.unit,
      input.movementType,
      input.referenceId ?? null,
      input.notes ?? null,
    ],
  );
  return db.getLastInsertId();
}

export function deleteStockMovementsForReference(
  db: AppDatabase,
  refId: number,
  movementType?: MovementType,
): void {
  if (movementType) {
    db.run('DELETE FROM stock_movements WHERE reference_id = ? AND movement_type = ?', [refId, movementType]);
  } else {
    db.run('DELETE FROM stock_movements WHERE reference_id = ?', [refId]);
  }
}

export function deleteStockMovement(db: AppDatabase, id: number): void {
  db.run('DELETE FROM stock_movements WHERE id = ?', [id]);
}

export interface ItemNameResolver {
  (itemType: ItemType, itemId: number): string | undefined;
}

/** Current on-hand balance for one item/type. */
export function getItemBalance(
  db: AppDatabase,
  itemType: ItemType,
  itemId: number,
): number {
  return (
    db.value<number>(
      'SELECT COALESCE(SUM(quantity), 0) s FROM stock_movements WHERE item_type = ? AND item_id = ?',
      [itemType, itemId],
    ) ?? 0
  );
}

export function listItemBalances(
  db: AppDatabase,
  itemType: ItemType,
): Array<{ itemId: number; balance: number }> {
  return db.query<{ itemId: number; balance: number }>(
    'SELECT item_id AS itemId, COALESCE(SUM(quantity),0) AS balance FROM stock_movements WHERE item_type = ? GROUP BY item_id',
    [itemType],
  );
}

/**
 * Produces a full stock ledger breakdown (opening/received/consumed/produced/
 * dispatched/adjusted/closing) for a single item within an optional date range.
 */
export function getItemStockBalance(
  db: AppDatabase,
  itemType: ItemType,
  itemId: number,
  opts: { fromDate?: string; toDate?: string } = {},
): StockBalance {
  const where: string[] = ['item_type = ? AND item_id = ?'];
  const params: Array<string | number> = [itemType, itemId];
  if (opts.fromDate) {
    where.push('date >= ?');
    params.push(opts.fromDate);
  }
  if (opts.toDate) {
    where.push('date <= ?');
    params.push(opts.toDate);
  }
  const rows = db.query<{ quantity: number; movementType: MovementType }>(
    `SELECT quantity, movement_type AS movementType FROM stock_movements WHERE ${where.join(' AND ')}`,
    params,
  );

  const bal: StockBalance = {
    itemType,
    itemId,
    name: '',
    unit: 'PIECES',
    opening: 0,
    received: 0,
    consumed: 0,
    produced: 0,
    dispatched: 0,
    adjustedIn: 0,
    adjustedOut: 0,
    closing: 0,
  };

  let sum = 0;
  for (const r of rows) {
    const q = r.quantity;
    sum += q;
    switch (r.movementType) {
      case 'PURCHASE_IN':
      case 'PRODUCTION_FINISHED_IN':
        if (itemType === RAW) bal.received += q;
        else bal.produced += q;
        break;
      case 'PRODUCTION_RAW_MATERIAL_OUT':
        bal.consumed += -q;
        break;
      case 'DISPATCH_OUT':
        bal.dispatched += -q;
        break;
      case 'ADJUSTMENT_IN':
        bal.adjustedIn += q;
        break;
      case 'ADJUSTMENT_OUT':
        bal.adjustedOut += -q;
        break;
    }
  }
  bal.closing = round2(sum);
  return bal;
}

/**
 * Compute opening + in/out and closing for a set of items in a date range,
 * used by the stock report.
 */
export function getStockBalances(
  db: AppDatabase,
  itemType: ItemType,
  resolver: ItemNameResolver,
  unitResolver: (itemType: ItemType, itemId: number) => Unit,
  opts: { fromDate?: string; toDate?: string } = {},
): StockBalance[] {
  const itemIds = listItemBalances(db, itemType).map((i) => i.itemId);
  const balances: StockBalance[] = [];
  for (const itemId of itemIds) {
    const b = getItemStockBalance(db, itemType, itemId, opts);
    b.name = resolver(itemType, itemId) ?? `Item #${itemId}`;
    b.unit = unitResolver(itemType, itemId);
    // opening = closing of everything before fromDate, if range provided
    if (opts.fromDate) {
      const prior = getItemStockBalance(db, itemType, itemId, { toDate: prevDay(opts.fromDate) });
      b.opening = round2(prior.closing);
    }
    b.closing = round2(b.closing);
    balances.push(b);
  }
  return balances;
}

function prevDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export { RAW, FINISHED };