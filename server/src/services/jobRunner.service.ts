import { env } from '../config/env';
import { File } from '../models/File';
import { PrintJob, type PrintJobDoc, type JobStatus } from '../models/PrintJob';
import { PrintRequest, type PrintRequestDoc } from '../models/PrintRequest';
import { Printer, type PrinterDoc } from '../models/Printer';
import { Shop } from '../models/Shop';
import { HttpError } from '../utils/errors';
import { logger } from '../utils/logger';
import { rateFor } from '../utils/pricing';
import { preparePrintFile } from './printPrep.service';
import { emitToAgents, emitToSession, emitToShop } from '../sockets/emit';
import crypto from 'crypto';
import type { PrintSettings } from '../types/print';
import type { Types } from 'mongoose';

async function nextPosition(shopId: string): Promise<number> {
  const last = await PrintJob.findOne({ shopId, status: { $in: ['queued', 'assigned', 'printing', 'paused'] } }).sort({ position: -1 });
  return (last?.position ?? 0) + 1;
}

function genJobCode(): string {
  return `JOB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function emitJob(job: PrintJobDoc, event?: string): Promise<void> {
  const payload = { job: job.toPublic() };
  emitToShop(job.shopId.toString(), 'job:updated', payload);
  if (event) emitToShop(job.shopId.toString(), event, payload);
}

async function setRequestStatus(request: PrintRequestDoc, status: PrintRequestDoc['status']): Promise<void> {
  if (request.status === status) return;
  if (['completed', 'rejected', 'cancelled'].includes(request.status)) return;
  request.status = status;
  if (status === 'completed') {
    request.completedAt = new Date();
    request.finalPrice = await computeFinalPrice(request);
  }
  await request.save();
  const payload = { request: request.toPublic() };
  emitToShop(request.shopId.toString(), 'request:statusChanged', payload);
  emitToSession(request.sessionCode, 'request:statusChanged', payload);
}

async function computeFinalPrice(request: PrintRequestDoc): Promise<number> {
  const shop = await Shop.findById(request.shopId);
  const pricing = (shop?.settings as unknown as { pricing?: Record<string, number> })?.pricing ?? {};
  const jobs = await PrintJob.find({ requestId: request._id, status: 'completed' });
  return jobs.reduce((sum, job) => {
    const rate = rateFor(pricing, job.settings.paper, job.settings.color);
    return sum + job.sheets * job.settings.copies * rate;
  }, 0);
}

async function maybeSetPrinting(requestId: Types.ObjectId): Promise<void> {
  await PrintRequest.updateOne({ _id: requestId, status: 'processing' }, { $set: { status: 'printing' } });
  const fresh = await PrintRequest.findById(requestId);
  if (fresh && fresh.status === 'printing') {
    const payload = { request: fresh.toPublic() };
    emitToShop(fresh.shopId.toString(), 'request:statusChanged', payload);
    emitToSession(fresh.sessionCode, 'request:statusChanged', payload);
  }
}

async function checkRequestCompletion(requestId: Types.ObjectId): Promise<void> {
  const request = await PrintRequest.findById(requestId);
  if (!request || ['completed', 'rejected', 'cancelled'].includes(request.status)) return;
  const jobs = await PrintJob.find({ requestId });
  if (jobs.length === 0) return;
  const anyActive = jobs.some((j) => !['completed', 'cancelled', 'failed'].includes(j.status));
  if (anyActive) return;
  const anyCompleted = jobs.some((j) => j.status === 'completed');
  if (anyCompleted) await setRequestStatus(request, 'completed');
}

/**
 * Create one print job per file of the request, prepare the print-ready PDFs,
 * then either simulate printing (demo mode) or hand jobs to the print agent.
 */
export async function createJobsForRequest(
  request: PrintRequestDoc,
  printer: PrinterDoc,
  settings: PrintSettings
): Promise<PrintJobDoc[]> {
  const shopId = request.shopId.toString();
  const jobs: PrintJobDoc[] = [];
  let position = await nextPosition(shopId);

  for (const entry of request.files) {
    const fileDoc = await File.findById(entry.fileId);
    if (!fileDoc || fileDoc.status === 'deleted') continue;
    const jobSettings: PrintSettings = { ...settings, pageRange: entry.pageRange };

    const prep = await preparePrintFile({ fileDoc, settings: jobSettings }, `${shopId}/jobs`);

    const job = await PrintJob.create({
      code: genJobCode(),
      shopId: request.shopId,
      requestId: request._id,
      requestCode: request.code,
      fileId: fileDoc._id,
      fileName: fileDoc.originalName,
      printerId: printer._id,
      printerName: printer.name,
      settings: jobSettings,
      pages: prep.pages,
      sheets: prep.sheets,
      storageKey: prep.storageKey,
      sumatraArgs: prep.sumatraArgs,
      status: 'queued',
      position: position++,
      demo: env.printMode === 'demo' || printer.source === 'demo',
    });
    jobs.push(job);
    await emitJob(job);
  }

  if (jobs.length === 0) {
    throw new HttpError(400, 'NO_PRINTABLE_FILES', 'None of the files in this request can be printed');
  }

  await setRequestStatus(request, 'processing');

  if (env.printMode === 'demo' || printer.source === 'demo') {
    for (const job of jobs) simulateJob(job);
  } else {
    emitToAgents(shopId, 'queue:updated', {});
  }
  return jobs;
}

function simulateJob(job: PrintJobDoc): void {
  const startDelay = Math.max(300, Math.round(env.demoDelayMs * 0.3));
  setTimeout(() => {
    void (async () => {
      const fresh = await PrintJob.findById(job._id);
      if (!fresh || fresh.status !== 'queued') return;
      fresh.status = 'printing';
      fresh.startedAt = new Date();
      fresh.attempts += 1;
      await fresh.save();
      await emitJob(fresh, 'print:started');
      await maybeSetPrinting(fresh.requestId);

      setTimeout(() => {
        void (async () => {
          const j2 = await PrintJob.findById(job._id);
          if (!j2 || j2.status !== 'printing') return;
          j2.status = 'completed';
          j2.completedAt = new Date();
          await j2.save();
          await emitJob(j2, 'print:completed');
          await checkRequestCompletion(j2.requestId);
        })().catch((err) => logger.error('demo job completion failed:', err));
      }, env.demoDelayMs);
    })().catch((err) => logger.error('demo job start failed:', err));
  }, startDelay);
}

/**
 * Atomically assign the next queued job for any of the given printers to an agent.
 * Returns null when nothing is available.
 */
export async function assignNextJob(shopId: string, printerNames: string[]): Promise<PrintJobDoc | null> {
  if (printerNames.length === 0) return null;
  const job = await PrintJob.findOneAndUpdate(
    { shopId, status: 'queued', printerName: { $in: printerNames } },
    { $set: { status: 'assigned', assignedAt: new Date() } },
    { new: true, sort: { position: 1 } }
  );
  return job;
}

/** Status updates reported by the local print agent (or demo mode). */
export async function updateJobFromAgent(
  jobId: string,
  status: 'printing' | 'completed' | 'failed',
  error?: string
): Promise<PrintJobDoc> {
  const job = await PrintJob.findById(jobId);
  if (!job) throw new HttpError(404, 'NOT_FOUND', 'Print job not found');

  if (status === 'printing') {
    if (!['assigned', 'printing'].includes(job.status)) throw new HttpError(409, 'JOB_NOT_ACTIVE', `Job is ${job.status}`);
    job.status = 'printing';
    if (!job.startedAt) job.startedAt = new Date();
    if (!job.attempts) job.attempts = 1;
    await job.save();
    await emitJob(job, 'print:started');
    await maybeSetPrinting(job.requestId);
    return job;
  }

  if (status === 'completed') {
    if (['completed', 'cancelled'].includes(job.status)) return job;
    job.status = 'completed';
    job.completedAt = new Date();
    await job.save();
    await emitJob(job, 'print:completed');
    await checkRequestCompletion(job.requestId);
    return job;
  }

  job.status = 'failed';
  job.error = (error || 'Printing failed').slice(0, 500);
  await job.save();
  await emitJob(job, 'print:failed');
  return job;
}

/** Admin queue operations. */
export async function pauseJob(job: PrintJobDoc): Promise<PrintJobDoc> {
  if (job.status !== 'queued') throw new HttpError(400, 'NOT_QUEUED', 'Only waiting jobs can be paused');
  job.status = 'paused';
  await job.save();
  await emitJob(job);
  return job;
}

export async function resumeJob(job: PrintJobDoc): Promise<PrintJobDoc> {
  if (job.status !== 'paused') throw new HttpError(400, 'NOT_PAUSED', 'Only paused jobs can be resumed');
  job.status = 'queued';
  await job.save();
  await emitJob(job);
  emitToAgents(job.shopId.toString(), 'queue:updated', {});
  return job;
}

export async function cancelJob(job: PrintJobDoc): Promise<PrintJobDoc> {
  if (['completed', 'cancelled'].includes(job.status)) return job;
  const was = job.status;
  job.status = 'cancelled';
  await job.save();
  await emitJob(job);
  if (was === 'assigned' || was === 'printing') {
    emitToAgents(job.shopId.toString(), 'job:cancelled', { jobId: job._id.toString() });
  }
  await checkRequestCompletion(job.requestId);
  return job;
}

export async function retryJob(job: PrintJobDoc): Promise<PrintJobDoc> {
  if (!['failed', 'cancelled'].includes(job.status)) {
    throw new HttpError(400, 'NOT_RETRYABLE', 'Only failed or cancelled jobs can be retried');
  }
  job.status = 'queued';
  job.attempts += 1;
  job.error = '';
  job.position = await nextPosition(job.shopId.toString());
  await job.save();
  await emitJob(job);
  emitToAgents(job.shopId.toString(), 'queue:updated', {});
  return job;
}

export async function moveJob(job: PrintJobDoc, direction: 'up' | 'down'): Promise<PrintJobDoc> {
  const active = await PrintJob.find({
    shopId: job.shopId,
    status: { $in: ['queued', 'paused'] },
  }).sort({ position: 1 });
  const idx = active.findIndex((j) => j._id.toString() === job._id.toString());
  if (idx === -1) throw new HttpError(400, 'NOT_QUEUED', 'Only waiting jobs can be reordered');
  const swapWith = direction === 'up' ? active[idx - 1] : active[idx + 1];
  if (!swapWith) return job;
  const tmp = job.position;
  job.position = swapWith.position;
  swapWith.position = tmp;
  await Promise.all([job.save(), swapWith.save()]);
  await emitJob(job);
  await emitJob(swapWith);
  return job;
}

export type { JobStatus };
