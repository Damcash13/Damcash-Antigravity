import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUniverseStore, useUserStore } from '../../stores';
import { useLeaderboardStore, LeaderboardEntry, TimeCategory } from '../../stores/leaderboardStore';
import { ratingBand } from '../../lib/elo';
import '../../styles/leaderboard.css';

// ── Mini sparkline ────────────────────────────────────────────────────────────
const MiniSpark: React.FC<{ data: number[] }> = ({ data }) => {
  if (data.length < 2) return null;
  const W = 56, H = 22;
  const min = Math.min(...data) - 2;
  const max = Math.max(...data) + 2;
  const rng = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - ((v - min) / rng) * H}`
  ).join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none"
        stroke={up ? '#22c55e' : '#ef4444'}
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── Rank medal ────────────────────────────────────────────────────────────────
function rankDisplay(rank: number) {
  if (rank === 1) return <span className="lb-medal gold">🥇</span>;
  if (rank === 2) return <span className="lb-medal silver">🥈</span>;
  if (rank === 3) return <span className="lb-medal bronze">🥉</span>;
  return <span className="lb-rank-num">#{rank}</span>;
}

// ── Title badge ───────────────────────────────────────────────────────────────
const TITLE_COLORS: Record<string, string> = {
  GM: '#fbbf24', IM: '#a78bfa', FM: '#60a5fa', CM: '#34d399', NM: '#94a3b8',
};
const TitleBadge: React.FC<{ title?: string }> = ({ title }) => {
  if (!title) return null;
  return (
    <span className="lb-title-badge" style={{ color: TITLE_COLORS[title], borderColor: TITLE_COLORS[title] + '55' }}>
      {title}
    </span>
  );
};

// ── Time control tabs config ──────────────────────────────────────────────────
const TC_TAB_KEYS: { key: TimeCategory; timeKey: string; icon: string; color: string }[] = [
  { key: 'overall',   timeKey: 'lobby.leaderboard', icon: '🏆', color: '#f59e0b' },
  { key: 'bullet',    timeKey: 'time.bullet',    icon: '🔥', color: '#ef4444' },
  { key: 'blitz',     timeKey: 'time.blitz',     icon: '⚡', color: '#f97316' },
  { key: 'rapid',     timeKey: 'time.rapid',     icon: '🐢', color: '#22c55e' },
  { key: 'classical', timeKey: 'time.classical', icon: '🏛️', color: '#3b82f6' },
];

// ── Top 3 podium ──────────────────────────────────────────────────────────────
const Podium: React.FC<{ entries: LeaderboardEntry[] }> = ({ entries }) => {
  const [first, second, third] = entries;
  if (!first) return null;

  const PodiumCard: React.FC<{ entry: LeaderboardEntry; pos: 1 | 2 | 3 }> = ({ entry, pos }) => {
    const band = ratingBand(entry.rating);
    const heights = { 1: 110, 2: 78, 3: 58 };
    const medals  = { 1: '🥇', 2: '🥈', 3: '🥉' };
    return (
      <div className={`podium-card pos-${pos}`} style={{ '--podium-h': `${heights[pos]}px` } as React.CSSProperties}>
        <div className="podium-player">
          <div className="podium-avatar" style={{ borderColor: pos === 1 ? '#fbbf24' : pos === 2 ? '#94a3b8' : '#cd7f32' }}>
            {entry.name[0].toUpperCase()}
            {entry.online && <span className="podium-online-dot" />}
          </div>
          <div className="podium-medal">{medals[pos]}</div>
          <div className="podium-name">
            <TitleBadge title={entry.title} />
            {entry.name}
          </div>
          <div className="podium-country">{entry.country}</div>
          <div className="podium-rating" style={{ color: band.color }}>{entry.rating}</div>
          <div className="podium-band" style={{ color: band.color }}>{band.label}</div>
        </div>
        <div className="podium-base" />
      </div>
    );
  };

  return (
    <div className="podium-wrap">
      {second && <PodiumCard entry={second} pos={2} />}
      {first  && <PodiumCard entry={first}  pos={1} />}
      {third  && <PodiumCard entry={third}  pos={3} />}
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
export const LeaderboardPage: React.FC = () => {
  const navigate  = useNavigate();
  const { universe } = useUniverseStore();
  const { user } = useUserStore();
  const { chess, checkers, loading, error, fetchLeaderboard } = useLeaderboardStore();

  const { t } = useTranslation();
  const [tc,     setTc]     = useState<TimeCategory>('overall');
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(0);
  const PAGE_SIZE = 15;

  // Fetch on mount and when universe/category changes
  const leaderboardUniverse = universe === 'chess' ? 'chess' : 'checkers';
  React.useEffect(() => {
    fetchLeaderboard(leaderboardUniverse, tc);
  }, [leaderboardUniverse, tc]); // eslint-disable-line react-hooks/exhaustive-deps

  const rawList = (universe === 'chess' ? chess : checkers)[tc];

  const filtered = useMemo(() =>
    search.trim()
      ? rawList.filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
      : rawList,
    [rawList, search]
  );

  const pages      = Math.ceil(filtered.length / PAGE_SIZE);
  const pageSlice  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const top3       = filtered.slice(0, 3);

  // Find user's own rank
  const myEntry   = user ? rawList.find(e => e.id === user.id) : undefined;
  const TC_TABS = TC_TAB_KEYS.map(tab => ({ ...tab, label: t(tab.timeKey) }));
  const activeTab = TC_TABS.find(tab => tab.key === tc)!;

  return (
    <div className="lb-page">

      {/* ── Page header ── */}
      <div className="lb-topbar">
        <div>
          <h1 className="lb-title">
            {universe === 'chess' ? '♟' : '⬤'} {t('lobby.leaderboard')}
          </h1>
          <p className="lb-subtitle">
            {activeTab.label} · {filtered.length} {t('leaderboard.player')}
          </p>
        </div>

        {/* Search */}
        <div className="lb-search-wrap">
          <input
            className="lb-search"
            placeholder={`🔍 ${t('lobby.searchPlayers')}`}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
      </div>

      {/* ── Time control tabs ── */}
      <div className="lb-tc-tabs">
        {TC_TABS.map(tab => (
          <button
            key={tab.key}
            className={`lb-tc-tab ${tc === tab.key ? 'active' : ''}`}
            style={tc === tab.key ? { borderColor: tab.color, color: tab.color } : {}}
            onClick={() => { setTc(tab.key); setPage(0); }}
            disabled={loading}
          >
            <span className="lb-tc-icon">
              {loading && tc === tab.key
                ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', verticalAlign: 'middle' }} />
                : tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Podium (only on page 0 with no search) ── */}
      {page === 0 && !search && <Podium entries={top3} />}

      {/* ── My position banner ── */}
      {myEntry && !search && (
        <div className="lb-my-rank-banner">
          <span className="lb-my-rank-label">{t('leaderboard.rank')}</span>
          <span className="lb-my-rank-val">#{myEntry.rank}</span>
          <span className="lb-my-name">{myEntry.name}</span>
          <span className="lb-my-rating">{myEntry.rating}</span>
          <span className="lb-my-band" style={{ color: ratingBand(myEntry.rating).color }}>
            {ratingBand(myEntry.rating).label}
          </span>
        </div>
      )}

      {/* ── Summary / Error ── */}
      {error ? (
        <div className="lb-error-banner">
          <div style={{ fontSize: 32 }}>⚠️</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{t('common.error')}</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>{error}</div>
          </div>
          <button className="btn btn-primary" onClick={() => fetchLeaderboard(leaderboardUniverse, tc)}>
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <div className="lb-summary-row">
          <div className="lb-summary-card">
            <div className="lb-sc-val">{rawList.length}</div>
            <div className="lb-sc-label">{t('leaderboard.topPlayers')}</div>
          </div>
          <div className="lb-summary-card">
            <div className="lb-sc-val" style={{ color: '#22c55e' }}>
              {rawList.filter(e => e.online).length}
            </div>
            <div className="lb-sc-label">{t('common.online')}</div>
          </div>
          <div className="lb-summary-card">
            <div className="lb-sc-val">{rawList[0]?.rating ?? '—'}</div>
            <div className="lb-sc-label">{t('profile.peak')}</div>
          </div>
          <div className="lb-summary-card">
            <div className="lb-sc-val">
              {rawList.length > 0
                ? Math.round(rawList.reduce((s, e) => s + e.rating, 0) / rawList.length)
                : '—'}
            </div>
            <div className="lb-sc-label">{t('common.rating')}</div>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="lb-table-wrap">
        {/* Header */}
        <div className="lb-table-head">
          <span className="lb-col-rank">{t('leaderboard.rank')}</span>
          <span className="lb-col-player">{t('leaderboard.player')}</span>
          <span className="lb-col-center">{t('leaderboard.rating')}</span>
          <span className="lb-col-center lb-hide-sm">{t('leaderboard.peak')}</span>
          <span className="lb-col-center lb-hide-sm">{t('leaderboard.games')}</span>
          <span className="lb-col-center lb-hide-xs">W / D / L</span>
          <span className="lb-col-center lb-hide-xs">{t('common.winRate')}</span>
          <span className="lb-col-center lb-hide-sm">Trend</span>
          <span className="lb-col-center">{t('profile.bestStreak')}</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : pageSlice.length === 0 ? (
          <div className="lb-no-results">
            {search ? (
              <><span style={{ fontSize: 32 }}>🔍</span><span>{t('leaderboard.noPlayers')}</span></>
            ) : (
              <><span style={{ fontSize: 32 }}>🏆</span><span>{t('leaderboard.noPlayers')}</span></>
            )}
          </div>
        ) : pageSlice.map(entry => {
          const isMe  = user?.id === entry.id;
          const band  = ratingBand(entry.rating);
          const winPct = entry.gamesPlayed > 0
            ? Math.round((entry.wins / entry.gamesPlayed) * 100)
            : 0;

          return (
            <div
              key={entry.id}
              className={`lb-row ${isMe ? 'lb-row-me' : ''} ${entry.rank <= 3 ? 'lb-row-top' : ''}`}
              onClick={() => isMe && navigate('/profile')}
              style={isMe ? { cursor: 'pointer' } : undefined}
            >
              {/* Rank */}
              <div className="lb-col-rank lb-rank-cell">
                {rankDisplay(entry.rank)}
              </div>

              {/* Player */}
              <div className="lb-col-player lb-player-cell">
                <div className="lb-avatar" style={isMe ? { background: 'var(--accent)' } : undefined}>
                  {entry.name[0].toUpperCase()}
                  {entry.online && <span className="lb-online-dot" />}
                </div>
                <div className="lb-player-info">
                  <div className="lb-player-name">
                    <TitleBadge title={entry.title} />
                    {entry.name}
                    {isMe && <span className="lb-you-chip">you</span>}
                  </div>
                  <div className="lb-player-country">{entry.country}</div>
                </div>
              </div>

              {/* Rating */}
              <div className="lb-col-center">
                <span className="lb-rating" style={{ color: band.color }}>{entry.rating}</span>
                <div className="lb-rating-band" style={{ color: band.color }}>{band.label}</div>
              </div>

              {/* Peak */}
              <div className="lb-col-center lb-hide-sm lb-dim">{entry.peak}</div>

              {/* Games */}
              <div className="lb-col-center lb-hide-sm lb-dim">{entry.gamesPlayed}</div>

              {/* W/D/L */}
              <div className="lb-col-center lb-hide-xs">
                <span className="lb-w">{entry.wins}</span>
                <span className="lb-sep">/</span>
                <span className="lb-d">{entry.draws}</span>
                <span className="lb-sep">/</span>
                <span className="lb-l">{entry.losses}</span>
              </div>

              {/* Win % */}
              <div className="lb-col-center lb-hide-xs">
                <span className={`lb-winpct ${winPct >= 60 ? 'great' : winPct >= 45 ? 'good' : 'low'}`}>
                  {winPct}%
                </span>
              </div>

              {/* Trend */}
              <div className="lb-col-center lb-hide-sm">
                <MiniSpark data={entry.ratingHistory} />
              </div>

              {/* Streak */}
              <div className="lb-col-center">
                {entry.streak > 0 ? (
                  <span className="lb-streak">🔥 {entry.streak}</span>
                ) : (
                  <span className="lb-dim">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Pagination ── */}
      {pages > 1 && (
        <div className="lb-pagination">
          <button
            className="lb-page-btn"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            ← Prev
          </button>
          <div className="lb-page-nums">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                className={`lb-page-num ${page === i ? 'active' : ''}`}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button
            className="lb-page-btn"
            disabled={page === pages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};
