import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess, Square } from 'chess.js';
import { ChessBoard } from '../chess/ChessBoard';
import { CHESS_PUZZLES } from '../../data/puzzles';
import { useUniverseStore } from '../../stores';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Phase = 'idle' | 'playing' | 'dead';

export const PuzzleStreakPage: React.FC = () => {
  const navigate = useNavigate();
  const { universe } = useUniverseStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [puzzles] = useState(() => shuffle(CHESS_PUZZLES));
  const [idx, setIdx] = useState(0);
  const [chess, setChess] = useState<Chess>(new Chess());
  const [stepIdx, setStepIdx] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);

  const loadPuzzle = useCallback((i: number) => {
    const p = puzzles[i % puzzles.length];
    setChess(new Chess(p.fen));
    setStepIdx(0);
    setLastMove(null);
  }, [puzzles]);

  const start = () => {
    setPhase('playing');
    setStreak(0);
    setIdx(0);
    loadPuzzle(0);
  };

  const handleMove = useCallback((from: Square, to: Square) => {
    if (phase !== 'playing') return;
    const puzzle = puzzles[idx % puzzles.length];
    const expected = puzzle.solution[stepIdx];
    const move = `${from}${to}`;

    const newChess = new Chess(chess.fen());
    const result = newChess.move({ from, to, promotion: 'q' });
    if (!result) return;

    setLastMove({ from, to });

    if (move === expected.slice(0, 4)) {
      const next = stepIdx + 1;
      if (next >= puzzle.solution.length) {
        // Solved
        setFlash('good');
        setTimeout(() => setFlash(null), 400);
        const newStreak = streak + 1;
        setStreak(newStreak);
        setBest(b => Math.max(b, newStreak));
        const nextIdx = idx + 1;
        setIdx(nextIdx);
        setTimeout(() => loadPuzzle(nextIdx), 600);
      } else {
        setChess(newChess);
        // Opponent reply
        setTimeout(() => {
          const oppMove = puzzle.solution[next];
          const afterOpp = new Chess(newChess.fen());
          const res = afterOpp.move({ from: oppMove.slice(0, 2) as Square, to: oppMove.slice(2, 4) as Square, promotion: 'q' });
          if (res) {
            setChess(afterOpp);
            setLastMove({ from: oppMove.slice(0, 2) as Square, to: oppMove.slice(2, 4) as Square });
            setStepIdx(next + 1);
          }
        }, 500);
      }
    } else {
      // Wrong — streak ends
      setFlash('bad');
      setTimeout(() => {
        setFlash(null);
        setPhase('dead');
      }, 600);
    }
  }, [phase, chess, puzzles, idx, stepIdx, streak, loadPuzzle]);

  const playerColor: 'w' | 'b' = chess.turn();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '20px 0' }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 4 }}>🔢 Puzzle Streak</h2>
        <p style={{ color: 'var(--text-2)', fontSize: 14 }}>Solve puzzles one by one. One wrong move ends your streak.</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 32 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--accent)' }}>{streak}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Current streak</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--gold)' }}>{best}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Best streak</div>
        </div>
      </div>

      {phase === 'idle' && (
        <button className="btn btn-primary" style={{ fontSize: 16, padding: '12px 32px' }} onClick={start}>
          Start Streak
        </button>
      )}

      {phase === 'dead' && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 48 }}>💔</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Streak ended at {streak}</div>
          {streak >= best && streak > 0 && (
            <div style={{ color: 'var(--gold)', fontWeight: 700 }}>🏆 New best!</div>
          )}
          <button className="btn btn-primary" onClick={start}>Try again</button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${universe}`)}>← Back to lobby</button>
        </div>
      )}

      {phase === 'playing' && (
        <div style={{
          position: 'relative',
          outline: flash === 'good' ? '3px solid #22c55e' : flash === 'bad' ? '3px solid #ef4444' : 'none',
          borderRadius: 4,
          transition: 'outline 0.15s',
        }}>
          <ChessBoard
            game={chess}
            flipped={playerColor === 'b'}
            playerColor={playerColor}
            onMove={handleMove}
            lastMove={lastMove}
            inCheck={chess.isCheck()}
          />
        </div>
      )}

      {phase === 'playing' && (
        <div style={{ color: 'var(--text-2)', fontSize: 14 }}>
          Puzzle {idx + 1} · {playerColor === 'w' ? 'White' : 'Black'} to move
        </div>
      )}
    </div>
  );
};
