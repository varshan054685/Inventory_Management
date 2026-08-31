import type {
  AttendanceStatus,
  MovementType,
  ItemType,
  Status,
  Unit,
} from './constants';

// Re-export the primitive types so consumers can import them from './types'.
export type { AttendanceStatus, MovementType, ItemType, Status, Unit };

export interface User {
  id: number;
  username: string;
  passwordHash: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  unit: Unit;
  sellingPrice: number | null;
  minStock: number;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface RawMaterial {
  id: number;
  name: string;
  description: string | null;
  unit: Unit;
  minStock: number;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstNumber: string | null;
  notes: string | null;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: number;
  name: string;
  contactNumber: string | null;
  address: string | null;
  joiningDate: string | null;
  dailyWage: number;
  halfDayWage: number;
  overtimeRate: number;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseItem {
  id: number;
  purchaseId: number;
  rawMaterialId: number;
  unit: Unit;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Purchase {
  id: number;
  purchaseNo: string;
  purchaseDate: string;
  supplierId: number | null;
  invoiceNo: string | null;
  notes: string | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseItem[];
  supplierName?: string;
}

export interface RecipeItem {
  id: number;
  recipeId: number;
  rawMaterialId: number;
  quantity: number;
  unit: Unit;
  /** Joined from raw_materials for display. */
  rawMaterialName?: string;
}

export interface Recipe {
  id: number;
  productId: number;
  name: string;
  /** Standard output quantity this recipe produces. */
  outputQuantity: number;
  outputUnit: Unit;
  status: Status;
  createdAt: string;
  updatedAt: string;
  items?: RecipeItem[];
  productName?: string;
}

export interface Production {
  id: number;
  productionNo: string;
  productionDate: string;
  productId: number;
  units: number;
  costPerUnit: number;
  totalCost: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  productName?: string;
  productUnit?: Unit;
}

export interface Attendance {
  id: number;
  employeeId: number;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  createdAt: string;
  updatedAt: string;
  employeeName?: string;
}

export interface Overtime {
  id: number;
  employeeId: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  rate: number | null;
  amount: number;
  reason: string | null;
  status: Status;
  createdAt: string;
  updatedAt: string;
  employeeName?: string;
}

export interface Wage {
  id: number;
  employeeId: number;
  month: string; // YYYY-MM
  presentDays: number;
  halfDays: number;
  normalWage: number;
  overtimeAmount: number;
  additions: number;
  deductions: number;
  totalWage: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  employeeName?: string;
}

export interface Dispatch {
  id: number;
  dispatchNo: string;
  dispatchDate: string;
  productId: number;
  quantity: number;
  vehicleNumber: string | null;
  location: string | null;
  receiver: string | null;
  notes: string | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  productName?: string;
  productUnit?: Unit;
}

export interface StockMovement {
  id: number;
  date: string;
  itemType: ItemType;
  itemId: number;
  quantity: number; // positive = in, negative = out
  unit: Unit;
  movementType: MovementType;
  referenceId: number | null;
  notes: string | null;
  createdAt: string;
}

export interface UnitConversion {
  id: number;
  fromUnit: Unit;
  toUnit: Unit;
  factor: number;
}

export interface SettingsData {
  companyName: string;
  companyAddress: string | null;
  phone: string | null;
  email: string | null;
  currency: string;
  defaultUnit: string;
  lowStockThreshold: number | null;
  allowNegativeStock: boolean;
  autoBackup: string;
  backupFrequency: string;
  backupRetention: number;
  dateFormat: string;
  theme: string;
  requireAuth: boolean;
  autoLockEnabled: boolean;
  autoLockMinutes: number;
  debugLogging: boolean;
  updateAutoCheck: boolean;
  updateAutoDownload: boolean;
  updateChannel: 'stable' | 'beta';
}

export interface StockBalance {
  itemType: ItemType;
  itemId: number;
  name: string;
  unit: Unit;
  opening: number;
  received: number;
  consumed: number;
  produced: number;
  dispatched: number;
  adjustedIn: number;
  adjustedOut: number;
  closing: number;
}

export interface DashboardStats {
  todayPurchasesAmount: number;
  todayProductionUnits: number;
  todayDispatchQuantity: number;
  rawMaterialItems: number;
  finishedProductItems: number;
  staffPresent: number;
  staffAbsent: number;
  todayOvertimeHours: number;
  monthWages: number;
  lowStock: Array<{ itemType: ItemType; itemId: number; name: string; closing: number; unit: Unit; minStock: number }>;
}