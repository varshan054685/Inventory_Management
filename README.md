# Candy Production Management System

An **offline-first Windows desktop application** for managing a candy manufacturing business — products, raw materials, suppliers, purchases, production with recipe (BOM) consumption, finished-goods inventory, staff attendance, wages, overtime, dispatch, reports, and backup/restore.

**The application works fully offline.** No internet is required for normal operation. All data is stored in a local SQLite database on your computer.

---

## 1. Features

| Module | What it does |
|---|---|
| Dashboard | Today's purchases/production/dispatch, staff presence, low-stock alerts, monthly charts |
| Products | Finished product master (categories, units, selling price, min stock) |
| Raw Materials | Material master with stock computed from movements (never hand-typed) |
| Suppliers | Supplier master with contact/GST details |
| Purchase | Multi-line purchase entry → automatically increases raw material stock |
| Production | Record production → checks BOM stock, deducts raw materials, adds finished goods |
| Recipes (BOM) | Define materials needed per output batch; drives production consumption |
| Stock | Current stock, movements ledger, adjustments (with audit trail) |
| Staff | Employees with individual daily/half-day/OT wage rates |
| Attendance | Monthly calendar, click-to-toggle P / HD / A / WO / H |
| Wages | Auto-calculated from attendance + overtime; lock/finalize payroll |
| Overtime | Per-employee OT records, auto-amount from hours × rate |
| Dispatch | Outbound dispatch → deducts finished stock with availability check |
| Reports | 20+ reports with PDF / Excel / CSV export and print |
| Backup & Restore | Manual + automatic backups, validated restore with safety backup |
| Settings | Company info, currency, defaults, unit conversions, password change |

---

## 2. Tech Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS
- **Desktop shell:** Electron (chosen over Tauri because this build machine has no Rust toolchain; the backend is written behind a thin command/API layer so it can be ported to Tauri later)
- **Database:** SQLite via `sql.js` (SQLite compiled to WebAssembly) running in the Electron main process, persisted atomically to a `.sqlite` file
- **Charts:** Recharts · **PDF:** pdfmake · **Excel/CSV:** SheetJS (xlsx)

---

## 3. Project Structure

```
electron/                  ← backend (Electron main process)
  main.ts                  ← window, IPC wiring, self-test hook
  preload.ts               ← safe bridge (window.api)
  db/                      ← sql.js connection, migrations, manager
  services/                ← ALL business logic (portable to Tauri later)
    auth.ts, masters.ts, purchases.ts, recipes.ts, production.ts,
    dispatch.ts, adjustments.ts, stock.ts, attendance.ts, overtime.ts,
    wages.ts, settings.ts, unitConversions.ts, dashboard.ts, reports.ts,
    backup.ts, autobackup.ts, seed.ts, audit.ts, ipc.ts
src/                       ← frontend (React renderer)
  api/client.ts            ← typed API → IPC commands
  components/              ← UI primitives, layout, shared
  features/                ← one folder per module (dashboard, products, …)
  store/auth.tsx           ← auth state
  hooks/, utils/           ← helpers (format, export PDF/Excel/CSV)
tests/                     ← vitest unit tests for business logic
```

**Why this layout:** every business rule lives in `electron/services/` which operates on a `Database` handle — no Electron API in sight. The frontend calls a plain command API (`api.invoke('production.create', …)`). Porting to Tauri later means replacing `electron/main.ts` + `preload.ts` with Rust commands that call the same logic.

---

## 4. How to Run the Development Version

Requirements: **Node.js 18+** and npm.

```bash
# 1. Install dependencies
npm install

# 2. Launch the desktop app (dev mode with hot reload)
npm run dev
```

A window titled **Candy Production Management System** opens. On first launch you'll see the **first-time setup** screen — create your admin username and password.

> Running the renderer alone in a browser (`npm run dev:web`) won't have a database backend; use the Electron app.

---

## 5. Build the Windows Application (`.exe`)

```bash
# Build renderer + main process
npm run build

# Create the Windows installer (NSIS) in ./release
npm run dist
```

Output: `release/CandyProductionManagement-Setup-1.0.0.exe`

The installer creates desktop and start-menu shortcuts. The app also runs unpackaged via `npm run build && npx electron .`.

> First `npm run dist` may take a while (downloads Electron binaries). An unsigned build still installs and runs; Windows SmartScreen may show a warning because the build isn't code-signed.

---

## 6. Where Is the Database Stored?

- **Path:** `%APPDATA%\candy-production-management-system\data\candy.sqlite`
  (e.g. `C:\Users\YourName\AppData\Roaming\candy-production-management-system\data\candy.sqlite`)
- The file is a standard SQLite database. Backups are copies of this file.
- Writes are persisted atomically (temp file + rename) to prevent corruption.

## 7. Where Are Backups Stored?

