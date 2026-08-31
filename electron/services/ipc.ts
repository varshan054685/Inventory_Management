import type { DatabaseManager } from '../db/manager';
import * as auth from './auth';
import * as masters from './masters';
import * as purchases from './purchases';
import * as recipes from './recipes';
import * as production from './production';
import * as dispatch from './dispatch';
import * as adjustments from './adjustments';
import * as stock from './stock';
import * as attendance from './attendance';
import * as overtime from './overtime';
import * as wages from './wages';
import * as settingsService from './settings';
import * as unitConversions from './unitConversions';
import * as backup from './backup';
import * as dashboard from './dashboard';
import * as reports from './reports';
import * as seed from './seed';
import * as auditService from './audit';
import { validateParams } from './validation';
import { APP_VERSION } from '../shared/appInfo';

type Ctx = {
  manager: DatabaseManager;
  /** Lock state managed by the wrapper. */
  isLocked: boolean;
  /** Whether a user has successfully authenticated this session. */
  authenticated: boolean;
};

type Handler = (db: Ctx, params: unknown) => unknown;

/**
 * Central command registry. Each key maps 1:1 to a frontend `api.invoke(…)`.
 * Keeping it data-only here makes it trivial to port to Tauri commands later.
 */
const HANDLERS: Record<string, Handler> = {
  // Auth
  'auth.hasUsers': (_c, _p) => auth.hasUsers(_c.manager.db),
  'auth.setup': (c, p) => auth.createFirstUser(c.manager.db, (p as any).username, (p as any).password),
  'auth.login': (c, p) => auth.login(c.manager.db, (p as any).username, (p as any).password),
  'auth.listUsers': (_c) => auth.listUsers(_c.manager.db),
  'auth.changePassword': (c, p) => auth.changePassword(c.manager.db, (p as any).userId, (p as any).currentPassword, (p as any).newPassword),
  'auth.logout': (c) => {
    c.isLocked = true;
    auditService.audit(c.manager.db, 'AUTH_LOGOUT', 'users', undefined, 'Logged out');
    return { loggedOut: true };
  },
  'auth.lock': (c) => {
    c.isLocked = true;
    auditService.audit(c.manager.db, 'AUTH_LOCK', 'users', undefined, 'Application locked');
    return { locked: true };
  },
  'auth.unlock': (c, p) => {
    const u = auth.login(c.manager.db, (p as any).username, (p as any).password);
    c.isLocked = false;
    return u;
  },

  // Settings
  'settings.get': (c) => settingsService.getSettings(c.manager.db),
  'settings.save': (c, p) => settingsService.saveSettings(c.manager.db, p as any),

  // Products
  'products.list': (c) => masters.listProducts(c.manager.db),
  'products.get': (c, p) => masters.getProduct(c.manager.db, (p as any).id),
  'products.create': (c, p) => masters.createProduct(c.manager.db, p as any),
  'products.update': (c, p) => masters.updateProduct(c.manager.db, (p as any).id, (p as any).input),
  'products.status': (c, p) => masters.setProductStatus(c.manager.db, (p as any).id, (p as any).status),
  'products.delete': (c, p) => masters.deleteProduct(c.manager.db, (p as any).id),

  // Raw materials
  'materials.list': (c) => masters.listRawMaterials(c.manager.db),
  'materials.get': (c, p) => masters.getRawMaterial(c.manager.db, (p as any).id),
  'materials.create': (c, p) => masters.createRawMaterial(c.manager.db, p as any),
  'materials.update': (c, p) => masters.updateRawMaterial(c.manager.db, (p as any).id, (p as any).input),
  'materials.status': (c, p) => masters.setRawMaterialStatus(c.manager.db, (p as any).id, (p as any).status),
  'materials.delete': (c, p) => masters.deleteRawMaterial(c.manager.db, (p as any).id),

  // Suppliers
  'suppliers.list': (c) => masters.listSuppliers(c.manager.db),
  'suppliers.get': (c, p) => masters.getSupplier(c.manager.db, (p as any).id),
  'suppliers.create': (c, p) => masters.createSupplier(c.manager.db, p as any),
  'suppliers.update': (c, p) => masters.updateSupplier(c.manager.db, (p as any).id, (p as any).input),
  'suppliers.status': (c, p) => masters.setSupplierStatus(c.manager.db, (p as any).id, (p as any).status),
  'suppliers.delete': (c, p) => masters.deleteSupplier(c.manager.db, (p as any).id),

  // Employees
  'employees.list': (c) => masters.listEmployees(c.manager.db),
  'employees.get': (c, p) => masters.getEmployee(c.manager.db, (p as any).id),
  'employees.create': (c, p) => masters.createEmployee(c.manager.db, p as any),
  'employees.update': (c, p) => masters.updateEmployee(c.manager.db, (p as any).id, (p as any).input),
  'employees.status': (c, p) => masters.setEmployeeStatus(c.manager.db, (p as any).id, (p as any).status),
  'employees.delete': (c, p) => masters.deleteEmployee(c.manager.db, (p as any).id),

  // Purchases
  'purchases.list': (c, p) => purchases.listPurchases(c.manager.db, p as any),
  'purchases.get': (c, p) => purchases.getPurchase(c.manager.db, (p as any).id),
  'purchases.create': (c, p) => purchases.createPurchase(c.manager.db, p as any),
  'purchases.update': (c, p) => purchases.updatePurchase(c.manager.db, (p as any).id, (p as any).input),
  'purchases.delete': (c, p) => purchases.deletePurchase(c.manager.db, (p as any).id),
  'purchases.nextNo': (c) => purchases.nextSuggestedPurchaseNo(c.manager.db),

  // Recipes
  'recipes.list': (c) => recipes.listRecipes(c.manager.db),
  'recipes.get': (c, p) => recipes.getRecipe(c.manager.db, (p as any).id),
  'recipes.activeForProduct': (c, p) => recipes.getActiveRecipeForProduct(c.manager.db, (p as any).productId),
  'recipes.create': (c, p) => recipes.createRecipe(c.manager.db, p as any),
  'recipes.update': (c, p) => recipes.updateRecipe(c.manager.db, (p as any).id, (p as any).input),
  'recipes.status': (c, p) => recipes.setRecipeStatus(c.manager.db, (p as any).id, (p as any).status),
  'recipes.delete': (c, p) => recipes.deleteRecipe(c.manager.db, (p as any).id),

  // Production
  'production.list': (c, p) => production.listProductions(c.manager.db, p as any),
  'production.get': (c, p) => production.getProduction(c.manager.db, (p as any).id),
  'production.preview': (c, p) => production.previewProduction(c.manager.db, p as any),
  'production.create': (c, p) => production.createProduction(c.manager.db, p as any),
  'production.cancel': (c, p) => production.cancelProduction(c.manager.db, (p as any).id),
  'production.nextNo': (c) => production.nextSuggestedProductionNo(c.manager.db),

  // Dispatch
  'dispatch.list': (c, p) => dispatch.listDispatches(c.manager.db, p as any),
  'dispatch.get': (c, p) => dispatch.getDispatch(c.manager.db, (p as any).id),
  'dispatch.availability': (c, p) => dispatch.getDispatchAvailability(c.manager.db, (p as any).productId),
  'dispatch.create': (c, p) => dispatch.createDispatch(c.manager.db, p as any),
  'dispatch.update': (c, p) => dispatch.updateDispatch(c.manager.db, (p as any).id, (p as any).input),
  'dispatch.delete': (c, p) => dispatch.deleteDispatch(c.manager.db, (p as any).id),
  'dispatch.nextNo': (c) => dispatch.nextSuggestedDispatchNo(c.manager.db),

  // Adjustments
  'adjustments.create': (c, p) => adjustments.createAdjustment(c.manager.db, p as any),

  // Stock
  'stock.itemBalance': (c, p) => stock.getItemBalance(c.manager.db, (p as any).itemType, (p as any).itemId),
  'stock.itemLedger': (c, p) => stock.getItemStockBalance(c.manager.db, (p as any).itemType, (p as any).itemId, { fromDate: (p as any).fromDate, toDate: (p as any).toDate }),

  // Attendance
  'attendance.set': (c, p) => attendance.setAttendance(c.manager.db, (p as any).employeeId, (p as any).date, (p as any).status),
  'attendance.month': (c, p) => attendance.listAttendanceForMonth(c.manager.db, (p as any).employeeId, (p as any).month),
  'attendance.summary': (c, p) => attendance.attendanceSummaryForMonth(c.manager.db, (p as any).employeeId, (p as any).month),
  'attendance.monthAll': (c, p) => attendance.listAttendanceMonth(c.manager.db, (p as any).month),

  // Overtime
  'overtime.list': (c, p) => overtime.listOvertime(c.manager.db, p as any),
  'overtime.create': (c, p) => overtime.createOvertime(c.manager.db, p as any),
  'overtime.update': (c, p) => overtime.updateOvertime(c.manager.db, (p as any).id, (p as any).input),
  'overtime.delete': (c, p) => overtime.deleteOvertime(c.manager.db, (p as any).id),
  'overtime.summary': (c, p) => overtime.overtimeSummaryByEmployee(c.manager.db, (p as any).month),

  // Wages
  'wages.preview': (c, p) => wages.previewMonthWages(c.manager.db, (p as any).month),
  'wages.calcOne': (c, p) => wages.calculateEmployeeWage(c.manager.db, (p as any).employeeId, (p as any).month),
  'wages.calcAll': (c, p) => wages.calculateAllWagesForMonth(c.manager.db, (p as any).month),
  'wages.adjust': (c, p) => wages.adjustWage(c.manager.db, (p as any).employeeId, (p as any).month, (p as any).additions, (p as any).deductions),
  'wages.lock': (c, p) => wages.lockWage(c.manager.db, (p as any).employeeId, (p as any).month),
  'wages.unlock': (c, p) => wages.unlockWage(c.manager.db, (p as any).employeeId, (p as any).month),
  'wages.list': (c, p) => wages.listWages(c.manager.db, p as any),
  'wages.get': (c, p) => wages.getWage(c.manager.db, (p as any).employeeId, (p as any).month),
  'wages.monthTotals': (c, p) => wages.monthTotals(c.manager.db, (p as any).month),

  // Unit conversions
  'unitConversions.list': (c) => unitConversions.listUnitConversions(c.manager.db),
  'unitConversions.upsert': (c, p) => unitConversions.upsertUnitConversion(c.manager.db, (p as any).fromUnit, (p as any).toUnit, (p as any).factor),
  'unitConversions.delete': (c, p) => unitConversions.deleteUnitConversion(c.manager.db, (p as any).fromUnit, (p as any).toUnit),

  // Dashboard
  'dashboard.stats': (c) => dashboard.getDashboardStats(c.manager.db),
  'dashboard.series': (c, p) => dashboard.getMonthlySeries(c.manager.db, p as any),

  // Reports
  'reports.dailyPurchase': (c, p) => reports.dailyPurchaseReport(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.purchaseBySupplier': (c, p) => reports.purchaseReportBySupplier(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.purchaseByItem': (c, p) => reports.purchaseReportByItem(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.monthlyPurchase': (c, p) => reports.monthlyPurchaseReport(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.dailyProduction': (c, p) => reports.dailyProductionReport(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.productionByProduct': (c, p) => reports.productionReportByProduct(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.monthlyProduction': (c, p) => reports.monthlyProductionReport(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.currentStock': (c, p) => reports.currentStockReport(c.manager.db, p as any),
  'reports.stockMovement': (c, p) => reports.stockMovementReport(c.manager.db, p as any),
  'reports.attendanceMonth': (c, p) => reports.attendanceReportMonth(c.manager.db, (p as any).month),
  'reports.wageMonth': (c, p) => reports.wageReportMonth(c.manager.db, (p as any).month),
  'reports.overtimeMonth': (c, p) => reports.overtimeReportMonth(c.manager.db, (p as any).month),
  'reports.payrollSummary': (c, p) => reports.payrollSummary(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.dailyDispatch': (c, p) => reports.dailyDispatchReport(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.dispatchByProduct': (c, p) => reports.dispatchReportByProduct(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.dispatchByVehicle': (c, p) => reports.dispatchReportByVehicle(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.dispatchByLocation': (c, p) => reports.dispatchReportByLocation(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.monthlyBusiness': (c, p) => reports.monthlyBusinessSummary(c.manager.db, (p as any).fromDate, (p as any).toDate),
  'reports.expenseSummary': (c, p) => reports.expenseSummary(c.manager.db, (p as any).fromDate, (p as any).toDate),

  // Backup
  'backup.create': (c, p) => backup.createBackup(c.manager, (p as any)?.kind ?? 'manual', { password: (p as any)?.password }),
  'backup.list': (c) => backup.listBackups(c.manager.db),
  'backup.restore': (c, p) =>
    backup.restoreBackup(c.manager, (p as any).backupPath, {
      password: (p as any)?.password,
    }),
  'backup.prune': (c, p) => backup.pruneBackups(c.manager.db, (p as any).keep),

  // Seed
  'seed.demo': (c) => seed.seedDemoData(c.manager.db),
  'seed.clear': (c) => seed.clearAllData(c.manager.db),

  // Audit
  'audit.list': (c, p) => auditService.listAuditLogs(c.manager.db, (p as any)?.limit),

  // System
  'system.info': (c) => ({
    dbPath: c.manager.filePath,
    version: APP_VERSION,
    appDataDir: process.env.APP_DATA,
  }),
};

const LOCKED_COMMANDS: Record<string, boolean> = {};
// Commands allowed while the app is locked are minimal.
const ALLOWED_WHEN_LOCKED = new Set([
  'auth.unlock',
  'auth.login',
  'auth.hasUsers',
  'auth.setup',
  'system.info',
]);

export type { Ctx, Handler };

/** Execute a command by name with params. Throws user-friendly errors. */
export function executeCommand(ctx: Ctx, command: string, params: unknown): unknown {
  if (!(command in HANDLERS)) {
    throw new Error(`Unknown command: ${command}`);
  }
  if (ctx.isLocked && !ALLOWED_WHEN_LOCKED.has(command)) {
    throw new Error('The application is locked. Unlock it to continue.');
  }
  const handler = HANDLERS[command];
  try {
    // Validate renderer input with the per-command schema BEFORE business logic.
    // Zod throws a ZodError that we normalize to a safe user-facing message.
    const safeParams = validateParams(command, params ?? {}) as Record<string, any>;
    return handler(ctx, safeParams ?? {});
  } catch (err) {
    if (isZodError(err)) {
      throw new Error('Invalid request data. Please review your input and try again.');
    }
    // Re-throw user-facing errors as-is; they are already friendly messages.
    throw err;
  }
}

function isZodError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: string }).name === 'ZodError'
  );
}

export function commandExists(command: string): boolean {
  return command in HANDLERS;
}

void LOCKED_COMMANDS;