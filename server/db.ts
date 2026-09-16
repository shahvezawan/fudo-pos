import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { collections, emptyState, type State } from '../shared/types.js';
export interface SQL {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}
export interface Database extends SQL {
  transaction<T>(f: (db: SQL) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function database(): Promise<Database> {
  if (process.env.DEV_DATABASE === 'pglite') {
    if (process.env.NODE_ENV === 'production')
      throw new Error('PGlite development mode cannot be used in production.');
    const pg = new PGlite(process.env.DEV_DATA_DIR || '.dev-data');
    await pg.waitReady;
    return {
      query: (q, p) => pg.query(q, p),
      transaction: (f) => pg.transaction((tx) => f(tx as SQL)),
      close: () => pg.close(),
    };
  }
  if (!process.env.DATABASE_URL)
    throw new Error(
      'DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.',
    );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  return {
    query: (q, p) => pool.query(q, p),
    async transaction(f) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(824753)');
        const value = await f(c);
        await c.query('COMMIT');
        return value;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}
export async function migrate(db: SQL) {
  await db.query(
    `CREATE TABLE IF NOT EXISTS images (owner_key text PRIMARY KEY, version text NOT NULL, content text NOT NULL)`,
  );
  for (const name of collections)
    await db.query(
      `CREATE TABLE IF NOT EXISTS "${name}" (id text PRIMARY KEY, data jsonb NOT NULL CHECK (data->>'id' = id))`,
    );
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS username_unique ON users (lower(data->>'username'))`,
  );
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS occupied_table ON orders ((data->>'tableId')) WHERE data->>'status'='open' AND data->>'tableId' IS NOT NULL`,
  );
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS order_number ON orders (((data->>'number')::integer))`,
  );
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS active_register ON "cashSessions" ((data->>'registerId')) WHERE data->>'closedAt' IS NULL`,
  );
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS active_cashier ON "cashSessions" ((data->>'cashierId')) WHERE data->>'closedAt' IS NULL`,
  );
  await db.query(
    `CREATE TABLE IF NOT EXISTS sessions (token text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL)`,
  );
  await db.query(
    `CREATE TABLE IF NOT EXISTS commands (key text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`,
  );
  await db.query(`CREATE TABLE IF NOT EXISTS metadata (key text PRIMARY KEY,value text NOT NULL)`);
  await db.query(
    `INSERT INTO metadata(key,value) VALUES('schema','1') ON CONFLICT(key) DO NOTHING`,
  );
}
export async function load(db: SQL): Promise<State> {
  const s = emptyState();
  for (const c of collections)
    (s[c] as any[]) = (await db.query(`SELECT data FROM "${c}" ORDER BY id`)).rows.map(
      (r) => r.data,
    );
  return s;
}
export async function save(db: SQL, s: State, before: State) {
  for (const c of collections) {
    const old = new Map((before[c] as { id: string }[]).map((v) => [v.id, JSON.stringify(v)]));
    for (const v of s[c]) {
      const encoded = JSON.stringify(v);
      if (old.get(v.id) !== encoded)
        await db.query(
          `INSERT INTO "${c}"(id,data) VALUES($1,$2::jsonb) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data`,
          [v.id, encoded],
        );
    }
  }
}
