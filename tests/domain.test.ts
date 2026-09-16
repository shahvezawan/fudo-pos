import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState,
  total,
  subtotal,
  balance,
  expectedCash,
  type User,
  type State,
} from '../shared/types.js';
import { execute } from '../server/domain.js';
import { report, businessDate, csv } from '../server/reports.js';
export function fixture() {
  const s = emptyState();
  s.settings = [
    {
      id: 'restaurant',
      name: 'Test',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      cutoff: '04:00',
      footer: 'Thanks',
      address: 'Test street',
      tables: [
        { id: 't1', name: 'One', seats: 4 },
        { id: 't2', name: 'Two', seats: 4 },
      ],
      registers: [
        { id: 'r1', name: 'Main' },
        { id: 'r2', name: 'Second' },
      ],
    },
  ];
  s.users = [
    { id: 'owner', name: 'Owner', username: 'owner', role: 'owner', active: true },
    { id: 'waiter', name: 'Waiter', username: 'waiter', role: 'waiter', active: true },
    { id: 'cashier', name: 'Cashier', username: 'cashier', role: 'cashier', active: true },
    { id: 'kitchen', name: 'Kitchen', username: 'kitchen', role: 'kitchen', active: true },
  ];
  s.stock = [{ id: 'water', name: 'Water', unit: 'bottles', active: true }];
  s.menu = [
    {
      id: 'burger',
      name: 'Burger',
      category: 'Food',
      price: 899,
      kind: 'item',
      available: true,
      description: '',
      icon: 'plate',
      variants: [{ id: 'large', name: 'Large', price: 1099 }],
      addons: [{ id: 'cheese', name: 'Cheese', price: 101 }],
      components: [],
    },
    {
      id: 'water',
      name: 'Water',
      category: 'Drinks',
      price: 100,
      kind: 'item',
      available: true,
      description: '',
      icon: 'drink',
      stockId: 'water',
      variants: [],
      addons: [],
      components: [],
    },
    {
      id: 'deal',
      name: 'Lunch deal',
      category: 'Deals',
      price: 950,
      kind: 'deal',
      available: true,
      description: '',
      icon: 'plate',
      variants: [],
      addons: [],
      components: [
        { itemId: 'burger', quantity: 1 },
        { itemId: 'water', quantity: 2 },
      ],
    },
  ];
  const now = '2026-09-16T08:00:00.000Z';
  const call = (action: string, data: unknown, role = 'owner', approve = false, at = now) =>
    execute(
      s,
      s.users.find((u) => u.role === role)!,
      action,
      data,
      approve ? s.users[0] : undefined,
      at,
    );
  return { s, call, now };
}
function open(f: ReturnType<typeof fixture>, type = 'dine-in', tableId = 't1') {
  const { id } = f.call('order.open', { type, tableId });
  return f.s.orders.find((o) => o.id === id)!;
}
test('table exclusivity, optimistic concurrency and role authorization', () => {
  const f = fixture(),
    o = open(f);
  assert.throws(() => open(f), /already has an open/);
  assert.throws(
    () =>
      f.call('order.send', {
        orderId: o.id,
        version: 99,
        lines: [{ itemId: 'burger', quantity: 1 }],
      }),
    /another device/,
  );
  assert.throws(() => f.call('order.open', { type: 'takeaway' }, 'waiter'), /dine-in/);
  assert.throws(() => f.call('expense.post', {}, 'waiter'), /role/);
  assert.throws(() => f.call('order.pay', {}, 'kitchen'), /role/);
  assert.throws(() => f.call('settings.save', {}, 'cashier'), /role/);
});
test('deal snapshots, inventory deduction, cancellation approval and retained kitchen notice', () => {
  const f = fixture(),
    o = open(f);
  f.call(
    'order.send',
    { orderId: o.id, version: o.version, lines: [{ itemId: 'deal', quantity: 3 }] },
    'waiter',
  );
  assert.equal(balance(f.s, 'water'), -6);
  assert.equal(o.rounds[0].lines[0].components[1].name, 'Water');
  f.s.menu[1].name = 'Changed';
  const d = {
    orderId: o.id,
    version: o.version,
    lineId: o.rounds[0].lines[0].id,
    reason: 'Guest changed mind',
  };
  assert.throws(() => f.call('order.cancelLine', d, 'waiter'), /authorization/);
  f.call('order.cancelLine', d, 'waiter', true);
  assert.equal(balance(f.s, 'water'), 0);
  assert.equal(o.rounds[0].cancellations[0].acknowledged, false);
  f.call('order.void', { orderId: o.id, version: o.version, reason: 'All cancelled' });
  f.call('kitchen.ack', { orderId: o.id, version: o.version, roundId: o.rounds[0].id }, 'kitchen');
  assert.equal(o.rounds[0].cancellations[0].acknowledged, true);
  assert.equal(o.rounds[0].lines[0].components[1].name, 'Water');
  assert.equal(f.s.audit.find((a) => a.action === 'order.cancelLine')?.approverId, 'owner');
});
test('exact money, cash change, immutable paid bill, service closure and refund once', () => {
  const f = fixture(),
    o = open(f);
  f.call('cash.open', { registerId: 'r1', cashierId: 'cashier', opening: 5000 }, 'cashier');
  const shift = f.s.cashSessions[0];
  f.call('order.send', {
    orderId: o.id,
    version: o.version,
    lines: [
      { itemId: 'burger', variantId: 'large', addonIds: ['cheese'], quantity: 2 },
      { itemId: 'water', quantity: 1 },
    ],
  });
  assert.equal(subtotal(o), 2500);
  f.call(
    'order.discount',
    { orderId: o.id, version: o.version, kind: 'percent', value: 10, reason: 'Offer' },
    'cashier',
    true,
  );
  assert.equal(total(o), 2250);
  f.call(
    'order.pay',
    { orderId: o.id, version: o.version, method: 'cash', tendered: 3000, sessionId: shift.id },
    'cashier',
  );
  assert.equal(o.payment!.change, 750);
  assert.equal(expectedCash(f.s, shift), 7250);
  assert.equal(o.status, 'open');
  assert.throws(
    () =>
      f.call('order.send', {
        orderId: o.id,
        version: o.version,
        lines: [{ itemId: 'water', quantity: 1 }],
      }),
    /Paid/,
  );
  assert.throws(
    () => f.call('order.pay', { orderId: o.id, version: o.version, method: 'card', tendered: 0 }),
    /Paid/,
  );
  for (const status of ['preparing', 'ready', 'served'])
    f.call('kitchen.status', {
      orderId: o.id,
      version: o.version,
      roundId: o.rounds[0].id,
      status,
    });
  assert.equal(o.status, 'completed');
  f.s.menu[0].price = 999999;
  assert.equal(o.payment!.amount, 2250);
  f.call(
    'order.refund',
    { orderId: o.id, version: o.version, reason: 'Customer complaint', sessionId: shift.id },
    'cashier',
    true,
  );
  assert.equal(expectedCash(f.s, shift), 5000);
  assert.equal(balance(f.s, 'water'), -1);
  assert.throws(
    () =>
      f.call('order.refund', {
        orderId: o.id,
        version: o.version,
        reason: 'Again',
        sessionId: shift.id,
      }),
    /once/,
  );
});
test('purchases, supplier balances, drawer expenses and explicit reversals reconcile', () => {
  const f = fixture();
  f.call('cash.open', { registerId: 'r1', cashierId: 'owner', opening: 10000 });
  const c = f.s.cashSessions[0];
  f.call('supplier.save', { name: 'Supplier', phone: '' });
  f.call('purchase.post', {
    supplierId: f.s.suppliers[0].id,
    date: '2026-09-16',
    lines: [{ stockId: 'water', quantity: 10, cost: 200 }],
  });
  const p = f.s.purchases[0];
  assert.equal(balance(f.s, 'water'), 10);
  f.call('purchase.pay', { purchaseId: p.id, amount: 1000, method: 'cash', sessionId: c.id });
  assert.equal(expectedCash(f.s, c), 9000);
  assert.equal(report(f.s, '2026-09-16', '2026-09-16').suppliers[0].balance, 1000);
  assert.throws(
    () => f.call('purchase.pay', { purchaseId: p.id, amount: 1001, method: 'card' }),
    /exceeds/,
  );
  f.call('expense.post', {
    category: 'Cleaning',
    amount: 350,
    date: '2026-09-16',
    method: 'cash',
    sessionId: c.id,
  });
  assert.equal(expectedCash(f.s, c), 8650);
  assert.equal(f.s.cashMovements.filter((m) => m.source === f.s.expenses[0].id).length, 1);
  f.call('expense.reverse', { expenseId: f.s.expenses[0].id, reason: 'Returned', sessionId: c.id });
  assert.equal(expectedCash(f.s, c), 9000);
  assert.throws(
    () => f.call('purchase.reverse', { purchaseId: p.id, reason: 'Error' }),
    /payments/,
  );
  f.call('purchase.reversePayment', {
    paymentId: f.s.supplierPayments[0].id,
    reason: 'Money returned',
    sessionId: c.id,
  });
  f.call('purchase.reverse', { purchaseId: p.id, reason: 'Goods returned' });
  assert.equal(balance(f.s, 'water'), 0);
  assert.equal(expectedCash(f.s, c), 10000);
  f.call('cash.close', { sessionId: c.id, counted: 9950 });
  assert.equal(c.variance, -50);
  assert.throws(
    () => f.call('cash.move', { sessionId: c.id, direction: 'in', amount: 100, reason: 'Late' }),
    /closed/,
  );
});
test('reports attribute bundle revenue once and refunds to refund date', () => {
  const f = fixture(),
    o = open(f);
  f.call('order.send', {
    orderId: o.id,
    version: o.version,
    lines: [
      { itemId: 'deal', quantity: 2 },
      { itemId: 'burger', quantity: 1 },
    ],
  });
  f.call('order.discount', {
    orderId: o.id,
    version: o.version,
    kind: 'fixed',
    value: 101,
    reason: 'Offer',
  });
  f.call('order.pay', { orderId: o.id, version: o.version, method: 'card', tendered: 0 });
  const r = report(f.s, '2026-09-16', '2026-09-16');
  assert.equal(r.sales, 2698);
  assert.equal(
    r.items.reduce((a, v) => a + v.net, 0),
    r.sales,
  );
  assert.equal(
    r.items.reduce((a, v) => a + v.discount, 0),
    101,
  );
  assert.equal(
    r.items.some((x) => x.kind === 'deal'),
    false,
  );
  assert.equal(r.deals[0].gross, 1900);
  assert.equal(r.deals[0].quantity, 2);
  assert.equal(r.items.find((x) => x.name === 'Burger')!.quantity, 3);
  assert.equal(r.items.find((x) => x.name === 'Burger')!.dealQuantity, 2);
  assert.equal(r.items.find((x) => x.name === 'Burger')!.directQuantity, 1);
  f.s.menu.find((x) => x.id === 'water')!.price = 999999;
  assert.deepEqual(report(f.s, '2026-09-16', '2026-09-16').items, r.items);
  assert.equal(r.components.find((x) => x.name === 'Water')!.quantity, 4);
  f.call(
    'order.refund',
    { orderId: o.id, version: o.version, reason: 'Complaint' },
    'owner',
    false,
    '2026-09-17T08:00:00.000Z',
  );
  assert.equal(report(f.s, '2026-09-16', '2026-09-16').refunded, 0);
  assert.equal(report(f.s, '2026-09-17', '2026-09-17').refunded, 2698);
});
test('empty orders close immediately without a reason or second manager approval', () => {
  const f = fixture(),
    o = open(f);
  f.call('order.void', { orderId: o.id, version: o.version }, 'waiter');
  assert.equal(o.status, 'void');
  assert.equal(f.s.audit.at(-1)!.reason, 'Empty order closed');
  const next = open(f);
  f.call('order.send', {
    orderId: next.id,
    version: next.version,
    lines: [{ itemId: 'burger', quantity: 1 }],
  });
  assert.throws(
    () => f.call('order.void', { orderId: next.id, version: next.version }, 'waiter'),
    /Cancel sent items/,
  );
  f.call(
    'order.cancelLine',
    {
      orderId: next.id,
      version: next.version,
      lineId: next.rounds[0].lines[0].id,
      reason: 'Guest left',
    },
    'waiter',
    true,
  );
  f.call('order.void', { orderId: next.id, version: next.version }, 'waiter');
  assert.equal(next.status, 'void');
  assert.equal(next.rounds[0].cancellations[0].acknowledged, false);
});
test('legacy deal reports allocate by saved quantities and do not depend on current menu', () => {
  const f = fixture(),
    o = open(f);
  f.call('order.send', {
    orderId: o.id,
    version: o.version,
    lines: [{ itemId: 'deal', quantity: 1 }],
  });
  o.rounds[0].lines[0].components.forEach((c) => delete c.unitPrice);
  f.call('order.pay', { orderId: o.id, version: o.version, method: 'card', tendered: 0 });
  const r = report(f.s, '2026-09-16', '2026-09-16');
  assert.equal(r.items.find((x) => x.name === 'Burger')!.gross, 317);
  assert.equal(r.items.find((x) => x.name === 'Water')!.gross, 633);
  assert.equal(
    r.items.reduce((a, x) => a + x.net, 0),
    r.sales,
  );
  assert.equal(r.deals[0].net, 950);
});
test('business cutoff handles local timezone and CSV prevents formula injection', () => {
  const f = fixture();
  assert.equal(businessDate('2026-09-16T22:59:00Z', f.s.settings[0]), '2026-09-16');
  assert.equal(businessDate('2026-09-16T23:00:00Z', f.s.settings[0]), '2026-09-17');
  assert.ok(csv([['=HYPERLINK("bad")']]).includes("'=HYPERLINK"));
});
test('discount allocation never assigns a discount to a free line', () => {
  const f = fixture();
  f.s.menu[0].price = 1;
  f.s.menu[1].price = 0;
  const o = open(f);
  f.call('order.send', {
    orderId: o.id,
    version: o.version,
    lines: [
      { itemId: 'burger', quantity: 1 },
      { itemId: 'burger', quantity: 1 },
      { itemId: 'water', quantity: 1 },
    ],
  });
  f.call('order.discount', {
    orderId: o.id,
    version: o.version,
    kind: 'fixed',
    value: 1,
    reason: 'Rounding',
  });
  f.call('order.pay', { orderId: o.id, version: o.version, method: 'card', tendered: 0 });
  const r = report(f.s, '2026-09-16', '2026-09-16');
  assert.ok(r.items.every((i) => i.net >= 0));
  assert.equal(r.items.find((i) => i.name === 'Water')!.discount, 0);
  assert.equal(
    r.items.reduce((a, i) => a + i.net, 0),
    1,
  );
});
test('kitchen roles cannot mark served, transitions cannot skip, occupied transfer blocked', () => {
  const f = fixture(),
    o = open(f);
  open(f, 'dine-in', 't2');
  f.call('order.send', {
    orderId: o.id,
    version: o.version,
    lines: [{ itemId: 'burger', quantity: 1 }],
  });
  assert.throws(
    () => f.call('order.transfer', { orderId: o.id, version: o.version, tableId: 't2' }, 'waiter'),
    /occupied/,
  );
  assert.throws(
    () =>
      f.call(
        'kitchen.status',
        { orderId: o.id, version: o.version, roundId: o.rounds[0].id, status: 'ready' },
        'kitchen',
      ),
    /one step/,
  );
  assert.throws(
    () =>
      f.call(
        'kitchen.status',
        { orderId: o.id, version: o.version, roundId: o.rounds[0].id, status: 'served' },
        'kitchen',
      ),
    /role/,
  );
});
