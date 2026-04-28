import { DraughtsBoard, DraughtsPiece, DraughtsMove, Position, Color } from '../types';

// International Draughts (FMJD rules) — 10×10 board
// Only dark squares are playable (row+col is odd for 0-indexed)

export function createInitialBoard(): DraughtsBoard {
  const board: DraughtsBoard = Array.from({ length: 10 }, () => Array(10).fill(null));
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 4) board[r][c] = { type: 'man', color: 'black' };
        else if (r > 5) board[r][c] = { type: 'man', color: 'white' };
      }
    }
  }
  return board;
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 10 && c >= 0 && c < 10;
}

function isPlayable(r: number, c: number): boolean {
  return (r + c) % 2 === 1;
}

export interface CaptureSequence {
  path: Position[];       // all squares visited (including start)
  captured: Position[];   // squares of captured pieces
}

// Get all raw capture sequences for a piece starting at (r, c)
function getCaptures(
  board: DraughtsBoard,
  r: number,
  c: number,
  color: Color,
  isKing: boolean,
  visited: Set<string> = new Set(),
  path: Position[] = [{ row: r, col: c }],
  captured: Position[] = []
): CaptureSequence[] {
  const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const sequences: CaptureSequence[] = [];
  let found = false;

  for (const [dr, dc] of dirs) {
    if (isKing) {
      // Flying king: scan along diagonal
      for (let dist = 1; dist < 10; dist++) {
        const er = r + dr * dist;
        const ec = c + dc * dist;
        if (!inBounds(er, ec)) break;
        const target = board[er][ec];
        if (!target) continue; // empty, keep looking for enemy
        if (target.color === color) break; // own piece blocks
        // Found enemy piece, check if landing squares beyond are free
        const captKey = `${er},${ec}`;
        if (visited.has(captKey)) break; // already captured this piece in this sequence
        // Check landing squares beyond enemy
        for (let land = dist + 1; land < 10; land++) {
          const lr = r + dr * land;
          const lc = c + dc * land;
          if (!inBounds(lr, lc)) break;
          if (board[lr][lc] !== null) break; // blocked
          // Can land here — continue sequence
          const newVisited = new Set(visited);
          newVisited.add(captKey);
          const newBoard = cloneBoard(board);
          newBoard[er][ec] = null;
          const newPath = [...path, { row: lr, col: lc }];
          const newCaptured = [...captured, { row: er, col: ec }];
          const sub = getCaptures(newBoard, lr, lc, color, true, newVisited, newPath, newCaptured);
          if (sub.length > 0) {
            sequences.push(...sub);
          } else {
            sequences.push({ path: newPath, captured: newCaptured });
          }
          found = true;
        }
        break; // can only jump over one piece per diagonal direction scan
      }
    } else {
      // Man: captures in all 4 diagonal directions (including backward)
      const er = r + dr;
      const ec = c + dc;
      const lr = r + dr * 2;
      const lc = c + dc * 2;
      if (!inBounds(er, ec) || !inBounds(lr, lc)) continue;
      const target = board[er][ec];
      if (!target || target.color === color) continue;
      const captKey = `${er},${ec}`;
      if (visited.has(captKey)) continue;
      if (board[lr][lc] !== null) continue; // landing square occupied
      const newVisited = new Set(visited);
      newVisited.add(captKey);
      const newBoard = cloneBoard(board);
      newBoard[er][ec] = null;
      const newPath = [...path, { row: lr, col: lc }];
      const newCaptured = [...captured, { row: er, col: ec }];
      // FMJD rule: a man reaching the kings row during a multi-capture must stop
      const reachedKingsRow = (color === 'white' && lr === 0) || (color === 'black' && lr === 9);
      if (reachedKingsRow) {
        sequences.push({ path: newPath, captured: newCaptured });
      } else {
        const sub = getCaptures(newBoard, lr, lc, color, false, newVisited, newPath, newCaptured);
        if (sub.length > 0) {
          sequences.push(...sub);
        } else {
          sequences.push({ path: newPath, captured: newCaptured });
        }
      }
      found = true;
    }
  }
  if (!found && captured.length > 0) {
    return [{ path, captured }];
  }
  return sequences;
}

function cloneBoard(board: DraughtsBoard): DraughtsBoard {
  return board.map(row => row.map(cell => cell ? { ...cell } : null));
}

