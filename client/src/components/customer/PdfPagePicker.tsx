import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { pdfjsLib } from '../../services/pdf';
import { fileContentUrl } from '../../services/api';
import { useI18n } from '../../i18n';
import { Modal } from '../ui/Modal';
import type { FileMeta } from '../../types';

function selectedToRange(pages: number[]): string {
  const parts: string[] = [];
  let start = pages[0];
  let prev = pages[0];
  for (let i = 1; i <= pages.length; i++) {
    const p = pages[i];
    if (p !== prev + 1) {
      parts.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = p;
    }
    if (p !== undefined) prev = p;
  }
  return parts.join(',');
}

export default function PdfPagePicker({
  file,
  initialRange,
  onConfirm,
  onClose,
}: {
  file: FileMeta;
  initialRange: string;
  onConfirm: (range: string) => void;
  onClose: () => void;
}) {
  const { t, tFn } = useI18n();
  const [thumbs, setThumbs] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const renderedRef = useRef(false);

  const totalPages = file.pages || 1;

  const initialSelected = useMemo(() => {
    const s = new Set<number>();
    if (!initialRange.trim()) {
      for (let p = 1; p <= totalPages; p++) s.add(p);
    } else {
      for (const part of initialRange.split(',')) {
        const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part.trim());
        if (!m) continue;
        const a = parseInt(m[1], 10);
        const b = m[2] ? parseInt(m[2], 10) : a;
        for (let p = a; p <= b && p <= totalPages; p++) if (p >= 1) s.add(p);
      }
    }
    return s;
  }, [initialRange, totalPages]);

  useEffect(() => {
    setSelected(initialSelected);
  }, [initialSelected]);

  useEffect(() => {
    if (renderedRef.current) return;
    renderedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const doc = await pdfjsLib.getDocument({ url: fileContentUrl(file.id) }).promise;
        const count = Math.min(doc.numPages, 60);
        const out: (string | null)[] = new Array(count).fill(null);
        setThumbs(out);
        for (let p = 1; p <= count; p++) {
          if (cancelled) return;
          const page = await doc.getPage(p);
          const baseWidth = 130;
          const vp = page.getViewport({ scale: 1 });
          const scale = baseWidth / vp.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          out[p - 1] = canvas.toDataURL('image/jpeg', 0.75);
          setThumbs([...out]);
        }
      } catch {
        if (!cancelled) setError(t('error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.id, t]);

  const toggle = (p: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const confirm = () => {
    const pages = [...selected].sort((a, b) => a - b);
    if (!pages.length) return;
    const allSelected = pages.length === totalPages;
    onConfirm(allSelected ? '' : selectedToRange(pages));
  };

  const pagesLabel = tFn('pagesCount');

  return (
    <Modal open wide onClose={onClose} title={file.originalName}>
      <div className="px-4 py-3">
        {error ? (
          <p className="py-8 text-center text-sm text-rose-600">{error}</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-500">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
                </span>
              ) : (
                `${t('pageRangeAll')}: ${totalPages}`
              )}
            </p>
            <div className="grid max-h-[52vh] grid-cols-3 gap-2 overflow-y-auto pb-2 sm:grid-cols-5 md:grid-cols-6">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const on = selected.has(p);
                const thumb = thumbs[p - 1];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggle(p)}
                    className={`relative overflow-hidden rounded-lg ring-2 transition ${
                      on ? 'ring-brand-600' : 'ring-slate-200 hover:ring-slate-300'
                    }`}
                  >
                    <div className="flex aspect-[3/4] items-center justify-center bg-slate-100">
                      {thumb ? (
                        <img src={thumb} alt={`page ${p}`} className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-xs text-slate-400">…</span>
                      )}
                    </div>
                    <span
                      className={`absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        on ? 'bg-brand-600 text-white' : 'bg-white/90 text-slate-500'
                      }`}
                    >
                      {p}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
        <span className="text-sm font-medium text-slate-500">
          {pagesLabel ? pagesLabel(selected.size) : `${selected.size} pages`}
        </span>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={!selected.size}>
            {t('done')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
