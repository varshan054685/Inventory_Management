import { describe, it, expect } from 'vitest';
import { withDb } from './helpers';
import { createProduct, createRawMaterial } from '../electron/services/masters';
import { createPurchase } from '../electron/services/purchases';
import { createRecipe } from '../electron/services/recipes';
import { createProduction, previewProduction } from '../electron/services/production';
import { saveSettings } from '../electron/services/settings';
import { getItemBalance } from '../electron/services/stock';
import { RAW, FINISHED } from '../src/shared/constants';

function seedSimple(db: any) {
  const mango = createProduct(db, { name: 'Mango', unit: 'PIECES', sellingPrice: 1 });
  const sugar = createRawMaterial(db, { name: 'Sugar', unit: 'KG' });
  const wrapper = createRawMaterial(db, { name: 'Wrapper', unit: 'PIECES' });
  createRecipe(db, {
    productId: mango.id,
    name: 'BOM',
    outputQuantity: 1000,
    outputUnit: 'PIECES',
    items: [
      { rawMaterialId: sugar.id, quantity: 10, unit: 'KG' },
      { rawMaterialId: wrapper.id, quantity: 1000, unit: 'PIECES' },
    ],
  });
  return { mango, sugar, wrapper };
}

describe('Production flow', () => {
  it('deducts raw materials and adds finished stock', async () => {
    await withDb((db) => {
      const { mango, sugar, wrapper } = seedSimple(db);
      createPurchase(db, { items: [{ rawMaterialId: sugar.id, quantity: 100, unitPrice: 10, unit: 'KG' }] });
      createPurchase(db, { items: [{ rawMaterialId: wrapper.id, quantity: 5000, unitPrice: 0.1, unit: 'PIECES' }] });

      createProduction(db, { productId: mango.id, units: 5000, costPerUnit: 2 });

      // 5000 pieces => 50 KG sugar (5 * 10), 5000 wrappers.
      expect(getItemBalance(db, RAW, sugar.id)).toBe(50);
      expect(getItemBalance(db, RAW, wrapper.id)).toBe(0);
      expect(getItemBalance(db, FINISHED, mango.id)).toBe(5000);
    });
  });

  it('blocks production when raw stock is insufficient', async () => {
    await withDb((db) => {
      const { mango, sugar, wrapper } = seedSimple(db);
      createPurchase(db, { items: [{ rawMaterialId: sugar.id, quantity: 5, unitPrice: 10, unit: 'KG' }] });
      createPurchase(db, { items: [{ rawMaterialId: wrapper.id, quantity: 1000, unitPrice: 0.1, unit: 'PIECES' }] });

      // Only enough for 500 pieces (5 KG / 10 KG per 1000).
      const prev = previewProduction(db, { productId: mango.id, units: 5000, costPerUnit: 2 });
      expect(prev.insufficient).toBe(true);

      expect(() => createProduction(db, { productId: mango.id, units: 5000, costPerUnit: 2 })).toThrow(/Insufficient/);
      // nothing changed
      expect(getItemBalance(db, RAW, sugar.id)).toBe(5);
      expect(getItemBalance(db, FINISHED, mango.id)).toBe(0);
    });
  });

  it('computes total production cost', async () => {
    await withDb((db) => {
      const { mango, sugar, wrapper } = seedSimple(db);
      createPurchase(db, { items: [{ rawMaterialId: sugar.id, quantity: 100, unitPrice: 10, unit: 'KG' }] });
      createPurchase(db, { items: [{ rawMaterialId: wrapper.id, quantity: 10000, unitPrice: 0.1, unit: 'PIECES' }] });
      const p = createProduction(db, { productId: mango.id, units: 10000, costPerUnit: 2.5 });
      expect(p.totalCost).toBe(25000);
      expect(getItemBalance(db, FINISHED, mango.id)).toBe(10000);
    });
  });

  it('works with negative stock when enabled', async () => {
    await withDb((db) => {
      const { mango, sugar, wrapper } = seedSimple(db);
      // No purchases -> zero stock. Enable negative stock.
      saveSettings(db, { allowNegativeStock: true });
      createProduction(db, { productId: mango.id, units: 1000, costPerUnit: 1 });
      expect(getItemBalance(db, RAW, sugar.id)).toBe(-10);
      expect(getItemBalance(db, FINISHED, mango.id)).toBe(1000);
    });
  });
});