import type { Universe } from '../types';

// In dev, Vite proxies /socket.io → localhost:3002 so we connect to same origin ('').
// In production, set VITE_SOCKET_URL to the backend URL if it differs from the frontend origin.
// @ts-ignore
const SOCKET_URL: string = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SOCKET_URL) || '';

const CLIENT_ID_KEY = 'damcash_client_id';

function getClientId(): string {
  try {
    let value = localStorage.getItem(CLIENT_ID_KEY);
    if (!value) {
      value = `client_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
      localStorage.setItem(CLIENT_ID_KEY, value);
    }
    return value;
  } catch {
    return `client_${Math.random().toString(36).slice(2)}`;
  }
}

export const clientId = getClientId();

// Socket.io is loaded via CDN in index.html
// @ts-ignore
const _io = (typeof window !== 'undefined' && (window as any).io) ? (window as any).io : null;

const win = typeof window !== 'undefined' ? (window as any) : {};

export const socket: any = _io
  ? (win.__damcashSocket || (win.__damcashSocket = _io(SOCKET_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: { token: null, clientId },
    })))
  : {
      id: `local-${Math.random().toString(36).slice(2, 8)}`,
      connected: false,
      on:   () => {},
      off:  () => {},
      emit: () => {},
      join: () => {},
    };

/**
 * Call this after login to update the socket's auth token and reconnect,
 * so the server recognises the user for rated games and money games.
 */
export function reconnectWithToken(token: string | null): void {
  if (!_io || !socket?.auth) return;
  socket.auth = { token, clientId };
  socket.disconnect().connect();
}

if (_io) {
  socket.on('connect', () => {
    // Attempt auto-rejoin for chess
    const chessStored = sessionStorage.getItem('damcash_rejoin_chess');
    if (chessStored) {
      try {
        const { roomId, token } = JSON.parse(chessStored);
        if (window.location.pathname.includes(`/chess/game/${roomId}`)) {
          socket.emit('room:rejoin', { roomId, token });
        }
      } catch {}
    }

    // Attempt auto-rejoin for checkers
    const draughtsStored = sessionStorage.getItem('damcash_rejoin_draughts');
    if (draughtsStored) {
      try {
        const { roomId, token } = JSON.parse(draughtsStored);
        if (window.location.pathname.includes(`/checkers/game/${roomId}`)) {
          socket.emit('room:rejoin', { roomId, token });
        }
      } catch {}
    }
  });

  // ── Player presence tracking ──────────────────────────────────────────────
  // Listen for presence broadcasts from the server and keep the invite store
  // in sync so the online players list reflects real-time connections.
  // Dynamic imports are used to avoid a circular dependency (inviteStore
  // already imports socket.ts at module load time).
  socket.on('player:connected', (player: any) => {
    import('../stores/inviteStore').then(({ useInviteStore }) => {
      useInviteStore.getState().upsertPlayer(player);
    });
  });

  socket.on('player:disconnected', (data: { socketId: string }) => {
    import('../stores/inviteStore').then(({ useInviteStore }) => {
      useInviteStore.getState().removePlayer(data.socketId);
    });
  });

  socket.on('player:universe-changed', (data: { socketId: string; universe: Universe }) => {
    import('../stores/inviteStore').then(({ useInviteStore }) => {
      const { upsertPlayer, onlinePlayers } = useInviteStore.getState();
      const player = onlinePlayers.find((p: any) => p.socketId === data.socketId);
      if (player) {
        upsertPlayer({ ...player, universe: data.universe });
      }
    });
  });
}
