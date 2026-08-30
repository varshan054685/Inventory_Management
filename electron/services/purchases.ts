import type { AppDatabase } from '../db/connection';
import { PURCHASE_IN, RAW } from '../../src/shared/constants';
import { round2, todayIso, padNo } from './util';
import { audit } from './audit';
import { addStockMovement, deleteStockMovementsForReference } from './stock';
import { getRawMaterial } from './masters';
import type { Purchase, PurchaseItem, Unit } from '../../src/shared/types';

export interface PurchaseItemInput {
  rawMaterialId: number;
  unit: Unit;
  quantity: number;
  unitPrice: number;
}

export interface PurchaseInput {
  purchaseDate?: string;
  supplierId?: number | null;
  invoiceNo?: string | null;
  notes?: string | null;
  items: PurchaseItemInput[];
}

function nextPurchaseNo(db: AppDatabase): string {
  const seq = (db.value<number>('SELECT COUNT(*) c FROM purchases') ?? 0) + 1;
  return `PUR-${padNo(seq)}`;
}

export function nextSuggestedPurchaseNo(db: AppDatabase): string {
  return nextPurchaseNo(db);
}

function validateItem(db: AppDatabase, item: PurchaseItemInput): { unit: Unit; quantity: number; unitPrice: number } {
  if (!item.rawMaterialId) throw new Error('Each purchase item needs a raw material');
  if (item.quantity === undefined || !(item.quantity > 0)) {
    throw new Error(`Invalid quantity (must be > 0) for ${getRawMaterial(db, item.rawMaterialId)?.name ?? 'item'}`);
  }
  if (item.unitPrice === undefined || item.unitPrice < 0) {
    throw new Error('Unit price cannot be negative');
  }
  const material = getRawMaterial(db, item.rawMaterialId);
  if (!material) throw new Error('Raw material not found');
  return { unit: item.unit ?? material.unit, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) };
}

/** Create a purchase with items + stock-in movements atomically. */
export function createPurchase(db: AppDatabase, input: PurchaseInput): Purchase {
  if (!input.items || input.items.length === 0) {
    throw new Error('Add at least one purchase item');
  }
  const purchaseDate = input.purchaseDate ?? todayIso();

  return db.transaction(() => {
    db.run(
      `INSERT INTO purchases (purchase_no, purchase_date, supplier_id, invoice_no, notes, total_amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nextPurchaseNo(db), purchaseDate, input.supplierId ?? null, input.invoiceNo ?? null, input.notes ?? null, 0],
    );
    const purchaseId = db.getLastInsertId();

    let total = 0;
    for (const it of input.items) {
      const v = validateItem(db, it);
      const amount = round2(v.quantity * v.unitPrice);
      total += amount;
      db.run(
        `INSERT INTO purchase_items (purchase_id, raw_material_id, unit, quantity, unit_price, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [purchaseId, it.rawMaterialId, v.unit, v.quantity, v.unitPrice, amount],
      );
      addStockMovement(db, {
        date: purchaseDate,
        itemType: RAW,
        itemId: it.rawMaterialId,
        quantity: v.quantity,
        unit: v.unit,
        movementType: PURCHASE_IN,
        referenceId: purchaseId,
        notes: `Purchase ${purchaseId}`,
      });
    }
    db.run('UPDATE purchases SET total_amount=? WHERE id=?', [round2(total), purchaseId]);
    audit(db, 'PURCHASE_CREATE', 'purchases', purchaseId, `Purchase #${purchaseId} created (${input.items.length} items)`);
    return getPurchase(db, purchaseId)!;
  });
}

/** Update purchase: reverse old stock movements, apply new ones, all atomic. */
export function updatePurchase(db: AppDatabase, id: number, input: PurchaseInput): Purchase {
  const existing = getPurchase(db, id);
  if (!existing) throw new Error('Purchase not found');
  if (!input.items || input.items.length === 0) {
    throw new Error('Add at least one purchase item');
  }
  const purchaseDate = input.purchaseDate ?? existing.purchaseDate;

  return db.transaction(() => {
    // Reverse the old stock-in movements for this purchase.
    deleteStockMovementsForReference(db, id, PURCHASE_IN);
    db.run('DELETE FROM purchase_items WHERE purchase_id = ?', [id]);

    db.run(
      `UPDATE purchases SET purchase_date=?, supplier_id=?, invoice_no=?, notes=?, total_amount=?
       WHERE id=?`,
      [purchaseDate, input.supplierId ?? null, input.invoiceNo ?? null, input.notes ?? null, 0, id],
    );

    let total = 0;
    for (const it of input.items) {
      const v = validateItem(db, it);
      const amount = round2(v.quantity * v.unitPrice);
      total += amount;
      db.run(
        `INSERT INTO purchase_items (purchase_id, raw_material_id, unit, quantity, unit_price, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, it.rawMaterialId, v.unit, v.quantity, v.unitPrice, amount],
      );
      addStockMovement(db, {
        date: purchaseDate,
        itemType: RAW,
        itemId: it.rawMaterialId,
        quantity: v.quantity,
        unit: v.unit,
        movementType: PURCHASE_IN,
        referenceId: id,
        notes: `Purchase ${id}`,
      });
    }
    db.run('UPDATE purchases SET total_amount=? WHERE id=?', [round2(total), id]);
    audit(db, 'PURCHASE_UPDATE', 'purchases', id, `Purchase #${id} updated`);
    return getPurchase(db, id)!;
  });
}

/** Delete purchase. Historical stock effects are reversed. */
export function deletePurchase(db: AppDatabase, id: number): void {
  const existing = getPurchase(db, id);
  if (!existing) throw new Error('Purchase not found');
  db.transaction(() => {
    deleteStockMovementsForReference(db, id, PURCHASE_IN);
    db.run('DELETE FROM purchase_items WHERE purchase_id = ?', [id]);
    db.run('DELETE FROM purchases WHERE id = ?', [id]);
  });
  audit(db, 'PURCHASE_DELETE', 'purchases', id, `Purchase #${id} deleted`);
}

export function getPurchase(db: AppDatabase, id: number): Purchase | undefined {
  const row = db.get<Purchase>(
    `SELECT p.*, s.name AS supplierName FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
    [id],
  );
  if (!row) return undefined;
  row.items = db.query<PurchaseItem>(
    'SELECT pi.*, rm.name AS rawMaterialName FROM purchase_items pi JOIN raw_materials rm ON rm.id=pi.raw_material_id WHERE pi.purchase_id=? ORDER BY pi.id',
    [id],
  );
  return row;
}

export function listPurchases(
  db: AppDatabase,
  opts: { search?: string; fromDate?: string; toDate?: string; limit?: number; offset?: number } = {},
): { rows: Purchase[]; total: number } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (opts.fromDate) {
    clauses.push('p.purchase_date >= ?');
    params.push(opts.fromDate);
  }
  if (opts.toDate) {
    clauses.push('p.purchase_date <= ?');
    params.push(opts.toDate);
  }
  if (opts.search) {
    clauses.push('(p.purchase_no LIKE ? OR p.invoice_no LIKE ? OR COALESCE(s.name,\'\') LIKE ?)');
    const like = `%${opts.search}%`;
    params.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = db.value<number>(`SELECT COUNT(*) c FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id ${where}`, params) ?? 0;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  params.push(limit, offset);
  const rows = db.query<Purchase>(
    `SELECT p.*, s.name AS supplierName FROM purchases p
     LEFT JOIN suppliers s ON s.id=p.supplier_id ${where} ORDER BY p.purchase_date DESC, p.id DESC LIMIT ? OFFSET ?`,
    params,
  );
  return { rows, total };
}