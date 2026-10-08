import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { http } from '../../services/api';
import { useLiveEvents } from '../../services/live';
import { PageLoader, StatusBadge } from '../../components/ui/Misc';
import { humanSize, money, type PrintRequest } from '../../types';

const STATUSES = ['all', 'waiting', 'processing', 'printing', 'completed', 'rejected', 'cancelled'] as const;

export default function RequestsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ requests: PrintRequest[]; total: number } | null>(null);
  const limit = 20;

  const load = useCallback(async () => {
    const res = await http.get('/api/requests', {
      params: { status, search: search || undefined, from: from || undefined, to: to || undefined, page, limit },
    });
    setData({ requests: res.data.requests as PrintRequest[], total: res.data.total as number });
  }, [status, search, from, to, page]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useLiveEvents((event) => {
    if (['request:created', 'request:statusChanged', 'request:updated'].includes(event)) {
      load().catch(() => undefined);
    }
  }, 'admin');

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-slate-800">Requests</h1>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by code or file name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All statuses' : s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <input type="date" className="input w-auto" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <span className="pb-2 text-sm text-slate-400">to</span>
        <input type="date" className="input w-auto" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
      </div>

      <div className="card overflow-x-auto p-0">
        {!data ? (
          <PageLoader />
        ) : data.requests.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400">No requests found.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-semibold">Code</th>
                <th className="px-5 py-3 font-semibold">Files</th>
                <th className="px-5 py-3 font-semibold">Pages</th>
                <th className="px-5 py-3 font-semibold">Price</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.requests.map((r) => (
                <tr key={r.id} className="cursor-pointer transition hover:bg-slate-50" onClick={() => navigate(`/admin/requests/${r.id}`)}>
                  <td className="px-5 py-3">
                    <Link to={`/admin/requests/${r.id}`} className="font-mono font-bold text-brand-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {r.code}
                    </Link>
                  </td>
                  <td className="max-w-[280px] px-5 py-3">
                    <p className="truncate text-slate-600">{r.files.map((f) => f.name).join(', ')}</p>
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-600">{r.files.reduce((s, f) => s + f.pages, 0)}</td>
                  <td className="px-5 py-3 font-bold tabular-nums text-slate-700">
                    {money(r.finalPrice ?? r.estPrice)}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-400">
                    {new Date(r.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    <span className="ml-1 text-xs">({humanSize(r.files.reduce((s, f) => s + f.size, 0))})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.total > limit && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">
            Page {page} of {totalPages} · {data.total} requests
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary !px-3" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" className="btn btn-secondary !px-3" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
