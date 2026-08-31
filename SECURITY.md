# Security Documentation

This application is built using **security-by-design** principles. It is a local,
offline-first desktop business application that handles potentially sensitive
data — business transactions, purchases, production, inventory, employee and
wage information, contacts, and backups — all of which are treated as sensitive.

> **Control principle:** Data integrity and security always outrank convenience.
> When a security decision is unclear, the implementation chooses the more
> secure default.

---

## 1. Security Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│ Renderer (React, sandboxed, renderer process)            │
│   • No Node.js access (contextIsolation + sandbox)        │
│   • Limited to the allowlisted window.api surface         │
└───────────────────────────────┬──────────────────────────┘
                                │ IPC (ipcRenderer.invoke)
┌───────────────────────────────▼──────────────────────────┐
│ Preload (isolated)                                       │
│   • contextBridge exposes ONLY narrow, named APIs        │
└───────────────────────────────┬──────────────────────────┘
                                │ main-process IPC
┌───────────────────────────────▼──────────────────────────┐
│ Main process: ipc.ts executeCommand                      │
│   1. Lock check (application lock / auth)                │
│   2. Zod schema validation of every renderer payload     │
│   3. Business logic in electron/services/*               │
│   4. SQLite via prepared statements + transactions       │
│   5. Audit log write                                     │
└───────────────────────────────┬──────────────────────────┘
                                │
                       local SQLite file (per-user AppData)
```

The **renderer never talks to the database or filesystem directly.** Every IPC
operation has an explicit, named handler. There is **no generic `query()`,
`executeSQL()`, `invokeAny()`, or `runCommand()`** surface.

---

## 2. Electron Security Configuration

`electron/main.ts` creates the `BrowserWindow` with:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- DevTools disabled in production builds
- Navigation / window-open events denied (`setWindowOpenHandler` returns
  `{ action: 'deny' }` for non-allowlisted cases)
- A strict **Content-Security-Policy** is set via HTTP headers / meta tag that
  avoids `unsafe-inline` and `unsafe-eval`

Outbound links (e.g. help) are only opened through Electron's
`shell.openExternal` with explicit protocol checks (`http`/`https` only).

### 2.1 Renderer capabilities

The renderer does **not** receive `require`, `process`, `fs`, `child_process`,
`shell`, or the database connection. It only receives the explicitly
allowlisted methods declared in `electron/preload.ts` (auth, CRUD, stock reads,
reports, backup, updater status, settings, dialogs).

---

## 3. IPC Validation (Zod)

Every renderer IPC request is treated as **untrusted input**. `electron/services/validation.ts`
defines a Zod schema for every command. In `executeCommand`:

1. The command is checked against the handle registry (unknown commands are rejected).
2. If the app is locked, only lock-aware commands are permitted.
3. `validateParams(command, params)` runs `schema.parse`, and any `ZodError` is
   normalized into a safe generic message — **no schema internals are leaked**.
4. Only then does business logic run.

Malformed requests are rejected before any partial write can occur.

---

## 4. Database Security

- SQLite via `sql.js` running in the Electron main process.
- **All queries use prepared / parameterized statements.** User input is passed
  as bind parameters. **No string concatenation of user input into SQL.**
- **Foreign keys are enabled.**
- **Business-critical operations run inside transactions** (`BEGIN` /
  `COMMIT` / with `ROLLBACK` on failure), including:
  - Purchase creation/edits
  - Production (validate recipe → check stock → deduct raw → add finished →
    record movements → commit; rollback atomically on any failure)
  - Dispatch
  - Stock adjustments
  - Payroll finalization
  - Backup restore
- Migrations are applied in order and recorded in `schema_migrations`.
- The database path lives under the user's `%APPDATA%` directory — never in
  `C:\`, `Program Files`, or the project folder. The path is controlled by the
  main process and not exposed unnecessarily.

> The primary security boundary is the Windows OS account + application
> authentication + restricted filesystem permissions + database integrity +
> optional encrypted backups. This application does not pretend a local SQLite
> file is magically inaccessible to the OS user; it layers *defense in depth*.

---

## 5. Authentication & Sessions

- **Passwords are never stored in plaintext.** They are stored only as salted
  cryptographic hashes using an established algorithm (see `auth.ts`).
- No authentication credentials are stored in `localStorage`/`sessionStorage`.
  Session/auth state lives in memory and is cleared on logout.
- Features:
  - First-time setup creates the admin user.
  - **Login / Logout** secure the session; logout clears auth state and
    blocks protected IPC operations.
  - **Application lock** blocks all but lock-unlock commands until the
    password is re-entered.
  - **Auto-lock** after a configurable idle timeout (default **15 minutes**)
    with the ability to unlock using the password.
  - **Password change** validates the current password.
- Authorization (e.g. rejecting destructive/history-touching operations) is
  enforced **in the business-logic layer**, not just by hiding UI buttons.

---

## 6. Sensitive Data & Logging

- Employee and wage data are treated as sensitive.
- Logging never records passwords, auth tokens, employee private details, wage
  values, or full database contents.
- User-facing errors are generic ("Something went wrong. Please try again.").
  Internal stack traces are never shown to users.
- The **audit log** (`audit_logs` table) records important actions with
  `timestamp`, `action`, `entity`, `entity ID`, and `result`. It records
  *what happened*, never passwords. Covered actions include login, logout,
  password change, product/material/supplier/employee changes, purchases,
  production, recipes, stock adjustments, dispatch, attendance, wage change /
  finalization, settings changes, backup, restore, and update events.

---

## 7. Delete Policy

- **Master records** (products, materials, suppliers, employees) use
  `status = 'active' | 'inactive'` rather than permanent deletion.
- **Hard delete is blocked** when historical business transactions reference a
  record; the UI and backend both prompt "deactivate instead".
- Transactional records (purchases, dispatches, productions) are retained for
  history; edits reverse and reapply their stock movements.
- Dangerous operations (restore, delete) always require explicit confirmation.

---

## 8. Backup Security

### 8.1 Integrity & safe restore

- Backups are timestamped files with a recorded history.
- Restore **validates the file** (non-empty, valid SQLite header magic) before
  touching any data.
- Every restore first creates a **safety backup of the current database**, then
  replaces contents, then verifies the reopened database. If the restore
  fails, the current in-memory database is left intact.
- Automatic backups run on a schedule with a configurable **retention policy**
  (default keeps the last 30).

### 8.2 Optional encrypted backups

Because backups may contain sensitive employee and business data, encrypted
backups are supported (`backupCrypto.ts`):

- **Algorithm:** AES-256-GCM (authenticated encryption).
- **Key derivation:** scrypt (an established password-based KDF) from the
  user-supplied password + a random per-file salt.
- **Format:** `CANDYBKUPENC` magic + salt + IV + GCM auth tag + ciphertext.
- No encryption key is ever stored in the file or hard-coded; a wrong password
  is detected because GCM authentication fails.
- Encrypted backups are **never committed / treated as ordinary files**; they
  are validated and integrity-checked on restore, and the password is required
  to restore.

---

## 9. Filesystem Security

- The renderer has **no unrestricted filesystem access.**
- All file operations go through controlled main-process functions.
- Backup/export paths come from **native dialogs** (`dialog.showOpenDialog`,
  `dialog.showSaveDialog`), never arbitrary renderer-supplied paths.
- Application data is stored in a per-user application-data directory.

---

## 10. External Content & Remote Code

- No remote JavaScript, remote webpages, `eval()`, `new Function()`, or remote
  modules are used for normal operation.
- The UI is packaged locally; normal operation does **not** depend on the
  internet.
- External navigation is restricted and protocol-checked.

---

## 11. Dependency Security

- Dependencies are minimized and purpose-scoped.
- `package-lock.json` is committed for reproducible, auditable builds.
- Run `npm audit` during development and before each release.
- Packages are checked for maintenance before being added; abandoned packages
  are avoided.

---

## 12. Auto-Update Security

- Updates are handled by `electron-updater` (not a custom downloader/runner).
- The update service is isolated behind an `UpdateService` abstraction so it
  can later migrate to another shell (e.g. Tauri) without rewriting business
  logic.
- **HTTPS is required** for production update metadata and artifacts. Plain
  HTTP and bypassing TLS errors are prohibited.
- **Signed releases are required for production updates.** The update feed and
  certificates are configured via environment variables / CI secrets; signing
  keys and passwords are never committed.
- **Safe pre-install sequence:** check for active DB transactions → create an
  automatic database backup → verify backup integrity → only then install. If
  the backup fails, the update is postponed (the app continues fully usable).
- Versioned database migrations run inside transactions on startup; a failed
  migration creates a recovery backup rather than silently continuing.
- The updater **must never be a single point of failure**: if the network,
  update server, download, verification, or installation fails, the business
  application keeps working offline. See `electron/services/update.ts` for the
  explicit status state machine (`idle → checking → available → downloading →
  downloaded → installing → error / up-to-date`).

### Update settings (secure defaults)

| Setting | Default |
|---|---|
| Automatic update checks | ON |
| Automatic download | ON |
| Release channel | `stable` |
| Automatic restart without consent | OFF (always asks) |

---

## 13. Content Security Policy

A strict CSP is enforced to resist injection of remote content:

- No `unsafe-eval`.
- No `unsafe-inline` script execution.
- Only local packaged resources load in the renderer.
- DevTools and debug logging are disabled in production builds.

---

## 14. Threat Model

| Threat | Mitigation |
|---|---|
| Malicious renderer payload / SSTI | Sandboxed renderer; no Node access; Zod-validated IPC |
| SQL injection | Prepared statements only; no user-supplied SQL |
| Unauthorized data access | Authentication + lock + in-memory session + per-command allowlist |
| Loss of DB integrity | Transactions, FK constraints, atomic persistence, validated restore |
| Data loss (accidental delete) | Delete-policy; safety backups; confirmation dialogs |
| Malicious update | Signed, HTTPS-distributed updates only; pre-install verified backup |
| Backup file theft / leakage | Optional AES-256-GCM password encryption |
| Privilege escalation | No administrator requirement; per-user data directory |

---

## 15. Secure Development Practices

- **Security-first ordering:** Data integrity → Authentication → Authorization →
  IPC security → Database security → Backup security → Filesystem security →
  Dependency security → UI security → Convenience.
- Every IPC handler validates input with a Schema (Zod).
- Sensitive values are never logged; audit logging excludes password values.
- Prefer the more secure default when a decision is ambiguous.
- Never commit signing keys, passwords, tokens, or demo credentials.

---

## 16. Dependency & Update Hygiene

1. `npm audit` before release; review and address vulnerabilities.
2. Keep `package-lock.json` committed.
3. Prefer maintained, purpose-fit libraries; minimize dependency count.

---

## 17. Release / Pre-Release Checklist

1. Run `npm run typecheck` and `npm test` (validation + encrypted-backup
   round-trip + updater-behavior coverage included).
2. Run `npm audit` and review findings.
3. Run DB migration tests.
4. Verify renderer cannot access Node APIs or execute arbitrary SQL.
5. Verify invalid IPC/invalid DB input is rejected and SQL injection attempts
   fail.
6. Verify unauthorized / locked operations fail.
7. Verify passwords are not stored in plaintext.
8. Verify logout invalidates the session and auto-lock works.
9. Verify backup and restore (plain and encrypted) work; corrupted backups are
   rejected; failed transactions roll back completely.
10. Verify insufficient stock cannot create invalid inventory (production /
    dispatch are atomic).
11. Verify external navigation is restricted.
12. Build the production package with DevTools/debug logging disabled and no
    development credentials.
13. Verify no secrets are committed to Git.

---

## 18. Code Signing (Windows)

Production releases should be signed with a legitimate Windows code-signing
certificate so Windows SmartScreen does not warn and **so signed auto-updates
can be verified**.

- Never commit `.pfx` / `.p12` / private signing keys / passwords / tokens.
- Supply them via environment variables or secure CI/CD secrets:
  - `CSC_LINK`, `CSC_KEY_PASSWORD`
  - `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`
- See `electron-builder.yml` for the wiring.

---

## 19. Known Limitations

- **Database at rest:** The live SQLite database file is encrypted only when a
  user explicitly creates an encrypted backup; the on-disk working database is
  protected by the OS user account and application authentication, not
  transparent full-database encryption. If full database-at-rest encryption is
  ever required, use a mature SQLite encryption solution rather than inventing
  one.
- **Auto-update feed:** Until a real HTTPS update endpoint and code-signing
  certificate are configured, the updater reports "up to date"/offline and the
  app is updated manually. Automatic update checks are still available and
  safe when unconfigured.
- **Dependency advisories (as of this writing):** `npm audit` reports
  high-severity advisories in `xlsx` (SheetJS) for which no npm-published fix
  exists, and moderate advisories in `react-router-dom`/`react-router` that are
  only addressed by a breaking upgrade to v7. Review these before each release:
  consider a maintained alternative for spreadsheet export or pin the vendor
  distribution, and plan the react-router v7 upgrade deliberately. Do not run
  `npm audit fix --force` blindly, as it applies breaking changes.
- **Forgotten password:** There is no self-service password recovery. Restore
  from a backup or re-initialize the database (with data backing up first).

---

## 20. Update Compatibility

Before publishing an update that could change the SQLite schema:

1. Back up a copy of an existing database created by the previous version.
2. Run the new version against that database and confirm migrations succeed.
3. Verify existing configuration and backups remain readable.
4. Upgrade the app to the same test database (`migrations run inside
   transactions`) and confirm the UI loads.
5. Test rollback/recovery using the last-known-good backup.