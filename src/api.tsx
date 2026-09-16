import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { type State, type User, emptyState } from '../shared/types';
import { uuid } from './id';
export async function request(path: string, body?: unknown) {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error('Connection lost. Check the local server and network.');
  }
  const d = await res.json();
  if (!res.ok) throw Object.assign(new Error(d.error || 'Request failed.'), { status: res.status });
  return d;
}
type Approval = { username: string; password: string };
type Context = {
  s: State;
  user: User;
  online: boolean;
  busy: boolean;
  today: string;
  refresh: () => Promise<void>;
  act: (action: string, data: unknown, approval?: Approval) => Promise<any>;
  notify: (text: string) => void;
  money: (n: number) => string;
  logout: () => void;
};
const C = createContext<Context>(null!);
export const useApp = () => useContext(C);
export function Provider({
  children,
  initial,
  onLogout,
}: {
  children: ReactNode;
  initial: any;
  onLogout: () => void;
}) {
  const [snapshot, setSnapshot] = useState(initial),
    [online, setOnline] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const pending = useRef<any>(null),
    loading = useRef<Promise<void> | null>(null);
  const refresh = async () => {
    if (loading.current) return loading.current;
    loading.current = (async () => {
      try {
        setSnapshot(await request('/state'));
        setOnline(true);
      } catch (e: any) {
        setOnline(false);
        if (e.status === 401) onLogout();
        throw e;
      } finally {
        loading.current = null;
      }
    })();
    return loading.current;
  };
  useEffect(() => {
    const events = new EventSource('/api/events');
    events.addEventListener(
      'connected',
      () =>
        void refresh()
          .then(() => setOnline(true))
          .catch(() => {}),
    );
    events.addEventListener('changed', () => void refresh().catch(() => {}));
    events.onerror = () => setOnline(false);
    const interval = setInterval(() => void refresh().catch(() => {}), 20000);
    return () => {
      events.close();
      clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 7000);
      return () => clearTimeout(timer);
    }
  }, [message]);
  const send = async (payload: any) => {
    setBusy(true);
    try {
      const r = await request('/commands', payload);
      pending.current = null;
      await refresh();
      return r;
    } catch (e: any) {
      if (!e.status) {
        pending.current = payload;
        setOnline(false);
      } else pending.current = null;
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const act = async (action: string, data: unknown, approval?: Approval) => {
    if (!online)
      throw Object.assign(new Error('Reconnect to the server before making changes.'), {
        status: 503,
      });
    if (pending.current)
      throw Object.assign(
        new Error('Resolve the pending submission before starting another action.'),
        { status: 409 },
      );
    return send({ key: uuid(), action, data, approval });
  };
  const s: State = snapshot.state ?? emptyState();
  const money = (n: number) =>
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: s.settings[0]?.currency || 'USD',
      minimumFractionDigits: 2,
    }).format(n / 100);
  return (
    <C.Provider
      value={{
        s,
        user: snapshot.user,
        online,
        busy,
        today: snapshot.businessDate,
        refresh,
        act,
        notify: setMessage,
        money,
        logout: () => void request('/logout', {}).then(onLogout),
      }}
    >
      {!online && (
        <div className="connection-banner">
          Connection interrupted · Changes are paused until the server reconnects.
        </div>
      )}
      {pending.current && (
        <div className="connection-banner">
          Submission outcome is unknown. Recheck safely before continuing.{' '}
          <button
            onClick={() =>
              void send(pending.current)
                .then(() => {
                  setOnline(true);
                  setMessage('Submission confirmed.');
                })
                .catch((e) => setMessage(e.message))
            }
          >
            Check submission
          </button>
        </div>
      )}
      {children}
      {message && (
        <div role="status" className="toast">
          {message}
          <button onClick={() => setMessage('')}>×</button>
        </div>
      )}
    </C.Provider>
  );
}
