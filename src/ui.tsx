import { useState, type ReactNode, type FormEvent } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import { useApp } from './api';
export const minor = (value: FormDataEntryValue | null) => {
  const str = String(value ?? '0').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str))
    throw new Error('Enter a positive amount with up to two decimal places.');
  const [whole, fraction = ''] = str.split('.');
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(n)) throw new Error('Amount is too large.');
  return n;
};
export const val = (f: FormData, key: string) => String(f.get(key) ?? '');
export const num = (f: FormData, key: string) => Number(f.get(key));
export function Field({
  label,
  name,
  type = 'text',
  value,
  required = true,
  children,
  step,
  min,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  value?: any;
  required?: boolean;
  children?: ReactNode;
  step?: string;
  min?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children ? (
        <select name={name} defaultValue={value} required={required}>
          {children}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={value}
          required={required}
          step={step}
          min={min}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}
export function MoneyField({
  label,
  name,
  value = 0,
}: {
  label: string;
  name: string;
  value?: number;
}) {
  return (
    <Field
      label={label}
      name={name}
      type="number"
      min="0"
      step="0.01"
      value={(value / 100).toFixed(2)}
    />
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  onSubmit,
  submit = 'Save changes',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit?: (f: FormData) => Promise<void>;
  submit?: string;
}) {
  const [error, setError] = useState(''),
    [working, setWorking] = useState(false);
  const { online } = useApp();
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!onSubmit) return;
    setWorking(true);
    setError('');
    try {
      await onSubmit(new FormData(e.currentTarget));
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !working) onClose();
      }}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <span className="eyebrow">FUDO WORKSPACE</span>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={working}
          >
            <X size={20} />
          </button>
        </header>
        <form onSubmit={send}>
          <div className="modal-body">
            {children}
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
          </div>
          {onSubmit && (
            <footer>
              <button type="button" className="btn secondary" onClick={onClose} disabled={working}>
                Cancel
              </button>
              <button className="btn primary" disabled={working || !online}>
                {working ? 'Saving…' : submit}
                <ArrowUpRight size={17} />
              </button>
            </footer>
          )}
        </form>
      </section>
    </div>
  );
}
export function ApprovalFields() {
  const { user } = useApp();
  return (
    <>
      <Field label="Reason" name="reason" />
      {!['owner', 'manager'].includes(user.role) && (
        <div className="approval">
          <p>Manager authorization</p>
          <Field label="Manager username" name="approver" />
          <Field label="Manager password" name="approvalPassword" type="password" />
        </div>
      )}
    </>
  );
}
export function approval(f: FormData) {
  return f.get('approver')
    ? { username: val(f, 'approver'), password: val(f, 'approvalPassword') }
    : undefined;
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty">
      <div className="empty-mark">✧</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function SectionHead({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="head-actions">{children}</div>
    </div>
  );
}
export function SessionSelect({ required = false }: { required?: boolean }) {
  const { s, user, money } = useApp();
  return (
    <Field
      label={required ? 'Cash drawer' : 'Pay from drawer (optional)'}
      name="sessionId"
      required={required}
    >
      <option value="">{required ? 'Select an open shift' : 'Outside the cash drawer'}</option>
      {s.cashSessions
        .filter(
          (c) =>
            !c.closedAt && (c.cashierId === user.id || ['owner', 'manager'].includes(user.role)),
        )
        .map((c) => (
          <option key={c.id} value={c.id}>
            {s.settings[0].registers.find((r) => r.id === c.registerId)?.name} ·{' '}
            {s.users.find((u) => u.id === c.cashierId)?.name} · opening {money(c.opening)}
          </option>
        ))}
    </Field>
  );
}
