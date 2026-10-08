import { io, type Socket } from 'socket.io-client';
import { API_URL, getAdminToken, getSessionCode } from './api';

let socket: Socket | null = null;

export type SocketHandlers = {
  onEvent: (event: string, payload: unknown) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

function authPayload(): Record<string, string> {
  const admin = getAdminToken();
  if (admin) return { token: admin };
  const session = getSessionCode();
  if (session) return { sessionId: session };
  return {};
}

/** Single shared socket; re-authenticates whenever connect() is called. */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(API_URL || window.location.origin, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
  return socket;
}

export function connectSocket(handlers: SocketHandlers, role?: 'admin' | 'session'): Socket {
  const s = getSocket();
  s.auth =
    role === 'admin'
      ? { token: getAdminToken() ?? '' }
      : role === 'session'
        ? { sessionId: getSessionCode() ?? '' }
        : authPayload();

  const listeners: Array<[string, (payload: unknown) => void]> = [
    ['connect', () => handlers.onConnect?.()],
    ['disconnect', () => handlers.onDisconnect?.()],
  ];

  // Every domain event is routed through one callback — the pages decide what matters.
  const forwarded = [
    'session:created',
    'file:uploaded',
    'request:created',
    'request:updated',
    'request:statusChanged',
    'print:started',
    'print:completed',
    'print:failed',
    'job:updated',
    'job:cancelled',
    'printer:statusChanged',
    'queue:updated',
  ];
  for (const event of forwarded) {
    listeners.push([event, (payload: unknown) => handlers.onEvent(event, payload)]);
  }

  for (const [event, fn] of listeners) {
    s.on(event, fn as never);
  }

  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
