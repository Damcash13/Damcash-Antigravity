import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUniverseStore } from '../../stores';

const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];

function randomSquare() {
  return FILES[Math.floor(Math.random() * 8)] + RANKS[Math.floor(Math.random() * 8)];
}

type Mode = 'name-square' | 'find-square';
type Phase = 'idle' | 'playing' | 'ended';

export const CoordinatesPage: React.FC = () => {
  const navigate = useNavigate();
  const { universe } = useUniverseStore();
  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<Mode>('find-square');
  const [flipped, setFlipped] = useState(false);
  const [target, setTarget] = useState(randomSquare());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);
  const [nameInput, setNameInput] = useState('');
  const timerRef = useRef<number | null>(null);

  const ranks = flipped ? [...RANKS].reverse() : RANKS;
  const files = flipped ? [...FILES].reverse() : FILES;

  const end = useCallback(() => {
    setPhase('ended');
    if (timerRef.current) clearInterval(timerRef.current);
    setBest(b => Math.max(b, score));
  }, [score]);

  const start = () => {
    setPhase('playing');
    setScore(0);
    setTimeLeft(30);
    setTarget(randomSquare());
    setNameInput('');
    timerRef.current = window.setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { end(); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const handleSquareClick = useCallback((sq: string) => {
    if (phase !== 'playing' || mode !== 'find-square') return;
    if (sq === target) {
      setFlash('good');
      setScore(s => s + 1);
      setTimeout(() => { setFlash(null); setTarget(randomSquare()); }, 250);
    } else {
      setFlash('bad');
      setTimeout(() => setFlash(null), 250);
    }
  }, [phase, mode, target]);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phase !== 'playing' || mode !== 'name-square') return;
    if (nameInput.trim().toLowerCase() === target.toLowerCase()) {
      setFlash('good');
      setScore(s => s + 1);
      setNameInput('');
      setTimeout(() => { setFlash(null); setTarget(randomSquare()); }, 250);
    } else {
      setFlash('bad');
      setNameInput('');
      setTimeout(() => setFlash(null), 250);
    }
  };

  const isLight = (ri: number, fi: number) => {
    const f = FILES.indexOf(files[fi]);
    const r = RANKS.indexOf(ranks[ri]);
    return (f + r) % 2 === 0;
  };

  const timerColor = timeLeft <= 10 ? '#ef4444' : timeLeft <= 20 ? '#f59e0b' : 'var(--text-1)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '20px 0' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 4 }}>📝 Coordinates Trainer</h2>
        <p style={{ color: 'var(--text-2)', fontSize: 14 }}>Learn to name chess squares instantly. 30 seconds on the clock.</p>
      </div>

      {/* Mode & flip toggles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {(['find-square', 'name-square'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => { if (phase === 'idle') setMode(m); }}
            style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: mode === m ? 'var(--accent-dim)' : 'var(--bg-2)',
              border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
              color: mode === m ? 'var(--accent)' : 'var(--text-2)',
            }}
          >
            {m === 'find-square' ? '🎯 Find the square' : '🔤 Name the square'}
          </button>
        ))}
        <button
          onClick={() => setFlipped(f => !f)}
          style={{
            padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: flipped ? 'var(--accent-dim)' : 'var(--bg-2)',
            border: `1px solid ${flipped ? 'var(--accent)' : 'var(--border)'}`,
            color: flipped ? 'var(--accent)' : 'var(--text-2)',
          }}
        >
          ↕ Flipped
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 32 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)' }}>{score}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Score</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: timerColor, fontVariantNumeric: 'tabular-nums' }}>{timeLeft}s</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Time left</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--gold)' }}>{best}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Best</div>
        </div>
      </div>

      {/* Target prompt */}
      {phase === 'playing' && (
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', letterSpacing: 2 }}>
          {mode === 'find-square' ? <>Click <span style={{ color: 'var(--accent)', fontSize: 26 }}>{target}</span></> : <>What square is highlighted?</>}
        </div>
      )}

      {/* Board */}
      <div style={{
        position: 'relative',
        outline: flash === 'good' ? '4px solid #22c55e' : flash === 'bad' ? '4px solid #ef4444' : '2px solid var(--border)',
        borderRadius: 4, transition: 'outline 0.1s',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 56px)' }}>
          {ranks.map((rank, ri) =>
            files.map((file, fi) => {
              const sq = `${file}${rank}`;
              const light = isLight(ri, fi);
              const isTarget = mode === 'name-square' && sq === target;
              const bg = isTarget
                ? 'rgba(99,200,99,0.7)'
                : light ? '#f0d9b5' : '#b58863';
              return (
                <div
                  key={sq}
                  onClick={() => handleSquareClick(sq)}
                  style={{
                    width: 56, height: 56, background: bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: mode === 'find-square' && phase === 'playing' ? 'pointer' : 'default',
                    position: 'relative', userSelect: 'none',
                    transition: 'background 0.1s',
                  }}
                >
                  {ri === 7 && <span style={{ position: 'absolute', bottom: 2, right: 3, fontSize: 10, fontWeight: 700, color: light ? '#b58863' : '#f0d9b5', opacity: 0.8 }}>{file}</span>}
                  {fi === 0 && <span style={{ position: 'absolute', top: 2, left: 3, fontSize: 10, fontWeight: 700, color: light ? '#b58863' : '#f0d9b5', opacity: 0.8 }}>{rank}</span>}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Name mode input */}
      {phase === 'playing' && mode === 'name-square' && (
        <form onSubmit={handleNameSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value.toLowerCase())}
            placeholder="e.g. e4"
            maxLength={2}
            style={{
              width: 80, textAlign: 'center', fontSize: 18, fontWeight: 700,
              background: 'var(--bg-2)', border: '1px solid var(--accent)',
              borderRadius: 8, color: 'var(--text-1)', padding: '8px 0',
              letterSpacing: 4,
            }}
          />
          <button type="submit" className="btn btn-primary">Go</button>
        </form>
      )}

      {/* Controls */}
      {phase === 'idle' && (
        <button className="btn btn-primary" style={{ fontSize: 16, padding: '12px 32px' }} onClick={start}>
          Start (30s)
        </button>
      )}
      {phase === 'ended' && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Time's up! Score: {score}</div>
          {score >= best && score > 0 && <div style={{ color: 'var(--gold)' }}>🏆 New best!</div>}
          <button className="btn btn-primary" onClick={start}>Play again</button>
        </div>
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${universe}`)}>← Back to lobby</button>
    </div>
  );
};
