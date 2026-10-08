import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Eye, EyeOff, KeyRound, RefreshCw, Save, ShieldAlert } from 'lucide-react';
import { http, apiError } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { PageLoader, Spinner } from '../../components/ui/Misc';
import {
  PAPER_LABELS,
  type ColorMode, type Orientation, type PaperSize, type Scaling, type Sides, type PagesPerSheet,
  type ShopSettings,
} from '../../types';

const PAPERS: PaperSize[] = ['a4', 'a3', 'a5', 'letter', 'legal', '4x6', 'custom'];
const RETENTION_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours (recommended)' },
  { value: 168, label: '7 days' },
];

function maskToken(token: string): string {
  return `${token.slice(0, 6)}${'•'.repeat(Math.max(0, token.length - 10))}${token.slice(-4)}`;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [agentToken, setAgentToken] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [printMode, setPrintMode] = useState('demo');

  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await http.get('/api/shop');
    const shop = res.data.shop as { name: string; agentToken: string; settings: ShopSettings; printMode: string };
    setName(shop.name);
    setSettings(shop.settings);
    setAgentToken(shop.agentToken);
    setPrintMode(shop.printMode ?? 'demo');
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (!settings) return <PageLoader />;

  const set = <K extends keyof ShopSettings>(key: K, value: ShopSettings[K]) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await http.put('/api/shop', {
        name,
        settings: {
          address: settings.address,
          phone: settings.phone,
          defaultPaper: settings.defaultPaper,
          defaultColor: settings.defaultColor,
          defaultOrientation: settings.defaultOrientation,
          defaultSides: settings.defaultSides,
          defaultScaling: settings.defaultScaling,
          defaultPagesPerSheet: settings.defaultPagesPerSheet,
          defaultLanguage: settings.defaultLanguage,
          retentionHours: settings.retentionHours,
          maxFileSizeMb: settings.maxFileSizeMb,
          pricing: settings.pricing,
        },
      });
      toast('Settings saved.', 'success');
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function rotateToken() {
    if (!window.confirm('Rotate the agent token? The print agent must be updated with the new token immediately or printing stops.')) return;
    setRotating(true);
    try {
      const res = await http.put('/api/shop', { rotateAgentToken: true });
      setAgentToken(res.data.shop.agentToken);
      setTokenVisible(true);
      toast('New agent token generated. Update the print agent config now.', 'success');
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setRotating(false);
    }
  }

  async function changePassword() {
    if (pwNew !== pwConfirm) {
      toast('New passwords do not match.', 'error');
      return;
    }
    setPwBusy(true);
    try {
      await http.post('/api/auth/change-password', { currentPassword: pwCurrent, newPassword: pwNew });
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
      toast('Password changed.', 'success');
    } catch (err) {
      toast(apiError(err).message, 'error');
    } finally {
      setPwBusy(false);
    }
  }

  const price = (paper: PaperSize, color: ColorMode) => settings.pricing[`${paper}:${color}`] ?? 0;
  const setPrice = (paper: PaperSize, color: ColorMode, value: number) =>
    set('pricing', { ...settings.pricing, [`${paper}:${color}`]: value });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-slate-800">Settings</h1>

      {/* ---------- profile & defaults ---------- */}
      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Shop profile</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">Shop name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Address (shown to customers)</span>
            <input className="input" value={settings.address} onChange={(e) => set('address', e.target.value)} maxLength={300} />
          </label>
          <label className="block">
            <span className="label">Phone</span>
            <input className="input" value={settings.phone} onChange={(e) => set('phone', e.target.value)} maxLength={30} />
          </label>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Default print settings</h2>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <label className="block">
            <span className="label">Paper</span>
            <select className="input" value={settings.defaultPaper} onChange={(e) => set('defaultPaper', e.target.value as PaperSize)}>
              {PAPERS.map((p) => (
                <option key={p} value={p}>{PAPER_LABELS[p]}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Color</span>
            <select className="input" value={settings.defaultColor} onChange={(e) => set('defaultColor', e.target.value as ColorMode)}>
              <option value="color">Color</option>
              <option value="bw">B&amp;W</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Orientation</span>
            <select className="input" value={settings.defaultOrientation} onChange={(e) => set('defaultOrientation', e.target.value as Orientation)}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Sides</span>
            <select className="input" value={settings.defaultSides} onChange={(e) => set('defaultSides', e.target.value as Sides)}>
              <option value="single">Single-sided</option>
              <option value="double">Double-sided</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Scaling</span>
            <select className="input" value={settings.defaultScaling} onChange={(e) => set('defaultScaling', e.target.value as Scaling)}>
              <option value="fit">Fit to page</option>
              <option value="actual">Actual size</option>
              <option value="fill">Fill page</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Pages per sheet</span>
            <select
              className="input"
              value={settings.defaultPagesPerSheet}
              onChange={(e) => set('defaultPagesPerSheet', Number(e.target.value) as PagesPerSheet)}
            >
              {[1, 2, 4, 6, 9].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Customer language</span>
            <select className="input" value={settings.defaultLanguage} onChange={(e) => set('defaultLanguage', e.target.value as 'en' | 'hi')}>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Default printer</span>
            <p className="input !bg-slate-100 text-slate-400">
              Set from the <Link to="/admin/printers" className="font-semibold text-brand-600 hover:underline">Printers</Link> page
            </p>
          </label>
        </div>
      </section>

      {/* ---------- storage & retention ---------- */}
      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Files &amp; retention</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Auto-delete files after</span>
            <select
              className="input"
              value={settings.retentionHours}
              onChange={(e) => set('retentionHours', Number(e.target.value) as ShopSettings['retentionHours'])}
            >
              {RETENTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Max upload size (MB)</span>
            <input
              type="number"
              min={1}
              max={200}
              className="input"
              value={settings.maxFileSizeMb}
              onChange={(e) => set('maxFileSizeMb', Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
            />
          </label>
        </div>
        <p className="text-xs text-slate-400">
          Files are stored only for processing and deleted automatically after this window — unless you mark a file as
          &ldquo;kept forever&rdquo; on the request page.
        </p>
      </section>

      {/* ---------- pricing ---------- */}
      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Pricing (₹ per sheet)</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-4 font-semibold">Paper</th>
                <th className="py-2 pr-4 font-semibold">Color</th>
                <th className="py-2 font-semibold">B&amp;W</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {PAPERS.map((p) => (
                <tr key={p}>
                  <td className="py-2 pr-4 font-semibold text-slate-600">{PAPER_LABELS[p]}</td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="input !w-24 !py-1.5"
                      value={price(p, 'color')}
                      onChange={(e) => setPrice(p, 'color', Math.max(0, Number(e.target.value) || 0))}
                    />
                  </td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="input !w-24 !py-1.5"
                      value={price(p, 'bw')}
                      onChange={(e) => setPrice(p, 'bw', Math.max(0, Number(e.target.value) || 0))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-end">
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save settings
        </button>
      </div>

      {/* ---------- agent token ---------- */}
      <section className="card space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Print agent token</h2>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ring-1 ${
            printMode === 'real' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-sky-50 text-sky-700 ring-sky-200'
          }`}>
            {printMode} mode
          </span>
        </div>
        <p className="text-sm text-slate-500">
          Paste this token into the print agent&apos;s <code className="rounded bg-slate-100 px-1">config.json</code> on the
          shop PC. It authenticates the agent over Socket.IO and HTTP.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 truncate rounded-xl bg-slate-50 px-3.5 py-2.5 font-mono text-sm text-slate-700 ring-1 ring-slate-200">
            {tokenVisible ? agentToken : maskToken(agentToken)}
          </code>
          <button type="button" className="btn-icon" title={tokenVisible ? 'Hide' : 'Reveal'} onClick={() => setTokenVisible((v) => !v)}>
            {tokenVisible ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
          <button
            type="button"
            className="btn-icon"
            title="Copy"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(agentToken);
                toast('Token copied.', 'success');
              } catch {
                toast('Copy failed — reveal the token and copy manually.', 'error');
              }
            }}
          >
            <Copy className="h-[18px] w-[18px]" />
          </button>
          <button type="button" className="btn btn-danger-outline !py-2" onClick={rotateToken} disabled={rotating}>
            {rotating ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />} Rotate
          </button>
        </div>
        {printMode !== 'real' && (
          <p className="flex items-start gap-2 text-xs text-sky-700">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Demo mode is active (PRINT_MODE=demo): print jobs are simulated instead of sent to a real printer. Set
            PRINT_MODE=real on the server and run the agent for real printing.
          </p>
        )}
      </section>

      {/* ---------- change password ---------- */}
      <section className="card space-y-4 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Change password</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label">Current password</span>
            <input type="password" className="input" autoComplete="current-password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">New password</span>
            <input type="password" className="input" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Confirm new password</span>
            <input type="password" className="input" autoComplete="new-password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={changePassword}
            disabled={pwBusy || !pwCurrent || !pwNew || pwNew.length < 8}
          >
            {pwBusy ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />} Update password
          </button>
        </div>
      </section>
    </div>
  );
}
