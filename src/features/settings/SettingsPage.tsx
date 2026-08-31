import React, { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Field, Modal, EmptyState, Spinner, ConfirmDialog } from '@/components/ui';
import { Save, KeyRound, Scale, FlaskConical, Trash2, Plus, X, Lock as LockIcon, Store } from 'lucide-react';
import type { SettingsData, UnitConversion } from '@/shared/types';
import { useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';
import { UpdateSection } from './UpdateSection';

const UNITS = ['KG', 'PIECES', 'BOXES', 'BUNDLES', 'LITRES'];

export function SettingsPage() {
  const toast = useToast();
  const { data: settings, refresh } = useData(() => api.settings.get(), []);
  const { save: saveSettingsStore } = useSettings();
  const [form, setForm] = useState<SettingsData | null>(null);
  useEffect(() => {
    if (settings && !form) setForm({ ...settings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await saveSettingsStore(form);
      setForm({ ...saved });
      toast.success('Settings saved');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <div className="h-40 flex items-center justify-center"><Spinner /></div>;

  const set = (k: keyof SettingsData, v: unknown) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-4 max-w-4xl">
      <Card>
        <h2 className="card-title mb-4 flex items-center gap-2"><Store className="w-4 h-4 text-brand-500" /> Business Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Business Name"><input className="input" value={form.companyName} onChange={(e) => set('companyName', e.target.value)} /></Field>
          <Field label="Currency"><select className="input" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
            <option value="INR">INR (₹)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="GBP">GBP (£)</option>
          </select></Field>
          <Field label="Phone"><input className="input" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input className="input" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Address" className="md:col-span-2"><input className="input" value={form.companyAddress ?? ''} onChange={(e) => set('companyAddress', e.target.value)} /></Field>
        </div>
        <p className="text-xs text-slate-400 mt-3">The business name appears in the sidebar, window title, and report/print branding. It updates immediately and persists after restart.</p>
      </Card>

      <Card>
        <h2 className="card-title mb-4">Defaults & Behavior</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Default Unit">
            <select className="input" value={form.defaultUnit} onChange={(e) => set('defaultUnit', e.target.value)}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Low Stock Threshold (when no per-item minimum set)">
            <input className="input" type="number" value={form.lowStockThreshold ?? 0} onChange={(e) => set('lowStockThreshold', Number(e.target.value))} />
          </Field>
          <Field label="Allow Negative Stock">
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" className="w-4 h-4" checked={form.allowNegativeStock} onChange={(e) => set('allowNegativeStock', e.target.checked)} />
              <span className="text-sm text-slate-600 dark:text-slate-300">Allow production & dispatch even when stock is insufficient</span>
            </label>
          </Field>
          <Field label="Theme">
            <select className="input" value={form.theme} onChange={(e) => set('theme', e.target.value)}>
              <option value="light">Light</option><option value="dark">Dark</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="card-title mb-2 flex items-center gap-2"><LockIcon className="w-5 h-5 text-brand-500" /> Security & Session</h2>
        <p className="text-sm text-slate-500 mb-3">For your protection, the app automatically locks after a period of inactivity. Re-enter your password to continue.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Auto-lock after inactivity">
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" className="w-4 h-4" checked={form.autoLockEnabled} onChange={(e) => set('autoLockEnabled', e.target.checked)} />
              <span className="text-sm text-slate-600 dark:text-slate-300">Lock automatically when idle</span>
            </label>
          </Field>
          <Field label="Lock after (minutes)">
            <input className="input" type="number" min="1" value={form.autoLockMinutes} onChange={(e) => set('autoLockMinutes', Number(e.target.value) || 15)} />
          </Field>
        </div>
      </Card>

      <UpdateSection />

      <Card>
        <h2 className="card-title mb-4">Automatic Backup</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Frequency">
            <select className="input" value={form.backupFrequency} onChange={(e) => set('backupFrequency', e.target.value)}>
              <option value="never">Disabled</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </Field>
          <Field label="Backups to Keep">
            <input className="input" type="number" value={form.backupRetention} onChange={(e) => set('backupRetention', Number(e.target.value) || 30)} />
          </Field>
          <Field label="Auto-backup on exit">
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" className="w-4 h-4" checked={form.autoBackup === 'on'} onChange={(e) => set('autoBackup', e.target.checked ? 'on' : 'off')} />
              <span className="text-sm text-slate-600 dark:text-slate-300">Backup when closing the app</span>
            </label>
          </Field>
        </div>
        <p className="text-xs text-slate-500 mt-2">Automatic backups are stored in the app's backup folder. Keep the last 30 by default.</p>
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={save} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Settings'}</Button>
      </div>

      <UnitConversionsSection />
      <ChangePasswordSection />
      <DataToolsSection />
    </div>
  );
}

function UnitConversionsSection() {
  const toast = useToast();
  const { data, loading, refresh } = useData(() => api.unitConversions.list(), []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fromUnit: 'BOXES', toUnit: 'PIECES', factor: '100' });

  const save = async () => {
    const f = Number(form.factor);
    if (!(f > 0)) { toast.error('Factor must be > 0'); return; }
    if (form.fromUnit === form.toUnit) { toast.error('Cannot convert a unit to itself'); return; }
    try {
      await api.unitConversions.upsert(form.fromUnit, form.toUnit, f);
      toast.success('Conversion saved');
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (c: UnitConversion) => {
    try {
      await api.unitConversions.del(c.fromUnit, c.toUnit);
      toast.success('Conversion removed');
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="card-title flex items-center gap-2"><Scale className="w-5 h-5 text-brand-500" /> Unit Conversions</h2>
        <Button variant="secondary" onClick={() => { setForm({ fromUnit: 'BOXES', toUnit: 'PIECES', factor: '100' }); setOpen(true); }}><Plus className="w-4 h-4" /> Add Conversion</Button>
      </div>
      <p className="text-sm text-slate-500 mb-3">Conversions are optional and never assumed. Define them only when you want e.g. 1 BOX = 100 PIECES.</p>
      {loading && !data ? <div className="h-20 flex items-center justify-center"><Spinner /></div> : !data || data.length === 0 ? (
        <EmptyState message="No conversions configured" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.map((c) => (
            <div key={`${c.fromUnit}-${c.toUnit}`} className="rounded-md border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between">
              <span className="font-mono text-sm">1 {c.fromUnit} = {c.factor} {c.toUnit}</span>
              <button className="btn-ghost p-1 text-red-500" onClick={() => remove(c)}><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add Unit Conversion" size="sm"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="From Unit">
            <select className="input" value={form.fromUnit} onChange={(e) => setForm({ ...form, fromUnit: e.target.value })}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="To Unit">
            <select className="input" value={form.toUnit} onChange={(e) => setForm({ ...form, toUnit: e.target.value })}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Factor (1 from = factor to)">
            <input className="input" type="number" value={form.factor} onChange={(e) => setForm({ ...form, factor: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function ChangePasswordSection() {
  const toast = useToast();
  const { changePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [fe, setFe] = useState('');

  const save = async () => {
    if (form.next.length < 4) { setFe('New password must be at least 4 characters'); return; }
    if (form.next !== form.confirm) { setFe('New passwords do not match'); return; }
    setFe('');
    try {
      await changePassword(form.current, form.next);
      toast.success('Password changed');
      setOpen(false);
      setForm({ current: '', next: '', confirm: '' });
    } catch (e) {
      setFe((e as Error).message);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="card-title flex items-center gap-2"><KeyRound className="w-5 h-5 text-brand-500" /> Change Password</h2>
        <Button variant="secondary" onClick={() => { setFe(''); setOpen(true); }}>Change Password</Button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Change Password" size="sm"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save}>Update Password</Button></>}>
        <div className="space-y-4">
          <Field label="Current Password"><input type="password" className="input" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} /></Field>
          <Field label="New Password"><input type="password" className="input" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></Field>
          <Field label="Confirm New Password"><input type="password" className="input" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></Field>
          {fe && <p className="text-sm text-red-600">{fe}</p>}
        </div>
      </Modal>
    </Card>
  );
}

function DataToolsSection() {
  const toast = useToast();
  const { data, loading, refresh } = useData(() => api.products.list(), []);
  const [confirmSeed, setConfirmSeed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const hasData = (data?.length ?? 0) > 0;

  const seed = async () => {
    try {
      await api.seed.demo();
      toast.success('Demo data loaded');
      setConfirmSeed(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const clear = async () => {
    try {
      await api.seed.clear();
      toast.success('All business data cleared');
      setConfirmClear(false);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <h2 className="card-title mb-1 flex items-center gap-2"><FlaskConical className="w-5 h-5 text-brand-500" /> Demo Data</h2>
      <p className="text-sm text-slate-500 mb-3">
        {loading ? 'Checking…' : hasData ? 'Your database already contains products. You can clear all business data to start fresh.' : 'Load sample products, materials, employees, recipes and transactions for evaluation.'}
      </p>
      <div className="flex gap-2">
        {!hasData && <Button variant="secondary" onClick={() => setConfirmSeed(true)}><FlaskConical className="w-4 h-4" /> Load Demo Data</Button>}
        <Button variant="danger" onClick={() => setConfirmClear(true)}><Trash2 className="w-4 h-4" /> Clear All Data</Button>
      </div>

      <ConfirmDialog open={confirmSeed} onClose={() => setConfirmSeed(false)} onConfirm={seed}
        title="Load demo data" message="This will create sample products, raw materials, recipes, employees and transactions. Continue?" confirmText="Load" danger={false} />
      <ConfirmDialog open={confirmClear} onClose={() => setConfirmClear(false)} onConfirm={clear}
        title="Clear all data" message="This permanently deletes all business data (products, purchases, production, attendance, wages, etc.). The admin account is kept. Continue?" confirmText="Yes, Clear All" danger />
    </Card>
  );
}