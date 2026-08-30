import React, { useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { MasterList } from '@/components/shared/MasterList';
import { Modal, Button, Field, StatusBadge } from '@/components/ui';
import type { Supplier } from '@/shared/types';

interface FormState {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  gstNumber: string;
  notes: string;
  status: 'active' | 'inactive';
}
const empty: FormState = { name: '', contactPerson: '', phone: '', email: '', address: '', gstNumber: '', notes: '', status: 'active' };

export function SuppliersPage() {
  const toast = useToast();
  const { data, loading, error, refresh } = useData(() => api.suppliers.list(), []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditing(null); setForm(empty); setFe({}); setOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, contactPerson: s.contactPerson ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '', gstNumber: s.gstNumber ?? '', notes: s.notes ?? '', status: s.status });
    setFe({});
    setOpen(true);
  };

  const save = async () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Invalid email';
    setFe(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const payload = { name: form.name, contactPerson: form.contactPerson || null, phone: form.phone || null, email: form.email || null, address: form.address || null, gstNumber: form.gstNumber || null, notes: form.notes || null, status: form.status };
      if (editing) await api.suppliers.update(editing.id, payload);
      else await api.suppliers.create(payload);
      toast.success(editing ? 'Supplier updated' : 'Supplier created');
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (s: Supplier) => {
    try { await api.suppliers.status(s.id, s.status === 'active' ? 'inactive' : 'active'); toast.success('Status updated'); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const doDelete = async (s: Supplier) => {
    try { await api.suppliers.del(s.id); toast.success('Supplier deleted'); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div>
      <MasterList<Supplier>
        title="Suppliers"
        subtitle="Manage raw material suppliers"
        searchPlaceholder="Search suppliers…"
        columns={[
          { key: 'name', header: 'Supplier', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'contactPerson', header: 'Contact Person', render: (r) => r.contactPerson || '—' },
          { key: 'phone', header: 'Phone', render: (r) => r.phone || '—' },
          { key: 'email', header: 'Email', render: (r) => r.email || '—' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={data ?? []}
        loading={loading}
        error={error}
        onCreate={openCreate}
        onEdit={openEdit}
        onDelete={doDelete}
        onToggleStatus={toggleStatus}
        emptyMessage="No suppliers yet."
      />

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editing ? 'Edit Supplier' : 'New Supplier'}
        size="lg"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Supplier Name" required error={fe.name} className="md:col-span-2">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Contact Person"><input className="input" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email" error={fe.email}><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="GST Number"><input className="input" value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} /></Field>
          <Field label="Address" className="md:col-span-2"><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Notes" className="md:col-span-2"><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <Field label="Status" className="md:col-span-2">
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}