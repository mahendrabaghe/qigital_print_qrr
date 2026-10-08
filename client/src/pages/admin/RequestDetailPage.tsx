import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Ban, Bookmark, BookmarkCheck, CheckCircle2, Download, Eye,
  FileText, Image as ImageIcon, PlayCircle, Printer as PrinterIcon, RefreshCw, Receipt, XCircle,
} from 'lucide-react';
import { http, apiError, API_URL, fetchFileBlob } from '../../services/api';
import { useLiveEvents } from '../../services/live';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { PageLoader, Spinner, StatusBadge } from '../../components/ui/Misc';
import {
  humanSize, money, PAPER_LABELS,
  type FileMeta, type PrintJob, type Printer, type PrintRequest, type RequestFileEntry,
} from '../../types';

const TERMINAL = ['completed', 'rejected', 'cancelled'];

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [request, setRequest] = useState<PrintRequest | null>(null);
  const [metas, setMetas] = useState<Record<string, FileMeta>>({});
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [printMode, setPrintMode] = useState<string>('demo');
  const [notFound, setNotFound] = useState(false);

  const [previewFile, setPreviewFile] = useState<RequestFileEntry | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printerId, setPrinterId] = useState('');
  const [copies, setCopies] = useState(1);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [finalPrice, setFinalPrice] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const [reqRes, printersRes, jobsRes, shopRes] = await Promise.all([
        http.get(`/api/requests/${id}`),
        http.get('/api/printers'),
        http.get('/api/jobs'),
        http.get('/api/shop'),
      ]);
      const req = reqRes.data.request as PrintRequest;
      setRequest(req);
      setPrinters(printersRes.data.printers as Printer[]);
      setPrintMode((shopRes.data.shop?.printMode as string) ?? 'demo');
      const all = [...(jobsRes.data.active as PrintJob[]), ...(jobsRes.data.recent as PrintJob[])];
      setJobs(all.filter((j) => j.requestId === id));

      const metas: Record<string, FileMeta> = {};
      await Promise.all(
        req.files.map(async (f) => {
          try {
            const res = await http.get(`/api/files/${f.fileId}/meta`);
            metas[f.fileId] = res.data.file as FileMeta;
          } catch {
            /* file may have been deleted meanwhile */
          }
        })
      );
      setMetas(metas);
    } catch (err) {
      if (apiError(err).status === 404) setNotFound(true);
      else toast(apiError(err).message, 'error');
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useLiveEvents((event) => {
    if (['request:statusChanged', 'request:updated', 'job:updated', 'queue:updated'].includes(event)) {
      load();
    }
  }, 'admin');

  const locked = request ? TERMINAL.includes(request.status) : true;

  /** File content URL that works in <img>/<object> tags: the request's own session
   *  code is a valid capability for files in this request. */
  const contentUrl = (fileId: string) =>
    `${API_URL}/api/files/${fileId}/content?sessionId=${encodeURIComponent(request!.sessionCode)}`;

  async function downloadFile(f: RequestFileEntry) {
    try {
      const blob = await fetchFileBlob(f.fileId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(apiError(err).message, 'error');
    }
  }

  async function toggleSaved(f: RequestFileEntry) {
    const meta = metas[f.fileId];
    try {
      const res = await http.patch(`/api/files/${f.fileId}`, { savedByAdmin: !meta?.savedByAdmin });
      setMetas((m) => ({ ...m, [f.fileId]: res.data.file as FileMeta }));
      toast(res.data.file.savedByAdmin ? 'File saved — it will be kept forever.' : 'File will follow the retention window.', 'info');
    } catch (err) {
      toast(apiError(err).message, 'error');
    }
  }

  function openPrintDialog() {
    if (!request) return;
    const def = printers.find((p) => p.isDefault);
    setPrinterId(def?.id ?? printers[0]?.id ?? '');
    setCopies(request.settings.copies);
    setPrintOpen(true);
  }

  async function submitPrint() {
    if (!request || !printerId) return;
    setBusy('print');
    try {
      const res = await http.post('/api/jobs', {
        requestId: request.id,
        printerId,
        settings: { copies },
      });
      setPrintOpen(false);
      setJobs((prev) => [...(res.data.jobs as PrintJob[]), ...prev]);
      toast(
        printMode === 'demo'
          ? `Queued ${res.data.jobs.length} job(s) — demo mode simulates printing.`
          : `Queued ${res.data.jobs.length} job(s). The print agent will pick them up.`,
        'success'
      );
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function setProcessing() {
    if (!request) return;
    setBusy('processing');
    try {
      await http.patch(`/api/requests/${request.id}/status`, { status: 'processing' });
      toast('Marked as processing.', 'success');
      load();
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function submitReject() {
    if (!request) return;
    setBusy('reject');
    try {
      await http.patch(`/api/requests/${request.id}/status`, { status: 'rejected', rejectReason });
      setRejectOpen(false);
      setRejectReason('');
      toast('Request rejected.', 'info');
      load();
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function submitComplete() {
    if (!request) return;
    setBusy('complete');
    try {
      await http.patch(`/api/requests/${request.id}/status`, {
        status: 'completed',
        finalPrice: finalPrice === '' ? undefined : Number(finalPrice),
      });
      setCompleteOpen(false);
      toast('Request completed.', 'success');
      load();
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function cancelRequest() {
    if (!request) return;
    setBusy('cancel');
    try {
      await http.patch(`/api/requests/${request.id}/status`, { status: 'cancelled' });
      toast('Request cancelled.', 'info');
      load();
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusy('');
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

  async function retryJob(job: PrintJob) {
    try {
      const res = await http.post(`/api/jobs/${job.id}/retry`);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? (res.data.job as PrintJob) : j)));
      toast('Job re-queued.', 'success');
    } catch (err) {
      toast(apiError(err).message, 'error');
    }
  }

  async function downloadReceipt() {
    if (!request) return;
    try {
      const res = await http.get(`/api/requests/${request.id}/receipt`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${request.code}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(apiError(err).message, 'error');
    }
  }

  const settingsChips = useMemo(() => {
    if (!request) return [];
    const s = request.settings;
    return [
      PAPER_LABELS[s.paper],
      s.color === 'color' ? 'Color' : 'B&W',
      `${s.copies} cop${s.copies > 1 ? 'ies' : 'y'}`,
      s.orientation === 'portrait' ? 'Portrait' : 'Landscape',
      s.sides === 'single' ? 'Single-sided' : 'Double-sided',
      s.scaling === 'actual' ? 'Actual size' : s.scaling === 'fit' ? 'Fit to page' : 'Fill page',
      `${s.pagesPerSheet}/sheet`,
      ...(s.pageRange ? [`Pages: ${s.pageRange}`] : []),
    ];
  }, [request]);

  if (notFound) {
    return (
      <div className="py-16 text-center">
        <p className="font-semibold text-slate-600">Request not found.</p>
        <Link to="/admin/requests" className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
          Back to requests
        </Link>
      </div>
    );
  }

  if (!request) return <PageLoader />;

  return (
    <div className="space-y-4">
      <Link to="/admin/requests" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> All requests
      </Link>

      {/* ---------- header ---------- */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-extrabold text-slate-800">{request.code}</h1>
            <StatusBadge status={request.status} />
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {new Date(request.createdAt).toLocaleString()} · Session {request.sessionCode}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {request.finalPrice != null ? 'Final price' : 'Estimated price'}
          </p>
          <p className="text-2xl font-extrabold tabular-nums text-slate-800">
            {money(request.finalPrice ?? request.estPrice)}
          </p>
        </div>
      </div>

      {/* ---------- actions ---------- */}
      <div className="card flex flex-wrap items-center gap-2 p-4">
        {locked ? (
          <p className="text-sm text-slate-400">
            This request is {request.status}. {request.status === 'rejected' && request.rejectReason ? `Reason: ${request.rejectReason}` : ''}
          </p>
        ) : (
          <>
            {request.status === 'waiting' && (
              <button type="button" className="btn btn-secondary" onClick={setProcessing} disabled={busy === 'processing'}>
                {busy === 'processing' ? <Spinner className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />} Start processing
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={openPrintDialog}>
              <PrinterIcon className="h-4 w-4" /> Print
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setFinalPrice(String(request.finalPrice ?? request.estPrice));
                setCompleteOpen(true);
              }}
            >
              <CheckCircle2 className="h-4 w-4" /> Complete &amp; bill
            </button>
            <div className="flex-1" />
            <button
              type="button"
              className="btn btn-danger-outline"
              onClick={() => setRejectOpen(true)}
            >
              <XCircle className="h-4 w-4" /> Reject
            </button>
            <button type="button" className="btn btn-danger-outline" onClick={cancelRequest} disabled={busy === 'cancel'}>
              <Ban className="h-4 w-4" /> Cancel
            </button>
          </>
        )}
        {request.status === 'completed' && (
          <button type="button" className="btn btn-secondary" onClick={downloadReceipt}>
            <Receipt className="h-4 w-4" /> Download receipt
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------- files ---------- */}
        <section className="space-y-3 lg:col-span-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Files ({request.files.length})</h2>
          {request.files.map((f) => {
            const meta = metas[f.fileId];
            return (
              <div key={f.fileId} className="card flex items-center gap-4 p-4">
                <button
                  type="button"
                  onClick={() => setPreviewFile(f)}
                  className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200"
                  aria-label={`Preview ${f.name}`}
                >
                  {f.kind === 'image' ? (
                    <img src={contentUrl(f.fileId)} alt={f.name} className="h-full w-full object-cover" />
                  ) : (
                    <FileText className="h-8 w-8 text-slate-400" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-700">{f.name}</p>
                  <p className="text-xs text-slate-400">
                    {f.kind === 'pdf' ? 'PDF' : 'Image'} · {f.pages} page{f.pages !== 1 ? 's' : ''}
                    {f.pageRange ? ` (${f.pageRange})` : ''} · {humanSize(f.size)}
                    {meta?.edited ? ' · edited' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" className="btn-icon" title="Preview" onClick={() => setPreviewFile(f)}>
                    <Eye className="h-[18px] w-[18px]" />
                  </button>
                  <button type="button" className="btn-icon" title="Download" onClick={() => downloadFile(f)}>
                    <Download className="h-[18px] w-[18px]" />
                  </button>
                  <button
                    type="button"
                    className={`btn-icon ${meta?.savedByAdmin ? 'text-amber-500' : ''}`}
                    title={meta?.savedByAdmin ? 'Saved forever — click to unsave' : 'Keep this file forever'}
                    onClick={() => toggleSaved(f)}
                  >
                    {meta?.savedByAdmin ? <BookmarkCheck className="h-[18px] w-[18px]" /> : <Bookmark className="h-[18px] w-[18px]" />}
                  </button>
                </div>
              </div>
            );
          })}

          {/* ---------- jobs ---------- */}
          <h2 className="pt-2 text-sm font-bold uppercase tracking-wide text-slate-400">Print jobs</h2>
          {jobs.length === 0 ? (
            <div className="card p-5 text-sm text-slate-400">No print jobs yet for this request.</div>
          ) : (
            jobs.map((j) => (
              <div key={j.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold text-slate-700">
                    <span className="font-mono text-xs text-slate-400">{j.code}</span>
                    <StatusBadge status={j.status} />
                    {j.demo && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-700">demo</span>}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {j.printerName} · {j.sheets} sheet{j.sheets !== 1 ? 's' : ''} · {j.settings.copies} cop{j.settings.copies !== 1 ? 'ies' : ''}
                    {j.error ? ` · ${j.error}` : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button type="button" className="btn-icon" title="Browser print (open PDF)" onClick={() => browserPrint(j)}>
                    <PrinterIcon className="h-[18px] w-[18px]" />
                  </button>
                  {j.status === 'failed' && (
                    <button type="button" className="btn-icon" title="Retry job" onClick={() => retryJob(j)}>
                      <RefreshCw className="h-[18px] w-[18px]" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </section>

        {/* ---------- settings ---------- */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Print settings</h2>
          <div className="card space-y-3 p-4 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {settingsChips.map((c) => (
                <span key={c} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{c}</span>
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs">
              <dt className="text-slate-400">Pages</dt>
              <dd className="tabular-nums text-slate-600">{request.estPages}</dd>
              <dt className="text-slate-400">Sheets (est.)</dt>
              <dd className="tabular-nums text-slate-600">{request.estSheets}</dd>
              <dt className="text-slate-400">Files</dt>
              <dd className="tabular-nums text-slate-600">{request.files.length}</dd>
            </dl>
          </div>
        </section>
      </div>

      {/* ---------- preview modal ---------- */}
      <Modal open={!!previewFile} onClose={() => setPreviewFile(null)} title={previewFile?.name} wide>
        {previewFile &&
          (previewFile.kind === 'image' ? (
            <div className="flex justify-center bg-slate-900/95 p-4">
              <img src={contentUrl(previewFile.fileId)} alt={previewFile.name} className="max-h-[75vh] max-w-full object-contain" />
            </div>
          ) : (
            <object data={contentUrl(previewFile.fileId)} type="application/pdf" className="h-[75vh] w-full">
              <div className="flex flex-col items-center gap-3 p-10 text-center">
                <ImageIcon className="h-10 w-10 text-slate-300" />
                <p className="text-sm text-slate-500">Embedded PDF preview is not available in this browser.</p>
                <button type="button" className="btn btn-secondary" onClick={() => downloadFile(previewFile)}>
                  <Download className="h-4 w-4" /> Download instead
                </button>
              </div>
            </object>
          ))}
      </Modal>

      {/* ---------- print dialog ---------- */}
      <Modal open={printOpen} onClose={() => setPrintOpen(false)} title="Send to printer">
        <div className="space-y-4 p-5">
          {printers.length === 0 ? (
            <p className="text-sm text-slate-500">
              No printers configured yet. Add one under <span className="font-semibold">Printers</span>, or the default
              will be used when available.
            </p>
          ) : (
            <label className="block">
              <span className="label">Printer</span>
              <select className="input" value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
                {printers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.isDefault ? '(default)' : ''} — {p.type}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="label">Copies</span>
            <input
              type="number"
              min={1}
              max={99}
              className="input"
              value={copies}
              onChange={(e) => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            />
          </label>
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            One print job is created per file, using the customer&apos;s chosen settings. {printMode === 'demo' && 'Demo mode is active — printing will be simulated.'}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setPrintOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={submitPrint} disabled={busy === 'print' || !printerId}>
              {busy === 'print' ? <Spinner className="h-4 w-4" /> : <PrinterIcon className="h-4 w-4" />} Queue print job
            </button>
          </div>
        </div>
      </Modal>

      {/* ---------- reject dialog ---------- */}
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject request">
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="label">Reason (shown to the customer)</span>
            <textarea
              className="input min-h-[90px]"
              placeholder="e.g. File is unreadable, please re-upload"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setRejectOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={submitReject} disabled={busy === 'reject'}>
              {busy === 'reject' ? <Spinner className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} Reject request
            </button>
          </div>
        </div>
      </Modal>

      {/* ---------- complete dialog ---------- */}
      <Modal open={completeOpen} onClose={() => setCompleteOpen(false)} title="Complete & bill">
        <div className="space-y-4 p-5">
          <p className="text-sm text-slate-500">
            Confirm the amount the customer pays at the counter. Estimated: <span className="font-bold text-slate-700">{money(request.estPrice)}</span>
          </p>
          <label className="block">
            <span className="label">Final price (₹)</span>
            <input
              type="number"
              min={0}
              step="0.5"
              className="input"
              value={finalPrice}
              onChange={(e) => setFinalPrice(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setCompleteOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={submitComplete} disabled={busy === 'complete'}>
              {busy === 'complete' ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />} Mark completed
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
