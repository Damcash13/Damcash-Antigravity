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
  prune: () => void;
  clear: () => void;
}

const MAX_CENTER_NOTIFS = 30;
const CENTER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CENTER_DEDUPE_MS = 30_000;

function pruneCenterNotifs(notifs: CenterNotif[], now = Date.now()) {
  return notifs
    .filter(n => now - n.createdAt <= CENTER_MAX_AGE_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_CENTER_NOTIFS);
}

function unreadCount(notifs: CenterNotif[]) {
  return notifs.filter(n => !n.read).length;
}

export const useNotifCenterStore = create<NotifCenterStore>()(
  persist(
    (set) => ({
      notifs: [],
      unread: 0,

      push: (n) => {
        const now = Date.now();
        const notif: CenterNotif = {
          ...n,
          id: `nc-${now}-${Math.random().toString(36).slice(2, 6)}`,
          read: false,
          createdAt: now,
        };
        set((s) => {
          const current = pruneCenterNotifs(s.notifs, now);
          const duplicate = current.some(existing =>
            existing.type === notif.type &&
            existing.title === notif.title &&
            existing.body === notif.body &&
            now - existing.createdAt < CENTER_DEDUPE_MS
          );
          if (duplicate) return { notifs: current, unread: unreadCount(current) };
          const next = pruneCenterNotifs([notif, ...current], now);
          return { notifs: next, unread: unreadCount(next) };
        });
      },

      markRead: (id) =>
        set((s) => {
          const next = pruneCenterNotifs(s.notifs.map(n => n.id === id ? { ...n, read: true } : n));
          return { notifs: next, unread: unreadCount(next) };
        }),

      markAllRead: () =>
        set((s) => {
          const next = pruneCenterNotifs(s.notifs.map(n => ({ ...n, read: true })));
          return { notifs: next, unread: 0 };
        }),

      prune: () =>
        set((s) => {
          const next = pruneCenterNotifs(s.notifs);
          return { notifs: next, unread: unreadCount(next) };
        }),

      clear: () => set({ notifs: [], unread: 0 }),
    }),
    { name: 'damcash-notifications' }
  )
);
