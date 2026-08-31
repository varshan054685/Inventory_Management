import { z } from 'zod';
import {
  UNITS,
  ATTENDANCE_STATUSES,
  RAW,
  FINISHED,
} from '../../src/shared/constants';

/**
 * Central schema registry: every IPC command maps 1:1 to a Zod schema used to
 * validate renderer-supplied arguments BEFORE any business logic runs.
 *
 * The renderer is treated as fully untrusted. If a payload does not match its
 * schema the request is rejected outright (no partial writes).
 */

export const unitSchema = z.enum(UNITS);
export const statusSchema = z.enum(['active', 'inactive']);
export const itemTypeSchema = z.enum([RAW, FINISHED]);
export const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);
export const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Invalid month format');
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format');

export const idSchema = z.number().int().positive();
export const intSchema = z.number().int();

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
const usernameSchema = z.string().trim().min(1).max(100);
const passwordSchema = z.string().min(4).max(200);

export const authSchema = {
  'auth.hasUsers': z.object({}).optional(),
  'auth.setup': z.object({ username: usernameSchema, password: passwordSchema }),
  'auth.login': z.object({ username: usernameSchema, password: passwordSchema }),
  'auth.listUsers': z.object({}).optional(),
  'auth.changePassword': z.object({
    userId: idSchema,
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
  }),
  'auth.logout': z.object({}).optional(),
  'auth.lock': z.object({}).optional(),
  'auth.unlock': z.object({ username: usernameSchema, password: passwordSchema }),
};

// ---------------------------------------------------------------------------
// Settings / system
// ---------------------------------------------------------------------------
export const settingsSchema = z.record(z.string(), z.unknown());

export const systemSchema = {
  'system.info': z.object({}).optional(),
};

// ---------------------------------------------------------------------------
// Masters
// ---------------------------------------------------------------------------
export const productInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit: unitSchema,
  sellingPrice: z.number().nullable().optional(),
  minStock: z.number().optional(),
  status: statusSchema.optional(),
});

export const rawMaterialInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().nullable().optional(),
  unit: unitSchema,
  minStock: z.number().optional(),
  status: statusSchema.optional(),
});

export const supplierInput = z.object({
  name: z.string().trim().min(1).max(200),
  contactPerson: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  gstNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: statusSchema.optional(),
});

export const employeeInput = z.object({
  name: z.string().trim().min(1).max(200),
  contactNumber: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  joiningDate: z.string().nullable().optional(),
  dailyWage: z.number().min(0),
  halfDayWage: z.number().min(0),
  overtimeRate: z.number().min(0),
  status: statusSchema.optional(),
});

export const mastersSchema = {
  'products.list': z.object({}).optional(),
  'products.get': z.object({ id: idSchema }),
  'products.create': productInput,
  'products.update': z.object({ id: idSchema, input: productInput }),
  'products.status': z.object({ id: idSchema, status: statusSchema }),
  'products.delete': z.object({ id: idSchema }),

  'materials.list': z.object({}).optional(),
  'materials.get': z.object({ id: idSchema }),
  'materials.create': rawMaterialInput,
  'materials.update': z.object({ id: idSchema, input: rawMaterialInput }),
  'materials.status': z.object({ id: idSchema, status: statusSchema }),
  'materials.delete': z.object({ id: idSchema }),

  'suppliers.list': z.object({}).optional(),
  'suppliers.get': z.object({ id: idSchema }),
  'suppliers.create': supplierInput,
  'suppliers.update': z.object({ id: idSchema, input: supplierInput }),
  'suppliers.status': z.object({ id: idSchema, status: statusSchema }),
  'suppliers.delete': z.object({ id: idSchema }),

  'employees.list': z.object({}).optional(),
  'employees.get': z.object({ id: idSchema }),
  'employees.create': employeeInput,
  'employees.update': z.object({ id: idSchema, input: employeeInput }),
  'employees.status': z.object({ id: idSchema, status: statusSchema }),
  'employees.delete': z.object({ id: idSchema }),
};

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------
const purchaseItemInput = z.object({
  rawMaterialId: idSchema,
  unit: unitSchema,
  quantity: z.number(),
  unitPrice: z.number(),
});

const purchaseInput = z.object({
  purchaseDate: dateSchema.optional(),
  supplierId: idSchema.nullable().optional(),
  invoiceNo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(purchaseItemInput).min(1),
});

