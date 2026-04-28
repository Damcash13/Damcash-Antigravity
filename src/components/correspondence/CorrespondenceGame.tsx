import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess, Square } from 'chess.js';
import { useCorrespondenceStore, CorrGame } from '../../stores/correspondenceStore';
import { useUserStore } from '../../stores';
import { ChessBoard } from '../chess/ChessBoard';
import { DraughtsBoard as DraughtsBoardComponent } from '../draughts/DraughtsBoard';
import {
  createInitialBoard, getLegalMoves, applyMove, getMovesFromSquare, formatMove,
} from '../../engines/draughts.engine';
import { DraughtsBoard as DraughtsBoardType, DraughtsMove, Position } from '../../types';

// ── helpers ──────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

const TIME_LABELS: Record<number, string> = {
  [DAY_MS]:       '1 day/move',
  [3 * DAY_MS]:   '3 days/move',
  [7 * DAY_MS]:   '7 days/move',
  [14 * DAY_MS]:  '14 days/move',
};

function timeLeft(game: CorrGame): string {
  const deadline = game.lastMovedAt + game.timePerMove;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return 'Timed out';
  const d = Math.floor(remaining / DAY_MS);
  const h = Math.floor((remaining % DAY_MS) / 3_600_000);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h remaining`;
}

function formatTs(ms: number): string {
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export const CorrespondenceGame: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUserStore();
  const { getGame, makeMove, resignGame, offerDraw } = useCorrespondenceStore();

  const game = id ? getGame(id) : undefined;

  const [lastFrom, setLastFrom] = useState<Square | null>(null);
  const [lastTo, setLastTo] = useState<Square | null>(null);
  const [resigned, setResigned] = useState(false);

  // ── Chess: rebuild from move list ─────────────────────────────────────────
  const chessState = useMemo(() => {
    if (!game || game.universe !== 'chess') return null;
    const c = new Chess();
    game.moves.forEach(m => {
      try { c.move({ from: m.from!, to: m.to!, promotion: 'q' }); } catch {}
    });
    return c;
  }, [game]);

  // ── Draughts: rebuild board from last persisted position ──────────────────
  const draughtsBoard = useMemo((): DraughtsBoardType => {
    if (!game || game.universe !== 'checkers') return createInitialBoard();
    // Last move stores the board as JSON in `fen` field
    const last = game.moves[game.moves.length - 1];
    if (last?.fen) {
      try { return JSON.parse(last.fen); } catch {}
    }
    return createInitialBoard();
  }, [game]);

  const draughtsLastMove = useMemo((): DraughtsMove | null => {
    if (!game || game.universe !== 'checkers') return null;
    const last = game.moves[game.moves.length - 1];
    if (!last || !last.from) return null;
    const [fr, fc] = last.from.split(',').map(Number);
    const [tr, tc] = last.to!.split(',').map(Number);
    return { from: { row: fr, col: fc }, to: { row: tr, col: tc } };
  }, [game]);

  const [draughtsSelected, setDraughtsSelected] = useState<Position | null>(null);
  const [draughtsLegalMoves, setDraughtsLegalMoves] = useState<DraughtsMove[]>([]);

  const isMyTurn = game?.status === 'active' && game.currentTurn === game.myColor;

  const handleChessMove = useCallback((from: Square, to: Square, promotion?: any) => {
    if (!chessState || !isMyTurn || game?.status !== 'active') return;
    const newChess = new Chess(chessState.fen());
    const result = newChess.move({ from, to, promotion: promotion || 'q' });
    if (!result) return;
    makeMove(game.id, { from, to, san: result.san, fen: newChess.fen() });
    setLastFrom(from);
    setLastTo(to);
  }, [chessState, isMyTurn, game, makeMove]);

  const handleDraughtsClick = useCallback((row: number, col: number) => {
    if (!isMyTurn || game?.status !== 'active' || game?.universe !== 'checkers') return;
    const piece = draughtsBoard[row][col];
    const playerColorDr = game.myColor;

    // Select own piece
    if (piece && piece.color === playerColorDr) {
      const moves = getMovesFromSquare(draughtsBoard, row, col, playerColorDr);
      const allLegal = getLegalMoves(draughtsBoard, playerColorDr);
      const valid = moves.filter(m =>
        allLegal.some(al => al.from.row === m.from.row && al.from.col === m.from.col && al.to.row === m.to.row && al.to.col === m.to.col)
      );
      setDraughtsSelected({ row, col });
      setDraughtsLegalMoves(valid);
      return;
    }

    // Execute move
    if (draughtsSelected) {
      const target = draughtsLegalMoves.find(m => m.to.row === row && m.to.col === col);
      if (target) {
        const newBoard = applyMove(draughtsBoard, target);
        makeMove(game!.id, {
          from: `${target.from.row},${target.from.col}`,
          to:   `${target.to.row},${target.to.col}`,
          san:  formatMove(target),
          fen:  JSON.stringify(newBoard),
        });
        setDraughtsSelected(null);
        setDraughtsLegalMoves([]);
        return;
      }
    }

    setDraughtsSelected(null);
    setDraughtsLegalMoves([]);
  }, [isMyTurn, game, draughtsBoard, draughtsSelected, draughtsLegalMoves, makeMove]);

  const handleResign = () => {
    if (!game) return;
    if (window.confirm('Are you sure you want to resign?')) {
      resignGame(game.id);
      setResigned(true);
    }
  };

  const handleDraw = () => {
    if (!game) return;
    if (window.confirm('Offer a draw? (This will immediately end the game as a draw in local mode)')) {
      offerDraw(game.id);
    }
  };

  if (!game) {
    return (
      <div className="corr-game-page">
        <div className="corr-not-found">
          <div style={{ fontSize: 48 }}>🔍</div>
          <h2>Game not found</h2>
          <p>This correspondence game doesn't exist or has been deleted.</p>
          <button className="btn btn-accent" onClick={() => navigate(-1)}>← Go back</button>
        </div>
      </div>
    );
  }

  const myName = user?.name || 'You';
  const oppName = game.myColor === 'white' ? game.blackPlayer : game.whitePlayer;
  const whiteName = game.whitePlayer;
  const blackName = game.blackPlayer;

  const movePairs: { num: number; white: string; black: string; wAt?: number; bAt?: number }[] = [];
  for (let i = 0; i < game.moves.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: game.moves[i]?.san || '',
      black: game.moves[i + 1]?.san || '',
      wAt:   game.moves[i]?.movedAt,
      bAt:   game.moves[i + 1]?.movedAt,
    });
  }

  const checkResult = () => {
    if (!chessState) return null;
    if (chessState.isCheckmate()) return chessState.turn() === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
    if (chessState.isStalemate())  return 'Draw by stalemate';
    if (chessState.isDraw())       return 'Draw';
    return null;
  };

  const autoResult = checkResult();
  const displayResult = game.result
    ? (game.result === 'draw' ? '½–½ Draw' : game.result === game.myColor ? '🏆 You won!' : '🏳 You lost')
    : autoResult;

  return (
    <div className="corr-game-page">
      {/* ── Header bar ── */}
      <div className="corr-game-header">
        <button className="corr-back-btn" onClick={() => navigate(-1)}>← Back</button>
        <div className="corr-game-title">
          <span>{game.universe === 'chess' ? '♟ Chess' : '⬤ Draughts'}</span>
          <span className="corr-game-tc">{TIME_LABELS[game.timePerMove] ?? 'Correspondence'}</span>
        </div>
        <div className="corr-game-status-badge">
          {game.status === 'ended'
            ? <span className="badge badge-ended">Ended</span>
            : isMyTurn
            ? <span className="badge badge-your-turn">🔔 Your turn</span>
            : <span className="badge badge-waiting">⏳ Waiting for opponent</span>}
        </div>
      </div>

      <div className="corr-game-body">
        {/* ── Board column ── */}
        <div className="corr-board-col">
          {/* Opponent bar */}
          <div className="corr-player-bar opp">
            <div className="corr-avatar">{oppName[0]?.toUpperCase()}</div>
            <div>
              <div className="corr-pname">{oppName}</div>
              {game.status === 'active' && !isMyTurn && (
                <div className="corr-time-left">{timeLeft(game)}</div>
              )}
            </div>
            <div className={`corr-color-pip ${game.myColor === 'white' ? 'black' : 'white'}`} />
          </div>

          {/* Board */}
          <div className="corr-board-wrapper">
            {game.universe === 'chess' && chessState ? (
              <ChessBoard
                game={chessState}
                flipped={game.myColor === 'black'}
                playerColor={game.myColor === 'black' ? 'b' : 'w'}
                onMove={handleChessMove}
                lastMove={lastFrom && lastTo ? { from: lastFrom, to: lastTo } : null}
                inCheck={chessState.isCheck()}
              />
            ) : (
              <DraughtsBoardComponent
                board={draughtsBoard}
                selectedSquare={draughtsSelected}
                legalMoves={draughtsLegalMoves}
                lastMove={draughtsLastMove}
                flipped={game.myColor === 'black'}
                onSquareClick={handleDraughtsClick}
              />
            )}

            {/* Result overlay */}
            {(displayResult || resigned) && (
              <div className="corr-result-overlay">
                <div className="corr-result-box">
                  <div style={{ fontSize: 36, marginBottom: 8 }}>
                    {resigned ? '🏳' : game.result === game.myColor ? '🏆' : '🤝'}
                  </div>
                  <div className="corr-result-text">{resigned ? 'You resigned' : displayResult}</div>
                  <button className="btn btn-accent" style={{ marginTop: 16 }} onClick={() => navigate(-1)}>
                    Back to Games
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* My bar */}
          <div className="corr-player-bar me">
            <div className="corr-avatar me">{myName[0]?.toUpperCase()}</div>
            <div>
              <div className="corr-pname">{myName}</div>
              {game.status === 'active' && isMyTurn && (
                <div className="corr-your-turn-label">Your turn to move!</div>
              )}
            </div>
            <div className={`corr-color-pip ${game.myColor}`} />
          </div>

          {/* Action buttons */}
          {game.status === 'active' && (
            <div className="corr-actions">
              <button className="corr-action-btn draw" onClick={handleDraw}>½ Offer Draw</button>
              <button className="corr-action-btn resign" onClick={handleResign}>🏳 Resign</button>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="corr-game-sidebar">
          {/* Game info */}
          <div className="corr-info-panel">
            <div className="corr-info-row">
              <span>Universe</span>
              <strong>{game.universe === 'chess' ? '♟ Chess' : '⬤ Draughts'}</strong>
            </div>
            <div className="corr-info-row">
              <span>Time control</span>
              <strong>{TIME_LABELS[game.timePerMove]}</strong>
            </div>
            <div className="corr-info-row">
              <span>Started</span>
              <strong>{formatTs(game.createdAt)}</strong>
            </div>
            <div className="corr-info-row">
              <span>Last move</span>
              <strong>{formatTs(game.lastMovedAt)}</strong>
            </div>
            <div className="corr-info-row">
              <span>Moves played</span>
              <strong>{game.moves.length}</strong>
            </div>
          </div>

          {/* Move list */}
          <div className="corr-move-panel">
            <div className="corr-move-panel-title">📜 Move History</div>
            {movePairs.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '12px 0' }}>
                No moves yet. {isMyTurn ? 'Make the first move!' : 'Waiting for White…'}
              </div>
            ) : (
              <div className="corr-move-list">
                {movePairs.map(pair => (
                  <div key={pair.num} className="corr-move-row">
                    <span className="corr-move-num">{pair.num}.</span>
                    <div className="corr-move-cell" title={pair.wAt ? formatTs(pair.wAt) : ''}>
                      {pair.white}
                    </div>
                    <div className="corr-move-cell opp" title={pair.bAt ? formatTs(pair.bAt) : ''}>
                      {pair.black}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Players summary */}
          <div className="corr-info-panel">
            <div className="corr-player-summary">
              <span className="corr-color-pip white" />
              <span>{whiteName}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 12 }}>White</span>
            </div>
            <div className="corr-player-summary">
              <span className="corr-color-pip black" />
              <span>{blackName}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 12 }}>Black</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
