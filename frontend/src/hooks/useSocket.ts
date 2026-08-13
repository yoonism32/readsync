import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getApiKey, hasApiKey } from '../api/client.js';

// One Socket.IO connection per authenticated tab, reusing the same api_key
// already used for HTTP auth (src/websocket/auth.ts expects the same
// handshake). Mounted once in Layout.tsx; components that want live updates
// read the returned socket and attach their own listeners.
export function useSocket(): Socket | null {
  const [socket] = useState<Socket | null>(() =>
    hasApiKey() ? io({ auth: { apiKey: getApiKey() }, autoConnect: false }) : null
  );

  useEffect(() => {
    if (!socket) return;
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  return socket;
}
