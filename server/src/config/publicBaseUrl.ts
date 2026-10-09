import { isIP } from 'node:net';

export const PRODUCTION_PUBLIC_BASE_URL = 'https://mahendrabaghe.github.io/qigital_print_qrr';

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.lan') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  if (isIP(host) === 4) {
    const [first, second] = host.split('.').map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127) ||
      first >= 224
    );
  }

  if (isIP(host) === 6) {
    return (
      host === '::' ||
      host === '::1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      /^fe[89ab]/.test(host)
    );
  }

  return false;
}

export function resolvePublicBaseUrl(value: string | undefined, isProduction: boolean): string {
  const configured = value?.trim().replace(/\/+$/, '');
  if (!isProduction) return configured || 'http://localhost:5173';
  if (!configured) return PRODUCTION_PUBLIC_BASE_URL;

  try {
    const parsed = new URL(configured);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      isLocalHostname(parsed.hostname)
    ) {
      throw new Error('The URL is not publicly reachable');
    }
    return configured;
  } catch {
    console.warn(
      `[config] PUBLIC_BASE_URL "${configured}" is not a public URL; using ${PRODUCTION_PUBLIC_BASE_URL} for QR codes.`
    );
    return PRODUCTION_PUBLIC_BASE_URL;
  }
}
