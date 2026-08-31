import React, { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Field, Modal, EmptyState, Pagination, ConfirmDialog, Spinner } from '@/components/ui';
import { Plus, Pencil, Trash2, Timer, Zap, AlertTriangle } from 'lucide-react';
import type { Overtime, Employee } from '@/shared/types';
import { currency, currentMonth, monthLabel, calculateDuration, formatTime } from '@/utils/format';
import { MonthPicker, DatePicker, TimePicker } from '@/components/ui/calendar';

const PAGE = 15;

export function OvertimePage() {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [page, setPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);
  const { data, loading, error, refresh } = useData(
    () => api.overtime.list({ month, limit: PAGE, offset: (page - 1) * PAGE }),
    [month, page, listVersion],
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  useEffect(() => { void api.employees.list().then(setEmployees).catch(() => {}); }, []);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Overtime | null>(null);
  const [form, setForm] = useState({ employeeId: '' as number | '', date: '', startTime: '', endTime: '', hours: '', reason: '' });
  const [fe, setFe] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Overtime | null>(null);
  const [confirmMismatch, setConfirmMismatch] = useState(false);

  const openCreate = () => { setEditing(null); setForm({ employeeId: '', date: `${month}-01`, startTime: '18:00', endTime: '20:00', hours: '', reason: '' }); setFe(''); setOpen(true); };
  const openEdit = (o: Overtime) => {
    setEditing(o);
    setForm({ employeeId: o.employeeId, date: o.date, startTime: o.startTime ?? '', endTime: o.endTime ?? '', hours: String(o.hours), reason: o.reason ?? '' });
    setFe(''); setOpen(true);
  };

  // Auto-calculated from start/end times (supports overnight). Used live in the form.
  const hoursFromTimes = () => {
    const { startTime, endTime } = form;
    if (!startTime || !endTime) return null;
    const h = calculateDuration(startTime, endTime);
    return h > 0 ? h : null;
  };

  const manualHours = form.hours !== '' && form.hours !== '0' ? Number(form.hours) : null;
  const spanHours = hoursFromTimes();
  const liveHours = manualHours ?? spanHours;
  // A mismatch is a manually-typed hours that disagrees with the start/end span
  // (tolerance 0.1h to avoid float noise).
  const hasMismatch =
    manualHours != null && manualHours > 0 && spanHours != null && Math.abs(manualHours - spanHours) > 0.1;
  const emp = employees.find((e) => e.id === Number(form.employeeId));
  const liveRate = emp?.overtimeRate || 0;
  const liveAmount = liveHours && liveHours > 0 && emp ? Math.round(liveHours * liveRate * 100) / 100 : null;

  // The save handler. When hours disagree with the time span, require an
  // explicit confirmation instead of silently saving inconsistent data.
  const performSave = async () => {
    let hours = form.hours !== '' ? Number(form.hours) : hoursFromTimes();
    if (!hours || hours <= 0) { setFe('Enter overtime hours (or valid start/end times)'); return; }
    setFe('');
    try {
      const payload = { employeeId: Number(form.employeeId), date: form.date, startTime: form.startTime || null, endTime: form.endTime || null, hours, reason: form.reason || null };
      if (editing) await api.overtime.update(editing.id, payload);
      else await api.overtime.create(payload);
      toast.success(editing ? 'Overtime updated' : 'Overtime recorded');
      setOpen(false); setConfirmMismatch(false); refresh(); setListVersion((v) => v + 1);
    } catch (e) { toast.error((e as Error).message); }
  };

  const save = () => {
    if (!form.employeeId || !form.date) { setFe('Select employee and date'); return; }
    const h = form.hours !== '' ? Number(form.hours) : hoursFromTimes();
    if (!h || h <= 0) { setFe('Enter overtime hours (or valid start/end times)'); return; }
    // If a manually-entered hours disagrees with the time span, ask first.
    if (hasMismatch) {
      setConfirmMismatch(true);
      return;
    }
    void performSave();
  };

  const doDelete = async (o: Overtime) => {
    try { await api.overtime.del(o.id); toast.success('Overtime deleted'); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const empName = (id: number) => employees.find((e) => e.id === id)?.name ?? `#${id}`;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="card-title">Overtime — {monthLabel(month)}</h2>
            <p className="text-sm text-slate-500 mt-0.5">Overtime is added automatically to monthly wages.</p>
          </div>
          <div className="flex items-center gap-2">
            <MonthPicker value={month} onChange={(m) => { setMonth(m); setPage(1); }} />
            <Button variant="primary" onClick={openCreate}><Plus className="w-4 h-4" /> Record Overtime</Button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        {loading && !data ? <div className="h-32 flex items-center justify-center"><Spinner /></div> : !data || data.rows.length === 0 ? (
          <EmptyState message="No overtime recorded for this month" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base w-full">
                <thead><tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2 text-left table-head">Date</th>
                  <th className="px-3 py-2 text-left table-head">Employee</th>
                  <th className="px-3 py-2 text-left table-head">Time</th>
                  <th className="px-3 py-2 text-right table-head">Hours</th>
                  <th className="px-3 py-2 text-right table-head">Rate</th>
                  <th className="px-3 py-2 text-right table-head">Amount</th>
                  <th className="px-3 py-2 text-left table-head">Reason</th>
                  <th className="px-3 py-2 text-right table-head">Actions</th>
                </tr></thead>
                <tbody>
                  {data.rows.map((o) => (
                    <tr key={o.id} className="table-row-hover">
                      <td className="px-3 py-2.5">{o.date}</td>
                      <td className="px-3 py-2.5 font-medium">{o.employeeName}</td>
                      <td className="px-3 py-2.5 text-slate-500">{o.startTime ? `${formatTime(o.startTime)} – ${formatTime(o.endTime)}` : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{o.hours}</td>
                      <td className="px-3 py-2.5 text-right">{currency(o.rate)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{currency(o.amount)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{o.reason || '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button className="btn-ghost p-1.5" onClick={() => openEdit(o)}><Pencil className="w-4 h-4" /></button>
                          <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteTarget(o)}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Overtime' : 'Record Overtime'}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Employee" required>
            <select className="input" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: Number(e.target.value) })}>
              <option value="">Select employee</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Date" required>
            <DatePicker value={form.date} onChange={(d) => setForm({ ...form, date: d })} />
          </Field>
          <Field label="Start Time">
            <TimePicker value={form.startTime} onChange={(v) => setForm({ ...form, startTime: v })} label="Start" />
          </Field>
          <Field label="End Time">
            <TimePicker value={form.endTime} onChange={(v) => setForm({ ...form, endTime: v })} label="End" />
          </Field>
          <Field label="OT Hours">
            <input className="input" type="number" step="0.25" value={form.hours} placeholder={hoursFromTimes() ? String(hoursFromTimes()) : 'e.g. 2'} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><Zap className="w-3 h-3" /> Auto {hoursFromTimes() != null ? `= ${hoursFromTimes()} h` : 'from times'}</p>
          </Field>
          <Field label="Rate">
            <div className="input bg-slate-50 dark:bg-slate-700/40 font-medium">{currency(liveRate)} / hr</div>
          </Field>
          <Field label="Amount (auto)" className="md:col-span-2">
            <div className="input bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 font-bold">{liveAmount != null ? currency(liveAmount) : '—'}</div>
          </Field>
          <Field label="Reason">
            <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
        </div>
        {hasMismatch ? (
          <div className="mt-3 flex gap-2 items-start rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 p-3 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Hours don't match the time span.</strong>{' '}
              {formatTime(form.startTime)} → {formatTime(form.endTime)} = {spanHours} h, but OT Hours is {manualHours} h.
              Amount will be {currency(liveAmount ?? 0)}. You'll be asked to confirm before saving.
            </div>
          </div>
        ) : null}
        {fe && <p className="text-sm text-red-600 mt-3">{fe}</p>}
        <p className="text-xs text-slate-500 mt-3 flex items-center gap-1"><Timer className="w-3.5 h-3.5" /> Hours are auto-calculated from Start → End (overnight supported). Amount updates live = Hours × Rate. Rate is set in Staff.</p>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && doDelete(deleteTarget)}
        title="Delete overtime" message="This will remove the overtime amount from wage calculations." confirmText="Delete" danger
      />

      <ConfirmDialog
        open={confirmMismatch}
        onClose={() => setConfirmMismatch(false)}
        onConfirm={() => void performSave()}
        title="Save inconsistent overtime?"
        message={
          <span>
            The entered hours (<strong>{manualHours} h</strong>) differ from the time span{' '}
            ({formatTime(form.startTime)} → {formatTime(form.endTime)} = {spanHours} h). The amount will use the entered hours ({currency(liveAmount ?? 0)}).
            Save anyway?
          </span>
        }
        confirmText="Save Anyway" danger={false}
      />
    </div>
  );
}