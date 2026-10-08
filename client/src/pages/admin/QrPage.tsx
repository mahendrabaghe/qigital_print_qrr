import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Pencil, Plus, Printer, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { http, apiError } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { PageLoader, Spinner, EmptyState } from '../../components/ui/Misc';
import type { Terminal } from '../../types';

export default function QrPage() {
  const { toast } = useToast();
  const [terminals, setTerminals] = useState<Terminal[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const load = useCallback(async () => {
    const res = await http.get('/api/qr');
    setTerminals(res.data.terminals as Terminal[]);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function generate() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await http.post('/api/qr', { label: label.trim() });
      setAddOpen(false);
      setLabel('');
      toast('QR counter created.', 'success');
      load();
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, patch: { label?: string; active?: boolean }) {
    setBusyId(id);
    try {
      const res = await http.put(`/api/qr/${id}`, patch);
      const updated = res.data.terminal as Terminal;
      setTerminals((prev) => prev!.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusyId('');
    }
  }

  async function regenerate(t: Terminal) {
    if (!window.confirm(`Regenerate the code for "${t.label}"? The old QR will stop working immediately.`)) return;
    setBusyId(t.id);
    try {
      await http.post(`/api/qr/${t.id}/regenerate`);
      await load();
      toast('QR code regenerated.', 'success');
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusyId('');
    }
  }

  async function remove(t: Terminal) {
    if (!window.confirm(`Delete QR counter "${t.label}"? Customers scanning it will get an invalid-code screen.`)) return;
    setBusyId(t.id);
    try {
      await http.delete(`/api/qr/${t.id}`);
      setTerminals((prev) => prev!.filter((x) => x.id !== t.id));
      toast('QR counter deleted.', 'info');
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusyId('');
    }
  }

  function downloadQr(t: Terminal) {
    const a = document.createElement('a');
    a.href = t.qrDataUrl;
    a.download = `qr-${t.code}.png`;
    a.click();
  }

  function printQr(t: Terminal) {
    const w = window.open('', '_blank', 'width=520,height=720');
    if (!w) {
      toast('Popup blocked — allow popups to print QR codes.', 'error');
      return;
    }
    w.document.write(`<!doctype html><html><head><title>QR — ${t.label}</title><style>
      body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;gap:16px;padding:40px;margin:0}
      img{width:340px;height:340px}
      h1{font-size:20px;margin:0}
      p{color:#555;font-size:14px;margin:4px 0}
      code{font-size:16px;letter-spacing:2px}
      @media print{@page{size:A5;margin:0.5cm}}
    </style></head><body>
      <h1>${t.label}</h1>
      <img src="${t.qrDataUrl}" alt="QR code"/>
      <p>Scan to upload &amp; print</p>
      <code>${t.uploadUrl}</code>
      <p style="margin-top:12px;font-size:12px;color:#999">Code ${t.code}</p>
      <script>window.onload=()=>{window.print();}<\/script>
    </body></html>`);
    w.document.close();
  }

  if (!terminals) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">QR counters</h1>
          <p className="text-sm text-slate-400">
            Print these and stick them near each counter/terminal. Each has its own upload page.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> New QR counter
        </button>
      </div>

      {terminals.length === 0 ? (
        <div className="card">
          <EmptyState icon={<QrCode className="h-10 w-10" />} title="No QR counters yet" hint="Create one for each counter or kiosk where customers scan." />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {terminals.map((t) => (
            <div key={t.code} className={`card flex flex-col items-center gap-3 p-5 text-center ${!t.active ? 'opacity-60' : ''}`}>
              <div className="flex w-full items-center justify-between gap-2">
                <p className="truncate font-bold text-slate-700">{t.label}</p>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <input
                    type="checkbox"
                    checked={t.active}
                    disabled={busyId === t.id}
                    onChange={(e) => update(t.id, { active: e.target.checked })}
                    className="h-3.5 w-3.5 accent-brand-600"
                  />
                  Active
                </label>
              </div>

              <img src={t.qrDataUrl} alt={`QR for ${t.label}`} className="h-44 w-44 rounded-xl ring-1 ring-slate-200" />

              <div className="text-xs text-slate-400">
                <p className="font-mono tracking-widest">{t.code}</p>
                <Link to={`/upload/${t.code}`} className="mt-0.5 block truncate text-brand-600 hover:underline">{t.uploadUrl}</Link>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-1">
                <button type="button" className="btn-icon" title="Download PNG" onClick={() => downloadQr(t)}>
                  <Download className="h-[18px] w-[18px]" />
                </button>
                <button type="button" className="btn-icon" title="Print QR sticker" onClick={() => printQr(t)}>
                  <Printer className="h-[18px] w-[18px]" />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  title="Rename"
                  onClick={() => {
                    setEditId(t.id);
                    setEditLabel(t.label);
                  }}
                >
                  <Pencil className="h-[18px] w-[18px]" />
                </button>
                <button type="button" className="btn-icon" title="Regenerate code" disabled={busyId === t.id} onClick={() => regenerate(t)}>
                  <RefreshCw className="h-[18px] w-[18px]" />
                </button>
                <button type="button" className="btn-icon !text-rose-500 hover:!bg-rose-50" title="Delete" disabled={busyId === t.id} onClick={() => remove(t)}>
                  <Trash2 className="h-[18px] w-[18px]" />
                </button>
                {busyId === t.id && <Spinner className="h-4 w-4 text-slate-300" />}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New QR counter">
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="label">Label</span>
            <input
              className="input"
              placeholder="e.g. Counter 1, Self-service kiosk"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setAddOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={generate} disabled={busy || !label.trim()}>
              {busy && <Spinner className="h-4 w-4" />} Create
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={editId !== null} onClose={() => setEditId(null)} title="Rename counter">
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="label">Label</span>
            <input className="input" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} maxLength={60} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setEditId(null)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (editId && editLabel.trim()) await update(editId, { label: editLabel.trim() });
                setEditId(null);
              }}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
