// Shared domain constants used by both the frontend and backend.

export const UNITS = ['KG', 'PIECES', 'BOXES', 'BUNDLES', 'LITRES'] as const;
export type Unit = (typeof UNITS)[number];

export const DEFAULT_UNITS = ['BOXES', 'PIECES', 'BUNDLES'] as const;

/** Status values used across master records (products, materials, suppliers, employees). */
export const ACTIVE = 'active';
export const INACTIVE = 'inactive';
export type Status = typeof ACTIVE | typeof INACTIVE;

export const PURCHASE_IN = 'PURCHASE_IN';
export const PRODUCTION_RAW_MATERIAL_OUT = 'PRODUCTION_RAW_MATERIAL_OUT';
export const PRODUCTION_FINISHED_IN = 'PRODUCTION_FINISHED_IN';
export const DISPATCH_OUT = 'DISPATCH_OUT';
export const ADJUSTMENT_IN = 'ADJUSTMENT_IN';
export const ADJUSTMENT_OUT = 'ADJUSTMENT_OUT';

export const MOVEMENT_TYPES = [
  PURCHASE_IN,
  PRODUCTION_RAW_MATERIAL_OUT,
  PRODUCTION_FINISHED_IN,
  DISPATCH_OUT,
  ADJUSTMENT_IN,
  ADJUSTMENT_OUT,
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Item type for stock movements. */
export const RAW = 'RAW';
export const FINISHED = 'FINISHED';
export type ItemType = typeof RAW | typeof FINISHED;

/** Attendance statuses. */
export const PRESENT = 'P';
export const HALF_DAY = 'HD';
export const ABSENT = 'A';
export const WEEKLY_OFF = 'WO';
export const HOLIDAY = 'H';
export const ATTENDANCE_STATUSES = [PRESENT, HALF_DAY, ABSENT, WEEKLY_OFF, HOLIDAY] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Wage / payroll statuses. */
export const WAGE_DRAFT = 'draft';
export const WAGE_LOCKED = 'locked';
export const WAGE_UNLOCKED = 'unlocked';

export const CURRENCY_SYMBOL = '₹';
export const DEFAULT_CURRENCY = 'INR';

/** Backup frequencies. */
export const BACKUP_NEVER = 'never';
export const BACKUP_DAILY = 'daily';
export const BACKUP_WEEKLY = 'weekly';
export const BACKUP_FREQUENCIES = [BACKUP_NEVER, BACKUP_DAILY, BACKUP_WEEKLY] as const;

export const ROLES = { ADMIN: 'admin' } as const;

/** Activity codes passed to audit logger. */
export const AUTH_CREATE_STAFF = 'AUTH_CREATE_STAFF';
export const AUTH_CHANGE_PASSWORD = 'AUTH_CHANGE_PASSWORD';
export const AUTH_LOGIN = 'AUTH_LOGIN';
export const AUTH_LOGOUT = 'AUTH_LOGOUT';
export const AUTH_LOCK = 'AUTH_LOCK';
export const AUTH_UNLOCK = 'AUTH_UNLOCK';