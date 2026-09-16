import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard,
  UtensilsCrossed,
  ChefHat,
  Wallet,
  Package,
  ShoppingBag,
  ReceiptText,
  ChartNoAxesCombined,
  Settings,
  Users,
  LogOut,
  PanelLeftClose,
  Plus,
  ArrowUpRight,
  Search,
  Bell,
  Command,
} from 'lucide-react';
import { Provider, request, useApp } from './api';
import { Field } from './ui';
import { POS } from './pos';
import { Kitchen } from './kitchen';
import { Dashboard, Reports } from './reports';
import { Management } from './management';
import './styles.css';
import './responsive.css';
import { imageUrl } from './images';

function Login({ onLogin }: { onLogin: (d: any) => void }) {
  const [setup, setSetup] = useState<boolean | null>(null),
    [demo, setDemo] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void request('/setup')
      .then((d) => {
        setSetup(d.required);
        setDemo(d.development);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-icon">
            <UtensilsCrossed />
          </span>
          fudo<span className="brand-dot">.</span>
        </div>
        <div>
          <span className="eyebrow">GOOD FOOD. GREAT SERVICE.</span>
          <h1>
            A little less busywork.
            <br />A lot more hospitality.
          </h1>
          <p>
            Your tables, kitchen, and counter.
            <br />
            Working together, beautifully.
          </p>
          <div className="auth-art">
            <div className="plate">
              <span>✳</span>
            </div>
            <div className="art-caption">
              Made for the daily rush.<span>Restaurant workspace / 01</span>
            </div>
          </div>
        </div>
        <small>LOCAL BY DESIGN · CONNECTED BY SERVICE</small>
      </section>
      <section className="auth-form">
        <div className="auth-form-inner">
          <span className="eyebrow">YOUR RESTAURANT, IN SYNC</span>
          <h2>{setup ? 'Let’s set your table.' : 'Welcome back.'}</h2>
          <p>
            {setup
              ? 'Create your restaurant and first owner account.'
              : 'Sign in and make it a great service.'}
          </p>
          {demo && <div className="demo-note">Development workspace · sample data only</div>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const f = new FormData(e.currentTarget);
              const v = (key: string) => String(f.get(key) ?? '');
              try {
                if (setup)
                  await request('/setup', {
                    token: v('token'),
                    name: v('name'),
                    username: v('username'),
                    password: v('password'),
                    restaurant: v('restaurant'),
                    currency: v('currency'),
                    timezone: v('timezone'),
                  });
                await request('/login', { username: v('username'), password: v('password') });
                onLogin(await request('/state'));
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {setup && (
              <>
                <Field name="token" label="Installation setup token" type="password" />
                <Field name="restaurant" label="Restaurant name" />
                <Field name="name" label="Your name" />
                <div className="form-grid">
                  <Field name="currency" label="Currency (ISO code)" placeholder="PKR" />
                  <Field
                    name="timezone"
                    label="Timezone"
                    value={Intl.DateTimeFormat().resolvedOptions().timeZone}
                  />
                </div>
              </>
            )}
            <Field name="username" label="Username" placeholder="Your username" />
            <Field
              name="password"
              label={setup ? 'Password (at least 10 characters)' : 'Password'}
              type="password"
            />
            {error && <div className="error">{error}</div>}
            <button className="btn primary wide" disabled={busy || setup === null}>
              {busy ? 'Please wait…' : setup ? 'Create restaurant' : 'Sign in to workspace'}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <small className="auth-foot">
            <span className="status-dot" />
            Secure session · On your local network
          </small>
        </div>
      </section>
    </main>
  );
}
const navigation = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, roles: ['owner', 'manager'] },
  {
    id: 'pos',
    label: 'Point of sale',
    icon: UtensilsCrossed,
    roles: ['owner', 'manager', 'cashier', 'waiter'],
  },
  {
    id: 'kitchen',
    label: 'Kitchen display',
    icon: ChefHat,
    roles: ['owner', 'manager', 'kitchen'],
  },
  { id: 'cash', label: 'Cash drawer', icon: Wallet, roles: ['owner', 'manager', 'cashier'] },
  { id: 'menu', label: 'Menu & deals', icon: ShoppingBag, roles: ['owner', 'manager'] },
  { id: 'inventory', label: 'Inventory', icon: Package, roles: ['owner', 'manager'] },
  { id: 'purchases', label: 'Purchases', icon: ShoppingBag, roles: ['owner', 'manager'] },
  { id: 'expenses', label: 'Expenses', icon: ReceiptText, roles: ['owner', 'manager'] },
  { id: 'reports', label: 'Reports', icon: ChartNoAxesCombined, roles: ['owner', 'manager'] },
  { id: 'users', label: 'Team & access', icon: Users, roles: ['owner'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ['owner'] },
];
function Workspace() {
  const { s, user, online, logout } = useApp();
  const [page, setPage] = useState(
      user.role === 'kitchen'
        ? 'kitchen'
        : user.role === 'owner' || user.role === 'manager'
          ? 'dashboard'
          : 'pos',
    ),
    [collapsed, setCollapsed] = useState(false);
  const cfg = s.settings[0];
  return (
    <div className={`workspace ${collapsed ? 'compact' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <UtensilsCrossed size={22} />
          </span>
          <span className="brand-word">
            fudo<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="location-card">
          <span className="location-avatar">
            {cfg.logoVersion ? (
              <img
                className="thumbnail"
                src={imageUrl('logo', 'restaurant', cfg.logoVersion)}
                alt={`${cfg.name} logo`}
              />
            ) : (
              cfg.name.slice(0, 1)
            )}
          </span>
          <div>
            <strong>{cfg.name}</strong>
            <small>Main restaurant</small>
          </div>
          <span>⌄</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation
            .filter((n) => n.roles.includes(user.role))
            .map((n) => (
              <button
                title={n.label}
                key={n.id}
                className={page === n.id ? 'active' : ''}
                onClick={() => setPage(n.id)}
              >
                <n.icon size={20} />
                <span>{n.label}</span>
                {n.id === 'kitchen' && s.orders.some((o) => o.status === 'open') && <i />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="service-card">
            <span className="status-dot" />
            <div>
              <strong>{online ? 'All systems connected' : 'Connection interrupted'}</strong>
              <small>Local restaurant network</small>
            </div>
          </div>
          <button className="profile" onClick={logout} title="Sign out">
            <span className="avatar">
              {user.name
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="workspace-content">
        <header className="topbar">
          <div>
            <button
              className="icon-btn"
              onClick={() => setCollapsed(!collapsed)}
              aria-label="Toggle sidebar"
            >
              <PanelLeftClose size={20} />
            </button>
            <span className="breadcrumb">
              Workspace <span>/</span>{' '}
              <strong>{navigation.find((n) => n.id === page)?.label}</strong>
            </span>
          </div>
          <div>
            <span className="top-date">
              {new Intl.DateTimeFormat('en', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                timeZone: cfg.timezone,
              }).format(new Date())}
            </span>
            <span className={`live-pill ${online ? '' : 'offline'}`}>
              <span className="status-dot" />
              {online ? 'Live service' : 'Offline'}
            </span>
            <button className="icon-btn mobile-signout" onClick={logout} aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className={`main-content page-${page}`}>
          {page === 'dashboard' ? (
            <Dashboard onNavigate={setPage} />
          ) : page === 'pos' ? (
            <POS />
          ) : page === 'kitchen' ? (
            <Kitchen />
          ) : page === 'reports' ? (
            <Reports />
          ) : (
            <Management page={page} />
          )}
        </main>
      </div>
    </div>
  );
}
function Root() {
  const [initial, setInitial] = useState<any>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    void request('/state')
      .then(setInitial)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="loading">Opening your workspace…</div>;
  return initial ? (
    <Provider initial={initial} onLogout={() => setInitial(null)}>
      <Workspace />
    </Provider>
  ) : (
    <Login onLogin={setInitial} />
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
