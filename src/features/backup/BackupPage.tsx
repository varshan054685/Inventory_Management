import React, { useState } from 'react';
import { api } from '@/api/client';
import { useData } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { Card, Button, Modal, EmptyState, Spinner, Field } from '@/components/ui';
import { DatabaseBackup, Download, Upload, History, Shield, ShieldOff } from 'lucide-react';

interface BackupRecord {
  id: number;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  kind: string;
  encrypted?: boolean;
}

export function BackupPage() {
  const toast = useToast();
  const { data, loading, refresh } = useData(() => api.backup.list(), []);
  const [busy, setBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [info, setInfo] = useState<{ dbPath: string | null } | null>(null);
  const [encryptManual, setEncryptManual] = useState(false);
  const [manualPassword, setManualPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');

  const backups: BackupRecord[] = (data ?? []).map((r) => ({
    id: Number(r.id),
    fileName: String(r.fileName ?? ''),
    filePath: String(r.filePath ?? ''),
    sizeBytes: Number(r.sizeBytes ?? 0),
    createdAt: String(r.createdAt ?? ''),
    kind: String(r.kind ?? 'manual'),
    encrypted: Boolean(r.encrypted) || String(r.fileName ?? '').endsWith('.enc'),
  }));

  const createManual = async () => {
    setBusy(true);
    try {
      const folder = await api.dialogs.pickBackupFolder();
      if (!folder) return;
      if (encryptManual && !manualPassword) {
        toast.error('Enter a password to encrypt the backup.');
        return;
      }
      const b = await api.backup.create('manual', encryptManual ? manualPassword : undefined);
      toast.success(`Backup created: ${b.fileName}`);
      setManualPassword('');
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
      setRestorePassword('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isEncryptedTarget = (t: BackupRecord) => t.encrypted || t.fileName.endsWith('.enc');

  const doRestore = async () => {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      const password = isEncryptedTarget(restoreTarget) ? restorePassword : undefined;
      await api.backup.restore(restoreTarget.filePath, password);
      toast.success('Database restored. The app will reload data.');
      setRestoreTarget(null);
      setRestorePassword('');
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
          {' '}<strong>Encrypted backups</strong> protect sensitive employee &amp; business data at rest.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="font-semibold mb-1 flex items-center gap-2">{encryptManual ? <Shield className="w-4 h-4 text-emerald-500" /> : <ShieldOff className="w-4 h-4 text-slate-400" />} Create Backup</div>
            <p className="text-sm text-slate-500 mb-3">Choose a folder to save a timestamped backup file.</p>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" className="w-4 h-4" checked={encryptManual} onChange={(e) => setEncryptManual(e.target.checked)} />
              <span>Encrypt with password</span>
            </label>
            {encryptManual && (
              <input
                className="input mb-3"
                type="password"
                placeholder="Password for this backup"
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
              />
            )}
            <Button variant="primary" onClick={createManual} disabled={busy}><Download className="w-4 h-4" /> {busy ? 'Working…' : 'Backup Now'}</Button>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="font-semibold mb-1">Restore Backup</div>
            <p className="text-sm text-slate-500 mb-3">Pick a .db or .enc backup file to replace current data.</p>
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
                <th className="px-3 py-2 text-left table-head">Encrypted</th>
                <th className="px-3 py-2 text-left table-head">Created</th>
              </tr></thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} className="table-row-hover">
                    <td className="px-3 py-2.5 font-mono text-xs">{b.fileName}</td>
                    <td className="px-3 py-2.5"><span className={`badge ${b.kind === 'auto' ? 'badge-neutral' : 'badge-success'}`}>{b.kind}</span></td>
                    <td className="px-3 py-2.5 text-right">{b.sizeBytes ? `${(b.sizeBytes / 1024).toFixed(1)} KB` : '—'}</td>
                    <td className="px-3 py-2.5">{b.encrypted ? <span className="badge badge-success"><Shield className="w-3 h-3" /> Encrypted</span> : <span className="badge badge-neutral">Plain</span>}</td>
                    <td className="px-3 py-2.5 text-slate-500">{b.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!restoreTarget}
        onClose={() => { setRestoreTarget(null); setRestorePassword(''); }}
        title="Restore backup"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setRestoreTarget(null); setRestorePassword(''); }}>Cancel</Button>
            <Button variant="danger" onClick={doRestore} disabled={busy}>Yes, Restore</Button>
          </>
        }
      >
        <div className="flex gap-3 items-start">
          <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2">
            <p><strong>Restoring a backup will replace current application data.</strong></p>
            <p>A safety backup of the current database will be created before restoring.</p>
            <p className="font-mono text-xs">{restoreTarget?.fileName}</p>
            {restoreTarget && isEncryptedTarget(restoreTarget) && (
              <Field label="Backup password" required>
                <input className="input" type="password" value={restorePassword} autoFocus onChange={(e) => setRestorePassword(e.target.value)} placeholder="Password used to encrypt this backup" />
              </Field>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}