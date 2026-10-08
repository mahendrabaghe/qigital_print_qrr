import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { Crop, FlipHorizontal, FlipVertical, Loader2, Redo2, RotateCcw, RotateCw, ScanText, Undo2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Modal } from '../ui/Modal';

/* ---------------- adjustments ---------------- */

export interface Adjustments {
  brightness: number; // 0.3 – 1.8 (multiplier)
  contrast: number; // 0.5 – 1.8 (multiplier)
  saturate: number; // 0 – 2 (multiplier)
  bw: boolean;
}

const DEFAULT_ADJ: Adjustments = { brightness: 1, contrast: 1, saturate: 1, bw: false };

type FilterKey = 'original' | 'auto' | 'bwDoc' | 'bright' | 'contrasty';

const FILTERS: { key: FilterKey; adj: Adjustments }[] = [
  { key: 'original', adj: { ...DEFAULT_ADJ } },
  { key: 'auto', adj: { brightness: 1.06, contrast: 1.12, saturate: 1.08, bw: false } },
  { key: 'bwDoc', adj: { brightness: 1.12, contrast: 1.45, saturate: 1, bw: true } },
  { key: 'bright', adj: { brightness: 1.3, contrast: 1.05, saturate: 1.02, bw: false } },
  { key: 'contrasty', adj: { brightness: 1, contrast: 1.35, saturate: 1.05, bw: false } },
];

function cssFilter(adj: Adjustments): string {
  return `brightness(${adj.brightness}) contrast(${adj.contrast}) saturate(${adj.saturate})${adj.bw ? ' grayscale(1)' : ''}`;
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function applyAdjustments(ctx: CanvasRenderingContext2D, w: number, h: number, adj: Adjustments): void {
  if (adj.brightness === 1 && adj.contrast === 1 && adj.saturate === 1 && !adj.bw) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * adj.brightness;
    let g = d[i + 1] * adj.brightness;
    let b = d[i + 2] * adj.brightness;
    r = (r - 128) * adj.contrast + 128;
    g = (g - 128) * adj.contrast + 128;
    b = (b - 128) * adj.contrast + 128;
    if (adj.saturate !== 1) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum + (r - lum) * adj.saturate;
      g = lum + (g - lum) * adj.saturate;
      b = lum + (b - lum) * adj.saturate;
    }
    if (adj.bw) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = g = b = lum;
    }
    d[i] = clamp255(r);
    d[i + 1] = clamp255(g);
    d[i + 2] = clamp255(b);
  }
  ctx.putImageData(img, 0, 0);
}

/* ---------------- perspective correction (scan mode) ---------------- */

interface Pt {
  x: number;
  y: number;
}

/** Solve the 3x3 homography (row-major, h[8]=1) mapping src quad -> dst quad. */
function solveHomography(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    const p = A[col][col] || 1e-10;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / p;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const h = new Array<number>(9).fill(0);
  for (let i = 0; i < 8; i++) h[i] = b[i] / (A[i][i] || 1e-10);
  h[8] = 1;
  return h;
}

function invert3(h: number[]): number[] {
  const [a, b, c, d, e, f, g, i, j] = h;
  const A = e * j - f * i;
  const B = c * i - b * j;
  const C = b * f - c * e;
  const D = f * g - d * j;
  const E = a * j - c * g;
  const F = c * d - a * f;
  const G = d * i - e * g;
  const H = b * g - a * i;
  const I = a * e - b * d;
  const det = a * A + b * D + c * G || 1e-10;
  return [A / det, B / det, C / det, D / det, E / det, F / det, G / det, H / det, I / det];
}

