/**
 * Print agent — Digital Print & Xerox web app.
 *
 * Runs on the shopkeeper's Windows PC. Connects to the cloud server with the
 * shop's agent token, reports the printers it can see, pulls print jobs and
 * prints them through SumatraPDF. Real-time dispatch happens over Socket.IO;
 * if the socket drops, an HTTP poll keeps jobs flowing.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import axios from 'axios';
import { io } from 'socket.io-client';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { detectPrinters } from './printers.js';
import { printWithSumatra } from './print.js';

const cfg = loadConfig();
const log = createLogger(cfg.logDir);

const tempDir = cfg.tempDir ? path.resolve(cfg.tempDir) : path.join(os.tmpdir(), 'print-agent');
fs.mkdirSync(tempDir, { recursive: true });

const api = axios.create({
  baseURL: cfg.serverUrl,
  headers: { 'x-agent-token': cfg.agentToken },
  timeout: 30000,
});

let socket = null;
let printerNames = [];
let pollTimer = null;
let shuttingDown = false;
let pollFailures = 0;

const jobQueue = [];
let printing = false;
const activeProcs = new Map(); // jobId -> ChildProcess
const cancelledJobs = new Set();

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- temp files ---------- */

/** Remove leftovers from a previous run (older than 1h) so nothing accumulates. */
function cleanTempDir() {
  try {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const name of fs.readdirSync(tempDir)) {
      const p = path.join(tempDir, name);
      try {
        if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
      } catch {
        /* in use — skip */
      }
    }
  } catch {
    /* nothing to clean */
  }
}

/* ---------- status reporting (socket first, HTTP fallback) ---------- */

async function httpStatus(jobId, status, error) {
  try {
    await api.post(`/api/agent/jobs/${jobId}/status`, { status, error });
  } catch (err) {
    log.warn(`HTTP status report failed for ${jobId}: ${err.message}`);
  }
}

function reportStatus(jobId, status, error) {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      httpStatus(jobId, status, error).then(resolve);
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      log.warn('Socket status ack timed out — retrying over HTTP');
      httpStatus(jobId, status, error).then(finish);
    }, 5000);
    socket.emit('job:status', { jobId, status, error }, (res) => {
      if (res?.ok) finish();
      else httpStatus(jobId, status, error).then(finish);
    });
  });
}

/* ---------- job handling ---------- */

async function downloadJobFile(job) {
  const res = await api.get(job.fileUrl, { responseType: 'arraybuffer', timeout: 60000 });
  const filePath = path.join(tempDir, `${job.code}-${crypto.randomUUID()}.pdf`);
  await fs.promises.writeFile(filePath, Buffer.from(res.data));
  return filePath;
}

async function runJob(job) {
  log.info(
    `Job ${job.code}: "${job.fileName}" → ${job.printerName} (${job.sheets} sheet(s), settings "${job.sumatraArgs || 'default'}")`
  );
  let attempt = 0;
  while (!shuttingDown) {
    attempt++;
    let filePath;
    try {
      if (attempt === 1) await reportStatus(job.id, 'printing');
      filePath = await downloadJobFile(job);
      await printWithSumatra({
        sumatraPath: cfg.sumatraPath,
        filePath,
        printerName: job.printerName,
        printSettings: job.sumatraArgs,
        onSpawn: (proc) => activeProcs.set(job.id, proc),
      });
      activeProcs.delete(job.id);
      if (cancelledJobs.has(job.id)) {
        log.info(`Job ${job.code}: cancelled while printing`);
        return;
      }
      await reportStatus(job.id, 'completed');
      log.info(`Job ${job.code}: completed`);
      return;
    } catch (err) {
      activeProcs.delete(job.id);
      if (cancelledJobs.has(job.id)) {
        log.info(`Job ${job.code}: cancelled — not reporting failure`);
        return;
      }
      if (shuttingDown) return;
      if (attempt < Math.max(1, cfg.maxPrintRetries)) {
        log.warn(`Job ${job.code}: attempt ${attempt} failed (${err.message}) — retrying`);
        await delay(2000);
        continue;
      }
      log.error(`Job ${job.code}: failed — ${err.message}`);
      await reportStatus(job.id, 'failed', err.message.slice(0, 500));
      return;
    } finally {
      // Temp files are always deleted, success or failure.
      if (filePath) fs.promises.unlink(filePath).catch(() => {});
    }
  }
}

function enqueueJob(job) {
  if (jobQueue.some((j) => j.id === job.id) || printing) {
    if (printing) jobQueue.push(job);
    return;
  }
  jobQueue.push(job);
  processQueue();
}

async function processQueue() {
  if (printing || shuttingDown) return;
  const job = jobQueue.shift();
  if (!job) return;
  printing = true;
  try {
    await runJob(job);
  } finally {
    printing = false;
    if (jobQueue.length > 0 && !shuttingDown) processQueue();
  }
}

