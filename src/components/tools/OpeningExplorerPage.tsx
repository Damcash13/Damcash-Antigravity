import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { ChessBoard } from '../chess/ChessBoard';
import { OPENING_TREE } from '../../data/puzzles';
import { useUniverseStore } from '../../stores';

type Square = import('chess.js').Square;

export const OpeningExplorerPage: React.FC = () => {
  const navigate = useNavigate();
  const { universe } = useUniverseStore();
  const tree = OPENING_TREE[universe] ?? OPENING_TREE['chess'];

  const [selected, setSelected] = useState<number | null>(null);
  const [chess, setChess] = useState(() => new Chess());
  const [moveIdx, setMoveIdx] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);

  const opening = selected !== null ? tree[selected] : null;
  const allMoves = opening ? [...opening.moves, ...(opening.continuation ?? [])] : [];

  const loadOpening = (idx: number) => {
    setSelected(idx);
    setChess(new Chess());
    setMoveIdx(0);
    setLastMove(null);
  };

  const stepForward = () => {
    if (!opening || moveIdx >= allMoves.length) return;
    const uci = allMoves[moveIdx];
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const next = new Chess(chess.fen());
    const res = next.move({ from, to, promotion: 'q' });
    if (res) {
      setChess(next);
      setLastMove({ from, to });
      setMoveIdx(i => i + 1);
    }
  };

  const stepBack = () => {
    if (moveIdx === 0 || !opening) return;
    const c = new Chess();
    const target = moveIdx - 1;
    let lm: { from: Square; to: Square } | null = null;
    for (let i = 0; i < target; i++) {
      const uci = allMoves[i];
      const from = uci.slice(0, 2) as Square;
      const to = uci.slice(2, 4) as Square;
      c.move({ from, to, promotion: 'q' });
      lm = { from, to };
    }
    setChess(c);
    setLastMove(lm);
    setMoveIdx(target);
  };

  const reset = () => {
    setChess(new Chess());
    setMoveIdx(0);
    setLastMove(null);
  };

  const mainMovesCount = opening?.moves.length ?? 0;

  return (
    <div style={{ display: 'flex', gap: 24, padding: '20px 0', flexWrap: 'wrap', justifyContent: 'center' }}>
      {/* Opening list */}
      <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
          {universe === 'checkers' ? '🏁' : '♟'} Opening Explorer
        </h2>
        <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 8 }}>
          Browse common openings. Step through moves with the controls below the board.
        </p>
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
            {tree.length} Openings
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tree.map((op, i) => (
              <button
                key={i}
                onClick={() => loadOpening(i)}
                style={{
                  background: selected === i ? 'var(--accent-dim)' : 'none',
                  border: `1px solid ${selected === i ? 'var(--accent)' : 'transparent'}`,
                  borderRadius: 6, padding: '8px 10px', cursor: 'pointer',
                  color: selected === i ? 'var(--accent)' : 'var(--text-2)',
                  fontSize: 13, textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontWeight: 700 }}>{op.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{op.moves.join(' ')}</div>
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${universe}`)}>← Back to lobby</button>
      </div>

      {/* Board + info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        {opening && (
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, width: '100%', maxWidth: 448 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{opening.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{opening.description}</div>
          </div>
        )}

        <ChessBoard
          game={chess}
          flipped={false}
          playerColor="w"
          onMove={() => {}}
          lastMove={lastMove}
          inCheck={false}
        />

        {/* Move display */}
        {opening && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 448 }}>
            {allMoves.map((uci, i) => {
              const isMain = i < mainMovesCount;
              const active = i < moveIdx;
              return (
                <span
                  key={i}
                  style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: 13,
                    background: active ? (isMain ? 'var(--accent-dim)' : 'rgba(139,92,246,0.15)') : 'var(--bg-3)',
                    color: active ? (isMain ? 'var(--accent)' : '#a78bfa') : 'var(--text-3)',
                    fontFamily: 'monospace', fontWeight: active ? 700 : 400,
                    border: `1px solid ${active ? (isMain ? 'var(--accent)' : '#a78bfa') : 'transparent'}`,
                  }}
                >
                  {uci}
                </span>
              );
            })}
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={stepBack} disabled={moveIdx === 0}>◀ Back</button>
          <button className="btn btn-secondary btn-sm" onClick={reset} disabled={moveIdx === 0}>↺ Reset</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={stepForward}
            disabled={!opening || moveIdx >= allMoves.length}
          >
            Next ▶
          </button>
        </div>

        {opening && moveIdx >= allMoves.length && (
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>End of variation</div>
        )}

        {!opening && (
          <div style={{ color: 'var(--text-3)', fontSize: 14, padding: 24, textAlign: 'center' }}>
            Select an opening from the list to begin
          </div>
        )}
      </div>
    </div>
  );
};
