import { useEffect, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';

// One Socket.IO connection per authenticated tab, held at module scope so
// remounts of the component that calls useSocket() (React StrictMode's
// dev double-invoke, or a transient RequireAuth flicker) reuse the same
// connection instead of tearing it down. Every connection authenticates
// with the current browser session cookie.
let socket: Socket | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

function ensureSocket(): Socket | null {
  if (socket) return socket;
  socket = io({ withCredentials: true, autoConnect: false });
  socket.connect();
  notify();
  return socket;
}

// The one legitimate teardown path — call on logout so no authenticated
// socket is leaked past sign-out. Nulls the singleton so a later
// ensureSocket() builds a fresh instance (e.g. re-login as another user).
export function disconnectSocket(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  notify();
}

// Reuse an existing socket, or create one after a fresh sign-in.
export function reconnectSocket(): void {
  if (!socket) ensureSocket();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): Socket | null {
  return socket;
}

export function useSocket(): Socket | null {
  const value = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    ensureSocket();
  }, []);

  return value;
}
