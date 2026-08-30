import React, { useMemo, useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Field, Modal, EmptyState, Pagination, Spinner, ConfirmDialog } from '@/components/ui';
import { Plus, Boxes, Package } from 'lucide-react';
import { number, currency } from '@/utils/format';

type StockRow = {
  itemType: 'RAW' | 'FINISHED';
  itemId: number;
  name: string;
  unit: string;
  closing: number;
  minStock: number;
  status: string;
};

const PAGE = 20;

export function StockPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<'ALL' | 'RAW' | 'FINISHED'>('ALL');
  const { data, loading, error, refresh } = useData(
    () => api.reports.call<StockRow[]>('reports.currentStock', { type: filter }),
    [filter],
  );

  const [movements, setMovements] = useState<Array<Record<string, unknown>>>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movPage, setMovPage] = useState(1);
  const [movementType, setMovementType] = useState('ALL');

  const loadMovements = (type = movementType, pg = movPage) => {
    setMovementsLoading(true);
    void api.reports
      .call<{ rows: Array<Record<string, unknown>>; total: number }>('reports.stockMovement', { type, limit: PAGE, offset: (pg - 1) * PAGE })
      .then((r) => {
        setMovements(r.rows);
        setMovementsTotal(r.total);
      })
      .catch(() => setMovements([]))
      .finally(() => setMovementsLoading(false));
  };
  const [movementsTotal, setMovementsTotal] = useState(0);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjForm, setAdjForm] = useState({ itemType: 'RAW' as 'RAW' | 'FINISHED', itemId: '' as number | '', quantity: '', unit: 'KG', notes: '' });
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<{ itemType: StockRow['itemType']; itemId: number; name: string } | null>(null);

  const allRows = data ?? [];
  const materials = allRows.filter((r) => r.itemType === 'RAW');
  const products = allRows.filter((r) => r.itemType === 'FINISHED');

  const selectable = adjForm.itemType === 'RAW' ? materials : products;

  const saveAdjust = async () => {
    if (!adjForm.itemId || !adjForm.quantity || Number(adjForm.quantity) === 0) {
      toast.error('Choose an item and enter a non-zero quantity');
      return;
    }
    try {
      await api.adjustments.create({ itemType: adjForm.itemType, itemId: Number(adjForm.itemId), quantity: Number(adjForm.quantity), unit: adjForm.unit, notes: adjForm.notes || null });
      toast.success('Stock adjusted');
      setAdjustOpen(false);
      setAdjForm({ itemType: 'RAW', itemId: '', quantity: '', unit: 'KG', notes: '' });
      refresh();
      loadMovements();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const movementTypeLabel = (t: string) => {
    const map: Record<string, string> = {
      PURCHASE_IN: 'Purchase In', PRODUCTION_RAW_MATERIAL_OUT: 'Raw Out (Prod)', PRODUCTION_FINISHED_IN: 'Finished In (Prod)', DISPATCH_OUT: 'Dispatch Out', ADJUSTMENT_IN: 'Adjust In', ADJUSTMENT_OUT: 'Adjust Out',
    };
    return map[t] ?? t;
  };

  return (
    <div className="space-y-4">
      {/* Current stock */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="card-title">Current Stock</h2>
            <p className="text-sm text-slate-500 mt-0.5">Derived from stock movements.</p>
          </div>
          <div className="flex items-center gap-2">
            <select className="input w-40" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="ALL">All Items</option>
              <option value="RAW">Raw Materials</option>
              <option value="FINISHED">Finished Products</option>
            </select>
            <Button variant="primary" onClick={() => setAdjustOpen(true)}><Plus className="w-4 h-4" /> Adjust Stock</Button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        {loading && !data ? <div className="h-40 flex items-center justify-center"><Spinner /></div> : allRows.length === 0 ? <EmptyState message="No stock items" /> : (
          <div className="overflow-x-auto">
            <table className="table-base w-full">
              <thead><tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2 text-left table-head">Type</th>
                <th className="px-3 py-2 text-left table-head">Item</th>
                <th className="px-3 py-2 text-left table-head">Unit</th>
                <th className="px-3 py-2 text-right table-head">Current Stock</th>
                <th className="px-3 py-2 text-right table-head">Min Stock</th>
                <th className="px-3 py-2 text-left table-head">Status</th>
                <th className="px-3 py-2 text-right table-head">View</th>
              </tr></thead>
              <tbody>
                {allRows.map((r) => (
                  <tr key={`${r.itemType}-${r.itemId}`} className="table-row-hover">
                    <td className="px-3 py-2.5">{r.itemType === 'RAW' ? <span className="flex items-center gap-1"><Boxes className="w-3.5 h-3.5 text-sky-500" /> Raw</span> : <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5 text-brand-500" /> Finished</span>}</td>
                    <td className="px-3 py-2.5 font-medium">{r.name}</td>
                    <td className="px-3 py-2.5">{r.unit}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${r.closing <= r.minStock ? 'text-red-600 font-semibold' : ''}`}>{number(r.closing)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-500">{number(r.minStock)}</td>
                    <td className="px-3 py-2.5">{r.closing <= r.minStock ? <span className="badge badge-danger">Low</span> : <span className="badge badge-success">OK</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Button variant="ghost" onClick={() => { setDetail({ itemType: r.itemType, itemId: r.itemId, name: r.name }); setDetailOpen(true); }}>Ledger</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Stock movements */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title">Stock Movements</h2>
          <select className="input w-52" value={movementType} onChange={(e) => { setMovementType(e.target.value); setMovPage(1); loadMovements(e.target.value, 1); }}>
            <option value="ALL">All types</option>
            <option value="RAW">Raw materials</option>
            <option value="FINISHED">Finished products</option>
          </select>
        </div>
        {movementsLoading && !movements.length ? <div className="h-32 flex items-center justify-center"><Spinner /></div> : movements.length === 0 ? (
          <EmptyState message="No movements yet" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base w-full">
                <thead><tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2 text-left table-head">Date</th>
                  <th className="px-3 py-2 text-left table-head">Item</th>
                  <th className="px-3 py-2 text-left table-head">Type</th>
                  <th className="px-3 py-2 text-right table-head">Qty</th>
                  <th className="px-3 py-2 text-left table-head">Movement</th>
                  <th className="px-3 py-2 text-left table-head">Notes</th>
                </tr></thead>
                <tbody>
                  {movements.map((m: Record<string, unknown>) => (
                    <tr key={String(m.id)} className="table-row-hover">
                      <td className="px-3 py-2.5">{String(m.date)}</td>
                      <td className="px-3 py-2.5">{String(m.itemName || '—')}</td>
                      <td className="px-3 py-2.5">{m.itemType === 'RAW' ? 'Raw' : 'Finished'}</td>
                      <td className={`px-3 py-2.5 text-right font-mono ${Number(m.quantity) > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{Number(m.quantity) > 0 ? '+' : ''}{number(Number(m.quantity))}</td>
                      <td className="px-3 py-2.5"><span className="badge badge-neutral">{movementTypeLabel(String(m.movementType))}</span></td>
                      <td className="px-3 py-2.5 text-slate-500">{String(m.notes || '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={movPage} pageSize={PAGE} total={movementsTotal} onChange={(pg) => { setMovPage(pg); loadMovements(movementType, pg); }} />
          </>
        )}
      </Card>

      {/* Adjust modal */}
      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Adjust Stock"
        footer={<><Button variant="secondary" onClick={() => setAdjustOpen(false)}>Cancel</Button><Button variant="primary" onClick={saveAdjust}>Save Adjustment</Button></>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Item Type">
            <select className="input" value={adjForm.itemType} onChange={(e) => setAdjForm({ ...adjForm, itemType: e.target.value as 'RAW' | 'FINISHED', itemId: '', unit: 'KG' })}>
              <option value="RAW">Raw Material</option>
              <option value="FINISHED">Finished Product</option>
            </select>
          </Field>
          <Field label="Item" required>
            <select className="input" value={adjForm.itemId} onChange={(e) => {
              const id = Number(e.target.value);
              const item = selectable.find((s) => (s as StockRow).itemId === id);
              setAdjForm({ ...adjForm, itemId: id, unit: item?.unit ?? 'KG' });
            }}>
              <option value="">Select item</option>
              {selectable.map((s) => <option key={s.itemId} value={s.itemId}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Quantity" required>
            <input className="input" type="number" placeholder="Use + (in) or - (out)" value={adjForm.quantity} onChange={(e) => setAdjForm({ ...adjForm, quantity: e.target.value })} />
          </Field>
          <Field label="Unit">
            <select className="input" value={adjForm.unit} onChange={(e) => setAdjForm({ ...adjForm, unit: e.target.value })}>
              {['KG', 'PIECES', 'BOXES', 'BUNDLES', 'LITRES'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <input className="input" value={adjForm.notes} onChange={(e) => setAdjForm({ ...adjForm, notes: e.target.value })} />
          </Field>
        </div>
        <p className="text-xs text-slate-500 mt-3">Positive quantity adds stock; negative removes it. An adjustment creates an audit-trail movement record.</p>
      </Modal>

      {/* Ledger modal */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={`Stock Ledger: ${detail?.name ?? ''}`} size="lg">
        {detail && <StockLedger itemType={detail.itemType} itemId={detail.itemId} />}
      </Modal>
    </div>
  );
}

function StockLedger({ itemType, itemId }: { itemType: StockRow['itemType']; itemId: number }) {
  const { data } = useData(() => api.stock.itemLedger(itemType, itemId), [itemType, itemId]);
  if (!data) return <div className="h-24 flex items-center justify-center"><Spinner /></div>;
  const rows = [
    { label: 'Opening', v: data.opening },
    { label: data.itemType === 'RAW' ? 'Received (Purchases)' : 'Produced', v: data.itemType === 'RAW' ? data.received : data.produced },
    { label: data.itemType === 'RAW' ? 'Consumed (Production)' : 'Dispatched', v: data.itemType === 'RAW' ? data.consumed : data.dispatched },
    { label: 'Adjusted In', v: data.adjustedIn },
    { label: 'Adjusted Out', v: data.adjustedOut },
  ];
  return (
    <div className="space-y-2">
      <div className="rounded-md bg-slate-50 dark:bg-slate-700/30 p-3 flex justify-between">
        <span className="font-semibold">Closing Stock</span>
        <span className="font-bold text-lg">{number(data.closing)} {data.unit}</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-700/60 text-sm">
          <span className="text-slate-600 dark:text-slate-300">{r.label}</span>
          <span className="font-mono">{number(r.v)}</span>
        </div>
      ))}
    </div>
  );
}