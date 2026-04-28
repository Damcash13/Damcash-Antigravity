import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess, Square } from 'chess.js';
import { ChessBoard } from '../chess/ChessBoard';
import { CHESS_PUZZLES, Puzzle } from '../../data/puzzles';
import { useUniverseStore, useUserStore } from '../../stores';
import { api } from '../../lib/api';

function uciToObj(uci: string) {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] || 'q' };
}

type Status = 'idle' | 'correct' | 'wrong' | 'solved';

export const PuzzlesPage: React.FC = () => {
  const navigate = useNavigate();
  const { universe } = useUniverseStore();
  const { user } = useUserStore();
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [chess, setChess] = useState<Chess>(() => new Chess(CHESS_PUZZLES[0].fen));
  const [stepIdx, setStepIdx] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [hint, setHint] = useState(false);
  // Track which puzzle IDs have been solved
  const [solvedIds, setSolvedIds] = useState<Set<string>>(new Set());

  const puzzle = CHESS_PUZZLES[puzzleIdx % CHESS_PUZZLES.length];
  const playerColor: 'w' | 'b' = chess.turn();

  // Load progress from API on mount
  useEffect(() => {
    if (!user) return;
    api.puzzles.progress()
      .then(prog => {
        const solved = new Set(prog.filter(p => p.solved).map(p => p.puzzleId));
        setSolvedIds(solved);
      })
      .catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPuzzle = useCallback((idx: number) => {
    const p = CHESS_PUZZLES[idx % CHESS_PUZZLES.length];
    const c = new Chess(p.fen);
    setChess(c);
    setStepIdx(0);
    setStatus('idle');
    setLastMove(null);
    setHint(false);
  }, []);

  useEffect(() => { loadPuzzle(puzzleIdx); }, [puzzleIdx, loadPuzzle]);

  const handleMove = useCallback((from: Square, to: Square) => {
    if (status === 'solved' || status === 'correct') return;
    const expected = puzzle.solution[stepIdx];
    const move = `${from}${to}`;

    const newChess = new Chess(chess.fen());
    const result = newChess.move({ from, to, promotion: 'q' });
    if (!result) return;

    setLastMove({ from, to });
    setChess(newChess);

    if (move === expected.slice(0, 4)) {
      const nextStep = stepIdx + 1;
      if (nextStep >= puzzle.solution.length) {
        setStatus('solved');
        // Track solve
        setSolvedIds(s => new Set([...s, puzzle.id]));
        if (user) api.puzzles.complete({ puzzleId: puzzle.id, solved: true }).catch(() => {});
      } else {
        setStatus('correct');
        // Play opponent response
        setTimeout(() => {
          const oppMove = puzzle.solution[nextStep];
          const obj = uciToObj(oppMove);
          const afterOpp = new Chess(newChess.fen());
          const res = afterOpp.move({ from: obj.from, to: obj.to, promotion: obj.promotion });
          if (res) {
            setChess(afterOpp);
            setLastMove({ from: obj.from, to: obj.to });
            setStepIdx(nextStep + 1);
            setStatus('idle');
          }
        }, 600);
      }
    } else {
      setStatus('wrong');
      // Track failed attempt
      if (user) api.puzzles.complete({ puzzleId: puzzle.id, solved: false }).catch(() => {});
      setTimeout(() => {
        setChess(new Chess(chess.fen()));
        setLastMove(null);
        setStatus('idle');
      }, 800);
    }
  }, [chess, puzzle, stepIdx, status, user]);

  const showHint = () => {
    setHint(true);
    setTimeout(() => setHint(false), 2000);
  };

  const hintFrom = hint && puzzle.solution[stepIdx]
    ? puzzle.solution[stepIdx].slice(0, 2) as Square
    : null;

  const statusColor = status === 'solved' ? '#22c55e' : status === 'correct' ? '#22c55e' : status === 'wrong' ? '#ef4444' : 'var(--text-3)';
  const statusText  = status === 'solved' ? '✓ Puzzle solved!' : status === 'correct' ? '✓ Correct! Keep going…' : status === 'wrong' ? '✗ Not the right move' : `Find the best move for ${playerColor === 'w' ? 'White' : 'Black'}`;

  return (
    <div style={{ display: 'flex', gap: 24, padding: '20px 0', flexWrap: 'wrap', justifyContent: 'center' }}>
      {/* Board column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        {/* Status bar */}
        <div style={{
          width: '100%', padding: '10px 16px', borderRadius: 8,
          background: 'var(--bg-2)', border: `1px solid ${statusColor}`,
          color: statusColor, fontWeight: 700, fontSize: 14, textAlign: 'center',
          transition: 'border-color 0.2s, color 0.2s',
        }}>
          {statusText}
        </div>

        <div style={{ position: 'relative' }}>
          <ChessBoard
            game={chess}
            flipped={playerColor === 'b'}
            playerColor={status === 'solved' ? 'w' : playerColor}
            onMove={handleMove}
            lastMove={lastMove}
            inCheck={chess.isCheck()}
          />
          {/* Hint highlight */}
          {hintFrom && (
            <div style={{
              position: 'absolute', pointerEvents: 'none',
              top: 0, left: 0, right: 0, bottom: 0,
            }} />
          )}
          {/* Solved overlay */}
          {status === 'solved' && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 12, borderRadius: 4,
            }}>
              <div style={{ fontSize: 56 }}>🎉</div>
              <div style={{ color: '#22c55e', fontSize: 22, fontWeight: 900 }}>Puzzle Solved!</div>
              <button className="btn btn-primary" onClick={() => setPuzzleIdx(i => i + 1)}>
                Next puzzle →
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={showHint}>💡 Hint</button>
          <button className="btn btn-secondary btn-sm" onClick={() => loadPuzzle(puzzleIdx)}>↺ Retry</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setPuzzleIdx(i => i + 1)}>⏭ Skip</button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${universe}`)}>← Back</button>
        </div>
      </div>

      {/* Puzzle info sidebar */}
      <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 8 }}>
            Puzzle {puzzleIdx % CHESS_PUZZLES.length + 1} / {CHESS_PUZZLES.length}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>{puzzle.title}</div>
          <div style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 8 }}>🏷 {puzzle.theme}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Rating:</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>{puzzle.rating}</span>
          </div>
        </div>

        {/* Puzzle list */}
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)' }}>
              All Puzzles
            </div>
            <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>
              {solvedIds.size}/{CHESS_PUZZLES.length} ✓
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflowY: 'auto' }}>
            {CHESS_PUZZLES.map((p, i) => {
              const isCurrent = i === puzzleIdx % CHESS_PUZZLES.length;
              const isSolved  = solvedIds.has(p.id);
              return (
              <button
                key={p.id}
                onClick={() => setPuzzleIdx(i)}
                style={{
                  background: isCurrent ? 'var(--accent-dim)' : isSolved ? 'rgba(34,197,94,0.06)' : 'none',
                  border: `1px solid ${isCurrent ? 'var(--accent)' : isSolved ? 'rgba(34,197,94,0.25)' : 'transparent'}`,
                  borderRadius: 6, padding: '6px 10px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  color: isCurrent ? 'var(--accent)' : 'var(--text-2)',
                  fontSize: 13, textAlign: 'left',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isSolved && <span style={{ color: '#22c55e', fontSize: 11 }}>✓</span>}
                  {p.title}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.rating}</span>
              </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
