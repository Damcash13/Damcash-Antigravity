import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/api';
import { useUserStore } from './index';
import type { Universe } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Friend {
  id: string;           // their socket ID (ephemeral) or persistent username
  name: string;
  country?: string;
  rating: { chess: number; checkers: number };
  online: boolean;
  status: 'idle' | 'playing' | 'seeking';
  universe?: Universe;
  socketId?: string;    // current socket if online
  currentTC?: string;   // time control they're playing/seeking (e.g. '5+0')
  addedAt: number;
}

export interface FriendRequest {
  id: string;
  fromName: string;
  fromSocketId: string;
  fromRating: { chess: number; checkers: number };
  sentAt: number;
  direction: 'incoming' | 'outgoing';
}

interface FriendsStore {
  friends: Friend[];
  requests: FriendRequest[];
  // Mutations
  addFriend: (f: Friend) => void;
  removeFriend: (name: string) => void;
  updateOnline: (socketId: string, online: boolean, status?: Friend['status']) => void;
  syncOnlinePlayers: (players: Array<{ socketId: string; name: string; rating: any; status: string; universe?: Universe; country?: string; currentTC?: string }>) => void;
  addRequest: (r: FriendRequest) => void;
  removeRequest: (id: string) => void;
  initialize: () => Promise<void>;
}

export const useFriendsStore = create<FriendsStore>()(
  persist(
    (set) => ({
      friends: [],
      requests: [],

      addFriend: (f) =>
        set((s) => ({
          friends: s.friends.find(x => x.name === f.name)
            ? s.friends
            : [f, ...s.friends],
          requests: s.requests.filter(r => r.fromName !== f.name),
        })),

      removeFriend: (name) =>
        set((s) => ({ friends: s.friends.filter(f => f.name !== name) })),

      updateOnline: (socketId, online, status = 'idle') =>
        set((s) => ({
          friends: s.friends.map(f =>
            f.socketId === socketId || (online && f.name === socketId)
              ? { ...f, online, status, socketId: online ? socketId : undefined }
              : f
          ),
        })),

      syncOnlinePlayers: (players) =>
        set((s) => ({
          friends: s.friends.map(f => {
            const match = players.find(p => p.name === f.name);
            return match
              ? { ...f, online: true, socketId: match.socketId, status: match.status as Friend['status'], universe: match.universe, country: match.country || f.country, rating: match.rating || f.rating, currentTC: match.currentTC || undefined }
              : { ...f, online: false, socketId: undefined, universe: undefined, currentTC: undefined };
          }),
        })),

      addRequest: (r) =>
        set((s) => ({
          requests: s.requests.find(x => x.id === r.id)
            ? s.requests
            : [r, ...s.requests].slice(0, 20),
        })),

      removeRequest: (id) =>
        set((s) => ({ requests: s.requests.filter(r => r.id !== id) })),

      initialize: async () => {
        // Skip API call if user is not authenticated — avoids 401 errors
        // and "non-JSON response" errors when the backend returns HTML.
        const { user, isLoggedIn } = useUserStore.getState();
        if (!user || user.id === 'guest' || !isLoggedIn) return;

        try {
          const { friends: dbFriends, incoming, outgoing } = await api.friends.list();
          
          set({
            friends: dbFriends.map(f => {
              const friendUser = f.requesterId === f.requester.id ? f.addressee : f.requester;
              return {
                id: friendUser.id,
                name: friendUser.username,
                country: friendUser.country || '',
                rating: { chess: friendUser.chessRating ?? 1500, checkers: friendUser.checkersRating ?? 1450 },
                online: false,
                status: 'idle',
                addedAt: new Date(f.createdAt).getTime(),
              };
            }),
            requests: [
              ...incoming.map(r => ({
                id: r.id,
                fromName: r.requester.username,
                fromSocketId: '',
                fromRating: { chess: r.requester.chessRating ?? 1500, checkers: r.requester.checkersRating ?? 1450 },
                sentAt: new Date(r.createdAt).getTime(),
                direction: 'incoming' as const
              })),
              ...outgoing.map(r => ({
                id: r.id,
                fromName: r.addressee.username,
                fromSocketId: '',
                fromRating: { chess: r.addressee.chessRating ?? 1500, checkers: r.addressee.checkersRating ?? 1450 },
                sentAt: new Date(r.createdAt).getTime(),
                direction: 'outgoing' as const
              }))
            ]
          });
        } catch (e) {
          console.error('Failed to initialize friends', e);
        }
      }
    }),
    { name: 'damcash-friends' }
  )
);
