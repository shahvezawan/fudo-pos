# FUDO · Restaurant workspace

A local-network restaurant POS built with React, TypeScript, Node.js, Express, and PostgreSQL. No external fonts, CDNs, payment services, or cloud account are required during service.

## Quick development preview

```powershell
pnpm install --frozen-lockfile
pnpm dev:demo
```

Open **http://localhost:3000**. Sign in as `owner` with password `FudoDemo2026!`. Other sample accounts are `cashier`, `waiter`, and `kitchen`, using the same development-only password. The demo binds to localhost and persists its isolated PostgreSQL-compatible PGlite data in `.dev-data/`. It never connects to the production database. These sample credentials are never created by production startup.

## Production

See [Windows deployment and recovery](docs/DEPLOYMENT.md). Production requires a configured local PostgreSQL service. Copy `.env.example` to `.env`, configure the database and setup token, run `pnpm build`, then `pnpm start`. First run creates the schema and presents a restaurant/owner setup form.

## Included

- Dine-in/table and takeaway workflows, additional rounds, preparation notes, and table transfer.
- Live kitchen tickets, preparing/ready status, serving/collection, and cancellation acknowledgment.
- Fixed deals, sizes, priced add-ons, immutable bill snapshots, discounts, full refunds, browser receipts.
- Server-enforced owner/manager/cashier/waiter/kitchen permissions, manager approval, password hashing, persistent sessions, and audit history.
- Cash shifts, opening float, drawer movements, counted closing balance, and variance.
- Suppliers, purchase receipts, partial supplier payments, explicit reversals, expense entries, and stock movement history.
- Packaged-item stock deduction, deal component stock, physical counts, manual adjustments, and negative balance warnings.
- Business-day-aware dashboard, item-wise sales including items inside deals, a separate deals report, and separate item/deal CSV exports.
- Menu photo and restaurant logo uploads (JPEG/PNG/WebP, up to 5 MB). Replacement overwrites the previous image record; the current restaurant logo is also used on receipts.
- Phone and tablet layouts with touch controls, mobile navigation, and a shortcut to the current order.
- Transactional writes, optimistic order versions, idempotent submissions, reconnect refresh, and daily PostgreSQL backups.

## Verify

```powershell
pnpm test
pnpm build
```

Tests cover domain accounting and permissions, transaction rollback, concurrent submissions, duplicate payments, historical snapshots, report allocation, CSV safety, and HTTP authorization against a PostgreSQL-compatible in-memory test database. Native PostgreSQL installation, printer output, Windows auto-start, LAN firewall configuration, and external-drive recovery must also be rehearsed on the target restaurant hardware before trading.

`pnpm test:browser`, `pnpm test:operations`, and `pnpm test:refinements` use headless Chrome against an isolated sample server on port 3011 (`TEST_BASE_URL` can override it). They create sample transactions and upload test images. Start that sample server in a separate PowerShell window:

```powershell
$env:PORT = '3011'
$env:DEV_DATA_DIR = 'artifacts/browser-test-data'
pnpm dev:demo
```

`pnpm test:native` runs the HTTP tests against a temporary native PostgreSQL instance on loopback port 55439; set `PG_BIN` to an approved PostgreSQL tools directory to also exercise backup and clean restore. See [verification results and remaining deployment checks](docs/VERIFICATION.md).

## Layout

- `server/domain.ts`: validated operations and ledger rules.
- `server/app.ts`: authentication, API, idempotency, live events, permissions, and reports.
- `server/db.ts`: PostgreSQL persistence and schema/index initialization.
- `src/`: touch-friendly POS, kitchen, operations, reporting, and administration screens.
- `shared/types.ts`: typed aggregates and integer-money helpers.
- `scripts/`: Windows startup installation; `server/backup.ts`: daily archive scheduling.

Scope: one restaurant, one running application server, one payment method per bill, two-decimal currencies, no recipe consumption or tax engine. Operational entries retain reversals; records are not silently deleted. Unsent selections are tab-local; sent orders persist. This is an operational POS, not a statutory accounting or tax-invoicing system.

## Everyday shortcuts

- **Supplier payments:** Purchases → **Pay supplier**, choose a supplier and outstanding purchase, then record a full or partial payment. Each purchase also has **Record payment**. Cash-drawer selection is optional.
- **Pictures:** Menu & deals → Edit item → Menu item picture. Settings → Edit settings → Restaurant logo. Images are resized and stored in the local database, so database backups include them.
- **Empty orders:** Close empty order acts immediately without asking for a reason. Sent items must first be cancelled through the approved cancellation workflow.
- **Reports:** Item-wise sales combine direct and deal-component quantities. Deal revenue is allocated proportionally using component prices saved when the order was sent; older orders without saved prices, or bundles whose component prices are all zero, use component quantities. The separate deals report is another view of the same revenue, not an additional sales total. Both views are before refunds, which remain reported separately.
