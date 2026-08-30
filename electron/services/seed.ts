import type { AppDatabase } from '../db/connection';
import { createProduct, createRawMaterial, createSupplier, createEmployee } from './masters';
import { createRecipe } from './recipes';
import { createPurchase } from './purchases';
import { createProduction } from './production';
import { createDispatch } from './dispatch';
import { setAttendance } from './attendance';
import { createOvertime } from './overtime';
import { calculateAllWagesForMonth } from './wages';
import { todayIso } from './util';
import { audit } from './audit';

/** Insert demo data for development/evaluation. Only runs when user requests it. */
export function seedDemoData(db: AppDatabase): void {
  const hasProducts = (db.value<number>('SELECT COUNT(*) FROM products') ?? 0) > 0;
  if (hasProducts) throw new Error('Data already exists. Clear data first if you want to reseed.');

  {
    const mango = createProduct(db, { name: 'Mango Candy', category: 'Candy', unit: 'PIECES', sellingPrice: 1, minStock: 5000, description: 'Mango flavour hard candy' });
    const orange = createProduct(db, { name: 'Orange Candy', category: 'Candy', unit: 'PIECES', sellingPrice: 1, minStock: 4000, description: 'Orange flavour hard candy' });
    const milk = createProduct(db, { name: 'Milk Candy', category: 'Toffee', unit: 'PIECES', sellingPrice: 1.5, minStock: 3000, description: 'Milk toffee' });

    const sugar = createRawMaterial(db, { name: 'Sugar', unit: 'KG', minStock: 100, description: 'Granulated sugar' });
    const glucose = createRawMaterial(db, { name: 'Glucose', unit: 'KG', minStock: 50, description: 'Glucose syrup' });
    const milkPowder = createRawMaterial(db, { name: 'Milk Powder', unit: 'KG', minStock: 30, description: 'Skimmed milk powder' });
    const flavor = createRawMaterial(db, { name: 'Flavor', unit: 'LITRES', minStock: 2, description: 'Candy flavours' });
    const colour = createRawMaterial(db, { name: 'Food Colour', unit: 'KG', minStock: 1, description: 'Edible colour' });
    const wrapper = createRawMaterial(db, { name: 'Wrapping Material', unit: 'PIECES', minStock: 5000, description: 'Candy wrappers' });

    const sup1 = createSupplier(db, { name: 'Shree Sugar Traders', phone: '9876543210', contactPerson: 'Rajesh' });
    const sup2 = createSupplier(db, { name: 'Flavour House', phone: '9123456780', contactPerson: 'Suresh' });

    createEmployee(db, { name: 'Ramesh', dailyWage: 600, halfDayWage: 300, overtimeRate: 100, joiningDate: todayIso(), contactNumber: '9000000001' });
    createEmployee(db, { name: 'Suresh', dailyWage: 500, halfDayWage: 250, overtimeRate: 80, joiningDate: todayIso(), contactNumber: '9000000002' });
    createEmployee(db, { name: 'Mahesh', dailyWage: 700, halfDayWage: 350, overtimeRate: 120, joiningDate: todayIso() });

    // Recipes: output 1000 PIECES each for clarity.
    createRecipe(db, { productId: mango.id, name: 'Mango Candy BOM', outputQuantity: 1000, outputUnit: 'PIECES', items: [
      { rawMaterialId: sugar.id, quantity: 10, unit: 'KG' },
      { rawMaterialId: glucose.id, quantity: 5, unit: 'KG' },
      { rawMaterialId: flavor.id, quantity: 1, unit: 'LITRES' },
      { rawMaterialId: colour.id, quantity: 0.2, unit: 'KG' },
      { rawMaterialId: wrapper.id, quantity: 1000, unit: 'PIECES' },
    ] });
    createRecipe(db, { productId: orange.id, name: 'Orange Candy BOM', outputQuantity: 1000, outputUnit: 'PIECES', items: [
      { rawMaterialId: sugar.id, quantity: 9, unit: 'KG' },
      { rawMaterialId: glucose.id, quantity: 4, unit: 'KG' },
      { rawMaterialId: flavor.id, quantity: 0.8, unit: 'LITRES' },
      { rawMaterialId: wrapper.id, quantity: 1000, unit: 'PIECES' },
    ] });
    createRecipe(db, { productId: milk.id, name: 'Milk Candy BOM', outputQuantity: 1000, outputUnit: 'PIECES', items: [
      { rawMaterialId: sugar.id, quantity: 8, unit: 'KG' },
      { rawMaterialId: milkPowder.id, quantity: 4, unit: 'KG' },
      { rawMaterialId: glucose.id, quantity: 3, unit: 'KG' },
      { rawMaterialId: wrapper.id, quantity: 1000, unit: 'PIECES' },
    ] });

    // Opening purchases so production can run.
    createPurchase(db, { purchaseDate: todayIso(), supplierId: sup1.id, invoiceNo: 'INV-1', items: [
      { rawMaterialId: sugar.id, quantity: 200, unitPrice: 45, unit: 'KG' },
      { rawMaterialId: glucose.id, quantity: 100, unitPrice: 60, unit: 'KG' },
      { rawMaterialId: milkPowder.id, quantity: 100, unitPrice: 320, unit: 'KG' },
    ] });
    createPurchase(db, { purchaseDate: todayIso(), supplierId: sup2.id, invoiceNo: 'INV-2', items: [
      { rawMaterialId: flavor.id, quantity: 20, unitPrice: 250, unit: 'LITRES' },
      { rawMaterialId: colour.id, quantity: 5, unitPrice: 800, unit: 'KG' },
      { rawMaterialId: wrapper.id, quantity: 20000, unitPrice: 0.2, unit: 'PIECES' },
    ] });

    // Two production runs.
    createProduction(db, { productionDate: todayIso(), productId: mango.id, units: 5000, costPerUnit: 1.2, notes: 'Batch 1' });
    createProduction(db, { productionDate: todayIso(), productId: orange.id, units: 4000, costPerUnit: 1.1, notes: 'Batch 1' });

    // One dispatch.
    createDispatch(db, { dispatchDate: todayIso(), productId: mango.id, quantity: 2000, vehicleNumber: 'KA 01 AB 1234', location: 'Bengaluru', unitPrice: 1.4 });

    // A bit of demo attendance (first of month-ish dates applied to current month).
    const month = todayIso().slice(0, 7);
    const empRows = db.query<{ id: number; name: string }>('SELECT id, name FROM employees ORDER BY id');
    for (let d = 1; d <= 5; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      empRows.forEach((e, i) => {
        setAttendance(db, e.id, date, i === 2 && d === 3 ? 'HD' : d === 4 ? 'A' : d === 5 ? 'WO' : 'P');
      });
    }
    const emp1 = empRows[0];
    if (emp1) {
      createOvertime(db, { employeeId: emp1.id, date: `${month}-06`, startTime: '18:00', endTime: '20:00', hours: 2, reason: 'Festival order rush' });
    }

    calculateAllWagesForMonth(db, month);
  }

  audit(db, 'SEED_DATA', undefined, undefined, 'Seeded demo data');
}

export function clearAllData(db: AppDatabase): void {
  db.transaction(() => {
    const tables = [
      'stock_movements', 'dispatches', 'wages', 'overtime', 'attendance', 'productions',
      'recipe_items', 'recipes', 'purchase_items', 'purchases', 'products', 'raw_materials',
      'suppliers', 'employees', 'unit_conversions', 'backup_history', 'audit_logs',
    ];
    for (const t of tables) db.run(`DELETE FROM ${t}`);
    db.run("DELETE FROM sqlite_sequence WHERE name IN ('" + tables.join("','") + "')");
  });
  audit(db, 'CLEAR_DATA', undefined, undefined, 'Cleared all business data');
}