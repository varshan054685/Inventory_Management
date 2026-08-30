import type { AppDatabase } from '../db/connection';
import { nowIso } from './util';
import { audit } from './audit';
import type {
  Product,
  RawMaterial,
  Supplier,
  Employee,
  Unit,
  Status,
} from '../../src/shared/types';

function assertActiveStatus(status: Status): Status {
  if (status !== 'active' && status !== 'inactive') return 'active';
  return status;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export interface ProductInput {
  name: string;
  description?: string | null;
  category?: string | null;
  unit: Unit;
  sellingPrice?: number | null;
  minStock?: number;
  status?: Status;
}

export function listProducts(db: AppDatabase): Product[] {
  return db.query<Product>('SELECT * FROM products ORDER BY name');
}

export function getProduct(db: AppDatabase, id: number): Product | undefined {
  return db.get<Product>('SELECT * FROM products WHERE id = ?', [id]);
}

export function createProduct(db: AppDatabase, input: ProductInput): Product {
  const name = input.name?.trim();
  if (!name) throw new Error('Product name is required');
  const dup = db.get('SELECT id FROM products WHERE name = ?', [name]);
  if (dup) throw new Error(`Product "${name}" already exists`);
  db.run(
    `INSERT INTO products (name, description, category, unit, selling_price, min_stock, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      input.description || null,
      input.category || null,
      input.unit,
      input.sellingPrice == null ? null : Number(input.sellingPrice),
      Number(input.minStock ?? 0),
      assertActiveStatus(input.status ?? 'active'),
    ],
  );
  const id = db.getLastInsertId();
  audit(db, 'PRODUCT_CREATE', 'products', id, `Created product "${name}"`);
  return getProduct(db, id)!;
}

export function updateProduct(db: AppDatabase, id: number, input: ProductInput): Product {
  const existing = getProduct(db, id);
  if (!existing) throw new Error('Product not found');
  const name = input.name?.trim();
  if (!name) throw new Error('Product name is required');
  const dup = db.get<{ id: number }>('SELECT id FROM products WHERE name = ? AND id <> ?', [
    name,
    id,
  ]);
  if (dup) throw new Error(`Product "${name}" already exists`);
  db.run(
    `UPDATE products SET name=?, description=?, category=?, unit=?, selling_price=?,
       min_stock=?, status=?, updated_at=? WHERE id=?`,
    [
      name,
      input.description ?? null,
      input.category ?? null,
      input.unit,
      input.sellingPrice == null ? null : Number(input.sellingPrice),
      Number(input.minStock ?? 0),
      assertActiveStatus(input.status ?? existing.status),
      nowIso(),
      id,
    ],
  );
  audit(db, 'PRODUCT_UPDATE', 'products', id, `Updated product "${name}"`);
  return getProduct(db, id)!;
}

/**
 * Deactivate a product. Hard-delete is refused if any transaction references it.
 */
export function setProductStatus(db: AppDatabase, id: number, status: Status): Product {
  const existing = getProduct(db, id);
  if (!existing) throw new Error('Product not found');
  db.run('UPDATE products SET status=?, updated_at=? WHERE id=?', [status, nowIso(), id]);
  audit(db, 'PRODUCT_STATUS', 'products', id, `Product status -> ${status}`);
  return getProduct(db, id)!;
}

export function deleteProduct(db: AppDatabase, id: number): void {
  const refUsage = db.get<{ c: number }>(
    `SELECT (SELECT COUNT(*) FROM productions WHERE product_id=?) +
            (SELECT COUNT(*) FROM dispatches WHERE product_id=?) +
            (SELECT COUNT(*) FROM recipes WHERE product_id=?) AS c`,
    [id, id, id],
  )?.c || 0;
  if (refUsage > 0) {
    throw new Error('Cannot delete: this product has historical transactions. Deactivate it instead.');
  }
  db.run('DELETE FROM products WHERE id=?', [id]);
  audit(db, 'PRODUCT_DELETE', 'products', id, `Deleted product #${id}`);
}

// ---------------------------------------------------------------------------
// Raw Materials
// ---------------------------------------------------------------------------
export interface RawMaterialInput {
  name: string;
  description?: string | null;
  unit: Unit;
  minStock?: number;
  status?: Status;
}

export function listRawMaterials(db: AppDatabase): RawMaterial[] {
  return db.query<RawMaterial>('SELECT * FROM raw_materials ORDER BY name');
}

export function getRawMaterial(db: AppDatabase, id: number): RawMaterial | undefined {
  return db.get<RawMaterial>('SELECT * FROM raw_materials WHERE id = ?', [id]);
}

export function createRawMaterial(db: AppDatabase, input: RawMaterialInput): RawMaterial {
  const name = input.name?.trim();
  if (!name) throw new Error('Raw material name is required');
  const dup = db.get('SELECT id FROM raw_materials WHERE name = ?', [name]);
  if (dup) throw new Error(`Raw material "${name}" already exists`);
  db.run(
    `INSERT INTO raw_materials (name, description, unit, min_stock, status)
     VALUES (?, ?, ?, ?, ?)`,
    [name, input.description || null, input.unit, Number(input.minStock ?? 0), assertActiveStatus(input.status ?? 'active')],
  );
  const id = db.getLastInsertId();
  audit(db, 'MATERIAL_CREATE', 'raw_materials', id, `Created raw material "${name}"`);
  return getRawMaterial(db, id)!;
}

export function updateRawMaterial(db: AppDatabase, id: number, input: RawMaterialInput): RawMaterial {
  const existing = getRawMaterial(db, id);
  if (!existing) throw new Error('Raw material not found');
  const name = input.name?.trim();
  if (!name) throw new Error('Raw material name is required');
  const dup = db.get<{ id: number }>('SELECT id FROM raw_materials WHERE name = ? AND id <> ?', [
    name,
    id,
  ]);
  if (dup) throw new Error(`Raw material "${name}" already exists`);
  db.run(
    `UPDATE raw_materials SET name=?, description=?, unit=?, min_stock=?, status=?, updated_at=?
     WHERE id=?`,
    [
      name,
      input.description ?? null,
      input.unit,
      Number(input.minStock ?? 0),
      assertActiveStatus(input.status ?? existing.status),
      nowIso(),
      id,
    ],
  );
  audit(db, 'MATERIAL_UPDATE', 'raw_materials', id, `Updated raw material "${name}"`);
  return getRawMaterial(db, id)!;
}

export function setRawMaterialStatus(db: AppDatabase, id: number, status: Status): RawMaterial {
  const existing = getRawMaterial(db, id);
  if (!existing) throw new Error('Raw material not found');
  db.run('UPDATE raw_materials SET status=?, updated_at=? WHERE id=?', [status, nowIso(), id]);
  audit(db, 'MATERIAL_STATUS', 'raw_materials', id, `Material status -> ${status}`);
  return getRawMaterial(db, id)!;
}

export function deleteRawMaterial(db: AppDatabase, id: number): void {
  const refUsage = db.get<{ c: number }>(
    `SELECT (SELECT COUNT(*) FROM purchase_items WHERE raw_material_id=?) +
            (SELECT COUNT(*) FROM recipe_items WHERE raw_material_id=?) AS c`,
    [id, id],
  )?.c || 0;
  if (refUsage > 0) {
    throw new Error('Cannot delete: this material has historical transactions. Deactivate it instead.');
  }
  db.run('DELETE FROM raw_materials WHERE id=?', [id]);
  audit(db, 'MATERIAL_DELETE', 'raw_materials', id, `Deleted raw material #${id}`);
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------
export interface SupplierInput {
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  notes?: string | null;
  status?: Status;
}

export function listSuppliers(db: AppDatabase): Supplier[] {
  return db.query<Supplier>('SELECT * FROM suppliers ORDER BY name');
}

export function getSupplier(db: AppDatabase, id: number): Supplier | undefined {
  return db.get<Supplier>('SELECT * FROM suppliers WHERE id = ?', [id]);
}

export function createSupplier(db: AppDatabase, input: SupplierInput): Supplier {
  const name = input.name?.trim();
  if (!name) throw new Error('Supplier name is required');
  db.run(
    `INSERT INTO suppliers (name, contact_person, phone, email, address, gst_number, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      input.contactPerson || null,
      input.phone || null,
      input.email || null,
      input.address || null,
      input.gstNumber || null,
      input.notes || null,
      assertActiveStatus(input.status ?? 'active'),
    ],
  );
  const id = db.getLastInsertId();
  audit(db, 'SUPPLIER_CREATE', 'suppliers', id, `Created supplier "${name}"`);
  return getSupplier(db, id)!;
}

export function updateSupplier(db: AppDatabase, id: number, input: SupplierInput): Supplier {
  const existing = getSupplier(db, id);
  if (!existing) throw new Error('Supplier not found');
  const name = input.name?.trim();
  if (!name) throw new Error('Supplier name is required');
  db.run(
    `UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=?,
       gst_number=?, notes=?, status=?, updated_at=? WHERE id=?`,
    [
      name,
      input.contactPerson ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.gstNumber ?? null,
      input.notes ?? null,
      assertActiveStatus(input.status ?? existing.status),
      nowIso(),
      id,
    ],
  );
  audit(db, 'SUPPLIER_UPDATE', 'suppliers', id, `Updated supplier "${name}"`);
  return getSupplier(db, id)!;
}

export function setSupplierStatus(db: AppDatabase, id: number, status: Status): Supplier {
  const existing = getSupplier(db, id);
  if (!existing) throw new Error('Supplier not found');
  db.run('UPDATE suppliers SET status=?, updated_at=? WHERE id=?', [status, nowIso(), id]);
  audit(db, 'SUPPLIER_STATUS', 'suppliers', id, `Supplier status -> ${status}`);
  return getSupplier(db, id)!;
}

export function deleteSupplier(db: AppDatabase, id: number): void {
  const c = db.value<number>('SELECT COUNT(*) FROM purchases WHERE supplier_id = ?', [id]) || 0;
  if (c > 0) {
    throw new Error('Cannot delete: this supplier has purchases. Deactivate it instead.');
  }
  db.run('DELETE FROM suppliers WHERE id=?', [id]);
  audit(db, 'SUPPLIER_DELETE', 'suppliers', id, `Deleted supplier #${id}`);
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------
export interface EmployeeInput {
  name: string;
  contactNumber?: string | null;
  address?: string | null;
  joiningDate?: string | null;
  dailyWage: number;
  halfDayWage: number;
  overtimeRate: number;
  status?: Status;
}

export function listEmployees(db: AppDatabase): Employee[] {
  return db.query<Employee>('SELECT * FROM employees ORDER BY name');
}

export function getEmployee(db: AppDatabase, id: number): Employee | undefined {
  return db.get<Employee>('SELECT * FROM employees WHERE id = ?', [id]);
}

export function createEmployee(db: AppDatabase, input: EmployeeInput): Employee {
  const name = input.name?.trim();
  if (!name) throw new Error('Employee name is required');
  if (Number(input.dailyWage) < 0 || Number(input.halfDayWage) < 0 || Number(input.overtimeRate) < 0) {
    throw new Error('Wage rates cannot be negative');
  }
  db.run(
    `INSERT INTO employees (name, contact_number, address, joining_date, daily_wage, half_day_wage, overtime_rate, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      input.contactNumber || null,
      input.address || null,
      input.joiningDate || null,
      Number(input.dailyWage ?? 0),
      Number(input.halfDayWage ?? 0),
      Number(input.overtimeRate ?? 0),
      assertActiveStatus(input.status ?? 'active'),
    ],
  );
  const id = db.getLastInsertId();
  audit(db, 'EMPLOYEE_CREATE', 'employees', id, `Created employee "${name}"`);
  return getEmployee(db, id)!;
}

export function updateEmployee(db: AppDatabase, id: number, input: EmployeeInput): Employee {
  const existing = getEmployee(db, id);
  if (!existing) throw new Error('Employee not found');
  const name = input.name?.trim();
  if (!name) throw new Error('Employee name is required');
  db.run(
    `UPDATE employees SET name=?, contact_number=?, address=?, joining_date=?,
       daily_wage=?, half_day_wage=?, overtime_rate=?, status=?, updated_at=? WHERE id=?`,
    [
      name,
      input.contactNumber ?? null,
      input.address ?? null,
      input.joiningDate ?? null,
      Number(input.dailyWage ?? 0),
      Number(input.halfDayWage ?? 0),
      Number(input.overtimeRate ?? 0),
      assertActiveStatus(input.status ?? existing.status),
      nowIso(),
      id,
    ],
  );
  audit(db, 'EMPLOYEE_UPDATE', 'employees', id, `Updated employee "${name}"`);
  return getEmployee(db, id)!;
}

export function setEmployeeStatus(db: AppDatabase, id: number, status: Status): Employee {
  const existing = getEmployee(db, id);
  if (!existing) throw new Error('Employee not found');
  db.run('UPDATE employees SET status=?, updated_at=? WHERE id=?', [status, nowIso(), id]);
  audit(db, 'EMPLOYEE_STATUS', 'employees', id, `Employee status -> ${status}`);
  return getEmployee(db, id)!;
}

export function deleteEmployee(db: AppDatabase, id: number): void {
  const c = db.value<number>(
    `SELECT (SELECT COUNT(*) FROM attendance WHERE employee_id=?) +
            (SELECT COUNT(*) FROM overtime WHERE employee_id=?) +
            (SELECT COUNT(*) FROM wages WHERE employee_id=?)`,
    [id, id, id],
  ) || 0;
  if (c > 0) {
    throw new Error('Cannot delete: this employee has payroll history. Deactivate instead.');
  }
  db.run('DELETE FROM employees WHERE id=?', [id]);
  audit(db, 'EMPLOYEE_DELETE', 'employees', id, `Deleted employee #${id}`);
}