import React, { memo } from 'react';
import { Chess } from 'chess.js';
import { LiveGame } from '../../stores';
import { DraughtsBoard as DraughtsBoardType } from '../../types';

// ── Board size constants ───────────────────────────────────────────────────────
const CHESS_CELL = 28;   // px per square  →  8 × 28 = 224px board
const DRAG_CELL  = 26;   // px per square  → 10 × 26 = 260px board

// ── Chess piece SVG images (local assets in /public/pieces/) ─────────────────
const CHESS_PIECES: Record<string, string> = {
  wk: '/pieces/wk.svg?v=3', wq: '/pieces/wq.svg?v=3', wr: '/pieces/wr.svg?v=3',
  wb: '/pieces/wb.svg?v=3', wn: '/pieces/wn.svg?v=3', wp: '/pieces/wp.svg?v=3',
  bk: '/pieces/bk.svg?v=3', bq: '/pieces/bq.svg?v=3', br: '/pieces/br.svg?v=3',
  bb: '/pieces/bb.svg?v=3', bn: '/pieces/bn.svg?v=3', bp: '/pieces/bp.svg?v=3',
};

// ── Read-only Chess Board ─────────────────────────────────────────────────────
const MiniChessBoard: React.FC<{ fen: string }> = memo(({ fen }) => {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    chess = new Chess();
  }

  const ranks = ['8','7','6','5','4','3','2','1'];
  const files = ['a','b','c','d','e','f','g','h'];
  const size = CHESS_CELL * 8;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(8, ${CHESS_CELL}px)`,
        gridTemplateRows: `repeat(8, ${CHESS_CELL}px)`,
        width: size,
        height: size,
        border: '2px solid #555',
        borderRadius: 3,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {ranks.map((rank, ri) =>
        files.map((file, fi) => {
          const isLight = (ri + fi) % 2 === 0;
          const sq = `${file}${rank}` as any;
          const piece = chess.get(sq);
          const key = piece ? `${piece.color}${piece.type}` : null;
          const imgSrc = key ? CHESS_PIECES[key] : null;

          return (
            <div
              key={sq}
              style={{
                width: CHESS_CELL,
                height: CHESS_CELL,
                background: isLight ? '#f0d9b5' : '#b58863',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {imgSrc && (
                <img
                  src={imgSrc}
                  alt={key!}
                  style={{
                    width: '92%',
                    height: '92%',
                    display: 'block',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
});

// ── Read-only Draughts Board ──────────────────────────────────────────────────
const MiniDraughtsBoard: React.FC<{ board: DraughtsBoardType }> = memo(({ board }) => {
  const size = DRAG_CELL * 10;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(10, ${DRAG_CELL}px)`,
        gridTemplateRows: `repeat(10, ${DRAG_CELL}px)`,
        width: size,
        height: size,
        border: '2px solid #555',
        borderRadius: 3,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {Array.from({ length: 10 }, (_, row) =>
        Array.from({ length: 10 }, (_, col) => {
          const isLight = (row + col) % 2 === 0;
          const piece = board[row]?.[col];

          return (
            <div
              key={`${row}-${col}`}
              style={{
                width: DRAG_CELL,
                height: DRAG_CELL,
                background: isLight ? '#f5e6c8' : '#7a3f1e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {piece && (
                <div
                  style={{
                    width: '76%',
                    height: '76%',
                    borderRadius: '50%',
                    background:
                      piece.color === 'white'
                        ? 'radial-gradient(circle at 35% 35%, #fff, #ccc)'
                        : 'radial-gradient(circle at 35% 35%, #555, #1a1a1a)',
                    border: piece.color === 'white' ? '1px solid #999' : '1px solid #000',
                    boxShadow: '1px 2px 4px rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: Math.round(DRAG_CELL * 0.45),
                  }}
                >
                  {piece.type === 'king' && (
                    <span style={{ lineHeight: 1, userSelect: 'none' }}>
                      {piece.color === 'white' ? '♛' : '♕'}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
});

// ── Live Game Card ────────────────────────────────────────────────────────────
const LiveGameCard: React.FC<{ game: LiveGame; onClick: () => void }> = ({ game, onClick }) => {
  const chessSize = CHESS_CELL * 8;
  const dragSize  = DRAG_CELL  * 10;
  const boardSize = game.universe === 'chess' ? chessSize : dragSize;

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        width: boardSize + 2,   // +2 for the board border
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 28px var(--accent-dim)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = '';
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '';
      }}
    >
      {/* Board — strict universe guard */}
      <div style={{ lineHeight: 0 }}>
        {game.universe === 'chess' ? (
          game.fen
            ? <MiniChessBoard fen={game.fen} />
            : <div style={{ width: CHESS_CELL * 8, height: CHESS_CELL * 8, background: 'var(--bg-3)' }} />
        ) : (
          game.draughtsBoard
            ? <MiniDraughtsBoard board={game.draughtsBoard} />
            : <div style={{ width: DRAG_CELL * 10, height: DRAG_CELL * 10, background: 'var(--bg-3)' }} />
        )}
      </div>

      {/* Info bar */}
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Players */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {game.white.name} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({game.white.rating})</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, flexShrink: 0, margin: '0 4px' }}>vs</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
            {game.black.name} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({game.black.rating})</span>
          </span>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{
              background: 'rgba(239,68,68,0.18)', color: '#ef4444',
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
              animation: 'pulse 2s infinite',
            }}>● LIVE</span>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{game.tc}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{game.moveCount} moves</span>
          </div>
          {game.bet > 0 && (
            <span style={{
              background: 'var(--accent-dim)', color: 'var(--accent)',
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            }}>
              💰 ${game.bet}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main export ───────────────────────────────────────────────────────────────
interface Props {
  games: LiveGame[];
  universe: 'chess' | 'checkers';
  onClickGame: (id: string, universe: 'chess' | 'checkers') => void;
}

export const LiveGamesSection: React.FC<Props> = ({ games, universe, onClickGame }) => {
  const visible = games.filter((g) => g.universe === universe && g.status === 'playing');

  if (visible.length === 0) return (
    <div style={{
      padding: '24px 16px',
      textAlign: 'center',
      color: 'var(--text-3)',
      fontSize: 13,
      background: 'var(--bg-card)',
      borderRadius: 12,
      border: '1px dashed var(--border)',
    }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🎮</div>
      <div>No live games right now</div>
      <div style={{ fontSize: 11, marginTop: 4 }}>Start a game and it will appear here</div>
    </div>
  );

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', gap: 16, width: 'max-content' }}>
        {visible.map((game) => (
          <LiveGameCard
            key={game.id}
            game={game}
            onClick={() => onClickGame(game.id, game.universe)}
          />
        ))}
      </div>
    </div>
  );
};
