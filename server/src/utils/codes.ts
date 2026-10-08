import crypto from 'crypto';

// Unambiguous alphabet (no 0/O, 1/I/L... L kept out too)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function genTerminalCode(): string {
  return randomCode(8);
}

export function genSessionCode(): string {
  return randomCode(12);
}

export function genAccessToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function genAgentToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}
