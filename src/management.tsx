import { useState, useRef } from 'react';
import {
  Plus,
  ArrowUpRight,
  Pencil,
  Package,
  Wallet,
  Download,
  ShieldCheck,
  Search,
  RotateCcw,
} from 'lucide-react';
import { useApp } from './api';
import {
  SectionHead,
  Modal,
  Field,
  MoneyField,
  SessionSelect,
  Empty,
  Badge,
  val,
  num,
  minor,
} from './ui';
import { type MenuItem, type Settings, expectedCash, balance } from '../shared/types';
import { FoodIcon } from './pos';
import { ImagePicker, imageUrl, uploadImage } from './images';
import { uuid } from './id';

const labels: Record<
  string,
  { title: string; eyebrow: string; description: string; button: string }
> = {
  menu: {
    title: 'Menu & deals',
    eyebrow: 'MADE TO ORDER',
    description: 'The dishes, drinks, and little extras that make your menu.',
    button: 'Add menu item',
  },
  inventory: {
    title: 'Inventory',
    eyebrow: 'KEEP IT STOCKED',
    description: 'Know what’s on hand, down to the last bottle.',
    button: 'Add stock item',
  },
  purchases: {
    title: 'Purchases',
    eyebrow: 'FROM YOUR SUPPLIERS',
    description: 'Receive stock, record payments, and keep balances clear.',
    button: 'New purchase',
  },
  expenses: {
    title: 'Expenses',
    eyebrow: 'EVERYDAY OPERATIONS',
    description: 'A clear picture of what keeps your restaurant running.',
    button: 'Record expense',
  },
  cash: {
    title: 'Cash drawer',
    eyebrow: 'EVERY AMOUNT ACCOUNTED FOR',
    description: 'Open your shift, track movements, and close with confidence.',
    button: 'Open a shift',
  },
  users: {
    title: 'Team & access',
    eyebrow: 'YOUR PEOPLE',
    description: 'Give every person the right tools for their role.',
    button: 'Add team member',
  },
  settings: {
    title: 'Restaurant settings',
    eyebrow: 'MAKE IT YOURS',
    description: 'The details that keep your workspace running smoothly.',
    button: 'Edit settings',
  },
};
export function Management({ page }: { page: string }) {
  const { s, user, money, act, notify, today, online, busy } = useApp();
  const [dialog, setDialog] = useState<{ type: string; record?: any }>(),
    [query, setQuery] = useState('');
  const cfg = s.settings[0],
    heading = labels[page] ?? labels.settings;
  const open = (type: string, record?: any) => setDialog({ type, record });
  const close = () => setDialog(undefined);
  const actionButton = (label: string, type: string, record: any) => (
    <button className="text-btn" disabled={!online || busy} onClick={() => open(type, record)}>
      {label}
    </button>
  );
  const find = (name: string) => name.toLowerCase().includes(query.toLowerCase());
  return (
    <>
      <SectionHead {...heading}>
        {page === 'purchases' && (
          <button
            className="btn secondary"
            disabled={!online || busy}
            onClick={() => open('supplierPay')}
          >
            Pay supplier
          </button>
        )}
        <button
          className="btn primary"
          disabled={!online || busy}
          onClick={() =>
            open(
              page === 'purchases'
                ? 'purchase'
                : page === 'expenses'
                  ? 'expense'
                  : page === 'users'
                    ? 'user'
                    : page === 'cash'
                      ? 'shift'
                      : page === 'inventory'
                        ? 'stock'
                        : page === 'settings'
                          ? 'settings'
                          : 'menu',
            )
          }
        >
          <Plus size={17} />
          {heading.button}
        </button>
      </SectionHead>
      {page === 'menu' && (
        <>
          <div className="panel-toolbar">
            <div className="tab-title">
              All menu items <Badge>{s.menu.length}</Badge>
            </div>
            <label className="search">
              <Search size={17} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a dish or deal…"
              />
            </label>
          </div>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock link</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {s.menu
                  .filter((m) => find(m.name))
                  .map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="cell-item">
                          <span className="item-icon">
                            {m.imageVersion ? (
                              <img
                                className="thumbnail"
                                src={imageUrl('menu', m.id, m.imageVersion)}
                                alt={m.name}
                              />
                            ) : (
                              <FoodIcon name={m.icon} size={23} />
                            )}
                          </span>
                          <span>
                            <strong>{m.name}</strong>
                            <small>
                              {m.kind === 'deal'
                                ? `${m.components.length} component items`
                                : m.variants.length
                                  ? `${m.variants.length} sizes available`
                                  : 'Menu item'}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>{m.category}</td>
                      <td className="strong">{money(m.price)}</td>
                      <td>
                        {m.stockId
                          ? s.stock.find((x) => x.id === m.stockId)?.name
                          : m.kind === 'deal'
                            ? 'From components'
                            : 'Not tracked'}
                      </td>
                      <td>
                        <Badge tone={m.available ? 'green' : 'neutral'}>
                          {m.available ? 'Available' : 'Unavailable'}
                        </Badge>
                      </td>
                      <td>{actionButton('Edit item', 'menu', m)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!s.menu.length && (
              <Empty
                title="Build your menu"
                description="Add your first dish, drink, or fixed deal."
              />
            )}
          </div>
        </>
      )}
      {page === 'inventory' && (
        <>
          <div className="stats-grid three">
            <Stat
              label="Stock items"
              value={String(s.stock.length)}
              detail="Across your restaurant"
            />
            <Stat
              label="Negative balances"
              value={String(s.stock.filter((x) => balance(s, x.id) < 0).length)}
              detail="Count these items to reconcile"
            />
            <Stat
              label="Stock movements"
              value={String(s.stockMovements.length)}
              detail="A complete movement history"
            />
          </div>
          <div className="panel table-wrap">
            <div className="panel-heading">
              <h2>Stock on hand</h2>
              <Badge>Base units</Badge>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Stock item</th>
                  <th>Base unit</th>
                  <th>On hand</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {s.stock.map((st) => (
                  <tr key={st.id}>
                    <td>
                      <strong>{st.name}</strong>
                    </td>
                    <td>{st.unit}</td>
                    <td>
                      <strong className={balance(s, st.id) < 0 ? 'negative' : ''}>
                        {balance(s, st.id).toLocaleString()}
                      </strong>
                    </td>
                    <td>
                      <Badge tone={balance(s, st.id) < 0 ? 'red' : st.active ? 'green' : 'neutral'}>
                        {balance(s, st.id) < 0
                          ? 'Negative stock'
                          : st.active
                            ? 'Active'
                            : 'Inactive'}
                      </Badge>
                    </td>
                    <td>
                      <div className="row-actions">
                        {actionButton('Adjust / count', 'adjust', st)}
                        {actionButton('Edit', 'stock', st)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!s.stock.length && (
              <Empty
                title="Start tracking stock"
                description="Use a small base unit, such as grams or individual bottles. Enter whole quantities in that unit."
              />
            )}
          </div>
          <div className="panel table-wrap">
            <div className="panel-heading">
              <h2>Movement history</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Reason</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {[...s.stockMovements]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .slice(0, 100)
                  .map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.at).toLocaleString()}</td>
                      <td>{s.stock.find((x) => x.id === m.stockId)?.name}</td>
                      <td className={m.quantity < 0 ? 'negative' : 'positive'}>
                        {m.quantity > 0 ? '+' : ''}
                        {m.quantity}
                      </td>
                      <td>{m.reason}</td>
                      <td>{s.users.find((u) => u.id === m.userId)?.name}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="table-note">Showing the latest 100 movements.</p>
          </div>
        </>
      )}
      {page === 'cash' && (
        <>
          <div className="cash-cards">
            {s.cashSessions
              .filter((c) => !c.closedAt)
              .map((c) => (
                <div className="cash-card" key={c.id}>
                  <div className="cash-card-top">
                    <span className="item-icon">
                      <Wallet size={23} />
                    </span>
                    <Badge tone="green">Shift open</Badge>
                  </div>
                  <h2>{cfg.registers.find((r) => r.id === c.registerId)?.name}</h2>
                  <p>
                    {s.users.find((u) => u.id === c.cashierId)?.name} · since{' '}
                    {new Date(c.openedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <span className="eyebrow">EXPECTED IN DRAWER</span>
                  <strong className="cash-amount">{money(expectedCash(s, c))}</strong>
                  <div className="bill-row">
                    <span>Opening float</span>
                    <span>{money(c.opening)}</span>
                  </div>
                  <div className="cash-actions">
                    <button
                      className="btn secondary"
                      onClick={() => open('cashMove', c)}
                      disabled={!online}
                    >
                      Cash in / out
                    </button>
                    <button
                      className="btn primary"
                      onClick={() => open('closeShift', c)}
                      disabled={!online}
                    >
                      Close shift
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
          {!s.cashSessions.some((c) => !c.closedAt) && (
            <div className="panel">
              <Empty
                title="Ready to open the drawer?"
                description="Open a shift with your opening float before accepting cash payments."
              />
            </div>
          )}
          <div className="panel table-wrap">
            <div className="panel-heading">
              <h2>Cash movements</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date & time</th>
                  <th>Reason</th>
                  <th>Amount</th>
                  <th>Staff</th>
                </tr>
              </thead>
              <tbody>
                {[...s.cashMovements]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .slice(0, 100)
                  .map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.at).toLocaleString()}</td>
                      <td>{m.reason}</td>
                      <td className={m.amount < 0 ? 'negative' : 'positive'}>{money(m.amount)}</td>
                      <td>{s.users.find((u) => u.id === m.userId)?.name ?? 'Staff'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="panel table-wrap">
            <div className="panel-heading">
              <h2>Closed shifts</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Closed</th>
                  <th>Cashier</th>
                  <th>Expected</th>
                  <th>Counted</th>
                  <th>Variance</th>
                </tr>
              </thead>
              <tbody>
                {s.cashSessions
                  .filter((c) => c.closedAt)
                  .sort((a, b) => b.closedAt!.localeCompare(a.closedAt!))
                  .map((c) => (
                    <tr key={c.id}>
                      <td>{new Date(c.closedAt!).toLocaleString()}</td>
                      <td>{s.users.find((u) => u.id === c.cashierId)?.name}</td>
                      <td>{money(c.expected ?? 0)}</td>
                      <td>{money(c.counted ?? 0)}</td>
                      <td className={c.variance ? 'negative' : 'positive'}>
                        {money(c.variance ?? 0)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {page === 'purchases' && (
        <>
          <div className="panel table-wrap">
            <div className="panel-heading">
              <h2>Supplier balances</h2>
              <button className="btn small secondary" onClick={() => open('supplier')}>
                <Plus size={15} />
                Add supplier
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Phone</th>
                  <th>Outstanding</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {s.suppliers.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.name}</strong>
                    </td>
                    <td>{v.phone || '—'}</td>
                    <td>
                      {money(
                        s.purchases
                          .filter((p) => p.supplierId === v.id && !p.reversedAt)
                          .reduce(
                            (a, p) =>
                              a +
                              p.total -
                              s.supplierPayments
                                .filter((x) => x.purchaseId === p.id && !x.reversedAt)
                                .reduce((b, x) => b + x.amount, 0),
                            0,
                          ),
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {actionButton('Pay supplier', 'supplierPay', v)}
                        {actionButton('Edit', 'supplier', v)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!s.suppliers.length && (
              <Empty
                title="Meet your suppliers"
                description="Add a supplier before recording a purchase."
              />
            )}
          </div>
          <div className="panel table-wrap">
            <div className="panel-heading">
              <h2>Purchase entries</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date / reference</th>
                  <th>Supplier</th>
                  <th>Total</th>
                  <th>Outstanding</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...s.purchases]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((p) => {
                    const due =
                      p.total -
                      s.supplierPayments
                        .filter((x) => x.purchaseId === p.id && !x.reversedAt)
                        .reduce((a, x) => a + x.amount, 0);
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.date}</strong>
                          <small>{p.reference || p.id.slice(0, 8)}</small>
                        </td>
                        <td>{s.suppliers.find((v) => v.id === p.supplierId)?.name}</td>
                        <td>{money(p.total)}</td>
                        <td>{p.reversedAt ? '—' : money(due)}</td>
                        <td>
                          <Badge tone={p.reversedAt ? 'red' : due ? 'orange' : 'green'}>
                            {p.reversedAt ? 'Reversed' : due ? 'Outstanding' : 'Paid'}
                          </Badge>
                        </td>
                        <td>
                          <div className="row-actions">
                            {actionButton('Details', 'purchaseDetail', p)}
                            {!p.reversedAt &&
                              due > 0 &&
                              actionButton('Record payment', 'purchasePay', p)}
                            {!p.reversedAt && actionButton('Reverse', 'purchaseReverse', p)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className="panel table-wrap">
            <div className="panel-heading">
              <h2>Supplier payments</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Purchase</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...s.supplierPayments]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((p) => (
                    <tr key={p.id}>
                      <td>{new Date(p.at).toLocaleString()}</td>
                      <td>
                        {s.purchases.find((x) => x.id === p.purchaseId)?.reference ||
                          p.purchaseId.slice(0, 8)}
                      </td>
                      <td>{money(p.amount)}</td>
                      <td>{p.method}</td>
                      <td>
                        {p.reversedAt ? (
                          <Badge tone="red">Reversed</Badge>
                        ) : (
                          actionButton('Reverse payment', 'paymentReverse', p)
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {page === 'expenses' && (
        <>
          <div className="stats-grid three">
            <Stat
              label="Total recorded"
              value={money(
                s.expenses.filter((e) => !e.reversedAt).reduce((a, e) => a + e.amount, 0),
              )}
              detail="All non-reversed expenses"
            />
            <Stat
              label="Categories"
              value={String(new Set(s.expenses.map((e) => e.category)).size)}
              detail="Operating expense categories"
            />
            <Stat
              label="Entries"
              value={String(s.expenses.length)}
              detail="Including retained reversals"
            />
          </div>
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Notes</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...s.expenses]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((e) => (
                    <tr key={e.id}>
                      <td>{e.date}</td>
                      <td>
                        <strong>{e.category}</strong>
                      </td>
                      <td>{e.note || '—'}</td>
                      <td>
                        {e.method}
                        {e.sessionId && <small>Cash drawer</small>}
                      </td>
                      <td>{money(e.amount)}</td>
                      <td>
                        {e.reversedAt ? (
                          <Badge tone="red">Reversed</Badge>
                        ) : (
                          actionButton('Reverse', 'expenseReverse', e)
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!s.expenses.length && (
              <Empty
                title="A clean slate"
                description="Record rent, utilities, supplies, and other operating expenses here."
              />
            )}
          </div>
        </>
      )}
      {page === 'users' && (
        <>
          <div className="team-grid">
            {s.users.map((u) => (
              <div className="team-card" key={u.id}>
                <div className="team-top">
                  <span className="avatar large">
                    {u.name
                      .split(' ')
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                  <Badge tone={u.active ? 'green' : 'neutral'}>
                    {u.active ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
                <h2>{u.name}</h2>
                <p>@{u.username}</p>
                <div className="team-role">
                  <ShieldCheck size={16} />
                  {u.role}
                </div>
                <button className="btn secondary wide" onClick={() => open('user', u)}>
                  Manage access
                  <Pencil size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="panel table-wrap">
            <div className="panel-heading">
              <h2>Activity history</h2>
              <Badge>Latest 100</Badge>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Staff</th>
                  <th>Action</th>
                  <th>Reason / approval</th>
                </tr>
              </thead>
              <tbody>
                {[...s.audit]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .slice(0, 100)
                  .map((a) => (
                    <tr key={a.id}>
                      <td>{new Date(a.at).toLocaleString()}</td>
                      <td>{s.users.find((u) => u.id === a.userId)?.name}</td>
                      <td>{a.action}</td>
                      <td>
                        {a.reason || '—'}
                        {a.approverId && (
                          <small>
                            Approved by {s.users.find((u) => u.id === a.approverId)?.name}
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {page === 'settings' && (
        <div className="settings-grid">
          <div className="panel settings-panel">
            <span className="eyebrow">RESTAURANT PROFILE</span>
            {cfg.logoVersion && (
              <img
                className="restaurant-logo"
                src={imageUrl('logo', 'restaurant', cfg.logoVersion)}
                alt={`${cfg.name} logo`}
              />
            )}
            <h2>{cfg.name}</h2>
            <p>{cfg.address || 'No address configured'}</p>
            <dl>
              <div>
                <dt>Currency</dt>
                <dd>{cfg.currency}</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{cfg.timezone}</dd>
              </div>
              <div>
                <dt>Business day starts</dt>
                <dd>{cfg.cutoff}</dd>
              </div>
              <div>
                <dt>Tax</dt>
                <dd>Off</dd>
              </div>
              <div>
                <dt>Tables / registers</dt>
                <dd>
                  {cfg.tables.length} / {cfg.registers.length}
                </dd>
              </div>
            </dl>
            <span className="eyebrow">RECEIPT FOOTER</span>
            <p>{cfg.footer}</p>
          </div>
          <div className="panel settings-panel">
            <span className="eyebrow">DATA & RECOVERY</span>
            <h2>Local, and looked after.</h2>
            <p>
              Production backups run daily to the destination configured on your server. Keep that
              destination on a second drive or device.
            </p>
            <dl>
              <div>
                <dt>Last successful backup</dt>
                <dd>
                  {cfg.lastBackup ? new Date(cfg.lastBackup).toLocaleString() : 'Not yet recorded'}
                </dd>
              </div>
              <div>
                <dt>Retention</dt>
                <dd>30 daily backups</dd>
              </div>
            </dl>
            {cfg.backupError && <div className="error">{cfg.backupError}</div>}
            <div className="info-box">
              Restore instructions and the verification command are included in the deployment
              guide. Development data uses an isolated local database and is not production data.
            </div>
          </div>
        </div>
      )}
      {dialog?.type === 'menu' && <MenuEditor item={dialog.record} onClose={close} />}
      {dialog?.type === 'purchase' && <PurchaseEditor onClose={close} />}
      {dialog?.type === 'settings' && <SettingsEditor onClose={close} />}
      {dialog?.type === 'supplierPay' && (
        <SupplierPaymentEditor supplierId={dialog.record?.id} onClose={close} />
      )}
      {dialog && !['menu', 'purchase', 'settings', 'supplierPay'].includes(dialog.type) && (
        <Modal
          title={
            {
              stock: dialog.record ? 'Edit stock item' : 'Add stock item',
              adjust: 'Adjust stock',
              shift: 'Open a cash shift',
              cashMove: 'Cash in / out',
              closeShift: 'Close your shift',
              supplier: 'Supplier details',
              purchasePay: 'Record supplier payment',
              purchaseReverse: 'Reverse purchase',
              paymentReverse: 'Reverse supplier payment',
              expense: 'Record an expense',
              expenseReverse: 'Reverse expense',
              user: dialog.record ? 'Edit team member' : 'Add team member',
              purchaseDetail: 'Purchase details',
            }[dialog.type] ?? ''
          }
          onClose={close}
          submit={dialog.type.includes('Reverse') ? 'Confirm reversal' : 'Save'}
          onSubmit={
            dialog.type === 'purchaseDetail'
              ? undefined
              : async (f) => {
                  const r = dialog.record,
                    t = dialog.type;
                  let action = '',
                    data: any = {};
                  if (t === 'stock') {
                    action = 'stock.save';
                    data = {
                      id: r?.id,
                      name: val(f, 'name'),
                      unit: val(f, 'unit'),
                      active: val(f, 'active') === 'true',
                    };
                  }
                  if (t === 'adjust') {
                    action = 'stock.adjust';
                    data = {
                      stockId: r.id,
                      kind: val(f, 'kind'),
                      quantity: num(f, 'quantity'),
                      reason: val(f, 'reason'),
                    };
                  }
                  if (t === 'shift') {
                    action = 'cash.open';
                    data = {
                      registerId: val(f, 'registerId'),
                      cashierId: val(f, 'cashierId'),
                      opening: minor(f.get('opening')),
                    };
                  }
                  if (t === 'cashMove') {
                    action = 'cash.move';
                    data = {
                      sessionId: r.id,
                      direction: val(f, 'direction'),
                      amount: minor(f.get('amount')),
                      reason: val(f, 'reason'),
                    };
                  }
                  if (t === 'closeShift') {
                    action = 'cash.close';
                    data = { sessionId: r.id, counted: minor(f.get('counted')) };
                  }
                  if (t === 'supplier') {
                    action = 'supplier.save';
                    data = { id: r?.id, name: val(f, 'name'), phone: val(f, 'phone') };
                  }
                  if (t === 'purchasePay') {
                    action = 'purchase.pay';
                    data = {
                      purchaseId: r.id,
                      amount: minor(f.get('amount')),
                      method: val(f, 'method'),
                      sessionId: val(f, 'sessionId') || undefined,
                    };
                  }
                  if (t === 'purchaseReverse') {
                    action = 'purchase.reverse';
                    data = { purchaseId: r.id, reason: val(f, 'reason') };
                  }
                  if (t === 'paymentReverse') {
                    action = 'purchase.reversePayment';
                    data = {
                      paymentId: r.id,
                      reason: val(f, 'reason'),
                      sessionId: val(f, 'sessionId') || undefined,
                    };
                  }
                  if (t === 'expense') {
                    action = 'expense.post';
                    data = {
                      category: val(f, 'category'),
                      amount: minor(f.get('amount')),
                      date: val(f, 'date'),
                      method: val(f, 'method'),
                      sessionId: val(f, 'sessionId') || undefined,
                      note: val(f, 'note'),
                    };
                  }
                  if (t === 'expenseReverse') {
                    action = 'expense.reverse';
                    data = {
                      expenseId: r.id,
                      reason: val(f, 'reason'),
                      sessionId: val(f, 'sessionId') || undefined,
                    };
                  }
                  if (t === 'user') {
                    action = 'user.save';
                    data = {
                      id: r?.id,
                      name: val(f, 'name'),
                      username: val(f, 'username'),
                      role: val(f, 'role'),
                      active: val(f, 'active') === 'true',
                      password: val(f, 'password') || undefined,
                    };
                  }
                  await act(action, data);
                  notify('Saved successfully.');
                }
          }
        >
          {dialog.type === 'stock' && (
            <>
              <Field name="name" label="Stock item name" value={dialog.record?.name} />
              <Field
                name="unit"
                label="Base unit (whole quantities, e.g. grams, bottles)"
                value={dialog.record?.unit}
              />
              <Field name="active" label="Status" value={String(dialog.record?.active ?? true)}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Field>
            </>
          )}
          {dialog.type === 'adjust' && (
            <>
              <div className="info-box">
                {dialog.record.name} · Current balance: {balance(s, dialog.record.id)}{' '}
                {dialog.record.unit}
              </div>
              <Field name="kind" label="Adjustment type">
                <option value="count">Set to a physical count</option>
                <option value="adjust">Add / remove quantity</option>
              </Field>
              <Field name="quantity" label="Quantity (negative to remove)" type="number" step="1" />
              <Field name="reason" label="Reason" />
            </>
          )}
          {dialog.type === 'shift' && (
            <>
              <Field name="registerId" label="Register">
                {cfg.registers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Field>
              <Field name="cashierId" label="Assigned cashier" value={user.id}>
                {s.users
                  .filter(
                    (u) =>
                      u.active &&
                      ['owner', 'manager', 'cashier'].includes(u.role) &&
                      (user.role !== 'cashier' || u.id === user.id),
                  )
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </Field>
              <MoneyField name="opening" label="Opening float" />
            </>
          )}
          {dialog.type === 'cashMove' && (
            <>
              <Field name="direction" label="Movement">
                <option value="in">Cash in</option>
                <option value="out">Cash out</option>
              </Field>
              <MoneyField name="amount" label="Amount" />
              <Field name="reason" label="Reason" />
            </>
          )}
          {dialog.type === 'closeShift' && (
            <>
              <div className="payment-total">
                <span>EXPECTED CASH</span>
                <strong>{money(expectedCash(s, dialog.record))}</strong>
              </div>
              <MoneyField name="counted" label="Counted closing cash" />
              <p className="muted">
                Count the drawer before submitting. This closes the shift and records any variance.
              </p>
            </>
          )}
          {dialog.type === 'supplier' && (
            <>
              <Field name="name" label="Supplier name" value={dialog.record?.name} />
              <Field name="phone" label="Phone" value={dialog.record?.phone} required={false} />
            </>
          )}
          {dialog.type === 'purchasePay' && (
            <>
              <MoneyField
                name="amount"
                label="Payment amount"
                value={
                  dialog.record.total -
                  s.supplierPayments
                    .filter((p) => p.purchaseId === dialog.record.id && !p.reversedAt)
                    .reduce((a, p) => a + p.amount, 0)
                }
              />
              <MethodField />
              <SessionSelect />
            </>
          )}
          {dialog.type.endsWith('Reverse') && (
            <>
              <Field name="reason" label="Reason for reversal" />
              {dialog.record?.sessionId && <SessionSelect required />}
              <div className="info-box">
                The original entry remains in history. For payments or expenses, confirm the money
                has been returned before reversing.
              </div>
            </>
          )}
          {dialog.type === 'expense' && (
            <>
              <div className="form-grid">
                <Field name="category" label="Category" placeholder="Utilities, rent, supplies…" />
                <Field name="date" label="Expense date" type="date" value={today} />
              </div>
              <MoneyField name="amount" label="Amount" />
              <MethodField />
              <SessionSelect />
              <Field name="note" label="Notes" required={false} />
            </>
          )}
          {dialog.type === 'user' && (
            <>
              <Field name="name" label="Full name" value={dialog.record?.name} />
              <Field name="username" label="Username" value={dialog.record?.username} />
              <Field name="role" label="Role" value={dialog.record?.role ?? 'waiter'}>
                {['owner', 'manager', 'cashier', 'waiter', 'kitchen'].map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </Field>
              <Field name="active" label="Status" value={String(dialog.record?.active ?? true)}>
                <option value="true">Active</option>
                <option value="false">Disabled</option>
              </Field>
              <Field
                name="password"
                label={
                  dialog.record
                    ? 'New password (leave blank to keep current)'
                    : 'Password (minimum 10 characters)'
                }
                type="password"
                required={!dialog.record}
              />
            </>
          )}
          {dialog.type === 'purchaseDetail' && (
            <>
              <p>
                {s.suppliers.find((v) => v.id === dialog.record.supplierId)?.name} ·{' '}
                {dialog.record.date}
              </p>
              {dialog.record.lines.map((l: any, i: number) => (
                <div className="bill-row" key={i}>
                  <span>
                    {l.quantity} × {l.name}
                  </span>
                  <strong>{money(l.cost * l.quantity)}</strong>
                </div>
              ))}
              <div className="bill-total">
                <span>Total</span>
                <strong>{money(dialog.record.total)}</strong>
              </div>
              {dialog.record.reversedAt && (
                <div className="error">Reversed: {dialog.record.reversalReason}</div>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
export function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        {label}
        <ArrowUpRight size={16} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function MethodField() {
  return (
    <Field name="method" label="Payment method">
      <option value="cash">Cash</option>
      <option value="card">Card</option>
      <option value="digital">Digital</option>
    </Field>
  );
}
function SupplierPaymentEditor({
  supplierId,
  onClose,
}: {
  supplierId?: string;
  onClose: () => void;
}) {
  const { s, money, act, notify } = useApp();
  const [supplier, setSupplier] = useState(supplierId ?? s.suppliers[0]?.id ?? '');
  const [selected, setSelected] = useState('');
  const outstanding = s.purchases
    .filter((p) => p.supplierId === supplier && !p.reversedAt)
    .map((p) => ({
      ...p,
      due:
        p.total -
        s.supplierPayments
          .filter((x) => x.purchaseId === p.id && !x.reversedAt)
          .reduce((a, x) => a + x.amount, 0),
    }))
    .filter((p) => p.due > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const purchase = outstanding.find((p) => p.id === selected) ?? outstanding[0];
  return (
    <Modal
      title="Pay supplier"
      subtitle="Record a full or partial payment against an outstanding purchase."
      onClose={onClose}
      submit="Record supplier payment"
      onSubmit={
        purchase
          ? async (f) => {
              await act('purchase.pay', {
                purchaseId: purchase.id,
                amount: minor(f.get('amount')),
                method: val(f, 'method'),
                sessionId: val(f, 'sessionId') || undefined,
              });
              notify('Supplier payment recorded.');
            }
          : undefined
      }
    >
      <label className="field">
        <span>Supplier</span>
        <select
          name="supplierId"
          value={supplier}
          onChange={(e) => {
            setSupplier(e.target.value);
            setSelected('');
          }}
        >
          {s.suppliers.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      {purchase ? (
        <>
          <label className="field">
            <span>Outstanding purchase</span>
            <select
              name="purchaseId"
              value={purchase.id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {outstanding.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.date} · {p.reference || p.id.slice(0, 8)} · {money(p.due)} due
                </option>
              ))}
            </select>
          </label>
          <MoneyField key={purchase.id} name="amount" label="Payment amount" value={purchase.due} />
          <MethodField />
          <SessionSelect />
          <p className="muted">
            Choose a drawer only when the payment comes from that drawer. The balance and cash
            ledger update together.
          </p>
        </>
      ) : (
        <Empty
          title="No outstanding purchases"
          description="This supplier has no unpaid purchases. Record a purchase receipt first."
        />
      )}
    </Modal>
  );
}
function MenuEditor({ item, onClose }: { item?: MenuItem; onClose: () => void }) {
  const { s, act, money, refresh } = useApp();
  const savedId = useRef(item?.id);
  const [photo, setPhoto] = useState<File>();
  const [kind, setKind] = useState(item?.kind ?? 'item'),
    [components, setComponents] = useState(item?.components ?? []),
    [variants, setVariants] = useState(item?.variants ?? []),
    [addons, setAddons] = useState(item?.addons ?? []);
  return (
    <Modal
      title={item ? 'Edit menu item' : 'Add something delicious'}
      onClose={onClose}
      onSubmit={async (f) => {
        const result = await act('menu.save', {
          id: savedId.current,
          name: val(f, 'name'),
          category: val(f, 'category'),
          description: val(f, 'description'),
          price: minor(f.get('price')),
          available: val(f, 'available') === 'true',
          kind,
          icon: val(f, 'icon'),
          stockId: kind === 'item' ? val(f, 'stockId') || undefined : undefined,
          variants: kind === 'item' ? variants : [],
          addons,
          components: kind === 'deal' ? components : [],
        });
        savedId.current = result.id;
        if (photo) {
          await uploadImage('menu', result.id, photo);
          await refresh();
        }
      }}
    >
      <ImagePicker
        label="Menu item picture"
        current={imageUrl('menu', item?.id ?? '', item?.imageVersion)}
        file={photo}
        onChange={setPhoto}
      />
      <div className="form-grid">
        <Field label="Item name" name="name" value={item?.name} />
        <Field
          label="Category"
          name="category"
          value={item?.category}
          placeholder="Burgers, drinks…"
        />
      </div>
      <label className="field">
        <span>Type</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as any)}>
          <option value="item">Menu item</option>
          <option value="deal">Fixed deal</option>
        </select>
      </label>
      <MoneyField label="Selling price" name="price" value={item?.price} />
      <Field label="Description" name="description" value={item?.description} required={false} />
      <div className="form-grid">
        <Field label="Availability" name="available" value={String(item?.available ?? true)}>
          <option value="true">Available</option>
          <option value="false">Unavailable</option>
        </Field>
        <Field label="Menu icon" name="icon" value={item?.icon ?? 'plate'}>
          {['plate', 'flame', 'leaf', 'sandwich', 'coffee', 'drink'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Field>
      </div>
      {kind === 'item' ? (
        <>
          <Field
            label="Packaged stock link (one base unit per item)"
            name="stockId"
            value={item?.stockId ?? ''}
            required={false}
          >
            <option value="">No automatic stock deduction</option>
            {s.stock
              .filter((st) => st.active)
              .map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} · {st.unit}
                </option>
              ))}
          </Field>
          <OptionEditor
            title="Size variants · full selling price"
            values={variants}
            onChange={setVariants}
          />
        </>
      ) : (
        <div className="editor-list">
          <div className="list-title">
            <strong>Deal components</strong>
            <button
              type="button"
              className="text-btn"
              onClick={() =>
                setComponents([
                  ...components,
                  { itemId: s.menu.find((m) => m.kind === 'item')?.id ?? '', quantity: 1 },
                ])
              }
            >
              + Add component
            </button>
          </div>
          {components.map((c, i) => (
            <div className="editor-row" key={i}>
              <select
                value={c.itemId}
                onChange={(e) =>
                  setComponents(
                    components.map((v, j) => (j === i ? { ...v, itemId: e.target.value } : v)),
                  )
                }
                required
                aria-label="Component item"
              >
                <option value="">Select item</option>
                {s.menu
                  .filter((m) => m.kind === 'item')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
              <input
                aria-label="Component quantity"
                type="number"
                min="1"
                step="1"
                value={c.quantity}
                onChange={(e) =>
                  setComponents(
                    components.map((v, j) =>
                      j === i ? { ...v, quantity: Number(e.target.value) } : v,
                    ),
                  )
                }
              />
              <button
                className="icon-btn"
                type="button"
                onClick={() => setComponents(components.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <OptionEditor title="Optional add-ons · extra charge" values={addons} onChange={setAddons} />
    </Modal>
  );
}
function OptionEditor({
  title,
  values,
  onChange,
}: {
  title: string;
  values: { id: string; name: string; price: number }[];
  onChange: (v: any[]) => void;
}) {
  return (
    <div className="editor-list">
      <div className="list-title">
        <strong>{title}</strong>
        <button
          type="button"
          className="text-btn"
          onClick={() => onChange([...values, { id: uuid(), name: '', price: 0 }])}
        >
          + Add option
        </button>
      </div>
      {values.map((v, i) => (
        <div className="editor-row" key={v.id}>
          <input
            aria-label="Option name"
            placeholder="Name"
            value={v.name}
            required
            onChange={(e) =>
              onChange(values.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
            }
          />
          <input
            aria-label="Option price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={(v.price / 100).toFixed(2)}
            required
            onBlur={(e) => {
              try {
                onChange(
                  values.map((x, j) => (j === i ? { ...x, price: minor(e.target.value) } : x)),
                );
              } catch {
                e.target.setCustomValidity('Enter a valid amount.');
              }
            }}
            onInput={(e) => e.currentTarget.setCustomValidity('')}
          />
          <button
            type="button"
            className="icon-btn"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
function PurchaseEditor({ onClose }: { onClose: () => void }) {
  const { s, act, today, money } = useApp();
  const [lines, setLines] = useState([
    { stockId: s.stock.find((st) => st.active)?.id ?? '', quantity: 1, cost: 0 },
  ]);
  return (
    <Modal
      title="Receive a purchase"
      subtitle="Enter quantities in each stock item’s base unit."
      onClose={onClose}
      submit="Post purchase & receive stock"
      onSubmit={async (f) => {
        await act('purchase.post', {
          supplierId: val(f, 'supplierId'),
          date: val(f, 'date'),
          reference: val(f, 'reference'),
          lines,
        });
      }}
    >
      <Field label="Supplier" name="supplierId">
        {s.suppliers.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </Field>
      <div className="form-grid">
        <Field label="Purchase date" name="date" type="date" value={today} />
        <Field label="Invoice / reference" name="reference" required={false} />
      </div>
      <div className="list-title">
        <strong>Stock received</strong>
        <button
          type="button"
          className="text-btn"
          onClick={() => setLines([...lines, { stockId: '', quantity: 1, cost: 0 }])}
        >
          + Add line
        </button>
      </div>
      {lines.map((l, i) => (
        <div className="purchase-line" key={i}>
          <select
            required
            value={l.stockId}
            aria-label="Stock item"
            onChange={(e) =>
              setLines(lines.map((v, j) => (j === i ? { ...v, stockId: e.target.value } : v)))
            }
          >
            <option value="">Select stock item</option>
            {s.stock
              .filter((v) => v.active)
              .map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.unit})
                </option>
              ))}
          </select>
          <div className="editor-row">
            <label>
              Quantity
              <input
                aria-label="Purchase quantity"
                type="number"
                min="1"
                step="1"
                required
                value={l.quantity}
                onChange={(e) =>
                  setLines(
                    lines.map((v, j) => (j === i ? { ...v, quantity: Number(e.target.value) } : v)),
                  )
                }
              />
            </label>
            <label>
              Cost per base unit
              <input
                aria-label="Unit cost"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue="0.00"
                onBlur={(e) => {
                  try {
                    const cost = minor(e.target.value);
                    setLines(lines.map((v, j) => (j === i ? { ...v, cost } : v)));
                  } catch {
                    e.target.setCustomValidity('Enter a valid amount.');
                  }
                }}
                onInput={(e) => e.currentTarget.setCustomValidity('')}
              />
            </label>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <div className="bill-total">
        <span>Purchase total</span>
        <strong>{money(lines.reduce((a, l) => a + l.cost * l.quantity, 0))}</strong>
      </div>
    </Modal>
  );
}
function SettingsEditor({ onClose }: { onClose: () => void }) {
  const { s, act, refresh } = useApp();
  const [logo, setLogo] = useState<File>();
  const cfg = s.settings[0];
  const [tables, setTables] = useState(cfg.tables),
    [registers, setRegisters] = useState(cfg.registers);
  return (
    <Modal
      title="Restaurant settings"
      onClose={onClose}
      onSubmit={async (f) => {
        await act('settings.save', {
          name: val(f, 'name'),
          currency: val(f, 'currency').toUpperCase(),
          timezone: val(f, 'timezone'),
          cutoff: val(f, 'cutoff'),
          address: val(f, 'address'),
          footer: val(f, 'footer'),
          tables,
          registers,
        });
        if (logo) {
          await uploadImage('logo', 'restaurant', logo);
          await refresh();
        }
      }}
    >
      <ImagePicker
        label="Restaurant logo"
        current={imageUrl('logo', 'restaurant', cfg.logoVersion)}
        file={logo}
        onChange={setLogo}
      />
      <Field label="Restaurant name" name="name" value={cfg.name} />
      <Field label="Address" name="address" value={cfg.address} required={false} />
      <div className="form-grid">
        <Field label="Currency" name="currency" value={cfg.currency} />
        <Field label="Timezone" name="timezone" value={cfg.timezone} />
      </div>
      <Field label="Business-day cutoff" name="cutoff" type="time" value={cfg.cutoff} />
      <Field label="Receipt footer" name="footer" value={cfg.footer} required={false} />
      <div className="editor-list">
        <div className="list-title">
          <strong>Tables</strong>
          <button
            type="button"
            className="text-btn"
            onClick={() =>
              setTables([...tables, { id: uuid(), name: `Table ${tables.length + 1}`, seats: 4 }])
            }
          >
            + Add table
          </button>
        </div>
        {tables.map((t, i) => (
          <div className="editor-row" key={t.id}>
            <input
              aria-label="Table name"
              required
              value={t.name}
              onChange={(e) =>
                setTables(tables.map((v, j) => (i === j ? { ...v, name: e.target.value } : v)))
              }
            />
            <input
              aria-label="Seats"
              type="number"
              min="1"
              max="100"
              required
              value={t.seats}
              onChange={(e) =>
                setTables(
                  tables.map((v, j) => (i === j ? { ...v, seats: Number(e.target.value) } : v)),
                )
              }
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTables(tables.filter((v) => v.id !== t.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="editor-list">
        <div className="list-title">
          <strong>Registers</strong>
          <button
            type="button"
            className="text-btn"
            onClick={() =>
              setRegisters([...registers, { id: uuid(), name: `Counter ${registers.length + 1}` }])
            }
          >
            + Add register
          </button>
        </div>
        {registers.map((r, i) => (
          <div className="editor-row" key={r.id}>
            <input
              required
              aria-label="Register name"
              value={r.name}
              onChange={(e) =>
                setRegisters(
                  registers.map((v, j) => (i === j ? { ...v, name: e.target.value } : v)),
                )
              }
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setRegisters(registers.filter((v) => v.id !== r.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
