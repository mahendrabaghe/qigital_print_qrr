import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import supertest from 'supertest';
import type { Express } from 'express';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../app';
import { connectDatabase, disconnectDatabase } from '../db/connect';
import { seed } from '../services/seed.service';
import { initSockets } from '../sockets';
import { env } from '../config/env';

const PNG_1PX = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000d49444154789c6260010000000500010d0a2db4' +
    '0000000049454e44ae426082',
  'hex'
);

async function threePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage([595.28, 841.89]);
  return Buffer.from(await doc.save());
}

let app: Express;
let server: http.Server;
let request: ReturnType<typeof supertest>;

let adminToken = '';
let terminalCode = '';
let sessionCode = '';
let pngFileId = '';
let pdfFileId = '';
let requestId = '';
let accessToken = '';

beforeAll(async () => {
  await connectDatabase();
  await seed();
  app = createApp();
  server = http.createServer(app);
  initSockets(server);
  request = supertest(server);
});

afterAll(async () => {
  await disconnectDatabase();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function waitForStatus(path: string, header: Record<string, string>, status: string, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const res = await request.get(path).set(header);
    last = res.body?.request?.status ?? '';
    if (last === status) return res.body.request;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for status "${status}" (last: "${last}")`);
}

describe('golden path: seed → login → QR → scan → upload → request → demo print → receipt', () => {
  it('rejects unauthenticated admin access', async () => {
    const res = await request.get('/api/requests');
    expect(res.status).toBe(401);
  });

  it('rejects wrong credentials', async () => {
    const res = await request.post('/api/auth/login').send({ email: env.adminEmail, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('logs the seeded admin in', async () => {
    const res = await request.post('/api/auth/login').send({ email: env.adminEmail, password: env.adminPassword });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    adminToken = res.body.token;
  });

  it('generates a QR terminal', async () => {
    const res = await request
      .post('/api/qr')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Counter 1' });
    expect(res.status).toBe(201);
    expect(res.body.terminal.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    terminalCode = res.body.terminal.code;
  });

  it('rejects an invalid QR scan', async () => {
    const res = await request.post('/api/session/scan/XXXXXXXX');
    expect(res.status).toBe(404);
  });

  it('scans the QR and creates a customer session', async () => {
    const res = await request.post(`/api/session/scan/${terminalCode}`);
    expect(res.status).toBe(201);
    sessionCode = res.body.session.code;
    expect(res.body.shop.settings.maxFileSizeMb).toBeGreaterThan(0);
  });

  it('uploads a PNG with the session capability', async () => {
    const res = await request
      .post('/api/files/upload')
      .set('x-session-id', sessionCode)
      .attach('file', PNG_1PX, 'photo.png');
    expect(res.status).toBe(201);
    expect(res.body.file.kind).toBe('image');
    expect(res.body.file.pages).toBe(1);
    pngFileId = res.body.file.id;
  });

  it('uploads a 3-page PDF', async () => {
    const pdf = await threePagePdf();
    const res = await request
      .post('/api/files/upload')
      .set('x-session-id', sessionCode)
      .attach('file', pdf, 'notes.pdf');
    expect(res.status).toBe(201);
    expect(res.body.file.pages).toBe(3);
    pdfFileId = res.body.file.id;
  });

  it('rejects uploads without a session', async () => {
    const res = await request.post('/api/files/upload').attach('file', PNG_1PX, 'x.png');
    expect(res.status).toBe(401);
  });

  it('rejects executables disguised as images', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 0)]);
    const res = await request
      .post('/api/files/upload')
      .set('x-session-id', sessionCode)
      .attach('file', exe, 'virus.png');
    expect(res.status).toBe(400);
  });

  it('serves file content only to the owning session', async () => {
    const ok = await request.get(`/api/files/${pngFileId}/content`).set('x-session-id', sessionCode);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toBe('image/png');

    const nope = await request.get(`/api/files/${pngFileId}/content`).set('x-session-id', 'WRONGSESSION1');
    expect(nope.status).toBe(403);
  });

  it('creates a print request with page ranges and a price estimate', async () => {
    const res = await request
      .post('/api/requests')
      .set('x-session-id', sessionCode)
      .send({
        files: [
          { fileId: pngFileId },
          { fileId: pdfFileId, pageRange: '1-2' },
        ],
        settings: {
          paper: 'a4',
          color: 'bw',
          copies: 1,
          orientation: 'portrait',
          sides: 'single',
          scaling: 'fit',
          pagesPerSheet: 1,
        },
      });
    expect(res.status).toBe(201);
    const r = res.body.request;
    expect(r.code).toMatch(/^PRT-\d+$/);
    expect(r.files).toHaveLength(2);
    expect(r.estPages).toBe(3); // 1 image + 2 selected pdf pages
    expect(r.estSheets).toBe(3);
    expect(r.estPrice).toBe(6); // 3 sheets × Rs.2 (a4:bw)
    requestId = r.id;
    accessToken = r.accessToken;
  });

  it('rejects invalid page ranges', async () => {
    const res = await request
      .post('/api/requests')
      .set('x-session-id', sessionCode)
      .send({
        files: [{ fileId: pdfFileId, pageRange: '1-99' }],
        settings: {
          paper: 'a4', color: 'bw', copies: 1, orientation: 'portrait',
          sides: 'single', scaling: 'fit', pagesPerSheet: 1,
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PAGE_RANGE_INVALID');
  });

  it('creates demo print jobs and drives them to completion', async () => {
    const res = await request
      .post('/api/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requestId });
    expect(res.status).toBe(201);
    expect(res.body.jobs).toHaveLength(2);

    const done = await waitForStatus(
      `/api/requests/${requestId}?token=${accessToken}`,
      {},
      'completed'
    );
    expect(done.finalPrice).toBe(6);
  });

  it('generates a receipt PDF for the completed request', async () => {
    const res = await request.get(`/api/requests/${requestId}/receipt?token=${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('blocks the receipt for non-completed access without token', async () => {
    const res = await request.get(`/api/requests/${requestId}/receipt`);
    expect(res.status).toBe(404);
  });

  it('lists the request in admin history', async () => {
    const res = await request
      .get('/api/requests?search=PRT&status=completed')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('reports analytics with the completed request', async () => {
    const res = await request.get('/api/analytics/summary?days=7').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.requests.total).toBeGreaterThanOrEqual(1);
    expect(res.body.requests.completed).toBeGreaterThanOrEqual(1);
    expect(res.body.revenue).toBeGreaterThanOrEqual(6);
    expect(res.body.sheetsPrinted).toBeGreaterThanOrEqual(3);
  });

  it('exposes the shop settings (incl. agent token) to admins only', async () => {
    const ok = await request.get('/api/shop').set('Authorization', `Bearer ${adminToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body.shop.agentToken).toBeTruthy();

    const nope = await request.get('/api/shop');
    expect(nope.status).toBe(401);
  });
});
