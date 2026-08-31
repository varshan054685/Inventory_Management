import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/api/client';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Field, Spinner } from '@/components/ui';
import { RefreshCw, Download, RotateCw, Cpu } from 'lucide-react';
import type { UpdateCheckResult } from '@/shared/update';
import type { SettingsData } from '@/shared/types';

const friendly: Record<string, string> = {
  idle: '—',
  checking: 'Checking for updates…',
  'up-to-date': "You're up to date.",
  available: 'Update available.',
  downloading: 'Downloading update…',
  downloaded: 'Update ready to install.',
  installing: 'Installing update…',
  error: 'Update check unavailable.',
};

export function UpdateSection() {
  const toast = useToast();
  const [status, setStatus] = useState<UpdateCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await api.updater.status());
    try {
      setSettings(await api.settings.get());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setSetting = async (patch: Partial<SettingsData>) => {
    setSaving(true);
    try {
      const next = await api.settings.save(patch);
      setSettings(next);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const check = async () => {
    setBusy(true);
    try {
      const s = await api.updater.check();
      setStatus(s);
      if (s.status === 'up-to-date') toast.success("You're up to date.");
      else if (s.status === 'available') toast.info(`Version ${s.version} is available.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const s = await api.updater.download();
      setStatus(s);
      if (s.status === 'downloaded') toast.success('Update downloaded and ready to install.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    setBusy(true);
    try {
      await api.updater.install();
      toast.info('Restarting to install update…');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const st = status?.status ?? 'idle';
  const pct = status?.downloadProgress != null ? Math.round(status.downloadProgress) : null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="card-title flex items-center gap-2"><RefreshCw className="w-5 h-5 text-brand-500" /> Updates</h2>
        <Button variant="secondary" onClick={check} disabled={busy}><RefreshCw className="w-4 h-4" /> Check for Updates</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div><span className="text-slate-500">Current Version:</span><div className="font-semibold">v{status?.currentVersion ?? '—'}</div></div>
        <div><span className="text-slate-500">Update Status:</span><div className="font-semibold flex items-center gap-2">{busy ? <Spinner className="w-3 h-3" /> : null}{friendly[st]}</div></div>
        <div><span className="text-slate-500">Available Version:</span><div className="font-semibold">{status?.version ? `v${status.version}` : '—'}</div></div>
        <div><span className="text-slate-500">Last Check:</span><div className="font-semibold">{status?.lastCheck ? new Date(status.lastCheck).toLocaleString() : '—'}</div></div>
      </div>

      {st === 'downloading' && pct != null && (
        <div className="mt-3">
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-slate-500 mt-1">Downloading update… {pct}%</p>
        </div>
      )}

      {st === 'downloaded' && (
        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={install} disabled={busy}><RotateCw className="w-4 h-4" /> Restart and Update</Button>
        </div>
      )}
      {st === 'available' && (
        <div className="mt-3">
          <Button variant="secondary" onClick={download} disabled={busy}><Download className="w-4 h-4" /> Download Update</Button>
        </div>
      )}
      {st === 'error' && (
        <p className="text-xs text-slate-500 mt-2">Updates are not configured or unavailable. The application continues to work fully offline.</p>
      )}

      <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
        <h3 className="card-title mb-1 flex items-center gap-2 text-sm"><Cpu className="w-4 h-4 text-brand-500" /> Update Preferences</h3>
        <p className="text-xs text-slate-500 mb-3">The application always remains fully functional offline. Manual "Check for Updates" is always available.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Field label="Automatic update checks">
            <label className="flex items-center gap-2 mt-1">
              <input type="checkbox" className="w-4 h-4" checked={settings?.updateAutoCheck ?? true} onChange={(e) => setSetting({ updateAutoCheck: e.target.checked })} />
              <span className="text-slate-600 dark:text-slate-300">Check for updates automatically</span>
            </label>
          </Field>
          <Field label="Automatic download">
            <label className="flex items-center gap-2 mt-1">
              <input type="checkbox" className="w-4 h-4" checked={settings?.updateAutoDownload ?? true} onChange={(e) => setSetting({ updateAutoDownload: e.target.checked })} />
              <span className="text-slate-600 dark:text-slate-300">Download updates automatically</span>
            </label>
          </Field>
          <Field label="Release channel">
            <select className="input" value={settings?.updateChannel ?? 'stable'} onChange={(e) => setSetting({ updateChannel: e.target.value as 'stable' }) }>
              <option value="stable">Stable</option>
            </select>
          </Field>
        </div>
        {saving && <p className="text-xs text-slate-400 mt-2">Saving…</p>}
        <p className="text-xs text-slate-500 mt-2">The app will not restart to install an update without your confirmation.</p>
      </div>
    </Card>
  );
}