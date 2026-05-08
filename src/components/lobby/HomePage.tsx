import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useUniverseStore, useLiveGamesStore, useNotificationStore, useUserStore, LiveGame } from '../../stores';
import { LiveGamesSection } from './LiveGamePreview';
import { LobbyTab } from './LobbyTab';
import { CorrespondenceTab } from './CorrespondenceTab';
import { CustomGameModal } from './CustomGameModal';
import { api, ApiLeaderboardEntry } from '../../lib/api';
import { PlayerHoverCard } from '../common/PlayerHoverCard';
import { countryFlag, countryName } from '../../lib/countries';

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


// ── Category tone map ─────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  Bullet:    'var(--text-3)',
  Blitz:     'var(--text-3)',
  Rapid:     'var(--text-3)',
  Classical: 'var(--text-3)',
};

const QUICK_ACTIONS = [
  { key: 'rapid', label: 'Rapid pairing', detail: 'Find a player', tc: '10+0' },
  { key: 'challenge', label: 'Challenges', detail: 'Invite a friend', path: 'lobby' },
  { key: 'tournaments', label: 'Tournaments', detail: 'Events and prizes', route: 'tournaments' },
  { key: 'leaderboard', label: 'Leaderboard', detail: 'Top players', route: 'leaderboard' },
  { key: 'community', label: 'Community', detail: 'Players online', path: 'lobby' },
  { key: 'rewards', label: 'Rewards', detail: 'Wallet and stakes', wallet: true },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onCreateGame: (tc: string, mode: 'online' | 'computer', color?: 'white' | 'black' | 'random') => void;
  onOpenWallet: () => void;
}

