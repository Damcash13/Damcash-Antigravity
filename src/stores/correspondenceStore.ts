import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useUserStore } from './index';
import type { ApiCorrGame } from '../lib/api';

export type CorrStatus = 'waiting' | 'active' | 'ended';
export type CorrResult = 'white' | 'black' | 'draw' | null;

export interface CorrMove {
  from?: string;
  to?: string;
  san: string;
  fen?: string;           // chess FEN after move, OR serialized draughts board JSON
  movedAt: number;        // timestamp
  player: 'white' | 'black';
}

export interface CorrGame {
  id: string;
  universe: 'chess' | 'checkers';
  timePerMove: number;    // ms per move (e.g. 86400000 = 1 day)
  whitePlayer: string;
  blackPlayer: string;
  myColor: 'white' | 'black';
  moves: CorrMove[];
  currentTurn: 'white' | 'black';
  status: CorrStatus;
  result: CorrResult;
  resultReason?: string;
  createdAt: number;
  lastMovedAt: number;
  /** FEN for chess games, serialised string for draughts */
  currentPosition: string;
}

interface CorrespondenceStore {
  games: CorrGame[];
  fetchGames: () => Promise<void>;
  createGame: (opts: {
    universe: 'chess' | 'checkers';
    timePerMove: number;
    myName: string;
    opponentName?: string;
  }) => Promise<CorrGame>;
  joinGame: (gameId: string, myName: string) => void;
  makeMove: (gameId: string, move: Omit<CorrMove, 'movedAt' | 'player'>) => Promise<void>;
  resignGame: (gameId: string) => Promise<void>;
  offerDraw: (gameId: string) => Promise<void>;
  getGame: (gameId: string) => CorrGame | undefined;
}

const INITIAL_CHESS_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function mapApiGame(g: ApiCorrGame): CorrGame {
  const currentUserId = useUserStore.getState().user?.id;
  return {
    id: g.id,
    universe: g.universe === 'checkers' ? 'checkers' : 'chess',
    timePerMove: g.timePerMove,
    whitePlayer: g.white.username,
    blackPlayer: g.black?.username ?? 'Waiting for opponent...',
    myColor: currentUserId && g.blackId === currentUserId ? 'black' : 'white',
    moves: (Array.isArray(g.moves) ? g.moves : []) as CorrMove[],
    currentTurn: g.currentTurn === 'black' ? 'black' : 'white',
    status: (g.status === 'active' || g.status === 'ended') ? g.status : 'waiting',
    result: (g.result === 'white' || g.result === 'black' || g.result === 'draw') ? g.result : null,
    resultReason: g.resultReason ?? undefined,
    createdAt: new Date(g.createdAt).getTime(),
    lastMovedAt: new Date(g.updatedAt).getTime(),
    currentPosition: g.currentPosition || (g.universe === 'chess' ? INITIAL_CHESS_FEN : 'initial'),
  };
}

export const useCorrespondenceStore = create<CorrespondenceStore>()(
  persist(
    (set, get) => ({
      games: [],

      fetchGames: async () => {
        try {
          const { api } = await import('../lib/api');
          const data = await api.correspondence.list();
          if (!data || data.length === 0) {
            set({ games: [] });
            return;
          }
          const mapped: CorrGame[] = data.map(mapApiGame);
          set({ games: mapped });
        } catch { /* Fallback to persisted localStorage data */ }
      },

      createGame: async ({ universe, timePerMove, opponentName }) => {
        const { api } = await import('../lib/api');
        const created = await api.correspondence.create({ universe, timePerMove, opponentUsername: opponentName });
        const game = mapApiGame(created);
        set(s => ({ games: [game, ...s.games] }));
        return game;
      },

      joinGame: (gameId, myName) => {
        set(s => ({
          games: s.games.map(g =>
            g.id === gameId && g.status === 'waiting'
              ? { ...g, blackPlayer: myName, myColor: 'black', status: 'active' }
              : g
          ),
        }));
      },

      makeMove: async (gameId, move) => {
        const { api } = await import('../lib/api');
        const updated = await api.correspondence.move(gameId, move);
        const mapped = mapApiGame(updated);
        set(s => ({ games: s.games.map(g => g.id === gameId ? mapped : g) }));
      },

      resignGame: async (gameId) => {
        const { api } = await import('../lib/api');
        const updated = await api.correspondence.resign(gameId);
        const mapped = mapApiGame(updated);
        set(s => ({ games: s.games.map(g => g.id === gameId ? mapped : g) }));
      },

      offerDraw: async (gameId) => {
        const { api } = await import('../lib/api');
        const updated = await api.correspondence.draw(gameId);
        const mapped = mapApiGame(updated);
        set(s => ({ games: s.games.map(g => g.id === gameId ? mapped : g) }));
      },

      getGame: (gameId) => get().games.find(g => g.id === gameId),
    }),
    { name: 'damcash-correspondence' }
  )
);
