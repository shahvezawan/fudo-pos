# Windows deployment and recovery

FUDO runs entirely on a local restaurant server. Staff use browsers on the same LAN. The development preview is isolated and must not be used for real trading.

## 1. Install and prepare

Install Node.js 22 LTS or newer, pnpm 11, and PostgreSQL 17 or newer on the dedicated Windows PC. Use a supported, patched Windows version. Initial dependency installation requires internet; normal production operation does not.

Create the database using PostgreSQL's SQL Shell as an administrator:

```sql
CREATE ROLE fudo LOGIN PASSWORD 'replace-with-a-strong-password';
CREATE DATABASE fudo OWNER fudo;
```

Keep PostgreSQL listening on localhost only (`listen_addresses = 'localhost'`). Do not expose port 5432 to restaurant devices. Keep the database password private. The application account must own the database objects to run initial schema creation, but must not be a PostgreSQL superuser.

From the project directory:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
# Edit .env, then:
pnpm build
pnpm start
```

Configure `DATABASE_URL`, `SETUP_TOKEN`, `PG_BIN`, and `BACKUP_DIR` in `.env`. URL-encode special characters in the database password. Use a long random installation token. Choose a second drive or network device for backups; a directory on the database disk does not protect against disk failure. A network destination must be accessible to the Windows account running FUDO.

Open `http://localhost:3000`. Enter the installation token, owner credentials, restaurant name, currency, and timezone. Passwords require at least ten characters. Remove `SETUP_TOKEN` from `.env` after setup and restart. Production creates no sample users or menu items.

## 2. Set up the restaurant

1. Configure address, receipt footer, tables, registers, timezone, and business-day cutoff in Settings. Currency amounts use two decimal places throughout this release.
2. Create manager, cashier, waiter, and kitchen accounts under Team & access.
3. Add stock items using a whole-number base unit (bottles, grams, millilitres). Record opening counts. Units cannot change after movements exist.
4. Add menu items, variants, add-ons, and fixed deals. Only packaged items should link to automatic stock deduction. Prepared dishes do not consume recipes in this release.
5. Add suppliers. Record purchase receipts and supplier payments separately. Choose a cash drawer only when the payment actually comes from it.
6. Open a shift on the register. Cashiers can only use their assigned shift; owners and managers can operate open shifts.

Menu item pictures and the restaurant logo can be uploaded through their edit forms. Use JPEG, PNG, or WebP files up to 5 MB. The application validates and resizes them, retaining one current image per menu item and one restaurant logo in the database. Updating a picture overwrites the old image record; existing backup archives retain the data captured when they were created. Receipts print the current restaurant logo.

Supplier payments are available under **Purchases → Pay supplier**, or **Record payment** on a purchase row. Choose the outstanding purchase and record a full or partial payment. Select a drawer only if money physically comes out of that drawer.

Use a DHCP reservation for the server, for example `192.168.1.50`. Staff then open `http://192.168.1.50:3000`. Replace this example with the restaurant's actual address. Connect the server by Ethernet where possible and disable automatic sleep while on mains power. A UPS is recommended for the server and router.

Run the following in an elevated PowerShell **on the intended restaurant server**, after setting its network profile to Private:

```powershell
New-NetFirewallRule -DisplayName 'FUDO Restaurant LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet
```

Do not configure router port forwarding. HTTP on a trusted isolated LAN is supported. For encrypted traffic, place an HTTPS reverse proxy with a certificate trusted by staff devices in front of the server and set `COOKIE_SECURE=true`. Leave this setting false for direct HTTP or browsers will not send the session cookie. Devices need current Chrome, Edge, or another browser supporting EventSource and modern JavaScript.

## 3. Automatic startup

PostgreSQL's Windows installer can register PostgreSQL as a Windows service. Set it to start automatically.

Register FUDO as a Windows Scheduled Task using `scripts/install-startup.ps1` from an elevated PowerShell. It creates an at-startup task under the Windows account you select, restarts after failure, runs with hidden windows, and does not require an interactive login. The account needs read access to the application, write access to its logs, and access to the backup destination. Use the same account for PostgreSQL backup verification. Do not use the SYSTEM account for network-share backups.

