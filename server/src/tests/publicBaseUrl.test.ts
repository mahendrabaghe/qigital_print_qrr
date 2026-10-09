import { describe, expect, it, vi } from 'vitest';
import {
  PRODUCTION_PUBLIC_BASE_URL,
  resolvePublicBaseUrl,
} from '../config/publicBaseUrl';

describe('resolvePublicBaseUrl', () => {
  it.each([
    'http://localhost:5173',
    'http://192.168.1.20:5173',
    'http://10.0.0.5:5173',
    'http://printer.local:5173',
  ])('uses the public site instead of local URL %s in production', (url) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolvePublicBaseUrl(url, true)).toBe(PRODUCTION_PUBLIC_BASE_URL);
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it('uses the public site by default in production', () => {
    expect(resolvePublicBaseUrl(undefined, true)).toBe(PRODUCTION_PUBLIC_BASE_URL);
  });

  it('preserves a configured public URL in production', () => {
    expect(resolvePublicBaseUrl('https://shop.example.com/', true)).toBe(
      'https://shop.example.com'
    );
  });

  it('keeps local URLs available during development', () => {
    expect(resolvePublicBaseUrl('http://192.168.1.20:5173/', false)).toBe(
      'http://192.168.1.20:5173'
    );
  });
});
