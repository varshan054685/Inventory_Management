import { contextBridge, ipcRenderer } from 'electron';
import { CHANNEL, APP_VERSION } from './shared/appInfo';

/**
 * Minimal, typed bridge from sandboxed renderer to main process. Exposes only
 * allowlisted operations — no generic SQL/bridge, no Node APIs, no filesystem.
 */
contextBridge.exposeInMainWorld('api', {
  invoke: (command: string, params?: unknown) =>
    ipcRenderer.invoke(CHANNEL, command, params ?? {}).then(parseResult),
  // Native dialogs.
  pickBackupFolder: () => ipcRenderer.invoke('cpms:pickBackupFolder'),
  pickBackupFile: () => ipcRenderer.invoke('cpms:pickBackupFile'),
  saveReportFile: (name: string) => ipcRenderer.invoke('cpms:saveReportFile', name),
  version: APP_VERSION,
  // Updater (read-only + explicit user actions).
  updater: {
    status: () => ipcRenderer.invoke('cpms:updater:status'),
    check: () => ipcRenderer.invoke('cpms:updater:check'),
    download: () => ipcRenderer.invoke('cpms:updater:download'),
    install: () => ipcRenderer.invoke('cpms:updater:install'),
  },
  // Main-process security events (lock/unlock).
  onLockState: (cb: (locked: boolean) => void) => {
    const listener = (_e: unknown, locked: boolean) => cb(locked);
    ipcRenderer.on('cpms:lock-state', listener);
    return () => ipcRenderer.removeListener('cpms:lock-state', listener);
  },
});

function parseResult(payload: { ok: boolean; result?: unknown; error?: string }) {
  if (!payload?.ok) {
    throw new Error(payload?.error || 'Unknown backend error');
  }
  return payload.result;
}