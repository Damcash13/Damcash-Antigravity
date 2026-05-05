import { create } from 'zustand';

interface DirectMessageStore {
  open: boolean;
  initialUsername: string | null;
  unreadCount: number;
  openInbox: () => void;
  openConversation: (username: string) => void;
  close: () => void;
  setUnreadCount: (count: number) => void;
  bumpUnreadCount: () => void;
}

export const useDirectMessageStore = create<DirectMessageStore>((set) => ({
  open: false,
  initialUsername: null,
  unreadCount: 0,
  openInbox: () => set({ open: true, initialUsername: null }),
  openConversation: (username) => set({ open: true, initialUsername: username }),
  close: () => set({ open: false, initialUsername: null }),
  setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),
  bumpUnreadCount: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
}));

