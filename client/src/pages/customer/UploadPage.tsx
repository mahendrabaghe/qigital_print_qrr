import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Camera,
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  Pencil,
  QrCode,
} from 'lucide-react';
import { http, apiError, fileContentUrl, getSessionCode, setSessionCode } from '../../services/api';
import { uploadFile } from '../../services/files';
import { estimate } from '../../utils/estimate';
import { useI18n } from '../../i18n';
import { Stepper } from '../../components/ui/Stepper';
import { PageLoader } from '../../components/ui/Misc';
import { LanguageToggle } from '../../i18n';
import { useToast } from '../../components/ui/Toast';
import CameraCapture from '../../components/customer/CameraCapture';
import ImageEditor from '../../components/customer/ImageEditor';
import PrintSettingsForm from '../../components/customer/PrintSettingsForm';
import PreviewStep from '../../components/customer/PreviewStep';
import { humanSize, type FileMeta, type PrintSettings, type ShopInfo } from '../../types';

interface UploadProgress {
  key: string;
  name: string;
  percent: number;
}

export default function UploadPage() {
  const { terminalCode } = useParams<{ terminalCode: string }>();
  const navigate = useNavigate();
  const { t, tFn, setLang } = useI18n();
  const { toast } = useToast();
  const langApplied = useRef(false);

  const [phase, setPhase] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [invalidMsg, setInvalidMsg] = useState('');
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState<PrintSettings | null>(null);
  const [pageRanges, setPageRanges] = useState<Record<string, string>>({});
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [editing, setEditing] = useState<FileMeta | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* ---------- session bootstrap (reuse on refresh, else scan) ---------- */
  useEffect(() => {
    let alive = true;
    const boot = async () => {
      const existing = getSessionCode();
      if (existing) {
        try {
          const res = await http.get(`/api/session/${existing}`);
          if (!alive) return;
          if (res.data.session.terminalCode === terminalCode?.toUpperCase()) {
            applySession(res.data.session.code, res.data.shop as ShopInfo, res.data.files as FileMeta[]);
            return;
          }
        } catch {
          /* expired / different shop — fall through to fresh scan */
        }
      }
      try {
        const res = await http.post(`/api/session/scan/${terminalCode}`);
        if (!alive) return;
        applySession(res.data.session.code, res.data.shop as ShopInfo, []);
      } catch (err) {
        if (!alive) return;
        const e = apiError(err);
        setInvalidMsg(e.code === 'SESSION_EXPIRED' ? t('sessionExpired') : e.code === 'QR_INVALID' ? t('invalidQr') : e.message);
        setPhase('invalid');
      }
    };
    boot();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalCode]);

  const applySession = (code: string, shopInfo: ShopInfo, initialFiles: FileMeta[]) => {
    setSessionCode(code);
    setShop(shopInfo);
    setFiles(initialFiles);
    setSettings({
      paper: shopInfo.settings.defaultPaper,
      color: shopInfo.settings.defaultColor,
      copies: 1,
      orientation: shopInfo.settings.defaultOrientation,
      sides: shopInfo.settings.defaultSides,
      scaling: shopInfo.settings.defaultScaling,
      pagesPerSheet: shopInfo.settings.defaultPagesPerSheet,
    });
    if (!langApplied.current && !localStorage.getItem('ps_lang')) {
      langApplied.current = true;
      setLang(shopInfo.settings.defaultLanguage);
    }
    setPhase('ready');
  };

  /* ---------- uploads ---------- */
  const handleFileList = useCallback(
    async (list: File[]) => {
      for (const raw of list) {
        const key = `${raw.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setUploads((u) => [...u, { key, name: raw.name, percent: 0 }]);
        try {
          const { file } = await uploadFile(raw, {
            onProgress: (percent) =>
              setUploads((u) => u.map((x) => (x.key === key ? { ...x, percent } : x))),
          });
          setFiles((prev) => [...prev, file]);
        } catch (err) {
          const e = apiError(err);
          toast(
            e.code === 'FILE_TOO_LARGE'
              ? `${raw.name}: ${t('fileTooLarge')} (${shop?.settings.maxFileSizeMb} MB max)`
              : e.code === 'UNSUPPORTED_TYPE'
                ? `${raw.name}: ${t('unsupportedType')}`
                : `${raw.name}: ${e.message}`,
            'error'
          );
        } finally {
          setUploads((u) => u.filter((x) => x.key !== key));
        }
      }
    },
    [shop, t, toast]
  );

  const onInputChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleFileList(Array.from(e.target.files));
    e.target.value = '';
  };

  const removeFile = async (id: string) => {
    try {
      await http.delete(`/api/files/${id}`);
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      toast(apiError(err).message, 'error');
    }
  };

  const handleEditorSave = async (blob: Blob) => {
    if (!editing) return;
    const name = editing.originalName.replace(/\.[^.]+$/, '') + '-edited.jpg';
    const file = new File([blob], name, { type: 'image/jpeg' });
    const { file: updated } = await uploadFile(file, { replaceFileId: editing.id });
    setFiles((prev) => prev.map((f) => (f.id === editing.id ? updated : f)));
    setEditing(null);
  };

  /* ---------- submit ---------- */
  const submit = async () => {
    if (!settings || !files.length) return;
    setSubmitting(true);
    try {
      const res = await http.post('/api/requests', {
        files: files.map((f) => {
          const range = (pageRanges[f.id] || '').trim();
          return { fileId: f.id, ...(range ? { pageRange: range } : {}) };
        }),
        settings,
      });
      const req = res.data.request;
      sessionStorage.setItem(`ps_req_${req.id}`, req.accessToken);
      navigate(`/status/${req.id}`);
    } catch (err) {
      toast(apiError(err).message, 'error');
      setSubmitting(false);
    }
  };

  /* ---------- render ---------- */
  if (phase === 'loading') return <PageLoader label={t('loading')} />;

  if (phase === 'invalid') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-100">
          <QrCode className="h-10 w-10 text-rose-400" />
        </div>
        <p className="max-w-sm font-semibold text-slate-700">{invalidMsg || t('invalidQr')}</p>
        <LanguageToggle compact />
      </main>
    );
  }

  const steps = [t('uploadTitle'), t('settingsTitle'), t('previewTitle')];
  const est = settings ? estimate(files, settings, pageRanges, shop?.settings.pricing || {}) : null;
  const retentionLabel = tFn('filesRetention');
  const pagesLabel = tFn('pagesCount');

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-28 pt-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">{shop?.name}</h1>
          <p className="text-xs text-slate-400">{t('appName')}</p>
        </div>
        <LanguageToggle compact />
      </header>

      <div className="mb-5 flex justify-center">
        <Stepper steps={steps} current={step - 1} />
      </div>

      {step === 1 && (
        <section className="space-y-4">
          <div
            className="card flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed !p-8 text-center transition hover:border-brand-400 hover:bg-brand-50/40"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) handleFileList(Array.from(e.dataTransfer.files));
            }}
          >
            <UploadCloud className="h-10 w-10 text-brand-500" />
            <div>
              <p className="font-bold text-slate-700">{t('uploadButton')}</p>
              <p className="mt-1 text-xs text-slate-400">{t('uploadHint')}</p>
            </div>
            <button type="button" className="btn btn-primary mt-2 !px-6 !py-3">
              <Plus className="h-5 w-5" /> {t('uploadButton')}
            </button>
          </div>
          <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={onInputChanged} />

          <button type="button" className="btn btn-secondary w-full !py-3.5 text-base" onClick={() => setCameraOpen(true)}>
            <Camera className="h-5 w-5" /> {t('cameraButton')}
          </button>

          {uploads.length > 0 && (
            <div className="card space-y-2 p-3">
              {uploads.map((u) => (
                <div key={u.key}>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span className="max-w-[70%] truncate">{u.name}</span>
                    <span className="tabular-nums">{u.percent}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${u.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-700">{t('filesTitle')}</h2>
                <span className="text-xs text-slate-400">{files.length}</span>
              </div>
              {files.map((f) => (
                <div key={f.id} className="card flex items-center gap-3 p-3">
                  {f.kind === 'image' ? (
                    <img
                      src={fileContentUrl(f.id)}
                      alt={f.originalName}
                      className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-rose-50 ring-1 ring-rose-100">
                      <FileText className="h-6 w-6 text-rose-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-700">{f.originalName}</p>
                    <p className="text-xs text-slate-400">
                      {humanSize(f.size)}
                      {f.kind === 'pdf' && pagesLabel ? ` · ${pagesLabel(f.pages)}` : ''}
                      {f.edited ? ` · ${t('edited')}` : ''}
                    </p>
                  </div>
                  {f.kind === 'image' && (
                    <button
                      type="button"
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600"
                      onClick={() => setEditing(f)}
                      aria-label={t('edit')}
                      title={t('edit')}
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => removeFile(f.id)}
                    aria-label={t('remove')}
                    title={t('remove')}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost w-full text-sm" onClick={() => inputRef.current?.click()}>
                <ImageIcon className="h-4 w-4" /> {t('addMore')}
              </button>
            </div>
          )}

          <p className="rounded-xl bg-slate-50 p-3 text-center text-[11px] leading-relaxed text-slate-400 ring-1 ring-slate-200">
            {t('privacyNote')}
            {shop && retentionLabel ? ` ${retentionLabel(shop.settings.retentionHours)}` : ''}
          </p>
        </section>
      )}

      {step === 2 && settings && (
        <section>
          <PrintSettingsForm
            files={files}
            settings={settings}
            onChange={setSettings}
            pageRanges={pageRanges}
            onPageRange={(id, range) =>
              setPageRanges((prev) => {
                const next = { ...prev };
                if (range) next[id] = range;
                else delete next[id];
                return next;
              })
            }
            pricing={shop?.settings.pricing || {}}
          />
        </section>
      )}

      {step === 3 && settings && (
        <section>
          <PreviewStep
            files={files}
            settings={settings}
            pageRanges={pageRanges}
            pricing={shop?.settings.pricing || {}}
            submitting={submitting}
            onSubmit={submit}
            onBack={() => setStep(2)}
          />
        </section>
      )}

      {step < 3 && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            {step === 2 ? (
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                {t('back')}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary flex-1 !py-3.5 text-base"
              disabled={!files.length || uploads.length > 0 || (step === 2 && !!est?.invalidRange)}
              onClick={() => setStep(step + 1)}
            >
              {uploads.length > 0 ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> {t('uploading')}
                </>
              ) : files.length ? (
                t('continue')
              ) : (
                t('emptyFiles')
              )}
            </button>
          </div>
        </nav>
      )}

      {cameraOpen && (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => {
            setCameraOpen(false);
            handleFileList([file]);
          }}
        />
      )}

      {editing && (
        <ImageEditor
          src={fileContentUrl(editing.id)}
          fileName={editing.originalName}
          onSave={handleEditorSave}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}
