import React, { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Field, Modal, EmptyState, StatusBadge, ConfirmDialog } from '@/components/ui';
import { Plus, Pencil, Trash2, X, BookOpen } from 'lucide-react';
import type { Recipe, Product, RawMaterial, RecipeItem, Unit } from '@/shared/types';
import { number } from '@/utils/format';

interface ItemDraft { rawMaterialId: number | ''; quantity: string; unit: Unit; }
const emptyForm = { productId: '' as number | '', outputQuantity: '1000', outputUnit: 'PIECES' as Unit, items: [] as ItemDraft[] };

export function RecipesPage() {
  const toast = useToast();
  const { data, loading, error, refresh } = useData(() => api.recipes.list(), []);
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  useEffect(() => {
    void api.products.list().then(setProducts).catch(() => {});
    void api.materials.list().then(setMaterials).catch(() => {});
  }, [refresh]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fe, setFe] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFe(''); setOpen(true); };
  const openEdit = (r: Recipe) => {
    setEditing(r);
    setForm({ productId: r.productId, outputQuantity: String(r.outputQuantity), outputUnit: r.outputUnit, items: (r.items ?? []).map((it: RecipeItem) => ({ rawMaterialId: it.rawMaterialId, quantity: String(it.quantity), unit: it.unit })) });
    setFe('');
    setOpen(true);
  };

  const setP = (v: number | '' | string, fallback?: Unit) => {
    setForm((f) => ({ ...f, productId: v === '' ? '' : Number(v) }));
    const p = products.find((x) => x.id === Number(v));
    if (p) setForm((f) => ({ ...f, productId: Number(v), outputUnit: p.unit }));
  };

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { rawMaterialId: '', quantity: '', unit: 'KG' as Unit }] }));
  const updateItem = (idx: number, field: string, v: string | number) =>
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, [field]: v } : it)) }));
  const removeItem = (idx: number) => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const save = async () => {
    if (!form.productId) { setFe('Select a product'); return; }
    if (!form.items.length) { setFe('Add at least one material'); return; }
    if (form.items.some((it) => !it.rawMaterialId || !(Number(it.quantity) > 0))) {
      setFe('Each item needs a material and quantity > 0');
      return;
    }
    setFe('');
    try {
      const payload = { productId: Number(form.productId), name: 'Recipe', outputQuantity: Number(form.outputQuantity) || 1, outputUnit: form.outputUnit, items: form.items.map((it) => ({ rawMaterialId: Number(it.rawMaterialId), quantity: Number(it.quantity), unit: it.unit })) };
      if (editing) await api.recipes.update(editing.id, payload);
      else await api.recipes.create(payload);
      toast.success(editing ? 'Recipe updated' : 'Recipe created');
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doDelete = async (r: Recipe) => {
    try { await api.recipes.del(r.id); toast.success('Recipe deleted'); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="card-title">Recipes / Bill of Materials</h2>
            <p className="text-sm text-slate-500 mt-0.5">Define the raw materials needed to produce each product.</p>
          </div>
          <Button variant="primary" onClick={openCreate}><Plus className="w-4 h-4" /> New Recipe</Button>
        </div>

        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        {loading && !data ? <EmptyState message="Loading…" /> : !data || data.length === 0 ? (
          <EmptyState message="No recipes yet. Add a recipe before recording production." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-brand-500" />
                    <span className="font-semibold text-slate-800 dark:text-white">{r.productName}</span>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-xs text-slate-500 mb-2">Output: {number(r.outputQuantity)} {r.outputUnit}</div>
                <ul className="text-sm space-y-1">
                  {(r.items ?? []).map((it) => (
                    <li key={it.id} className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>{it.rawMaterialName}</span>
                      <span className="font-mono">{number(it.quantity)} {it.unit}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-end gap-1">
                  <button className="btn-ghost p-1.5" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></button>
                  <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteTarget(r)}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editing ? 'Edit Recipe' : 'New Recipe'}
        size="xl"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save Recipe</Button></>}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Field label="Product" required>
            <select className="input" value={form.productId} onChange={(e) => setP(e.target.value)}>
              <option value="">Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Output Quantity" required>
            <input className="input" type="number" value={form.outputQuantity} onChange={(e) => setForm({ ...form, outputQuantity: e.target.value })} />
          </Field>
          <Field label="Output Unit" required>
            <select className="input" value={form.outputUnit} onChange={(e) => setForm({ ...form, outputUnit: e.target.value as Unit })}>
              {['KG', 'PIECES', 'BOXES', 'BUNDLES', 'LITRES'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
        </div>

        <div className="text-sm font-semibold mb-2">Materials required for the output above</div>
        <div className="space-y-2">
          {form.items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2 flex-wrap">
              <select className="input flex-1 min-w-40" value={it.rawMaterialId} onChange={(e) => updateItem(idx, 'rawMaterialId', Number(e.target.value))}>
                <option value="">— Select material —</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input className="input w-24" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} />
              <select className="input w-24" value={it.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value)}>
                {['KG', 'PIECES', 'BOXES', 'BUNDLES', 'LITRES'].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => removeItem(idx)}><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <div className="mt-2"><Button variant="secondary" onClick={addItem}><Plus className="w-4 h-4" /> Add Material</Button></div>
        {fe && <p className="text-sm text-red-600 mt-2">{fe}</p>}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && doDelete(deleteTarget)}
        title="Delete recipe" message="Deleting this recipe will not affect production history, but production can no longer scale it." confirmText="Delete" danger
      />
    </div>
  );
}