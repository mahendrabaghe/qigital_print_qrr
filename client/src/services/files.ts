import { http } from './api';
import type { FileMeta } from '../types';

export const ACCEPTED_TYPES = 'application/pdf,image/jpeg,image/png,image/webp';
export const ACCEPTED_EXTS = '.pdf,.jpg,.jpeg,.png,.webp';

/** pdf-lib (print pipeline) cannot embed WebP — convert to JPEG before upload. */
async function convertWebpToJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('WebP conversion failed');
  const base = file.name.replace(/\.webp$/i, '');
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

export async function normalizeForUpload(file: File): Promise<File> {
  if (file.type === 'image/webp' || /\.webp$/i.test(file.name)) {
    return convertWebpToJpeg(file);
  }
  return file;
}

export interface UploadResult {
  file: FileMeta;
  edited: boolean;
}

export async function uploadFile(
  file: File,
  opts: {
    onProgress?: (percent: number) => void;
    replaceFileId?: string;
  } = {}
): Promise<UploadResult> {
  const normalized = await normalizeForUpload(file);
  const form = new FormData();
  form.append('file', normalized);
  if (opts.replaceFileId) form.append('replaceFileId', opts.replaceFileId);

  const res = await http.post('/api/files/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (opts.onProgress && e.total) opts.onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  const meta: FileMeta = res.data.file;
  return { file: meta, edited: res.status === 200 && !!opts.replaceFileId };
}

/** Camera capture: stop all tracks of the returned stream when done. */
export async function openCamera(facing: 'environment' | 'user' = 'environment'): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 } },
    audio: false,
  });
}

export async function grabFrame(video: HTMLVideoElement): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
  if (!blob) throw new Error('Could not capture photo');
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return new File([blob], `photo-${stamp}.jpg`, { type: 'image/jpeg' });
}
