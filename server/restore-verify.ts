import 'dotenv/config';
import { Pool } from 'pg';
import { runPg } from './backup.js';
const [file, target] = process.argv.slice(2);
if (!file || !target)
  throw new Error('Usage: pnpm restore:verify <dump-file> <EMPTY-verification-database-url>');
if (target === process.env.DATABASE_URL)
  throw new Error('Use a separate empty verification database.');
const pool = new Pool({ connectionString: target });
try {
  const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  if (tables.rows.length) throw new Error('Verification database must be empty.');
  await runPg(
    'pg_restore',
    [
      '--exit-on-error',
      '--single-transaction',
      '--no-owner',
      '--no-acl',
      '--dbname',
      new URL(target).pathname.slice(1),
      file,
    ],
    target,
  );
  const r = await pool.query(
    'SELECT (SELECT count(*) FROM orders) AS orders,(SELECT count(*) FROM users) AS users,(SELECT count(*) FROM "cashMovements") AS cash_movements',
  );
  console.log('Restore verified:', r.rows[0]);
} finally {
  await pool.end();
}
