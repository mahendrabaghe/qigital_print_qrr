import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCcw, X } from 'lucide-react';
import { openCamera, grabFrame } from '../../services/files';
import { useI18n } from '../../i18n';

export default function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await openCamera(facing);
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        if (!cancelled) setError(t('cameraError'));
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, [facing, t]);

  const capture = async () => {
    if (!videoRef.current || !videoRef.current.videoWidth) return;
    try {
      const file = await grabFrame(videoRef.current);
      onCapture(file);
    } catch {
      setError(t('cameraError'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="text-sm font-medium">{error || t('uploadHint')}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/10 p-2 hover:bg-white/20"
          aria-label={t('cameraClose')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <p className="rounded-xl bg-white/95 px-4 py-3 text-center text-sm font-medium text-slate-700">{error}</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-8 p-6">
        <button
          type="button"
          onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          className="rounded-full bg-white/10 p-4 text-white hover:bg-white/20"
          aria-label={t('cameraSwitch')}
        >
          <RefreshCcw className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={capture}
          disabled={!!error}
          className="rounded-full bg-brand-600 p-6 text-white shadow-lg shadow-brand-600/40 transition hover:bg-brand-700 active:scale-95 disabled:opacity-40"
          aria-label={t('cameraCapture')}
        >
          <Camera className="h-8 w-8" />
        </button>
        <div className="w-14" />
      </div>
    </div>
  );
}
