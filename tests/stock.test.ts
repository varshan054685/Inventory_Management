import { describe, it, expect } from 'vitest';
import { withDb } from './helpers';
import { createProduct, createRawMaterial } from '../electron/services/masters';
import { createAdjustment } from '../electron/services/adjustments';
import { getItemBalance } from '../electron/services/stock';
import { RAW, FINISHED } from '../src/shared/constants';

describe('Stock calculation', () => {
  it('sums opening + in - out correctly', async () => {
    await withDb((db) => {
      const sugar = createRawMaterial(db, { name: 'Sugar', unit: 'KG' });
      // opening via adjustment in (no purchase dependency)
      createAdjustment(db, { itemType: RAW, itemId: sugar.id, quantity: 20, unit: 'KG', notes: 'Opening' });
      createAdjustment(db, { itemType: RAW, itemId: sugar.id, quantity: 100, unit: 'KG' });
      createAdjustment(db, { itemType: RAW, itemId: sugar.id, quantity: -80, unit: 'KG', notes: 'used' });
      expect(getItemBalance(db, RAW, sugar.id)).toBe(40);
    });
  });

  it('rejects adjustment out beyond available stock', async () => {
    await withDb((db) => {
      const sugar = createRawMaterial(db, { name: 'Sugar', unit: 'KG' });
      createAdjustment(db, { itemType: RAW, itemId: sugar.id, quantity: 5, unit: 'KG' });
      expect(() => createAdjustment(db, { itemType: RAW, itemId: sugar.id, quantity: -10, unit: 'KG' })).toThrow(/Insufficient/);
    });
  });

  it('computes finished stock from movements', async () => {
    await withDb((db) => {
      const mango = createProduct(db, { name: 'Mango', unit: 'PIECES' });
      createAdjustment(db, { itemType: FINISHED, itemId: mango.id, quantity: 5000, unit: 'PIECES', notes: 'produced' });
      createAdjustment(db, { itemType: FINISHED, itemId: mango.id, quantity: -2000, unit: 'PIECES', notes: 'dispatched' });
      expect(getItemBalance(db, FINISHED, mango.id)).toBe(3000);
    });
  });
});