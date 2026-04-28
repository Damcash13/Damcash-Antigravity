import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess, Square } from 'chess.js';
import { ChessBoard } from '../chess/ChessBoard';
import { ENDGAME_POSITIONS } from '../../data/puzzles';
import { useUniverseStore } from '../../stores';

export const EndgameTrainingPage: React.FC = () => {
  const navigate = useNavigate();
  const { universe } = useUniverseStore();

  const [selected, setSelected] = useState<number | null>(null);
  const [chess, setChess] = useState(() => new Chess());
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [message, setMessage] = useState('');

  const position = selected !== null ? ENDGAME_POSITIONS[selected] : null;
  const playerColor: 'w' | 'b' = position?.side ?? 'w';

  const loadPosition = (idx: number) => {
    const pos = ENDGAME_POSITIONS[idx];
    setSelected(idx);
    setChess(new Chess(pos.fen));
    setLastMove(null);
    setMessage('');
  };

  const handleMove = useCallback((from: Square, to: Square) => {
    const next = new Chess(chess.fen());
    const res = next.move({ from, to, promotion: 'q' });
    if (!res) return;
    setChess(next);
    setLastMove({ from, to });

    if (next.isCheckmate()) {
      setMessage('Checkmate! Well done!');
    } else if (next.isStalemate()) {
      setMessage('Stalemate — careful!');
    } else if (next.isDraw()) {
      setMessage('Draw achieved!');
    } else {
      setMessage('');
    }
  }, [chess]);

  const reset = () => {
    if (selected !== null) loadPosition(selected);
  };

  return (
    <div style={{ display: 'flex', gap: 24, padding: '20px 0', flexWrap: 'wrap', justifyContent: 'center' }}>
      {/* Position list */}
      <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>👨‍💻 Endgame Training</h2>
        <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 8 }}>
          Master theoretical endgames. Free-play mode — find the best technique yourself.
        </p>
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
            {ENDGAME_POSITIONS.length} Positions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ENDGAME_POSITIONS.map((pos, i) => (
              <button
                key={pos.id}
                onClick={() => loadPosition(i)}
                style={{
                  background: selected === i ? 'var(--accent-dim)' : 'none',
                  border: `1px solid ${selected === i ? 'var(--accent)' : 'transparent'}`,
                  borderRadius: 6, padding: '8px 10px', cursor: 'pointer',
                  color: selected === i ? 'var(--accent)' : 'var(--text-2)',
                  fontSize: 13, textAlign: 'left', transition: 'all 0.15s',
                }}
              >
                <div style={{ fontWeight: 700 }}>{pos.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  {pos.goal} · Rating {pos.rating} · {pos.side === 'w' ? 'White' : 'Black'} to play
                </div>
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${universe}`)}>← Back to lobby</button>
      </div>

      {/* Board */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        {position && (
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, width: '100%', maxWidth: 448 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{position.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 8 }}>{position.description}</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Goal: <strong style={{ color: 'var(--accent)' }}>{position.goal}</strong>
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Side: <strong style={{ color: 'var(--text-1)' }}>{position.side === 'w' ? 'White' : 'Black'}</strong>
              </span>
            </div>
          </div>
        )}

        {message && (
          <div style={{
            padding: '10px 20px', borderRadius: 8, fontWeight: 700, fontSize: 16,
            background: message.includes('Stalemate') || message.includes('careful') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
            color: message.includes('Stalemate') || message.includes('careful') ? '#ef4444' : '#22c55e',
            border: `1px solid ${message.includes('Stalemate') || message.includes('careful') ? '#ef4444' : '#22c55e'}`,
          }}>
            {message}
          </div>
        )}

        {selected !== null ? (
          <ChessBoard
            game={chess}
            flipped={playerColor === 'b'}
            playerColor={chess.isGameOver() ? 'w' : playerColor}
            onMove={handleMove}
            lastMove={lastMove}
            inCheck={chess.isCheck()}
          />
        ) : (
          <div style={{
            width: 448, height: 448, background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-3)', fontSize: 14,
          }}>
            Select a position to begin
          </div>
        )}

        {selected !== null && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={reset}>↺ Reset position</button>
          </div>
        )}
      </div>
    </div>
  );
};
