import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export const useCorrespondenceStore = create<CorrespondenceStore>()(
  persist(
    (set, get) => ({
      games: [],

      fetchGames: async () => {
        try {
          const { api } = await import('../lib/api');
          const data = await api.correspondence.list();
          if (!data || data.length === 0) return;
          const mapped: CorrGame[] = data.map(g => ({
            id: g.id,
            universe: g.universe as 'chess' | 'checkers',
            timePerMove: g.timePerMove,
            whitePlayer: g.white.username,
            blackPlayer: g.black?.username ?? 'Waiting for opponent…',
            myColor: 'white' as const, // overridden per-game by the component
            moves: (g.moves as CorrMove[]) ?? [],
            currentTurn: g.currentTurn as 'white' | 'black',
            status: g.status as CorrStatus,
            result: (g.result as CorrResult) ?? null,
            resultReason: g.resultReason ?? undefined,
            createdAt: new Date(g.createdAt).getTime(),
            lastMovedAt: new Date(g.updatedAt).getTime(),
            currentPosition: g.currentPosition,
          }));
          // Merge: API records override local ones by id
          set(s => {
            const localIds = new Set(mapped.map(g => g.id));
            const kept = s.games.filter(g => !localIds.has(g.id));
            return { games: [...mapped, ...kept] };
          });
        } catch { /* Fallback to persisted localStorage data */ }
      },

      createGame: async ({ universe, timePerMove, myName, opponentName }) => {
        const game: CorrGame = {
          id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          universe,
          timePerMove,
          whitePlayer: myName,
          blackPlayer: opponentName || 'Waiting for opponent…',
          myColor: 'white',
          moves: [],
          currentTurn: 'white',
          status: opponentName ? 'active' : 'waiting',
          result: null,
          createdAt: Date.now(),
          lastMovedAt: Date.now(),
          currentPosition: universe === 'chess' ? INITIAL_CHESS_FEN : 'initial',
        };
        try {
          const { api } = await import('../lib/api');
          await api.correspondence.create({ universe, timePerMove, opponentUsername: opponentName });
        } catch {}
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
        // Optimistic
        set(s => ({
          games: s.games.map(g => {
            if (g.id !== gameId) return g;
            const player = g.currentTurn;
            const fullMove: CorrMove = { ...move, player, movedAt: Date.now() };
            return {
              ...g,
              moves: [...g.moves, fullMove],
              currentTurn: player === 'white' ? 'black' : 'white',
              lastMovedAt: Date.now(),
              currentPosition: move.fen || g.currentPosition,
            };
          }),
        }));
        try {
          const { api } = await import('../lib/api');
          await api.correspondence.move(gameId, move);
        } catch {}
      },

      resignGame: async (gameId) => {
        set(s => ({
          games: s.games.map(g => {
            if (g.id !== gameId) return g;
            const winner: CorrResult = g.myColor === 'white' ? 'black' : 'white';
            return { ...g, status: 'ended', result: winner, resultReason: 'resignation' };
          }),
        }));
        try {
          const { api } = await import('../lib/api');
          await api.correspondence.resign(gameId);
        } catch {}
      },

      offerDraw: async (gameId) => {
        set(s => ({
          games: s.games.map(g =>
            g.id === gameId ? { ...g, status: 'ended', result: 'draw', resultReason: 'agreement' } : g
          ),
        }));
        try {
          const { api } = await import('../lib/api');
          await api.correspondence.draw(gameId);
        } catch {}
      },

      getGame: (gameId) => get().games.find(g => g.id === gameId),
    }),
    { name: 'damcash-correspondence' }
  )
);
