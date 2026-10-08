import { useState } from 'react';
import { FileText, Minus, Plus } from 'lucide-react';
import { PAPER_LABELS, money, type FileMeta, type PrintSettings } from '../../types';
import { estimate, rateFor } from '../../utils/estimate';
import { useI18n } from '../../i18n';
import PdfPagePicker from './PdfPagePicker';

function Chips<T extends string | number>({
  options,
  value,
  onSelect,
  columns = 'auto',
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onSelect: (v: T) => void;
  columns?: 'auto' | 2 | 3;
}) {
  const gridClass =
    columns === 2
      ? 'grid-cols-2'
      : columns === 3
        ? 'grid-cols-3'
        : 'grid-cols-2 sm:grid-cols-3';
  return (
    <div className={`grid gap-2 ${gridClass}`}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onSelect(o.value)}
          className={`rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 transition ${
            value === o.value
              ? 'bg-brand-600 text-white ring-brand-600 shadow-sm'
              : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
          }`}
        >
          {o.label}
          {o.hint ? <span className="block text-[11px] font-normal opacity-75">{o.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      {children}
    </div>
  );
}

export default function PrintSettingsForm({
  files,
  settings,
  onChange,
  pageRanges,
  onPageRange,
  pricing,
}: {
  files: FileMeta[];
  settings: PrintSettings;
  onChange: (next: PrintSettings) => void;
  pageRanges: Record<string, string>;
  onPageRange: (fileId: string, range: string) => void;
  pricing: Record<string, number>;
}) {
  const { t, tFn } = useI18n();
  const [pickerFor, setPickerFor] = useState<FileMeta | null>(null);

  const set = <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const est = estimate(files, settings, pageRanges, pricing);
  const pagesLabel = tFn('pagesCount');
  const pdfFiles = files.filter((f) => f.kind === 'pdf');

  const setCopies = (delta: number) => {
    const next = Math.min(99, Math.max(1, settings.copies + delta));
    set('copies', next);
  };

  return (
    <div className="space-y-5">
      <Field label={t('paper')}>
        <Chips
          options={(Object.keys(PAPER_LABELS) as (keyof typeof PAPER_LABELS)[]).map((p) => ({
            value: p,
            label: PAPER_LABELS[p],
            hint: `${money(rateFor(pricing, p, settings.color))} / sheet`,
          }))}
          value={settings.paper}
          onSelect={(p) => set('paper', p)}
        />
      </Field>

      <Field label={t('colorMode')}>
        <Chips
          columns={2}
          options={[
            { value: 'color' as const, label: t('color'), hint: `${money(rateFor(pricing, settings.paper, 'color'))} / sheet` },
            { value: 'bw' as const, label: t('bw'), hint: `${money(rateFor(pricing, settings.paper, 'bw'))} / sheet` },
          ]}
          value={settings.color}
          onSelect={(c) => set('color', c)}
        />
      </Field>

      <Field label={t('copies')}>
        <div className="flex items-center gap-3">
          <button type="button" className="btn btn-secondary !px-4" onClick={() => setCopies(-1)} aria-label="-">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-14 rounded-xl bg-slate-100 py-2.5 text-center text-lg font-bold tabular-nums text-slate-800">
            {settings.copies}
          </span>
          <button type="button" className="btn btn-secondary !px-4" onClick={() => setCopies(1)} aria-label="+">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('orientation')}>
          <Chips
            columns={2}
            options={[
              { value: 'portrait' as const, label: t('portrait') },
              { value: 'landscape' as const, label: t('landscape') },
            ]}
            value={settings.orientation}
            onSelect={(v) => set('orientation', v)}
          />
        </Field>
        <Field label={t('sides')}>
          <Chips
            columns={2}
            options={[
              { value: 'single' as const, label: t('single') },
              { value: 'double' as const, label: t('double') },
            ]}
            value={settings.sides}
            onSelect={(v) => set('sides', v)}
          />
        </Field>
      </div>

      <Field label={t('scaling')}>
        <Chips
          columns={3}
          options={[
            { value: 'actual' as const, label: t('actual') },
            { value: 'fit' as const, label: t('fit') },
            { value: 'fill' as const, label: t('fill') },
          ]}
          value={settings.scaling}
          onSelect={(v) => set('scaling', v)}
        />
      </Field>

      <Field label={t('pagesPerSheet')}>
        <Chips
          options={[1, 2, 4, 6, 9].map((n) => ({ value: n as 1 | 2 | 4 | 6 | 9, label: String(n) }))}
          value={settings.pagesPerSheet}
          onSelect={(v) => set('pagesPerSheet', v)}
        />
      </Field>

      {pdfFiles.length > 0 && (
        <Field label={t('pageRange')}>
          <div className="space-y-2">
            {pdfFiles.map((f) => {
              const range = (pageRanges[f.id] || '').trim();
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-slate-200"
                >
                  <FileText className="h-5 w-5 shrink-0 text-rose-500" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
                    {f.originalName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerFor(f)}
                    className="btn btn-secondary !px-3 !py-1.5 text-xs"
                  >
                    {range ? range : t('pageRangeAll')}
                  </button>
                </div>
              );
            })}
          </div>
        </Field>
      )}

      <div className="sticky bottom-0 -mx-4 mt-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:rounded-2xl">
        {est.invalidRange ? (
          <p className="text-center text-sm font-semibold text-rose-600">
            {t('pageRangeInvalid')} — {est.invalidRange}
          </p>
        ) : (
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">
              {pagesLabel ? pagesLabel(est.pages) : `${est.pages} pages`} · {est.sheets} × {settings.copies}
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-slate-400">{t('estimated')}</p>
              <p className="text-xl font-extrabold text-slate-800">{money(est.price)}</p>
            </div>
          </div>
        )}
      </div>

      {pickerFor && (
        <PdfPagePicker
          file={pickerFor}
          initialRange={pageRanges[pickerFor.id] || ''}
          onConfirm={(range) => {
            onPageRange(pickerFor.id, range);
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}
