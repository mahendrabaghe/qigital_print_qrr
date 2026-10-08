import { FileText, Image as ImageIcon, Loader2, ShieldCheck } from 'lucide-react';
import { PAPER_LABELS, humanSize, money, type FileMeta, type PrintSettings } from '../../types';
import { estimate } from '../../utils/estimate';
import { useI18n } from '../../i18n';

export default function PreviewStep({
  files,
  settings,
  pageRanges,
  pricing,
  submitting,
  onSubmit,
  onBack,
}: {
  files: FileMeta[];
  settings: PrintSettings;
  pageRanges: Record<string, string>;
  pricing: Record<string, number>;
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const { t, tFn } = useI18n();
  const est = estimate(files, settings, pageRanges, pricing);
  const pagesLabel = tFn('pagesCount');

  const summary: string[] = [
    PAPER_LABELS[settings.paper],
    settings.color === 'color' ? t('color') : t('bw'),
    settings.orientation === 'portrait' ? t('portrait') : t('landscape'),
    settings.sides === 'single' ? t('single') : t('double'),
    settings.scaling === 'actual' ? t('actual') : settings.scaling === 'fit' ? t('fit') : t('fill'),
    settings.pagesPerSheet > 1 ? `${settings.pagesPerSheet} / sheet` : '',
    settings.copies > 1 ? `${settings.copies} × ${t('copies')}` : '',
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <div className="flex flex-wrap gap-1.5">
          {summary.map((s) => (
            <span
              key={s}
              className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100"
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="card divide-y divide-slate-100 p-0">
        {files.map((f) => {
          const range = (pageRanges[f.id] || '').trim();
          const pageCount = f.kind === 'pdf' ? (range ? range.split(',').length : f.pages) : 1;
          return (
            <div key={f.id} className="flex items-center gap-3 p-3">
              {f.kind === 'image' ? (
                <ImageIcon className="h-5 w-5 shrink-0 text-sky-500" />
              ) : (
                <FileText className="h-5 w-5 shrink-0 text-rose-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700">{f.originalName}</p>
                <p className="text-xs text-slate-400">{humanSize(f.size)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {pagesLabel ? pagesLabel(pageCount) : `${pageCount} pages`}
                {f.kind === 'pdf' && range ? ` (${range})` : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div className="card flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium text-slate-400">{t('estimated')}</p>
          <p className="text-sm text-slate-500">
            {est.sheets} × {settings.copies} {t('copies').toLowerCase()} ·{' '}
            {pagesLabel ? pagesLabel(est.pages) : `${est.pages} pages`}
          </p>
        </div>
        <p className="text-3xl font-extrabold text-slate-800">{money(est.price)}</p>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 ring-1 ring-slate-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p>{t('privacyNote')}</p>
      </div>

      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary flex-1" onClick={onBack} disabled={submitting}>
          {t('back')}
        </button>
        <button type="button" className="btn btn-primary flex-[2] !py-3.5 text-base" onClick={onSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {submitting ? t('submitting') : t('submitPrint')}
        </button>
      </div>
    </div>
  );
}
