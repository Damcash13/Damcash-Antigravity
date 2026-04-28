import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Chess, Square } from 'chess.js';
import { ChessBoard } from '../chess/ChessBoard';
import { api, ApiMatch } from '../../lib/api';

// ── Move list entry ───────────────────────────────────────────────────────────
interface ReplayMove {
  san: string;
  fen: string;
  from: Square;
  to: Square;
}

// ── Build move list from PGN ──────────────────────────────────────────────────
function parsePgn(pgn: string): ReplayMove[] {
  const moves: ReplayMove[] = [];
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    // Rebuild from start, step by step
    const rebuilder = new Chess();
    for (const h of history) {
      const fenBefore = rebuilder.fen();
      rebuilder.move({ from: h.from, to: h.to, promotion: h.promotion });
      moves.push({ san: h.san, fen: rebuilder.fen(), from: h.from as Square, to: h.to as Square });
    }
  } catch {}
  return moves;
}

// ── Keyboard hook ──────────────────────────────────────────────────────────────
function useArrowKeys(onLeft: () => void, onRight: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); onLeft(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onRight(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onLeft, onRight]);
}

// ── Result badge ──────────────────────────────────────────────────────────────
const ResultBadge: React.FC<{ result: string | null; white: string; black: string }> = ({ result, white, black }) => {
  const label = result === 'white' ? `${white} wins` : result === 'black' ? `${black} wins` : result === 'draw' ? 'Draw' : '–';
  const score = result === 'white' ? '1 – 0' : result === 'black' ? '0 – 1' : result === 'draw' ? '½ – ½' : '* – *';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-2)', padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
      <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--accent)' }}>{score}</span>
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export const GameReplayPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [game, setGame]     = useState<ApiMatch | null>(null);
  const [moves, setMoves]   = useState<ReplayMove[]>([]);
  const [cursor, setCursor] = useState(-1); // -1 = start position
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [flipped, setFlipped] = useState(false);

  // pgn can be passed as query param (from profile history) or fetched by id
  const pgnParam = searchParams.get('pgn');

  useEffect(() => {
    if (pgnParam) {
      const decoded = decodeURIComponent(pgnParam);
      const parsed = parsePgn(decoded);
      setMoves(parsed);
      setCursor(parsed.length - 1);
      setLoading(false);
      return;
    }
    if (!id) { setError('No game ID provided'); setLoading(false); return; }
    api.games.get(id)
      .then(g => {
        setGame(g);
        if (g.pgn) {
          const parsed = parsePgn(g.pgn);
          setMoves(parsed);
          setCursor(parsed.length - 1);
        }
      })
      .catch(() => setError('Game not found'))
      .finally(() => setLoading(false));
  }, [id, pgnParam]);

  const goTo = useCallback((idx: number) => {
    setCursor(Math.max(-1, Math.min(idx, moves.length - 1)));
  }, [moves.length]);

  const prev = useCallback(() => goTo(cursor - 1), [cursor, goTo]);
  const next = useCallback(() => goTo(cursor + 1), [cursor, goTo]);
  useArrowKeys(prev, next);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
      <div className="spinner" />
    </div>
  );

  if (error) return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
      <h2 style={{ color: 'var(--text-1)', marginBottom: 8 }}>{error}</h2>
      <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Go back</button>
    </div>
  );

  const currentFen = cursor < 0
    ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    : moves[cursor].fen;

  const chess = (() => { try { return new Chess(currentFen); } catch { return new Chess(); } })();
  const lastMove = cursor >= 0 ? { from: moves[cursor].from, to: moves[cursor].to } : null;

  const whiteName = game?.white.username ?? 'White';
  const blackName = game?.black.username ?? 'Black';

  // Group moves into pairs for the move list
  const movePairs: { num: number; white: string; black: string; wi: number; bi: number }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({ num: Math.floor(i / 2) + 1, white: moves[i].san, black: moves[i + 1]?.san ?? '', wi: i, bi: i + 1 });
  }

  return (
    <div style={{ display: 'flex', gap: 24, padding: '16px 0', maxWidth: 1100, margin: '0 auto', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* ── Board column ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        {/* Back + header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, alignSelf: 'stretch' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
          {game && <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
            {whiteName} vs {blackName} · {game.timeControl}
          </span>}
        </div>

        {/* Black player bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'stretch', background: 'var(--bg-2)', padding: '8px 12px', borderRadius: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a1a1a', border: '2px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#eee', fontWeight: 700 }}>
            {(flipped ? whiteName : blackName)[0]?.toUpperCase()}
          </div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{flipped ? whiteName : blackName}</span>
        </div>

        {/* Board */}
        <ChessBoard
          game={chess}
          flipped={flipped}
          playerColor="w"
          onMove={() => {}}
          lastMove={lastMove}
          inCheck={chess.isCheck()}
        />

        {/* White player bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'stretch', background: 'var(--bg-2)', padding: '8px 12px', borderRadius: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#fff', border: '2px solid #999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#333', fontWeight: 700 }}>
            {(flipped ? blackName : whiteName)[0]?.toUpperCase()}
          </div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{flipped ? blackName : whiteName}</span>
        </div>

        {/* Nav controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => goTo(-1)} title="Start">⏮</button>
          <button className="btn btn-secondary btn-sm" onClick={prev}          title="Previous (←)">◀</button>
          <span style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 64, textAlign: 'center' }}>
            {cursor < 0 ? 'Start' : `Move ${cursor + 1} / ${moves.length}`}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={next}               title="Next (→)">▶</button>
          <button className="btn btn-secondary btn-sm" onClick={() => goTo(moves.length - 1)} title="End">⏭</button>
          <button className="btn btn-ghost btn-sm"     onClick={() => setFlipped(f => !f)} title="Flip board">↕</button>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div style={{ flex: 1, minWidth: 240, maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Result */}
        {game && <ResultBadge result={game.result} white={whiteName} black={blackName} />}

        {/* Move list */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', flex: 1 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>
            Moves ({moves.length})
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto', padding: 8 }}>
            {movePairs.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: 12 }}>No moves to replay</div>
              : movePairs.map(pair => (
                <div key={pair.num} style={{ display: 'flex', gap: 2, fontSize: 13, fontFamily: 'monospace', marginBottom: 2 }}>
                  <span style={{ color: 'var(--text-3)', width: 26, textAlign: 'right', flexShrink: 0, paddingRight: 4 }}>{pair.num}.</span>
                  <button
                    onClick={() => goTo(pair.wi)}
                    style={{
                      flex: 1, padding: '2px 6px', borderRadius: 4, border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: cursor === pair.wi ? 'var(--accent)' : 'transparent',
                      color: cursor === pair.wi ? '#fff' : 'var(--text-1)',
                      fontFamily: 'inherit', fontSize: 'inherit',
                    }}
                  >
                    {pair.white}
                  </button>
                  {pair.black && (
                    <button
                      onClick={() => goTo(pair.bi)}
                      style={{
                        flex: 1, padding: '2px 6px', borderRadius: 4, border: 'none', cursor: 'pointer', textAlign: 'left',
                        background: cursor === pair.bi ? 'var(--accent)' : 'transparent',
                        color: cursor === pair.bi ? '#fff' : 'var(--text-1)',
                        fontFamily: 'inherit', fontSize: 'inherit',
                      }}
                    >
                      {pair.black}
                    </button>
                  )}
                </div>
              ))
            }
          </div>
        </div>

        {/* Keyboard hint */}
        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
          Use ← → arrow keys to navigate
        </div>
      </div>
    </div>
  );
};