export const purchaseSchema = {
  'purchases.list': z.object({
    search: z.string().optional(),
    fromDate: dateSchema.optional(),
    toDate: dateSchema.optional(),
    limit: intSchema.optional(),
    offset: intSchema.optional(),
  }),
  'purchases.get': z.object({ id: idSchema }),
  'purchases.create': purchaseInput,
  'purchases.update': z.object({ id: idSchema, input: purchaseInput }),
  'purchases.delete': z.object({ id: idSchema }),
  'purchases.nextNo': z.object({}).optional(),
};

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------
const recipeItemInput = z.object({
  rawMaterialId: idSchema,
  quantity: z.number(),
  unit: unitSchema,
});

const recipeInput = z.object({
  productId: idSchema,
  name: z.string().trim().min(1).max(200),
  outputQuantity: z.number().positive(),
  outputUnit: unitSchema,
  items: z.array(recipeItemInput),
  status: statusSchema.optional(),
});

export const recipeSchema = {
  'recipes.list': z.object({}).optional(),
  'recipes.get': z.object({ id: idSchema }),
  'recipes.activeForProduct': z.object({ productId: idSchema }),
  'recipes.create': recipeInput,
  'recipes.update': z.object({ id: idSchema, input: recipeInput }),
  'recipes.status': z.object({ id: idSchema, status: statusSchema }),
  'recipes.delete': z.object({ id: idSchema }),
};

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------
export const productionSchema = {
  'production.list': z.object({
    search: z.string().optional(),
    fromDate: dateSchema.optional(),
    toDate: dateSchema.optional(),
    limit: intSchema.optional(),
    offset: intSchema.optional(),
  }),
  'production.get': z.object({ id: idSchema }),
  'production.preview': z.object({
    productionDate: dateSchema.optional(),
    productId: idSchema,
    units: z.number().positive(),
    costPerUnit: z.number().min(0),
    notes: z.string().nullable().optional(),
  }),
  'production.create': z.object({
    productionDate: dateSchema.optional(),
    productId: idSchema,
    units: z.number().positive(),
    costPerUnit: z.number().min(0),
    notes: z.string().nullable().optional(),
  }),
  'production.cancel': z.object({ id: idSchema }),
  'production.nextNo': z.object({}).optional(),
};

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
export const dispatchSchema = {
  'dispatch.list': z.object({
    search: z.string().optional(),
    fromDate: dateSchema.optional(),
    toDate: dateSchema.optional(),
    limit: intSchema.optional(),
    offset: intSchema.optional(),
  }),
  'dispatch.get': z.object({ id: idSchema }),
  'dispatch.availability': z.object({ productId: idSchema }),
  'dispatch.create': z.object({
    dispatchDate: dateSchema.optional(),
    productId: idSchema,
    quantity: z.number().positive(),
    vehicleNumber: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    receiver: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    unitPrice: z.number().nullable().optional(),
  }),
  'dispatch.update': z.object({
    id: idSchema,
    input: z.object({
      dispatchDate: dateSchema.optional(),
      productId: idSchema,
      quantity: z.number().positive(),
      vehicleNumber: z.string().nullable().optional(),
      location: z.string().nullable().optional(),
      receiver: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      unitPrice: z.number().nullable().optional(),
    }),
  }),
  'dispatch.delete': z.object({ id: idSchema }),
  'dispatch.nextNo': z.object({}).optional(),
};

// ---------------------------------------------------------------------------
// Adjustments / Stock
// ---------------------------------------------------------------------------
export const adjustmentSchema = {
  'adjustments.create': z.object({
    date: dateSchema.optional(),
    itemType: itemTypeSchema,
    itemId: idSchema,
    quantity: z.number(),
    reason: z.string().trim().min(1).max(500),
  }),
};

export const stockSchema = {
  'stock.itemBalance': z.object({ itemType: itemTypeSchema, itemId: idSchema }),
  'stock.itemLedger': z.object({
    itemType: itemTypeSchema,
    itemId: idSchema,
    fromDate: dateSchema.optional(),
    toDate: dateSchema.optional(),
  }),
};

