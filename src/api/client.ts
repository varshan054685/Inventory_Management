import type {
  User,
  Product,
  RawMaterial,
  Supplier,
  Employee,
  Purchase,
  Recipe,
  Production,
  AttendanceStatus,
  Overtime,
  Wage,
  Dispatch,
  StockMovement,
  UnitConversion,
  SettingsData,
  DashboardStats,
  ItemType,
} from '@/shared/types';

import { emptyStatus, type UpdateCheckResult } from '@/shared/update';

type Invoker = {
  invoke: (command: string, params?: unknown) => Promise<unknown>;
  pickBackupFolder: () => Promise<string | null>;
  pickBackupFile: () => Promise<string | null>;
  saveReportFile: (name: string) => Promise<string | null>;
  updater: {
    status: () => Promise<UpdateCheckResult>;
    check: () => Promise<UpdateCheckResult>;
    download: () => Promise<UpdateCheckResult>;
    install: () => Promise<boolean>;
  };
  onLockState: (cb: (locked: boolean) => void) => () => void;
};

function getApi() {
  return (window as unknown as { api?: Invoker }).api;
}

/**
 * Small observable store so UI can react to the "backend unavailable"
 * state (e.g. when running `npm run dev:web` in a plain browser).
 */
let backendReady = false;
export const backendState = {
  get ready() {
    return backendReady;
  },
  set(v: boolean) {
    backendReady = v;
  },
};