function bilinear(src: ImageData, x: number, y: number, out: number[]): void {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx: number, yy: number) => {
    const cx = xx < 0 ? 0 : xx >= src.width ? src.width - 1 : xx;
    const cy = yy < 0 ? 0 : yy >= src.height ? src.height - 1 : yy;
    return (cy * src.width + cx) * 4;
  };
  const p00 = at(x0, y0);
  const p10 = at(x0 + 1, y0);
  const p01 = at(x0, y0 + 1);
  const p11 = at(x0 + 1, y0 + 1);
  for (let c = 0; c < 3; c++) {
    const top = src.data[p00 + c] * (1 - fx) + src.data[p10 + c] * fx;
    const bot = src.data[p01 + c] * (1 - fx) + src.data[p11 + c] * fx;
    out[c] = top * (1 - fy) + bot * fy;
  }
}

/** Warp the src quad (image pixel coords, order TL TR BR BL) into an upright rectangle. */
function warpQuad(srcCanvas: HTMLCanvasElement, quad: Pt[]): HTMLCanvasElement {
  const srcCtx = srcCanvas.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

  const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
  const outW = Math.max(32, Math.round((dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2));
  const outH = Math.max(32, Math.round((dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext('2d')!;
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, outW, outH);

  const H = solveHomography(quad, [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ]);
  const Hi = invert3(H);

  const img = outCtx.createImageData(outW, outH);
  const px = [0, 0, 0];
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const w = Hi[6] * u + Hi[7] * v + Hi[8];
      const sx = (Hi[0] * u + Hi[1] * v + Hi[2]) / w;
      const sy = (Hi[3] * u + Hi[4] * v + Hi[5]) / w;
      bilinear(srcData, sx, sy, px);
      const o = (v * outW + u) * 4;
      img.data[o] = clamp255(px[0]);
      img.data[o + 1] = clamp255(px[1]);
      img.data[o + 2] = clamp255(px[2]);
      img.data[o + 3] = 255;
    }
  }
  outCtx.putImageData(img, 0, 0);
  return out;
}

/* ---------------- component ---------------- */

const DEFAULT_CORNERS: Pt[] = [
  { x: 0.08, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 },
  { x: 0.08, y: 0.92 },
];

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))),
      'image/jpeg',
      0.95
    );
  });
}

