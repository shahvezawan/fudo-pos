import { useState } from 'react';
import {
  Plus,
  Minus,
  Search,
  ArrowUpRight,
  UtensilsCrossed,
  ShoppingBag,
  Send,
  Printer,
  ArrowRightLeft,
  X,
  Check,
  Coffee,
  Flame,
  Leaf,
  Sandwich,
  GlassWater,
} from 'lucide-react';
import { useApp } from './api';
import { imageUrl } from './images';
import {
  Modal,
  Field,
  MoneyField,
  SessionSelect,
  ApprovalFields,
  approval,
  val,
  minor,
  Badge,
  Empty,
  SectionHead,
} from './ui';
import { type MenuItem, type Order, total, subtotal } from '../shared/types';
type Draft = {
  itemId: string;
  name: string;
  quantity: number;
  variantId?: string;
  addonIds: string[];
  note: string;
  price: number;
};
const icons: Record<string, typeof Coffee> = {
  coffee: Coffee,
  flame: Flame,
  leaf: Leaf,
  sandwich: Sandwich,
  drink: GlassWater,
  plate: UtensilsCrossed,
};
export function FoodIcon({ name, size = 32 }: { name: string; size?: number }) {
  const Icon = icons[name] ?? UtensilsCrossed;
  return <Icon size={size} strokeWidth={1.5} />;
}
export function POS() {
  const { s, user, act, notify, money, online, busy } = useApp();
  const [mode, setMode] = useState<'dine-in' | 'takeaway'>('dine-in'),
    [selected, setSelected] = useState<string>(),
    [category, setCategory] = useState('All items'),
    [query, setQuery] = useState(''),
    [drafts, setDrafts] = useState<Record<string, Draft[]>>({}),
    [item, setItem] = useState<MenuItem>(),
    [dialog, setDialog] = useState<string>(),
    [cancelLine, setCancelLine] = useState(''),
    [receipt, setReceipt] = useState<Order>();
  const o = s.orders.find((o) => o.id === selected);
  const draft = selected ? (drafts[selected] ?? []) : [];
  const categories = ['All items', ...new Set(s.menu.map((i) => i.category))];
  const canBill = ['owner', 'manager', 'cashier'].includes(user.role);
  const openOrders = s.orders.filter((o) => o.status === 'open' && o.type === mode);
  const setDraft = (value: Draft[]) => setDrafts((d) => ({ ...d, [selected!]: value }));
  const run = async (action: string, data: any) => {
    try {
      return await act(action, data);
    } catch (e: any) {
      notify(e.message);
    }
  };
  const add = (m: MenuItem, variantId?: string, addonIds: string[] = [], note = '') => {
    const v = m.variants.find((v) => v.id === variantId);
    setDraft([
      ...draft,
      {
        itemId: m.id,
        name: m.name + (v ? ` · ${v.name}` : ''),
        quantity: 1,
        variantId,
        addonIds,
        note,
        price:
          (v?.price ?? m.price) +
          m.addons.filter((a) => addonIds.includes(a.id)).reduce((x, a) => x + a.price, 0),
      },
    ]);
  };
  const open = async (tableId?: string) => {
    const existing = openOrders.find((o) => o.tableId === tableId && tableId);
    if (existing) {
      setSelected(existing.id);
      return;
    }
    const r = await run('order.open', { type: mode, tableId });
    if (r) setSelected(r.id);
  };
  const ref = o ? { orderId: o.id, version: o.version } : {};
  const currentTotal = o ? total(o) : 0;
  return (
    <>
      <SectionHead
        eyebrow="THE SERVICE FLOOR"
        title="Point of sale"
        description="A smooth service starts here."
      >
        <div className="segmented">
          {canBill && <button onClick={() => setDialog('history')}>Order history</button>}
          <button
            className={mode === 'dine-in' ? 'selected' : ''}
            onClick={() => {
              setMode('dine-in');
              setSelected(undefined);
            }}
          >
            <UtensilsCrossed size={16} />
            Dine-in
          </button>
          {user.role !== 'waiter' && (
            <button
              className={mode === 'takeaway' ? 'selected' : ''}
              onClick={() => {
                setMode('takeaway');
                setSelected(undefined);
              }}
            >
              <ShoppingBag size={16} />
              Takeaway
            </button>
          )}
        </div>
      </SectionHead>
      <div className="pos-layout">
        <section className="menu-area">
          <div className="floor-strip">
            <div className="floor-label">
              {mode === 'dine-in' ? 'YOUR TABLES' : 'TAKEAWAY QUEUE'}
              <Badge>{openOrders.length} active</Badge>
            </div>
            <div className="table-strip">
              {mode === 'dine-in' ? (
                s.settings[0].tables.map((t) => {
                  const active = s.orders.find((o) => o.tableId === t.id && o.status === 'open');
                  return (
                    <button
                      key={t.id}
                      disabled={!online || busy}
                      className={`table-tile ${active ? 'occupied' : ''} ${selected === active?.id && active ? 'chosen' : ''}`}
                      onClick={() => void open(t.id)}
                    >
                      <UtensilsCrossed size={17} />
                      <strong>{t.name}</strong>
                      <small>
                        {active
                          ? `#${active.number} · ${money(total(active))}`
                          : `${t.seats} seats · Available`}
                      </small>
                    </button>
                  );
                })
              ) : (
                <>
                  <button
                    className="table-tile add-table"
                    disabled={!online || busy}
                    onClick={() => void open()}
                  >
                    <Plus />
                    <strong>New takeaway</strong>
                  </button>
                  {openOrders.map((o) => (
                    <button
                      key={o.id}
                      className={`table-tile occupied ${selected === o.id ? 'chosen' : ''}`}
                      onClick={() => setSelected(o.id)}
                    >
                      <ShoppingBag size={17} />
                      <strong>Token #{o.number}</strong>
                      <small>
                        {money(total(o))} · {o.paymentStatus}
                      </small>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
          <div className="menu-toolbar">
            <h2>What’s on the menu?</h2>
            <label className="search">
              <Search size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search menu…"
              />
            </label>
          </div>
          <div className="category-tabs">
            {categories.map((c) => (
              <button
                key={c}
                className={c === category ? 'active' : ''}
                onClick={() => setCategory(c)}
              >
                {c}
                {c === 'All items' && <span>{s.menu.length}</span>}
              </button>
            ))}
          </div>
          <div className="menu-grid">
            {s.menu
              .filter(
                (i) =>
                  (category === 'All items' || i.category === category) &&
                  i.name.toLowerCase().includes(query.toLowerCase()),
              )
              .map((m, index) => (
                <button
                  key={m.id}
                  className={`menu-card color-${index % 5}`}
                  disabled={
                    !online ||
                    busy ||
                    !m.available ||
                    !o ||
                    o.status !== 'open' ||
                    o.paymentStatus !== 'unpaid'
                  }
                  onClick={() => setItem(m)}
                >
                  <div className="food-art">
                    {m.imageVersion ? (
                      <img
                        className="menu-photo"
                        src={imageUrl('menu', m.id, m.imageVersion)}
                        alt={m.name}
                      />
                    ) : (
                      <div className="food-circle">
                        <FoodIcon name={m.icon} size={43} />
                      </div>
                    )}
                    {m.kind === 'deal' && <Badge tone="orange">DEAL</Badge>}
                    {!m.available && <Badge>Unavailable</Badge>}
                  </div>
                  <div className="menu-card-info">
                    <span className="menu-category">{m.category}</span>
                    <h3>{m.name}</h3>
                    <p>{m.description || 'Freshly prepared to order'}</p>
                    <div>
                      <strong>{money(m.price)}</strong>
                      <span className="add-icon">
                        <Plus size={17} />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
          </div>
          {!s.menu.length && (
            <Empty
              title="Your menu starts here"
              description="Add items in Menu & deals to begin taking orders."
            />
          )}
        </section>
        <aside className="order-panel" id="current-order">
          {o ? (
            <>
              <div className="order-header">
                <div>
                  <span className="eyebrow">CURRENT ORDER</span>
                  <h2>
                    {o.type === 'dine-in'
                      ? s.settings[0].tables.find((t) => t.id === o.tableId)?.name
                      : `Takeaway #${o.number}`}
                  </h2>
                  <span className="muted">
                    Order #{String(o.number).padStart(4, '0')} ·{' '}
                    <Badge tone={o.paymentStatus === 'paid' ? 'green' : 'orange'}>
                      {o.paymentStatus}
                    </Badge>
                  </span>
                </div>
                {o.type === 'dine-in' && o.paymentStatus === 'unpaid' && (
                  <button
                    className="icon-btn"
                    title="Transfer table"
                    onClick={() => setDialog('transfer')}
                  >
                    <ArrowRightLeft size={18} />
                  </button>
                )}
              </div>
              <div className="order-lines">
                {!o.rounds.length && !draft.length && (
                  <Empty
                    title="Something delicious?"
                    description="Choose an item from the menu to start this order."
                  />
                )}
                {o.rounds.map((r, index) => (
                  <div className="order-round" key={r.id}>
                    <div className="round-label">
                      ROUND {index + 1}
                      <Badge tone={r.status === 'ready' ? 'green' : 'neutral'}>{r.status}</Badge>
                    </div>
                    {r.lines.map((l) => (
                      <div className={`order-line ${l.cancelled ? 'cancelled' : ''}`} key={l.id}>
                        <div>
                          <strong>
                            {l.quantity} × {l.name}
                          </strong>
                          {l.addons.length > 0 && <small>+ {l.addons.join(', ')}</small>}
                          {l.note && <small>{l.note}</small>}
                          {l.cancelled && <small>Cancelled</small>}
                        </div>
                        <span>{money(l.price * l.quantity)}</span>
                        {!l.cancelled && o.paymentStatus === 'unpaid' && (
                          <button
                            className="icon-btn"
                            title="Cancel sent item"
                            onClick={() => {
                              setCancelLine(l.id);
                              setDialog('cancel');
                            }}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {r.status === 'ready' && (
                      <button
                        className="btn small secondary wide"
                        disabled={!online || busy}
                        onClick={() =>
                          void run('kitchen.status', { ...ref, roundId: r.id, status: 'served' })
                        }
                      >
                        <Check size={15} />
                        {o.type === 'takeaway' ? 'Mark collected' : 'Mark served'}
                      </button>
                    )}
                  </div>
                ))}
                {draft.length > 0 && (
                  <div className="draft-lines">
                    <div className="round-label">
                      NOT SENT YET<Badge tone="orange">{draft.length} items</Badge>
                    </div>
                    {draft.map((l, index) => (
                      <div className="draft-line" key={index}>
                        <div>
                          <strong>{l.name}</strong>
                          <span>{money(l.price * l.quantity)}</span>
                        </div>
                        {l.note && <small>{l.note}</small>}
                        <div className="quantity">
                          <button
                            onClick={() =>
                              setDraft(
                                draft
                                  .map((d, i) =>
                                    i === index ? { ...d, quantity: d.quantity - 1 } : d,
                                  )
                                  .filter((d) => d.quantity > 0),
                              )
                            }
                          >
                            <Minus size={13} />
                          </button>
                          <span>{l.quantity}</span>
                          <button
                            disabled={l.quantity >= 99}
                            onClick={() =>
                              setDraft(
                                draft.map((d, i) =>
                                  i === index ? { ...d, quantity: d.quantity + 1 } : d,
                                ),
                              )
                            }
                          >
                            <Plus size={13} />
                          </button>
                          <button
                            className="remove-draft"
                            title="Remove unsent item"
                            onClick={() => setDraft(draft.filter((_, i) => i !== index))}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="order-footer">
                <div className="bill-row">
                  <span>Subtotal</span>
                  <span>
                    {money(subtotal(o) + draft.reduce((a, l) => a + l.price * l.quantity, 0))}
                  </span>
                </div>
                <div className="bill-row">
                  <span>
                    Discount{' '}
                    {canBill && o.paymentStatus === 'unpaid' && (
                      <button className="text-btn" onClick={() => setDialog('discount')}>
                        Edit
                      </button>
                    )}
                  </span>
                  <span>− {money(o.discount)}</span>
                </div>
                <div className="bill-total">
                  <strong>Total</strong>
                  <strong>
                    {money(currentTotal + draft.reduce((a, l) => a + l.price * l.quantity, 0))}
                  </strong>
                </div>
                {draft.length > 0 ? (
                  <button
                    className="btn primary wide"
                    disabled={!online || busy}
                    onClick={async () => {
                      try {
                        await act('order.send', {
                          ...ref,
                          lines: draft.map(({ name, price, ...l }) => l),
                        });
                        setDraft([]);
                        notify('Order sent to the kitchen.');
                      } catch (e: any) {
                        if (!e.status) setDraft([]);
                        notify(e.message);
                      }
                    }}
                  >
                    <Send size={17} />
                    Send to kitchen
                  </button>
                ) : o.paymentStatus === 'unpaid' ? (
                  <>
                    {canBill && (
                      <button
                        className="btn primary wide"
                        disabled={
                          !online ||
                          busy ||
                          !o.rounds.some((r) => r.lines.some((l) => !l.cancelled))
                        }
                        onClick={() => setDialog('pay')}
                      >
                        Continue to payment
                        <ArrowUpRight size={17} />
                      </button>
                    )}
                    {o.rounds.every((r) => r.lines.every((l) => l.cancelled)) && (
                      <button
                        className="btn secondary wide"
                        disabled={!online || busy}
                        onClick={async () => {
                          const result = await run('order.void', ref);
                          if (result) {
                            setSelected(undefined);
                            notify('Empty order closed.');
                          }
                        }}
                      >
                        Close empty order
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button className="btn secondary wide" onClick={() => setReceipt(o)}>
                      <Printer size={17} />
                      Print receipt
                    </button>
                    {canBill && o.paymentStatus === 'paid' && (
                      <button className="text-btn" onClick={() => setDialog('refund')}>
                        Refund order
                      </button>
                    )}
                  </>
                )}
                <div className="order-footnote">Changes are saved when sent to the kitchen.</div>
              </div>
            </>
          ) : (
            <Empty
              title="Ready when you are"
              description="Select a table or open a takeaway to start taking an order."
            />
          )}
        </aside>
      </div>
      {o && (
        <button
          className="btn primary mobile-order-jump"
          onClick={() =>
            document
              .getElementById('current-order')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        >
          View order · {money(currentTotal + draft.reduce((a, l) => a + l.price * l.quantity, 0))}
        </button>
      )}
      {item && (
        <Modal
          title={item.name}
          subtitle={item.description}
          onClose={() => setItem(undefined)}
          submit="Add to order"
          onSubmit={async (f) => {
            add(
              item,
              val(f, 'variant') || undefined,
              f.getAll('addon').map(String),
              val(f, 'note'),
            );
          }}
        >
          <div className="item-detail-art">
            {item.imageVersion ? (
              <img
                className="item-photo"
                src={imageUrl('menu', item.id, item.imageVersion)}
                alt={item.name}
              />
            ) : (
              <FoodIcon name={item.icon} size={56} />
            )}
            <strong>{money(item.price)}</strong>
          </div>
          {item.variants.length > 0 && (
            <Field label="Size" name="variant">
              <option value="">Regular · {money(item.price)}</option>
              {item.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {money(v.price)}
                </option>
              ))}
            </Field>
          )}
          {item.addons.map((a) => (
            <label className="check-row" key={a.id}>
              <input type="checkbox" name="addon" value={a.id} />
              {a.name}
              <span>+ {money(a.price)}</span>
            </label>
          ))}
          {item.kind === 'deal' && (
            <div className="info-box">
              {item.components.map((c) => (
                <p key={c.itemId}>
                  {c.quantity} × {s.menu.find((i) => i.id === c.itemId)?.name}
                </p>
              ))}
            </div>
          )}
          <Field
            label="Preparation notes"
            name="note"
            required={false}
            placeholder="No onions, extra crispy…"
          />
        </Modal>
      )}
      {o && dialog && dialog !== 'history' && (
        <Modal
          title={
            {
              pay: 'Settle the bill',
              discount: 'Apply a discount',
              cancel: 'Cancel sent item',
              transfer: 'Move to another table',
              refund: 'Full refund',
            }[dialog] ?? ''
          }
          subtitle={`Order #${o.number} · ${money(total(o))}`}
          onClose={() => setDialog(undefined)}
          submit={dialog === 'pay' ? 'Confirm payment' : 'Confirm'}
          onSubmit={async (f) => {
            if (dialog === 'pay')
              await act('order.pay', {
                ...ref,
                method: val(f, 'method'),
                tendered: minor(f.get('tendered')),
                sessionId: val(f, 'sessionId') || undefined,
              });
            if (dialog === 'transfer')
              await act('order.transfer', { ...ref, tableId: val(f, 'tableId') });
            if (dialog === 'discount')
              await act(
                'order.discount',
                {
                  ...ref,
                  kind: val(f, 'kind'),
                  value:
                    val(f, 'kind') === 'fixed' ? minor(f.get('value')) : Number(f.get('value')),
                  reason: val(f, 'reason'),
                },
                approval(f),
              );
            if (dialog === 'cancel')
              await act(
                'order.cancelLine',
                { ...ref, lineId: cancelLine, reason: val(f, 'reason') },
                approval(f),
              );
            if (dialog === 'refund')
              await act(
                'order.refund',
                { ...ref, reason: val(f, 'reason'), sessionId: val(f, 'sessionId') || undefined },
                approval(f),
              );
            notify('Order updated.');
          }}
        >
          {dialog === 'pay' ? (
            <PaymentFields amount={total(o)} />
          ) : dialog === 'transfer' ? (
            <Field label="Available table" name="tableId">
              {s.settings[0].tables
                .filter((t) => !s.orders.some((o) => o.tableId === t.id && o.status === 'open'))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Field>
          ) : (
            <>
              {dialog === 'discount' && (
                <>
                  <Field label="Discount type" name="kind">
                    <option value="fixed">Fixed amount</option>
                    <option value="percent">Percentage</option>
                  </Field>
                  <Field label="Discount value" name="value" type="number" min="0" step="0.01" />
                </>
              )}
              {dialog === 'refund' && o.payment?.method === 'cash' && <SessionSelect required />}
              <ApprovalFields />
              {dialog === 'refund' && (
                <p className="muted">
                  Confirm the full amount has been returned using the original payment method. This
                  does not restore food to inventory.
                </p>
              )}
            </>
          )}
        </Modal>
      )}
      {dialog === 'history' && (
        <Modal title="Order history" onClose={() => setDialog(undefined)}>
          {s.orders
            .filter((x) => x.payment)
            .sort((a, b) => b.payment!.at.localeCompare(a.payment!.at))
            .slice(0, 100)
            .map((x) => (
              <button
                key={x.id}
                className="btn secondary wide"
                onClick={() => {
                  setSelected(x.id);
                  setMode(x.type);
                  setDialog(undefined);
                }}
              >
                #{x.number} · {money(x.payment!.amount)} · {x.paymentStatus} ·{' '}
                {new Date(x.payment!.at).toLocaleDateString()}
              </button>
            ))}
          {!s.orders.some((x) => x.payment) && (
            <Empty title="No paid orders yet" description="Completed receipts will appear here." />
          )}
        </Modal>
      )}
      {receipt && <Receipt order={receipt} onClose={() => setReceipt(undefined)} />}
    </>
  );
}
function PaymentFields({ amount }: { amount: number }) {
  const [method, setMethod] = useState('cash'),
    [tendered, setTendered] = useState((amount / 100).toFixed(2));
  const { money } = useApp();
  return (
    <>
      <div className="payment-total">
        <span>AMOUNT DUE</span>
        <strong>{money(amount)}</strong>
      </div>
      <label className="field">
        <span>Payment method</span>
        <select name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="cash">Cash</option>
          <option value="card">Card · manually confirmed</option>
          <option value="digital">Digital · manually confirmed</option>
        </select>
      </label>
      {method === 'cash' ? (
        <>
          <SessionSelect required />
          <label className="field">
            <span>Cash received</span>
            <input
              name="tendered"
              type="number"
              step="0.01"
              min={amount / 100}
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              required
            />
          </label>
          <div className="bill-total">
            <span>Change</span>
            <strong>{money(Math.max(0, Math.round(Number(tendered) * 100) - amount))}</strong>
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="tendered" value={(amount / 100).toFixed(2)} />
          <div className="info-box">
            Confirm payment on your terminal or payment app before recording it here.
          </div>
        </>
      )}
    </>
  );
}
export function Receipt({ order: o, onClose }: { order: Order; onClose: () => void }) {
  const { money, s, notify } = useApp();
  const r = o.payment?.receipt;
  return (
    <Modal title="Receipt" onClose={onClose}>
      <div className="receipt" id="print-receipt">
        {s.settings[0].logoVersion && (
          <img
            className="receipt-logo"
            src={imageUrl('logo', 'restaurant', s.settings[0].logoVersion)}
            alt={`${s.settings[0].name} logo`}
          />
        )}
        <h2>{r?.name}</h2>
        <p>{r?.address}</p>
        <h3>Order #{o.number}</h3>
        <p>{o.payment?.at && new Date(o.payment.at).toLocaleString()}</p>
        <hr />
        {o.rounds
          .flatMap((r) => r.lines)
          .filter((l) => !l.cancelled)
          .map((l) => (
            <div className="bill-row" key={l.id}>
              <span>
                {l.quantity} × {l.name}
                {l.addons.length > 0 && <small> + {l.addons.join(', ')}</small>}
              </span>
              <span>{money(l.price * l.quantity)}</span>
            </div>
          ))}
        <hr />
        <div className="bill-row">
          <span>Subtotal</span>
          <span>{money(subtotal(o))}</span>
        </div>
        <div className="bill-row">
          <span>Discount</span>
          <span>{money(o.discount)}</span>
        </div>
        <div className="bill-total">
          <strong>Total</strong>
          <strong>{money(o.payment?.amount ?? total(o))}</strong>
        </div>
        <p>
          {o.payment?.method.toUpperCase()} · {o.paymentStatus.toUpperCase()}
        </p>
        {o.payment?.method === 'cash' && (
          <>
            <div className="bill-row">
              <span>Received</span>
              <span>{money(o.payment.tendered)}</span>
            </div>
            <div className="bill-row">
              <span>Change</span>
              <span>{money(o.payment.change)}</span>
            </div>
          </>
        )}
        <p>{r?.footer}</p>
      </div>
      <button
        className="btn primary wide no-print"
        onClick={async () => {
          try {
            await Promise.all(
              Array.from(document.querySelectorAll<HTMLImageElement>('#print-receipt img')).map(
                (img) => img.decode(),
              ),
            );
            window.print();
          } catch {
            notify('The receipt logo could not load. Check your connection and try again.');
          }
        }}
      >
        <Printer size={17} />
        Print receipt
      </button>
    </Modal>
  );
}
