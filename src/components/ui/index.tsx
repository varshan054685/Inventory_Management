import React, { useEffect, useState } from 'react';
import { X, Search, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function StatCard({
  label,
  value,
  icon,
  accent = 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300',
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      {icon && <div className={`rounded-lg p-2.5 ${accent}`}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</div>
        <div className="mt-0.5 text-2xl font-bold text-slate-800 dark:text-white truncate">{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const cls = { primary: 'btn-primary', secondary: 'btn-secondary', danger: 'btn-danger', ghost: 'btn-ghost' }[variant];
  return (
    <button className={`${cls} ${className}`} {...rest}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOutside = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnOutside?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={closeOnOutside ? onClose : undefined}
      />
      <div className={`relative w-full ${w} card p-6 shadow-2xl max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title text-lg">{title}</h2>
          <button onClick={onClose} className="btn-ghost p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmText = 'Confirm',
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex gap-3 items-start">
        {danger && <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />}
        <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
type ToastKind = 'success' | 'error' | 'info';
interface ToastMsg {
  id: number;
  kind: ToastKind;
  text: string;
}
let toastSubs: Array<(t: ToastMsg | null) => void> = [];
export function toast(text: string, kind: ToastKind = 'info') {
  toastSubs.forEach((fn) => fn({ id: Date.now() + Math.random(), kind, text }));
}
export function Toaster() {
  const [msgs, setMsgs] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const sub = (t: ToastMsg | null) => {
      if (!t) return;
      setMsgs((prev) => [...prev, t]);
      setTimeout(() => setMsgs((prev) => prev.filter((m) => m.id !== t.id)), 3200);
    };
    toastSubs.push(sub);
    return () => {
      toastSubs = toastSubs.filter((s) => s !== sub);
    };
  }, []);
  const colors = {
    success: 'bg-emerald-600',
    error: 'bg-red-600',
    info: 'bg-slate-700',
  };
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {msgs.map((m) => (
        <div
          key={m.id}
          className={`${colors[m.kind]} text-white text-sm px-4 py-2.5 rounded-lg shadow-lg max-w-xs`}
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------
export function Field({
  label,
  required,
  children,
  error,
  className = '',
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  error?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    active: { cls: 'badge-success', label: 'Active' },
    inactive: { cls: 'badge-neutral', label: 'Inactive' },
    locked: { cls: 'badge-neutral', label: 'Locked' },
    draft: { cls: 'badge-warning', label: 'Draft' },
    unlocked: { cls: 'badge-warning', label: 'Unlocked' },
  };
  const s = map[status] ?? { cls: 'badge-neutral', label: status };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

// ---------------------------------------------------------------------------
// Search input
// ---------------------------------------------------------------------------
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
      <input
        className="input pl-9"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export function EmptyState({ message = 'No records found' }: { message?: string }) {
  return (
    <div className="text-center py-12 text-slate-400 text-sm">{message}</div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
      <span>
        Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          className="btn-ghost p-1 rounded disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span>
          Page {page} / {pages}
        </span>
        <button
          className="btn-ghost p-1 rounded disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600 ${className}`} />
  );
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------
export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-semibold ${className}`}>{children}</th>;
}
export function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 border-t border-slate-100 dark:border-slate-700/60 ${className}`}>{children}</td>;
}