export const HomePage: React.FC<Props> = ({ onCreateGame, onOpenWallet }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const universe = useUniverseStore(s => s.universe);
  const games = useLiveGamesStore(s => s.games);
  const syncServerGames = useLiveGamesStore(s => s.syncServerGames);
  const addNotification = useNotificationStore(s => s.addNotification);
  const user = useUserStore(s => s.user);
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

  // Fetch real live rooms from API and keep the home feed server-authoritative.
  useEffect(() => {
    let cancelled = false;
    const refreshLiveGames = (showError: boolean) =>
      api.rooms.live({ universe, limit: 10 })
        .then(rooms => {
          if (cancelled) return;
          syncServerGames(rooms.map(r => ({
            id: r.id,
            universe: r.universe,
            white: r.white,
            black: r.black,
            tc: r.tc,
            bet: r.bet,
            fen: r.fen,
            draughtsBoard: r.draughtsBoard,
            moveCount: r.moveCount,
            startedAt: r.startedAt,
            status: 'playing',
            source: 'server',
          } as LiveGame)));
        })
        .catch(() => {
          if (showError) addNotification(t('errors.liveGamesLoad', 'Could not load live games'), 'error');
        });

    setLiveGamesLoading(true);
    refreshLiveGames(true).finally(() => {
      if (!cancelled) setLiveGamesLoading(false);
    });

    // Poll often enough that ended games disappear and the next strongest game rotates in.
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      refreshLiveGames(false);
    }, 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [addNotification, syncServerGames, t, universe]);

  const timeControls = universe === 'chess' ? CHESS_TC : CHECKERS_TC;
  const liveCount    = games.filter(g => g.universe === universe && g.status === 'playing').length;

  // Group time controls by category for display
  const grouped: Record<string, TcOption[]> = {};
  for (const tc of timeControls) {
    if (!grouped[tc.category]) grouped[tc.category] = [];
    grouped[tc.category].push(tc);
  }

  return (
    <div className="home-premium">
      {user && (
        <section className="home-mobile-wallet" aria-label="Wallet balance">
          <div>
            <span>{t('betting.balance')}</span>
            <strong>${Number(user.walletBalance).toFixed(2)}</strong>
          </div>
          <button type="button" onClick={onOpenWallet}>{t('betting.deposit')}</button>
        </section>
      )}

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
          <section className="home-hero-panel">
            <div className="home-hero-copy">
              <span className="home-hero-kicker">{t('premiumHome.hero.eyebrow')}</span>
              <h1>{t('premiumHome.hero.titleLine1')} {t('premiumHome.hero.titleLine2')}</h1>
              <p>{t('premiumHome.hero.description')}</p>
              <div className="home-hero-actions">
                <button className="home-primary-action" onClick={() => navigate(`/${universe}/tournaments`)}>
                  {t('lobby.tournaments')}
                </button>
                <button className="home-secondary-action" onClick={() => setShowCustom(true)}>
                  {t('lobby.custom')}
                </button>
              </div>
            </div>
            <div className="home-hero-art" aria-hidden="true">
              <div className="home-coin-stack">
                <span />
                <span />
                <span />
              </div>
              <div className="home-trophy">
                <div className="home-trophy-cup" />
                <div className="home-trophy-stem" />
                <div className="home-trophy-base" />
              </div>
              <img className="home-piece home-piece-king" src="/pieces/bk.svg" alt="" />
              <img className="home-piece home-piece-knight" src="/pieces/wn.svg" alt="" />
            </div>
          </section>

          <section className="home-features-grid" aria-label="Features">
            <div className="home-feature-card champions" onClick={() => navigate(`/${universe}/tournaments`)}>
              <div className="feature-glow" />
              <div className="feature-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                  <path d="M4 22h16"/>
                  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                </svg>
              </div>
              <h3>{t('premiumHome.hero.titleLine1')} {t('premiumHome.hero.titleLine2')}</h3>
              <p>{t('premiumHome.hero.description')}</p>
            </div>
            <div className="home-feature-card worldwide" onClick={() => setActiveTab('lobby')}>
              <div className="feature-glow" />
              <div className="feature-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12h20"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <h3>{t('premiumHome.gameCards.checkersTitle')}</h3>
              <p>{t('premiumHome.gameCards.checkersSub')}</p>
            </div>
            <div className="home-feature-card strategy" onClick={() => onCreateGame('10+0', 'online')}>
              <div className="feature-glow" />
              <div className="feature-icon-wrap">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              <h3>{t('premiumHome.gameCards.chessTitle')}</h3>
              <p>{t('premiumHome.gameCards.chessSub')}</p>
            </div>
          </section>

          <div className="home-dashboard-grid">
            <div className="home-dashboard-main">
              <div className="home-game-cards">
                <button className="home-game-card checkers" onClick={() => onCreateGame('5+0', 'online')}>
                  <span className="home-game-token checkers-token">
                    <i />
                    <i />
                  </span>
                  <span>
                    <strong>{t('profile.checkers')}</strong>
                    <small>Fast tactics and clean endgames.</small>
                  </span>
                  <em>{t('lobby.playNow', 'Play now')}</em>
                </button>
                <button className="home-game-card chess" onClick={() => onCreateGame('5+0', 'online')}>
                  <span className="home-game-token">
                    <img src="/pieces/wn.svg" alt="" />
                  </span>
                  <span>
                    <strong>{t('profile.chess')}</strong>
                    <small>Strategy, calculation, victory.</small>
                  </span>
                  <em>{t('lobby.playNow', 'Play now')}</em>
                </button>
              </div>

              <div className="home-action-strip">
                {QUICK_ACTIONS.map(item => (
                  <button
                    key={item.key}
                    className="home-action-tile"
                    onClick={() => {
                      if ('tc' in item) {
                        setActiveTab('lobby');
                        onCreateGame(item.tc, 'online');
                      } else if ('route' in item) {
                        navigate(`/${universe}/${item.route}`);
                      } else if ('wallet' in item) {
                        onOpenWallet();
                      } else {
                        setActiveTab(item.path);
                      }
                    }}
                  >
                    <span className={`home-action-icon ${item.key}`} />
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </button>
                ))}
              </div>

              <section className="home-panel">
                <div className="home-panel-head">
                  <div>
                    <span className="section-title">{t('lobby.quickPairing')}</span>
                    <p>Choose a clock. If no one pairs instantly, your seek is listed for others to join.</p>
                  </div>
                  <button className="more-link home-link-button" onClick={() => setActiveTab('lobby')}>
                    {t('lobby.lobby')}
                  </button>
                </div>
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
                          onClick={() => {
                            setActiveTab('lobby');
                            onCreateGame(value, 'online');
                          }}
                          style={{ borderTop: `2px solid ${CAT_COLOR[cat]}` }}
                        >
                          <div className="time-value">{label}</div>
                          <div className="time-category" style={{ color: CAT_COLOR[cat] }}>{t(`time.${cat.toLowerCase()}`)}</div>
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </section>

              <section className="home-panel">
                <div className="games-list-header" style={{ marginBottom: 14 }}>
                  <span className="section-title">
                    {t('lobby.liveGames')}
                    {!liveGamesLoading && liveCount > 0 && (
                      <span className="home-count-pill">
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
              </section>
            </div>

            <aside className="home-dashboard-aside">
              <section className="home-panel home-leaderboard-panel">
                <div className="games-list-header" style={{ marginBottom: 10 }}>
                  <span className="section-title">{t('lobby.leaderboard')}</span>
                  <button className="more-link home-link-button" onClick={() => navigate(`/${universe}/leaderboard`)}>
                    {t('leaderboard.viewAll')}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {leaderboardLoading ? (
                    Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="skeleton-row" style={{ padding: '6px 0' }}>
                        <div className="skeleton skeleton-line" style={{ width: 20 }} />
                        <div className="skeleton skeleton-line" style={{ width: `${55 + (i % 3) * 15}px` }} />
                        <div className="skeleton skeleton-line" style={{ width: 36, marginLeft: 'auto' }} />
                      </div>
                    ))
                  ) : leaderboard.length === 0 ? (
                    <div style={{ color: 'var(--text-3)', fontSize: 12, padding: '8px 0' }}>{t('leaderboard.noPlayers')}</div>
                  ) : leaderboard.map(entry => (
                    <div key={entry.rank} className="lb-item">
                      <span className={`lb-rank ${entry.rank <= 3 ? 'top-3' : ''}`}>{entry.rank}</span>
                      {entry.country && (
                        <span className="lb-flag" title={countryName(entry.country)}>
                          {countryFlag(entry.country)}
                        </span>
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
                          onClick={() => navigate(`/${universe}/profile/${encodeURIComponent(entry.name)}`)}
                        >
                          {entry.name}
                        </span>
                      </PlayerHoverCard>
                      <span className="lb-rating">{entry.rating}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="home-quote-card">
                <span>"</span>
                <p>Every move counts. Every decision shapes the champion you become.</p>
                <small>Damcash</small>
              </section>
            </aside>
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
        onConfirm={(tc, mode, color) => {
          onCreateGame(tc, mode, color);
          setShowCustom(false);
        }}
      />
    </div>
  );
};
