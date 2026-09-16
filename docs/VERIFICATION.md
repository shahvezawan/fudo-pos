# Verification record

Implemented and checked on Windows on 2026-09-16.

## Passed

- TypeScript strict checking and Vite production build.
- Domain tests for table exclusivity, role permissions, optimistic versions, deal stock deduction/cancellation, manager approval, cash change/refunds, purchases/payments/reversals, closing variance, report allocation, business-day cutoff, and CSV formula safety.
- API tests against PGlite and a portable native PostgreSQL 18.4 instance: concurrent table claims and order edits, transactional rollback, idempotent payment retries, server-enforced restrictions, kitchen financial-data filtering, and retained audit records.
- Headless Chrome inspection of all screens, desktop captures, and a 390px-wide mobile POS without horizontal document overflow.
- Browser service workflow: add an item/note, send to kitchen, cash checkout, preparing/ready, mark served, and render a historical receipt.
- Browser management workflow: stock item creation and physical count, menu entry and decimal price, purchase receipt and supplier payment from a drawer, expense posting, correct stock balance, offline mutation blocking, and reconnection recovery.
- Native PostgreSQL `pg_dump` creates a successful custom-format archive and records backup status.
- Refinement tests: 11 automated tests pass, including closing empty orders without a reason, expanded deal-item quantities/revenue, stable legacy report allocation, image validation, upload permissions, and replacement retaining just one image row per owner.
- Browser verification of immediate empty-order closing, menu-image replacement, restaurant-logo replacement and print rendering, distinct report exports, and all screens at 320, 390, 768, 1024 and 1440 px without horizontal page overflow.

## Outstanding target-host checks

- **Restore rehearsal is blocked on this host:** Windows Application Control prevents `pg_restore.exe` from launching. No restore success is claimed. Run the documented `restore:verify` command using an approved PostgreSQL installation on the deployment host, then verify historical receipts, live tickets, stock, cash and report totals.
- Install PostgreSQL as a Windows service, configure the dedicated machine, apply the LAN firewall rule, register and reboot-test automatic startup.
- Connect the actual receipt printer and verify its paper width, margins and browser print settings.
- Test on the restaurant's Wi-Fi and devices, with internet disconnected; verify backup permissions and retention on the real second drive or network share.

The running development preview uses isolated sample data. It is not the production database or a completed restaurant installation.
