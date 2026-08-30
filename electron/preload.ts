import { contextBridge, ipcRenderer } from 'electron';
import { CHANNEL } from './shared/appInfo';

/**
 * Exposes a minimal, typed surface to the renderer. All DB access flows
 * through `invoke`, keeping the renderer sandboxed.
 */
contextBridge.exposeInMainWorld('api', {
  invoke: (command: string, params?: unknown) =>
    ipcRenderer.invoke(CHANNEL, command, params ?? {}).then(parseResult),
  // Native dialogs.
  pickBackupFolder: () => ipcRenderer.invoke('cpms:pickBackupFolder'),
  pickBackupFile: () => ipcRenderer.invoke('cpms:pickBackupFile'),
  saveReportFile: (name: string) => ipcRenderer.invoke('cpms:saveReportFile', name),
  version: '1.0.0',
});

function parseResult(payload: { ok: boolean; result?: unknown; error?: string }) {
  if (!payload?.ok) {
    throw new Error(payload?.error || 'Unknown backend error');
  }
  return payload.result;
}