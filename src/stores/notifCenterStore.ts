import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Types ──────────────────────────────────────────────────────────────────────

export type NotifType =
  | 'challenge'       // incoming game invite
  | 'game_result'     // game ended + rating change
  | 'friend_request'  // friend request received
  | 'friend_accepted' // they accepted yours
  | 'tournament'      // tournament starting / round result
  | 'system';         // info message

export interface CenterNotif {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  icon?: string;        // emoji
  link?: string;        // navigate on click
  read: boolean;
  createdAt: number;
  meta?: Record<string, any>;
}

interface NotifCenterStore {
  notifs: CenterNotif[];
  unread: number;
  push: (n: Omit<CenterNotif, 'id' | 'read' | 'createdAt'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

export const useNotifCenterStore = create<NotifCenterStore>()(
  persist(
    (set) => ({
      notifs: [],
      unread: 0,

      push: (n) => {
        const notif: CenterNotif = {
          ...n,
          id: `nc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          read: false,
          createdAt: Date.now(),
        };
        set((s) => ({
          notifs: [notif, ...s.notifs].slice(0, 100),
          unread: s.unread + 1,
        }));
      },

      markRead: (id) =>
        set((s) => ({
          notifs: s.notifs.map(n => n.id === id ? { ...n, read: true } : n),
          unread: Math.max(0, s.unread - (s.notifs.find(n => n.id === id && !n.read) ? 1 : 0)),
        })),

      markAllRead: () =>
        set((s) => ({
          notifs: s.notifs.map(n => ({ ...n, read: true })),
          unread: 0,
        })),

      clear: () => set({ notifs: [], unread: 0 }),
    }),
    { name: 'damcash-notifications' }
  )
);
