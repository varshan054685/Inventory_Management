import type { AppDatabase } from '../db/connection';
import { audit } from './audit';
import type { UnitConversion, Unit } from '../../src/shared/types';

export function listUnitConversions(db: AppDatabase): UnitConversion[] {
  return db.query<UnitConversion>('SELECT * FROM unit_conversions ORDER BY from_unit, to_unit');
}

export function upsertUnitConversion(
  db: AppDatabase,
  fromUnit: Unit,
  toUnit: Unit,
  factor: number,
): UnitConversion {
  if (fromUnit === toUnit) throw new Error('Conversion unit cannot be the same');
  if (!(factor > 0)) throw new Error('Conversion factor must be > 0');
  db.run(
    `INSERT INTO unit_conversions (from_unit, to_unit, factor) VALUES (?, ?, ?)
     ON CONFLICT(from_unit, to_unit) DO UPDATE SET factor = excluded.factor`,
    [fromUnit, toUnit, Number(factor)],
  );
  audit(db, 'UNIT_CONVERSION', 'unit_conversions', undefined, `${fromUnit} -> ${toUnit} = ${factor}`);
  return db.get<UnitConversion>(
    'SELECT * FROM unit_conversions WHERE from_unit=? AND to_unit=?',
    [fromUnit, toUnit],
  )!;
}

export function deleteUnitConversion(db: AppDatabase, fromUnit: Unit, toUnit: Unit): void {
  db.run('DELETE FROM unit_conversions WHERE from_unit=? AND to_unit=?', [fromUnit, toUnit]);
}

/** Look up a direct conversion factor (1.0 if not configured / same unit). */
export function getConversionFactor(db: AppDatabase, fromUnit: Unit, toUnit: Unit): number {
  if (fromUnit === toUnit) return 1;
  const row = db.get<{ factor: number }>(
    'SELECT factor FROM unit_conversions WHERE from_unit=? AND to_unit=?',
    [fromUnit, toUnit],
  );
  return row?.factor ?? 1; // do not assume conversions unless configured
}