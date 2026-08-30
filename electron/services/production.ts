import type { AppDatabase } from '../db/connection';
import {
  PRODUCTION_RAW_MATERIAL_OUT,
  PRODUCTION_FINISHED_IN,
  FINISHED,
  RAW,
} from '../../src/shared/constants';
import { round2, todayIso, padNo } from './util';
import { audit } from './audit';
import { addStockMovement, getItemBalance } from './stock';
import { getActiveRecipeForProduct } from './recipes';
import { getProduct, getRawMaterial } from './masters';
import { getAllowNegativeStock } from './settings';
import type { Production, Unit } from '../../src/shared/types';

export interface ProductionInput {
  productionDate?: string;
  productId: number;
  units: number;
  costPerUnit: number;
  notes?: string | null;
}

export interface RequiredMaterial {
  rawMaterialId: number;
  name: string;
  unit: Unit;
  required: number;
  available: number;
}

export function calculateRequiredMaterials(
  db: AppDatabase,
  productId: number,
  units: number,
): { recipeName: string; materials: RequiredMaterial[] } {
  const recipe = getActiveRecipeForProduct(db, productId);
  if (!recipe || !recipe.items || recipe.items.length === 0) {
    throw new Error('No active recipe found for this product. Add a recipe first.');
  }
  const scale = units / recipe.outputQuantity;
  const materials: RequiredMaterial[] = recipe.items.map((item) => {
    const required = item.quantity * scale;
    const mat = getRawMaterial(db, item.rawMaterialId);
    return {
      rawMaterialId: item.rawMaterialId,
      name: mat?.name ?? `Material #${item.rawMaterialId}`,
      unit: item.unit,
      required: round2(required),
      available: round2(getItemBalance(db, RAW, item.rawMaterialId)),
    };
  });
  return { recipeName: recipe.name, materials };
}

function nextProductionNo(db: AppDatabase): string {
  const seq = (db.value<number>('SELECT COUNT(*) c FROM productions') ?? 0) + 1;
  return `PRD-${padNo(seq)}`;
}

export function nextSuggestedProductionNo(db: AppDatabase): string {
  return nextProductionNo(db);
}

/** Simulate production to surface cost & insufficiency WITHOUT committing. */
export function previewProduction(db: AppDatabase, input: ProductionInput): {
  materials: RequiredMaterial[];
  insufficient: boolean;
  totalCost: number;
  scaledMaterials: RequiredMaterial[];
} {
  const product = getProduct(db, input.productId);
  if (!product) throw new Error('Select a valid product');
  if (!(input.units > 0)) throw new Error('Number of units must be > 0');

  const { materials } = calculateRequiredMaterials(db, input.productId, input.units);
  const insufficient = materials.some((m) => m.required > m.available);
  return {
    materials,
    insufficient,
    totalCost: round2(input.units * (input.costPerUnit || 0)),
    scaledMaterials: materials,
  };
}

/** Commit production: deduct raw materials, add finished goods, in one transaction. */
export function createProduction(db: AppDatabase, input: ProductionInput): Production {
  const product = getProduct(db, input.productId);
  if (!product) throw new Error('Select a valid product');
  if (!(input.units > 0)) throw new Error('Number of units must be > 0');

  const productionDate = input.productionDate ?? todayIso();
  const allowNegative = getAllowNegativeStock(db);
  const costPerUnit = Number(input.costPerUnit || 0);
  if (costPerUnit < 0) throw new Error('Production cost per unit cannot be negative');

  const { materials } = calculateRequiredMaterials(db, input.productId, input.units);
  if (!allowNegative) {
    const shortages = materials.filter((m) => m.required > m.available);
    if (shortages.length > 0) {
      const list = shortages
        .map((s) => `${s.name}: required ${s.required} ${s.unit}, available ${s.available}`)
        .join('; ');
      throw new Error(`Insufficient raw material stock. ${list}`);
    }
  }

  const totalCost = round2(input.units * costPerUnit);

  return db.transaction(() => {
    // 1. Insert production header.
    db.run(
      `INSERT INTO productions (production_no, production_date, product_id, units, cost_per_unit, total_cost, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nextProductionNo(db),
        productionDate,
        input.productId,
        Number(input.units),
        costPerUnit,
        totalCost,
        input.notes ?? null,
      ],
    );
    const productionId = db.getLastInsertId();

    // 2. Deduct raw materials (create RAW OUT movements).
    for (const m of materials) {
      addStockMovement(db, {
        date: productionDate,
        itemType: RAW,
        itemId: m.rawMaterialId,
        quantity: -m.required,
        unit: m.unit,
        movementType: PRODUCTION_RAW_MATERIAL_OUT,
        referenceId: productionId,
        notes: `Production ${productionId}`,
      });
    }

    // 3. Add finished goods.
    addStockMovement(db, {
      date: productionDate,
      itemType: FINISHED,
      itemId: input.productId,
      quantity: Number(input.units),
      unit: product.unit,
      movementType: PRODUCTION_FINISHED_IN,
      referenceId: productionId,
      notes: `Production ${productionId}`,
    });

    audit(db, 'PRODUCTION_CREATE', 'productions', productionId, `Production #${productionId} for ${product.name}`);
    return getProduction(db, productionId)!;
  });
}

/**
 * Cancel a production: remove finished-in movement & raw-out movements,
 * effectively reversing all stock effects. Used rather than hard-deleting rows.
 */
export function cancelProduction(db: AppDatabase, id: number): void {
  const existing = getProduction(db, id);
  if (!existing) throw new Error('Production not found');
  db.transaction(() => {
    db.run(
      `DELETE FROM stock_movements WHERE reference_id = ? AND movement_type IN (?, ?)`,
      [id, PRODUCTION_RAW_MATERIAL_OUT, PRODUCTION_FINISHED_IN],
    );
    db.run('DELETE FROM productions WHERE id = ?', [id]);
  });
  audit(db, 'PRODUCTION_CANCEL', 'productions', id, `Production #${id} cancelled`);
}

export function getProduction(db: AppDatabase, id: number): Production | undefined {
  return db.get<Production>(
    `SELECT p.*, pr.name AS productName, pr.unit AS productUnit FROM productions p
     JOIN products pr ON pr.id=p.product_id WHERE p.id=?`,
    [id],
  );
}

export function listProductions(
  db: AppDatabase,
  opts: { search?: string; fromDate?: string; toDate?: string; limit?: number; offset?: number } = {},
): { rows: Production[]; total: number } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (opts.fromDate) {
    clauses.push('p.production_date >= ?');
    params.push(opts.fromDate);
  }
  if (opts.toDate) {
    clauses.push('p.production_date <= ?');
    params.push(opts.toDate);
  }
  if (opts.search) {
    clauses.push('(p.production_no LIKE ? OR pr.name LIKE ?)');
    const like = `%${opts.search}%`;
    params.push(like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total =
    db.value<number>(
      `SELECT COUNT(*) c FROM productions p JOIN products pr ON pr.id=p.product_id ${where}`,
      params,
    ) ?? 0;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  params.push(limit, offset);
  const rows = db.query<Production>(
    `SELECT p.*, pr.name AS productName, pr.unit AS productUnit FROM productions p
     JOIN products pr ON pr.id=p.product_id ${where}
     ORDER BY p.production_date DESC, p.id DESC LIMIT ? OFFSET ?`,
    params,
  );
  return { rows, total };
}