// Isolated, opt-in development workspace. Never used by the production entrypoint.
export {};
process.env.NODE_ENV = 'development';
process.env.DEV_DATABASE = 'pglite';
process.env.DEV_DATA_DIR ??= '.dev-data';
process.env.HOST = '127.0.0.1';
const { database, migrate, load, save } = await import('./db.js');
const { hashPassword } = await import('./auth.js');
const { execute } = await import('./domain.js');
const { emptyState } = await import('../shared/types.js');
const db = await database();
await migrate(db);
await db.transaction(async (tx) => {
  const before = await load(tx);
  if (before.users.length) return;
  const s = emptyState();
  const hash = await hashPassword('FudoDemo2026!');
  s.users = [
    {
      id: 'owner',
      name: 'Alex Morgan',
      username: 'owner',
      role: 'owner',
      active: true,
      passwordHash: hash,
    },
    {
      id: 'cashier',
      name: 'Sam Taylor',
      username: 'cashier',
      role: 'cashier',
      active: true,
      passwordHash: hash,
    },
    {
      id: 'waiter',
      name: 'Jamie Lee',
      username: 'waiter',
      role: 'waiter',
      active: true,
      passwordHash: hash,
    },
    {
      id: 'kitchen',
      name: 'Chef Robin',
      username: 'kitchen',
      role: 'kitchen',
      active: true,
      passwordHash: hash,
    },
  ];
  s.settings = [
    {
      id: 'restaurant',
      name: 'The Good Table',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      cutoff: '04:00',
      footer: 'Good food. Good company. See you again.',
      address: 'Main restaurant · Local development',
      tables: Array.from({ length: 12 }, (_, i) => ({
        id: `t${i + 1}`,
        name: `Table ${String(i + 1).padStart(2, '0')}`,
        seats: i < 8 ? 4 : 6,
      })),
      registers: [{ id: 'main', name: 'Main counter' }],
    },
  ];
  const owner = s.users[0];
  const call = (a: string, d: unknown, at?: string) => execute(s, owner, a, d, undefined, at);
  call('stock.save', { name: 'Sparkling water', unit: 'bottles', active: true });
  const stock = s.stock[0];
  call('stock.adjust', {
    stockId: stock.id,
    kind: 'count',
    quantity: 72,
    reason: 'Development opening count',
  });
  const menu = [
    [
      'Classic smash burger',
      'Burgers',
      89000,
      'Double smashed beef, cheddar & house sauce',
      'sandwich',
    ],
    ['Crispy chicken burger', 'Burgers', 79000, 'Golden chicken, slaw & a little kick', 'sandwich'],
    ['Fire-grilled chicken', 'Mains', 129000, 'Chargrilled chicken, herbed rice & greens', 'flame'],
    ['Garden harvest bowl', 'Mains', 69000, 'Seasonal greens, grains & lemon dressing', 'leaf'],
    ['Golden loaded fries', 'Sides', 49000, 'Crispy fries, melted cheese & herbs', 'flame'],
    ['House coleslaw', 'Sides', 25000, 'Fresh cabbage, carrots & creamy dressing', 'leaf'],
    ['Iced latte', 'Drinks', 45000, 'Espresso, chilled milk & plenty of ice', 'coffee'],
    ['Sparkling water', 'Drinks', 19000, 'A little sparkle for your table', 'drink'],
  ];
  for (const [name, category, price, description, icon] of menu)
    call('menu.save', {
      name,
      category,
      price,
      description,
      icon,
      kind: 'item',
      available: true,
      stockId: name === 'Sparkling water' ? stock.id : undefined,
      variants:
        name === 'Classic smash burger' ? [{ id: 'triple', name: 'Triple', price: 109000 }] : [],
      addons:
        name === 'Classic smash burger'
          ? [{ id: 'cheese', name: 'Extra cheese', price: 12000 }]
          : [],
      components: [],
    });
  call('menu.save', {
    name: 'The lunch duo',
    category: 'Deals',
    price: 119000,
    description: 'Smash burger, golden fries & sparkling water',
    icon: 'sandwich',
    kind: 'deal',
    available: true,
    variants: [],
    addons: [],
    components: [
      { itemId: s.menu[0].id, quantity: 1 },
      { itemId: s.menu[4].id, quantity: 1 },
      { itemId: s.menu[7].id, quantity: 1 },
    ],
  });
  call('supplier.save', { name: 'Fresh Market Co.', phone: '0300 000 0000' });
  call('cash.open', { registerId: 'main', cashierId: 'owner', opening: 1000000 });
  const shift = s.cashSessions[0];
  const now = Date.now();
  for (let i = 0; i < 18; i++) {
    const at = new Date(now - (18 - i) * 18 * 60000).toISOString();
    const { id } = call('order.open', { type: 'takeaway' }, at);
    let o = s.orders.find((o) => o.id === id)!;
    call(
      'order.send',
      {
        orderId: id,
        version: o.version,
        lines: [{ itemId: s.menu[i % 9].id, quantity: (i % 3) + 1, addonIds: [], note: '' }],
      },
      at,
    );
    call(
      'order.pay',
      {
        orderId: id,
        version: o.version,
        method: i % 3 === 0 ? 'card' : 'cash',
        tendered: 1000000,
        sessionId: shift.id,
      },
      at,
    );
    for (const status of ['preparing', 'ready', 'served'])
      call(
        'kitchen.status',
        { orderId: id, version: o.version, roundId: o.rounds[0].id, status },
        at,
      );
  }
  for (let i = 0; i < 4; i++) {
    const at = new Date(now - (i + 1) * 3 * 60000).toISOString();
    const { id } = call(
      'order.open',
      { type: i === 3 ? 'takeaway' : 'dine-in', tableId: i === 3 ? undefined : `t${i * 2 + 1}` },
      at,
    );
    const o = s.orders.find((o) => o.id === id)!;
    call(
      'order.send',
      {
        orderId: id,
        version: o.version,
        lines: [
          {
            itemId: s.menu[i].id,
            quantity: 2,
            addonIds: [],
            note: i === 1 ? 'Sauce on the side' : '',
          },
          { itemId: s.menu[7].id, quantity: 2, addonIds: [], note: '' },
        ],
      },
      at,
    );
    if (i !== 2)
      call(
        'kitchen.status',
        { orderId: id, version: o.version, roundId: o.rounds[0].id, status: 'preparing' },
        at,
      );
    if (i === 1)
      call(
        'kitchen.status',
        { orderId: id, version: o.version, roundId: o.rounds[0].id, status: 'ready' },
        at,
      );
  }
  await save(tx, s, before);
});
await db.close();
console.log('Development sign-in: owner / FudoDemo2026! (also cashier, waiter, kitchen).');
await import('./index.js');
