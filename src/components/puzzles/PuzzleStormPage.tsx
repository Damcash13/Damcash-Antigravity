import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess, Square } from 'chess.js';
import { ChessBoard } from '../chess/ChessBoard';
import { CHESS_PUZZLES } from '../../data/puzzles';
import { useUniverseStore } from '../../stores';

const STORM_DURATION = 180; // 3 minutes

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Phase = 'idle' | 'playing' | 'ended';

export const PuzzleStormPage: React.FC = () => {
  const navigate = useNavigate();
  const { universe } = useUniverseStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [puzzles] = useState(() => [...shuffle(CHESS_PUZZLES), ...shuffle(CHESS_PUZZLES), ...shuffle(CHESS_PUZZLES)]);
  const [idx, setIdx] = useState(0);
  const [chess, setChess] = useState<Chess>(new Chess());
  const [stepIdx, setStepIdx] = useState(0);
  const [solved, setSolved] = useState(0);
  const [errors, setErrors] = useState(0);
  const [timeLeft, setTimeLeft] = useState(STORM_DURATION);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);
  const timerRef = useRef<number | null>(null);

  const loadPuzzle = useCallback((i: number) => {
    const p = puzzles[i % puzzles.length];
    setChess(new Chess(p.fen));
    setStepIdx(0);
    setLastMove(null);
  }, [puzzles]);

  const end = useCallback(() => {
    setPhase('ended');
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const start = () => {
    setPhase('playing');
    setSolved(0);
    setErrors(0);
    setTimeLeft(STORM_DURATION);
    setIdx(0);
    loadPuzzle(0);
    timerRef.current = window.setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { end(); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

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
        setFlash('good');
        setTimeout(() => setFlash(null), 300);
        setSolved(s => s + 1);
        const nextIdx = idx + 1;
        setIdx(nextIdx);
        setTimeout(() => loadPuzzle(nextIdx), 400);
      } else {
        setChess(newChess);
        setTimeout(() => {
          const oppMove = puzzle.solution[next];
          const afterOpp = new Chess(newChess.fen());
          const res = afterOpp.move({ from: oppMove.slice(0, 2) as Square, to: oppMove.slice(2, 4) as Square, promotion: 'q' });
          if (res) {
            setChess(afterOpp);
            setLastMove({ from: oppMove.slice(0, 2) as Square, to: oppMove.slice(2, 4) as Square });
            setStepIdx(next + 1);
          }
        }, 350);
      }
    } else {
      setFlash('bad');
      setErrors(e => e + 1);
      // On error: deduct 10s
      setTimeLeft(t => Math.max(0, t - 10));
      setTimeout(() => {
        setFlash(null);
        // Skip to next puzzle on error (storm mode)
        const nextIdx = idx + 1;
        setIdx(nextIdx);
        loadPuzzle(nextIdx);
      }, 500);
    }
  }, [phase, chess, puzzles, idx, stepIdx, loadPuzzle]);

  const mins = Math.floor(timeLeft / 60);
  const secs = (timeLeft % 60).toString().padStart(2, '0');
  const timerColor = timeLeft <= 30 ? '#ef4444' : timeLeft <= 60 ? '#f59e0b' : 'var(--text-1)';
  const playerColor: 'w' | 'b' = chess.turn();

  return (
    <div style={{ display: 'flex', gap: 24, padding: '20px 0', flexWrap: 'wrap', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        {/* Timer */}
        <div style={{
          display: 'flex', gap: 32, alignItems: 'center',
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '10px 24px', width: '100%', justifyContent: 'space-between',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>SOLVED</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#22c55e' }}>{solved}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>TIME</div>
            <div style={{ fontSize: 32, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: timerColor }}>
              {mins}:{secs}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>ERRORS</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#ef4444' }}>{errors}</div>
          </div>
        </div>

        {phase !== 'idle' && (
          <div style={{
            position: 'relative',
            outline: flash === 'good' ? '4px solid #22c55e' : flash === 'bad' ? '4px solid #ef4444' : 'none',
            borderRadius: 4, transition: 'outline 0.1s',
          }}>
            <ChessBoard
              game={chess}
              flipped={playerColor === 'b'}
              playerColor={phase === 'playing' ? playerColor : 'w'}
              onMove={handleMove}
              lastMove={lastMove}
              inCheck={chess.isCheck()}
            />
            {phase === 'ended' && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 16, borderRadius: 4,
              }}>
                <div style={{ fontSize: 56 }}>⏱</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>Time's up!</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--accent)' }}>{solved} puzzles</div>
                <button className="btn btn-primary" onClick={start}>Play again</button>
              </div>
            )}
          </div>
        )}

        {phase === 'idle' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: 24 }}>
            <div style={{ fontSize: 56 }}>🕐</div>
            <h2 style={{ fontSize: 22, fontWeight: 900 }}>Puzzle Storm</h2>
            <p style={{ color: 'var(--text-2)', maxWidth: 320, lineHeight: 1.6 }}>
              Solve as many puzzles as you can in 3 minutes. Each error costs 10 seconds.
            </p>
            <button className="btn btn-primary" style={{ fontSize: 16, padding: '12px 32px' }} onClick={start}>
              Start Storm
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${universe}`)}>← Back</button>
          </div>
        )}

        {phase === 'playing' && (
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
            Puzzle {idx + 1} · {playerColor === 'w' ? 'White' : 'Black'} to move · Each error −10s
          </div>
        )}
        {phase === 'ended' && (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${universe}`)}>← Back to lobby</button>
        )}
      </div>
    </div>
  );
};