// ---------------------------------------------------------------------------
// Attendance / Overtime / Wages
// ---------------------------------------------------------------------------
export const attendanceSchema = {
  'attendance.set': z.object({ employeeId: idSchema, date: dateSchema, status: attendanceStatusSchema }),
  'attendance.month': z.object({ employeeId: idSchema, month: monthSchema }),
  'attendance.summary': z.object({ employeeId: idSchema, month: monthSchema }),
  'attendance.monthAll': z.object({ month: monthSchema }),
};

export const overtimeInput = z.object({
  employeeId: idSchema,
  date: dateSchema,
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  hours: z.number().min(0),
  rate: z.number().min(0).nullable().optional(),
  amount: z.number().min(0).optional(),
  reason: z.string().nullable().optional(),
});

export const overtimeSchema = {
  'overtime.list': z.object({
    search: z.string().optional(),
    fromDate: dateSchema.optional(),
    toDate: dateSchema.optional(),
    limit: intSchema.optional(),
    offset: intSchema.optional(),
  }),
  'overtime.create': overtimeInput,
  'overtime.update': z.object({ id: idSchema, input: overtimeInput }),
  'overtime.delete': z.object({ id: idSchema }),
  'overtime.summary': z.object({ month: monthSchema }),
};

export const wageSchema = {
  'wages.preview': z.object({ month: monthSchema }),
  'wages.calcOne': z.object({ employeeId: idSchema, month: monthSchema }),
  'wages.calcAll': z.object({ month: monthSchema }),
  'wages.adjust': z.object({
    employeeId: idSchema,
    month: monthSchema,
    additions: z.number().min(0),
    deductions: z.number().min(0),
  }),
  'wages.lock': z.object({ employeeId: idSchema, month: monthSchema }),
  'wages.unlock': z.object({ employeeId: idSchema, month: monthSchema }),
  'wages.list': z.object({
    month: monthSchema.optional(),
    search: z.string().optional(),
    limit: intSchema.optional(),
    offset: intSchema.optional(),
  }),
  'wages.get': z.object({ employeeId: idSchema, month: monthSchema }),
  'wages.monthTotals': z.object({ month: monthSchema }),
};

// ---------------------------------------------------------------------------
// Unit conversions / Settings
// ---------------------------------------------------------------------------
export const unitConversionSchema = {
  'unitConversions.list': z.object({}).optional(),
  'unitConversions.upsert': z.object({
    fromUnit: unitSchema,
    toUnit: unitSchema,
    factor: z.number().positive(),
  }),
  'unitConversions.delete': z.object({ fromUnit: unitSchema, toUnit: unitSchema }),
  'settings.get': z.object({}).optional(),
  'settings.save': settingsSchema,
};

// ---------------------------------------------------------------------------
// Backup / Seed / Audit
// ---------------------------------------------------------------------------
export const backupSchema = {
  'backup.create': z.object({
    kind: z.enum(['manual', 'auto']).optional(),
    password: z.string().max(200).optional().nullable(),
  }),
  'backup.list': z.object({}).optional(),
  'backup.restore': z.object({
    backupPath: z.string().min(1).max(1024),
    password: z.string().max(200).optional().nullable(),
  }),
  'backup.prune': z.object({ keep: z.number().int().min(0).max(10000) }),
};

export const systemExtraSchema = {
  'seed.demo': z.object({}).optional(),
  'seed.clear': z.object({}).optional(),
  'audit.list': z.object({ limit: z.number().int().min(1).max(5000).optional() }),
  'dashboard.stats': z.object({}).optional(),
  'dashboard.series': z.object({ fromDate: dateSchema, toDate: dateSchema }),
};

// Combine every command schema into one lookup.
export const VALIDATORS: Record<string, z.ZodTypeAny> = {
  ...authSchema,
  ...mastersSchema,
  ...purchaseSchema,
  ...recipeSchema,
  ...productionSchema,
  ...dispatchSchema,
  ...adjustmentSchema,
  ...stockSchema,
  ...attendanceSchema,
  ...overtimeSchema,
  ...wageSchema,
  ...unitConversionSchema,
  ...backupSchema,
  ...systemExtraSchema,
  ...systemSchema,
};

/** Validate a command's params against its schema. Returns cleaned params. */
export function validateParams(command: string, params: unknown): unknown {
  const schema = VALIDATORS[command];
  if (!schema) {
    // Commands without an explicit schema must be explicitly allowlisted as
    // free-form or are unknown; unknown commands are handled elsewhere.
    return params;
  }
  const parsed = schema.parse(params);
  return parsed;
}