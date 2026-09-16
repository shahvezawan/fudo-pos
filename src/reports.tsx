import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Download,
  ArrowRight,
  UtensilsCrossed,
  ChefHat,
  Clock,
  ShoppingBag,
  Printer,
  RotateCcw,
} from 'lucide-react';
import { request, useApp } from './api';
import {
  SectionHead,
  Badge,
  Empty,
  Modal,
  ApprovalFields,
  approval,
  val,
  SessionSelect,
} from './ui';
import { Stat } from './management';
import { FoodIcon, Receipt } from './pos';
import { expectedCash, total, type Order } from '../shared/types';
function useReport(from: string, to: string) {
  const { s } = useApp();
  const [data, setData] = useState<any>(),
    [error, setError] = useState('');
  useEffect(() => {
    let stale = false;
    void request(`/reports?from=${from}&to=${to}`)
      .then((d) => {
        if (!stale) {
          setData(d);
          setError('');
        }
      })
      .catch((e) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [from, to, s]);
  return { data, error };
}
export function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { s, user, money, today } = useApp();
  const { data: r, error } = useReport(today, today);
  const cfg = s.settings[0];
  const active = s.orders.filter((o) => o.status === 'open');
  const pending = active
    .flatMap((o) => o.rounds)
    .filter((r) => r.status === 'queued' || r.status === 'preparing');
  return (
    <>
      <SectionHead
        eyebrow="YOUR DAILY SNAPSHOT"
        title={`Welcome back, ${user.name.split(' ')[0]}.`}
        description="Here’s what’s happening at your restaurant today."
      >
        <button className="btn primary" onClick={() => onNavigate('pos')}>
          <UtensilsCrossed size={17} />
          Open point of sale
          <ArrowUpRight size={17} />
        </button>
      </SectionHead>
      <div className="overview-hero">
        <div>
          <Badge tone="light">
            <span className="status-dot" />
            SERVICE IS LIVE
          </Badge>
          <h2>
            Good food.
            <br />
            Great flow.
          </h2>
          <p>
            A clear view of your floor, your kitchen,
            <br />
            and everything in between.
          </p>
          <button onClick={() => onNavigate('kitchen')}>
            See what’s cooking <ArrowRight size={17} />
          </button>
        </div>
        <div className="hero-illustration" aria-hidden="true">
          <div className="hero-ring ring-one" />
          <div className="hero-ring ring-two" />
          <div className="hero-plate">
            <span className="leaf leaf-one" />
            <span className="leaf leaf-two" />
            <span className="leaf leaf-three" />
            <span className="tomato tomato-one" />
            <span className="tomato tomato-two" />
            <div className="hero-food">
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="hero-note">
            <span>✦</span> A little more hospitality.
          </div>
          <div className="hero-ticket">
            <span className="status-dot" />
            KITCHEN CONNECTED<strong>{pending.length} tickets in the works</strong>
          </div>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="stats-grid">
        <Stat
          label="Today’s sales"
          value={money(r?.sales ?? 0)}
          detail={`${r?.orderCount ?? 0} paid orders today`}
        />
        <Stat
          label="Average order"
          value={money(r?.average ?? 0)}
          detail="Per paid order, after discounts"
        />
        <Stat
          label="Tables occupied"
          value={`${active.filter((o) => o.tableId).length} / ${cfg.tables.length}`}
          detail="A live view of your service floor"
        />
        <Stat
          label="Cash in drawers"
          value={money(
            s.cashSessions.filter((c) => !c.closedAt).reduce((a, c) => a + expectedCash(s, c), 0),
          )}
          detail={`${s.cashSessions.filter((c) => !c.closedAt).length} shifts currently open`}
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel sales-panel">
          <div className="panel-heading">
            <div>
              <h2>Sales throughout the day</h2>
              <p>A little perspective on your busiest hours.</p>
            </div>
            <Badge>Today</Badge>
          </div>
          <div className="chart-total">
            {money(r?.sales ?? 0)}
            <span>
              <i />
              Sales collected
            </span>
          </div>
          <SalesChart values={r?.hourly ?? []} />
        </section>
        <section className="panel popular-panel">
          <div className="panel-heading">
            <div>
              <h2>Guest favorites</h2>
              <p>Today’s most-loved menu items.</p>
            </div>
            <button
              className="icon-btn"
              title="View item sales"
              onClick={() => onNavigate('reports')}
            >
              <ArrowUpRight size={19} />
            </button>
          </div>
          {r?.items.slice(0, 4).map((item: any, index: number) => (
            <div className="popular-item" key={item.name}>
              <span className="popular-rank">0{index + 1}</span>
              <span className={`item-icon color-${index}`}>
                <FoodIcon
                  name={s.menu.find((m) => item.name.startsWith(m.name))?.icon ?? 'plate'}
                  size={24}
                />
              </span>
              <div>
                <strong>{item.name}</strong>
                <small>{item.quantity} sold today</small>
              </div>
              <strong>{money(item.net)}</strong>
            </div>
          ))}
          {!r?.items.length && (
            <Empty
              title="Your next bestseller?"
              description="Favorites appear as orders are paid."
            />
          )}
          <button className="panel-link" onClick={() => onNavigate('reports')}>
            Explore sales report
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <section className="panel table-wrap">
        <div className="panel-heading">
          <div>
            <h2>On the floor</h2>
            <p>Open orders that keep your service moving.</p>
          </div>
          <button className="text-btn" onClick={() => onNavigate('pos')}>
            Go to point of sale
            <ArrowUpRight size={15} />
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Table / type</th>
              <th>Placed at</th>
              <th>Kitchen</th>
              <th>Payment</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {active.slice(0, 6).map((o) => (
              <tr key={o.id}>
                <td>
                  <strong>#{String(o.number).padStart(4, '0')}</strong>
                </td>
                <td>{cfg.tables.find((t) => t.id === o.tableId)?.name ?? 'Takeaway'}</td>
                <td>
                  {new Date(o.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td>
                  <Badge tone={o.rounds.some((r) => r.status === 'ready') ? 'green' : 'orange'}>
                    {o.rounds.some((r) => r.status === 'ready')
                      ? 'Ready'
                      : o.rounds.some((r) => r.status === 'preparing')
                        ? 'Preparing'
                        : 'Queued'}
                  </Badge>
                </td>
                <td>
                  <Badge tone={o.paymentStatus === 'paid' ? 'green' : 'neutral'}>
                    {o.paymentStatus}
                  </Badge>
                </td>
                <td className="strong">{money(total(o))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!active.length && (
          <Empty
            title="Your floor is clear"
            description="Open an order to begin the next service."
          />
        )}
      </section>
      <div className="workspace-footer">
        <span>Thoughtfully made for your daily service.</span>
        <span>FUDO RESTAURANT WORKSPACE</span>
      </div>
    </>
  );
}
function SalesChart({ values }: { values: { hour: number; amount: number }[] }) {
  const max = Math.max(1, ...values.map((v) => v.amount));
  return (
    <div className="sales-chart" role="img" aria-label="Hourly collected sales bar chart">
      <div className="chart-grid">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="chart-bars">
        {Array.from({ length: 24 }, (_, i) => {
          const v = values.find((v) => v.hour === i);
          return (
            <div className="chart-column" key={i}>
              <div
                className={`chart-bar ${i % 3 === 0 ? 'accent' : ''}`}
                style={{ height: `${Math.max(2, ((v?.amount ?? 0) / max) * 100)}%` }}
                title={`${String(i).padStart(2, '0')}:00 — ${((v?.amount ?? 0) / 100).toFixed(2)}`}
              />
              {i % 4 === 0 && <small>{String(i).padStart(2, '0')}:00</small>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
export function Reports() {
  const { s, today, money, act, notify } = useApp();
  const [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [receipt, setReceipt] = useState<Order>(),
    [refund, setRefund] = useState<Order>();
  const { data: r, error } = useReport(from, to);
  return (
    <>
      <SectionHead
        eyebrow="THE BIGGER PICTURE"
        title="Sales & reports"
        description="Useful numbers. Clear decisions."
      >
        <a className="btn primary" href={`/api/reports?from=${from}&to=${to}&format=csv`}>
          <Download size={17} />
          Export report
        </a>
      </SectionHead>
      <div className="report-filters">
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <span>→</span>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Badge>Business day starts {s.settings[0].cutoff}</Badge>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="stats-grid">
        <Stat
          label="Sales collected"
          value={money(r?.sales ?? 0)}
          detail={`${r?.orderCount ?? 0} paid orders`}
        />
        <Stat
          label="Refunds"
          value={money(r?.refunded ?? 0)}
          detail="Refunded during selected period"
        />
        <Stat label="Net collected" value={money(r?.net ?? 0)} detail="Sales less refunds" />
        <Stat
          label="Discounts"
          value={money(r?.discounts ?? 0)}
          detail="Approved discounts on paid orders"
        />
      </div>
      <div className="panel table-wrap">
        <div className="panel-heading">
          <div>
            <h2>Item-wise sales</h2>
            <p>Includes individual items and items sold inside deals. Values are before refunds.</p>
          </div>
          <a
            className="btn small secondary"
            href={`/api/reports?from=${from}&to=${to}&format=csv&view=items`}
          >
            Export items
          </a>
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Direct qty</th>
              <th>Deal qty</th>
              <th>Quantity</th>
              <th>Gross</th>
              <th>Discount</th>
              <th>Net sales</th>
            </tr>
          </thead>
          <tbody>
            {r?.items.map((i: any) => (
              <tr key={i.name}>
                <td>
                  <strong>{i.name}</strong>
                </td>
                <td>{i.directQuantity}</td>
                <td>{i.dealQuantity}</td>
                <td>{i.quantity}</td>
                <td>{money(i.gross)}</td>
                <td>{money(i.discount)}</td>
                <td className="strong">{money(i.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!r?.items.length && (
          <Empty
            title="No sales in this period"
            description="Try a different date range or complete your first order."
          />
        )}
        <p className="table-note">
          Deal revenue is allocated using component prices saved with the order. Older orders
          without saved prices use component quantities. Totals are not added to the separate deals
          report.
        </p>
      </div>
      <div className="dashboard-grid">
        <div className="panel table-wrap">
          <div className="panel-heading">
            <h2>Payment breakdown</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th>Sales</th>
                <th>Refunds</th>
              </tr>
            </thead>
            <tbody>
              {r?.payments.map((p: any) => (
                <tr key={p.method}>
                  <td className="capitalize">{p.method}</td>
                  <td>{money(p.sales)}</td>
                  <td>{money(p.refunds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel table-wrap">
          <div className="panel-heading">
            <h2>Deals report</h2>
            <a
              className="btn small secondary"
              href={`/api/reports?from=${from}&to=${to}&format=csv&view=deals`}
            >
              Export deals
            </a>
          </div>
          <table>
            <thead>
              <tr>
                <th>Deal</th>
                <th>Quantity</th>
                <th>Gross</th>
                <th>Discount</th>
                <th>Net sales</th>
              </tr>
            </thead>
            <tbody>
              {r?.deals.map((c: any) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>{c.quantity}</td>
                  <td>{money(c.gross)}</td>
                  <td>{money(c.discount)}</td>
                  <td>{money(c.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="table-note">
            Bundle sales only, before refunds. This is a separate view of revenue already included
            in item-wise sales.
          </p>
        </div>
      </div>
      <div className="stats-grid three">
        <Stat
          label="Purchases"
          value={money(r?.purchaseTotal ?? 0)}
          detail="Non-reversed entries by purchase date"
        />
        <Stat
          label="Expenses"
          value={money(r?.expenseTotal ?? 0)}
          detail="Non-reversed entries by expense date"
        />
        <Stat
          label="Supplier balances"
          value={money(r?.suppliers.reduce((a: number, v: any) => a + v.balance, 0) ?? 0)}
          detail="Current outstanding, across all dates"
        />
      </div>
      <div className="panel table-wrap">
        <div className="panel-heading">
          <h2>Cash reconciliation</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Shift</th>
              <th>Status</th>
              <th>Opening</th>
              <th>Expected</th>
              <th>Counted</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            {r?.shifts.map((c: any) => (
              <tr key={c.id}>
                <td>{new Date(c.openedAt).toLocaleString()}</td>
                <td>
                  <Badge>{c.closedAt ? 'Closed' : 'Open'}</Badge>
                </td>
                <td>{money(c.opening)}</td>
                <td>{money(c.expected ?? expectedCash(s, c))}</td>
                <td>{c.counted === undefined ? '—' : money(c.counted)}</td>
                <td>{c.variance === undefined ? '—' : money(c.variance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel table-wrap">
        <div className="panel-heading">
          <h2>Refund history</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Refunded at</th>
              <th>Amount</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {r?.refunds.map((o: any) => (
              <tr key={o.number}>
                <td>#{o.number}</td>
                <td>{new Date(o.at).toLocaleString()}</td>
                <td>{money(o.amount)}</td>
                <td>{o.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel table-wrap">
        <div className="panel-heading">
          <h2>Paid order history</h2>
          <Badge>All dates · Latest 100</Badge>
        </div>
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Paid at</th>
              <th>Amount</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {s.orders
              .filter((o) => o.payment)
              .sort((a, b) => b.payment!.at.localeCompare(a.payment!.at))
              .slice(0, 100)
              .map((o) => (
                <tr key={o.id}>
                  <td>#{o.number}</td>
                  <td>{new Date(o.payment!.at).toLocaleString()}</td>
                  <td>{money(o.payment!.amount)}</td>
                  <td>
                    <Badge tone={o.paymentStatus === 'refunded' ? 'red' : 'green'}>
                      {o.paymentStatus}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="text-btn" onClick={() => setReceipt(o)}>
                        <Printer size={14} />
                        Receipt
                      </button>
                      {o.paymentStatus === 'paid' && (
                        <button className="text-btn" onClick={() => setRefund(o)}>
                          <RotateCcw size={14} />
                          Refund
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {receipt && <Receipt order={receipt} onClose={() => setReceipt(undefined)} />}
      {refund && (
        <Modal
          title={`Refund order #${refund.number}`}
          subtitle={`Full refund: ${money(refund.payment!.amount)}`}
          onClose={() => setRefund(undefined)}
          submit="Confirm full refund"
          onSubmit={async (f) => {
            await act(
              'order.refund',
              {
                orderId: refund.id,
                version: refund.version,
                reason: val(f, 'reason'),
                sessionId: val(f, 'sessionId') || undefined,
              },
              approval(f),
            );
            notify('Refund recorded.');
          }}
        >
          <ApprovalFields />
          {refund.payment?.method === 'cash' && <SessionSelect required />}
          <p className="muted">
            Confirm the money has been returned. Stock is not automatically restored.
          </p>
        </Modal>
      )}
    </>
  );
}
