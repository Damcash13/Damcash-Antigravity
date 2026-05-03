import { create } from 'zustand';

export type TimeCategory = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'overall';

export interface LeaderboardEntry {
  rank:         number;
  id:           string;
  name:         string;
  title?:       'GM' | 'IM' | 'FM' | 'CM' | 'NM';
  country:      string;
  rating:       number;
  peak:         number;
  gamesPlayed:  number;
  wins:         number;
  draws:        number;
  losses:       number;
  streak:       number;
  online:       boolean;
  ratingHistory: number[];
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface LeaderboardState {
  chess:    Record<TimeCategory, LeaderboardEntry[]>;
  checkers: Record<TimeCategory, LeaderboardEntry[]>;
  loading:  boolean;
  error:    string | null;
  fetchLeaderboard: (universe: 'chess' | 'checkers', category?: TimeCategory) => Promise<void>;
}

const emptyCategory = (): Record<TimeCategory, LeaderboardEntry[]> => ({
  overall: [], bullet: [], blitz: [], rapid: [], classical: [],
});

export const useLeaderboardStore = create<LeaderboardState>((set) => ({
  chess:    emptyCategory(),
  checkers: emptyCategory(),
  loading:  false,
  error:    null,

  fetchLeaderboard: async (universe, category = 'overall') => {
    set({ loading: true, error: null });
    try {
      const { api } = await import('../lib/api');
      const data = await api.leaderboard.list({ universe, category });
      const mapped: LeaderboardEntry[] = (data ?? []).map((d, i) => {
        const rating = universe === 'chess' ? d.chessRating : d.checkersRating;
        const peak   = universe === 'chess' ? d.peakChessRating : d.peakCheckersRating;
        const games  = universe === 'chess' ? d.chessGames  : d.checkersGames;
        const wins   = universe === 'chess' ? d.chessWins   : d.checkersWins;
        const losses = universe === 'chess' ? d.chessLosses : d.checkersLosses;
        const draws  = universe === 'chess' ? d.chessDraws  : d.checkersDraws;
        return {
          rank: d.rank ?? (i + 1),
          id:   d.id,
          name: d.username,
          country: '🏴',
          rating, peak, gamesPlayed: games,
          wins, losses, draws,
          streak: 0,
          online: false,
          ratingHistory: [],
        };
      });
      set(s => ({
        ...s,
        loading: false,
        error: null,
        [universe]: { ...s[universe], [category]: mapped },
      }));
    } catch (err: any) {
      set({ loading: false, error: err.message || 'Failed to load leaderboard' });
    }
  },
}));
