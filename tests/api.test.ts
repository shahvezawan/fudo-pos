import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createApp, errorHandler } from '../server/app.js';
import { database, migrate, load, save, type Database, type SQL } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { emptyState } from '../shared/types.js';
import sharp from 'sharp';

test('HTTP transactions: concurrent edits, idempotency, rollback, authorization, persistence and privacy', async () => {
  let db: Database;
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    delete process.env.DEV_DATABASE;
    db = await database();
  } else {
    const pg = new PGlite();
    await pg.waitReady;
    db = {
      query: (q, p) => pg.query(q, p),
      transaction: (f) => pg.transaction((tx) => f(tx as SQL)),
      close: () => pg.close(),
    };
  }
  await migrate(db);
  const s = emptyState();
  const hash = await hashPassword('Testing12345!');
  s.users = ['owner', 'waiter', 'cashier', 'kitchen'].map((role) => ({
    id: role,
    name: role,
    username: role,
    role: role as any,
    active: true,
    passwordHash: hash,
  }));
  s.settings = [
    {
      id: 'restaurant',
      name: 'Test',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      cutoff: '04:00',
      footer: 'Thanks',
      address: '',
      tables: [
        { id: 't1', name: '1', seats: 4 },
        { id: 't2', name: '2', seats: 4 },
      ],
      registers: [{ id: 'r1', name: 'Main' }],
    },
  ];
  s.stock = [{ id: 'water', name: 'Water', unit: 'bottles', active: true }];
  s.menu = [
    {
      id: 'water',
      name: 'Water',
      category: 'Drinks',
      price: 123,
      available: true,
      kind: 'item',
      description: '',
      icon: 'drink',
      stockId: 'water',
      variants: [],
      addons: [],
      components: [],
    },
  ];
  await db.transaction((tx) => save(tx, s, emptyState()));
  const { app, close } = createApp(db);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const cookies: Record<string, string> = {};
  const req = async (path: string, body?: unknown, role = 'owner') => {
    const res = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Cookie: cookies[role] ?? '' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json() };
  };
  const cmd = (action: string, data: unknown, role = 'owner', key = randomUUID()) =>
    req('/api/commands', { action, data, key }, role);
  try {
    for (const role of ['owner', 'waiter', 'cashier', 'kitchen']) {
      const r = await fetch(base + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: role, password: 'Testing12345!' }),
      });
      assert.equal(r.status, 200);
      cookies[role] = r.headers.get('set-cookie')!.split(';')[0];
    }
    assert.equal((await req('/api/state', undefined, 'anonymous')).status, 401);
    assert.equal((await cmd('expense.post', {}, 'waiter')).status, 403);
    const competing = await Promise.all([
      cmd('order.open', { type: 'dine-in', tableId: 't1' }, 'waiter'),
      cmd('order.open', { type: 'dine-in', tableId: 't1' }, 'waiter'),
      cmd('order.open', { type: 'dine-in', tableId: 't1' }, 'cashier'),
    ]);
    assert.deepEqual(competing.map((x) => x.status).sort(), [200, 409, 409]);
    const order = (await load(db)).orders[0];
    const rollback = await cmd(
      'order.send',
      {
        orderId: order.id,
        version: 1,
        lines: [
          { itemId: 'water', quantity: 1 },
          { itemId: 'missing', quantity: 1 },
        ],
      },
      'waiter',
    );
    assert.equal(rollback.status, 404);
    assert.equal((await load(db)).stockMovements.length, 0);
    const competingEdits = await Promise.all([
      cmd(
        'order.send',
        { orderId: order.id, version: 1, lines: [{ itemId: 'water', quantity: 2 }] },
        'waiter',
      ),
      cmd(
        'order.send',
        { orderId: order.id, version: 1, lines: [{ itemId: 'water', quantity: 1 }] },
        'waiter',
      ),
      cmd(
        'order.send',
        { orderId: order.id, version: 1, lines: [{ itemId: 'water', quantity: 3 }] },
        'cashier',
      ),
    ]);
    assert.deepEqual(competingEdits.map((x) => x.status).sort(), [200, 409, 409]);
    let current = (await load(db)).orders[0];
    assert.equal(current.rounds.length, 1);
    assert.equal((await load(db)).stockMovements.length, 1);
    const open = await cmd(
      'cash.open',
      { registerId: 'r1', cashierId: 'cashier', opening: 1000 },
      'cashier',
    );
    assert.equal(open.status, 200);
    const key = randomUUID(),
      payload = {
        orderId: order.id,
        version: current.version,
        method: 'cash',
        tendered: 1000,
        sessionId: open.data.id,
      };
    const duplicated = await Promise.all([
      cmd('order.pay', payload, 'cashier', key),
      cmd('order.pay', payload, 'cashier', key),
    ]);
    assert.deepEqual(
      duplicated.map((x) => x.status),
      [200, 200],
    );
    assert.equal((await load(db)).cashMovements.length, 1);
    assert.equal(
      (await cmd('order.pay', { ...payload, tendered: 1100 }, 'cashier', key)).status,
      409,
    );
    const snapshot = await req('/api/state', undefined, 'kitchen');
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.data.state.orders[0].rounds[0].lines[0].price, 0);
    assert.equal(snapshot.data.state.orders[0].payment, undefined);
    assert.equal(JSON.stringify(snapshot.data).includes('passwordHash'), false);
    current = (await load(db)).orders[0];
    assert.equal(
      (
        await cmd(
          'order.refund',
          {
            orderId: order.id,
            version: current.version,
            reason: 'No approval',
            sessionId: open.data.id,
          },
          'cashier',
        )
      ).status,
      403,
    );
    const approve = await req(
      '/api/commands',
      {
        key: randomUUID(),
        action: 'order.refund',
        data: {
          orderId: order.id,
          version: current.version,
          reason: 'Approved',
          sessionId: open.data.id,
        },
        approval: { username: 'owner', password: 'Testing12345!' },
      },
      'cashier',
    );
    assert.equal(approve.status, 200);
    assert.equal((await load(db)).cashMovements.length, 2);
    const report = await req('/api/reports?from=2020-01-01&to=2030-01-01');
    assert.equal(report.status, 200);
    assert.equal(report.data.net, 0);
    assert.equal(
      (await req('/api/reports?from=2020-01-01&to=2030-01-01', undefined, 'cashier')).status,
      403,
    );
    const persisted = await load(db);
    assert.equal(persisted.orders[0].paymentStatus, 'refunded');
    assert.equal(persisted.orders[0].rounds.length, 1);
    assert.ok(persisted.audit.some((a) => a.approverId === 'owner'));
    const png = await sharp({
      create: { width: 10, height: 10, channels: 4, background: '#cc6633' },
    })
      .png()
      .toBuffer();
    const upload = (kind: string, role: string, bytes: Buffer = png) =>
      fetch(`${base}/api/images/${kind}/${kind === 'logo' ? 'restaurant' : 'water'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png', Cookie: cookies[role] },
        body: new Uint8Array(bytes),
      });
    assert.equal((await upload('menu', 'waiter')).status, 403);
    const first = await upload('menu', 'owner');
    assert.equal(first.status, 200);
    const v1 = (await first.json()).version;
    assert.equal((await upload('menu', 'owner', Buffer.from('not an image'))).status, 400);
    const png2 = await sharp({
      create: { width: 12, height: 12, channels: 3, background: '#338855' },
    })
      .png()
      .toBuffer();
    const second = await upload('menu', 'owner', png2);
    assert.equal(second.status, 200);
    const v2 = (await second.json()).version;
    assert.notEqual(v1, v2);
    assert.equal(
      (await db.query("SELECT count(*)::int AS count FROM images WHERE owner_key='menu:water'"))
        .rows[0].count,
      1,
    );
    assert.equal((await load(db)).menu[0].imageVersion, v2);
    const image = await fetch(`${base}/api/images/menu/water`, {
      headers: { Cookie: cookies.owner },
    });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/webp');
    assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).width, 12);
    assert.equal((await upload('logo', 'cashier')).status, 403);
    assert.equal((await upload('logo', 'owner')).status, 200);
    const logoVersion = (await load(db)).settings[0].logoVersion;
    assert.ok(logoVersion);
    assert.equal((await upload('logo', 'owner', png2)).status, 200);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM images WHERE owner_key='logo:restaurant'",
        )
      ).rows[0].count,
      1,
    );
    assert.notEqual((await load(db)).settings[0].logoVersion, logoVersion);
    const itemsCsv = await fetch(
      `${base}/api/reports?from=2020-01-01&to=2030-01-01&format=csv&view=items`,
      { headers: { Cookie: cookies.owner } },
    );
    assert.equal(itemsCsv.status, 200);
    assert.ok((await itemsCsv.text()).includes('Item-wise sales'));
    const dealsCsv = await fetch(
      `${base}/api/reports?from=2020-01-01&to=2030-01-01&format=csv&view=deals`,
      { headers: { Cookie: cookies.owner } },
    );
    assert.equal(dealsCsv.status, 200);
    assert.ok((await dealsCsv.text()).includes('Deals report'));
  } finally {
    close();
    await new Promise<void>((r) => server.close(() => r()));
    await db.close();
  }
});
