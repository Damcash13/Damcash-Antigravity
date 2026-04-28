import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chess, Square, PieceSymbol, Color } from 'chess.js';
import { ChessBoard } from '../chess/ChessBoard';
import { useAnalysisStore, analyseGame } from '../../stores/analysisStore';
import { useUniverseStore } from '../../stores';

const PIECES: { type: PieceSymbol; color: Color; label: string }[] = [
  { type: 'k', color: 'w', label: '♔' }, { type: 'q', color: 'w', label: '♕' },
  { type: 'r', color: 'w', label: '♖' }, { type: 'b', color: 'w', label: '♗' },
  { type: 'n', color: 'w', label: '♘' }, { type: 'p', color: 'w', label: '♙' },
  { type: 'k', color: 'b', label: '♚' }, { type: 'q', color: 'b', label: '♛' },
  { type: 'r', color: 'b', label: '♜' }, { type: 'b', color: 'b', label: '♝' },
  { type: 'n', color: 'b', label: '♞' }, { type: 'p', color: 'b', label: '♟' },
];

export const BoardEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const { universe } = useUniverseStore();
  const { saveGame, setCurrentGame } = useAnalysisStore();
  const [chess, setChess] = useState(() => new Chess());
  const [selected, setSelected] = useState<{ type: PieceSymbol; color: Color } | null>(null);
  const [fenInput, setFenInput] = useState('');
  const [fenError, setFenError] = useState('');
  const [turn, setTurn] = useState<Color>('w');
  const [erasing, setErasing] = useState(false);

  const currentFen = chess.fen();

  const handleSquareClick = useCallback((sq: Square) => {
    const newChess = new Chess(chess.fen());
    if (erasing) {
      newChess.remove(sq);
    } else if (selected) {
      newChess.remove(sq);
      try { newChess.put({ type: selected.type, color: selected.color }, sq); } catch {}
    }
    // Rebuild with correct turn
    const parts = newChess.fen().split(' ');
    parts[1] = turn;
    try {
      const rebuilt = new Chess(parts.join(' '));
      setChess(rebuilt);
    } catch {
      setChess(newChess);
    }
  }, [chess, selected, erasing, turn]);

  const loadFen = () => {
    try {
      const c = new Chess(fenInput.trim());
      setChess(c);
      setFenError('');
      setTurn(c.turn());
    } catch {
      setFenError('Invalid FEN string');
    }
  };

  const resetBoard = () => {
    setChess(new Chess());
    setTurn('w');
    setFenInput('');
    setFenError('');
  };

  const clearBoard = () => {
    try {
      const c = new Chess('8/8/8/8/8/8/8/8 w - - 0 1');
      setChess(c);
    } catch {}
  };

  const startGame = () => {
    navigate(`/chess/analysis`);
  };

  const flipTurn = () => {
    const newTurn: Color = turn === 'w' ? 'b' : 'w';
    setTurn(newTurn);
    const parts = chess.fen().split(' ');
    parts[1] = newTurn;
    try { setChess(new Chess(parts.join(' '))); } catch {}
  };

  return (
    <div style={{ display: 'flex', gap: 24, padding: '20px 0', flexWrap: 'wrap', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>🏗️ Board Editor</h2>

        {/* Piece palette */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 48px)', gap: 4,
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 10,
        }}>
          {PIECES.map((p, i) => (
            <button
              key={i}
              onClick={() => { setSelected(p); setErasing(false); }}
              style={{
                width: 48, height: 48, fontSize: 28,
                background: selected?.type === p.type && selected?.color === p.color ? 'var(--accent-dim)' : 'var(--bg-3)',
                border: `1px solid ${selected?.type === p.type && selected?.color === p.color ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: p.color === 'w' ? '#fff' : '#1a1a2e',
                textShadow: p.color === 'w' ? '0 0 2px #000' : '0 0 2px #fff',
                transition: 'all 0.15s',
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => { setErasing(true); setSelected(null); }}
            style={{
              gridColumn: 'span 2', padding: '6px 0', fontSize: 13, fontWeight: 700,
              background: erasing ? 'rgba(239,68,68,0.15)' : 'var(--bg-3)',
              border: `1px solid ${erasing ? '#ef4444' : 'var(--border)'}`,
              borderRadius: 6, cursor: 'pointer', color: erasing ? '#ef4444' : 'var(--text-2)',
            }}
          >
            🗑 Erase
          </button>
          <button
            onClick={() => { setSelected(null); setErasing(false); }}
            style={{
              gridColumn: 'span 2', padding: '6px 0', fontSize: 13,
              background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 6, cursor: 'pointer', color: 'var(--text-2)',
            }}
          >
            🖱 Move mode
          </button>
          <button
            onClick={flipTurn}
            style={{
              gridColumn: 'span 2', padding: '6px 0', fontSize: 12, fontWeight: 700,
              background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 6, cursor: 'pointer',
              color: turn === 'w' ? '#fff' : 'var(--text-2)',
              textShadow: turn === 'w' ? '0 0 3px #000' : 'none',
            }}
          >
            {turn === 'w' ? '♙ White' : '♟ Black'} to move
          </button>
        </div>

        {/* Board */}
        <ChessBoard
          game={chess}
          flipped={false}
          playerColor="w"
          onMove={(from, to) => {
            if (selected || erasing) {
              handleSquareClick(to);
            } else {
              const newChess = new Chess(chess.fen());
              try { newChess.move({ from, to, promotion: 'q' }); setChess(newChess); } catch {}
            }
          }}
          lastMove={null}
          inCheck={false}
        />
        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
          Click a piece from the palette, then click a square to place it
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ width: 270, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* FEN */}
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>Current FEN</div>
          <div style={{
            fontFamily: 'monospace', fontSize: 11, color: 'var(--accent)',
            background: 'var(--bg-3)', borderRadius: 6, padding: 8, wordBreak: 'break-all',
            userSelect: 'all', cursor: 'text', marginBottom: 10,
          }}>
            {currentFen}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>Load FEN</div>
          <textarea
            value={fenInput}
            onChange={e => { setFenInput(e.target.value); setFenError(''); }}
            placeholder="Paste FEN here…"
            rows={2}
            style={{
              width: '100%', background: 'var(--bg-3)', border: `1px solid ${fenError ? '#ef4444' : 'var(--border)'}`,
              borderRadius: 6, color: 'var(--text-1)', padding: 8, fontSize: 12,
              fontFamily: 'monospace', resize: 'vertical',
            }}
          />
          {fenError && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{fenError}</div>}
          <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 6 }} onClick={loadFen}>
            Load position
          </button>
        </div>

        {/* Actions */}
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>Actions</div>
          <button className="btn btn-primary btn-sm" onClick={startGame}>▶ Analyse this position</button>
          <button className="btn btn-secondary btn-sm" onClick={resetBoard}>↺ Reset to start</button>
          <button className="btn btn-secondary btn-sm" onClick={clearBoard}>🗑 Clear board</button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/${universe}`)}>← Back to lobby</button>
        </div>

        {/* Presets */}
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>Preset positions</div>
          {[
            { label: 'Starting position', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
            { label: 'Lucena position', fen: '1K1k4/1P6/8/8/8/8/r7/3R4 w - - 0 1' },
            { label: 'Philidor position', fen: '4k3/8/4K3/4PR2/8/8/8/4r3 b - - 0 1' },
            { label: 'Queen vs Rook', fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1' },
          ].map(p => (
            <button
              key={p.label}
              onClick={() => { try { setChess(new Chess(p.fen)); setFenError(''); } catch {} }}
              style={{
                display: 'block', width: '100%', background: 'none', border: 'none',
                color: 'var(--text-2)', fontSize: 13, padding: '5px 0', cursor: 'pointer',
                textAlign: 'left', borderBottom: '1px solid var(--border)',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
