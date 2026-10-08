import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Printer,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { http, apiError } from '../../services/api';
import { connectSocket, disconnectSocket } from '../../services/socket';
import { useI18n } from '../../i18n';
import { LanguageToggle } from '../../i18n';
import { PageLoader } from '../../components/ui/Misc';
import { humanSize, money, type PrintRequest } from '../../types';

function requestToken(id: string): string | null {
  return sessionStorage.getItem(`ps_req_${id}`);
}

export default function StatusPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [request, setRequest] = useState<PrintRequest | null>(null);
  const [error, setError] = useState('');
  const [receiptBusy, setReceiptBusy] = useState(false);

  const load = useCallback(async () => {
    if (!requestId) return;
    const token = requestToken(requestId);
    if (!token) {
      setError(t('sessionExpired'));
      return;
    }
    try {
      const res = await http.get(`/api/requests/${requestId}`, { params: { token } });
      setRequest(res.data.request as PrintRequest);
    } catch (err) {
      const e = apiError(err);
      if (e.status === 404) sessionStorage.removeItem(`ps_req_${requestId}`);
      setError(e.status === 404 ? t('sessionExpired') : e.message);
    }
  }, [requestId, t]);

  useEffect(() => {
    load();
  }, [load]);

  /* live updates over the session socket */
  useEffect(() => {
    if (!requestId) return;
    const socket = connectSocket(
      {
        onEvent: (event, payload) => {
          const p = payload as { request?: PrintRequest };
          if (!p?.request || p.request.id !== requestId) return;
          if (event === 'request:updated' || event === 'request:statusChanged' || event === 'request:created') {
            setRequest(p.request);
          }
        },
      },
      'session'
    );
    return () => {
      socket.removeAllListeners();
      disconnectSocket();
    };
  }, [requestId]);

  const downloadReceipt = async () => {
    if (!request) return;
    const token = requestToken(request.id);
    if (!token) return;
    setReceiptBusy(true);
    try {
      const res = await http.get(`/api/requests/${request.id}/receipt`, {
        params: { token },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${request.code}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiError(err).message);
    } finally {
      setReceiptBusy(false);
    }
  };

  if (error && !request) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <XCircle className="h-12 w-12 text-rose-400" />
        <p className="max-w-sm font-semibold text-slate-700">{error}</p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
            {t('newSession')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { setError(''); load(); }}>
            <RefreshCw className="h-4 w-4" /> {t('retry')}
          </button>
        </div>
        <LanguageToggle compact />
      </main>
    );
  }

  if (!request) return <PageLoader label={t('loading')} />;

  const stages: { key: PrintRequest['status']; label: string; icon: React.ReactNode }[] = [
    { key: 'waiting', label: t('statusWaiting'), icon: <Loader2 className="h-5 w-5 animate-spin" /> },
    { key: 'processing', label: t('statusProcessing'), icon: <RefreshCw className="h-5 w-5" /> },
    { key: 'printing', label: t('statusPrinting'), icon: <Printer className="h-5 w-5" /> },
    { key: 'completed', label: t('statusCompleted'), icon: <CheckCircle2 className="h-5 w-5" /> },
  ];
  const stageIndex = stages.findIndex((s) => s.key === request.status);
  const done = request.status === 'completed';
  const bad = request.status === 'rejected' || request.status === 'cancelled';

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-10 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">{t('statusTitle')}</h1>
          <p className="font-mono text-sm font-bold tracking-wider text-brand-600">{request.code}</p>
        </div>
        <LanguageToggle compact />
      </header>

      {bad ? (
        <div className={`card mb-5 flex items-start gap-3 p-5 ${request.status === 'rejected' ? 'ring-rose-200' : 'ring-slate-200'}`}>
          <XCircle className={`mt-0.5 h-6 w-6 shrink-0 ${request.status === 'rejected' ? 'text-rose-500' : 'text-slate-400'}`} />
          <div>
            <p className="font-bold text-slate-800">
              {request.status === 'rejected' ? t('statusRejected') : t('statusCancelled')}
            </p>
            {request.rejectReason ? (
              <p className="mt-1 text-sm text-slate-500">
                {t('rejectReason')}: {request.rejectReason}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="card mb-5 p-5">
          <ol className="space-y-0">
            {stages.map((s, i) => {
              const reached = i <= stageIndex;
              const current = i === stageIndex;
              return (
                <li key={s.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full ring-2 transition ${
                        reached
                          ? done && i === stages.length - 1
                            ? 'bg-emerald-500 text-white ring-emerald-500'
                            : current
                              ? 'bg-brand-600 text-white ring-brand-600'
                              : 'bg-brand-50 text-brand-600 ring-brand-200'
                          : 'bg-slate-50 text-slate-300 ring-slate-200'
                      }`}
                    >
                      {reached && !current && !(done && i === stages.length - 1) ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        s.icon
                      )}
                    </div>
                    {i < stages.length - 1 && (
                      <div className={`my-1 w-0.5 flex-1 rounded ${i < stageIndex ? 'bg-emerald-400' : 'bg-slate-200'}`} style={{ minHeight: 20 }} />
                    )}
                  </div>
                  <div className={`pb-5 pl-1 ${i === stages.length - 1 ? 'pb-0' : ''}`}>
                    <p className={`text-sm font-semibold ${reached ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</p>
                    {current && !done ? (
                      <p className="mt-0.5 text-xs text-slate-400">
                        {request.status === 'waiting' ? t('statusHintWaiting') : t('statusHintPrinting')}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {done && (
        <div className="mb-5 rounded-2xl bg-emerald-50 p-4 text-center ring-1 ring-emerald-200">
          <p className="text-sm font-semibold text-emerald-800">{t('statusHintCompleted')}</p>
          <button type="button" className="btn btn-primary mt-3" onClick={downloadReceipt} disabled={receiptBusy}>
            {receiptBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t('downloadReceipt')}
          </button>
        </div>
      )}

      <div className="card divide-y divide-slate-100 p-0">
        {request.files.map((f, i) => (
          <div key={`${f.fileId}-${i}`} className="flex items-center gap-3 p-3">
            {f.kind === 'image' ? (
              <ImageIcon className="h-5 w-5 shrink-0 text-sky-500" />
            ) : (
              <FileText className="h-5 w-5 shrink-0 text-rose-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-700">{f.name}</p>
              <p className="text-xs text-slate-400">
                {humanSize(f.size)} · {f.pages} {f.pageRange ? `(${f.pageRange})` : ''}
              </p>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between p-4">
          <span className="text-sm font-medium text-slate-500">
            {done ? t('statusCompleted') : t('estimated')}
          </span>
          <span className="text-xl font-extrabold text-slate-800">
            {money(done ? request.finalPrice ?? request.estPrice : request.estPrice)}
          </span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-2">
        <ChevronRight className="h-4 w-4 text-slate-300" />
        <button type="button" className="btn btn-ghost text-sm" onClick={() => navigate('/')}>
          {t('newSession')}
        </button>
      </div>
    </main>
  );
}
