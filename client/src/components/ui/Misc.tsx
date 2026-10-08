import React from 'react';
import { Loader2 } from 'lucide-react';
import type { RequestStatus, JobStatus } from '../../types';

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} size={20} />;
}

export function PageLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <Spinner className="text-brand-500" />
      <p className="text-sm">{label ?? 'Loading…'}</p>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  waiting: 'bg-amber-100 text-amber-800 ring-amber-200',
  processing: 'bg-sky-100 text-sky-800 ring-sky-200',
  printing: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  completed: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 ring-rose-200',
  cancelled: 'bg-slate-200 text-slate-700 ring-slate-300',
  queued: 'bg-slate-100 text-slate-700 ring-slate-300',
  assigned: 'bg-violet-100 text-violet-800 ring-violet-200',
  paused: 'bg-orange-100 text-orange-800 ring-orange-200',
  failed: 'bg-rose-100 text-rose-800 ring-rose-200',
  active: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  offline: 'bg-slate-200 text-slate-600 ring-slate-300',
  online: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  unknown: 'bg-slate-100 text-slate-600 ring-slate-300',
};

export function StatusBadge({ status, label }: { status: RequestStatus | JobStatus | string; label?: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 ring-slate-300';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ${style}`}>
      {label ?? status}
    </span>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      {icon && <div className="text-slate-300">{icon}</div>}
      <p className="font-semibold text-slate-600">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-400">{hint}</p>}
    </div>
  );
}
