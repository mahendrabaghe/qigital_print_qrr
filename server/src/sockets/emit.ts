import type { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function setIO(instance: SocketIOServer): void {
  io = instance;
}

function instance(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialised');
  return io;
}

/** Emit an event to every admin dashboard of a shop. */
export function emitToShop(shopId: string, event: string, payload: unknown): void {
  instance().to(`shop:${shopId}`).emit(event, payload);
}

/** Emit an event to a customer session room (upload/status page). */
export function emitToSession(sessionCode: string, event: string, payload: unknown): void {
  instance().to(`session:${sessionCode}`).emit(event, payload);
}

/** Emit an event to all connected print agents of a shop. */
export function emitToAgents(shopId: string, event: string, payload: unknown): void {
  instance().to(`agents:${shopId}`).emit(event, payload);
}

/** Emit to a specific agent socket (by socket id). */
export function emitToSocket(socketId: string, event: string, payload: unknown): void {
  instance().to(socketId).emit(event, payload);
}

export function getIO(): SocketIOServer | null {
  return io;
}
