export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface UpdateCheckResult {
  status: UpdateStatus;
  version: string | null;
  currentVersion: string;
  downloadProgress: number | null;
  error?: string;
  lastCheck?: string | null;
}

export function emptyStatus(): UpdateCheckResult {
  return {
    status: 'idle',
    version: null,
    currentVersion: '',
    downloadProgress: null,
    error: undefined,
    lastCheck: null,
  };
}