import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const normalizeName = (name: string) => name.trim().toLowerCase();

interface SafetyStore {
  blockedUsers: string[];
  mutedUsers: string[];
  blockUser: (username: string) => void;
  unblockUser: (username: string) => void;
  muteUser: (username: string) => void;
  unmuteUser: (username: string) => void;
  isBlocked: (username: string) => boolean;
  isMuted: (username: string) => boolean;
  setBlockedUsers: (usernames: string[]) => void;
}

export const useSafetyStore = create<SafetyStore>()(
  persist(
    (set, get) => ({
      blockedUsers: [],
      mutedUsers: [],

      blockUser: (username) => {
        const key = normalizeName(username);
        if (!key) return;
        set((state) => ({
          blockedUsers: state.blockedUsers.includes(key)
            ? state.blockedUsers
            : [...state.blockedUsers, key],
          mutedUsers: state.mutedUsers.includes(key)
            ? state.mutedUsers
            : [...state.mutedUsers, key],
        }));
      },

      unblockUser: (username) => {
        const key = normalizeName(username);
        set((state) => ({
          blockedUsers: state.blockedUsers.filter((name) => name !== key),
        }));
      },

      muteUser: (username) => {
        const key = normalizeName(username);
        if (!key) return;
        set((state) => ({
          mutedUsers: state.mutedUsers.includes(key)
            ? state.mutedUsers
            : [...state.mutedUsers, key],
        }));
      },

      unmuteUser: (username) => {
        const key = normalizeName(username);
        set((state) => ({
          mutedUsers: state.mutedUsers.filter((name) => name !== key),
        }));
      },

      isBlocked: (username) => get().blockedUsers.includes(normalizeName(username)),
      isMuted: (username) => get().mutedUsers.includes(normalizeName(username)),

      setBlockedUsers: (usernames) => {
        const normalized = Array.from(new Set(usernames.map(normalizeName).filter(Boolean)));
        set({ blockedUsers: normalized });
      },
    }),
    { name: 'damcash-safety' },
  ),
);

