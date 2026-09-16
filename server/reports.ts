import { type State, type Settings } from '../shared/types.js';
function allocate(amount: number, weights: number[]): number[] {
  const sum = weights.reduce((a, v) => a + v, 0);
  if (!sum) return weights.map(() => 0);
  const rows = weights.map((weight, index) => {
    const product = BigInt(amount) * BigInt(weight);
    return { index, value: Number(product / BigInt(sum)), remainder: product % BigInt(sum) };
  });
  let remaining = amount - rows.reduce((a, r) => a + r.value, 0);
  for (const r of [...rows].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  ))
    if (remaining > 0 && weights[r.index] > 0) {
      r.value++;
      remaining--;
    }
  return rows.map((r) => r.value);
}
type SalesRow = {
  name: string;
  kind: string;
  quantity: number;
  directQuantity: number;
  dealQuantity: number;
  gross: number;
  discount: number;
  net: number;
};
export function businessDate(at: string, settings: Settings): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: settings.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(at))
      .map((x) => [x.type, x.value]),
  );
  const day = `${p.year}-${p.month}-${p.day}`;
  return `${p.hour}:${p.minute}` < settings.cutoff
    ? new Date(new Date(`${day}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
    : day;
}
export function report(s: State, from: string, to: string) {
  const within = (at: string) => {
    const d = businessDate(at, s.settings[0]);
    return d >= from && d <= to;
  };
  const orders = s.orders.filter((o) => o.payment && within(o.payment.at));
  const refunds = s.orders.filter((o) => o.refund && within(o.refund.at));
  const items = new Map<string, SalesRow>();
  const deals = new Map<string, SalesRow>();
  const components = new Map<string, { name: string; quantity: number }>();
  const add = (
    map: Map<string, SalesRow>,
    itemId: string,
    name: string,
    kind: string,
    quantity: number,
    gross: number,
    discount: number,
    inDeal = false,
  ) => {
    const key = `${itemId}:${name}`;
    const row = map.get(key) ?? {
      name,
      kind,
      quantity: 0,
      directQuantity: 0,
      dealQuantity: 0,
      gross: 0,
      discount: 0,
      net: 0,
    };
    row.quantity += quantity;
    row.directQuantity += inDeal ? 0 : quantity;
    row.dealQuantity += inDeal ? quantity : 0;
    row.gross += gross;
    row.discount += discount;
    row.net += gross - discount;
    map.set(key, row);
  };
  for (const o of orders) {
    const lines = o.rounds.flatMap((r) => r.lines).filter((l) => !l.cancelled);
    const allocations = allocate(
      o.discount,
      lines.map((l) => l.price * l.quantity),
    );
    lines.forEach((l, index) => {
      const amount = l.price * l.quantity;
      const share = allocations[index];
      if (l.kind !== 'deal') {
        add(items, l.itemId, l.name, 'item', l.quantity, amount, share);
        return;
      }
      add(deals, l.itemId, l.name, 'deal', l.quantity, amount, share);
      // Older orders did not snapshot component prices; use quantities, never today's prices.
      const savedPrices =
        l.components.every((c) => c.unitPrice !== undefined) &&
        l.components.some((c) => (c.unitPrice ?? 0) > 0);
      const amounts = allocate(
        amount,
        l.components.map((c) => c.quantity * (savedPrices ? c.unitPrice! : 1)),
      );
      const discounts = allocate(share, amounts);
      l.components.forEach((c, componentIndex) => {
        add(
          items,
          c.itemId,
          c.name,
          'item',
          c.quantity * l.quantity,
          amounts[componentIndex],
          discounts[componentIndex],
          true,
        );
        const row = components.get(c.itemId) ?? { name: c.name, quantity: 0 };
        row.quantity += c.quantity * l.quantity;
        components.set(c.itemId, row);
      });
    });
  }
  const sales = orders.reduce((a, o) => a + o.payment!.amount, 0);
  const refunded = refunds.reduce((a, o) => a + o.payment!.amount, 0);
  const purchaseRows = s.purchases.filter((p) => p.date >= from && p.date <= to);
  const expenseRows = s.expenses.filter((e) => e.date >= from && e.date <= to);
  return {
    from,
    to,
    sales,
    refunded,
    net: sales - refunded,
    orderCount: orders.length,
    average: orders.length ? Math.round(sales / orders.length) : 0,
    discounts: orders.reduce((a, o) => a + o.discount, 0),
    items: [...items.values()].sort((a, b) => b.net - a.net),
    deals: [...deals.values()].sort((a, b) => b.net - a.net),
    components: [...components.values()],
    payments: ['cash', 'card', 'digital'].map((method) => ({
      method,
      sales: orders
        .filter((o) => o.payment!.method === method)
        .reduce((a, o) => a + o.payment!.amount, 0),
      refunds: refunds
        .filter((o) => o.payment!.method === method)
        .reduce((a, o) => a + o.payment!.amount, 0),
    })),
    refunds: refunds.map((o) => ({
      number: o.number,
      amount: o.payment!.amount,
      at: o.refund!.at,
      reason: o.refund!.reason,
    })),
    purchases: purchaseRows,
    purchaseTotal: purchaseRows.filter((p) => !p.reversedAt).reduce((a, p) => a + p.total, 0),
    expenses: expenseRows,
    expenseTotal: expenseRows.filter((e) => !e.reversedAt).reduce((a, e) => a + e.amount, 0),
    suppliers: s.suppliers.map((x) => ({
      ...x,
      balance: s.purchases
        .filter((p) => p.supplierId === x.id && !p.reversedAt)
        .reduce(
          (a, p) =>
            a +
            p.total -
            s.supplierPayments
              .filter((v) => v.purchaseId === p.id && !v.reversedAt)
              .reduce((b, v) => b + v.amount, 0),
          0,
        ),
    })),
    shifts: s.cashSessions.filter((c) => within(c.closedAt ?? c.openedAt)),
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      amount: orders
        .filter(
          (o) =>
            Number(
              new Intl.DateTimeFormat('en', {
                timeZone: s.settings[0].timezone,
                hour: '2-digit',
                hourCycle: 'h23',
              }).format(new Date(o.payment!.at)),
            ) === hour,
        )
        .reduce((a, o) => a + o.payment!.amount, 0),
    })),
  };
}
export function csv(rows: unknown[][]) {
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((v) => {
            let value = String(v ?? '');
            if (/^[=+@\-\t\r]/.test(value)) value = "'" + value;
            return '"' + value.replaceAll('"', '""') + '"';
          })
          .join(','),
      )
      .join('\r\n')
  );
}
