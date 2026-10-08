import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Printer, Users, Wallet, Clock } from 'lucide-react';
import { http } from '../../services/api';
import { useLiveEvents } from '../../services/live';
import { PageLoader, StatusBadge } from '../../components/ui/Misc';
import { money, type PrintRequest } from '../../types';

interface Summary {
  requests: { total: number; waiting: number; processing: number; printing: number; completed: number; rejected: number; cancelled: number };
  revenue: number;
  activeSessions: number;
  filesUploaded: number;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [incoming, setIncoming] = useState<PrintRequest[]>([]);
  const [printMode, setPrintMode] = useState('demo');

  const load = useCallback(async () => {
    const [s, r, shop] = await Promise.all([
      http.get('/api/analytics/summary', { params: { days: 1 } }),
      http.get('/api/requests', { params: { status: 'waiting', limit: 10 } }),
      http.get('/api/shop'),
    ]);
    setSummary(s.data);
    setIncoming(r.data.requests as PrintRequest[]);
    setPrintMode(shop.data.shop?.printMode ?? 'demo');
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useLiveEvents((event) => {
    if (['request:created', 'request:statusChanged', 'print:started', 'print:completed', 'print:failed', 'queue:updated', 'session:created'].includes(event)) {
      load().catch(() => undefined);
    }
  }, 'admin');

  if (!summary) return <PageLoader />;

  const cards = [
    { label: 'Waiting requests', value: summary.requests.waiting, icon: Clock, tone: 'text-amber-600 bg-amber-50' },
    { label: 'Completed today', value: summary.requests.completed, icon: Printer, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'Revenue today', value: money(summary.revenue), icon: Wallet, tone: 'text-brand-600 bg-brand-50' },
    { label: 'Active sessions', value: summary.activeSessions, icon: Users, tone: 'text-violet-600 bg-violet-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-slate-800">Dashboard</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ring-1 ${
            printMode === 'real' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-sky-50 text-sky-700 ring-sky-200'
          }`}
        >
          {printMode === 'real' ? 'Real printing (agent)' : 'Demo print mode'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card flex items-center gap-3 p-4">
            <div className={`rounded-xl p-2.5 ${c.tone}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">{c.label}</p>
              <p className="text-xl font-extrabold text-slate-800">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="card p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-800">Incoming requests</h2>
          <Link to="/admin/requests" className="flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
            All requests <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {incoming.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">
            No waiting requests — new uploads appear here in real time.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {incoming.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/admin/requests/${r.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-bold text-slate-700">{r.code}</p>
                    <p className="truncate text-xs text-slate-400">
                      {r.files.map((f) => f.name).join(', ')} · {r.files.reduce((s, f) => s + f.pages, 0)} pages
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-700">{money(r.estPrice)}</span>
                  <StatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
