import { describe, it, expect } from 'vitest';
import { withDb } from './helpers';
import { createProduct, createRawMaterial } from '../electron/services/masters';
import { createPurchase } from '../electron/services/purchases';
import { createRecipe } from '../electron/services/recipes';
import { createProduction } from '../electron/services/production';
import { createDispatch, getDispatchAvailability, updateDispatch, deleteDispatch } from '../electron/services/dispatch';
import { getItemBalance } from '../electron/services/stock';
import { FINISHED } from '../src/shared/constants';
import { saveSettings } from '../electron/services/settings';

function makeStock(db: any, qty = 5000) {
  const mango = createProduct(db, { name: 'Mango', unit: 'PIECES', sellingPrice: 1 });
  const sugar = createRawMaterial(db, { name: 'Sugar', unit: 'KG' });
  const wrapper = createRawMaterial(db, { name: 'Wrapper', unit: 'PIECES' });
  createRecipe(db, {
    productId: mango.id, name: 'BOM', outputQuantity: 1000, outputUnit: 'PIECES',
    items: [{ rawMaterialId: sugar.id, quantity: 1, unit: 'KG' }, { rawMaterialId: wrapper.id, quantity: 1000, unit: 'PIECES' }],
  });
  createPurchase(db, { items: [{ rawMaterialId: sugar.id, quantity: 100, unitPrice: 10, unit: 'KG' }] });
  createPurchase(db, { items: [{ rawMaterialId: wrapper.id, quantity: 10000, unitPrice: 0.1, unit: 'PIECES' }] });
  createProduction(db, { productId: mango.id, units: qty, costPerUnit: 1 });
  return mango;
}

describe('Dispatch flow', () => {
  it('deducts finished stock on dispatch', async () => {
    await withDb((db) => {
      const mango = makeStock(db, 5000);
      createDispatch(db, { productId: mango.id, quantity: 2000, vehicleNumber: 'KA-01' });
      expect(getItemBalance(db, FINISHED, mango.id)).toBe(3000);
    });
  });

  it('blocks dispatch when finished stock is insufficient', async () => {
    await withDb((db) => {
      const mango = makeStock(db, 5000);
      const avail = getDispatchAvailability(db, mango.id).available;
      expect(avail).toBe(5000);
      expect(() => createDispatch(db, { productId: mango.id, quantity: 6000 })).toThrow(/Insufficient stock/);
      expect(getItemBalance(db, FINISHED, mango.id)).toBe(5000);
    });
  });

  it('allows dispatch beyond stock when negative allowed', async () => {
    await withDb((db) => {
      const mango = makeStock(db, 500);
      saveSettings(db, { allowNegativeStock: true });
      createDispatch(db, { productId: mango.id, quantity: 1000 });
      expect(getItemBalance(db, FINISHED, mango.id)).toBe(-500);
    });
  });

  it('reverses and reapplies on update and delete', async () => {
    await withDb((db) => {
      const mango = makeStock(db, 5000);
      const d = createDispatch(db, { productId: mango.id, quantity: 2000 });
      expect(getItemBalance(db, FINISHED, mango.id)).toBe(3000);
      updateDispatch(db, d.id, { productId: mango.id, quantity: 1000 });
      expect(getItemBalance(db, FINISHED, mango.id)).toBe(4000);
      deleteDispatch(db, d.id);
      expect(getItemBalance(db, FINISHED, mango.id)).toBe(5000);
    });
  });
});