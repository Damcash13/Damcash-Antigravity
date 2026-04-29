import { create } from 'zustand';
import { Universe } from '../types';
import { supabase } from '../lib/supabase';

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
  configTarget: { socketId: string; name: string } | null;  // null = create open room
  configOpen: boolean;
  openConfig: (target?: { socketId: string; name: string }) => void;
  closeConfig: () => void;
  initPresence: (username: string, rating: { chess: number; checkers: number }) => void;
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
    if (!supabase) return;

    // Avoid multiple subscriptions
    if ((window as any).__presenceChannel) return;

    const channel = supabase.channel('lobby', {
      config: {
        presence: {
          key: username,
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
            name: key,
            rating: p.rating || { chess: 1500, checkers: 1450 },
            status: p.status || 'idle',
            universe: p.universe || 'chess',
          });
        }
        set({ onlinePlayers: players });
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            online_at: new Date().toISOString(),
            rating,
            socketId: username, // Use username as unique key for now
          });
        }
      });
  },
}));
