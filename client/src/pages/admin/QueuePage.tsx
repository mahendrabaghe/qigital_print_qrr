import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, Ban, PauseCircle, PlayCircle, Printer, RefreshCw, Clock,
} from 'lucide-react';
import { http, apiError } from '../../services/api';
import { useLiveEvents } from '../../services/live';
import { useToast } from '../../components/ui/Toast';
import { PageLoader, Spinner, StatusBadge, EmptyState } from '../../components/ui/Misc';
import type { PrintJob } from '../../types';

const ACTIVE_ACTIONS: Array<{ action: string; icon: typeof PauseCircle; title: string }> = [
  { action: 'pause', icon: PauseCircle, title: 'Pause job' },
  { action: 'resume', icon: PlayCircle, title: 'Resume job' },
  { action: 'retry', icon: RefreshCw, title: 'Retry job' },
  { action: 'cancel', icon: Ban, title: 'Cancel job' },
];

export default function QueuePage() {
  const { toast } = useToast();
  const [data, setData] = useState<{ active: PrintJob[]; recent: PrintJob[] } | null>(null);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    const res = await http.get('/api/jobs');
    setData({ active: res.data.active as PrintJob[], recent: res.data.recent as PrintJob[] });
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useLiveEvents((event) => {
    if (['job:updated', 'queue:updated', 'print:started', 'print:completed', 'print:failed'].includes(event)) {
      load().catch(() => undefined);
    }
  }, 'admin');

  async function act(job: PrintJob, action: string, body?: unknown) {
    setBusyId(job.id);
    try {
      await http.post(`/api/jobs/${job.id}/${action}`, body);
      await load();
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusyId('');
    }
  }

  async function browserPrint(job: PrintJob) {
    try {
      const res = await http.get(`/api/jobs/${job.id}/file`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast(apiError(err).message, 'error');
    }
  }

  if (!data) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">Print queue</h1>
        <p className="text-sm text-slate-400">
          Live queue for your printers. The print agent pulls jobs in order; reorder or pause them here.
        </p>
      </div>

      {/* ---------- active ---------- */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Active ({data.active.length})</h2>
        {data.active.length === 0 ? (
          <div className="card">
            <EmptyState icon={<Printer className="h-10 w-10" />} title="Queue is empty" hint="Jobs appear here the moment you send a request to print." />
          </div>
        ) : (
          <div className="space-y-2">
            {data.active.map((job, i) => (
              <div key={job.id} className="card flex flex-wrap items-center gap-3 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-extrabold text-brand-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-slate-700">{job.fileName}</span>
                    <StatusBadge status={job.status} />
                    {job.demo && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-700">demo</span>}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    <Link to={`/admin/requests/${job.requestId}`} className="font-mono hover:text-slate-600 hover:underline">{job.code}</Link>
                    {' · '}{job.printerName} · {job.sheets} sheet{job.sheets !== 1 ? 's' : ''} · {job.settings.copies} cop{job.settings.copies !== 1 ? 'ies' : ''}
                    {job.error ? ` · ${job.error}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" className="btn-icon" title="Move up" disabled={busyId === job.id || i === 0} onClick={() => act(job, 'move', { direction: 'up' })}>
                    <ArrowUp className="h-[18px] w-[18px]" />
                  </button>
                  <button type="button" className="btn-icon" title="Move down" disabled={busyId === job.id || i === data.active.length - 1} onClick={() => act(job, 'move', { direction: 'down' })}>
                    <ArrowDown className="h-[18px] w-[18px]" />
                  </button>
                  {ACTIVE_ACTIONS.map(({ action, icon: Icon, title }) => {
                    const applicable =
                      (action === 'pause' && ['queued', 'assigned', 'printing'].includes(job.status)) ||
                      (action === 'resume' && job.status === 'paused') ||
                      (action === 'retry' && job.status === 'failed') ||
                      (action === 'cancel' && job.status !== 'printing');
                    if (!applicable) return null;
                    return (
                      <button key={action} type="button" className="btn-icon" title={title} disabled={busyId === job.id} onClick={() => act(job, action)}>
                        <Icon className="h-[18px] w-[18px]" />
                      </button>
                    );
                  })}
                  <button type="button" className="btn-icon" title="Browser print (open PDF)" onClick={() => browserPrint(job)}>
                    <Printer className="h-[18px] w-[18px]" />
                  </button>
                  {busyId === job.id && <Spinner className="h-4 w-4 text-slate-300" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- recent ---------- */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Finished (last 24h)</h2>
        <div className="card overflow-x-auto p-0">
          {data.recent.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">No finished jobs in the last 24 hours.</p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Job</th>
                  <th className="px-5 py-3 font-semibold">File</th>
                  <th className="px-5 py-3 font-semibold">Printer</th>
                  <th className="px-5 py-3 font-semibold">Sheets</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Finished</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.recent.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{j.code}</td>
                    <td className="max-w-[240px] truncate px-5 py-3 text-slate-600">{j.fileName}</td>
                    <td className="px-5 py-3 text-slate-600">{j.printerName}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{j.sheets}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={j.status} />
                      {j.error ? <p className="mt-1 max-w-[220px] truncate text-xs text-rose-400">{j.error}</p> : null}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-400">
                      {j.completedAt ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(j.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
