export const APP_NAME = 'Inventory Management System';
export const CHANNEL = 'cpms'; // ipc channel

// The running version comes from Electron's app.getVersion(), which reads
// package.json. This keeps the reported/updated version in sync with the
// published release automatically. A static fallback is used where Electron's
// `app` is not available (e.g. some unit-test contexts).
export const APP_VERSION: string = getAppVersion();

function getAppVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as { app?: { getVersion?: () => string } };
    const v = app?.getVersion?.();
    if (v) return v;
  } catch {
    /* electron not available (tests / non-main) */
  }
  return process.env.npm_package_version || '1.0.0';
}