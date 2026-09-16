import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { type Database, load, save } from './db.js';
export function pgEnvironment(url: string) {
  const u = new URL(url);
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.slice(1),
  };
}
export async function runPg(program: string, args: string[], url: string) {
  return new Promise<void>((resolve, reject) => {
    const executable = path.join(
      process.env.PG_BIN ?? '',
      program + (process.platform === 'win32' ? '.exe' : ''),
    );
    const child = spawn(executable, args, { env: pgEnvironment(url), windowsHide: true });
    let error = '';
    child.stderr.on('data', (d) => (error += d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${program} failed (${code}): ${error}`)),
    );
  });
}
let running = false;
export async function backup(db: Database) {
  if (running) return;
  running = true;
  try {
    if (!process.env.BACKUP_DIR || !process.env.DATABASE_URL)
      throw new Error('Configure BACKUP_DIR and DATABASE_URL.');
    const directory = path.resolve(process.env.BACKUP_DIR);
    await mkdir(directory, { recursive: true });
    const name = `fudo-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
    const dest = path.join(directory, name);
    await runPg(
      'pg_dump',
      ['--format=custom', '--file', dest + '.partial', '--no-owner', '--no-acl'],
      process.env.DATABASE_URL,
    );
    await rename(dest + '.partial', dest);
    const files = (await readdir(directory))
      .filter((x) => /^fudo-\d{4}-\d{2}-\d{2}T[\dTZ-]+\.dump$/.test(x))
      .sort()
      .reverse();
    for (const file of files.slice(30)) await unlink(path.join(directory, file));
    await db.transaction(async (tx) => {
      const s = await load(tx),
        before = structuredClone(s);
      if (s.settings[0]) {
        s.settings[0].lastBackup = new Date().toISOString();
        delete s.settings[0].backupError;
        await save(tx, s, before);
      }
    });
  } catch (e) {
    await db.transaction(async (tx) => {
      const s = await load(tx),
        before = structuredClone(s);
      if (s.settings[0]) {
        s.settings[0].backupError = e instanceof Error ? e.message : 'Backup failed';
        await save(tx, s, before);
      }
    });
    throw e;
  } finally {
    running = false;
  }
}
export function scheduleBackups(db: Database) {
  if (process.env.DEV_DATABASE === 'pglite') return () => {};
  const check = async () => {
    const r = await db.query(`SELECT data FROM settings WHERE id='restaurant'`);
    const cfg = r.rows[0]?.data;
    if (cfg && (!cfg.lastBackup || Date.now() - Date.parse(cfg.lastBackup) >= 86400000))
      await backup(db);
  };
  const timer = setInterval(
    () => void check().catch((e) => console.error('Backup:', e.message)),
    60 * 60_000,
  );
  void check().catch((e) => console.error('Backup:', e.message));
  return () => clearInterval(timer);
}