- **Manual backups:** you choose the folder when clicking "Backup Now".
- **Automatic backups:** stored in `%APPDATA%\candy-production-management-system\backups\` (with frequency and retention configurable in **Settings → Automatic Backup**; default keeps the last 30).
- Backup filenames look like `CandyBackup_20260830_17-30.db`.

## 8. How to Restore a Backup

1. Open **Backup & Restore** in the sidebar.
2. Click **Choose Backup File…** and pick a `.db` (or `.enc` for encrypted) backup.
3. Confirm the warning — a **safety backup of the current database is created automatically first**, then the selected backup replaces the data.
4. The app reloads with the restored data.

### Encrypted backups

Because backups can contain sensitive employee and business data, you can create an **encrypted backup** by ticking **"Encrypt with password"** before clicking **Backup Now**. Encrypted backups:

- Use **AES-256-GCM** authenticated encryption with the password-derived key (via scrypt).
- Are stored with a `.enc` extension and **can only be restored with the correct password** (a wrong password is detected automatically).
- Are never committed to source control or treated as ordinary files.

> Choose a strong password and keep it somewhere safe — it cannot be recovered.

## 9. How to Change the Password

**Settings → Change Password** — enter the current password and a new one (min 4 characters). Passwords are stored as salted hashes (never plaintext).

## 10. Login / Lock

- **Login:** your username + password (first-time setup creates the admin account).
- **Lock:** the padlock icon in the top bar locks the app; you must re-enter the password to continue.
- **Logout:** the logout icon returns to the login screen.

---

## 11. Business Rules (Important)

- **Stock is always derived from stock movements** — never from a manually stored value. Every inventory change creates a movement record (`PURCHASE_IN`, `PRODUCTION_RAW_MATERIAL_OUT`, `PRODUCTION_FINISHED_IN`, `DISPATCH_OUT`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`).
- **Purchase** → creates `PURCHASE_IN` movements (increases raw stock).
- **Production** → uses the active recipe to compute required materials, checks availability, deducts raw stock (`PRODUCTION_RAW_MATERIAL_OUT`), adds finished stock (`PRODUCTION_FINISHED_IN`) — **all in one DB transaction**.
- **Dispatch** → checks finished stock and deducts (`DISPATCH_OUT`). If insufficient: *"Insufficient stock. Available: X, Requested: Y"*.
- **Insufficient stock blocks** production/dispatch **unless "Allow Negative Stock" is enabled in Settings**.
- **Attendance** (P/HD/A/WO/H) + **Overtime** drive monthly **Wages**. Payroll can be **locked** to prevent accidental edits.
- **Editing/deleting** purchases, dispatches, or productions correctly reverses and reapplies their stock movements.
- Master records (products, materials, suppliers, employees) use **Active/Inactive** status; hard delete is blocked when history exists.

## 12. Unit Conversions

Set up in **Settings → Unit Conversions** (e.g. `1 BOX = 100 PIECES`). Conversions are **never assumed** — the system uses them only where you configure them. Units supported: **KG, PIECES, BOXES, BUNDLES, LITRES**.

## 13. Demo Data

**Settings → Demo Data** can load sample products (Mango/Orange/Milk Candy), raw materials, employees, recipes, and transactions to explore the app. **Clear All Data** wipes business data (admin account is kept).

---

## 14. Running Tests

```bash
npm test            # vitest: business-logic tests (stock, purchase, production, dispatch, wages, backup)
npm run typecheck   # TypeScript type-check (no emit)
```

The test suite covers: purchase stock increase, production raw-material deduction, finished-stock increase, insufficient-stock validation, dispatch deduction, attendance/half-day/overtime/total wage math, and stock calculation.

---

## 15. How to Update the Application

The app supports **automatic updates** through `electron-updater` once a signed, HTTPS-hosted release feed is configured (see SECURITY.md and `electron-builder.yml`). Updates never block normal use:

- On startup the app checks for updates **in the background** — a notification appears when a new version is available.
- You can choose **Download** or **Later**; downloading happens in the background without freezing the app.
- When the download finishes, **Restart and Update** or **Later**.
- **Before installing**, the app creates and verifies an automatic backup of your data — if that backup fails, the update is postponed to protect your data.
- If the network/update server is unavailable, the app simply reports "working offline" and continues fully functional.
- Update preferences live in **Settings → Updates** (automatic checks, automatic download, release channel).

Until a signed production update endpoint is configured, updates are manual:

1. Back up your database (**Backup & Restore → Backup Now**).
2. Replace the application (or re-run a newer installer). The database lives in `%APPDATA%` and survives reinstall/upgrade, so your data is preserved.
3. Launch and verify. If anything looks off, restore your backup.

## 15.1 Security

This application is built with security-by-design: sandboxed renderer, `contextIsolation`, no Node APIs in the renderer, Zod-validated IPC, prepared-statement SQLite with transactions, salted password hashing, application lock with auto-lock, audit logging, safe delete policy, validated + optionally password-encrypted backups, strict CSP, and signed/HTTPS-only auto-updates. See **`SECURITY.md`** for the full security architecture, threat model, and release checklist.

---

## 16. Troubleshooting

| Problem | Fix |
|---|---|
| Window won't open / blank | Run `npm run dev` and check the terminal for errors; delete `%APPDATA%\candy-production-management-system` only after backing up |
| "Backend not connected" | You opened the web-only version; launch via `npm run dev` |
| Forgot password | Delete the `users` table via a SQLite tool, or delete the DB file (after backing up) and run first-time setup again |
| SmartScreen warning on install | Expected for unsigned builds; click "More info → Run anyway" |

---

## 17. License

MIT © Candy Production Management System
