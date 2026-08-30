import React, { useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Field, EmptyState, Spinner } from '@/components/ui';
import { FileText, FileSpreadsheet, FileDown, Printer } from 'lucide-react';
import { currency, number, monthLabel, todayIso } from '@/utils/format';
import { exportCSV, exportExcel, exportPDF, type ExportColumn } from '@/utils/export';
import type { ItemType } from '@/shared/types';

// ---------------------------------------------------------------------------
// Report definition
// ---------------------------------------------------------------------------
interface ReportDef {
  id: string;
  label: string;
  category: string;
  usesMonth?: boolean;
  columns: ExportColumn[];
  loader: (p: { fromDate: string; toDate: string; month?: string }) => Promise<Array<Record<string, unknown>>>;
  totals?: (rows: Array<Record<string, unknown>>) => Record<string, string | number>;
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function lastOfMonth(): string {
  const d = new Date();
  const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${m}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
}

const REPORTS: ReportDef[] = [
  // Purchases
  { id: 'dailyPurchase', label: 'Daily Purchase', category: 'Purchases', columns: [
    { header: 'Date', key: 'date' }, { header: '#', key: 'no' }, { header: 'Supplier', key: 'supplier' }, { header: 'Amount', key: 'amount', width: 80 },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<{ rows: Array<Record<string, unknown>>; total: number }>('reports.dailyPurchase', { fromDate, toDate })).rows,
    totals: (r) => ({ Total: currency(r.reduce((a, x) => a + Number(x.amount || 0), 0)) }) },
  { id: 'monthlyPurchase', label: 'Monthly Purchase', category: 'Purchases', columns: [
    { header: 'Month', key: 'month' }, { header: 'Orders', key: 'count' }, { header: 'Amount', key: 'amount', width: 100 },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<{ rows: Array<Record<string, unknown>> }>('reports.monthlyPurchase', { fromDate, toDate })).rows,
    totals: (r) => ({ Total: currency(r.reduce((a, x) => a + Number(x.amount || 0), 0)) }) },
  { id: 'purchaseBySupplier', label: 'Supplier-wise Purchase', category: 'Purchases', columns: [
    { header: 'Supplier', key: 'supplier' }, { header: 'Orders', key: 'count' }, { header: 'GST', key: 'gstNumber' }, { header: 'Amount', key: 'amount', width: 90 },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<{ rows: Array<Record<string, unknown>> }>('reports.purchaseBySupplier', { fromDate, toDate })).rows,
    totals: (r) => ({ Total: currency(r.reduce((a, x) => a + Number(x.amount || 0), 0)) }) },
  { id: 'purchaseByItem', label: 'Item-wise Purchase', category: 'Purchases', columns: [
    { header: 'Item', key: 'item' }, { header: 'Unit', key: 'unit' }, { header: 'Orders', key: 'orders' }, { header: 'Qty', key: 'qty' }, { header: 'Amount', key: 'amount', width: 90 },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<{ rows: Array<Record<string, unknown>> }>('reports.purchaseByItem', { fromDate, toDate })).rows,
    totals: (r) => ({ Total: currency(r.reduce((a, x) => a + Number(x.amount || 0), 0)) }) },

  // Production
  { id: 'dailyProduction', label: 'Daily Production', category: 'Production', columns: [
    { header: 'Date', key: 'date' }, { header: '#', key: 'no' }, { header: 'Product', key: 'product' }, { header: 'Units', key: 'units' }, { header: 'Cost', key: 'cost', width: 90 },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<{ rows: Array<Record<string, unknown>>; totalUnits: number; totalCost: number }>('reports.dailyProduction', { fromDate, toDate })).rows,
    totals: (r) => ({ Units: number(r.reduce((a, x) => a + Number(x.units || 0), 0)), Cost: currency(r.reduce((a, x) => a + Number(x.cost || 0), 0)) }) },
  { id: 'monthlyProduction', label: 'Monthly Production', category: 'Production', columns: [
    { header: 'Month', key: 'month' }, { header: 'Batches', key: 'count' }, { header: 'Units', key: 'units' }, { header: 'Cost', key: 'cost', width: 90 },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<{ rows: Array<Record<string, unknown>> }>('reports.monthlyProduction', { fromDate, toDate })).rows,
    totals: (r) => ({ Units: number(r.reduce((a, x) => a + Number(x.units || 0), 0)) }) },
  { id: 'productionByProduct', label: 'Product-wise Production', category: 'Production', columns: [
    { header: 'Product', key: 'product' }, { header: 'Batches', key: 'batches' }, { header: 'Units', key: 'units' }, { header: 'Cost', key: 'cost', width: 90 },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<{ rows: Array<Record<string, unknown>> }>('reports.productionByProduct', { fromDate, toDate })).rows,
    totals: (r) => ({ Cost: currency(r.reduce((a, x) => a + Number(x.cost || 0), 0)) }) },

  // Stock
  { id: 'currentStock', label: 'Current Stock', category: 'Stock', columns: [
    { header: 'Type', key: 'itemType' }, { header: 'Item', key: 'name' }, { header: 'Unit', key: 'unit' }, { header: 'Closing', key: 'closing' }, { header: 'Min', key: 'minStock' },
  ], loader: async () => (await api.reports.call<Array<Record<string, unknown>>>('reports.currentStock', { type: 'ALL' })) },
  { id: 'lowStock', label: 'Low Stock', category: 'Stock', columns: [
    { header: 'Type', key: 'itemType' }, { header: 'Item', key: 'name' }, { header: 'Unit', key: 'unit' }, { header: 'Closing', key: 'closing' }, { header: 'Min', key: 'minStock' },
  ], loader: async () => (await api.reports.call<Array<Record<string, unknown>>>('reports.currentStock', { type: 'ALL', onlyLow: true })) },
  { id: 'stockMovement', label: 'Stock Movements', category: 'Stock', columns: [
    { header: 'Date', key: 'date' }, { header: 'Item', key: 'itemName' }, { header: 'Type', key: 'itemType' }, { header: 'Movement', key: 'movementType' }, { header: 'Qty', key: 'quantity' }, { header: 'Unit', key: 'unit' }, { header: 'Notes', key: 'notes' },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<{ rows: Array<Record<string, unknown>> }>('reports.stockMovement', { fromDate, toDate, type: 'ALL', limit: 500 })).rows },

  // Staff
  { id: 'attendanceMonth', label: 'Monthly Attendance', category: 'Staff', usesMonth: true, columns: [
    { header: 'Employee', key: 'employeeName' }, { header: 'Present', key: 'present' }, { header: 'Half', key: 'halfDays' }, { header: 'Absent', key: 'absent' }, { header: 'WO', key: 'weeklyOff' }, { header: 'Holiday', key: 'holiday' },
  ], loader: async ({ month }) => (await api.reports.call<Array<Record<string, unknown>>>('reports.attendanceMonth', { month })) },

  // Wages
  { id: 'wageMonth', label: 'Monthly Wages', category: 'Wages', usesMonth: true, columns: [
    { header: 'Employee', key: 'employeeName' }, { header: 'Present', key: 'presentDays' }, { header: 'Half', key: 'halfDays' }, { header: 'Normal', key: 'normalWage' }, { header: 'OT', key: 'overtimeAmount' }, { header: 'Additions', key: 'additions' }, { header: 'Deductions', key: 'deductions' }, { header: 'Total', key: 'totalWage' }, { header: 'Status', key: 'status' },
  ], loader: async ({ month }) => (await api.reports.call<Array<Record<string, unknown>>>('reports.wageMonth', { month })),
    totals: (r) => ({ Total: currency(r.reduce((a, x) => a + Number(x.totalWage || 0), 0)) }) },
  { id: 'overtimeMonth', label: 'Overtime Report', category: 'Wages', usesMonth: true, columns: [
    { header: 'Employee', key: 'employeeName' }, { header: 'Days', key: 'days' }, { header: 'Hours', key: 'hours' }, { header: 'Rate', key: 'rate' }, { header: 'Amount', key: 'amount' },
  ], loader: async ({ month }) => (await api.reports.call<Array<Record<string, unknown>>>('reports.overtimeMonth', { month })),
    totals: (r) => ({ Hours: number(r.reduce((a, x) => a + Number(x.hours || 0), 0), 1), Amount: currency(r.reduce((a, x) => a + Number(x.amount || 0), 0)) }) },
  { id: 'payrollSummary', label: 'Payroll Summary', category: 'Wages', columns: [
    { header: 'Month', key: 'month' }, { header: 'Employees', key: 'employees' }, { header: 'Normal', key: 'normal' }, { header: 'OT', key: 'overtime' }, { header: 'Additions', key: 'additions' }, { header: 'Deductions', key: 'deductions' }, { header: 'Total', key: 'total' },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<Array<Record<string, unknown>>>('reports.payrollSummary', { fromDate, toDate })),
    totals: (r) => ({ Total: currency(r.reduce((a, x) => a + Number(x.total || 0), 0)) }) },

  // Dispatch
  { id: 'dailyDispatch', label: 'Daily Dispatch', category: 'Dispatch', columns: [
    { header: 'Date', key: 'date' }, { header: '#', key: 'no' }, { header: 'Product', key: 'product' }, { header: 'Qty', key: 'quantity' }, { header: 'Vehicle', key: 'vehicle' }, { header: 'Location', key: 'location' }, { header: 'Receiver', key: 'receiver' }, { header: 'Amount', key: 'amount' },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<{ rows: Array<Record<string, unknown>>; totalQty: number }>('reports.dailyDispatch', { fromDate, toDate })).rows,
    totals: (r) => ({ Qty: number(r.reduce((a, x) => a + Number(x.quantity || 0), 0)) }) },
  { id: 'dispatchByProduct', label: 'Product-wise Dispatch', category: 'Dispatch', columns: [
    { header: 'Product', key: 'product' }, { header: 'Unit', key: 'unit' }, { header: 'Orders', key: 'orders' }, { header: 'Qty', key: 'qty' }, { header: 'Amount', key: 'amount' },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<Array<Record<string, unknown>>>('reports.dispatchByProduct', { fromDate, toDate })) },
  { id: 'dispatchByVehicle', label: 'Vehicle-wise Dispatch', category: 'Dispatch', columns: [
    { header: 'Vehicle', key: 'vehicle' }, { header: 'Orders', key: 'orders' }, { header: 'Qty', key: 'qty' },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<Array<Record<string, unknown>>>('reports.dispatchByVehicle', { fromDate, toDate })) },
  { id: 'dispatchByLocation', label: 'Location-wise Dispatch', category: 'Dispatch', columns: [
    { header: 'Location', key: 'location' }, { header: 'Orders', key: 'orders' }, { header: 'Qty', key: 'qty' },
  ], loader: async ({ fromDate, toDate }) => (await api.reports.call<Array<Record<string, unknown>>>('reports.dispatchByLocation', { fromDate, toDate })) },

  // Business
  { id: 'monthlyBusiness', label: 'Monthly Business Summary', category: 'Business', columns: [
    { header: 'Month', key: 'month' }, { header: 'Purchases', key: 'purchase' }, { header: 'Production Cost', key: 'productionCost' }, { header: 'Dispatch Value', key: 'dispatchValue' }, { header: 'Wages', key: 'wages' },
  ], loader: async ({ fromDate, toDate }) => {
    const b = await api.reports.call<{ purchases: Array<Record<string, unknown>>; production: Array<Record<string, unknown>>; dispatch: Array<Record<string, unknown>>; wages: Array<Record<string, unknown>> }>('reports.monthlyBusiness', { fromDate, toDate });
    const months = new Set<string>();
    [...b.purchases, ...b.production, ...b.dispatch, ...b.wages].forEach((r) => months.add(String(r.month)));
    return [...months].sort().map((m) => ({
      month: m,
      purchase: (b.purchases.find((x) => x.month === m)?.purchase ?? 0) as number,
      productionCost: (b.production.find((x) => x.month === m)?.productionCost ?? 0) as number,
      dispatchValue: (b.dispatch.find((x) => x.month === m)?.dispatchValue ?? 0) as number,
      wages: (b.wages.find((x) => x.month === m)?.wages ?? 0) as number,
    }));
  }, totals: (r) => ({ Total: currency(r.reduce((a, x) => a + Number(x.purchase || 0) + Number(x.productionCost || 0) + Number(x.dispatchValue || 0) + Number(x.wages || 0), 0)) }) },
  { id: 'expenseSummary', label: 'Expense Summary', category: 'Business', columns: [
    { header: 'Purchases', key: 'totalPurchases' }, { header: 'Production Cost', key: 'totalProductionCost' }, { header: 'Wages', key: 'totalWages' }, { header: 'Overtime', key: 'totalOvertime' },
  ], loader: async ({ fromDate, toDate }) => {
    const e = await api.reports.call<Record<string, number>>('reports.expenseSummary', { fromDate, toDate });
    return [e];
  } },
];

const CATEGORIES = ['Purchases', 'Production', 'Stock', 'Staff', 'Wages', 'Dispatch', 'Business'];

export function ReportsPage() {
  const toast = useToast();
  const [cat, setCat] = useState('Purchases');
  const [reportId, setReportId] = useState(REPORTS[0].id);
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(lastOfMonth());
  const [month, setMonth] = useState(todayIso().slice(0, 7));

  const report = REPORTS.find((r) => r.id === reportId) ?? REPORTS[0];
  const reportList = REPORTS.filter((r) => r.category === cat);

  const { data, loading, error, refresh } = useData(
    () => report.loader({ fromDate, toDate, month }),
    [reportId, fromDate, toDate, month],
  );

  const handleExport = async (kind: 'pdf' | 'xlsx' | 'csv') => {
    if (!data) return;
    const base = `${report.label.replace(/\s+/g, '_')}_${fromDate}_${toDate}`;
    try {
      if (kind === 'pdf') await exportPDF(report.label, `${fromDate} to ${toDate}`, report.columns, data, `${base}.pdf`);
      else if (kind === 'xlsx') await exportExcel(data, report.columns, `${base}.xlsx`);
      else await exportCSV(data, report.columns, `${base}.csv`);
      toast.success(`${report.label} exported`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doPrint = () => window.print();

  return (
    <div className="space-y-4">
      {/* Report selector */}
      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => { setCat(c); const first = REPORTS.find((r) => r.category === c); if (first) setReportId(first.id); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${cat === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200'}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {reportList.map((r) => (
            <button
              key={r.id}
              onClick={() => setReportId(r.id)}
              className={`px-3 py-1.5 rounded-md text-sm border ${reportId === r.id ? 'border-brand-500 text-brand-600 bg-brand-50 dark:bg-brand-900/20 dark:text-brand-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          {report.usesMonth ? (
            <Field label="Month"><input type="month" className="input w-48" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
          ) : (
            <>
              <Field label="From"><input type="date" className="input w-44" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field>
              <Field label="To"><input type="date" className="input w-44" value={toDate} onChange={(e) => setToDate(e.target.value)} /></Field>
            </>
          )}
          <Button variant="secondary" onClick={refresh}><FileText className="w-4 h-4" /> Refresh</Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={() => handleExport('pdf')}><FileDown className="w-4 h-4" /> PDF</Button>
            <Button variant="secondary" onClick={() => handleExport('xlsx')}><FileSpreadsheet className="w-4 h-4" /> Excel</Button>
            <Button variant="secondary" onClick={() => handleExport('csv')}><FileText className="w-4 h-4" /> CSV</Button>
            <Button variant="secondary" onClick={doPrint}><Printer className="w-4 h-4" /> Print</Button>
          </div>
        </div>
      </Card>

      {/* Report table */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="card-title">{report.label}</h2>
          {report.totals && data && data.length > 0 && (
            <div className="flex items-center gap-4">
              {Object.entries(report.totals(data)).map(([k, v]) => (
                <div key={k} className="text-right">
                  <div className="text-xs text-slate-500">{k}</div>
                  <div className="font-bold text-brand-600">{String(v)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        {loading && !data ? <div className="h-40 flex items-center justify-center"><Spinner /></div> : !data || data.length === 0 ? (
          <EmptyState message="No data for this report" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {report.columns.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-left table-head">{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="table-row-hover">
                    {report.columns.map((c) => (
                      <td key={c.key} className="px-3 py-2">
                        {formatCell(c.key, row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function formatCell(key: string, v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === '') return '—';
  const moneyKeys = ['amount', 'cost', 'total', 'normal', 'overtime', 'additions', 'deductions', 'totalWage', 'normalWage', 'overtimeAmount', 'wages', 'purchase', 'productionCost', 'dispatchValue', 'totalPurchases', 'totalProductionCost', 'totalWages', 'totalOvertime', 'rate'];
  if (moneyKeys.includes(key) && typeof v === 'number') return currency(v);
  if (key === 'closing' || key === 'quantity' || key === 'units' || key === 'qty' || key === 'hours' || key === 'present' || key === 'halfDays' || key === 'absent' || key === 'weeklyOff' || key === 'holiday' || key === 'presentDays') {
    return number(Number(v));
  }
  return String(v);
}