import type { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User } from '../models/User';
import { Shop, type ShopDoc } from '../models/Shop';
import { Session, type SessionDoc } from '../models/Session';
import { setIO } from './emit';
import { assignNextJob, updateJobFromAgent } from '../services/jobRunner.service';
import { agentNamesForShop, buildAgentJobPayload, syncAgentPrinters } from '../services/agent.service';
import { logger } from '../utils/logger';

interface HandshakeAuth {
  token?: string;
  sessionId?: string;
  agentToken?: string;
}

interface PrinterReport {
  printers?: Array<{ name: string; type?: 'usb' | 'network' | 'virtual'; status?: 'online' | 'offline' | 'unknown' }>;
}

interface JobStatusReport {
  jobId: string;
  status: 'printing' | 'completed' | 'failed';
  error?: string;
}

interface ClientToServerEvents {
  'admin:ping': (cb: () => void) => void;
  'agent:ready': (data?: { printers?: string[] }) => void;
  'agent:printers': (data?: PrinterReport) => void;
  'job:status': (
    data: JobStatusReport,
    cb?: (result: { ok: boolean; error?: string }) => void
  ) => void;
}

interface ServerToClientEvents {
  [event: string]: (payload: unknown) => void;
}

type ClientKind = 'admin' | 'session' | 'agent';

interface SocketData {
  kind: ClientKind;
  shopId: string;
  sessionCode?: string;
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

function bearerFrom(header: unknown): string | undefined {
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

/**
 * Authenticate every socket connection as admin (JWT), customer (session code)
 * or print agent (agent token). Unauthenticated sockets are rejected.
 */
async function authenticateSocket(socket: AppSocket): Promise<void> {
  const auth = ((socket.handshake.auth ?? {}) as HandshakeAuth);
  const headers = socket.handshake.headers;
  const headerSession = Array.isArray(headers['x-session-id']) ? headers['x-session-id'][0] : headers['x-session-id'];
  const headerAgent = Array.isArray(headers['x-agent-token']) ? headers['x-agent-token'][0] : headers['x-agent-token'];

  const jwtToken = auth.token ?? bearerFrom(headers.authorization);
  const sessionCode = auth.sessionId ?? (headerSession as string | undefined);
  const agentToken = auth.agentToken ?? (headerAgent as string | undefined);

  if (jwtToken) {
    const payload = jwt.verify(jwtToken, env.jwtSecret) as { sub: string };
    const user = await User.findById(payload.sub);
    const shop: ShopDoc | null = user ? await Shop.findById(user.shopId) : null;
    if (user && shop) {
      socket.data.kind = 'admin';
      socket.data.shopId = shop._id.toString();
      return;
    }
    throw new Error('UNAUTHORIZED');
  }

  if (sessionCode) {
    const session: SessionDoc | null = await Session.findOne({ code: String(sessionCode), status: 'active' });
    if (!session || session.expiresAt < new Date()) throw new Error('SESSION_EXPIRED');
    socket.data.kind = 'session';
    socket.data.shopId = session.shopId.toString();
    socket.data.sessionCode = session.code;
    return;
  }

  if (agentToken) {
    const shop = await Shop.findOne({ agentToken: String(agentToken) });
    if (!shop) throw new Error('AGENT_UNAUTHORIZED');
    socket.data.kind = 'agent';
    socket.data.shopId = shop._id.toString();
    return;
  }

  throw new Error('UNAUTHORIZED');
}

/** Try to hand the next queued job to this agent socket. */
async function dispatchNextToAgent(socket: AppSocket, printers?: string[]): Promise<void> {
  if (socket.data.kind !== 'agent') return;
  const names = printers?.length ? printers : await agentNamesForShop(socket.data.shopId);
  const job = await assignNextJob(socket.data.shopId, names);
  if (job) {
    socket.emit('job:assigned', buildAgentJobPayload(job));
  }
}

export function initSockets(httpServer: HttpServer): Server<ClientToServerEvents, ServerToClientEvents, SocketData> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, SocketData>(httpServer, {
    cors: {
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    },
    serveClient: false,
    pingTimeout: 30000,
  });

  io.use((socket, next) => {
    authenticateSocket(socket)
      .then(() => next())
      .catch((err) => next(new Error(err?.message || 'UNAUTHORIZED')));
  });

  io.on('connection', (socket: AppSocket) => {
    const { kind, shopId, sessionCode } = socket.data;

    if (kind === 'admin') {
      socket.join(`shop:${shopId}`);
      socket.on('admin:ping', (cb) => cb?.());
      return;
    }

    if (kind === 'session') {
      socket.join(`session:${sessionCode}`);
      void Session.updateOne({ code: sessionCode }, { $set: { lastActivityAt: new Date() } });
      return;
    }

    // Print agent
    socket.join(`agents:${shopId}`);

    socket.on('agent:ready', (data) => {
      void dispatchNextToAgent(socket, data?.printers).catch((err) =>
        logger.error('agent:ready dispatch failed:', err)
      );
    });

    socket.on('agent:printers', (data) => {
      void syncAgentPrinters(shopId, data?.printers ?? [])
        .then((printers) => socket.emit('agent:printers:ok', { printers }))
        .catch((err) => logger.error('agent printer sync failed:', err));
    });

    socket.on('job:status', (data, cb) => {
      void updateJobFromAgent(data.jobId, data.status, data.error)
        .then(async () => {
          if (data.status !== 'printing') await dispatchNextToAgent(socket);
          cb?.({ ok: true });
        })
        .catch((err) => {
          logger.error('job:status update failed:', err);
          cb?.({ ok: false, error: err?.message ?? 'Update failed' });
        });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`agent socket disconnected (shop ${shopId}): ${reason}`);
    });
  });

  setIO(io);
  logger.info('Socket.IO ready (auth: admin JWT | session code | agent token)');
  return io;
}