// Get all legal moves for the current player (international rules: mandatory max capture)
export function getLegalMoves(board: DraughtsBoard, color: Color): DraughtsMove[] {
  const allCaptures: CaptureSequence[] = [];
  const simpleMoves: DraughtsMove[] = [];

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== color) continue;
      const isKing = piece.type === 'king';
      const caps = getCaptures(board, r, c, color, isKing);
      allCaptures.push(...caps);
    }
  }

  // Mandatory capture + maximum capture rule
  if (allCaptures.length > 0) {
    const maxLen = Math.max(...allCaptures.map(s => s.captured.length));
    return allCaptures
      .filter(s => s.captured.length === maxLen)
      .map(s => ({
        from: s.path[0],
        to: s.path[s.path.length - 1],
        captured: s.captured,
        promotesToKing: checkPromotion(board, s.path[0], s.path[s.path.length - 1], color),
      }));
  }

  // No captures: generate simple moves
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== color) continue;
      const isKing = piece.type === 'king';
      const dirs = isKing
        ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
        : color === 'white'
        ? [[-1, -1], [-1, 1]]
        : [[1, -1], [1, 1]];

      for (const [dr, dc] of dirs) {
        if (isKing) {
          for (let dist = 1; dist < 10; dist++) {
            const nr = r + dr * dist;
            const nc = c + dc * dist;
            if (!inBounds(nr, nc) || !isPlayable(nr, nc)) break;
            if (board[nr][nc] !== null) break;
            simpleMoves.push({
              from: { row: r, col: c },
              to: { row: nr, col: nc },
              promotesToKing: checkPromotion(board, { row: r, col: c }, { row: nr, col: nc }, color),
            });
          }
        } else {
          const nr = r + dr;
          const nc = c + dc;
          if (!inBounds(nr, nc) || !isPlayable(nr, nc)) continue;
          if (board[nr][nc] !== null) continue;
          simpleMoves.push({
            from: { row: r, col: c },
            to: { row: nr, col: nc },
            promotesToKing: checkPromotion(board, { row: r, col: c }, { row: nr, col: nc }, color),
          });
        }
      }
    }
  }
  return simpleMoves;
}

function checkPromotion(board: DraughtsBoard, from: Position, to: Position, color: Color): boolean {
  const piece = board[from.row][from.col];
  if (!piece || piece.type === 'king') return false;
  return color === 'white' ? to.row === 0 : to.row === 9;
}

export function applyMove(board: DraughtsBoard, move: DraughtsMove): DraughtsBoard {
  const newBoard = cloneBoard(board);
  const piece = newBoard[move.from.row][move.from.col]!;
  newBoard[move.from.row][move.from.col] = null;
  // Remove captured pieces
  if (move.captured) {
    for (const cap of move.captured) {
      newBoard[cap.row][cap.col] = null;
    }
  }
  // Place piece at destination
  const promoted = move.promotesToKing && piece.type === 'man';
  newBoard[move.to.row][move.to.col] = {
    type: promoted ? 'king' : piece.type,
    color: piece.color,
  };
  return newBoard;
}

export function isGameOver(board: DraughtsBoard, nextTurn: Color): { over: boolean; winner: Color | 'draw' | null } {
  const moves = getLegalMoves(board, nextTurn);
  if (moves.length === 0) {
    const opponent: Color = nextTurn === 'white' ? 'black' : 'white';
    return { over: true, winner: opponent };
  }
  // Check if current player has no pieces
  const hasPieces = board.some(row => row.some(cell => cell?.color === nextTurn));
  if (!hasPieces) {
    const opponent: Color = nextTurn === 'white' ? 'black' : 'white';
    return { over: true, winner: opponent };
  }
  return { over: false, winner: null };
}

// Simple AI: evaluate board (piece count + king bonus)
function evaluateBoard(board: DraughtsBoard, color: Color): number {
  let score = 0;
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      const val = cell.type === 'king' ? 3 : 1;
      score += cell.color === color ? val : -val;
    }
  }
  return score;
}

function minimax(
  board: DraughtsBoard,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  aiColor: Color
): number {
  const currentColor: Color = maximizing ? aiColor : (aiColor === 'white' ? 'black' : 'white');
  const moves = getLegalMoves(board, currentColor);
  if (depth === 0 || moves.length === 0) return evaluateBoard(board, aiColor);

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const newBoard = applyMove(board, move);
      const eval_ = minimax(newBoard, depth - 1, alpha, beta, false, aiColor);
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const newBoard = applyMove(board, move);
      const eval_ = minimax(newBoard, depth - 1, alpha, beta, true, aiColor);
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

export function getBestAIMove(board: DraughtsBoard, color: Color, depth = 4): DraughtsMove | null {
  const moves = getLegalMoves(board, color);
  if (moves.length === 0) return null;
  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const newBoard = applyMove(board, move);
    const score = minimax(newBoard, depth - 1, -Infinity, Infinity, false, color);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

// Get possible moves from a specific square (for UI highlighting)
export function getMovesFromSquare(board: DraughtsBoard, row: number, col: number, color: Color): DraughtsMove[] {
  const all = getLegalMoves(board, color);
  return all.filter(m => m.from.row === row && m.from.col === col);
}

export function formatMove(move: DraughtsMove): string {
  const fromNum = move.from.row * 5 + Math.floor(move.from.col / 2) + 1;
  const toNum = move.to.row * 5 + Math.floor(move.to.col / 2) + 1;
  return move.captured && move.captured.length > 0 ? `${fromNum}x${toNum}` : `${fromNum}-${toNum}`;
}
