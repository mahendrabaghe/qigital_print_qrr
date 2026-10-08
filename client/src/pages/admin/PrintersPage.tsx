import { useCallback, useEffect, useState } from 'react';
import { Plus, Printer, Star, Trash2, Plug } from 'lucide-react';
import { http, apiError } from '../../services/api';
import { useLiveEvents } from '../../services/live';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { PageLoader, Spinner, StatusBadge, EmptyState } from '../../components/ui/Misc';
import type { Printer as PrinterType } from '../../types';

export default function PrintersPage() {
  const { toast } = useToast();
  const [printers, setPrinters] = useState<PrinterType[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'usb' | 'network' | 'virtual'>('usb');
  const [isDefault, setIsDefault] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await http.get('/api/printers');
    setPrinters(res.data.printers as PrinterType[]);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useLiveEvents((event) => {
    if (['printer:updated', 'agent:connected'].includes(event)) {
      load().catch(() => undefined);
    }
  }, 'admin');

  async function addPrinter() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await http.post('/api/printers', { name: name.trim(), type, isDefault });
      setAddOpen(false);
      setName('');
      setType('usb');
      setIsDefault(false);
      toast('Printer added.', 'success');
      load();
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(p: PrinterType) {
    setBusyId(p.id);
    try {
      await http.patch(`/api/printers/${p.id}`, { isDefault: true });
      load();
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusyId('');
    }
  }

  async function deletePrinter(p: PrinterType) {
    if (!window.confirm(`Delete printer "${p.name}"? Jobs already queued for it are not affected.`)) return;
    setBusyId(p.id);
    try {
      await http.delete(`/api/printers/${p.id}`);
      toast('Printer deleted.', 'info');
      load();
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setBusyId('');
    }
  }

  if (!printers) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">Printers</h1>
          <p className="text-sm text-slate-400">
            The print agent detects Windows printers automatically. Add network or virtual printers manually if needed.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add printer
        </button>
      </div>

      {printers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Printer className="h-10 w-10" />}
            title="No printers yet"
            hint="Run the print agent on the shop PC to auto-detect printers, or add one manually."
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {printers.map((p) => (
            <div key={p.id} className="card flex items-start gap-3 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <Printer className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold text-slate-700">
                  <span className="truncate">{p.name}</span>
                  {p.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                      <Star className="h-3 w-3" /> Default
                    </span>
                  )}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                  <StatusBadge status={p.status} />
                  <span className="uppercase">{p.type}</span>
                  <span className="inline-flex items-center gap-1">
                    <Plug className="h-3 w-3" /> {p.source}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {p.lastSeenAt ? `Last seen ${new Date(p.lastSeenAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}` : 'Never seen'}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {!p.isDefault && (
                  <button type="button" className="btn-icon" title="Make default" disabled={busyId === p.id} onClick={() => setDefault(p)}>
                    <Star className="h-[18px] w-[18px]" />
                  </button>
                )}
                <button type="button" className="btn-icon !text-rose-500 hover:!bg-rose-50" title="Delete printer" disabled={busyId === p.id} onClick={() => deletePrinter(p)}>
                  <Trash2 className="h-[18px] w-[18px]" />
                </button>
                {busyId === p.id && <Spinner className="h-4 w-4 text-slate-300" />}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add printer">
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="label">Name</span>
            <input className="input" placeholder="e.g. Front counter HP LaserJet" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Type</span>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="usb">USB / locally attached</option>
              <option value="network">Network</option>
              <option value="virtual">Virtual (browser print)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Make this the default printer
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setAddOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={addPrinter} disabled={busy || !name.trim()}>
              {busy && <Spinner className="h-4 w-4" />} Add printer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
