import React, { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/ui';
import { Download, ArrowUp, X } from 'lucide-react';
import type { UpdateCheckResult } from '@/shared/update';

/**
 * Non-intrusive banner shown when an update is available / ready to install.
 * Never blocks normal use; the app keeps working fully offline if updates are
 * unavailable.
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateCheckResult | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void api.updater.status().then((s) => {
      if (s?.status === 'available' || s?.status === 'downloaded' || s?.status === 'downloading') {
        setStatus(s);
      }
    });
  }, []);

  if (dismissed || !status) return null;

  const download = async () => {
    setStatus(await api.updater.download());
  };
  const install = async () => {
    void api.updater.install();
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 max-w-sm">
      <div className="text-slate-600 dark:text-slate-200">
        {status.status === 'downloaded' ? (
          'Update ready to install.'
        ) : status.status === 'downloading' ? (
          <>Downloading update… {status.downloadProgress != null ? `${Math.round(status.downloadProgress)}%` : ''}</>
        ) : (
          <>Version {status.version ?? ''} is available.</>
        )}
      </div>
      <div className="flex gap-2">
        {status.status === 'available' && (
          <Button variant="primary" onClick={download}><Download className="w-3.5 h-3.5" /> Download</Button>
        )}
        {status.status === 'downloaded' && (
          <Button variant="primary" onClick={install}><ArrowUp className="w-3.5 h-3.5" /> Restart &amp; Update</Button>
        )}
        <button className="btn-ghost p-1 rounded text-slate-400" onClick={() => setDismissed(true)} title="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}