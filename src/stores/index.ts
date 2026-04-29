import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Universe, User, Bet, DraughtsBoard as DraughtsBoardType } from '../types';
import { api } from '../lib/api';
import { supabase, withTimeout } from '../lib/supabase';
import { reconnectWithToken } from '../lib/socket';

// ─── Live Games Store ──────────────────────────────────────────────────────────

export interface LiveGame {
  id: string;
  universe: Universe;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  tc: string;
  bet: number;
  // Chess: FEN string
  fen?: string;
  // Checkers: serialised board
  draughtsBoard?: DraughtsBoardType;
  moveCount: number;
  startedAt: number;
  status: 'playing' | 'ended';
}

interface LiveGamesStore {
  games: LiveGame[];
  registerGame: (game: LiveGame) => void;
  updateGame: (id: string, patch: Partial<LiveGame>) => void;
  removeGame: (id: string) => void;
}

export const useLiveGamesStore = create<LiveGamesStore>((set) => ({
  games: [],
  registerGame: (game) =>
    // Idempotent: skip if already registered
    set((s) => {
      if (s.games.find(g => g.id === game.id)) return s;
      return { games: [game, ...s.games].slice(0, 20) };
    }),
  updateGame: (id, patch) =>
    set((s) => ({
      games: s.games.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    })),
  removeGame: (id) =>
    set((s) => ({ games: s.games.filter((g) => g.id !== id) })),
}));

interface UniverseStore {
  universe: Universe;
  setUniverse: (u: Universe) => void;
  toggleUniverse: () => void;
}

export const useUniverseStore = create<UniverseStore>((set) => ({
  universe: 'chess',
  setUniverse: (universe) => set({ universe }),
  toggleUniverse: () => set((s) => ({ universe: s.universe === 'chess' ? 'checkers' : 'chess' })),
}));

export interface RatingEntry {
  universe:       'chess' | 'checkers';
  before:         number;
  after:          number;
  delta:          number;
  opponent:       string;
  opponentRating: number;
  result:         'win' | 'draw' | 'loss';
  playedAt:       number;
}

function makeGuestUser(): User {
  return {
    id: 'guest',
    name: 'Guest',
    rating: { chess: 1500, checkers: 1450 },
    walletBalance: 0,
    currency: 'USD',
    wins: 0, losses: 0, draws: 0,
    betsWon: 0, betsLost: 0,
  };
}

function apiUserToUser(u: {
  id: string; username: string; email?: string; avatarUrl?: string;
  country?: string; bio?: string; socialLinks?: Record<string, string>;
  walletBalance: number; rating: { chess: number; checkers: number };
  chess?:    { wins: number; losses: number; draws: number; games: number };
  checkers?: { wins: number; losses: number; draws: number; games: number };
}): User {
  return {
    id: u.id,
    name: u.username,
    email: u.email,
    avatarUrl: u.avatarUrl,
    country: u.country || '',
    bio: u.bio || '',
    socialLinks: u.socialLinks as any || {},
    rating: u.rating,
    walletBalance: Number(u.walletBalance),
    currency: 'USD',
    wins:   (u.chess?.wins   ?? 0) + (u.checkers?.wins   ?? 0),
    losses: (u.chess?.losses ?? 0) + (u.checkers?.losses ?? 0),
    draws:  (u.chess?.draws  ?? 0) + (u.checkers?.draws  ?? 0),
    chess:    u.chess,
    checkers: u.checkers,
    betsWon: 0,
    betsLost: 0,
  };
}