```powershell
.\scripts\install-startup.ps1 -ProjectPath 'C:\FUDO' -NodePath 'C:\Program Files\nodejs\node.exe'
```

The script prompts for credentials locally through Windows. It waits for PostgreSQL availability by restarting the process after failed starts. Check Task Scheduler and `logs/server.log`. Reboot once and confirm the login screen, kitchen feed, and database are available without a user login. The script is provided for installation; running it changes host startup configuration.

## 4. Backups

The server checks on startup and hourly, and backs up once 24 hours have elapsed since the last success. It calls `pg_dump` in custom format, writes a `.partial` file, renames only after success, and retains the latest 30 successful archives. Failed dumps are not marked successful. Administration displays the last successful backup and the most recent failure. The database password is passed through the child process environment, not a command-line argument.

To create a manual backup:

```powershell
pnpm backup
```

Task Scheduler must keep FUDO running for automatic backups to execute. Check the backup status daily. Copy archives to another trusted device periodically. Archives contain restaurant records and password hashes; restrict access accordingly.

## 5. Restore rehearsal

Create a separate empty database owned by `fudo`, for example `fudo_restore_check`, using SQL Shell. Verify an archive without touching the live database:

```powershell
pnpm restore:verify 'D:\FudoBackups\fudo-YYYY-MM-DDTHH-MM-SS-SSSZ.dump' 'postgresql://fudo:PASSWORD@127.0.0.1:5432/fudo_restore_check'
```

This refuses a nonempty destination. A successful command validates that PostgreSQL can restore the archive and read the core records. Then temporarily start a second FUDO instance on another port against the verification database, with a different backup destination. Sign in and check a receipt, active kitchen order, stock balance, cash ledger, and report totals against the original. Do not run real transactions in the restored copy. Perform this rehearsal before opening day and after upgrades.

For an actual recovery, stop FUDO, restore to a **new empty database**, verify its records, update `DATABASE_URL`, and restart FUDO. Keep the damaged database and original archive until recovery is accepted. Never restore directly over the only copy of live data. Sessions are included in dumps; invalidate them after recovery using `DELETE FROM sessions;` in the recovered database so staff sign in again.

## 6. Receipts and failure handling

- Receipts use browser printing with an 80 mm layout. Select the correct local printer, turn off browser headers/footers, and test margins. Browser dialogs remain visible; silent printing and drawer-kick commands are not included.
- A disconnected device shows a warning and cannot submit new commands. After reconnecting, the app reloads server state.
- If a submission outcome is unknown, use **Check submission** before doing anything else. The same idempotency key is reused. Do not recreate the sale in another tab while its outcome is unknown.
- Unsent order selections are held in the current browser tab only. Refreshing or closing the tab loses unsent selections. Sent orders, receipts, and kitchen state are persisted.
- A paid order stays on its table until all rounds are served. For takeaway, mark a ready round collected from POS. A refund records money returned; it does not stop kitchen preparation or restore inventory automatically.
- Cancel sent items before voiding an order. Stock reversals on cancellations represent unused packaged goods; if a cancelled bottle cannot be returned to stock, record a corresponding wastage adjustment.
- If the server is unavailable, stop entering electronic orders and use the restaurant's documented manual fallback. This release does not accept offline transactions.

## 7. Maintenance

Before updates: take and verify a backup, stop FUDO, install the new version and locked dependencies, run tests/build, then restart. Preserve `.env` and database records. The current schema is version 1; initial creation is idempotent and does not erase existing data.

The repository currently serializes writes through a PostgreSQL transaction advisory lock, loading typed aggregate records and persisting only changed records. It is intentionally scoped to one restaurant. Unique database indexes independently protect active tables, register shifts, cashier shifts, order numbers, and usernames. Menu/order aggregate details use JSONB; money uses integer minor units. Do not connect multiple independent application servers to one database: live events are process-local. Monitor response time and database size; partitioning, archival, and query optimization are future capacity work, not an included multi-branch design.
