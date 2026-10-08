import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Activity, FileStack, IndianRupee, Layers, Printer, Users } from 'lucide-react';
import { http } from '../../services/api';
import { PageLoader, StatusBadge } from '../../components/ui/Misc';
import { money, type JobStatus, type RequestStatus } from '../../types';

interface Summary {
  days: number;
  requests: { total: number; waiting: number; processing: number; printing: number; completed: number; rejected: number; cancelled: number };
  jobs: Record<string, number>;
  revenue: number;
  sheetsPrinted: number;
  pagesProcessed: number;
  filesUploaded: number;
  activeSessions: number;
  topPrinters: Array<{ name: string; sheets: number; jobs: number }>;
}

interface Daily {
  daily: Array<{ date: string; requests: number; completed: number; revenue: number }>;
}

const DAY_OPTIONS = [7, 30, 90];

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate text-xl font-extrabold tabular-nums text-slate-800">{value}</p>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<Daily['daily']>([]);

  const load = useCallback(async () => {
    const [s, d] = await Promise.all([
      http.get('/api/analytics/summary', { params: { days } }),
      http.get('/api/analytics/daily', { params: { days } }),
    ]);
    setSummary(s.data as Summary);
    setDaily((d.data as Daily).daily);
  }, [days]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (!summary) return <PageLoader />;

  const chartData = daily.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString([], { day: 'numeric', month: 'short' }),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-slate-800">Analytics</h1>
        <div className="flex rounded-xl bg-white p-1 ring-1 ring-slate-200">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                days === d ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {d === 90 ? '90d' : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- stat cards ---------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Activity className="h-5 w-5" />} label={`Requests (${days}d)`} value={String(summary.requests.total)} />
        <StatCard icon={<IndianRupee className="h-5 w-5" />} label={`Revenue (${days}d)`} value={money(summary.revenue)} />
        <StatCard icon={<Layers className="h-5 w-5" />} label="Sheets printed" value={String(summary.sheetsPrinted)} />
        <StatCard icon={<FileStack className="h-5 w-5" />} label="Files uploaded" value={String(summary.filesUploaded)} />
        <StatCard icon={<Printer className="h-5 w-5" />} label="Pages processed" value={String(summary.pagesProcessed)} />
        <StatCard icon={<Users className="h-5 w-5" />} label="Active sessions now" value={String(summary.activeSessions)} />
      </div>

      {/* ---------- charts ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">Requests per day</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="requests" name="Requests" stroke="#4f46e5" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="completed" name="Completed" stroke="#059669" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">Revenue per day</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(v: number) => [money(v), 'Revenue']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Bar dataKey="revenue" name="Revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ---------- breakdowns ---------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Requests by status</h2>
          <ul className="space-y-2 text-sm">
            {(Object.keys(summary.requests) as Array<'total' | RequestStatus>)
              .filter((k) => k !== 'total')
              .map((k) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <StatusBadge status={k} />
                  <span className="font-bold tabular-nums text-slate-700">{summary.requests[k]}</span>
                </li>
              ))}
          </ul>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Jobs by status</h2>
          {Object.keys(summary.jobs).length === 0 ? (
            <p className="text-sm text-slate-400">No jobs in this period.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(Object.keys(summary.jobs) as JobStatus[]).map((k) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <StatusBadge status={k} />
                  <span className="font-bold tabular-nums text-slate-700">{summary.jobs[k]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Top printers</h2>
          {summary.topPrinters.length === 0 ? (
            <p className="text-sm text-slate-400">No printing activity yet.</p>
          ) : (
            <ul className="space-y-2.5 text-sm">
              {summary.topPrinters.map((p, i) => (
                <li key={p.name} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-extrabold text-slate-500">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-600">{p.name}</span>
                  <span className="shrink-0 text-xs text-slate-400">{p.jobs} jobs</span>
                  <span className="shrink-0 font-bold tabular-nums text-slate-700">{p.sheets} sheets</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
