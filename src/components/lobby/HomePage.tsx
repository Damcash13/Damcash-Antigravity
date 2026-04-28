import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useUniverseStore, useLiveGamesStore, useNotificationStore, LiveGame } from '../../stores';
import { LiveGamesSection } from './LiveGamePreview';
import { LobbyTab } from './LobbyTab';
import { CorrespondenceTab } from './CorrespondenceTab';
import { CustomGameModal } from './CustomGameModal';
import { api, ApiLeaderboardEntry } from '../../lib/api';
import { PlayerHoverCard, countryFlag } from '../common/PlayerHoverCard';

// ── Time controls ─────────────────────────────────────────────────────────────

interface TcOption { value: string; label: string; category: string; }

// 3 cards per category = one perfect row per category in the 3-col grid
const CHESS_TC: TcOption[] = [
  { value: '1+0',   label: '1+0',   category: 'Bullet'    },
  { value: '2+1',   label: '2+1',   category: 'Bullet'    },
  { value: '2+0',   label: '2+0',   category: 'Bullet'    },
  { value: '3+0',   label: '3+0',   category: 'Blitz'     },
  { value: '5+0',   label: '5+0',   category: 'Blitz'     },
  { value: '5+3',   label: '5+3',   category: 'Blitz'     },
  { value: '10+0',  label: '10+0',  category: 'Rapid'     },
  { value: '10+5',  label: '10+5',  category: 'Rapid'     },
  { value: '15+10', label: '15+10', category: 'Rapid'     },
  { value: '30+0',  label: '30+0',  category: 'Classical' },
  { value: '30+20', label: '30+20', category: 'Classical' },
  { value: '45+0',  label: '45+0',  category: 'Classical' },
];

const CHECKERS_TC: TcOption[] = [
  { value: '1+0',   label: '1+0',   category: 'Bullet'    },
  { value: '2+1',   label: '2+1',   category: 'Bullet'    },
  { value: '2+0',   label: '2+0',   category: 'Bullet'    },
  { value: '3+0',   label: '3+0',   category: 'Blitz'     },
  { value: '5+0',   label: '5+0',   category: 'Blitz'     },
  { value: '5+3',   label: '5+3',   category: 'Blitz'     },
  { value: '10+0',  label: '10+0',  category: 'Rapid'     },
  { value: '15+0',  label: '15+0',  category: 'Rapid'     },
  { value: '15+15', label: '15+15', category: 'Rapid'     },
  { value: '20+0',  label: '20+0',  category: 'Classical' },
  { value: '30+0',  label: '30+0',  category: 'Classical' },
  { value: '45+0',  label: '45+0',  category: 'Classical' },
];


// ── Category colour map ───────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  Bullet:    '#ef4444',
  Blitz:     '#f59e0b',
  Rapid:     'var(--accent)',
  Classical: '#3b82f6',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onCreateGame: (tc: string, mode: 'online' | 'computer') => void;
}

