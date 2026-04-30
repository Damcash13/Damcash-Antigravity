import { supabase, withTimeout } from './supabase';

// In dev, Vite proxies /api/* → localhost:3002 so relative paths work.
// In production, set VITE_API_URL to the backend origin if it differs from the frontend.
// @ts-ignore
const BASE: string = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || '';

const API_TIMEOUT = 15_000; // 15s — enough for cold-start but won't hang forever

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  let token = null;
  if (supabase) {
    try {
      const { data: { session } } = await withTimeout<any>(
        supabase.auth.getSession(),
        8_000,
        'Auth session',
      );
      token = session?.access_token;
    } catch {
      // Supabase unreachable — continue without token
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts?.headers,
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      if (res.status === 401) {
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
      const isJson = res.headers.get('content-type')?.includes('application/json');
      const err = isJson ? await res.json().catch(() => ({ error: res.statusText })) : { error: res.statusText };
      throw new Error(err.error || 'Request failed');
    }

    const isJson = res.headers.get('content-type')?.includes('application/json');
    if (!isJson) {
      throw new Error('Expected JSON response but received non-JSON');
    }
    return res.json();
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${path} timed out after ${API_TIMEOUT / 1000}s`);
    }
    throw err;
  }
}

export const api = {
  agora: {
    token: (channelName: string, uid = 0) =>
      request<{ token: string | null; appId?: string; uid: number }>(
        '/api/agora/token',
        { method: 'POST', body: JSON.stringify({ channelName, uid }) },
      ),
  },

  auth: {
    // NOTE: register and login are handled client-side via Supabase Auth.
    // The backend only provides /api/auth/me for profile sync after Supabase login.
    me: () => request<{ user: ApiUser }>('/api/auth/me'),
    updateProfile: (body: { username?: string; country?: string; avatarUrl?: string }) =>
      request<{ user: ApiUser }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      request<{ ok: boolean }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  leaderboard: {
    list: (params: {
      universe: string;
      category?: string;
      limit?: number;
      offset?: number;
    }) => {
      const q = new URLSearchParams({
        universe: params.universe,
        ...(params.category ? { category: params.category } : {}),
        ...(params.limit != null ? { limit: String(params.limit) } : {}),
        ...(params.offset != null ? { offset: String(params.offset) } : {}),
      });
      return request<ApiLeaderboardEntry[]>(`/api/leaderboard?${q}`);
    },
  },

  correspondence: {
    list: () => request<ApiCorrGame[]>('/api/correspondence'),
    get: (id: string) => request<ApiCorrGame>(`/api/correspondence/${id}`),
    create: (body: {
      universe: string;
      timePerMove: number;
      opponentUsername?: string;
    }) =>
      request<ApiCorrGame>('/api/correspondence', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    move: (id: string, body: { from?: string; to?: string; san: string; fen?: string }) =>
      request<ApiCorrGame>(`/api/correspondence/${id}/move`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    resign: (id: string) =>
      request<ApiCorrGame>(`/api/correspondence/${id}/resign`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    draw: (id: string) =>
      request<ApiCorrGame>(`/api/correspondence/${id}/draw`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
  },

  tournaments: {
    list: () => request<ApiTournament[]>('/api/tournaments'),
    get: (id: string) => request<ApiTournament>(`/api/tournaments/${id}`),
    create: (body: {
      name: string;
      icon?: string;
      universe: string;
      format: string;
      timeControl: string;
      rated?: boolean;
      betEntry?: number;
      prizePool?: number;
      maxPlayers?: number;
      durationMs?: number;
      totalRounds?: number;
      description?: string;
      startsAt: string;
    }) =>
      request<ApiTournament>('/api/tournaments', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    join: (id: string) =>
      request<{ ok: boolean }>(`/api/tournaments/${id}/join`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    leave: (id: string) =>
      request<{ ok: boolean }>(`/api/tournaments/${id}/leave`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    games: (id: string) => request<any[]>(`/api/tournaments/${id}/games`),
  },

  friends: {
    list: () => request<ApiFriendsResponse>('/api/friends'),
    request: (body: { targetUsername: string }) =>
      request<ApiFriend>('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    accept: (body: { requestId: string }) =>
      request<ApiFriend>('/api/friends/accept', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    decline: (body: { requestId: string }) =>
      request<{ ok: boolean }>('/api/friends/decline', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    remove: (friendId: string) =>
      request<{ ok: boolean }>(`/api/friends/${friendId}`, {
        method: 'DELETE',
      }),
  },

  wallet: {
    get: () => request<ApiWallet>('/api/wallet'),
    deposit: (amount: number) =>
      request<ApiWallet>('/api/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      }),
    withdraw: (amount: number) =>
      request<ApiWallet>('/api/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      }),
    transactions: () => request<ApiTransaction[]>('/api/wallet/transactions'),
    stripeCheckout: (amount: number) =>
      request<{ url: string | null; sessionId: string }>('/api/wallet/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      }),
    stripeVerify: (sessionId: string) =>
      request<{ ok: boolean; balance: number; already_credited?: boolean }>(
        `/api/wallet/stripe/verify?session_id=${encodeURIComponent(sessionId)}`
      ),
  },

  puzzles: {
    progress: () => request<ApiPuzzleProgress[]>('/api/puzzles/progress'),
    complete: (body: { puzzleId: string; solved: boolean }) =>
      request<ApiPuzzleProgress>('/api/puzzles/complete', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  users: {
    search: (q: string) => request<ApiUserProfile[]>(`/api/users/search?q=${encodeURIComponent(q)}`),
    get: (username: string) => request<ApiUserProfile>(`/api/users/${username}`),
    games: (username: string) => request<ApiMatch[]>(`/api/users/${username}/games`),
    stats: (username: string) => request<ApiUserStats>(`/api/users/${username}/stats`),
    fullStats: (username: string) => request<ApiFullStats>(`/api/users/${username}/full-stats`),
    headToHead: (a: string, b: string, universe: string) =>
      request<ApiH2H>(`/api/h2h?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&universe=${encodeURIComponent(universe)}`),
  },

  games: {
    get: (id: string) => request<ApiMatch>(`/api/games/${id}`),
  },

  rooms: {
    live: () => request<ApiLiveRoom[]>('/api/rooms/live'),
  },
};

// ── API types ─────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: string;
  username: string;
  country?: string;
  walletBalance: number;
  rating: { chess: number; checkers: number };
  chess?:    { wins: number; losses: number; draws: number; games: number };
  checkers?: { wins: number; losses: number; draws: number; games: number };
}

export interface ApiLeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  country?: string;
  chessRating: number;
  checkersRating: number;
  peakChessRating: number;
  peakCheckersRating: number;
  chessGames: number;
  checkersGames: number;
  chessWins: number;
  chessLosses: number;
  chessDraws: number;
  checkersWins: number;
  checkersLosses: number;
  checkersDraws: number;
}

export interface ApiCorrGame {
  id: string;
  universe: string;
  status: string;
  result: string | null;
  resultReason: string | null;
  timePerMove: number;
  currentTurn: string;
  currentPosition: string;
  whiteId: string;
  blackId: string | null;
  moves: unknown[];
  white: { id: string; username: string };
  black: { id: string; username: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTournament {
  id: string;
  name: string;
  icon: string;
  universe: string;
  format: string;
  timeControl: string;
  rated: boolean;
  betEntry: number;
  prizePool: number;
  maxPlayers: number;
  durationMs: number;
  totalRounds: number;
  status: string;
  description: string;
  startsAt: string;
  createdAt: string;
  playerCount: number;
  players?: ApiTournamentPlayer[];
}

export interface ApiTournamentPlayer {
  id: string;
  userId: string;
  score: number;
  wins: number;
  draws: number;
  losses: number;
  rating: number;
  user: { id: string; username: string };
}

export interface ApiFriend {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: string;
  createdAt: string;
  requester: { id: string; username: string };
  addressee: { id: string; username: string };
}

export interface ApiFriendsResponse {
  friends: ApiFriend[];
  incoming: ApiFriend[];
  outgoing: ApiFriend[];
}

export interface ApiWallet {
  id: string;
  balance: number;
  updatedAt: string;
}

export interface ApiTransaction {
  id: string;
  amount: number;
  type: string;
  status: string;
  matchId: string | null;
  createdAt: string;
}

export interface ApiPuzzleProgress {
  id: string;
  puzzleId: string;
  solved: boolean;
  attempts: number;
  lastAttemptAt: string;
}

export interface ApiUserProfile {
  id: string;
  username: string;
  country?: string;
  avatarUrl?: string;
  chessRating: number;
  checkersRating: number;
  peakChessRating: number;
  peakCheckersRating: number;
  chessGames: number;
  checkersGames: number;
  chessWins: number;
  chessLosses: number;
  chessDraws: number;
  checkersWins: number;
  checkersLosses: number;
  checkersDraws: number;
  createdAt: string;
}

export interface ApiUserStats {
  username: string;
  chess: {
    rating: number;
    peak: number;
    games: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
  };
  checkers: {
    rating: number;
    peak: number;
    games: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
  };
}

export interface ApiLiveRoom {
  id: string;
  universe: string;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  tc: string;
  bet: number;
  moveCount: number;
  spectators: number;
  fen?: string;
}

export interface ApiFullStats {
  joinedAt: string;
  estimatedPlayMs: number;
  totalGames: number;
  bestStreak: number;
  favouriteTC: string | null;
  chess: { games: number; wins: number; losses: number; draws: number; rating: number; peak: number };
  checkers: { games: number; wins: number; losses: number; draws: number; rating: number; peak: number };
  tournaments: Array<{
    id: string; name: string; icon: string; universe: string;
    format: string; timeControl: string; status: string;
    betEntry: number; prizePool: number; startsAt: string;
    score: number; wins: number; draws: number; losses: number;
  }>;
  wallet: {
    balance: number;
    totalDeposited: number;
    totalWithdrawn: number;
    totalBetWon: number;
    totalBetLost: number;
    netProfit: number;
    gamesWithBets: number;
    betsWon: number;
    transactions: Array<{
      id: string; amount: number; type: string; status: string; createdAt: string;
    }>;
  };
}

export interface ApiH2H {
  today: { a: number; b: number; draws: number };
  year:  { a: number; b: number; draws: number };
}

export interface ApiMatch {
  id: string;
  universe: string;
  timeControl: string;
  status: string;
  result: string | null;
  pgn: string | null;
  finalFen: string | null;
  betAmount: number;
  isRated: boolean;
  whiteId: string;
  blackId: string;
  white: { id: string; username: string };
  black: { id: string; username: string };
  createdAt: string;
  endedAt: string | null;
}
