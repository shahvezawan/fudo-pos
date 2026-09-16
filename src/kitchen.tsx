import { useState, useEffect } from 'react';
import { Clock, Check, Flame, ChefHat } from 'lucide-react';
import { useApp } from './api';
import { Badge, Empty, SectionHead } from './ui';
export function Kitchen() {
  const { s, act, notify, online, busy } = useApp();
  const [filter, setFilter] = useState('all'),
    [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);
  const rounds = s.orders
    .flatMap((o) => o.rounds.map((r, i) => ({ o, r, i })))
    .filter(
      ({ o, r }) =>
        (o.status === 'open' && r.status !== 'served' && r.lines.some((l) => !l.cancelled)) ||
        r.cancellations.some((c) => !c.acknowledged),
    )
    .sort((a, b) => a.r.createdAt.localeCompare(b.r.createdAt));
  const run = async (action: string, data: any) => {
    try {
      await act(action, data);
    } catch (e: any) {
      notify(e.message);
    }
  };
  return (
    <>
      <SectionHead
        eyebrow="BACK OF HOUSE"
        title="Kitchen display"
        description="Every ticket. Every detail. Right on time."
      >
        <Badge tone="green">
          <span className="status-dot" />
          Live order feed
        </Badge>
      </SectionHead>
      <div className="kitchen-summary">
        {[
          ['queued', 'New tickets'],
          ['preparing', 'In preparation'],
          ['ready', 'Ready to serve'],
        ].map(([status, label]) => (
          <button
            key={status}
            onClick={() => setFilter(filter === status ? 'all' : status)}
            className={`kitchen-stat ${filter === status ? 'selected' : ''}`}
          >
            <span>{label}</span>
            <strong>{rounds.filter((x) => x.r.status === status).length}</strong>
          </button>
        ))}
      </div>
      <div className="kitchen-grid">
        {rounds
          .filter(
            (x) =>
              filter === 'all' ||
              x.r.status === filter ||
              x.r.cancellations.some((c) => !c.acknowledged),
          )
          .map(({ o, r, i }) => {
            const minutes = Math.max(0, Math.floor((clock - Date.parse(r.createdAt)) / 60000));
            return (
              <article className={`ticket ticket-${r.status}`} key={r.id}>
                <div className="ticket-head">
                  <div>
                    <span className="eyebrow">
                      {o.type === 'dine-in' ? 'DINE-IN' : 'TAKEAWAY'} · #{o.number}
                    </span>
                    <h2>
                      {o.tableId
                        ? s.settings[0].tables.find((t) => t.id === o.tableId)?.name
                        : `Token #${o.number}`}
                    </h2>
                  </div>
                  <span className={`timer ${minutes > 15 ? 'late' : ''}`}>
                    <Clock size={14} />
                    {minutes} min
                  </span>
                </div>
                <div className="ticket-meta">
                  <Badge
                    tone={
                      r.status === 'ready'
                        ? 'green'
                        : r.status === 'preparing'
                          ? 'orange'
                          : 'neutral'
                    }
                  >
                    {r.status}
                  </Badge>
                  <span>
                    Round {i + 1}
                    {i > 0 ? ' · Additional items' : ''}
                  </span>
                </div>
                <div className="ticket-lines">
                  {r.lines.map((l) => (
                    <div key={l.id} className={l.cancelled ? 'cancelled' : ''}>
                      <span className="ticket-qty">{l.quantity}</span>
                      <div>
                        <strong>{l.name}</strong>
                        {l.components.map((c, j) => (
                          <small key={j}>
                            {c.quantity * l.quantity} × {c.name}
                          </small>
                        ))}
                        {l.addons.length > 0 && <small>+ {l.addons.join(', ')}</small>}
                        {l.note && <p className="prep-note">{l.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                {r.cancellations
                  .filter((c) => !c.acknowledged)
                  .map((c) => (
                    <div key={c.lineId} className="cancellation">
                      <strong>CANCELLED · {c.name}</strong>
                      <p>{c.reason}</p>
                    </div>
                  ))}
                <div className="ticket-actions">
                  {r.cancellations.some((c) => !c.acknowledged) && (
                    <button
                      className="btn danger wide"
                      disabled={!online || busy}
                      onClick={() =>
                        void run('kitchen.ack', {
                          orderId: o.id,
                          version: o.version,
                          roundId: r.id,
                        })
                      }
                    >
                      Acknowledge cancellation
                    </button>
                  )}
                  {r.lines.some((l) => !l.cancelled) &&
                    o.status === 'open' &&
                    r.status !== 'served' &&
                    (r.status === 'ready' ? (
                      <div className="ready-label">
                        <Check size={16} />
                        Waiting for collection
                      </div>
                    ) : (
                      <button
                        className={`btn wide ${r.status === 'queued' ? 'secondary' : 'primary'}`}
                        disabled={!online || busy}
                        onClick={() =>
                          void run('kitchen.status', {
                            orderId: o.id,
                            version: o.version,
                            roundId: r.id,
                            status: r.status === 'queued' ? 'preparing' : 'ready',
                          })
                        }
                      >
                        {r.status === 'queued' ? (
                          <>
                            <Flame size={16} />
                            Start preparing
                          </>
                        ) : (
                          <>
                            <Check size={16} />
                            Mark ready
                          </>
                        )}
                      </button>
                    ))}
                </div>
              </article>
            );
          })}
      </div>
      {!rounds.length && (
        <Empty
          title="The kitchen is all caught up"
          description="New orders will appear here automatically."
        />
      )}
    </>
  );
}
