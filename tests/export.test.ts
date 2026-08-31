import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { exportCSV, exportExcel } from '../src/utils/export';
import { JSDOM } from 'jsdom';

// Minimal DOM shim so export.ts's downloadInBrowser doesn't crash in Node.
globalThis.URL.createObjectURL = (() => 'blob:fake') as any;
globalThis.URL.revokeObjectURL = (() => undefined) as any;
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).atob = (s: string) => Buffer.from(s, 'base64').toString('binary');
(globalThis as any).Blob = Blob;

const rows = [
  { name: 'Mango Candy', qty: 3, price: '₹10' },
  { name: 'Milk, "Special"', qty: 1, price: '' },
];

describe('Report export', () => {
  it('produces a non-empty xlsx buffer via exceljs', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Report');
    ws.addRow(['name', 'qty']);
    ws.addRow(['Mango', 3]);
    const buf = await wb.xlsx.writeBuffer();
    expect(Buffer.from(buf).length).toBeGreaterThan(100);
  });

  it('exportExcel runs end-to-end without throwing', async () => {
    await expect(
      exportExcel(rows, [
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Qty', key: 'qty', width: 8 },
        { header: 'Price', key: 'price' },
      ], 'report.xlsx'),
    ).resolves.toBeUndefined();
  });

  it('exportCSV runs end-to-end without throwing', async () => {
    await expect(
      exportCSV(rows, [
        { header: 'Name', key: 'name' },
        { header: 'Qty', key: 'qty' },
      ], 'report.csv'),
    ).resolves.toBeUndefined();
  });
});
