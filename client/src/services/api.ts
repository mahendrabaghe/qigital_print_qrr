import axios, { type AxiosError } from 'axios';

export const API_URL = (import.meta.env.VITE_API_URL as string) || '';

export const http = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

/* ---------- admin JWT ---------- */

const ADMIN_TOKEN_KEY = 'ps_admin_token';

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

/* ---------- customer session capability ---------- */

const SESSION_KEY = 'ps_session_code';

export function getSessionCode(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setSessionCode(code: string): void {
  localStorage.setItem(SESSION_KEY, code);
}

export function clearSessionCode(): void {
  localStorage.removeItem(SESSION_KEY);
}

http.interceptors.request.use((config) => {
  const admin = getAdminToken();
  if (admin) config.headers.Authorization = `Bearer ${admin}`;
  const session = getSessionCode();
  if (session && !config.headers.Authorization) config.headers['x-session-id'] = session;
  return config;
});

/* ---------- typed error extraction ---------- */

export interface ApiError {
  status: number;
  code: string;
  message: string;
}

export function apiError(err: unknown): ApiError {
  const ax = err as AxiosError<{ error?: { code?: string; message?: string } }>;
  return {
    status: ax?.response?.status ?? 0,
    code: ax?.response?.data?.error?.code ?? 'NETWORK_ERROR',
    message:
      ax?.response?.data?.error?.message ??
      (axios.isAxiosError(err) && !ax.response
        ? 'Cannot reach the server. Check your connection.'
        : 'Something went wrong. Please try again.'),
  };
}

/* ---------- file preview URLs ---------- */

/** <img>/preview URL for customer-authenticated content (session in query). */
export function fileContentUrl(fileId: string, download = false): string {
  const session = getSessionCode();
  return `${API_URL}/api/files/${fileId}/content${download ? '?download=1' : ''}${
    session ? `${download ? '&' : '?'}sessionId=${encodeURIComponent(session)}` : ''
  }`;
}

export function fileContentAdminUrl(fileId: string, download = false): string {
  return `${API_URL}/api/files/${fileId}/content${download ? '?download=1' : ''}`;
}

/** Fetch file bytes with the current auth (admin JWT or session). */
export async function fetchFileBlob(fileId: string): Promise<Blob> {
  const res = await http.get(`/api/files/${fileId}/content`, { responseType: 'blob' });
  return res.data as Blob;
}
