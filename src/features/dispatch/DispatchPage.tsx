import React, { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Field, Modal, EmptyState, Pagination, ConfirmDialog, Spinner } from '@/components/ui';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { Dispatch, Product } from '@/shared/types';
import { currency, number } from '@/utils/format';

const PAGE = 15;

export function DispatchPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [listVersion, setListVersion] = useState(0);
  const { data, loading, error, refresh } = useData(
    () => api.dispatch.list({ search, fromDate: fromDate || undefined, toDate: toDate || undefined, limit: PAGE, offset: (page - 1) * PAGE }),
    [search, fromDate, toDate, page, listVersion],
  );
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => { void api.products.list().then(setProducts).catch(() => {}); }, []);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dispatch | null>(null);
  const [form, setForm] = useState({ productId: '' as number | '', quantity: '', vehicleNumber: '', location: '', receiver: '', notes: '', unitPrice: '' });
  const [available, setAvailable] = useState<{ available: number; unit: string } | null>(null);
  const [fe, setFe] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Dispatch | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ productId: '', quantity: '', vehicleNumber: '', location: '', receiver: '', notes: '', unitPrice: '' });
    setAvailable(null); setFe(''); setOpen(true);
  };
  const openEdit = (d: Dispatch) => {
    setEditing(d);
    setForm({ productId: d.productId, quantity: String(d.quantity), vehicleNumber: d.vehicleNumber ?? '', location: d.location ?? '', receiver: d.receiver ?? '', notes: d.notes ?? '', unitPrice: String(d.totalAmount && d.quantity ? d.totalAmount / d.quantity : '') });
    setFe(''); setOpen(true);
    void api.dispatch.availability(d.productId).then((a) => setAvailable(a)).catch(() => {});
  };

  const onProductChange = async (id: number) => {
    setForm((f) => ({ ...f, productId: id }));
    try {
      const a = await api.dispatch.availability(id);
      setAvailable(a);
    } catch {
      setAvailable(null);
    }
  };

  const save = async () => {
    if (!form.productId || !(Number(form.quantity) > 0)) { setFe('Select a product and enter a quantity > 0'); return; }
    setFe('');
    try {
      const payload = { productId: Number(form.productId), quantity: Number(form.quantity), vehicleNumber: form.vehicleNumber || null, location: form.location || null, receiver: form.receiver || null, notes: form.notes || null, unitPrice: form.unitPrice ? Number(form.unitPrice) : null, dispatchDate: new Date().toISOString().slice(0, 10) };
      if (editing) await api.dispatch.update(editing.id, payload);
      else await api.dispatch.create(payload);
      toast.success(editing ? 'Dispatch updated — stock adjusted' : 'Dispatch saved — stock deducted');
      setOpen(false); refresh(); setListVersion((v) => v + 1);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doDelete = async (d: Dispatch) => {
    try { await api.dispatch.del(d.id); toast.success('Dispatch deleted — stock restored'); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="card-title">Dispatch Records</h2>
            <p className="text-sm text-slate-500 mt-0.5">Dispatch deducts finished product stock.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" className="input w-40" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
            <span className="text-slate-400">to</span>
            <input type="date" className="input w-40" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
            <input className="input w-52" placeholder="Search #/product/vehicle" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            <Button variant="primary" onClick={openCreate}><Plus className="w-4 h-4" /> New Dispatch</Button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        {loading && !data ? <div className="h-32 flex items-center justify-center"><Spinner /></div> : !data || data.rows.length === 0 ? <EmptyState message="No dispatch records" /> : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base w-full">
                <thead><tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2 text-left table-head">#</th>
                  <th className="px-3 py-2 text-left table-head">Date</th>
                  <th className="px-3 py-2 text-left table-head">Product</th>
                  <th className="px-3 py-2 text-right table-head">Qty</th>
                  <th className="px-3 py-2 text-left table-head">Vehicle</th>
                  <th className="px-3 py-2 text-left table-head">Location</th>
                  <th className="px-3 py-2 text-left table-head">Receiver</th>
                  <th className="px-3 py-2 text-right table-head">Amount</th>
                  <th className="px-3 py-2 text-right table-head">Actions</th>
                </tr></thead>
                <tbody>
                  {data.rows.map((d) => (
                    <tr key={d.id} className="table-row-hover">
                      <td className="px-3 py-2.5 font-medium">{d.dispatchNo}</td>
                      <td className="px-3 py-2.5">{d.dispatchDate}</td>
                      <td className="px-3 py-2.5">{d.productName}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{number(d.quantity)}</td>
                      <td className="px-3 py-2.5">{d.vehicleNumber ?? '—'}</td>
                      <td className="px-3 py-2.5">{d.location ?? '—'}</td>
                      <td className="px-3 py-2.5">{d.receiver ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right">{d.totalAmount ? currency(d.totalAmount) : '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button className="btn-ghost p-1.5" onClick={() => openEdit(d)}><Pencil className="w-4 h-4" /></button>
                          <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteTarget(d)}><Trash2 className="w-4 h-4" /></button>
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Dispatch' : 'New Dispatch'}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save Dispatch</Button></>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Product" required>
            <select className="input" value={form.productId} onChange={(e) => onProductChange(Number(e.target.value))}>
              <option value="">Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Quantity" required>
            <input className="input" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          <Field label="Vehicle Number">
            <input className="input" value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} />
          </Field>
          <Field label="Dispatch Location (optional)">
            <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
          <Field label="Customer / Receiver (optional)">
            <input className="input" value={form.receiver} onChange={(e) => setForm({ ...form, receiver: e.target.value })} />
          </Field>
          <Field label="Selling Price / Unit (optional)">
            <input className="input" type="number" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>

        {available && Number(form.productId) > 0 && (
          <div className={`mt-3 text-sm rounded-md p-3 ${Number(form.quantity) > available.available ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-200' : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 text-emerald-700 dark:text-emerald-300'}`}>
            Available stock: <strong>{number(available.available)} {available.unit}</strong>
            {Number(form.quantity) > available.available && <span> — Requested {form.quantity} exceeds available.</span>}
          </div>
        )}
        {fe && <p className="text-sm text-red-600 mt-3">{fe}</p>}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && doDelete(deleteTarget)} title="Delete dispatch" message="Deleting this dispatch restores the deducted stock. Continue?" confirmText="Delete" danger />
    </div>
  );
}