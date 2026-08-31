import React, { useMemo, useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Field, Modal, EmptyState, Spinner, StatusBadge, ConfirmDialog } from '@/components/ui';
import { Calculator, Lock, Unlock, Pencil } from 'lucide-react';
import type { Wage } from '@/shared/types';
import { currency, currentMonth, monthLabel } from '@/utils/format';
import { MonthPicker } from '@/components/ui/calendar';

export function WagesPage() {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const { data, loading, error, refresh } = useData(() => api.wages.list({ month }), [month]);
  const [preview, setPreview] = useState<Array<Record<string, unknown>> | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editing, setEditing] = useState<{ employeeId: number; additions: string; deductions: string } | null>(null);
  const [lockTarget, setLockTarget] = useState<{ employeeId: number; locked: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const total = useMemo(() => (data?.rows ?? []).reduce((a, w) => a + w.totalWage, 0), [data]);

  const openPreview = async () => {
    setBusy(true);
    try {
      const res = await api.wages.preview(month);
      setPreview(res);
      setPreviewOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveAll = async () => {
    setBusy(true);
    try {
      const res = await api.wages.calcAll(month);
      toast.success(`Calculated ${res.length} payroll records`);
      setPreviewOpen(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveAdjust = async () => {
    if (!editing) return;
    try {
      await api.wages.adjust(editing.employeeId, month, Number(editing.additions || 0), Number(editing.deductions || 0));
      toast.success('Wage adjusted');
      setEditing(null);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleLock = async () => {
    if (!lockTarget) return;
    try {
      if (lockTarget.locked) await api.wages.unlock(lockTarget.employeeId, month);
      else await api.wages.lock(lockTarget.employeeId, month);
      toast.success(lockTarget.locked ? 'Payroll unlocked' : 'Payroll locked');
      setLockTarget(null);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="card-title">Monthly Wages — {monthLabel(month)}</h2>
            <p className="text-sm text-slate-500 mt-0.5">Calculated from attendance (full & half days) plus overtime. Lock records to finalize.</p>
          </div>
          <div className="flex items-center gap-2">
            <MonthPicker value={month} onChange={setMonth} />
            <Button variant="secondary" onClick={openPreview} disabled={busy}><Calculator className="w-4 h-4" /> Preview</Button>
            <Button variant="primary" onClick={saveAll} disabled={busy}><Calculator className="w-4 h-4" /> Calculate All</Button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        {loading && !data ? <div className="h-32 flex items-center justify-center"><Spinner /></div> : !data || data.rows.length === 0 ? (
          <EmptyState message="No payroll records for this month. Click Calculate All to generate from attendance." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base w-full">
                <thead><tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2 text-left table-head">Employee</th>
                  <th className="px-3 py-2 text-right table-head">Present</th>
                  <th className="px-3 py-2 text-right table-head">Half</th>
                  <th className="px-3 py-2 text-right table-head">Normal</th>
                  <th className="px-3 py-2 text-right table-head">OT</th>
                  <th className="px-3 py-2 text-right table-head">Additions</th>
                  <th className="px-3 py-2 text-right table-head">Deductions</th>
                  <th className="px-3 py-2 text-right table-head">Total</th>
                  <th className="px-3 py-2 text-left table-head">Status</th>
                  <th className="px-3 py-2 text-right table-head">Actions</th>
                </tr></thead>
                <tbody>
                  {data.rows.map((w: Wage) => (
                    <tr key={w.id} className="table-row-hover">
                      <td className="px-3 py-2.5 font-medium">{w.employeeName}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{w.presentDays}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{w.halfDays}</td>
                      <td className="px-3 py-2.5 text-right">{currency(w.normalWage)}</td>
                      <td className="px-3 py-2.5 text-right">{currency(w.overtimeAmount)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-600">{w.additions ? `+${currency(w.additions)}` : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-red-600">{w.deductions ? `-${currency(w.deductions)}` : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-bold">{currency(w.totalWage)}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={w.status} /></td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {w.status !== 'locked' && (
                            <button className="btn-ghost p-1.5" title="Adjust" onClick={() => setEditing({ employeeId: w.employeeId, additions: String(w.additions || ''), deductions: String(w.deductions || '') })}>
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          <button className="btn-ghost p-1.5" title={w.status === 'locked' ? 'Unlock' : 'Lock'} onClick={() => setLockTarget({ employeeId: w.employeeId, locked: w.status === 'locked' })}>
                            {w.status === 'locked' ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 dark:border-slate-700">
                    <td colSpan={7} className="px-3 py-2.5 text-right font-semibold">Total Wage Expense</td>
                    <td className="px-3 py-2.5 text-right font-bold text-lg">{currency(total)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Preview modal */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={`Preview — ${monthLabel(month)}`} size="lg"
        footer={<><Button variant="secondary" onClick={() => setPreviewOpen(false)}>Cancel</Button><Button variant="primary" onClick={saveAll} disabled={busy}><Calculator className="w-4 h-4" /> Save All Records</Button></>}>
        {!preview ? <div className="h-24 flex items-center justify-center"><Spinner /></div> : preview.length === 0 ? (
          <EmptyState message="No active employees for this month." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base w-full">
              <thead><tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2 text-left table-head">Employee</th>
                <th className="px-3 py-2 text-right table-head">Present</th>
                <th className="px-3 py-2 text-right table-head">Half</th>
                <th className="px-3 py-2 text-right table-head">Normal</th>
                <th className="px-3 py-2 text-right table-head">OT</th>
                <th className="px-3 py-2 text-right table-head">Total</th>
              </tr></thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={String(r.employeeId)}>
                    <td className="px-3 py-2">{String(r.employeeName)}</td>
                    <td className="px-3 py-2 text-right">{String(r.presentDays)}</td>
                    <td className="px-3 py-2 text-right">{String(r.halfDays)}</td>
                    <td className="px-3 py-2 text-right">{currency(Number(r.normalWage))}</td>
                    <td className="px-3 py-2 text-right">{currency(Number(r.overtimeAmount))}</td>
                    <td className="px-3 py-2 text-right font-semibold">{currency(Number(r.totalWage))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Adjust modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Adjust Wage" size="sm"
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" onClick={saveAdjust}>Save Adjustment</Button></>}>
        {editing && (
          <div className="space-y-4">
            <Field label="Additions (approved)">
              <input className="input" type="number" value={editing.additions} onChange={(e) => setEditing({ ...editing, additions: e.target.value })} />
            </Field>
            <Field label="Deductions">
              <input className="input" type="number" value={editing.deductions} onChange={(e) => setEditing({ ...editing, deductions: e.target.value })} />
            </Field>
            <p className="text-xs text-slate-500">These are applied on top of attendance + overtime wages.</p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!lockTarget} onClose={() => setLockTarget(null)} onConfirm={toggleLock}
        title={lockTarget?.locked ? 'Unlock payroll' : 'Lock payroll'}
        message={lockTarget?.locked ? 'Unlocking allows recalculation and adjustments. Continue?' : 'Locking finalizes this payroll record and prevents accidental changes. Continue?'}
        confirmText={lockTarget?.locked ? 'Unlock' : 'Lock'} danger={!lockTarget?.locked}
      />
    </div>
  );
}