export const HomePage: React.FC<Props> = ({ onCreateGame }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { universe } = useUniverseStore();
  const { games, registerGame } = useLiveGamesStore();
  const { addNotification } = useNotificationStore();
  const [activeTab, setActiveTab] = useState<'quick' | 'lobby' | 'correspondence'>('quick');
  const [showCustom, setShowCustom] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{
    rank: number; name: string; country: string;
    rating: number; games: number; wins: number; losses: number; draws: number;
  }[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [liveGamesLoading, setLiveGamesLoading] = useState(true);

  // Fetch real leaderboard from API
  useEffect(() => {
    setLeaderboardLoading(true);
    api.leaderboard.list({ universe, limit: 7 })
      .then((entries: ApiLeaderboardEntry[]) => {
        setLeaderboard(entries.map(e => ({
          rank:    e.rank,
          name:    e.username,
          country: e.country || '',
          rating:  universe === 'chess' ? e.chessRating   : e.checkersRating,
          games:   universe === 'chess' ? e.chessGames    : e.checkersGames,
          wins:    universe === 'chess' ? e.chessWins     : e.checkersWins,
          losses:  universe === 'chess' ? e.chessLosses   : e.checkersLosses,
          draws:   universe === 'chess' ? e.chessDraws    : e.checkersDraws,
        })));
      })
      .catch(() => { setLeaderboard([]); addNotification(t('errors.leaderboardLoad', 'Could not load leaderboard'), 'error'); })
      .finally(() => setLeaderboardLoading(false));
  }, [universe]);

  // Fetch real live rooms from API and push into store
  useEffect(() => {
    api.rooms.live()
      .then(rooms => {
        rooms.forEach(r => {
          registerGame({
            id: r.id,
            universe: r.universe as 'chess' | 'checkers',
            white: r.white,
            black: r.black,
            tc: r.tc,
            bet: r.bet,
            fen: r.fen,
            moveCount: r.moveCount,
            startedAt: Date.now(),
            status: 'playing',
          } as LiveGame);
        });
      })
      .catch(() => { addNotification(t('errors.liveGamesLoad', 'Could not load live games'), 'error'); })
      .finally(() => setLiveGamesLoading(false));
    // Poll every 10s, but only when the tab is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      api.rooms.live()
        .then(rooms => {
          rooms.forEach(r => {
            registerGame({
              id: r.id,
              universe: r.universe as 'chess' | 'checkers',
              white: r.white,
              black: r.black,
              tc: r.tc,
              bet: r.bet,
              fen: r.fen,
              moveCount: r.moveCount,
              startedAt: Date.now(),
              status: 'playing',
            } as LiveGame);
          });
        })
        .catch(() => { /* Silent on poll — avoid spamming notifications */ });
    }, 10_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const timeControls = universe === 'chess' ? CHESS_TC : CHECKERS_TC;
  const liveCount    = games.filter(g => g.universe === universe && g.status === 'playing').length;

  // Group time controls by category for display
  const grouped: Record<string, TcOption[]> = {};
  for (const tc of timeControls) {
    if (!grouped[tc.category]) grouped[tc.category] = [];
    grouped[tc.category].push(tc);
  }

  return (
    <div>
      {/* ── Tabs ── */}
      <div className="tabs" role="tablist">
        {(['quick', 'lobby', 'correspondence'] as const).map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'quick'
              ? t('lobby.quickPairing')
              : tab === 'lobby'
              ? t('lobby.lobby')
              : t('lobby.correspondence')}
          </button>
        ))}
      </div>

      {/* ── Quick Pairing ── */}
      {activeTab === 'quick' && (
        <div className="tab-content-enter" key="quick">
          {/* Unified grid — 3 cards per category = 1 perfect row each */}
          <div className="pairing-grid">
            {Object.entries(grouped).map(([cat, tcs]) => (
              <React.Fragment key={cat}>
                <div className="pairing-cat-label" style={{ color: CAT_COLOR[cat] }}>
                  <span className="pairing-cat-dot" style={{ background: CAT_COLOR[cat] }} />
                  {t(`time.${cat.toLowerCase()}`)}
                </div>
                {tcs.map(({ value, label }) => (
                  <div
                    key={value}
                    className="time-card"
                    onClick={() => onCreateGame(value, 'online')}
                    style={{ borderTop: `2px solid ${CAT_COLOR[cat]}` }}
                  >
                    <div className="time-value">{label}</div>
                    <div className="time-category" style={{ color: CAT_COLOR[cat] }}>{t(`time.${cat.toLowerCase()}`)}</div>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>

          {/* Custom game — standalone row below the grid */}
          <button
            className="pairing-custom-btn"
            onClick={() => setShowCustom(true)}
          >
            <span style={{ fontSize: 15 }}>⚙</span>
            {t('lobby.custom')}
          </button>

          {/* ── Live Games ── */}
          <div style={{ marginTop: 28 }}>
            <div className="games-list-header" style={{ marginBottom: 14 }}>
              <span className="section-title">
                🔴 {t('lobby.liveGames')}
                {!liveGamesLoading && liveCount > 0 && (
                  <span style={{
                    marginLeft: 8, background: 'rgba(239,68,68,0.18)',
                    color: '#ef4444', fontSize: 11, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 20,
                  }}>
                    {liveCount} {t('social.playing')}
                  </span>
                )}
              </span>
              <span className="more-link">{t('lobby.moreGames')}</span>
            </div>
            {liveGamesLoading ? (
              <div style={{ display: 'flex', gap: 10 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ flex: 1, height: 90, borderRadius: 10 }} className="skeleton" />
                ))}
              </div>
            ) : (
              <LiveGamesSection
                games={games}
                universe={universe}
                onClickGame={(id: string, univ: string) => navigate(`/${univ}/watch/${id}`)}
              />
            )}
          </div>

          {/* ── Leaderboard ── */}
          <div style={{ marginTop: 28 }}>
            <div className="games-list-header" style={{ marginBottom: 10 }}>
              <span className="section-title">🏆 {t('lobby.leaderboard')}</span>
              <span className="more-link">{t('lobby.morePlayers')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {leaderboardLoading ? (
                Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="skeleton-row" style={{ padding: '6px 0' }}>
                    <div className="skeleton skeleton-line" style={{ width: 20 }} />
                    <div className="skeleton skeleton-circle" style={{ width: 22, height: 22 }} />
                    <div className="skeleton skeleton-line" style={{ width: `${55 + (i % 3) * 15}px` }} />
                    <div className="skeleton skeleton-line-sm" style={{ width: 28, marginLeft: 'auto' }} />
                    <div className="skeleton skeleton-line" style={{ width: 36 }} />
                  </div>
                ))
              ) : leaderboard.length === 0 ? (
                <div style={{ color: 'var(--text-3)', fontSize: 12, padding: '8px 0' }}>{t('leaderboard.noPlayers')}</div>
              ) : leaderboard.map(entry => (
                <div key={entry.rank} className="lb-item">
                  <span className={`lb-rank ${entry.rank <= 3 ? 'top-3' : ''}`}>{entry.rank}</span>
                  {entry.country && (
                    <span className="lb-flag" title={entry.country}>{countryFlag(entry.country)}</span>
                  )}
                  <PlayerHoverCard
                    username={entry.name}
                    rating={entry.rating}
                    wins={entry.wins}
                    losses={entry.losses}
                    draws={entry.draws}
                    games={entry.games}
                    country={entry.country}
                  >
                    <span
                      className="lb-name lb-name-link"
                      onClick={() => navigate(`/profile/${entry.name}`)}
                    >
                      {entry.name}
                    </span>
                  </PlayerHoverCard>
                  <span className="lb-games text-muted">🕹{entry.games}</span>
                  <span className="lb-rating">{entry.rating}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Lobby (seeks) ── */}
      {activeTab === 'lobby' && (
        <div className="tab-content-enter" key="lobby">
          <LobbyTab
            onMatchFound={(roomId, myColor) => navigate(`/${universe}/game/${roomId}?color=${myColor}`)}
          />
        </div>
      )}

      {/* ── Correspondence ── */}
      {activeTab === 'correspondence' && (
        <div className="tab-content-enter" key="correspondence">
          <CorrespondenceTab />
        </div>
      )}

      {/* Custom game modal */}
      <CustomGameModal
        open={showCustom}
        onClose={() => setShowCustom(false)}
        onConfirm={(tc, mode, _color) => {
          onCreateGame(tc, mode);
          setShowCustom(false);
        }}
      />
    </div>
  );
};
