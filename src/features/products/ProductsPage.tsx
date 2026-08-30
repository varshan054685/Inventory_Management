import React, { useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { MasterList } from '@/components/shared/MasterList';
import { Modal, Button, Field, StatusBadge, ConfirmDialog } from '@/components/ui';
import type { Product, Unit } from '@/shared/types';
import { UNITS } from '@/shared/constants';
import { currency } from '@/utils/format';

interface FormState {
  name: string;
  description: string;
  category: string;
  unit: Unit;
  sellingPrice: string;
  minStock: string;
  status: 'active' | 'inactive';
}

const empty: FormState = { name: '', description: '', category: '', unit: 'PIECES', sellingPrice: '', minStock: '0', status: 'active' };

export function ProductsPage() {
  const toast = useToast();
  const { data, loading, error, refresh } = useData(() => api.products.list(), []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setFieldErrors({});
    setOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? '',
      category: p.category ?? '',
      unit: p.unit,
      sellingPrice: p.sellingPrice != null ? String(p.sellingPrice) : '',
      minStock: String(p.minStock),
      status: p.status,
    });
    setFieldErrors({});
    setOpen(true);
  };

  const save = async () => {
    const fe: Record<string, string> = {};
    if (!form.name.trim()) fe.name = 'Name is required';
    if (form.sellingPrice !== '' && (Number(form.sellingPrice) < 0 || Number.isNaN(Number(form.sellingPrice)))) fe.sellingPrice = 'Invalid price';
    if (form.minStock !== '' && (Number(form.minStock) < 0 || Number.isNaN(Number(form.minStock)))) fe.minStock = 'Invalid minimum stock';
    setFieldErrors(fe);
    if (Object.keys(fe).length) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        category: form.category || null,
        unit: form.unit,
        sellingPrice: form.sellingPrice === '' ? null : Number(form.sellingPrice),
        minStock: Number(form.minStock || 0),
        status: form.status,
      };
      if (editing) await api.products.update(editing.id, payload);
      else await api.products.create(payload);
      toast.success(editing ? 'Product updated' : 'Product created');
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (p: Product) => {
    try {
      await api.products.status(p.id, p.status === 'active' ? 'inactive' : 'active');
      toast.success('Status updated');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doDelete = async (p: Product) => {
    try {
      await api.products.del(p.id);
      toast.success('Product deleted');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div>
      <MasterList<Product>
        title="Products"
        subtitle="Manage finished product master records"
        searchPlaceholder="Search products…"
        columns={[
          { key: 'name', header: 'Product', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'category', header: 'Category' },
          { key: 'unit', header: 'Unit' },
          { key: 'sellingPrice', header: 'Selling Price', render: (r) => currency(r.sellingPrice) },
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
        emptyMessage="No products yet. Click Add to create one."
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit Product' : 'New Product'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Product Name" required error={fieldErrors.name} className="md:col-span-2">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Category">
            <input className="input" value={form.category} placeholder="e.g. Candy, Toffee" onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </Field>
          <Field label="Unit" required>
            <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as Unit })}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Selling Price" error={fieldErrors.sellingPrice}>
            <input className="input" type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
          </Field>
          <Field label="Minimum Stock Level" error={fieldErrors.minStock}>
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