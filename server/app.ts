import express from 'express';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import { type Database, load, save } from './db.js';
import { execute, AppError, fail, permitted } from './domain.js';
import { hashPassword, verifyPassword, tokenHash, newToken } from './auth.js';
import { type State, type User, emptyState, managerRoles } from '../shared/types.js';
import { businessDate, report, csv } from './reports.js';
import { replaceImage } from './images.js';

export function createApp(db: Database) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', (_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.get('origin');
      if (origin && new URL(origin).host !== req.get('host')) {
        res.status(403).json({ error: 'Cross-origin requests are blocked.' });
        return;
      }
    }
    next();
  });
  const clients = new Set<express.Response>();
  const publish = () => {
    for (const res of clients) res.write('event: changed\ndata: {}\n\n');
  };
  const attempts = new Map<string, { count: number; until: number }>();
  const limit = (req: express.Request) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    if (attempts.size > 1000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
    let a = attempts.get(key);
    if (!a || a.until < now) {
      a = { count: 0, until: now + 15 * 60_000 };
      attempts.set(key, a);
    }
    if (++a.count > 30) fail('Too many authentication attempts. Try again in 15 minutes.', 429);
  };
  const safeUser = (u: User) => {
    const { passwordHash, ...safe } = u;
    return safe;
  };
  const authenticated = async (req: express.Request) => {
    const raw = req.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('fudo_session='))
      ?.slice(13);
    if (!raw) fail('Sign in to continue.', 401);
    const r = await db.query(
      `SELECT u.data FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>now()`,
      [tokenHash(raw)],
    );
    const u = r.rows[0]?.data as User | undefined;
    if (!u?.active) fail('Your session expired. Sign in again.', 401);
    return u;
  };
  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ ok: true });
  });
  app.get('/api/images/:kind/:id', async (req, res) => {
    await authenticated(req);
    const row = (
      await db.query('SELECT content FROM images WHERE owner_key=$1', [
        `${req.params.kind}:${req.params.id}`,
      ])
    ).rows[0];
    if (!row) fail('Image not found.', 404);
    res.type('image/webp').send(Buffer.from(row.content, 'base64'));
  });
  app.post(
    '/api/images/:kind/:id',
    async (req, _res, next) => {
      const u = await authenticated(req);
      permitted(u, req.params.kind === 'logo' ? ['owner'] : ['owner', 'manager']);
      next();
    },
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
    async (req, res) => {
      const u = await authenticated(req);
      if (!Buffer.isBuffer(req.body)) fail('Use a JPEG, PNG, or WebP image.');
      const result = await replaceImage(
        db,
        u.id,
        String(req.params.kind),
        String(req.params.id),
        req.body,
      );
      publish();
      res.json(result);
    },
  );
  app.get('/api/setup', async (_req, res) => {
    res.json({
      required: !(await db.query('SELECT id FROM users LIMIT 1')).rows.length,
      development: process.env.DEV_DATABASE === 'pglite',
    });
  });
  app.post('/api/setup', async (req, res) => {
    limit(req);
    const d = z
      .object({
        token: z.string(),
        name: z.string().trim().min(1).max(100),
        username: z.string().trim().min(3).max(50),
        password: z.string().min(10).max(128),
        restaurant: z.string().trim().min(1).max(100),
        currency: z.string().regex(/^[A-Z]{3}$/),
        timezone: z.string().min(1).max(100),
      })
      .parse(req.body);
    if (!process.env.SETUP_TOKEN || tokenHash(d.token) !== tokenHash(process.env.SETUP_TOKEN))
      fail('Incorrect installation setup token.', 403);
    try {
      new Intl.DateTimeFormat('en', { timeZone: d.timezone });
    } catch {
      fail('Invalid timezone.');
    }
    const passwordHash = await hashPassword(d.password);
    await db.transaction(async (tx) => {
      const before = await load(tx);
      if (before.users.length) fail('Setup has already been completed.', 409);
      const s = structuredClone(before);
      s.users.push({
        id: randomUUID(),
        name: d.name,
        username: d.username.toLowerCase(),
        role: 'owner',
        active: true,
        passwordHash,
      });
      s.settings.push({
        id: 'restaurant',
        name: d.restaurant,
        currency: d.currency,
        timezone: d.timezone,
        cutoff: '04:00',
        footer: 'Thank you for dining with us.',
        address: '',
        tables: Array.from({ length: 12 }, (_, i) => ({
          id: `t${i + 1}`,
          name: `Table ${String(i + 1).padStart(2, '0')}`,
          seats: i < 8 ? 4 : 6,
        })),
        registers: [{ id: 'main', name: 'Main counter' }],
      });
      await save(tx, s, before);
    });
    res.json({ ok: true });
  });
  app.post('/api/login', async (req, res) => {
    limit(req);
    const d = z
      .object({ username: z.string().max(100), password: z.string().max(128) })
      .parse(req.body);
    const r = await db.query(`SELECT data FROM users WHERE lower(data->>'username')=$1`, [
      d.username.trim().toLowerCase(),
    ]);
    const u = r.rows[0]?.data as User | undefined;
    if (!u?.active || !(await verifyPassword(d.password, u.passwordHash ?? '')))
      fail('Incorrect username or password.', 401);
    const token = newToken();
    await db.query('DELETE FROM sessions WHERE expires_at<now()');
    await db.query(
      `INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')`,
      [tokenHash(token), u.id],
    );
    res.cookie('fudo_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: 12 * 3600_000,
      path: '/',
    });
    res.json({ user: safeUser(u) });
  });
  app.post('/api/logout', async (req, res) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith('fudo_session='))
      ?.slice(13);
    if (token) await db.query('DELETE FROM sessions WHERE token=$1', [tokenHash(token)]);
    res.clearCookie('fudo_session', { path: '/' });
    res.json({ ok: true });
  });
  app.get('/api/state', async (req, res) => {
    const u = await authenticated(req);
    const s = await db.transaction((tx) => load(tx));
    if (managerRoles.includes(u.role)) {
      s.users = s.users.map(safeUser);
      res.json({
        user: safeUser(u),
        state: s,
        businessDate: businessDate(new Date().toISOString(), s.settings[0]),
      });
      return;
    }
    const scoped = emptyState();
    scoped.settings = s.settings;
    scoped.orders =
      u.role === 'cashier'
        ? s.orders
        : s.orders.filter(
            (o) =>
              o.status === 'open' ||
              o.rounds.some((r) => r.cancellations.some((c) => !c.acknowledged)),
          );
    scoped.menu = u.role === 'kitchen' ? [] : s.menu;
    if (u.role === 'cashier') {
      scoped.cashSessions = s.cashSessions.filter((c) => c.cashierId === u.id);
      scoped.cashMovements = s.cashMovements.filter((m) =>
        scoped.cashSessions.some((c) => c.id === m.sessionId),
      );
    }
    if (u.role === 'kitchen')
      scoped.orders = scoped.orders.map((o) => ({
        ...o,
        discount: 0,
        payment: undefined,
        refund: undefined,
        rounds: o.rounds.map((r) => ({ ...r, lines: r.lines.map((l) => ({ ...l, price: 0 })) })),
      }));
    scoped.users = [safeUser(u)];
    res.json({
      user: safeUser(u),
      state: scoped,
      businessDate: businessDate(new Date().toISOString(), s.settings[0]),
    });
  });
  app.get('/api/events', async (req, res) => {
    await authenticated(req);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    res.write('event: connected\ndata: {}\n\n');
    clients.add(res);
    const pulse = setInterval(() => res.write(': heartbeat\n\n'), 15000);
    const expiry = setTimeout(() => res.end(), 30 * 60_000);
    req.on('close', () => {
      clients.delete(res);
      clearInterval(pulse);
      clearTimeout(expiry);
    });
  });
  app.post('/api/commands', async (req, res) => {
    const initialUser = await authenticated(req);
    const input = z
      .object({
        key: z.string().uuid(),
        action: z.string().max(80),
        data: z.unknown(),
        approval: z
          .object({ username: z.string().max(100), password: z.string().max(128) })
          .optional(),
      })
      .parse(req.body);
    if (input.approval) limit(req);
    const hash = tokenHash(JSON.stringify({ action: input.action, data: input.data }));
    const result = await db.transaction(async (tx) => {
      const previous = (await tx.query('SELECT * FROM commands WHERE key=$1', [input.key])).rows[0];
      if (previous) {
        if (previous.user_id !== initialUser.id || previous.hash !== hash)
          fail('Submission key is already used by another command.', 409);
        return previous.result;
      }
      const s = await load(tx),
        before = structuredClone(s);
      const user =
        s.users.find((u) => u.id === initialUser.id && u.active) ??
        fail('Account is disabled.', 401);
      let approver: User | undefined;
      if (input.approval) {
        approver = s.users.find(
          (u) =>
            u.username.toLowerCase() === input.approval!.username.toLowerCase() &&
            u.active &&
            managerRoles.includes(u.role),
        );
        if (
          !approver ||
          !(await verifyPassword(input.approval.password, approver.passwordHash ?? ''))
        )
          fail('Manager credentials are incorrect.', 403);
      }
      let result: { id?: string };
      if (input.action === 'user.save') {
        permitted(user, ['owner']);
        const d = z
          .object({
            id: z.string().optional(),
            name: z.string().trim().min(1).max(100),
            username: z.string().trim().min(3).max(50),
            role: z.enum(['owner', 'manager', 'cashier', 'waiter', 'kitchen']),
            active: z.boolean(),
            password: z.string().min(10).max(128).optional(),
          })
          .parse(input.data);
        const existing = d.id ? s.users.find((u) => u.id === d.id) : undefined;
        if (d.id && !existing) fail('User not found.', 404);
        if (!existing && !d.password) fail('New users need a password.');
        if (
          s.users.some(
            (u) => u.id !== d.id && u.username.toLowerCase() === d.username.toLowerCase(),
          )
        )
          fail('Username already exists.');
        if (
          existing?.role === 'owner' &&
          (!d.active || d.role !== 'owner') &&
          !s.users.some((u) => u.id !== d.id && u.role === 'owner' && u.active)
        )
          fail('At least one active owner must remain.');
        if (
          existing &&
          (!d.active || !['owner', 'manager', 'cashier'].includes(d.role)) &&
          s.cashSessions.some((c) => c.cashierId === existing.id && !c.closedAt)
        )
          fail('Close the user’s cash shift first.');
        const u: User = {
          id: existing?.id ?? randomUUID(),
          name: d.name,
          username: d.username.toLowerCase(),
          role: d.role,
          active: d.active,
          passwordHash: d.password ? await hashPassword(d.password) : existing!.passwordHash,
        };
        if (existing) Object.assign(existing, u);
        else s.users.push(u);
        if (existing) await tx.query('DELETE FROM sessions WHERE user_id=$1', [u.id]);
        s.audit.push({
          id: randomUUID(),
          at: new Date().toISOString(),
          userId: user.id,
          action: input.action,
          targetId: u.id,
        });
        result = { id: u.id };
      } else result = execute(s, user, input.action, input.data, approver);
      await save(tx, s, before);
      await tx.query('INSERT INTO commands(key,user_id,hash,result) VALUES($1,$2,$3,$4::jsonb)', [
        input.key,
        user.id,
        hash,
        JSON.stringify(result),
      ]);
      return result;
    });
    publish();
    res.json(result);
  });
  app.get('/api/reports', async (req, res) => {
    const u = await authenticated(req);
    permitted(u, ['owner', 'manager']);
    const d = z
      .object({
        from: z.iso.date(),
        to: z.iso.date(),
        format: z.enum(['json', 'csv']).default('json'),
        view: z.enum(['all', 'items', 'deals']).default('all'),
      })
      .parse(req.query);
    if (d.from > d.to) fail('Start date must precede end date.');
    const s = await db.transaction((tx) => load(tx));
    const r = report(s, d.from, d.to);
    if (d.format === 'csv') {
      const itemRows: unknown[][] = [
        ['Item-wise sales', d.from, d.to],
        [
          'Item',
          'Direct quantity',
          'Quantity in deals',
          'Total quantity',
          'Gross',
          'Discount',
          'Net before refunds',
        ],
        ...r.items.map((x) => [
          x.name,
          x.directQuantity,
          x.dealQuantity,
          x.quantity,
          x.gross / 100,
          x.discount / 100,
          x.net / 100,
        ]),
      ];
      const dealRows: unknown[][] = [
        ['Deals report', d.from, d.to],
        ['Deal', 'Quantity', 'Gross', 'Discount', 'Net before refunds'],
        ...r.deals.map((x) => [x.name, x.quantity, x.gross / 100, x.discount / 100, x.net / 100]),
      ];
      if (d.view !== 'all') {
        res
          .type('text/csv')
          .attachment(`fudo-${d.view}-${d.from}-${d.to}.csv`)
          .send(csv(d.view === 'items' ? itemRows : dealRows));
        return;
      }
      const rows: unknown[][] = [
        ['FUDO sales report', d.from, d.to],
        ['Sales', r.sales / 100],
        ['Refunds', r.refunded / 100],
        ['Net collected', r.net / 100],
        [],
        ...itemRows,
        [],
        ...dealRows,
        ['Deal revenue is already allocated in item-wise sales; do not add the reports together.'],
        [],
        ['Payment method', 'Sales', 'Refunds'],
        ...r.payments.map((p) => [p.method, p.sales / 100, p.refunds / 100]),
        [],
        ['Refund order', 'Amount', 'Time', 'Reason'],
        ...r.refunds.map((x) => [x.number, x.amount / 100, x.at, x.reason]),
        [],
        ['Purchase', 'Supplier', 'Date', 'Total', 'Reversed'],
        ...r.purchases.map((p) => [
          p.id,
          s.suppliers.find((x) => x.id === p.supplierId)?.name,
          p.date,
          p.total / 100,
          p.reversedAt ?? '',
        ]),
        [],
        ['Expense', 'Date', 'Amount', 'Method', 'Reversed'],
        ...r.expenses.map((e) => [
          e.category,
          e.date,
          e.amount / 100,
          e.method,
          e.reversedAt ?? '',
        ]),
        [],
        ['Supplier', 'Current balance'],
        ...r.suppliers.map((x) => [x.name, x.balance / 100]),
        [],
        ['Shift', 'Opening', 'Expected', 'Counted', 'Variance'],
        ...r.shifts.map((c) => [
          c.id,
          c.opening / 100,
          c.expected === undefined ? '' : c.expected / 100,
          c.counted === undefined ? '' : c.counted / 100,
          c.variance === undefined ? '' : c.variance / 100,
        ]),
      ];
      res.type('text/csv').attachment(`fudo-${d.from}-${d.to}.csv`).send(csv(rows));
    } else res.json(r);
  });
  return {
    app,
    publish,
    close: () => {
      for (const res of clients) res.end();
    },
  };
}
export const errorHandler: express.ErrorRequestHandler = (error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'The upload is too large. Choose an image under 5 MB.' });
    return;
  }
  if (error instanceof ZodError) {
    res
      .status(400)
      .json({ error: error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error?.code === '23505') {
    res
      .status(409)
      .json({ error: 'This record conflicts with an existing record. Refresh and retry.' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'The request could not be completed. Check the server log.' });
};
