import { z } from 'zod';
import { PrintJob, type PrintJobDoc } from '../models/PrintJob';
import { PrintRequest } from '../models/PrintRequest';
import { Printer } from '../models/Printer';
import { Shop } from '../models/Shop';
import { HttpError, asyncHandler } from '../utils/errors';
import { storage } from '../services/storage.service';
import {
  createJobsForRequest,
  pauseJob,
  resumeJob,
  cancelJob,
  retryJob,
  moveJob,
} from '../services/jobRunner.service';
import { authenticateAdmin, type AuthedRequest } from '../middleware/auth';
import type { PrintSettings } from '../types/print';

const settingsOverrideSchema = z.object({
  paper: z.enum(['a4', 'a3', 'a5', 'letter', 'legal', '4x6', 'custom']).optional(),
  color: z.enum(['color', 'bw']).optional(),
  copies: z.number().int().min(1).max(99).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  sides: z.enum(['single', 'double']).optional(),
  scaling: z.enum(['actual', 'fit', 'fill']).optional(),
  pagesPerSheet: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(9)]).optional(),
});

const createSchema = z.object({
  requestId: z.string().regex(/^[a-f\d]{24}$/i),
  printerId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  settings: settingsOverrideSchema.optional(),
});

export const createPrintJobs = asyncHandler(async (req: AuthedRequest, res) => {
  const body = createSchema.parse(req.body);
  const request = await PrintRequest.findOne({ _id: body.requestId, shopId: req.shop!._id });
  if (!request) throw new HttpError(404, 'NOT_FOUND', 'Print request not found');
  if (['rejected', 'cancelled'].includes(request.status)) {
    throw new HttpError(400, 'REQUEST_CLOSED', `Request is ${request.status}`);
  }

  const printer =
    (body.printerId
      ? await Printer.findOne({ _id: body.printerId, shopId: req.shop!._id })
      : null) ??
    (await Printer.findOne({ _id: req.shop!.settings.defaultPrinterId })) ??
    (await Printer.findOne({ shopId: req.shop!._id, isDefault: true }));
  if (!printer) throw new HttpError(400, 'NO_PRINTER', 'No printer selected and no default printer configured');

  const settings: PrintSettings = { ...request.settings, ...(body.settings ?? {}) };
  const jobs = await createJobsForRequest(request, printer, settings);
  res.status(201).json({ jobs: jobs.map((j) => j.toPublic()) });
});

export const listPrintJobs = asyncHandler(async (req: AuthedRequest, res) => {
  const shopId = req.shop!._id;
  const active = await PrintJob.find({
    shopId,
    status: { $in: ['queued', 'assigned', 'printing', 'paused'] },
  }).sort({ position: 1 });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await PrintJob.find({
    shopId,
    status: { $in: ['completed', 'failed', 'cancelled'] },
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({ active: active.map((j) => j.toPublic()), recent: recent.map((j) => j.toPublic()) });
});

async function getJobForAdmin(req: AuthedRequest): Promise<PrintJobDoc> {
  const job = await PrintJob.findOne({ _id: req.params.id, shopId: req.shop!._id });
  if (!job) throw new HttpError(404, 'NOT_FOUND', 'Print job not found');
  return job;
}

export const jobAction = asyncHandler(async (req: AuthedRequest, res) => {
  const job = await getJobForAdmin(req);
  const action = req.params.action;

  if (action === 'move') {
    const { direction } = z.object({ direction: z.enum(['up', 'down']) }).parse(req.body);
    await moveJob(job, direction);
  } else if (action === 'pause') {
    await pauseJob(job);
  } else if (action === 'resume') {
    await resumeJob(job);
  } else if (action === 'cancel') {
    await cancelJob(job);
  } else if (action === 'retry') {
    await retryJob(job);
  } else {
    throw new HttpError(400, 'BAD_ACTION', 'Unknown job action');
  }
  const fresh = (await PrintJob.findById(job._id))!;
  res.json({ job: fresh.toPublic() });
});

/**
 * Print-ready PDF: consumed by the print agent (x-agent-token) and by the admin
 * dashboard for the "browser print" fallback.
 */
export const getJobFile = asyncHandler(async (req: AuthedRequest, res) => {
  const agentToken = req.headers['x-agent-token'];

  if (typeof agentToken === 'string' && agentToken) {
    const shop = await Shop.findOne({ agentToken });
    if (!shop) throw new HttpError(401, 'AGENT_UNAUTHORIZED', 'Invalid agent token');
    const job = await PrintJob.findOne({ _id: req.params.id, shopId: shop._id });
    if (!job) throw new HttpError(404, 'NOT_FOUND', 'Print job not found');
    return sendJobPdf(res, job);
  }

  const { user } = await authenticateAdmin(req);
  const job = await PrintJob.findOne({ _id: req.params.id, shopId: user.shopId });
  if (!job) throw new HttpError(404, 'NOT_FOUND', 'Print job not found');
  return sendJobPdf(res, job);
});

function sendJobPdf(res: import('express').Response, job: PrintJobDoc): void {
  const buf = storage.get(job.storageKey);
  void buf.then((data) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${job.code}.pdf"`);
    res.send(data);
  });
}
