import type { AppDatabase } from '../db/connection';
import { ADJUSTMENT_IN, ADJUSTMENT_OUT, RAW, FINISHED } from '../../src/shared/constants';
import { round2, todayIso } from './util';
import { audit } from './audit';
import { addStockMovement } from './stock';
import { getAllowNegativeStock } from './settings';
import { getProduct, getRawMaterial } from './masters';
import type { ItemType, Unit } from '../../src/shared/types';

export interface AdjustmentInput {
  date?: string;
  itemType: ItemType;
  itemId: number;
  quantity: number; // positive -> adjustment in, negative -> adjustment out
  unit: Unit;
  notes?: string | null;
}

/**
 * Record a stock adjustment (count correction). Always creates a movement,
 * honouring negative-stock setting.
 */
export function createAdjustment(db: AppDatabase, input: AdjustmentInput): number {
  if (!input.itemId) throw new Error('Select an item to adjust');
  if (!input.quantity || input.quantity === 0) throw new Error('Adjustment quantity cannot be zero');

  const itemType = input.itemType;
  const entity = itemType === RAW ? getRawMaterial(db, input.itemId) : getProduct(db, input.itemId);
  if (!entity) throw new Error('Selected item not found');

  const adjustDate = input.date ?? todayIso();
  const qty = Number(input.quantity);

  // For an adjustment OUT, check availability unless negative stock allowed.
  if (qty < 0) {
    if (!getAllowNegativeStock(db)) {
      const cur = db.value<number>(
        'SELECT COALESCE(SUM(quantity),0) s FROM stock_movements WHERE item_type=? AND item_id=?',
        [itemType, input.itemId],
      );
      if (cur === undefined || -qty > cur) {
        throw new Error(
          `Insufficient stock to adjust out. Available: ${round2(cur ?? 0)} ${input.unit}`,
        );
      }
    }
  }

  const movementType = qty > 0 ? ADJUSTMENT_IN : ADJUSTMENT_OUT;
  const id = addStockMovement(db, {
    date: adjustDate,
    itemType,
    itemId: input.itemId,
    quantity: round2(qty),
    unit: input.unit,
    movementType,
    notes: input.notes ?? null,
  });
  audit(db, 'STOCK_ADJUST', 'stock_movements', id, `${movementType} for ${entity.name} (${qty} ${input.unit})`);
  return id;
}