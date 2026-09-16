import EmbeddedPostgres from 'embedded-postgres';
import path from 'node:path';
import { mkdir, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
await mkdir('artifacts', { recursive: true });
const root = path.resolve('artifacts', `postgres-${randomUUID()}`);
const cluster = new EmbeddedPostgres({
  databaseDir: root,
  user: 'fudo_test',
  password: 'LocalTestOnly2026!',
  port: 55439,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
const url = 'postgresql://fudo_test:LocalTestOnly2026!@127.0.0.1:55439/fudo_check';
const run = (file, args, env = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(file, args, {
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, ...env },
    });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Command exited ${code}`))));
  });
try {
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase('fudo_check');
  console.log('Native PostgreSQL test instance started on loopback.');
  await run(process.execPath, ['--import', 'tsx', '--test', 'tests/api.test.ts'], {
    TEST_DATABASE_URL: url,
  });
  if (process.env.PG_BIN) {
    const backupDir = path.resolve(root, 'backups');
    await run(process.execPath, ['--import', 'tsx', 'server/backup-cli.ts'], {
      DATABASE_URL: url,
      BACKUP_DIR: backupDir,
      DEV_DATABASE: '',
    });
    const dump = (await readdir(backupDir)).find((x) => x.endsWith('.dump'));
    if (!dump) throw new Error('Backup archive missing.');
    await cluster.createDatabase('fudo_restore_check');
    const target = url.replace('/fudo_check', '/fudo_restore_check');
    await run(
      process.execPath,
      ['--import', 'tsx', 'server/restore-verify.ts', path.join(backupDir, dump), target],
      { DATABASE_URL: url },
    );
    const original = new Pool({ connectionString: url }),
      restored = new Pool({ connectionString: target });
    try {
      for (const table of ['orders', 'users', 'cashMovements', 'stockMovements', 'audit']) {
        const sql = `SELECT data FROM "${table}" ORDER BY id`;
        const a = await original.query(sql),
          b = await restored.query(sql);
        if (JSON.stringify(a.rows) !== JSON.stringify(b.rows))
          throw new Error(`Restore mismatch: ${table}`);
      }
      console.log(
        'PASS: Native PostgreSQL transactions, backup and full record comparison after clean restore.',
      );
    } finally {
      await original.end();
      await restored.end();
    }
  } else
    console.log(
      'PASS: Native PostgreSQL transactions. Set PG_BIN to also test pg_dump / pg_restore.',
    );
} finally {
  await cluster.stop();
  console.log('Portable PostgreSQL stopped; test artifacts retained at ' + root);
}
