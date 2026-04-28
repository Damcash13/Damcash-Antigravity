/**
 * Analysis Store — stores completed chess games for post-game review.
 * Each AnalysedGame contains full FEN snapshots per move plus
 * per-move evaluations generated client-side.
 */
import { create } from 'zustand';
import { Chess } from 'chess.js';

// ── Move classification ───────────────────────────────────────────────────────

export type MoveClass =
  | 'brilliant'   // !! — engine 1st choice AND not obvious
  | 'great'       // !  — engine top 3
  | 'best'        // engine 1st choice
  | 'good'        //    — within -0.30 of best
  | 'inaccuracy'  // ?! — −0.30 to −0.60
  | 'mistake'     // ?  — −0.60 to −1.20
  | 'blunder';    // ?? — worse than −1.20

export interface AnalysedMove {
  san:       string;    // e.g. "Nf3"
  from:      string;
  to:        string;
  fenBefore: string;    // position before the move
  fenAfter:  string;    // position after the move
  evalBefore: number;   // centipawns from White's perspective
  evalAfter:  number;
  delta:      number;   // evalAfter - evalBefore (from the moving side)
  class:      MoveClass;
  bestSan?:   string;   // engine's top suggestion if different
  bestEval?:  number;
}

export interface AnalysedGame {
  id:       string;
  playedAt: number;
  universe: 'chess' | 'checkers';
  white:    string;
  black:    string;
  tc:       string;
  result:   string;     // "1-0" | "0-1" | "1/2-1/2" | "*"
  moves:    AnalysedMove[];
  // Accuracy: 0-100 for each side
  whiteAccuracy: number;
  blackAccuracy: number;
}

// ── Pseudo-engine evaluation (client-side, no WASM) ──────────────────────────
// Uses simple heuristics: material count + mobility + check bonuses.
// Real production would use Stockfish WASM.

const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0,
};

function materialEval(chess: Chess): number {
  let score = 0;
  const board = chess.board();
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      const val = PIECE_VALUES[sq.type] ?? 0;
      score += sq.color === 'w' ? val : -val;
    }
  }
  // Mobility bonus (rough)
  const mobility = chess.moves().length;
  score += chess.turn() === 'w' ? mobility * 5 : -mobility * 5;
  // Check penalty
  if (chess.isCheck()) score += chess.turn() === 'w' ? -50 : 50;
  return score; // centipawns, positive = white advantage
}

function classifyDelta(delta: number): MoveClass {
  // delta = eval improvement for moving side (negative = bad)
  if (delta >= 50)  return 'brilliant';
  if (delta >= 20)  return 'great';
  if (delta >= -10) return 'best';
  if (delta >= -30) return 'good';
  if (delta >= -60) return 'inaccuracy';
  if (delta >= -120) return 'mistake';
  return 'blunder';
}

// Accuracy formula (similar to Lichess / Chess.com)
// winChance from eval in centipawns
function winChance(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

function movAccuracy(wcBefore: number, wcAfter: number): number {
  const diff = Math.abs(wcAfter - wcBefore);
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * diff) - 3.1669));
}

/**
 * Given a list of SAN moves and an initial FEN, produce full analysis.
 */
export function analyseGame(
  sans: string[],
  startFen: string,
  white: string,
  black: string,
  tc: string,
  result: string,
): AnalysedGame {
  const moves: AnalysedMove[] = [];
  const chess  = new Chess(startFen);
  let   wAcc   = 0, bAcc = 0, wCount = 0, bCount = 0;

  for (const san of sans) {
    const fenBefore  = chess.fen();
    const evalBefore = materialEval(chess);
    const isWhite    = chess.turn() === 'w';

    // Best move heuristic: pick highest-eval legal move
    const legalMoves = chess.moves({ verbose: true });
    let bestSan  = san;
    let bestEval = evalBefore;

    for (const lm of legalMoves) {
      const probe = new Chess(fenBefore);
      probe.move(lm.san);
      const e = materialEval(probe);
      if (isWhite ? e > bestEval : e < bestEval) {
        bestEval = e;
        bestSan  = lm.san;
      }
    }

    // Actually make the move
    const moveResult = chess.move(san);
    if (!moveResult) break;

    const fenAfter  = chess.fen();
    const evalAfter = materialEval(chess);

    // Delta from moving side's perspective
    const delta = isWhite
      ? evalAfter - evalBefore
      : -(evalAfter - evalBefore);

    const bestDelta = isWhite
      ? bestEval - evalBefore
      : -(bestEval - evalBefore);

    const cls = classifyDelta(delta - (bestSan !== san ? bestDelta : 0));

    // Accuracy for this move
    const wcBefore = isWhite ? winChance(evalBefore) : 100 - winChance(evalBefore);
    const wcAfter  = isWhite ? winChance(evalAfter)  : 100 - winChance(evalAfter);
    const acc = movAccuracy(wcBefore, wcAfter);

    if (isWhite) { wAcc += acc; wCount++; }
    else         { bAcc += acc; bCount++; }

    moves.push({
      san,
      from:      moveResult.from,
      to:        moveResult.to,
      fenBefore,
      fenAfter,
      evalBefore,
      evalAfter,
      delta,
      class: cls,
      bestSan:  bestSan !== san ? bestSan : undefined,
      bestEval: bestSan !== san ? bestEval : undefined,
    });
  }

  return {
    id:            `analysis-${Date.now()}`,
    playedAt:      Date.now(),
    universe:      'chess',
    white, black, tc, result,
    moves,
    whiteAccuracy: wCount > 0 ? Math.round(wAcc / wCount) : 100,
    blackAccuracy: bCount > 0 ? Math.round(bAcc / bCount) : 100,
  };
}

// ── Zustand store ─────────────────────────────────────────────────────────────

interface AnalysisStore {
  games:       AnalysedGame[];
  currentGame: AnalysedGame | null;
  saveGame:    (game: AnalysedGame) => void;
  setCurrentGame: (game: AnalysedGame | null) => void;
  getById:     (id: string) => AnalysedGame | undefined;
}

export const useAnalysisStore = create<AnalysisStore>((set, get) => ({
  games:       [],
  currentGame: null,
  saveGame: (game) =>
    set(s => ({ games: [game, ...s.games].slice(0, 50) })),
  setCurrentGame: (game) => set({ currentGame: game }),
  getById: (id) => get().games.find(g => g.id === id),
}));