interface UserStore {
  user: User | null;
  isLoggedIn: boolean;
  gamesPlayed: { chess: number; checkers: number };
  ratingHistory: RatingEntry[];
  login:           (name: string, password?: string) => Promise<void> | void;
  logout:          () => void;
  updateBalance:   (amount: number) => void;
  setWalletBalance: (balance: number) => void;
  guestLogin:      () => void;
  updateRating:    (entry: RatingEntry) => void;
  updateBetStats:  (result: 'win' | 'loss') => void;
  saveUsername:    (newName: string, country?: string) => Promise<void>;
  updateProfile:   (fields: { bio?: string; socialLinks?: import('../types').SocialLinks }) => void;
  restoreSession:  () => Promise<void>;
  listenToAuthChanges: () => void;
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      user: null,
      isLoggedIn: false,
      gamesPlayed: { chess: 0, checkers: 0 },
      ratingHistory: [],
      login: async (email, password) => {
        if (!supabase) throw new Error('Supabase not initialized');
        const { data, error } = await withTimeout<any>(
          supabase.auth.signInWithPassword({ email, password: password ?? '' }),
          12_000,
          'Sign-in',
        );
        if (error) throw error;

        // Fetch backend profile (may fail if server is starting up — fall back gracefully)
        try {
          const res = await api.auth.me();
          const u = apiUserToUser(res.user);
          set({
            user: u,
            isLoggedIn: true,
            gamesPlayed: {
              chess:    res.user.chess?.games    ?? 0,
              checkers: res.user.checkers?.games ?? 0,
            },
          });
        } catch (profileErr) {
          console.warn('[login] Backend profile fetch failed, using Supabase session data', profileErr);
          // Still log the user in using Supabase metadata so they aren't blocked
          const meta = data.user?.user_metadata || {};
          set({
            user: {
              id:            data.user!.id,
              name:          meta.username || email.split('@')[0],
              email:         data.user!.email || email,
              country:       meta.country || '',
              walletBalance: 0,
              currency:      'USD',
              rating:        { chess: 1500, checkers: 1450 },
              wins:          0,
              losses:        0,
              draws:         0,
              betsWon:       0,
              betsLost:      0,
            },
            isLoggedIn: true,
          });
        }
        // Reconnect socket with the fresh auth token so the server
        // recognises this user for rated games / money games.
        const token = data?.session?.access_token || null;
        reconnectWithToken(token);
      },
      logout: async () => {
        if (supabase) await supabase.auth.signOut();
        reconnectWithToken(null);
        set({ user: null, isLoggedIn: false, ratingHistory: [], gamesPlayed: { chess: 0, checkers: 0 } });
      },
      updateBalance: (amount) => {
        set((s) => {
          if (!s.user) return {};
          const newBalance = s.user.walletBalance + amount;
          // Synchronize with backend for persistence
          if (amount > 0) {
            api.wallet.deposit(amount).catch(err => {
              console.error('Sync deposit failed', err);
              useNotificationStore.getState().addNotification('Wallet sync failed — please refresh', 'warning');
            });
          } else if (amount < 0) {
            api.wallet.withdraw(Math.abs(amount)).catch(err => {
              console.error('Sync withdrawal failed', err);
              useNotificationStore.getState().addNotification('Wallet sync failed — please refresh', 'warning');
            });
          }
          return { user: { ...s.user, walletBalance: newBalance } };
        });
      },
      setWalletBalance: (balance) => {
        set((s) => s.user ? { user: { ...s.user, walletBalance: balance } } : {});
      },
      guestLogin: () => set({ user: makeGuestUser(), isLoggedIn: false }),
      saveUsername: async (newName, country) => {
        const res = await api.auth.updateProfile({ username: newName, ...(country !== undefined ? { country } : {}) });
        set((s) => s.user ? { user: { ...s.user, name: res.user.username, country: res.user.country || s.user.country } } : {});
      },
      updateProfile: (fields) => {
        set((s) => s.user ? { user: { ...s.user, ...fields } } : {});
      },
      updateRating: (entry) =>
        set((s) => {
          if (!s.user) return s;
          const uv = entry.universe;
          return {
            user: { ...s.user, rating: { ...s.user.rating, [uv]: entry.after } },
            gamesPlayed: { ...s.gamesPlayed, [uv]: (s.gamesPlayed[uv] || 0) + 1 },
            ratingHistory: [entry, ...s.ratingHistory].slice(0, 200),
          };
        }),
      updateBetStats: (result) =>
        set((s) => {
          if (!s.user) return s;
          return {
            user: {
              ...s.user,
              betsWon: s.user.betsWon + (result === 'win' ? 1 : 0),
              betsLost: s.user.betsLost + (result === 'loss' ? 1 : 0),
            }
          };
        }),
      restoreSession: async () => {
        if (!supabase) return;
        const { data: { session } } = await withTimeout<any>(
          supabase.auth.getSession(),
          10_000,
          'Session restore',
        ).catch(() => ({ data: { session: null } }));
        if (!session) return;
        try {
          const res = await api.auth.me();
          const u = apiUserToUser(res.user);
          // Reconnect socket with restored auth token
          const { data: { session } } = await supabase.auth.getSession();
          reconnectWithToken(session?.access_token || null);
          set({
            user: u,
            isLoggedIn: true,
            gamesPlayed: {
              chess:    res.user.chess?.games    ?? 0,
              checkers: res.user.checkers?.games ?? 0,
            },
          });
        } catch {
          set({ user: null, isLoggedIn: false });
        }
      },
      listenToAuthChanges: () => {
        if (!supabase) return;
        supabase.auth.onAuthStateChange((event: string, _session: unknown) => {
          if (event === 'SIGNED_OUT') {
            set({ user: null, isLoggedIn: false });
          } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            // Potentially trigger a profile fetch here
          }
        });
      },
    }),
    { name: 'damcash-user', partialize: (s) => ({ user: s.user, isLoggedIn: s.isLoggedIn, gamesPlayed: s.gamesPlayed, ratingHistory: s.ratingHistory }) }
  )
);

