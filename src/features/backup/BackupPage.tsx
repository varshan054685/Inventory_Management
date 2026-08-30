import React, { useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Modal, EmptyState, Spinner, ConfirmDialog } from '@/components/ui';
import { DatabaseBackup, Download, Upload, History } from 'lucide-react';

interface BackupRecord {
  id: number;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  kind: string;
}

export function BackupPage() {
  const toast = useToast();
  const { data, loading, refresh } = useData(() => api.backup.list(), []);
  const [busy, setBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [info, setInfo] = useState<{ dbPath: string | null } | null>(null);

  const backups: BackupRecord[] = (data ?? []).map((r) => ({
    id: Number(r.id),
    fileName: String(r.fileName ?? ''),
    filePath: String(r.filePath ?? ''),
    sizeBytes: Number(r.sizeBytes ?? 0),
    createdAt: String(r.createdAt ?? ''),
    kind: String(r.kind ?? 'manual'),
  }));

  const createManual = async () => {
    setBusy(true);
    try {
      const folder = await api.dialogs.pickBackupFolder();
      if (!folder) return;
      const b = await api.backup.create('manual');
      toast.success(`Backup created: ${b.fileName}`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pickAndRestore = async () => {
    setBusy(true);
    try {
      const file = await api.dialogs.pickBackupFile();
      if (!file) return;
      setRestoreTarget({ id: 0, fileName: file.split(/[\\/]/).pop() ?? file, filePath: file, sizeBytes: 0, createdAt: '', kind: 'manual' });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      await api.backup.restore(restoreTarget.filePath);
      toast.success('Database restored. The app will reload data.');
      setRestoreTarget(null);
      refresh();
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const loadInfo = async () => {
    try { setInfo(await api.system.info()); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="card-title mb-1 flex items-center gap-2"><DatabaseBackup className="w-5 h-5 text-brand-500" /> Backup & Restore</h2>
        <p className="text-sm text-slate-500 mb-4">
          Backups are SQLite database files you can store anywhere (USB, cloud folder). Restoring replaces current data — a safety backup is created automatically first.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="font-semibold mb-1">Create Backup</div>
            <p className="text-sm text-slate-500 mb-3">Choose a folder to save a timestamped backup file.</p>
            <Button variant="primary" onClick={createManual} disabled={busy}><Download className="w-4 h-4" /> {busy ? 'Working…' : 'Backup Now'}</Button>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="font-semibold mb-1">Restore Backup</div>
            <p className="text-sm text-slate-500 mb-3">Pick a .db backup file to replace current data.</p>
            <Button variant="secondary" onClick={pickAndRestore} disabled={busy}><Upload className="w-4 h-4" /> Choose Backup File…</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="card-title flex items-center gap-2"><History className="w-4 h-4 text-brand-500" /> Backup History</h3>
          <Button variant="ghost" onClick={loadInfo}>Database location</Button>
        </div>
        {info && info.dbPath && (
          <div className="mb-3 text-xs text-slate-500 bg-slate-50 dark:bg-slate-700/30 rounded p-2 break-all">
            Database file: {info.dbPath}
          </div>
        )}
        {loading && !data ? <div className="h-24 flex items-center justify-center"><Spinner /></div> : backups.length === 0 ? (
          <EmptyState message="No backups recorded yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base w-full">
              <thead><tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2 text-left table-head">File</th>
                <th className="px-3 py-2 text-left table-head">Kind</th>
                <th className="px-3 py-2 text-right table-head">Size</th>
                <th className="px-3 py-2 text-left table-head">Created</th>
              </tr></thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} className="table-row-hover">
                    <td className="px-3 py-2.5 font-mono text-xs">{b.fileName}</td>
                    <td className="px-3 py-2.5"><span className={`badge ${b.kind === 'auto' ? 'badge-neutral' : 'badge-success'}`}>{b.kind}</span></td>
                    <td className="px-3 py-2.5 text-right">{b.sizeBytes ? `${(b.sizeBytes / 1024).toFixed(1)} KB` : '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{b.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!restoreTarget} onClose={() => setRestoreTarget(null)} onConfirm={doRestore}
        title="Restore backup"
        message={
          <span>
            <strong>Restoring a backup will replace current application data.</strong>
            <br />A safety backup of the current database will be created before restoring.
            <br /><span className="font-mono text-xs">{restoreTarget?.fileName}</span>
          </span>
        }
        confirmText="Yes, Restore" danger
      />
    </div>
  );
}