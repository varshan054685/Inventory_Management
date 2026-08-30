import React, { useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { MasterList } from '@/components/shared/MasterList';
import { Modal, Button, Field, StatusBadge } from '@/components/ui';
import type { RawMaterial, Unit } from '@/shared/types';
import { UNITS } from '@/shared/constants';
import { number } from '@/utils/format';

interface FormState {
  name: string;
  description: string;
  unit: Unit;
  minStock: string;
  status: 'active' | 'inactive';
}
const empty: FormState = { name: '', description: '', unit: 'KG', minStock: '0', status: 'active' };

export function RawMaterialsPage() {
  const toast = useToast();
  const { data, loading, error, refresh } = useData(async () => {
    const materials = await api.materials.list();
    const balances = await Promise.all(
      materials.map(async (m) => {
        try {
          return { id: m.id, balance: await api.stock.itemBalance('RAW', m.id) };
        } catch {
          return { id: m.id, balance: 0 };
        }
      }),
    );
    const map = new Map(balances.map((b) => [b.id, b.balance]));
    return materials.map((m) => ({ ...m, currentStock: map.get(m.id) ?? 0 }));
  }, []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [fe, setFe] = useState<Record<string, string>>({});

  const openCreate = () => { setEditing(null); setForm(empty); setFe({}); setOpen(true); };
  const openEdit = (m: RawMaterial) => {
    setEditing(m);
    setForm({ name: m.name, description: m.description ?? '', unit: m.unit, minStock: String(m.minStock), status: m.status });
    setFe({});
    setOpen(true);
  };

  const save = async () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required';
    if (form.minStock !== '' && Number.isNaN(Number(form.minStock))) errors.minStock = 'Invalid value';
    setFe(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const payload = { name: form.name, description: form.description || null, unit: form.unit, minStock: Number(form.minStock || 0), status: form.status };
      if (editing) await api.materials.update(editing.id, payload);
      else await api.materials.create(payload);
      toast.success(editing ? 'Material updated' : 'Material created');
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (m: RawMaterial) => {
    try {
      await api.materials.status(m.id, m.status === 'active' ? 'inactive' : 'active');
      toast.success('Status updated');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doDelete = async (m: RawMaterial) => {
    try {
      await api.materials.del(m.id);
      toast.success('Material deleted');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <MasterList<RawMaterial & { currentStock?: number }>
        title="Raw Materials"
        subtitle="Manage materials consumed in production. Stock is updated automatically through purchases and production."
        searchPlaceholder="Search materials…"
        columns={[
          { key: 'name', header: 'Material', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'unit', header: 'Unit' },
          { key: 'currentStock', header: 'Current Stock', render: (r) => <span className="font-mono">{number(r.currentStock ?? 0)} {r.unit}</span> },
          { key: 'minStock', header: 'Min Stock' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={data ?? []}
        loading={loading}
        error={error}
        onCreate={openCreate}
        onEdit={openEdit}
        onDelete={doDelete}
        onToggleStatus={toggleStatus}
        emptyMessage="No materials yet. Click Add to create one."
      />

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editing ? 'Edit Raw Material' : 'New Raw Material'}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Material Name" required error={fe.name} className="md:col-span-2">
            <input className="input" value={form.name} placeholder="e.g. Sugar, Glucose, Flavor" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Unit" required>
            <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as Unit })}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Minimum Stock Level" error={fe.minStock}>
            <input className="input" type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
          </Field>
          <Field label="Status" className="md:col-span-2">
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Description" className="md:col-span-2">
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}