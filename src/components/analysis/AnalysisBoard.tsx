import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import { ChessBoard } from '../chess/ChessBoard';
import { useAnalysisStore, AnalysedMove, MoveClass, analyseGame } from '../../stores/analysisStore';
import { useStockfish } from '../../hooks/useStockfish';
import '../../styles/analysis.css';

// ── Move classification metadata ─────────────────────────────────────────────
const CLASS_META: Record<MoveClass, { label: string; symbol: string; color: string; bg: string }> = {
  brilliant:  { label: 'Brilliant',  symbol: '!!', color: '#00b5ff', bg: 'rgba(0,181,255,0.15)' },
  great:      { label: 'Great',      symbol: '!',  color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  best:       { label: 'Best',       symbol: '✓',  color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  good:       { label: 'Good',       symbol: '',   color: '#94a3b8', bg: 'transparent' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  mistake:    { label: 'Mistake',    symbol: '?',  color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  blunder:    { label: 'Blunder',    symbol: '??', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

// ── Eval bar ──────────────────────────────────────────────────────────────────
const EvalBar: React.FC<{ eval_cp: number }> = ({ eval_cp }) => {
  // clamp to ±800 cp for visual
  const clamped   = Math.max(-800, Math.min(800, eval_cp));
  const whitePct  = 50 + (clamped / 800) * 50;
  const label     = Math.abs(eval_cp) > 800
    ? (eval_cp > 0 ? '+M' : '-M')
    : (eval_cp >= 0 ? `+${(eval_cp / 100).toFixed(1)}` : `${(eval_cp / 100).toFixed(1)}`);

  return (
    <div className="eval-bar-wrap">
      <div className="eval-label white-label">{eval_cp >= 0 ? label : ''}</div>
      <div className="eval-bar">
        <div
          className="eval-bar-white"
          style={{ height: `${whitePct}%`, transition: 'height 0.3s ease' }}
        />
      </div>
      <div className="eval-label black-label">{eval_cp < 0 ? label : ''}</div>
    </div>
  );
};

// ── Accuracy donut ─────────────────────────────────────────────────────────────
const AccuracyDonut: React.FC<{ value: number; label: string; color: string }> = ({ value, label, color }) => {
  const r    = 28;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;

  return (
    <div className="acc-donut-wrap">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--bg-3)" strokeWidth="6" />
        <circle
          cx="36" cy="36" r={r}
          fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
        <text x="36" y="40" textAnchor="middle" fontSize="13" fontWeight="800" fill={color}>
          {value}
        </text>
      </svg>
      <div className="acc-donut-label">{label}</div>
    </div>
  );
};

// ── Chart: eval over time ─────────────────────────────────────────────────────
const EvalChart: React.FC<{ moves: AnalysedMove[]; currentIdx: number; onSeek: (i: number) => void }> = ({
  moves, currentIdx, onSeek,
}) => {
  if (moves.length === 0) return null;
  const W = 600, H = 80;
  const evals = [0, ...moves.map(m => m.evalAfter)];
  const min   = Math.min(-200, ...evals);
  const max   = Math.max( 200, ...evals);
  const rng   = max - min || 1;

  const pts = evals.map((e, i) => {
    const x = (i / (evals.length - 1)) * W;
    const y = H - ((e - min) / rng) * H;
    return { x, y };
  });

  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const areaTop  = pts.map(p => `${p.x},${p.y}`).join(' ');
  const zeroY    = H - ((0 - min) / rng) * H;
  const cur      = pts[currentIdx + 1] || pts[pts.length - 1];

  return (
    <div className="eval-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="eval-chart-svg" onClick={e => {
        const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
        const xPct = (e.clientX - rect.left) / rect.width;
        const idx  = Math.round(xPct * (evals.length - 1)) - 1;
        onSeek(Math.max(0, Math.min(moves.length - 1, idx)));
      }}>
        {/* Zero line */}
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
        {/* White area */}
        <polygon
          points={`0,${zeroY} ${areaTop} ${W},${zeroY}`}
          fill="rgba(255,255,255,0.12)"
        />
        {/* Eval line */}
        <polyline points={polyline} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
        {/* Current position cursor */}
        {cur && (
          <>
            <line x1={cur.x} y1={0} x2={cur.x} y2={H} stroke="var(--accent)" strokeWidth="1.5" opacity="0.7" />
            <circle cx={cur.x} cy={cur.y} r="5" fill="var(--accent)" />
          </>
        )}
      </svg>
    </div>
  );
};

// ── Classification summary ────────────────────────────────────────────────────
const ClassSummary: React.FC<{ moves: AnalysedMove[]; side: 'white' | 'black' }> = ({ moves, side }) => {
  const sideIdx  = side === 'white' ? 0 : 1;
  const sideMoves = moves.filter((_, i) => i % 2 === sideIdx);

  const counts: Record<MoveClass, number> = {
    brilliant: 0, great: 0, best: 0, good: 0,
    inaccuracy: 0, mistake: 0, blunder: 0,
  };
  sideMoves.forEach(m => counts[m.class]++);

  const order: MoveClass[] = ['brilliant', 'great', 'best', 'good', 'inaccuracy', 'mistake', 'blunder'];

  return (
    <div className="class-summary">
      {order.filter(k => counts[k] > 0).map(k => {
        const meta = CLASS_META[k];
        return (
          <div key={k} className="class-row" style={{ background: meta.bg }}>
            <span className="class-symbol" style={{ color: meta.color }}>
              {meta.symbol || '·'}
            </span>
            <span className="class-label" style={{ color: meta.color }}>{meta.label}</span>
            <span className="class-count">{counts[k]}</span>
          </div>
        );
      })}
    </div>
  );
};

// ── Main AnalysisBoard component ──────────────────────────────────────────────
export const AnalysisBoard: React.FC = () => {
  const navigate   = useNavigate();
  const [params]   = useSearchParams();
  const { currentGame, games, getById } = useAnalysisStore();

  // Support both direct navigation and passed state
  const gameId = params.get('id');
  const game   = gameId ? getById(gameId) : currentGame;

  const [moveIdx,   setMoveIdx]   = useState(-1); // -1 = start position
  const [activeTab, setActiveTab] = useState<'moves' | 'summary'>('moves');
  const [flipped,   setFlipped]   = useState(false);
  const moveListRef = useRef<HTMLDivElement>(null);

  // ── Stockfish live eval ──────────────────────────────────────────────────
  const { evaluate, stop, ready: sfReady } = useStockfish();
  const [sfScore,    setSfScore]    = useState<number | null>(null);
  const [sfBestMove, setSfBestMove] = useState<string>('');
  const [sfDepth,    setSfDepth]    = useState(0);

  const totalMoves = game?.moves.length ?? 0;

  // Derive current FEN
  const currentFen = (() => {
    if (!game) return new Chess().fen();
    if (moveIdx < 0) return game.moves[0]?.fenBefore ?? new Chess().fen();
    return game.moves[moveIdx]?.fenAfter ?? new Chess().fen();
  })();

  const currentEval = (() => {
    if (!game) return 0;
    if (moveIdx < 0) return game.moves[0]?.evalBefore ?? 0;
    return game.moves[moveIdx]?.evalAfter ?? 0;
  })();

  const currentMove = game?.moves[moveIdx];

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setMoveIdx(i => Math.min(i + 1, totalMoves - 1));
      if (e.key === 'ArrowLeft')  setMoveIdx(i => Math.max(i - 1, -1));
      if (e.key === 'ArrowUp')    setMoveIdx(-1);
      if (e.key === 'ArrowDown')  setMoveIdx(totalMoves - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [totalMoves]);

  // Auto-scroll move list
  useEffect(() => {
    if (!moveListRef.current) return;
    const active = moveListRef.current.querySelector('.an-move.active');
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [moveIdx]);

  // Run Stockfish on current position
  useEffect(() => {
    if (!sfReady || !game) return;
    setSfScore(null);
    setSfBestMove('');
    setSfDepth(0);
    evaluate(currentFen, 18, (result) => {
      // Flip score if it's black's turn (engine always returns from side-to-move)
      const chess = new Chess(currentFen);
      const score = chess.turn() === 'b' ? -result.score : result.score;
      setSfScore(score);
      setSfBestMove(result.bestMove);
      setSfDepth(result.depth);
    });
    return () => stop();
  }, [currentFen, sfReady, game]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!game) {
    return (
      <div className="an-no-game">
        <div style={{ fontSize: 56 }}>🔍</div>
        <h2>No game to analyse</h2>
        <p>Finish a game and click "Analyse" to see your review here.</p>
        <button className="btn btn-primary" onClick={() => navigate('/chess')}>Play Chess</button>
      </div>
    );
  }

  const whiteColor = '#22c55e';
  const blackColor = '#a855f7';

  // Build paired moves for display
  const pairs: { num: number; w?: AnalysedMove; b?: AnalysedMove }[] = [];
  for (let i = 0; i < totalMoves; i += 2) {
    pairs.push({ num: Math.floor(i / 2) + 1, w: game.moves[i], b: game.moves[i + 1] });
  }

  return (
    <div className="an-page">

      {/* ── Left: eval bar (Stockfish if ready, heuristic fallback) ── */}
      <EvalBar eval_cp={sfScore !== null ? sfScore : currentEval} />

      {/* ── Center: board ── */}
      <div className="an-board-col">
        {/* Player top (black) */}
        <div className="an-player-bar">
          <div className="an-avatar">{game.black[0].toUpperCase()}</div>
          <div className="an-player-name">{game.black}</div>
          <AccuracyDonut value={game.blackAccuracy} label="Accuracy" color={blackColor} />
        </div>

        {/* Board */}
        <div className="an-board-wrap">
          <ChessBoard
            game={new Chess(currentFen)}
            flipped={flipped}
            playerColor={flipped ? 'b' : 'w'}
            onMove={() => {}}  // read-only in analysis
            lastMove={currentMove ? { from: currentMove.from as any, to: currentMove.to as any } : null}
            inCheck={false}
          />

          {/* Move classification badge overlay */}
          {currentMove && CLASS_META[currentMove.class].symbol && (
            <div
              className="an-class-badge"
              style={{
                background: CLASS_META[currentMove.class].bg,
                color: CLASS_META[currentMove.class].color,
                borderColor: CLASS_META[currentMove.class].color,
              }}
            >
              <span className="an-class-sym">{CLASS_META[currentMove.class].symbol}</span>
              {CLASS_META[currentMove.class].label}
            </div>
          )}
        </div>

        {/* Player bottom (white) */}
        <div className="an-player-bar">
          <div className="an-avatar" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
            {game.white[0].toUpperCase()}
          </div>
          <div className="an-player-name">{game.white}</div>
          <AccuracyDonut value={game.whiteAccuracy} label="Accuracy" color={whiteColor} />
        </div>

        {/* Nav controls */}
        <div className="an-nav">
          <button className="an-nav-btn" onClick={() => setMoveIdx(-1)} title="Start (↑)">⏮</button>
          <button className="an-nav-btn" onClick={() => setMoveIdx(i => Math.max(i - 1, -1))} title="Previous (←)">◀</button>
          <span className="an-nav-count">
            {moveIdx + 2}/{totalMoves}
          </span>
          <button className="an-nav-btn" onClick={() => setMoveIdx(i => Math.min(i + 1, totalMoves - 1))} title="Next (→)">▶</button>
          <button className="an-nav-btn" onClick={() => setMoveIdx(totalMoves - 1)} title="End (↓)">⏭</button>
          <button className="an-nav-btn" onClick={() => setFlipped(f => !f)} title="Flip board">↕</button>
        </div>

        {/* Eval chart */}
        <EvalChart
          moves={game.moves}
          currentIdx={moveIdx}
          onSeek={setMoveIdx}
        />
        <div className="an-chart-legend">
          <span style={{ color: 'var(--accent)' }}>— Evaluation</span>
          <span className="an-chart-hint">Click chart to jump to move · ← → to navigate</span>
        </div>
      </div>

      {/* ── Right: moves + summary ── */}
      <div className="an-sidebar">
        {/* Game info header */}
        <div className="an-game-info">
          <div className="an-game-title">
            {game.white} vs {game.black}
          </div>
          <div className="an-game-meta">
            {game.tc} · {game.result} · {new Date(game.playedAt).toLocaleDateString()}
          </div>
        </div>

        {/* Stockfish live eval panel */}
        <div className="sf-panel">
          <div className="sf-panel-header">
            <span>⚡ Stockfish 18</span>
            <span className="sf-status" style={{ color: sfReady ? 'var(--accent)' : 'var(--text-3)' }}>
              {sfReady ? `depth ${sfDepth}` : 'loading…'}
            </span>
          </div>
          <div className="sf-panel-body">
            <div className="sf-score">
              {sfScore !== null
                ? (sfScore > 9000 ? '+M' : sfScore < -9000 ? '-M' : (sfScore >= 0 ? '+' : '') + (sfScore / 100).toFixed(2))
                : '…'}
            </div>
            {sfBestMove && (
              <div className="sf-bestmove">
                Best: <strong>{sfBestMove}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Best move banner (from heuristic pre-analysis) */}
        {currentMove?.bestSan && (
          <div className="an-best-move-banner">
            <span className="an-best-label">💡 Best was</span>
            <span className="an-best-san">{currentMove.bestSan}</span>
            <span className="an-best-eval">
              ({currentMove.bestEval !== undefined
                ? (currentMove.bestEval >= 0 ? '+' : '') + (currentMove.bestEval / 100).toFixed(1)
                : '—'})
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="an-tabs">
          <button className={`an-tab ${activeTab === 'moves' ? 'active' : ''}`} onClick={() => setActiveTab('moves')}>
            📋 Moves
          </button>
          <button className={`an-tab ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>
            📊 Summary
          </button>
        </div>

        {/* MOVES TAB */}
        {activeTab === 'moves' && (
          <div className="an-move-list" ref={moveListRef}>
            {pairs.map(pair => (
              <div key={pair.num} className="an-move-pair">
                <span className="an-move-num">{pair.num}.</span>

                {/* White move */}
                {pair.w && (() => {
                  const idx  = (pair.num - 1) * 2;
                  const meta = CLASS_META[pair.w.class];
                  return (
                    <button
                      className={`an-move ${idx === moveIdx ? 'active' : ''}`}
                      style={idx === moveIdx ? { background: meta.bg, color: meta.color } : {}}
                      onClick={() => setMoveIdx(idx)}
                    >
                      {pair.w.san}
                      {meta.symbol && (
                        <span className="an-move-sym" style={{ color: meta.color }}>{meta.symbol}</span>
                      )}
                    </button>
                  );
                })()}

                {/* Black move */}
                {pair.b && (() => {
                  const idx  = (pair.num - 1) * 2 + 1;
                  const meta = CLASS_META[pair.b.class];
                  return (
                    <button
                      className={`an-move ${idx === moveIdx ? 'active' : ''}`}
                      style={idx === moveIdx ? { background: meta.bg, color: meta.color } : {}}
                      onClick={() => setMoveIdx(idx)}
                    >
                      {pair.b.san}
                      {meta.symbol && (
                        <span className="an-move-sym" style={{ color: meta.color }}>{meta.symbol}</span>
                      )}
                    </button>
                  );
                })()}
              </div>
            ))}
          </div>
        )}

        {/* SUMMARY TAB */}
        {activeTab === 'summary' && (
          <div className="an-summary">
            {/* Accuracy row */}
            <div className="an-acc-row">
              <div className="an-acc-card">
                <AccuracyDonut value={game.whiteAccuracy} label={game.white} color={whiteColor} />
              </div>
              <div className="an-acc-vs">vs</div>
              <div className="an-acc-card">
                <AccuracyDonut value={game.blackAccuracy} label={game.black} color={blackColor} />
              </div>
            </div>

            {/* Move counts by classification */}
            <div className="an-class-panels">
              <div className="an-class-panel">
                <div className="an-class-panel-title" style={{ color: whiteColor }}>♙ {game.white}</div>
                <ClassSummary moves={game.moves} side="white" />
              </div>
              <div className="an-class-panel">
                <div className="an-class-panel-title" style={{ color: blackColor }}>♟ {game.black}</div>
                <ClassSummary moves={game.moves} side="black" />
              </div>
            </div>

            {/* Per-move eval delta table */}
            <div className="an-eval-table-title">Move-by-move evaluation</div>
            <div className="an-eval-table">
              <div className="an-eval-head">
                <span>#</span><span>Move</span><span>Eval</span><span>Δ</span><span>Class</span>
              </div>
              {game.moves.map((m, i) => {
                const meta    = CLASS_META[m.class];
                const isActive = i === moveIdx;
                return (
                  <div
                    key={i}
                    className={`an-eval-row ${isActive ? 'active' : ''}`}
                    onClick={() => setMoveIdx(i)}
                    style={isActive ? { background: meta.bg } : {}}
                  >
                    <span className="an-eval-idx">{Math.floor(i / 2) + 1}{i % 2 === 0 ? '.' : '…'}</span>
                    <span className="an-eval-san">{m.san}</span>
                    <span className="an-eval-val">
                      {m.evalAfter >= 0 ? '+' : ''}{(m.evalAfter / 100).toFixed(1)}
                    </span>
                    <span
                      className="an-eval-delta"
                      style={{ color: m.delta >= 0 ? '#22c55e' : '#ef4444' }}
                    >
                      {m.delta >= 0 ? '+' : ''}{(m.delta / 100).toFixed(1)}
                    </span>
                    <span className="an-eval-class" style={{ color: meta.color }}>
                      {meta.symbol || '·'} {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Back button */}
        <button className="an-back-btn" onClick={() => navigate(-1)}>
          ← Back to game
        </button>
      </div>
    </div>
  );
};
