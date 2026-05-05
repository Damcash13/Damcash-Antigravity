import { create } from 'zustand';
import { Universe } from '../types';
import { supabase } from '../lib/supabase';
import { socket } from '../lib/socket';
import { useUniverseStore, useUserStore } from './index';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GameConfig {
  universe: Universe;
  timeControl: string;      // e.g. "5+0"
  betAmount: number;        // 0 = no bet
  colorPref: 'white' | 'black' | 'random';
  rated: boolean;
}

export const DEFAULT_CONFIG: GameConfig = {
  universe: 'chess',
  timeControl: '5+0',
  betAmount: 0,
  colorPref: 'random',
  rated: true,
};

export interface OnlinePlayer {
  socketId: string;
  name: string;
  rating: { chess: number; checkers: number };
  status: 'idle' | 'playing' | 'seeking';
  universe: Universe;
  country?: string;
  currentTC?: string;
}

export interface IncomingInvite {
  inviteId: string;          // unique per invite
  fromSocketId: string;
  fromName: string;
  fromRating: number;
  config: GameConfig;
  roomCode?: string;         // pre-created room if inviter already set up
  expiresAt: number;
}

interface InviteStore {
  // Online players
  onlinePlayers: OnlinePlayer[];
  setOnlinePlayers: (players: OnlinePlayer[]) => void;
  upsertPlayer: (p: OnlinePlayer) => void;
  removePlayer: (socketId: string) => void;

  // Pending incoming invites
  incoming: IncomingInvite[];
  addIncoming: (inv: IncomingInvite) => void;
  dismissIncoming: (inviteId: string) => void;
  clearIncoming: () => void;

  // Room code (for the "share code" flow)
  myRoomCode: string | null;
  myRoomConfig: GameConfig | null;
  setMyRoom: (code: string, config: GameConfig) => void;
  clearMyRoom: () => void;

  // Config modal state
  configTarget: { socketId: string; name: string; universe?: Universe } | null;  // null = create open room
  configOpen: boolean;
  openConfig: (target?: { socketId: string; name: string; universe?: Universe }) => void;
  closeConfig: () => void;
  initPresence: (username: string, rating: { chess: number; checkers: number }) => void;
  updatePresenceUniverse: (universe: Universe) => void;
}

export const useInviteStore = create<InviteStore>((set) => ({
  onlinePlayers: [],
  setOnlinePlayers: (onlinePlayers) => set({ onlinePlayers }),
  upsertPlayer: (p) =>
    set((s) => {
      const exists = s.onlinePlayers.find((x) => x.socketId === p.socketId);
      return {
        onlinePlayers: exists
          ? s.onlinePlayers.map((x) => (x.socketId === p.socketId ? p : x))
          : [p, ...s.onlinePlayers].slice(0, 100),
      };
    }),
  removePlayer: (socketId) =>
    set((s) => ({ onlinePlayers: s.onlinePlayers.filter((p) => p.socketId !== socketId) })),

  incoming: [],
  addIncoming: (inv) =>
    set((s) => ({ incoming: [inv, ...s.incoming].slice(0, 5) })),
  dismissIncoming: (inviteId) =>
    set((s) => ({ incoming: s.incoming.filter((i) => i.inviteId !== inviteId) })),
  clearIncoming: () => set({ incoming: [] }),

  myRoomCode: null,
  myRoomConfig: null,
  setMyRoom: (code, config) => set({ myRoomCode: code, myRoomConfig: config }),
  clearMyRoom: () => set({ myRoomCode: null, myRoomConfig: null }),

  configTarget: null,
  configOpen: false,
  openConfig: (target) => set({ configOpen: true, configTarget: target ?? null }),
  closeConfig: () => set({ configOpen: false, configTarget: null }),

  initPresence: (username, rating) => {
    if (!supabase || !socket) return;

    // Avoid multiple subscriptions
    if ((window as any).__presenceChannel) return;

    // Use the authenticated user's stable DB id as the presence key so two
    // accounts with the same display name don't collide. Fall back to the
    // current socket id for unauthenticated guests.
    const userId = useUserStore.getState().user?.id;
    const presenceKey: string = userId ?? socket.id ?? username;

    const channel = supabase.channel('lobby', {
      config: {
        presence: {
          key: presenceKey,
        },
      },
    });

    (window as any).__presenceChannel = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const players: OnlinePlayer[] = [];

        for (const key in state) {
          const p = (state[key] as any)[0];
          players.push({
            socketId: p.socketId || key,
            name: p.username || key,
            rating: p.rating || { chess: 1500, checkers: 1450 },
            status: p.status || 'idle',
            universe: p.universe || 'chess',
            currentTC: p.currentTC || undefined,
          });
        }
        set({ onlinePlayers: players });
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          const sId = socket.id;
          await channel.track({
            online_at: new Date().toISOString(),
            username,
            rating,
            socketId: sId,
            universe: useUniverseStore.getState().universe,
          });
        }
      });
  },

  updatePresenceUniverse: (universe) => {
    socket.emit('player:update-universe', { universe });

    const channel = (window as any).__presenceChannel;
    const user = useUserStore.getState().user;
    if (!channel || !user) return;

    channel.track({
      online_at: new Date().toISOString(),
      username: user.name,
      rating: user.rating,
      socketId: socket.id,
      universe,
    });
  },
}));
