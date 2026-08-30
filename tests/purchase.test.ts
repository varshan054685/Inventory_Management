import { describe, it, expect } from 'vitest';
import { withDb } from './helpers';
import { createRawMaterial, createSupplier } from '../electron/services/masters';
import { createPurchase, getPurchase, updatePurchase, deletePurchase } from '../electron/services/purchases';
import { getItemBalance } from '../electron/services/stock';
import { RAW } from '../src/shared/constants';

describe('Purchase flow', () => {
  it('increases raw material stock on purchase', async () => {
    await withDb((db) => {
      const sugar = createRawMaterial(db, { name: 'Sugar', unit: 'KG' });
      const sup = createSupplier(db, { name: 'Trader' });
      expect(getItemBalance(db, RAW, sugar.id)).toBe(0);

      createPurchase(db, {
        supplierId: sup.id,
        items: [{ rawMaterialId: sugar.id, quantity: 100, unitPrice: 50, unit: 'KG' }],
      });

      expect(getItemBalance(db, RAW, sugar.id)).toBe(100);
    });
  });

  it('computes item and purchase totals correctly', async () => {
    await withDb((db) => {
      const sugar = createRawMaterial(db, { name: 'Sugar', unit: 'KG' });
      const glucose = createRawMaterial(db, { name: 'Glucose', unit: 'KG' });
      const p = createPurchase(db, {
        items: [
          { rawMaterialId: sugar.id, quantity: 100, unitPrice: 50, unit: 'KG' },
          { rawMaterialId: glucose.id, quantity: 20, unitPrice: 60, unit: 'KG' },
        ],
      });
      expect(p.totalAmount).toBe(100 * 50 + 20 * 60);
      expect(p.items?.[0].amount).toBe(5000);
    });
  });

  it('rejects invalid quantities', async () => {
    await withDb((db) => {
      const sugar = createRawMaterial(db, { name: 'Sugar', unit: 'KG' });
      expect(() =>
        createPurchase(db, { items: [{ rawMaterialId: sugar.id, quantity: 0, unitPrice: 10, unit: 'KG' }] }),
      ).toThrow(/quantity/i);
      expect(() =>
        createPurchase(db, { items: [{ rawMaterialId: sugar.id, quantity: -5, unitPrice: 10, unit: 'KG' }] }),
      ).toThrow(/quantity/i);
    });
  });

  it('reverses and reapplies stock when updated', async () => {
    await withDb((db) => {
      const sugar = createRawMaterial(db, { name: 'Sugar', unit: 'KG' });
      const p = createPurchase(db, {
        items: [{ rawMaterialId: sugar.id, quantity: 100, unitPrice: 10, unit: 'KG' }],
      });
      // update to 60
      const upd = getPurchase(db, p.id)!;
      expect(upd).toBeTruthy();
      // Recreate via update
      updatePurchase(db, p.id, {
        items: [{ rawMaterialId: sugar.id, quantity: 60, unitPrice: 10, unit: 'KG' }],
      });
      const p2 = getPurchase(db, p.id)!;
      expect(p2.totalAmount).toBe(600);
      expect(getItemBalance(db, RAW, sugar.id)).toBe(60);
    });
  });

  it('deleting a purchase reverses stock', async () => {
    await withDb((db) => {
      const sugar = createRawMaterial(db, { name: 'Sugar', unit: 'KG' });
      const p = createPurchase(db, {
        items: [{ rawMaterialId: sugar.id, quantity: 50, unitPrice: 10, unit: 'KG' }],
      });
      expect(getItemBalance(db, RAW, sugar.id)).toBe(50);
      deletePurchase(db, p.id);
      expect(getItemBalance(db, RAW, sugar.id)).toBe(0);
    });
  });
});