async function invoke<T>(command: string, params?: unknown): Promise<T> {
  const api = getApi();
  if (!api) {
    backendState.set(false);
    throw new Error(
      'Desktop backend not connected. Start with `npm run dev` (Electron) to access the database.',
    );
  }
  backendState.set(true);
  return api.invoke(command, params) as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const api = {
  auth: {
    hasUsers: () => invoke<boolean>('auth.hasUsers'),
    setup: (username: string, password: string) =>
      invoke<{ id: number; username: string; role: string }>('auth.setup', { username, password }),
    login: (username: string, password: string) =>
      invoke<{ id: number; username: string; role: string }>('auth.login', { username, password }),
    changePassword: (userId: number, currentPassword: string, newPassword: string) =>
      invoke<void>('auth.changePassword', { userId, currentPassword, newPassword }),
    lock: () => invoke<{ locked: boolean }>('auth.lock'),
    logout: () => invoke<{ loggedOut: boolean }>('auth.logout'),
    unlock: (username: string, password: string) =>
      invoke<{ id: number; username: string; role: string }>('auth.unlock', { username, password }),
  },

  updater: {
    status: () => getApi()?.updater?.status?.() ?? Promise.resolve<UpdateCheckResult>(emptyStatus()),
    check: () => getApi()?.updater?.check?.() ?? Promise.resolve<UpdateCheckResult>(emptyStatus()),
    download: () => getApi()?.updater?.download?.() ?? Promise.resolve<UpdateCheckResult>(emptyStatus()),
    install: () => getApi()?.updater?.install?.() ?? Promise.resolve(false),
    onLockState: (cb: (locked: boolean) => void) => getApi()?.onLockState?.(cb) ?? (() => undefined),
  },

  settings: {
    get: () => invoke<SettingsData>('settings.get'),
    save: (patch: Partial<SettingsData>) => invoke<SettingsData>('settings.save', patch),
  },

  products: {
    list: () => invoke<Product[]>('products.list'),
    get: (id: number) => invoke<Product>('products.get', { id }),
    create: (input: unknown) => invoke<Product>('products.create', input),
    update: (id: number, input: unknown) => invoke<Product>('products.update', { id, input }),
    status: (id: number, status: string) => invoke<Product>('products.status', { id, status }),
    del: (id: number) => invoke<void>('products.delete', { id }),
  },

  materials: {
    list: () => invoke<RawMaterial[]>('materials.list'),
    get: (id: number) => invoke<RawMaterial>('materials.get', { id }),
    create: (input: unknown) => invoke<RawMaterial>('materials.create', input),
    update: (id: number, input: unknown) => invoke<RawMaterial>('materials.update', { id, input }),
    status: (id: number, status: string) => invoke<RawMaterial>('materials.status', { id, status }),
    del: (id: number) => invoke<void>('materials.delete', { id }),
  },

  suppliers: {
    list: () => invoke<Supplier[]>('suppliers.list'),
    get: (id: number) => invoke<Supplier>('suppliers.get', { id }),
    create: (input: unknown) => invoke<Supplier>('suppliers.create', input),
    update: (id: number, input: unknown) => invoke<Supplier>('suppliers.update', { id, input }),
    status: (id: number, status: string) => invoke<Supplier>('suppliers.status', { id, status }),
    del: (id: number) => invoke<void>('suppliers.delete', { id }),
  },

  employees: {
    list: () => invoke<Employee[]>('employees.list'),
    get: (id: number) => invoke<Employee>('employees.get', { id }),
    create: (input: unknown) => invoke<Employee>('employees.create', input),
    update: (id: number, input: unknown) => invoke<Employee>('employees.update', { id, input }),
    status: (id: number, status: string) => invoke<Employee>('employees.status', { id, status }),
    del: (id: number) => invoke<void>('employees.delete', { id }),
  },

  purchases: {
    list: (opts: unknown) => invoke<{ rows: Purchase[]; total: number }>('purchases.list', opts),
    get: (id: number) => invoke<Purchase>('purchases.get', { id }),
    create: (input: unknown) => invoke<Purchase>('purchases.create', input),
    update: (id: number, input: unknown) => invoke<Purchase>('purchases.update', { id, input }),
    del: (id: number) => invoke<void>('purchases.delete', { id }),
    nextNo: () => invoke<string>('purchases.nextNo'),
  },

  recipes: {
    list: () => invoke<Recipe[]>('recipes.list'),
    get: (id: number) => invoke<Recipe>('recipes.get', { id }),
    activeForProduct: (productId: number) => invoke<Recipe>('recipes.activeForProduct', { productId }),
    create: (input: unknown) => invoke<Recipe>('recipes.create', input),
    update: (id: number, input: unknown) => invoke<Recipe>('recipes.update', { id, input }),
    status: (id: number, status: string) => invoke<Recipe>('recipes.status', { id, status }),
    del: (id: number) => invoke<void>('recipes.delete', { id }),
  },

  production: {
    list: (opts: unknown) => invoke<{ rows: Production[]; total: number }>('production.list', opts),
    get: (id: number) => invoke<Production>('production.get', { id }),
    preview: (input: unknown) => invoke<{
      materials: Array<{ rawMaterialId: number; name: string; unit: string; required: number; available: number }>;
      insufficient: boolean;
      totalCost: number;
    }>('production.preview', input),
    create: (input: unknown) => invoke<Production>('production.create', input),
    cancel: (id: number) => invoke<void>('production.cancel', { id }),
    nextNo: () => invoke<string>('production.nextNo'),
  },

  dispatch: {
    list: (opts: unknown) => invoke<{ rows: Dispatch[]; total: number }>('dispatch.list', opts),
    get: (id: number) => invoke<Dispatch>('dispatch.get', { id }),
    availability: (productId: number) =>
      invoke<{ available: number; productName: string; unit: string }>('dispatch.availability', { productId }),
    create: (input: unknown) => invoke<Dispatch>('dispatch.create', input),
    update: (id: number, input: unknown) => invoke<Dispatch>('dispatch.update', { id, input }),
    del: (id: number) => invoke<void>('dispatch.delete', { id }),
    nextNo: () => invoke<string>('dispatch.nextNo'),
  },

  adjustments: {
    create: (input: unknown) => invoke<number>('adjustments.create', input),
  },

  stock: {
    itemBalance: (itemType: ItemType, itemId: number) =>
      invoke<number>('stock.itemBalance', { itemType, itemId }),
    itemLedger: (itemType: ItemType, itemId: number, range?: { fromDate?: string; toDate?: string }) =>
      invoke<import('@/shared/types').StockBalance>('stock.itemLedger', { itemType, itemId, ...range }),
  },

  attendance: {
    set: (employeeId: number, date: string, status: AttendanceStatus) =>
      invoke<void>('attendance.set', { employeeId, date, status }),
    month: (employeeId: number, month: string) =>
      invoke<Record<string, AttendanceStatus>>('attendance.month', { employeeId, month }),
    summary: (employeeId: number, month: string) =>
      invoke<{ present: number; halfDays: number; absent: number; weeklyOff: number; holiday: number }>(
        'attendance.summary',
        { employeeId, month },
      ),
  },

  overtime: {
    list: (opts: unknown) => invoke<{ rows: Overtime[]; total: number }>('overtime.list', opts),
    create: (input: unknown) => invoke<Overtime>('overtime.create', input),
    update: (id: number, input: unknown) => invoke<Overtime>('overtime.update', { id, input }),
    del: (id: number) => invoke<void>('overtime.delete', { id }),
    summary: (month: string) => invoke<Array<{ employeeId: number; employeeName: string; totalHours: number; amount: number }>>('overtime.summary', { month }),
  },

  wages: {
    preview: (month: string) => invoke<Array<Record<string, unknown>>>('wages.preview', { month }),
    calcOne: (employeeId: number, month: string) =>
      invoke<Record<string, unknown>>('wages.calcOne', { employeeId, month }),
    calcAll: (month: string) => invoke<Wage[]>('wages.calcAll', { month }),
    adjust: (employeeId: number, month: string, additions: number, deductions: number) =>
      invoke<Wage>('wages.adjust', { employeeId, month, additions, deductions }),
    lock: (employeeId: number, month: string) => invoke<Wage>('wages.lock', { employeeId, month }),
    unlock: (employeeId: number, month: string) => invoke<Wage>('wages.unlock', { employeeId, month }),
    list: (opts: unknown) => invoke<{ rows: Wage[]; total: number }>('wages.list', opts),
    get: (employeeId: number, month: string) => invoke<Wage>('wages.get', { employeeId, month }),
    monthTotals: (month: string) =>
      invoke<{ totalWages: number; totalOvertime: number; count: number }>('wages.monthTotals', { month }),
  },

  unitConversions: {
    list: () => invoke<UnitConversion[]>('unitConversions.list'),
    upsert: (fromUnit: string, toUnit: string, factor: number) =>
      invoke<UnitConversion>('unitConversions.upsert', { fromUnit, toUnit, factor }),
    del: (fromUnit: string, toUnit: string) =>
      invoke<void>('unitConversions.delete', { fromUnit, toUnit }),
  },

  dashboard: {
    stats: () => invoke<DashboardStats>('dashboard.stats'),
    series: (fromDate: string, toDate: string) =>
      invoke<{
        purchases: Array<{ month: string; total: number }>;
        production: Array<{ month: string; units: number; cost: number }>;
        dispatches: Array<{ month: string; quantity: number }>;
      }>('dashboard.series', { fromDate, toDate }),
  },

  reports: {
    call: <T>(name: string, params: unknown) => invoke<T>(name, params),
  },

  backup: {
    create: (kind: 'manual' | 'auto', password?: string) =>
      invoke<{ fileName: string; filePath: string; encrypted?: boolean }>('backup.create', {
        kind,
        password: password || undefined,
      }),
    list: () => invoke<Array<Record<string, unknown>>>('backup.list'),
    restore: (backupPath: string, password?: string) =>
      invoke<{ restored: boolean }>('backup.restore', {
        backupPath,
        password: password || undefined,
      }),
  },

  audit: {
    list: (limit?: number) => invoke<Array<Record<string, unknown>>>('audit.list', { limit }),
  },

  seed: {
    demo: () => invoke<void>('seed.demo'),
    clear: () => invoke<void>('seed.clear'),
  },

  system: {
    info: () => invoke<{ dbPath: string | null; version: string; appDataDir?: string }>('system.info'),
  },

  // Native dialogs
  dialogs: {
    pickBackupFolder: () => getApi()?.pickBackupFolder() ?? Promise.resolve(null),
    pickBackupFile: () => getApi()?.pickBackupFile() ?? Promise.resolve(null),
    saveReportFile: (name: string) => getApi()?.saveReportFile(name) ?? Promise.resolve(null),
  },
};

export type StockMovementRow = StockMovement & { itemName?: string; itemType?: string };
export { invoke };