import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  type State,
  type User,
  type Order,
  type Line,
  type CashSession,
  type PaymentMethod,
  subtotal,
  total,
  expectedCash,
  balance,
  managerRoles,
} from '../shared/types.js';

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(message: string, status = 400): never {
  throw new AppError(status, message);
}
const id = () => randomUUID();
const text = z.string().trim().min(1).max(200);
const money = z.number().int().min(0).max(1_000_000_000);
const positive = z.number().int().min(1).max(100_000);
const date = z.iso.date();
const method = z.enum(['cash', 'card', 'digital']);
const optionalId = z.string().optional();
export function permitted(user: User, roles: string[]) {
  if (!user.active || !roles.includes(user.role))
    fail('Your role cannot perform this action.', 403);
}
function get<T extends { id: string }>(list: T[], key: string, label = 'Record'): T {
  return list.find((x) => x.id === key) ?? fail(`${label} not found.`, 404);
}
const management = ['owner', 'manager'];
const ordering = [...management, 'cashier', 'waiter'];
const billing = [...management, 'cashier'];

export function execute(
  s: State,
  user: User,
  action: string,
  raw: unknown,
  approver?: User,
  now = new Date().toISOString(),
): { id?: string } {
  const data = (schema: z.ZodType<any>) => schema.parse(raw);
  const audit = (targetId?: string, reason?: string) =>
    s.audit.push({
      id: id(),
      at: now,
      userId: user.id,
      action,
      targetId,
      reason,
      approverId: approver?.id,
    });
  const approval = () => {
    if (
      !managerRoles.includes(user.role) &&
      (!approver?.active || !managerRoles.includes(approver.role))
    )
      fail('Manager authorization is required.', 403);
  };
  const session = (sessionId?: string): CashSession => {
    const c = get(s.cashSessions, sessionId ?? '', 'Open cash session');
    if (c.closedAt) fail('This cash session is closed.');
    if (c.cashierId !== user.id && !management.includes(user.role))
      fail('Use your assigned cash session.', 403);
    return c;
  };
  const moveCash = (
    sessionId: string | undefined,
    amount: number,
    source: string,
    reason: string,
  ) => {
    const c = session(sessionId);
    s.cashMovements.push({
      id: id(),
      sessionId: c.id,
      amount,
      source,
      reason,
      at: now,
      userId: user.id,
    });
  };
  const moveStock = (stockId: string, quantity: number, source: string, reason: string) => {
    get(s.stock, stockId, 'Stock item');
    s.stockMovements.push({
      id: id(),
      stockId,
      quantity,
      source,
      reason,
      at: now,
      userId: user.id,
    });
  };
  const order = (d: { orderId: string; version: number }, unpaid = true) => {
    const o = get(s.orders, d.orderId, 'Order');
    if (o.version !== d.version)
      fail('This order changed on another device. Refresh and try again.', 409);
    if (o.status !== 'open') fail('This order is closed.');
    if (unpaid && o.paymentStatus !== 'unpaid') fail('Paid orders cannot be edited.');
    if (user.role === 'waiter' && o.type !== 'dine-in')
      fail('Waiters can only manage dine-in orders.', 403);
    return o;
  };
  const touch = (o: Order) => {
    o.version++;
    o.updatedAt = now;
    if (
      o.paymentStatus !== 'unpaid' &&
      o.rounds.every((r) => r.status === 'served' || r.lines.every((l) => l.cancelled))
    ) {
      o.status = 'completed';
      o.closedAt = now;
    }
  };
  const orderRef = { orderId: text, version: z.number().int().positive() };
  switch (action) {
    case 'order.open': {
      permitted(user, ordering);
      const d = data(z.object({ type: z.enum(['dine-in', 'takeaway']), tableId: optionalId }));
      if (user.role === 'waiter' && d.type !== 'dine-in')
        fail('Waiters can only open dine-in orders.', 403);
      if (d.type === 'dine-in') {
        get(s.settings[0].tables, d.tableId ?? '', 'Table');
        if (s.orders.some((o) => o.status === 'open' && o.tableId === d.tableId))
          fail('This table already has an open order.', 409);
      }
      const o: Order = {
        id: id(),
        number: Math.max(0, ...s.orders.map((o) => o.number)) + 1,
        type: d.type,
        tableId: d.type === 'dine-in' ? d.tableId : undefined,
        createdBy: user.id,
        createdAt: now,
        updatedAt: now,
        version: 1,
        status: 'open',
        paymentStatus: 'unpaid',
        rounds: [],
        discount: 0,
      };
      s.orders.push(o);
      audit(o.id);
      return { id: o.id };
    }
    case 'order.send': {
      permitted(user, ordering);
      const d = data(
        z.object({
          ...orderRef,
          lines: z
            .array(
              z.object({
                itemId: text,
                quantity: z.number().int().min(1).max(99),
                variantId: optionalId,
                addonIds: z.array(z.string()).max(20).default([]),
                note: z.string().max(300).default(''),
              }),
            )
            .min(1)
            .max(100),
        }),
      );
      const o = order(d);
      const roundId = id();
      const lines: Line[] = d.lines.map((l: any) => {
        const item = get(s.menu, l.itemId, 'Menu item');
        if (!item.available) fail(`${item.name} is unavailable.`);
        const variant = l.variantId ? get(item.variants, l.variantId, 'Variant') : undefined;
        if (new Set(l.addonIds).size !== l.addonIds.length)
          fail('Duplicate add-ons are not allowed.');
        const addons = l.addonIds.map((key: string) => get(item.addons, key, 'Add-on'));
        const components = item.components.map((c) => {
          const i = get(s.menu, c.itemId, 'Deal component');
          if (!i.available) fail(`${i.name} is unavailable.`);
          return {
            itemId: i.id,
            name: i.name,
            quantity: c.quantity,
            stockId: i.stockId,
            unitPrice: i.price,
          };
        });
        const line: Line = {
          id: id(),
          itemId: item.id,
          name: item.name + (variant ? ` · ${variant.name}` : ''),
          kind: item.kind,
          quantity: l.quantity,
          price:
            (variant?.price ?? item.price) + addons.reduce((a: number, v: any) => a + v.price, 0),
          note: l.note,
          addons: addons.map((a: any) => a.name),
          components,
          stockId: item.stockId,
          cancelled: false,
        };
        if (line.stockId) moveStock(line.stockId, -line.quantity, line.id, `Order #${o.number}`);
        for (const c of components)
          if (c.stockId)
            moveStock(
              c.stockId,
              -c.quantity * line.quantity,
              line.id,
              `Deal on order #${o.number}`,
            );
        return line;
      });
      o.rounds.push({ id: roundId, createdAt: now, status: 'queued', lines, cancellations: [] });
      if (subtotal(o) > 1_000_000_000) fail('Order total exceeds the supported limit.');
      touch(o);
      audit(o.id);
      return { id: o.id };
    }
    case 'order.transfer': {
      permitted(user, ordering);
      const d = data(z.object({ ...orderRef, tableId: text }));
      const o = order(d);
      if (o.type !== 'dine-in') fail('Only dine-in orders can be transferred.');
      get(s.settings[0].tables, d.tableId, 'Table');
      if (s.orders.some((x) => x.id !== o.id && x.status === 'open' && x.tableId === d.tableId))
        fail('Destination table is occupied.', 409);
      o.tableId = d.tableId;
      touch(o);
      audit(o.id);
      return { id: o.id };
    }
    case 'order.cancelLine': {
      permitted(user, ordering);
      approval();
      const d = data(z.object({ ...orderRef, lineId: text, reason: text }));
      const o = order(d);
      const r =
        o.rounds.find((r) => r.lines.some((l) => l.id === d.lineId)) ??
        fail('Line not found.', 404);
      const l = get(r.lines, d.lineId);
      if (l.cancelled) fail('Item is already cancelled.');
      l.cancelled = true;
      if (l.stockId) moveStock(l.stockId, l.quantity, l.id, 'Cancellation');
      for (const c of l.components)
        if (c.stockId) moveStock(c.stockId, c.quantity * l.quantity, l.id, 'Deal cancellation');
      r.cancellations.push({
        lineId: l.id,
        name: l.name,
        reason: d.reason,
        at: now,
        acknowledged: false,
      });
      o.discount = Math.min(o.discount, subtotal(o));
      touch(o);
      audit(o.id, d.reason);
      return { id: o.id };
    }
    case 'order.void': {
      permitted(user, ordering);
      const d = data(z.object(orderRef));
      const o = order(d);
      if (o.rounds.some((r) => r.lines.some((l) => !l.cancelled)))
        fail('Cancel sent items before voiding the order.');
      o.status = 'void';
      o.closedAt = now;
      touch(o);
      audit(o.id, 'Empty order closed');
      return { id: o.id };
    }
    case 'order.discount': {
      permitted(user, billing);
      approval();
      const d = data(
        z.object({ ...orderRef, kind: z.enum(['fixed', 'percent']), value: money, reason: text }),
      );
      const o = order(d);
      if (d.kind === 'percent' && d.value > 100) fail('Percentage must be between 0 and 100.');
      o.discount = Math.min(
        subtotal(o),
        d.kind === 'fixed' ? d.value : Math.round((subtotal(o) * d.value) / 100),
      );
      o.discountReason = d.reason;
      touch(o);
      audit(o.id, d.reason);
      return { id: o.id };
    }
    case 'order.pay': {
      permitted(user, billing);
      const d = data(z.object({ ...orderRef, method, tendered: money, sessionId: optionalId }));
      const o = order(d);
      if (!o.rounds.some((r) => r.lines.some((l) => !l.cancelled)))
        fail('Cannot charge an empty order.');
      const amount = total(o);
      if (d.method === 'cash' && d.tendered < amount) fail('Cash received is less than the bill.');
      const c = d.method === 'cash' ? session(d.sessionId) : undefined;
      if (c) moveCash(c.id, amount, o.id, `Payment #${o.number}`);
      const cfg = s.settings[0];
      o.payment = {
        amount,
        method: d.method,
        tendered: d.method === 'cash' ? d.tendered : amount,
        change: d.method === 'cash' ? d.tendered - amount : 0,
        at: now,
        userId: user.id,
        sessionId: c?.id,
        receipt: {
          name: cfg.name,
          address: cfg.address,
          footer: cfg.footer,
          currency: cfg.currency,
        },
      };
      o.paymentStatus = 'paid';
      touch(o);
      audit(o.id);
      return { id: o.id };
    }
    case 'order.refund': {
      permitted(user, billing);
      approval();
      const d = data(z.object({ ...orderRef, reason: text, sessionId: optionalId }));
      const o = get(s.orders, d.orderId, 'Order');
      if (o.version !== d.version) fail('Order changed. Refresh and retry.', 409);
      if (o.paymentStatus !== 'paid' || !o.payment) fail('Only paid orders can be refunded once.');
      let c: CashSession | undefined;
      if (o.payment.method === 'cash') {
        c = session(d.sessionId);
        moveCash(c.id, -o.payment.amount, `refund:${o.id}`, `Refund #${o.number}`);
      }
      o.refund = { at: now, reason: d.reason, userId: user.id, sessionId: c?.id };
      o.paymentStatus = 'refunded';
      touch(o);
      audit(o.id, d.reason);
      return { id: o.id };
    }
    case 'kitchen.status': {
      permitted(user, [...ordering, 'kitchen']);
      const d = data(
        z.object({ ...orderRef, roundId: text, status: z.enum(['preparing', 'ready', 'served']) }),
      );
      const o = order(d, false);
      const r = get(o.rounds, d.roundId, 'Round');
      if (d.status === 'served') permitted(user, ordering);
      else permitted(user, [...management, 'kitchen']);
      const next: Record<string, string> = {
        queued: 'preparing',
        preparing: 'ready',
        ready: 'served',
      };
      if (next[r.status] !== d.status) fail('Kitchen status must advance one step at a time.');
      r.status = d.status;
      touch(o);
      audit(o.id);
      return { id: o.id };
    }
    case 'kitchen.ack': {
      permitted(user, [...management, 'kitchen']);
      const d = data(
        z.object({ orderId: text, version: z.number().int().positive(), roundId: text }),
      );
      const o = get(s.orders, d.orderId, 'Order');
      if (o.version !== d.version) fail('Order changed. Refresh and retry.', 409);
      const r = get(o.rounds, d.roundId);
      r.cancellations.forEach((c) => (c.acknowledged = true));
      o.version++;
      o.updatedAt = now;
      audit(o.id);
      return { id: o.id };
    }
    case 'cash.open': {
      permitted(user, billing);
      const d = data(z.object({ registerId: text, opening: money, cashierId: text }));
      get(s.settings[0].registers, d.registerId, 'Register');
      const cashier = get(s.users, d.cashierId, 'Cashier');
      if (!cashier.active || !billing.includes(cashier.role))
        fail('Choose an active cashier or manager.');
      if (user.role === 'cashier' && d.cashierId !== user.id)
        fail('You may only open your own shift.', 403);
      if (
        s.cashSessions.some(
          (c) => !c.closedAt && (c.registerId === d.registerId || c.cashierId === d.cashierId),
        )
      )
        fail('Register or cashier already has an open shift.', 409);
      const c = {
        id: id(),
        registerId: d.registerId,
        cashierId: d.cashierId,
        opening: d.opening,
        openedAt: now,
      };
      s.cashSessions.push(c);
      audit(c.id);
      return { id: c.id };
    }
    case 'cash.move': {
      permitted(user, billing);
      const d = data(
        z.object({
          sessionId: text,
          direction: z.enum(['in', 'out']),
          amount: money.refine((v) => v > 0),
          reason: text,
        }),
      );
      moveCash(d.sessionId, d.direction === 'in' ? d.amount : -d.amount, id(), d.reason);
      audit(d.sessionId, d.reason);
      return {};
    }
    case 'cash.close': {
      permitted(user, billing);
      const d = data(z.object({ sessionId: text, counted: money }));
      const c = session(d.sessionId);
      c.expected = expectedCash(s, c);
      c.counted = d.counted;
      c.variance = d.counted - c.expected;
      c.closedAt = now;
      audit(c.id);
      return {};
    }
    case 'stock.save': {
      permitted(user, management);
      const d = data(
        z.object({ id: optionalId, name: text, unit: text, active: z.boolean().default(true) }),
      );
      const old = d.id ? get(s.stock, d.id) : undefined;
      if (old && old.unit !== d.unit && s.stockMovements.some((m) => m.stockId === old.id))
        fail('The base unit cannot change after stock movements exist.');
      const v = { ...d, id: old?.id ?? id() };
      if (old) Object.assign(old, v);
      else s.stock.push(v);
      audit(v.id);
      return { id: v.id };
    }
    case 'stock.adjust': {
      permitted(user, management);
      const d = data(
        z.object({
          stockId: text,
          kind: z.enum(['adjust', 'count']),
          quantity: z.number().int().min(-1_000_000).max(1_000_000),
          reason: text,
        }),
      );
      if (d.kind === 'count' && d.quantity < 0) fail('Physical count cannot be negative.');
      moveStock(
        d.stockId,
        d.kind === 'count' ? d.quantity - balance(s, d.stockId) : d.quantity,
        id(),
        d.reason,
      );
      audit(d.stockId, d.reason);
      return {};
    }
    case 'menu.save': {
      permitted(user, management);
      const option = z.object({ id: text, name: text, price: money });
      const d = data(
        z.object({
          id: optionalId,
          name: text,
          category: text,
          price: money,
          available: z.boolean(),
          kind: z.enum(['item', 'deal']),
          description: z.string().max(300).default(''),
          icon: z.string().max(30).default('plate'),
          stockId: optionalId,
          variants: z.array(option).max(20).default([]),
          addons: z.array(option).max(20).default([]),
          components: z
            .array(z.object({ itemId: text, quantity: positive }))
            .max(30)
            .default([]),
        }),
      );
      if (d.stockId) {
        const st = get(s.stock, d.stockId);
        if (!st.active) fail('Stock item is inactive.');
      }
      for (const list of [d.variants, d.addons])
        if (new Set(list.map((x: any) => x.id)).size !== list.length)
          fail('Option identifiers must be unique.');
      if (d.kind === 'deal') {
        if (d.stockId || d.variants.length)
          fail('Deals use component stock and a single bundle price.');
        if (!d.components.length) fail('A deal needs at least one component.');
        for (const c of d.components) {
          const i = get(s.menu, c.itemId);
          if (i.kind !== 'item' || i.id === d.id) fail('Deals can contain ordinary items only.');
        }
      } else if (d.components.length) fail('Only deals have components.');
      if (
        d.id &&
        d.kind === 'deal' &&
        s.menu.some((m) => m.components.some((c) => c.itemId === d.id))
      )
        fail('This item is already used by a deal.');
      const v = { ...d, id: d.id ?? id() };
      if (d.id) Object.assign(get(s.menu, d.id), v);
      else s.menu.push(v);
      audit(v.id);
      return { id: v.id };
    }
    case 'supplier.save': {
      permitted(user, management);
      const d = data(
        z.object({ id: optionalId, name: text, phone: z.string().max(60).default('') }),
      );
      const v = { ...d, id: d.id ?? id() };
      if (d.id) Object.assign(get(s.suppliers, d.id), v);
      else s.suppliers.push(v);
      audit(v.id);
      return { id: v.id };
    }
    case 'purchase.post': {
      permitted(user, management);
      const d = data(
        z.object({
          supplierId: text,
          date,
          reference: z.string().max(200).default(''),
          lines: z
            .array(z.object({ stockId: text, quantity: positive, cost: money }))
            .min(1)
            .max(100),
        }),
      );
      get(s.suppliers, d.supplierId);
      const purchaseId = id();
      const lines = d.lines.map((l: any) => {
        const st = get(s.stock, l.stockId);
        if (!st.active) fail('Stock item is inactive.');
        moveStock(l.stockId, l.quantity, purchaseId, 'Purchase receipt');
        return { ...l, name: st.name };
      });
      const amount = lines.reduce((a: number, l: any) => a + l.quantity * l.cost, 0);
      if (!Number.isSafeInteger(amount) || amount > 1_000_000_000)
        fail('Purchase total exceeds the supported limit.');
      s.purchases.push({
        id: purchaseId,
        supplierId: d.supplierId,
        date: d.date,
        reference: d.reference,
        lines,
        total: amount,
        at: now,
        userId: user.id,
      });
      audit(purchaseId);
      return { id: purchaseId };
    }
    case 'purchase.pay': {
      permitted(user, management);
      const d = data(
        z.object({
          purchaseId: text,
          amount: money.refine((v) => v > 0),
          method,
          sessionId: optionalId,
        }),
      );
      const p = get(s.purchases, d.purchaseId);
      if (p.reversedAt) fail('Purchase is reversed.');
      const paid = s.supplierPayments
        .filter((x) => x.purchaseId === p.id && !x.reversedAt)
        .reduce((a, x) => a + x.amount, 0);
      if (d.amount > p.total - paid) fail('Payment exceeds outstanding balance.');
      const paymentId = id();
      if (d.sessionId) {
        if (d.method !== 'cash') fail('Drawer payments must use cash.');
        moveCash(d.sessionId, -d.amount, paymentId, 'Supplier payment');
      }
      s.supplierPayments.push({ ...d, id: paymentId, at: now, userId: user.id });
      audit(p.id);
      return { id: paymentId };
    }
    case 'purchase.reverse': {
      permitted(user, management);
      const d = data(z.object({ purchaseId: text, reason: text }));
      const p = get(s.purchases, d.purchaseId);
      if (p.reversedAt) fail('Already reversed.');
      if (s.supplierPayments.some((x) => x.purchaseId === p.id && !x.reversedAt))
        fail('Reverse supplier payments before reversing this purchase.');
      p.reversedAt = now;
      p.reversalReason = d.reason;
      p.lines.forEach((l) => moveStock(l.stockId, -l.quantity, `reverse:${p.id}`, d.reason));
      audit(p.id, d.reason);
      return {};
    }
    case 'purchase.reversePayment': {
      permitted(user, management);
      const d = data(z.object({ paymentId: text, reason: text, sessionId: optionalId }));
      const p = get(s.supplierPayments, d.paymentId);
      if (p.reversedAt) fail('Already reversed.');
      if (p.sessionId) moveCash(d.sessionId, p.amount, `reverse:${p.id}`, d.reason);
      p.reversedAt = now;
      audit(p.id, d.reason);
      return {};
    }
    case 'expense.post': {
      permitted(user, management);
      const d = data(
        z.object({
          category: text,
          amount: money.refine((v) => v > 0),
          date,
          method,
          note: z.string().max(500).default(''),
          sessionId: optionalId,
        }),
      );
      const expenseId = id();
      if (d.sessionId) {
        if (d.method !== 'cash') fail('Drawer expenses must use cash.');
        moveCash(d.sessionId, -d.amount, expenseId, d.category);
      }
      s.expenses.push({ ...d, id: expenseId, at: now, userId: user.id });
      audit(expenseId);
      return { id: expenseId };
    }
    case 'expense.reverse': {
      permitted(user, management);
      const d = data(z.object({ expenseId: text, reason: text, sessionId: optionalId }));
      const e = get(s.expenses, d.expenseId);
      if (e.reversedAt) fail('Already reversed.');
      if (e.sessionId) moveCash(d.sessionId, e.amount, `reverse:${e.id}`, d.reason);
      e.reversedAt = now;
      e.reversalReason = d.reason;
      audit(e.id, d.reason);
      return {};
    }
    case 'settings.save': {
      permitted(user, ['owner']);
      const d = data(
        z.object({
          name: text,
          currency: z.string().regex(/^[A-Z]{3}$/),
          timezone: text,
          cutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          footer: z.string().max(300),
          address: z.string().max(300),
          tables: z
            .array(z.object({ id: text, name: text, seats: z.number().int().min(1).max(100) }))
            .max(200),
          registers: z
            .array(z.object({ id: text, name: text }))
            .min(1)
            .max(20),
        }),
      );
      try {
        new Intl.DateTimeFormat('en', { timeZone: d.timezone }).format();
        new Intl.NumberFormat('en', { style: 'currency', currency: d.currency }).format(1);
      } catch {
        fail('Invalid timezone or currency.');
      }
      if (
        (s.orders.length || s.cashSessions.length || s.purchases.length || s.expenses.length) &&
        d.currency !== s.settings[0].currency
      )
        fail('Currency cannot change after financial activity exists.');
      for (const list of [d.tables, d.registers])
        if (new Set(list.map((v: any) => v.id)).size !== list.length)
          fail('Identifiers must be unique.');
      if (
        s.orders.some(
          (o) => o.status === 'open' && o.tableId && !d.tables.some((t: any) => t.id === o.tableId),
        )
      )
        fail('Cannot remove an occupied table.');
      if (
        s.cashSessions.some(
          (c) => !c.closedAt && !d.registers.some((r: any) => r.id === c.registerId),
        )
      )
        fail('Cannot remove a register with an open shift.');
      Object.assign(s.settings[0], d);
      audit('restaurant');
      return {};
    }
    default:
      fail('Unknown action.', 404);
  }
}
