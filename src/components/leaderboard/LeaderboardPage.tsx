import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUniverseStore, useUserStore } from '../../stores';
import { useLeaderboardStore, LeaderboardEntry, TimeCategory } from '../../stores/leaderboardStore';
import { ratingBand } from '../../lib/elo';
import { countryFlag, countryName } from '../../lib/countries';
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
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block', color: 'var(--text-3)' }}>
      <polyline points={pts} fill="none"
        stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── Rank display ──────────────────────────────────────────────────────────────
function rankDisplay(rank: number) {
  return <span className="lb-rank-num">{rank}</span>;
}

// ── Title badge ───────────────────────────────────────────────────────────────
const TitleBadge: React.FC<{ title?: string }> = ({ title }) => {
  if (!title) return null;
  return (
    <span className="lb-title-badge">{title}</span>
  );
};

// ── Time control tabs config ──────────────────────────────────────────────────
const TC_TAB_KEYS: { key: TimeCategory; timeKey: string }[] = [
  { key: 'overall',   timeKey: 'lobby.leaderboard' },
  { key: 'bullet',    timeKey: 'time.bullet' },
  { key: 'blitz',     timeKey: 'time.blitz' },
  { key: 'rapid',     timeKey: 'time.rapid' },
  { key: 'classical', timeKey: 'time.classical' },
];

// ── Top players ───────────────────────────────────────────────────────────────
const TopPlayers: React.FC<{ entries: LeaderboardEntry[] }> = ({ entries }) => {
  const first = entries[0];
  if (!first) return null;

  return (
    <section className="lb-leaders-panel">
      <div className="lb-leaders-heading">Top players</div>
      <div className="lb-leaders-list">
        {entries.map((entry) => {
          const band = ratingBand(entry.rating);
          return (
            <div className="lb-leader-item" key={entry.id}>
              <span className="lb-leader-rank">{entry.rank}</span>
              <div className="lb-leader-main">
                <div className="lb-leader-name">
                  <TitleBadge title={entry.title} />
                  <span>{entry.name}</span>
                </div>
                {entry.country && (
                  <div className="lb-leader-country" title={countryName(entry.country)}>
                    {countryFlag(entry.country) || entry.country.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="lb-leader-rating">
                <span>{entry.rating}</span>
                <small>{band.label}</small>
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
            {t('lobby.leaderboard')}
          </h1>
          <p className="lb-subtitle">
            {activeTab.label} · {filtered.length} {t('leaderboard.player')}
          </p>
        </div>

        {/* Search */}
        <div className="lb-search-wrap">
          <input
            className="lb-search"
            placeholder={t('lobby.searchPlayers')}
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
            onClick={() => { setTc(tab.key); setPage(0); }}
            disabled={loading}
          >
            {loading && tc === tab.key && (
              <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', verticalAlign: 'middle' }} />
            )}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Top players (only on page 0 with no search) ── */}
      {page === 0 && !search && <TopPlayers entries={top3} />}

      {/* ── My position banner ── */}
      {myEntry && !search && (
        <div className="lb-my-rank-banner">
          <span className="lb-my-rank-label">{t('leaderboard.rank')}</span>
          <span className="lb-my-rank-val">#{myEntry.rank}</span>
          <span className="lb-my-name">{myEntry.name}</span>
          <span className="lb-my-rating">{myEntry.rating}</span>
          <span className="lb-my-band">
            {ratingBand(myEntry.rating).label}
          </span>
        </div>
      )}

      {/* ── Summary / Error ── */}
      {error ? (
        <div className="lb-error-banner">
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
            <div className="lb-sc-val">
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
            <span>{t('leaderboard.noPlayers')}</span>
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
              onClick={() => isMe && navigate(`/${universe}/profile/${encodeURIComponent(entry.name)}`)}
              style={isMe ? { cursor: 'pointer' } : undefined}
            >
              {/* Rank */}
              <div className="lb-col-rank lb-rank-cell">
                {rankDisplay(entry.rank)}
              </div>

              {/* Player */}
              <div className="lb-col-player lb-player-cell">
                <div className="lb-avatar">
                  {entry.name[0].toUpperCase()}
                  {entry.online && <span className="lb-online-dot" />}
                </div>
                <div className="lb-player-info">
                  <div className="lb-player-name">
                    <TitleBadge title={entry.title} />
                    {entry.name}
                    {isMe && <span className="lb-you-chip">you</span>}
                  </div>
                  {entry.country && (
                    <div className="lb-player-country" title={countryName(entry.country)}>
                      {countryFlag(entry.country) || entry.country.toUpperCase()}
                    </div>
                  )}
                </div>
              </div>

              {/* Rating */}
              <div className="lb-col-center">
                <span className="lb-rating">{entry.rating}</span>
                <div className="lb-rating-band">{band.label}</div>
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
                <span className="lb-winpct">{winPct}%</span>
              </div>

              {/* Trend */}
              <div className="lb-col-center lb-hide-sm">
                <MiniSpark data={entry.ratingHistory} />
              </div>

              {/* Streak */}
              <div className="lb-col-center">
                {entry.streak > 0 ? (
                  <span className="lb-streak">{entry.streak}</span>
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
