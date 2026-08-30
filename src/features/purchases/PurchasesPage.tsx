import React, { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Field, Modal, EmptyState, Pagination, SearchInput, ConfirmDialog, Spinner } from '@/components/ui';
import { Plus, Pencil, Trash2, ShoppingCart, X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Purchase, PurchaseItem, RawMaterial } from '@/shared/types';
import { currency } from '@/utils/format';

const PAGE = 15;

export function PurchasesPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [listVersion, setListVersion] = useState(0);

  const { data, loading, error, refresh } = useData(
    () => api.purchases.list({ search, fromDate: fromDate || undefined, toDate: toDate || undefined, limit: PAGE, offset: (page - 1) * PAGE }),
    [search, fromDate, toDate, page, listVersion],
  );

  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>([]);
  useEffect(() => {
    void api.materials.list().then(setMaterials).catch(() => {});
    void api.suppliers.list().then((s) => setSuppliers(s)).catch(() => {});
  }, []);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [pform, setPform] = useState({
    purchaseDate: new Date().toISOString().slice(0, 10),
    supplierId: '',
    invoiceNo: '',
    notes: '',
    items: [] as { rawMaterialId: number | ''; unit: string; quantity: string; unitPrice: string }[],
  });
  const [itemErrors, setItemErrors] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Purchase | null>(null);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setPform({
      purchaseDate: new Date().toISOString().slice(0, 10),
      supplierId: '', invoiceNo: '', notes: '',
      items: [],
    });
    setItemErrors('');
    setOpen(true);
  };

  const openEdit = (p: Purchase) => {
    setEditing(p);
    setPform({
      purchaseDate: p.purchaseDate,
      supplierId: p.supplierId ? String(p.supplierId) : '',
      invoiceNo: p.invoiceNo ?? '',
      notes: p.notes ?? '',
      items: (p.items ?? []).map((i: PurchaseItem) => ({
        rawMaterialId: i.rawMaterialId,
        unit: i.unit,
        quantity: String(i.quantity),
        unitPrice: String(i.unitPrice),
      })),
    });
    setItemErrors('');
    setOpen(true);
  };

  const total = pform.items.reduce((sum, it) => {
    const q = Number(it.quantity); const p = Number(it.unitPrice);
    return sum + (q > 0 ? q * p : 0);
  }, 0);

  const addItem = () => {
    setPform((f) => ({ ...f, items: [...f.items, { rawMaterialId: '', unit: materials[0]?.unit ?? 'KG', quantity: '', unitPrice: '' }] }));
  };
  const updateItem = (idx: number, field: string, v: string | number) => {
    setPform((f) => {
      const items = f.items.map((it, i) => (i === idx ? { ...it, [field]: v } : it));
      return { ...f, items };
    });
  };
  const removeItem = (idx: number) => setPform((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const save = async () => {
    if (pform.items.length === 0) { setItemErrors('Add at least one item'); return; }
    for (const it of pform.items) {
      if (!it.rawMaterialId || !(Number(it.quantity) > 0) || Number(it.unitPrice) < 0) {
        setItemErrors('Each item needs a material, a quantity > 0 and a non-negative unit price');
        return;
      }
    }
    setItemErrors('');
    setSaving(true);
    try {
      const payload = {
        purchaseDate: pform.purchaseDate,
        supplierId: pform.supplierId ? Number(pform.supplierId) : null,
        invoiceNo: pform.invoiceNo || null,
        notes: pform.notes || null,
        items: pform.items.map((it) => ({
          rawMaterialId: Number(it.rawMaterialId),
          unit: it.unit,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
      };
      if (editing) await api.purchases.update(editing.id, payload);
      else await api.purchases.create(payload);
      toast.success(editing ? 'Purchase updated — stock adjusted' : 'Purchase saved — stock increased');
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async (p: Purchase) => {
    try {
      await api.purchases.del(p.id);
      toast.success('Purchase deleted — stock reversed');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const resetFilters = () => { setSearch(''); setFromDate(''); setToDate(''); setPage(1); };

  // Filter available materials to only materials (not products) — list all active
  const activeMaterials = materials;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="card-title">Purchase Records</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className="input w-40" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
            <span className="text-slate-400">to</span>
            <input type="date" className="input w-40" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search #/invoice/supplier" className="w-56" />
            <Button variant="secondary" onClick={resetFilters}>Reset</Button>
            <Button variant="primary" onClick={openCreate}><Plus className="w-4 h-4" /> New Purchase</Button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

        {loading && !data ? (
          <div className="h-40 flex items-center justify-center"><Spinner /></div>
        ) : !data || data.rows.length === 0 ? (
          <EmptyState message="No purchases found" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2 text-left table-head">#</th>
                    <th className="px-3 py-2 text-left table-head">Date</th>
                    <th className="px-3 py-2 text-left table-head">Supplier</th>
                    <th className="px-3 py-2 text-left table-head">Invoice</th>
                    <th className="px-3 py-2 text-left table-head">Items</th>
                    <th className="px-3 py-2 text-right table-head">Total</th>
                    <th className="px-3 py-2 text-right table-head">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((p) => (
                    <tr key={p.id} className="table-row-hover">
                      <td className="px-3 py-2.5 font-medium">{p.purchaseNo}</td>
                      <td className="px-3 py-2.5">{p.purchaseDate}</td>
                      <td className="px-3 py-2.5">{p.supplierName ?? '—'}</td>
                      <td className="px-3 py-2.5">{p.invoiceNo ?? '—'}</td>
                      <td className="px-3 py-2.5 font-mono">{p.items?.length ?? 0}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{currency(p.totalAmount)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button className="btn-ghost p-1.5" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></button>
                          <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteTarget(p)}><Trash2 className="w-4 h-4" /></button>
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

      {/* Purchase form modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit Purchase ${editing.purchaseNo}` : 'New Purchase'}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Purchase'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Field label="Purchase Date" required>
            <input type="date" className="input" value={pform.purchaseDate} onChange={(e) => setPform({ ...pform, purchaseDate: e.target.value })} />
          </Field>
          <Field label="Supplier">
            <select className="input" value={pform.supplierId} onChange={(e) => setPform({ ...pform, supplierId: e.target.value })}>
              <option value="">Select supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Invoice Number">
            <input className="input" value={pform.invoiceNo} onChange={(e) => setPform({ ...pform, invoiceNo: e.target.value })} />
          </Field>
          <Field label="Notes" className="md:col-span-3">
            <input className="input" value={pform.notes} onChange={(e) => setPform({ ...pform, notes: e.target.value })} />
          </Field>
        </div>

        <div className="text-sm font-semibold mb-2">Items</div>
        <div className="space-y-2">
          {pform.items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2 flex-wrap">
              <select className="input flex-1 min-w-36" value={it.rawMaterialId} onChange={(e) => updateItem(idx, 'rawMaterialId', Number(e.target.value))}>
                <option value="">— Select material —</option>
                {activeMaterials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select className="input w-24" value={it.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value)}>
                {['KG', 'PIECES', 'BOXES', 'BUNDLES', 'LITRES'].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <input className="input w-28" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} />
              <input className="input w-28" type="number" placeholder="Rate" value={it.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)} />
              <span className="text-sm text-slate-500 w-28 text-right font-medium">
                {currency((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))}
              </span>
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => removeItem(idx)}><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <Button variant="secondary" onClick={addItem}><Plus className="w-4 h-4" /> Add Item</Button>
        </div>
        {itemErrors && <p className="text-sm text-red-600 mt-2">{itemErrors}</p>}

        <div className="mt-4 flex justify-end items-center">
          <span className="text-sm text-slate-500 mr-2">Total:</span>
          <span className="text-xl font-bold text-slate-800 dark:text-white">{currency(total)}</span>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && doDelete(deleteTarget)}
        title="Delete purchase"
        message="Deleting this purchase will reverse its stock-in movements. This affects inventory. Continue?"
        confirmText="Delete"
        danger
      />
    </div>
  );
}

// re-export for clarity
export { ChevronLeft, ChevronRight, ShoppingCart };