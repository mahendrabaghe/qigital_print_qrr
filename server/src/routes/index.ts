import { Router, type Request, type Response } from 'express';
import { requireAdmin, requireAgent, requireSession } from '../middleware/auth';
import { loginLimiter, scanLimiter, uploadLimiter, generalLimiter } from '../middleware/rateLimiters';
import * as auth from '../controllers/auth.controller';
import * as shop from '../controllers/shop.controller';
import * as qr from '../controllers/qr.controller';
import * as session from '../controllers/session.controller';
import * as file from '../controllers/file.controller';
import * as printRequest from '../controllers/printRequest.controller';
import * as printJob from '../controllers/printJob.controller';
import * as printer from '../controllers/printer.controller';
import * as analytics from '../controllers/analytics.controller';
import * as agent from '../controllers/agent.controller';

export const api = Router();

api.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, uptime: process.uptime() });
});

/* ---------------- auth ---------------- */
api.post('/auth/login', loginLimiter, auth.login);
api.get('/auth/me', requireAdmin, auth.me);
api.post('/auth/change-password', requireAdmin, auth.changePassword);

/* ---------------- shop settings ---------------- */
api.get('/shop', requireAdmin, shop.getShop);
api.put('/shop', requireAdmin, shop.updateShop);

/* ---------------- QR terminals ---------------- */
api.post('/qr', requireAdmin, qr.generateQr);
api.get('/qr', requireAdmin, qr.listQr);
api.put('/qr/:id', requireAdmin, qr.updateQr);
api.post('/qr/:id/regenerate', requireAdmin, qr.regenerateQr);
api.delete('/qr/:id', requireAdmin, qr.deleteQr);

/* ---------------- customer sessions (public) ---------------- */
api.post('/session/scan/:terminalCode', scanLimiter, session.scanTerminal);
api.get('/session/:code', generalLimiter, session.getSession);

/* ---------------- files ---------------- */
api.post('/files/upload', uploadLimiter, ...file.uploadFile);
api.get('/files/:id/meta', file.getFileMeta);
api.get('/files/:id/content', file.getFileContent);
api.patch('/files/:id', requireAdmin, file.patchFile);
api.delete('/files/:id', file.deleteFile);

/* ---------------- print requests ---------------- */
api.post('/requests', requireSession, printRequest.createPrintRequest);
api.get('/requests', requireAdmin, printRequest.listPrintRequests);
api.get('/requests/:id', printRequest.getPrintRequest);
api.patch('/requests/:id/status', requireAdmin, printRequest.updatePrintRequestStatus);
api.get('/requests/:id/receipt', printRequest.getReceipt);

/* ---------------- print jobs & queue ---------------- */
api.post('/jobs', requireAdmin, printJob.createPrintJobs);
api.get('/jobs', requireAdmin, printJob.listPrintJobs);
api.get('/jobs/:id/file', printJob.getJobFile);
api.post('/jobs/:id/:action', requireAdmin, printJob.jobAction);

/* ---------------- printers ---------------- */
api.get('/printers', requireAdmin, printer.listPrinters);
api.post('/printers', requireAdmin, printer.createPrinter);
api.patch('/printers/:id', requireAdmin, printer.updatePrinter);
api.delete('/printers/:id', requireAdmin, printer.deletePrinter);

/* ---------------- analytics ---------------- */
api.get('/analytics/summary', requireAdmin, analytics.analyticsSummary);
api.get('/analytics/daily', requireAdmin, analytics.analyticsDaily);

/* ---------------- local print agent ---------------- */
api.get('/agent/health', requireAgent, agent.agentHealth);
api.post('/agent/printers', requireAgent, agent.reportPrinters);
api.post('/agent/poll', requireAgent, agent.pollJobs);
api.post('/agent/jobs/:id/status', requireAgent, agent.reportJobStatus);
api.get('/agent/jobs/:id/file', printJob.getJobFile);
