import React, { useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { MasterList } from '@/components/shared/MasterList';
import { Modal, Button, Field, StatusBadge } from '@/components/ui';
import type { Employee } from '@/shared/types';
import { currency } from '@/utils/format';
import { DatePicker } from '@/components/ui/calendar';

interface FormState {
  name: string; contactNumber: string; address: string; joiningDate: string;
  dailyWage: string; halfDayWage: string; overtimeRate: string; status: 'active' | 'inactive';
}
const empty: FormState = { name: '', contactNumber: '', address: '', joiningDate: '', dailyWage: '', halfDayWage: '', overtimeRate: '', status: 'active' };

export function StaffPage() {
  const toast = useToast();
  const { data, loading, error, refresh } = useData(() => api.employees.list(), []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [fe, setFe] = useState<Record<string, string>>({});

  const openCreate = () => { setEditing(null); setForm(empty); setFe({}); setOpen(true); };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({ name: e.name, contactNumber: e.contactNumber ?? '', address: e.address ?? '', joiningDate: e.joiningDate ?? '', dailyWage: String(e.dailyWage), halfDayWage: String(e.halfDayWage), overtimeRate: String(e.overtimeRate), status: e.status });
    setFe({});
    setOpen(true);
  };

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name required';
    if (Number(form.dailyWage) < 0 || Number(form.halfDayWage) < 0 || Number(form.overtimeRate) < 0) errs.wage = 'Wages cannot be negative';
    setFe(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const payload = { name: form.name, contactNumber: form.contactNumber || null, address: form.address || null, joiningDate: form.joiningDate || null, dailyWage: Number(form.dailyWage || 0), halfDayWage: Number(form.halfDayWage || 0), overtimeRate: Number(form.overtimeRate || 0), status: form.status };
      if (editing) await api.employees.update(editing.id, payload);
      else await api.employees.create(payload);
      toast.success(editing ? 'Employee updated' : 'Employee created');
      setOpen(false); refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (e: Employee) => {
    try { await api.employees.status(e.id, e.status === 'active' ? 'inactive' : 'active'); toast.success('Status updated'); refresh(); }
    catch (err) { toast.error((err as Error).message); }
  };

  const doDelete = async (e: Employee) => {
    try { await api.employees.del(e.id); toast.success('Employee deleted'); refresh(); }
    catch (err) { toast.error((err as Error).message); }
  };

  return (
    <div>
      <MasterList<Employee>
        title="Staff"
        subtitle="Manage employees and their wage rates"
        searchPlaceholder="Search staff…"
        columns={[
          { key: 'name', header: 'Employee', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'contactNumber', header: 'Contact', render: (r) => r.contactNumber || '—' },
          { key: 'dailyWage', header: 'Daily Wage', render: (r) => currency(r.dailyWage) },
          { key: 'halfDayWage', header: 'Half-Day Wage', render: (r) => currency(r.halfDayWage) },
          { key: 'overtimeRate', header: 'OT Rate/hr', render: (r) => currency(r.overtimeRate) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={data ?? []}
        loading={loading}
        error={error}
        onCreate={openCreate}
        onEdit={openEdit}
        onDelete={doDelete}
        onToggleStatus={toggleStatus}
        emptyMessage="No staff yet."
      />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Employee' : 'New Employee'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Employee Name" required error={fe.name} className="md:col-span-2">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Contact Number"><input className="input" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} /></Field>
          <Field label="Joining Date"><DatePicker value={form.joiningDate} onChange={(v) => setForm({ ...form, joiningDate: v })} /></Field>
          <Field label="Daily Wage" required error={fe.wage}><input className="input" type="number" value={form.dailyWage} onChange={(e) => setForm({ ...form, dailyWage: e.target.value })} /></Field>
          <Field label="Half-Day Wage"><input className="input" type="number" value={form.halfDayWage} onChange={(e) => setForm({ ...form, halfDayWage: e.target.value })} /></Field>
          <Field label="Overtime Rate (₹/hr)"><input className="input" type="number" value={form.overtimeRate} onChange={(e) => setForm({ ...form, overtimeRate: e.target.value })} /></Field>
          <Field label="Status">
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Address" className="md:col-span-2"><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}