function cancelActiveJob(jobId) {
  if (!jobId) return;
  cancelledJobs.add(jobId);
  const proc = activeProcs.get(jobId);
  if (proc) {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }
  const idx = jobQueue.findIndex((j) => j.id === jobId);
  if (idx !== -1) jobQueue.splice(idx, 1);
}

/* ---------- printer detection & reporting ---------- */

async function reportPrinters(printers) {
  if (!socket?.connected) {
    try {
      await api.post('/api/agent/printers', { printers });
    } catch (err) {
      log.warn(`Printer report over HTTP failed: ${err.message}`);
    }
    return;
  }
  let settled = false;
  await new Promise((resolve) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off('agent:printers:ok', onOk);
      resolve();
    };
    const onOk = () => finish();
    const timer = setTimeout(() => {
      api.post('/api/agent/printers', { printers }).then(finish, finish);
    }, 5000);
    socket.on('agent:printers:ok', onOk);
    socket.emit('agent:printers', { printers });
  });
}

async function syncPrinters() {
  const { printers, error } = await detectPrinters(cfg.excludePrinters);
  if (error) log.warn(`Printer detection failed: ${error}`);
  printerNames = printers.map((p) => p.name);
  if (printers.length === 0) {
    log.warn('No printers detected — jobs for this agent will stay queued');
    return;
  }
  log.info(`Printers detected: ${printerNames.join(', ')}`);
  await reportPrinters(printers);
}

/* ---------- socket connection ---------- */

function connectSocket() {
  socket = io(cfg.serverUrl, {
    auth: { agentToken: cfg.agentToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelayMin: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on('connect', () => {
    log.info(`Connected to ${cfg.serverUrl}`);
    stopPolling();
    // Announce readiness — the server pushes the next queued job, if any.
    socket.emit('agent:ready', { printers: printerNames });
  });

  socket.on('disconnect', (reason) => {
    log.warn(`Socket disconnected (${reason}) — falling back to HTTP polling`);
    startPolling();
  });

  socket.on('connect_error', (err) => {
    const msg = String(err?.message || '');
    if (msg.includes('AGENT_UNAUTHORIZED') || msg.includes('AG_UNAUTHORIZED')) {
      log.error('Server rejected the agent token. Copy the current token from Admin → Settings → Print agent token.');
    } else if (pollFailures % 10 === 0) {
      log.warn(`Socket connection error: ${msg}`);
    }
  });

  socket.on('job:assigned', (job) => {
    if (job?.id) enqueueJob(job);
  });

  socket.on('job:cancelled', ({ jobId }) => cancelActiveJob(jobId));
}

/* ---------- HTTP polling fallback ---------- */

function startPolling() {
  if (pollTimer || shuttingDown) return;
  pollTimer = setInterval(async () => {
    if (socket?.connected || shuttingDown) return;
    try {
      const { data } = await api.post('/api/agent/poll', { printers: printerNames });
      pollFailures = 0;
      if (data?.job) enqueueJob(data.job);
    } catch (err) {
      pollFailures++;
      if (pollFailures % 10 === 1) {
        log.warn(`Poll failed (${err.message}) — retrying in background`);
      }
    }
  }, Math.max(1000, cfg.pollIntervalMs));
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/* ---------- lifecycle ---------- */

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`${signal} received — shutting down`);
  stopPolling();
  for (const proc of activeProcs.values()) {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }
  socket?.close();
  log.close();
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => log.error(`Uncaught exception: ${err.stack || err.message}`));
process.on('unhandledRejection', (err) => log.error(`Unhandled rejection: ${err}`));

async function main() {
  log.info(`Print agent starting — server ${cfg.serverUrl}`);
  cleanTempDir();

  try {
    const { data } = await api.get('/api/agent/health');
    log.info(`Server reachable — shop "${data.shop}"`);
  } catch (err) {
    if (err.response?.status === 401) {
      log.error('Server rejected the agent token. Copy the current token from Admin → Settings → Print agent token.');
      process.exit(1);
    }
    log.warn(`Server not reachable yet (${err.message}) — will keep retrying`);
  }

  await syncPrinters().catch((err) => log.error(`Printer sync failed: ${err.message}`));
  connectSocket();
  // Kept as a safety net until the socket is up, and restarted on disconnect.
  startPolling();

  setInterval(() => {
    if (!shuttingDown) syncPrinters().catch((err) => log.warn(`Printer refresh failed: ${err.message}`));
  }, Math.max(10000, cfg.printerRefreshMs));
}

main().catch((err) => {
  log.error(`Fatal: ${err.stack || err.message}`);
  process.exit(1);
});
