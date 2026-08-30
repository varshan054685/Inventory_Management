import React, { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Field, Modal, EmptyState, Pagination, ConfirmDialog, Spinner } from '@/components/ui';
import { Plus, Pencil, Trash2, Timer } from 'lucide-react';
import type { Overtime, Employee } from '@/shared/types';
import { currency, currentMonth, monthLabel } from '@/utils/format';

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

  const openCreate = () => { setEditing(null); setForm({ employeeId: '', date: `${month}-01`, startTime: '18:00', endTime: '20:00', hours: '', reason: '' }); setFe(''); setOpen(true); };
  const openEdit = (o: Overtime) => {
    setEditing(o);
    setForm({ employeeId: o.employeeId, date: o.date, startTime: o.startTime ?? '', endTime: o.endTime ?? '', hours: String(o.hours), reason: o.reason ?? '' });
    setFe(''); setOpen(true);
  };

  const hoursFromTimes = () => {
    const { startTime, endTime } = form;
    if (!startTime || !endTime) return null;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if ([sh, sm, eh, em].some((x) => Number.isNaN(x))) return null;
    const mins = eh * 60 + em - (sh * 60 + sm);
    return mins > 0 ? mins / 60 : null;
  };

  const save = async () => {
    if (!form.employeeId || !form.date) { setFe('Select employee and date'); return; }
    let hours = form.hours !== '' ? Number(form.hours) : hoursFromTimes();
    if (!hours || hours <= 0) { setFe('Enter overtime hours (or valid start/end times)'); return; }
    setFe('');
    try {
      const payload = { employeeId: Number(form.employeeId), date: form.date, startTime: form.startTime || null, endTime: form.endTime || null, hours, reason: form.reason || null };
      if (editing) await api.overtime.update(editing.id, payload);
      else await api.overtime.create(payload);
      toast.success(editing ? 'Overtime updated' : 'Overtime recorded');
      setOpen(false); refresh(); setListVersion((v) => v + 1);
    } catch (e) { toast.error((e as Error).message); }
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
            <input type="month" className="input w-44" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }} />
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
                      <td className="px-3 py-2.5 text-slate-500">{o.startTime ? `${o.startTime}–${o.endTime}` : '—'}</td>
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
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Start Time">
            <input type="time" className="input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
          </Field>
          <Field label="End Time">
            <input type="time" className="input" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          </Field>
          <Field label="OT Hours (auto from times if blank)">
            <input className="input" type="number" value={form.hours} placeholder={hoursFromTimes() ? String(hoursFromTimes()) : 'e.g. 2'} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          </Field>
          <Field label="Reason">
            <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
        </div>
        {fe && <p className="text-sm text-red-600 mt-3">{fe}</p>}
        <p className="text-xs text-slate-500 mt-3 flex items-center gap-1"><Timer className="w-3.5 h-3.5" /> Amount = Hours × Employee Overtime Rate (set in Staff).</p>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && doDelete(deleteTarget)} title="Delete overtime" message="This will remove the overtime amount from wage calculations." confirmText="Delete" danger />
    </div>
  );
}