interface BettingStore {
  pendingBet: number;
  activeBet: Bet | null;
  betHistory: Bet[];
  setPendingBet: (amount: number) => void;
  placeBet: (amount: number, userId: string) => void;
  acceptBet: (betId: string, userId: string) => void;
  settleBet: (winner: string) => void;
  cancelBet: () => void;
}

export const useBettingStore = create<BettingStore>((set) => ({
  pendingBet: 0,
  activeBet: null,
  betHistory: [],
  setPendingBet: (amount) => set({ pendingBet: amount }),
  placeBet: (amount, userId) => {
    // NOTE: do NOT touch walletBalance here. The server escrows funds atomically
    // via prisma.$transaction() and pushes the authoritative balance via wallet:update.
    const bet: Bet = {
      id: `bet-${Date.now()}`,
      amount,
      currency: 'USD',
      status: 'pending',
      createdBy: userId,
    };
    set({ activeBet: bet, pendingBet: 0 });
  },
  acceptBet: (betId, userId) =>
    set((s) => {
      if (s.activeBet?.id === betId) {
        // Balance deduction is handled server-side via escrow. No client deduction.
        return { activeBet: { ...s.activeBet, status: 'active', acceptedBy: userId } };
      }
      return {};
    }),
  settleBet: (winner) =>
    set((s) => {
      if (!s.activeBet) return {};
      const settled: Bet = {
        ...s.activeBet,
        status: s.activeBet.createdBy === winner ? 'won' : 'lost',
      };
      return { activeBet: null, betHistory: [settled, ...s.betHistory] };
    }),
  cancelBet: () =>
    set((s) => {
      if (!s.activeBet) return {};
      // Balance refund is handled server-side. No client mutation.
      const cancelled: Bet = { ...s.activeBet, status: 'refunded' };
      return { activeBet: null, betHistory: [cancelled, ...s.betHistory] };
    }),
}));

interface NotificationStore {
  notifications: Array<{ id: string; message: string; type: 'info' | 'success' | 'error' | 'warning' }>;
  addNotification: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  addNotification: (message, type = 'info') => {
    const id = `notif-${Date.now()}`;
    set((s) => ({ notifications: [...s.notifications, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }));
    }, 4000);
  },
  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
}));
