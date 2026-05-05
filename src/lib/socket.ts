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

// Attempt to grab an existing Supabase session token synchronously from localStorage
// so the socket handshake carries auth even on page reload.
function getStoredToken(): string | null {
  try {
    const raw = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!raw) return null;
    const parsed = JSON.parse(localStorage.getItem(raw) || '{}');
    return parsed?.access_token || null;
  } catch { return null; }
}

const win = typeof window !== 'undefined' ? (window as any) : {};

export const socket: any = _io
  ? (win.__damcashSocket || (win.__damcashSocket = _io(SOCKET_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: { token: getStoredToken(), clientId },
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
}
