import React, { useState } from 'react';
import { useUserStore, RatingEntry } from '../../stores';
import { ratingBand } from '../../lib/elo';
import '../../styles/rating-card.css';

// ── Mini sparkline chart ──────────────────────────────────────────────────────
const Sparkline: React.FC<{ entries: RatingEntry[]; universe: 'chess' | 'checkers' }> = ({ entries, universe }) => {
  const data = [...entries]
    .filter(e => e.universe === universe)
    .reverse()
    .slice(-30)
    .map(e => e.after);

  if (data.length < 2) return (
    <div className="sparkline-empty">Play games to see your rating chart</div>
  );

  const min = Math.min(...data) - 20;
  const max = Math.max(...data) + 20;
  const range = max - min;
  const W = 300, H = 70;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(' ');

  const first = data[0];
  const last  = data[data.length - 1];
  const color = last >= first ? '#22c55e' : '#ef4444';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sparkline-svg">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <polygon
        points={`0,${H} ${points} ${W},${H}`}
        fill="url(#spark-grad)"
      />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last dot */}
      {data.length > 0 && (() => {
        const lx = W;
        const ly = H - ((last - min) / range) * H;
        return <circle cx={lx} cy={ly} r="4" fill={color} />;
      })()}
    </svg>
  );
};

// ── Rating history table ───────────────────────────────────────────────────────
const HistoryTable: React.FC<{ entries: RatingEntry[]; universe: 'chess' | 'checkers' }> = ({ entries, universe }) => {
  const filtered = entries.filter(e => e.universe === universe).slice(0, 50);

  if (filtered.length === 0) return (
    <div className="rc-empty">No games played yet in {universe}.</div>
  );

  return (
    <div className="rc-history">
      <div className="rc-history-head">
        <span>Date</span>
        <span>Opponent</span>
        <span className="center">Opp. Rating</span>
        <span className="center">Result</span>
        <span className="center">Rating</span>
        <span className="center">Δ</span>
      </div>
      {filtered.map((e, i) => {
        const date = new Date(e.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const resultLabel = e.result === 'win' ? 'Win' : e.result === 'draw' ? 'Draw' : 'Loss';
        const resultClass = e.result === 'win' ? 'win' : e.result === 'draw' ? 'draw' : 'loss';
        return (
          <div key={i} className="rc-history-row">
            <span className="rc-date">{date}</span>
            <span className="rc-opponent">{e.opponent}</span>
            <span className="center rc-opp-rating">{e.opponentRating}</span>
            <span className={`center rc-result ${resultClass}`}>{resultLabel}</span>
            <span className="center rc-after">{e.after}</span>
            <span className={`center rc-delta ${e.delta >= 0 ? 'pos' : 'neg'}`}>
              {e.delta >= 0 ? '+' : ''}{e.delta}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
}

export const RatingCard: React.FC<Props> = ({ open, onClose }) => {
  const { user, ratingHistory, gamesPlayed } = useUserStore();
  const [universe, setUniverse] = useState<'chess' | 'checkers'>('chess');

  if (!open || !user) return null;

  const rating  = user.rating[universe];
  const band    = ratingBand(rating);
  const games   = gamesPlayed[universe] || 0;
  const history = ratingHistory.filter(e => e.universe === universe);

  const wins   = history.filter(e => e.result === 'win').length;
  const draws  = history.filter(e => e.result === 'draw').length;
  const losses = history.filter(e => e.result === 'loss').length;

  // Score of last 10
  const last10 = history.slice(0, 10);
  const recentScore = last10.filter(e => e.result === 'win').length
    + last10.filter(e => e.result === 'draw').length * 0.5;

  // Peak
  const peak = history.length > 0
    ? Math.max(rating, ...history.map(e => e.after))
    : rating;

  return (
    <div className="rc-backdrop" onClick={onClose}>
      <div className="rc-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="rc-header">
          <div className="rc-player-info">
            <div className="rc-avatar">{user.name[0]?.toUpperCase()}</div>
            <div>
              <div className="rc-name">{user.name}</div>
              <div className="rc-band" style={{ color: band.color }}>{band.label}</div>
            </div>
          </div>
          <button className="rc-close" onClick={onClose}>×</button>
        </div>

        {/* Universe tabs */}
        <div className="rc-universe-tabs">
          <button
            className={`rc-utab ${universe === 'chess' ? 'active' : ''}`}
            onClick={() => setUniverse('chess')}
          >♟ Chess</button>
          <button
            className={`rc-utab ${universe === 'checkers' ? 'active' : ''}`}
            onClick={() => setUniverse('checkers')}
          >⬤ Draughts</button>
        </div>

        <div className="rc-body">
          {/* Rating hero */}
          <div className="rc-rating-hero">
            <div>
              <div className="rc-rating-num" style={{ color: band.color }}>{rating}</div>
              <div className="rc-rating-label">Current Rating</div>
            </div>
            <div className="rc-rating-stats">
              <div className="rc-mini-stat">
                <span className="rc-mini-val">{peak}</span>
                <span className="rc-mini-label">Peak</span>
              </div>
              <div className="rc-mini-stat">
                <span className="rc-mini-val">{games}</span>
                <span className="rc-mini-label">Games</span>
              </div>
              <div className="rc-mini-stat">
                <span className="rc-mini-val rc-win">
                  {games > 0 ? Math.round((wins / Math.max(games, 1)) * 100) : 0}%
                </span>
                <span className="rc-mini-label">Win rate</span>
              </div>
            </div>
          </div>

          {/* Sparkline chart */}
          <div className="rc-chart-wrap">
            <div className="rc-chart-title">Rating progress (last 30 games)</div>
            <Sparkline entries={ratingHistory} universe={universe} />
          </div>

          {/* W/D/L bar */}
          {games > 0 && (
            <div className="rc-wdl-section">
              <div className="rc-wdl-bar">
                <div className="rc-wdl-seg rc-wdl-w" style={{ flex: wins   || 0.01 }} title={`${wins} wins`} />
                <div className="rc-wdl-seg rc-wdl-d" style={{ flex: draws  || 0.01 }} title={`${draws} draws`} />
                <div className="rc-wdl-seg rc-wdl-l" style={{ flex: losses || 0.01 }} title={`${losses} losses`} />
              </div>
              <div className="rc-wdl-labels">
                <span className="rc-wdl-w">{wins}W</span>
                <span className="rc-wdl-d">{draws}D</span>
                <span className="rc-wdl-l">{losses}L</span>
                {last10.length >= 5 && (
                  <span className="rc-recent">
                    Last {last10.length}: {recentScore}/{last10.length}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* K-factor info */}
          <div className="rc-kfactor-row">
            <span className="rc-kf-label">K-factor</span>
            <span className="rc-kf-val">
              {games < 30 ? '40 (provisional)' : rating >= 2400 ? '10 (master)' : rating >= 2100 ? '20' : '32'}
            </span>
          </div>

          {/* History */}
          <div className="rc-section-title">Game History</div>
          <HistoryTable entries={ratingHistory} universe={universe} />
        </div>
      </div>
    </div>
  );
};
