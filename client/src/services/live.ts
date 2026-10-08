import { useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket } from './socket';

type LiveHandler = (event: string, payload: unknown) => void;

const listeners = new Set<LiveHandler>();

/**
 * Subscribe to all live socket events while mounted. Multiple components can
 * subscribe; the underlying socket is shared and torn down with the last one.
 */
export function useLiveEvents(handler: LiveHandler, role: 'admin' | 'session'): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const fn: LiveHandler = (event, payload) => ref.current(event, payload);
    listeners.add(fn);
    if (listeners.size === 1) {
      connectSocket({ onEvent: (event, payload) => listeners.forEach((l) => l(event, payload)) }, role);
    }
    return () => {
      listeners.delete(fn);
      if (!listeners.size) disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
