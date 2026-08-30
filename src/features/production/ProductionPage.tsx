import React, { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Field, Modal, EmptyState, Pagination, ConfirmDialog, Spinner } from '@/components/ui';
import { Plus, Trash2, Factory, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { Production, Product } from '@/shared/types';
import { currency, number } from '@/utils/format';

const PAGE = 15;

export function ProductionPage() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [listVersion, setListVersion] = useState(0);
  const { data, loading, error, refresh } = useData(
    () => api.production.list({ limit: PAGE, offset: (page - 1) * PAGE }),
    [page, listVersion],
  );

  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => { void api.products.list().then(setProducts).catch(() => {}); }, []);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ productId: '' as number | '', units: '', costPerUnit: '', notes: '' });
  const [preview, setPreview] = useState<{ materials: Array<{ rawMaterialId: number; name: string; unit: string; required: number; available: number }>; insufficient: boolean; totalCost: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Production | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedProduct = products.find((p) => p.id === Number(form.productId));

  const runPreview = async () => {
    if (!form.productId || !(Number(form.units) > 0)) return;
    setPreviewLoading(true);
    try {
      const res = await api.production.preview({ productId: Number(form.productId), units: Number(form.units), costPerUnit: Number(form.costPerUnit || 0) });
      setPreview(res);
    } catch (e) {
      toast.error((e as Error).message);
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(runPreview, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.productId, form.units, form.costPerUnit]);

  const save = async () => {
    if (!form.productId || !(Number(form.units) > 0)) { toast.error('Select a product and enter units'); return; }
    if (preview?.insufficient) { toast.error('Cannot produce: raw material stock is insufficient. Check the list below or enable negative stock in Settings.'); return; }
    setSaving(true);
    try {
      await api.production.create({ productId: Number(form.productId), units: Number(form.units), costPerUnit: Number(form.costPerUnit || 0), notes: form.notes || null, productionDate: new Date().toISOString().slice(0, 10) });
      toast.success('Production completed — finished stock increased');
      setOpen(false);
      setForm({ productId: '', units: '', costPerUnit: '', notes: '' });
      setPreview(null);
      refresh();
      setListVersion((v) => v + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const doCancel = async (p: Production) => {
    try {
      await api.production.cancel(p.id);
      toast.success('Production cancelled — stock reversed');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="card-title">Production Records</h2>
            <p className="text-sm text-slate-500 mt-0.5">When production is saved, raw materials are deducted via the recipe and finished goods are added.</p>
          </div>
          <Button variant="primary" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Record Production</Button>
        </div>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        {loading && !data ? <div className="h-40 flex items-center justify-center"><Spinner /></div> : !data || data.rows.length === 0 ? <EmptyState message="No production records yet" /> : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2 table-head">#</th>
                    <th className="px-3 py-2 table-head">Date</th>
                    <th className="px-3 py-2 table-head">Product</th>
                    <th className="px-3 py-2 text-right table-head">Units</th>
                    <th className="px-3 py-2 text-right table-head">Cost/Unit</th>
                    <th className="px-3 py-2 text-right table-head">Total Cost</th>
                    <th className="px-3 py-2 text-right table-head">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((p) => (
                    <tr key={p.id} className="table-row-hover">
                      <td className="px-3 py-2.5 font-medium">{p.productionNo}</td>
                      <td className="px-3 py-2.5">{p.productionDate}</td>
                      <td className="px-3 py-2.5">{p.productName}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{number(p.units)}</td>
                      <td className="px-3 py-2.5 text-right">{currency(p.costPerUnit)}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{currency(p.totalCost)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button className="btn-ghost p-1.5 text-red-500" onClick={() => setCancelTarget(p)}><Trash2 className="w-4 h-4" /></button>
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

      <Modal
        open={open} onClose={() => setOpen(false)}
        title="Record Production"
        size="xl"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save} disabled={saving || preview?.insufficient}><Factory className="w-4 h-4" /> {saving ? 'Processing…' : 'Confirm Production'}</Button></>}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Product" required>
            <select className="input" value={form.productId} onChange={(e) => setForm({ ...form, productId: Number(e.target.value) })}>
              <option value="">Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Number of Units" required>
            <input className="input" type="number" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
          </Field>
          <Field label="Production Cost / Unit">
            <input className="input" type="number" value={form.costPerUnit} placeholder="e.g. 2.50" onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} />
          </Field>
          <Field label="Notes" className="md:col-span-3">
            <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>

        {selectedProduct && (
          <>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">Recipe Requirement (for {number(Number(form.units) || 0)} {selectedProduct.unit})</span>
                {previewLoading && <Spinner />}
              </div>
              {preview ? (
                preview.insufficient ? (
                  <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-3 flex gap-2 items-start">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div className="text-sm text-red-700 dark:text-red-200">
                      Insufficient raw material stock. Either purchase more materials or enable <strong>negative stock</strong> in Settings.
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 items-start text-sm text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-5 h-5" /> All raw materials available.
                  </div>
                )
              ) : (
                <div className="text-sm text-slate-400">Enter units to see required materials.</div>
              )}

              {/* Materials table */}
              {preview && (
                <table className="table-base w-full mt-3">
                  <thead><tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-1.5 text-left table-head">Material</th>
                    <th className="px-3 py-1.5 text-right table-head">Required</th>
                    <th className="px-3 py-1.5 text-right table-head">Available</th>
                    <th className="px-3 py-1.5 text-right table-head">Status</th>
                  </tr></thead>
                  <tbody>
                    {preview.materials.map((m) => (
                      <tr key={m.rawMaterialId}>
                        <td className="px-3 py-1.5">{m.name}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{number(m.required)} {m.unit}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{number(m.available)}</td>
                        <td className="px-3 py-1.5 text-right">
                          {m.required > m.available ? <span className="badge badge-danger">Short</span> : <span className="badge badge-success">OK</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {preview && (
                <div className="mt-3 flex justify-end items-center">
                  <span className="text-sm text-slate-500 mr-2">Total Production Cost:</span>
                  <span className="text-xl font-bold">{Number(form.units) > 0 && Number(form.costPerUnit) > 0 ? currency(Number(form.units) * Number(form.costPerUnit)) : 'Enter cost/unit'}</span>
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget} onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && doCancel(cancelTarget)}
        title="Cancel production"
        message="Cancelling this production will reverse its raw material and finished goods stock movements. Continue?"
        confirmText="Cancel Production" danger
      />
    </div>
  );
}