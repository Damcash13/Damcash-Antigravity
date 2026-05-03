import { create } from 'zustand';
import { api, ApiTournament } from '../lib/api';

export type TournamentFormat = 'arena' | 'swiss' | 'roundrobin';
export type TournamentStatus = 'upcoming' | 'running' | 'finished';

export interface TournamentPlayer {
  id: string;
  userId: string;
  name: string;
  rating: number;
  score: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  performance: number;
  fire: boolean;
}

// Tournament games are sourced from the Match table; for now the tab shows
// real matches from api.users.games. We keep a lightweight shape here for
// any games surfaced via the tournament-specific API in the future.
export interface TournamentGame {
  id: string;
  white: string;
  black: string;
  result: '1-0' | '0-1' | '½-½' | '*';
  moves: number;
  duration: string;
  playedAt: number;
}

export interface Tournament {
  id: string;
  name: string;
  icon: string;
  universe: 'chess' | 'checkers';
  format: TournamentFormat;
  timeControl: string;
  rated: boolean;
  betEntry: number;
  prizePool: number;
  startsAt: number;
  durationMs: number;
  maxPlayers: number;
  players: TournamentPlayer[];
  games: TournamentGame[];
  status: TournamentStatus;
  currentRound: number;
  totalRounds: number;
  description: string;
}

// ── Map API response → local shape ───────────────────────────────────────────

function mapApiTournament(t: ApiTournament): Tournament {
  const players: TournamentPlayer[] = (t.players ?? []).map(p => {
    const games    = p.wins + p.draws + p.losses;
    const score    = p.wins * 2 + p.draws;           // arena scoring (for standings display)
    // Performance uses standard scoring (1/0.5/0) with 5 virtual draws for
    // Bayesian dampening — prevents wild swings on small sample sizes.
    const DAMPEN   = 5;
    const adjPct   = (p.wins + p.draws * 0.5 + DAMPEN * 0.5) / (games + DAMPEN);
    const perf     = Math.round(p.rating + 800 * (adjPct - 0.5));
    return {
      id:          p.id,
      userId:      p.userId,
      name:        p.user.username,
      rating:      p.rating,
      score:       p.score ?? score,
      games,
      wins:        p.wins,
      draws:       p.draws,
      losses:      p.losses,
      performance: perf,
      fire:        p.wins >= 2 && p.losses === 0,
    };
  });

  return {
    id:           t.id,
    name:         t.name,
    icon:         t.icon,
    universe:     t.universe as 'chess' | 'checkers',
    format:       t.format as TournamentFormat,
    timeControl:  t.timeControl,
    rated:        t.rated,
    betEntry:     t.betEntry,
    prizePool:    t.prizePool,
    startsAt:     new Date(t.startsAt).getTime(),
    durationMs:   t.durationMs,
    maxPlayers:   t.maxPlayers,
    players,
    games:        [],          // tournament-specific games not yet tracked in DB
    status:       t.status as TournamentStatus,
    currentRound: 0,
    totalRounds:  t.totalRounds,
    description:  t.description,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface TournamentStore {
  tournaments:      Tournament[];
  loading:          boolean;
  fetchTournaments: () => Promise<void>;
  fetchOne:         (id: string) => Promise<void>;
  joinTournament:   (id: string) => Promise<void>;
  leaveTournament:  (id: string) => Promise<void>;
  getById:          (id: string) => Tournament | undefined;
}

export const useTournamentStore = create<TournamentStore>((set, get) => ({
  tournaments: [],
  loading:     false,

  fetchTournaments: async () => {
    set({ loading: true });
    try {
      const data = await api.tournaments.list();
      set({ tournaments: data.map(mapApiTournament), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchOne: async (id) => {
    try {
      const [data, games] = await Promise.all([
        api.tournaments.get(id),
        api.tournaments.games(id).catch(() => [])
      ]);
      const mapped = mapApiTournament(data);
      mapped.games = games;
      set(s => ({
        tournaments: s.tournaments.some(t => t.id === id)
          ? s.tournaments.map(t => t.id === id ? mapped : t)
          : [...s.tournaments, mapped],
      }));
    } catch {}
  },

  joinTournament: async (id) => {
    await api.tournaments.join(id);
    // Refresh this tournament so standings reflect the new player
    await get().fetchOne(id);
  },

  leaveTournament: async (id) => {
    await api.tournaments.leave(id);
    await get().fetchOne(id);
  },

  getById: (id) => get().tournaments.find(t => t.id === id),
}));