export default function ImageEditor({
  src,
  fileName,
  onSave,
  onClose,
}: {
  src: string;
  fileName: string;
  /** Resolve with the edited JPEG; reject to keep the editor open. */
  onSave: (blob: Blob) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'crop' | 'scan'>('crop');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ratio, setRatio] = useState<number>(0); // 0 = free

  const [adj, setAdj] = useState<Adjustments>({ ...DEFAULT_ADJ });
  const [past, setPast] = useState<Adjustments[]>([]);
  const [future, setFuture] = useState<Adjustments[]>([]);
  const adjRef = useRef(adj);
  adjRef.current = adj;
  const dragStartAdj = useRef<Adjustments | null>(null);

  const [corners, setCorners] = useState<Pt[]>(DEFAULT_CORNERS.map((c) => ({ ...c })));
  const cropWrapRef = useRef<HTMLDivElement | null>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const scanImgRef = useRef<HTMLImageElement | null>(null);
  const dragIdx = useRef(-1);

  const filter = cssFilter(adj);
  const activeFilter = useMemo(
    () => FILTERS.find((f) => JSON.stringify(f.adj) === JSON.stringify(adj))?.key ?? null,
    [adj]
  );

  /* cropper lifecycle */
  useEffect(() => {
    if (mode !== 'crop' || !ready || !cropWrapRef.current) return;
    const img = cropWrapRef.current.querySelector('img');
    if (!img) return;
    const cropper = new Cropper(img, {
      viewMode: 1,
      background: false,
      autoCropArea: 0.92,
      responsive: true,
      ready: () => setRatio((r) => r),
    });
    cropperRef.current = cropper;
    return () => {
      cropper.destroy();
      cropperRef.current = null;
    };
  }, [mode, ready]);

  /* live filter preview */
  useEffect(() => {
    if (mode === 'crop' && cropWrapRef.current) {
      const canvas = cropWrapRef.current.querySelector('canvas');
      if (canvas) (canvas as HTMLElement).style.filter = filter;
    }
  }, [filter, mode, ready]);

  const applyRatio = useCallback((r: number) => {
    setRatio(r);
    cropperRef.current?.setAspectRatio(r || NaN);
  }, []);

  const pushHistory = (prev: Adjustments) => {
    setPast((p) => [...p.slice(-19), prev]);
    setFuture([]);
  };

  const undo = () => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [adjRef.current, ...f]);
      setAdj(prev);
      return p.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setPast((p) => [...p, adjRef.current]);
      setAdj(next);
      return f.slice(1);
    });
  };

  const reset = () => {
    pushHistory(adjRef.current);
    setAdj({ ...DEFAULT_ADJ });
    setCorners(DEFAULT_CORNERS.map((c) => ({ ...c })));
    cropperRef.current?.reset();
  };

  const setAdjLive = (next: Adjustments) => setAdj(next);

  const onSliderStart = () => {
    dragStartAdj.current = adjRef.current;
  };
  const onSliderEnd = () => {
    if (dragStartAdj.current && dragStartAdj.current !== adjRef.current) {
      pushHistory(dragStartAdj.current);
    }
    dragStartAdj.current = null;
  };

  const applyFilter = (key: FilterKey) => {
    const f = FILTERS.find((x) => x.key === key);
    if (!f) return;
    pushHistory(adjRef.current);
    setAdj({ ...f.adj });
  };

  /* scan mode dragging */
  const onHandleDown = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragIdx.current = idx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (dragIdx.current < 0) return;
    const host = (e.currentTarget as HTMLElement).closest('.scan-host') as HTMLElement | null;
    const img = host?.querySelector('img');
    if (!host || !img) return;
    const rect = img.getBoundingClientRect();
    if (!rect.width) return;
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    setCorners((cs) =>
      cs.map((c, i) =>
        i === dragIdx.current
          ? { x: Math.min(0.98, Math.max(0.02, fx)), y: Math.min(0.98, Math.max(0.02, fy)) }
          : c
      )
    );
  };
  const onHandleUp = () => {
    dragIdx.current = -1;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let canvas: HTMLCanvasElement;
      if (mode === 'scan') {
        const img = scanImgRef.current;
        if (!img || !img.naturalWidth) throw new Error('Image not loaded');
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = img.naturalWidth;
        srcCanvas.height = img.naturalHeight;
        const sctx = srcCanvas.getContext('2d')!;
        sctx.drawImage(img, 0, 0);
        const quad = corners.map((c) => ({ x: c.x * srcCanvas.width, y: c.y * srcCanvas.height }));
        canvas = warpQuad(srcCanvas, quad);
      } else {
        const cropped = cropperRef.current?.getCroppedCanvas({
          maxWidth: 2600,
          maxHeight: 2600,
          fillColor: '#ffffff',
          imageSmoothingQuality: 'high',
        });
        if (!cropped) throw new Error('Crop failed');
        canvas = cropped;
      }
      const ctx = canvas.getContext('2d')!;
      applyAdjustments(ctx, canvas.width, canvas.height, adj);
      const blob = await canvasToJpeg(canvas);
      await onSave(blob);
    } catch (err) {
      setSaving(false);
      throw err;
    }
  };

  const ratios: { label: string; value: number }[] = [
    { label: t('ratioFree'), value: 0 },
    { label: t('ratioSquare'), value: 1 },
    { label: t('ratioA4'), value: 1 / 1.4142 },
    { label: t('ratio3_4'), value: 3 / 4 },
    { label: t('ratio4_3'), value: 4 / 3 },
  ];

  const sliders: { key: keyof Adjustments; label: string; min: number; max: number }[] = [
    { key: 'brightness', label: t('brightness'), min: 0.3, max: 1.8 },
    { key: 'contrast', label: t('contrast'), min: 0.5, max: 1.8 },
    { key: 'saturate', label: t('saturation'), min: 0, max: 2 },
  ];

  return (
    <Modal open wide onClose={onClose} title={`${t('editorTitle')} — ${fileName}`}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 px-4 py-2">
        <button
          type="button"
          onClick={() => setMode(mode === 'crop' ? 'scan' : 'crop')}
          className={`btn ${mode === 'scan' ? 'btn-primary' : 'btn-secondary'} !px-3 !py-1.5 text-xs`}
        >
          <ScanText className="h-4 w-4" /> {t('scanMode')}
        </button>
        {mode === 'crop' && (
          <div className="flex flex-wrap items-center gap-1.5">
            {ratios.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => applyRatio(r.value)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 transition ${
                  ratio === r.value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {r.label}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <button type="button" className="btn btn-ghost !p-2" onClick={() => cropperRef.current?.rotate(-90)} aria-label={t('rotate')} title={t('rotate')}>
              <RotateCcw className="h-4 w-4" />
            </button>
            <button type="button" className="btn btn-ghost !p-2" onClick={() => cropperRef.current?.rotate(90)} aria-label={t('rotate')} title={t('rotate')}>
              <RotateCw className="h-4 w-4" />
            </button>
            <button type="button" className="btn btn-ghost !p-2" onClick={() => cropperRef.current?.scaleX(-1)} aria-label={t('flipH')} title={t('flipH')}>
              <FlipHorizontal className="h-4 w-4" />
            </button>
            <button type="button" className="btn btn-ghost !p-2" onClick={() => cropperRef.current?.scaleY(-1)} aria-label={t('flipV')} title={t('flipV')}>
              <FlipVertical className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="btn btn-ghost !p-2" onClick={undo} disabled={!past.length} aria-label={t('undo')} title={t('undo')}>
            <Undo2 className="h-4 w-4" />
          </button>
          <button type="button" className="btn btn-ghost !p-2" onClick={redo} disabled={!future.length} aria-label={t('redo')} title={t('redo')}>
            <Redo2 className="h-4 w-4" />
          </button>
          <button type="button" className="btn btn-ghost !px-2.5 !py-1.5 text-xs" onClick={reset}>
            {t('resetEdit')}
          </button>
        </div>
      </div>

      <div className="relative max-h-[46vh] overflow-hidden bg-slate-900">
        {mode === 'crop' ? (
          <div ref={cropWrapRef} className="mx-auto max-h-[46vh]">
            <img
              src={src}
              alt={fileName}
              crossOrigin="anonymous"
              className="block max-h-[46vh] w-auto"
              onLoad={() => setReady(true)}
            />
          </div>
        ) : (
          <div className="scan-host relative mx-auto inline-block">
            <img
              ref={scanImgRef}
              src={src}
              alt={fileName}
              crossOrigin="anonymous"
              className="block max-h-[46vh] w-auto"
              style={{ filter }}
              onLoad={() => setReady(true)}
            />
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <polygon
                points={corners.map((c) => `${c.x * 100}%,${c.y * 100}%`).join(' ')}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
            </svg>
            {corners.map((c, i) => (
              <button
                key={i}
                type="button"
                onPointerDown={onHandleDown(i)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                className="absolute z-10 h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-[3px] border-sky-400 bg-white/85 shadow-md active:cursor-grabbing"
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
                aria-label={`corner ${i + 1}`}
              />
            ))}
          </div>
        )}
        {mode === 'scan' && (
          <p className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-1.5 text-center text-xs text-white">
            {t('scanHint')}
          </p>
        )}
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => applyFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                activeFilter === f.key ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {f.key === 'original' ? <Crop className="mr-1 inline h-3.5 w-3.5" /> : null}
              {t(f.key)}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {sliders.map((s) => (
            <label key={s.key} className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
                {s.label}
                <span className="tabular-nums text-slate-400">{Number(adj[s.key]).toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={0.01}
                value={adj[s.key] as number}
                onPointerDown={onSliderStart}
                onPointerUp={onSliderEnd}
                onChange={(e) =>
                  setAdjLive({ ...adjRef.current, [s.key]: Number(e.target.value) })
                }
                className="w-full accent-brand-600"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
          {t('cancel')}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || !ready}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('applyEdit')}
        </button>
      </div>
    </Modal>
  );
}
