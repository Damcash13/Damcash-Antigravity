import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  useUniverseStore, useLiveGamesStore, useUserStore, LiveGame,
} from '../../stores';
import { LobbyTab } from './LobbyTab';
import { CorrespondenceTab } from './CorrespondenceTab';
import { CustomGameModal } from './CustomGameModal';
import { api, ApiLeaderboardEntry } from '../../lib/api';
import { PlayerHoverCard } from '../common/PlayerHoverCard';
import { NotificationCenter } from '../common/NotificationCenter';
import { PlayerSearchBar } from '../invite/PlayerSearchBar';
import { countryFlag, countryName } from '../../lib/countries';
import { OnlinePlayer } from '../../stores/inviteStore';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onCreateGame: (tc: string, mode: 'online' | 'computer', color?: 'white' | 'black' | 'random') => void;
  onOpenWallet: () => void;
  onChallengeFriend: () => void;
  onPlayComputer: () => void;
  onInvitePlayer: (player: OnlinePlayer) => void;
  onOpenAuth: () => void;
  onOpenMessages: () => void;
}

// ── Static content ────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { key: 'quick',       labelKey: 'premiumHome.shortcuts.quick',       detailKey: 'premiumHome.shortcuts.quickDetail',       icon: '⚡', action: 'quick'       },
  { key: 'challenges',  labelKey: 'premiumHome.shortcuts.challenges',  detailKey: 'premiumHome.shortcuts.challengesDetail',  icon: '⚔️', action: 'challenge'   },
  { key: 'tournaments', labelKey: 'premiumHome.shortcuts.tournaments', detailKey: 'premiumHome.shortcuts.tournamentsDetail', icon: '🏆', action: 'tournaments' },
  { key: 'leaderboard', labelKey: 'premiumHome.shortcuts.leaderboard', detailKey: 'premiumHome.shortcuts.leaderboardDetail', icon: '📊', action: 'leaderboard' },
] as const;

type ActivityType = 'win' | 'loss' | 'challenge';

interface MockActivity { id: number; type: ActivityType; titleKey: string; detail: string; tagKey: string; timeKey: string; }

const MOCK_ACTIVITY: MockActivity[] = [
  {
    id: 1, type: 'win',
    titleKey: 'premiumHome.activity.winCheckers',
    detail: '3 - 1', tagKey: 'premiumHome.activity.victory', timeKey: 'premiumHome.activity.fiveMin',
  },
  {
    id: 2, type: 'win',
    titleKey: 'premiumHome.activity.winChess',
    detail: '1 - 0', tagKey: 'premiumHome.activity.victory', timeKey: 'premiumHome.activity.twelveMin',
  },
  {
    id: 3, type: 'challenge',
    titleKey: 'premiumHome.activity.challengeAccepted',
    detail: '', tagKey: 'premiumHome.activity.viewChallenge', timeKey: 'premiumHome.activity.twentyThreeMin',
  },
];

const MOCK_TOURNAMENTS = [
  { id: 1, nameKey: 'premiumHome.mockTournaments.kingCup',      typeKey: 'premiumHome.mockTournaments.chess32',    dateKey: 'premiumHome.mockTournaments.dateMay24', time: '20:00' },
  { id: 2, nameKey: 'premiumHome.mockTournaments.checkersMasters', typeKey: 'premiumHome.mockTournaments.checkers64', dateKey: 'premiumHome.mockTournaments.dateMay25', time: '18:00' },
  { id: 3, nameKey: 'premiumHome.mockTournaments.weeklyGrandPrix', typeKey: 'premiumHome.mockTournaments.chess16',    dateKey: 'premiumHome.mockTournaments.dateMay27', time: '21:00' },
];

const MOCK_LEADERBOARD = [
  { rank: 1, name: 'Jean Dupont',     score: 2950 },
  { rank: 2, name: 'Sophie Bernard',  score: 2450 },
  { rank: 3, name: 'Lucas Moreau',    score: 2200 },
  { rank: 4, name: 'Emma Leroy',      score: 1980 },
  { rank: 5, name: 'Hugo Petit',      score: 1750 },
];

// ── Leaderboard entry ─────────────────────────────────────────────────────────

interface LbEntry {
  rank: number; name: string; country: string;
  rating: number; games: number; wins: number; losses: number; draws: number;
}

// ── Sidebar nav ───────────────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { key: 'home',        labelKey: 'premiumHome.nav.home',        icon: '🏠' },
  { key: 'checkers',    labelKey: 'premiumHome.nav.checkersGame', icon: '⚫' },
  { key: 'chess',       labelKey: 'premiumHome.nav.chessGame',    icon: '♟' },
  null,
  { key: 'challenges',  labelKey: 'premiumHome.nav.challenges',   icon: '⚔️' },
  { key: 'tournaments', labelKey: 'premiumHome.nav.tournaments',  icon: '🏆' },
  { key: 'leaderboard', labelKey: 'premiumHome.nav.leaderboard',  icon: '📊' },
  null,
  { key: 'messages',    labelKey: 'premiumHome.nav.messages',     icon: '💬' },
  { key: 'friends',     labelKey: 'premiumHome.nav.friends',      icon: '👥' },
  { key: 'shop',        labelKey: 'premiumHome.nav.shop',         icon: '🛒' },
  null,
  { key: 'help',        labelKey: 'premiumHome.nav.help',         icon: '❓' },
  { key: 'settings',    labelKey: 'premiumHome.nav.settings',     icon: '⚙️' },
] as const;

// ── Header nav ────────────────────────────────────────────────────────────────

const HEADER_NAV = [
  { labelKey: 'premiumHome.nav.home',        key: 'home' },
  { labelKey: 'premiumHome.nav.games',       key: 'games' },
  { labelKey: 'premiumHome.nav.tournaments', key: 'tournaments' },
  { labelKey: 'premiumHome.nav.leaderboard', key: 'leaderboard' },
  { labelKey: 'premiumHome.nav.community',   key: 'community' },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export const PremiumHomePage: React.FC<Props> = ({
  onCreateGame, onOpenWallet, onChallengeFriend, onPlayComputer,
  onInvitePlayer, onOpenAuth, onOpenMessages,
}) => {
  const { t } = useTranslation();
  const navigate    = useNavigate();
  const location    = useLocation();
  const universe    = useUniverseStore(s => s.universe);
  const setUniverse = useUniverseStore(s => s.setUniverse);
  const games           = useLiveGamesStore(s => s.games);
  const syncServerGames = useLiveGamesStore(s => s.syncServerGames);
  const user    = useUserStore(s => s.user);
  const isLoggedIn = useUserStore(s => s.isLoggedIn);

  const [activeTab, setActiveTab] = useState<'quick' | 'lobby' | 'correspondence'>('quick');
  const [showCustom, setShowCustom] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LbEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [liveGamesLoading, setLiveGamesLoading]     = useState(true);

  // Fetch real leaderboard
  useEffect(() => {
    setLeaderboardLoading(true);
    api.leaderboard.list({ universe, limit: 7 })
      .then((entries: ApiLeaderboardEntry[]) => {
        setLeaderboard(entries.map(e => ({
          rank:    e.rank,
          name:    e.username,
          country: e.country || '',
          rating:  universe === 'chess' ? e.chessRating    : e.checkersRating,
          games:   universe === 'chess' ? e.chessGames     : e.checkersGames,
          wins:    universe === 'chess' ? e.chessWins      : e.checkersWins,
          losses:  universe === 'chess' ? e.chessLosses    : e.checkersLosses,
          draws:   universe === 'chess' ? e.chessDraws     : e.checkersDraws,
        })));
      })
      .catch(() => setLeaderboard([]))
      .finally(() => setLeaderboardLoading(false));
  }, [universe]);

  // Fetch live rooms
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      api.rooms.live({ universe, limit: 10 })
        .then(rooms => {
          if (cancelled) return;
          syncServerGames(rooms.map(r => ({
            id: r.id, universe: r.universe,
            white: r.white, black: r.black,
            tc: r.tc, bet: r.bet, fen: r.fen,
            draughtsBoard: r.draughtsBoard,
            moveCount: r.moveCount, startedAt: r.startedAt,
            status: 'playing', source: 'server',
          } as LiveGame)));
        })
        .catch(() => undefined);

    setLiveGamesLoading(true);
    refresh().finally(() => { if (!cancelled) setLiveGamesLoading(false); });

    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      refresh();
    }, 5_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [syncServerGames, universe]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  // Displayed leaderboard: real API data or mock fallback
  const displayLeaderboard: Array<{ rank: number; name: string; score: number; country?: string; wins?: number; losses?: number; draws?: number; games?: number }> =
    leaderboard.length > 0
      ? leaderboard.map(e => ({ rank: e.rank, name: e.name, score: e.rating, country: e.country, wins: e.wins, losses: e.losses, draws: e.draws, games: e.games }))
      : MOCK_LEADERBOARD;
  const liveActiveGames = games.filter(g => g.universe === universe && g.status === 'playing').slice(0, 2);
  const quickPairingGroups = [
    { cat: 'Bullet', icon: '▭', values: ['1+0', '2+1', '2+0'] },
    { cat: 'Blitz', icon: '⚡', values: ['3+0', '5+0', '5+3'] },
    { cat: t('premiumHome.quickModes.rapid'), icon: '◷', values: ['10+0', '10+5', '15+10'] },
    { cat: t('premiumHome.quickModes.classical'), icon: '♜', values: ['30+0', '30+20', '45+0'] },
  ];

  const isHome = /^\/(chess|checkers)\/?$/.test(location.pathname);

  const handleSidebarNav = (key: string) => {
    setMobileMenuOpen(false);
    if (key === 'home')        navigate(`/${universe}`);
    else if (key === 'checkers')    { setUniverse('checkers'); navigate('/checkers'); }
    else if (key === 'chess')       { setUniverse('chess');    navigate('/chess'); }
    else if (key === 'challenges')  onChallengeFriend();
    else if (key === 'tournaments') navigate(`/${universe}/tournaments`);
    else if (key === 'leaderboard') navigate(`/${universe}/leaderboard`);
    else if (key === 'messages')    isLoggedIn ? onOpenMessages() : onOpenAuth();
    else if (key === 'friends')     setActiveTab('lobby');
    else if (key === 'settings')    user ? navigate(`/${universe}/profile/${encodeURIComponent(user.name)}`) : onOpenAuth();
    else navigate(`/${universe}/coming-soon/${key}`);
  };

  const handleHeaderNav = (key: string) => {
    if (key === 'home')        navigate(`/${universe}`);
    else if (key === 'games')       onCreateGame('5+0', 'online');
    else if (key === 'tournaments') navigate(`/${universe}/tournaments`);
    else if (key === 'leaderboard') navigate(`/${universe}/leaderboard`);
    else if (key === 'community')   setActiveTab('lobby');
  };

  const handleShortcut = (action: string) => {
    if (action === 'quick')       { setActiveTab('lobby'); onCreateGame('10+0', 'online'); }
    else if (action === 'challenge')   onChallengeFriend();
    else if (action === 'tournaments') navigate(`/${universe}/tournaments`);
    else if (action === 'leaderboard') navigate(`/${universe}/leaderboard`);
    else if (action === 'lobby')       setActiveTab('lobby');
    else if (action === 'wallet')      onOpenWallet();
  };

  // Avatar initial
  const avatarInitial = user?.name ? user.name.charAt(0).toUpperCase() : '?';
  const userFlag = user?.country ? countryFlag(user.country) : '';
  const userCountryName = user?.country ? countryName(user.country) : '';
  const viewLiveGames = () => {
    const firstLiveGame = liveActiveGames[0];
    if (firstLiveGame) navigate(`/${firstLiveGame.universe}/watch/${firstLiveGame.id}`);
    else setActiveTab('lobby');
  };

  return (
    <div className="ph-layout">

      {/* ══════════════════════════════════════
          PREMIUM HEADER
      ══════════════════════════════════════ */}
      <header className="ph-header">
        <div className="ph-header-inner">

          {/* Logo */}
          <button className="ph-header-logo" onClick={() => navigate(`/${universe}`)}>
            <span className="ph-logo-monogram" aria-hidden="true">
              <span className="ph-logo-crown">♛</span>
              <span className="ph-logo-d">D</span>
              <span className="ph-logo-c">C</span>
            </span>
            <span className="ph-logo-separator" aria-hidden="true" />
            <span className="ph-logo-lockup">
              <span className="ph-logo-word"><span>Dam</span><span>Cash</span></span>
              <span className="ph-logo-tagline">{t('premiumHome.brandTagline')}</span>
            </span>
          </button>

          {/* Nav */}
          <nav className="ph-header-nav" role="navigation" aria-label="Navigation principale">
            {HEADER_NAV.map(item => (
              <button
                key={item.key}
                className={`ph-hnav-item${item.key === 'home' && isHome ? ' active' : ''}`}
                onClick={() => handleHeaderNav(item.key)}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="ph-header-right">
            {isLoggedIn && user ? (
              <>
                <div className="ph-header-notification">
                  <NotificationCenter />
                </div>
                <button
                  className="ph-header-profile-btn"
                  onClick={() => navigate(`/${universe}/profile/${encodeURIComponent(user.name)}`)}
                  title={`Profil de ${user.name}`}
                >
                  <div className="ph-avatar">
                    {user.avatarUrl
                      ? <img src={user.avatarUrl} alt={user.name} />
                      : avatarInitial}
                  </div>
                  <div className="ph-header-user-info">
                    <span className="ph-header-username">
                      {userFlag && (
                        <span className="ph-header-flag" title={userCountryName}>
                          {userFlag}
                        </span>
                      )}
                      <span className="ph-header-username-text">{user.name}</span>
                    </span>
                    <span className="ph-header-score">Elo {user.rating[universe]}</span>
                  </div>
                </button>
              </>
            ) : (
              <div className="ph-header-auth">
                <button className="ph-btn-auth secondary" onClick={onOpenAuth}>
                  {t('nav.signIn')}
                </button>
                <button className="ph-btn-auth primary" onClick={onOpenAuth}>
                  {t('nav.register')}
                </button>
              </div>
            )}

            <button
              className={`ph-mobile-menu-btn${mobileMenuOpen ? ' active' : ''}`}
              onClick={() => setMobileMenuOpen(open => !open)}
              aria-label={t('premiumHome.menu.open')}
              aria-expanded={mobileMenuOpen}
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          {mobileMenuOpen && (
            <>
              <button
                className="ph-mobile-menu-backdrop"
                aria-label={t('premiumHome.menu.close')}
                onClick={() => setMobileMenuOpen(false)}
              />
              <div className="ph-mobile-menu-panel">
                <div className="ph-mobile-menu-title">{t('premiumHome.menu.title')}</div>
                {SIDEBAR_NAV.map((item, i) =>
                  item === null ? (
                    <div key={`mobile-hr-${i}`} className="ph-mobile-menu-hr" />
                  ) : (
                    <button
                      key={item.key}
                      className={`ph-mobile-menu-item${item.key === 'home' && isHome ? ' active' : ''}`}
                      onClick={() => handleSidebarNav(item.key)}
                    >
                      <span>{item.icon}</span>
                      {t(item.labelKey)}
                    </button>
                  )
                )}
                {user && (
                  <button className="ph-mobile-menu-wallet" onClick={() => { setMobileMenuOpen(false); onOpenWallet(); }}>
                    {t('premiumHome.wallet')} · ${Number(user.walletBalance).toFixed(2)}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ══════════════════════════════════════
          BODY : sidebar + main
      ══════════════════════════════════════ */}
      <div className="ph-body">

        {/* ── Left sidebar ── */}
        <aside className="ph-sidebar" aria-label={t('premiumHome.nav.sidebarAria')}>
          <nav className="ph-sidebar-nav" role="navigation">
            {SIDEBAR_NAV.map((item, i) =>
              item === null
                ? <div key={`hr-${i}`} className="ph-sidebar-hr" />
                : (
                  <button
                    key={item.key}
                    className={`ph-sidebar-item${item.key === 'home' && isHome ? ' active' : ''}`}
                    onClick={() => handleSidebarNav(item.key)}
                    title={t(item.labelKey)}
                  >
                    <span className="ph-sidebar-icon">{item.icon}</span>
                    {t(item.labelKey)}
                  </button>
                )
            )}
          </nav>

          {user && (
            <div className="ph-sidebar-wallet">
              <div className="ph-sidebar-wallet-label">{t('premiumHome.walletBalance')}</div>
              <div className="ph-sidebar-wallet-amount">
                ${Number(user.walletBalance).toFixed(2)}
              </div>
              <button className="ph-sidebar-deposit" onClick={onOpenWallet}>
                {t('premiumHome.depositFunds')}
              </button>
            </div>
          )}
        </aside>

        {/* ── Main scrollable area ── */}
        <main className="ph-main">

          <div className="ph-main-search">
            <PlayerSearchBar onInvite={onInvitePlayer} />
          </div>

          {/* Tabs */}
          <div className="ph-tabs" role="tablist">
            {(['quick', 'lobby', 'correspondence'] as const).map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`ph-tab-btn${activeTab === tab ? ' active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'quick' ? t('premiumHome.tabs.quick') : tab === 'lobby' ? t('premiumHome.tabs.lobby') : t('premiumHome.tabs.correspondence')}
              </button>
            ))}
          </div>

          {/* ── Quick tab content ── */}
          {activeTab === 'quick' && (
            <>
              {/* Hero banner */}
              <section className="ph-hero" aria-label={t('premiumHome.hero.aria')}>
                <div className="ph-hero-bg-dots" aria-hidden="true" />
                <div className="ph-hero-glow" aria-hidden="true" />

                <div className="ph-hero-copy">
                  <div className="ph-hero-eyebrow">{t('premiumHome.hero.eyebrow')}</div>
                  <h1 className="ph-hero-h1">
                    {t('premiumHome.hero.titleLine1')}
                    <span className="ph-hero-h1-gold">{t('premiumHome.hero.titleLine2')}</span>
                  </h1>
                  <p className="ph-hero-tagline">{t('premiumHome.hero.tagline')}</p>
                  <p className="ph-hero-desc">
                    {t('premiumHome.hero.description')}
                  </p>
                  <div className="ph-hero-actions">
                    <button
                      className="ph-hero-cta"
                      onClick={() => navigate(`/${universe}/tournaments`)}
                    >
                      {t('premiumHome.hero.primaryCta')}
                    </button>
                    <button className="ph-hero-cta-ghost" onClick={() => setShowCustom(true)}>
                      {t('premiumHome.hero.secondaryCta')}
                    </button>
                  </div>
                </div>

                <div className="ph-hero-art" aria-hidden="true">
                  <div className="ph-hero-art-glow" />
                  <div className="ph-hero-trophy-emoji">🏆</div>
                  <img
                    src="/pieces/wq.svg"
                    alt=""
                    className="ph-hero-art-piece ph-hero-art-piece-1"
                  />
                  <img
                    src="/pieces/bk.svg"
                    alt=""
                    className="ph-hero-art-piece ph-hero-art-piece-2"
                  />
                </div>
              </section>

              {/* 2-column content grid */}
              <div className="ph-grid">

                {/* ─── Center column ─── */}
                <div className="ph-col-center">

                  {/* Game cards */}
                  <div className="ph-game-cards">
                    {/* Dames card */}
                    <div
                      className="ph-game-card ph-game-card-dames"
                      role="button"
                      tabIndex={0}
                      onClick={() => { setUniverse('checkers'); onCreateGame('5+0', 'online'); }}
                      onKeyDown={e => { if (e.key === 'Enter') { setUniverse('checkers'); onCreateGame('5+0', 'online'); } }}
                    >
                      <div className="ph-game-card-visual">
                        <span style={{ fontSize: 72, filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))', display: 'block', lineHeight: 1 }}>⚫</span>
                      </div>
                      <div className="ph-game-card-content">
                        <div className="ph-gc-badge">{t('premiumHome.gameCards.checkersBadge')}</div>
                        <div className="ph-gc-title">{t('premiumHome.gameCards.checkersTitle')}</div>
                        <div className="ph-gc-sub">{t('premiumHome.gameCards.checkersSub')}</div>
                        <button className="ph-gc-btn">{t('premiumHome.gameCards.playNow')} →</button>
                      </div>
                    </div>

                    {/* Chess card */}
                    <div
                      className="ph-game-card ph-game-card-chess"
                      role="button"
                      tabIndex={0}
                      onClick={() => { setUniverse('chess'); onCreateGame('5+0', 'online'); }}
                      onKeyDown={e => { if (e.key === 'Enter') { setUniverse('chess'); onCreateGame('5+0', 'online'); } }}
                    >
                      <div className="ph-game-card-visual">
                        <img src="/pieces/wn.svg" alt="" className="ph-gc-piece" />
                      </div>
                      <div className="ph-game-card-content">
                        <div className="ph-gc-badge">{t('premiumHome.gameCards.chessBadge')}</div>
                        <div className="ph-gc-title">{t('premiumHome.gameCards.chessTitle')}</div>
                        <div className="ph-gc-sub">{t('premiumHome.gameCards.chessSub')}</div>
                        <button className="ph-gc-btn">{t('premiumHome.gameCards.playNow')} →</button>
                      </div>
                    </div>
                  </div>

                  {/* Shortcuts */}
                  <div className="ph-shortcuts">
                    {SHORTCUTS.map(s => (
                      <button
                        key={s.key}
                        className="ph-shortcut"
                        onClick={() => handleShortcut(s.action)}
                      >
                        <div className="ph-shortcut-icon">{s.icon}</div>
                        <div className="ph-shortcut-label">{t(s.labelKey)}</div>
                        <div className="ph-shortcut-detail">{t(s.detailKey)}</div>
                      </button>
                    ))}
                  </div>

                  {/* Recent activity */}
                  <div className="ph-card ph-activity-card">
                    <div className="ph-card-head">
                      <div className="ph-card-title">{t('premiumHome.activity.title')}</div>
                      <button className="ph-card-action" onClick={() => user ? navigate(`/${universe}/profile/${encodeURIComponent(user.name)}`) : onOpenAuth()}>
                        {t('premiumHome.common.seeAll')} →
                      </button>
                    </div>
                    <div className="ph-activity-list">
                      {MOCK_ACTIVITY.map(a => (
                        <div key={a.id} className="ph-activity-row">
                          <div className={`ph-activity-icon ${a.type}`}>
                            {a.type === 'win' ? '✓' : a.type === 'loss' ? '✗' : '⚔️'}
                          </div>
                          <div className="ph-activity-body">
                            <div className="ph-activity-title">{t(a.titleKey)}</div>
                            <div className="ph-activity-meta">{a.detail && `${a.detail} · `}{t(a.timeKey)}</div>
                          </div>
                          <button
                            className={`ph-activity-tag ${a.type}`}
                            onClick={() => a.type === 'challenge' ? onChallengeFriend() : navigate(`/${universe}/leaderboard`)}
                          >
                            {t(a.tagKey)}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick pairing */}
                  <div className="ph-card ph-quick-card">
                    <div className="ph-card-head">
                      <div className="ph-card-title"><span className="ph-card-title-icon">⚡</span> {t('premiumHome.quickPairing.title')}</div>
                      <button className="ph-card-action" onClick={() => setActiveTab('lobby')}>
                        {t('premiumHome.quickPairing.viewLobby')} →
                      </button>
                    </div>
                    <div className="ph-quick-modes">
                      {quickPairingGroups.map(group => (
                        <div className="ph-quick-mode" key={group.cat}>
                          <div className="ph-quick-mode-title"><span>{group.icon}</span>{group.cat}</div>
                          {group.values.map(value => (
                            <button
                              key={value}
                              className={`ph-quick-pill${value === '10+5' ? ' featured' : ''}`}
                              onClick={() => { setActiveTab('lobby'); onCreateGame(value, 'online'); }}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Daily challenge */}
                  <div className="ph-card ph-daily-card">
                    <div className="ph-daily-illustration" aria-hidden="true">◎</div>
                    <div className="ph-daily-copy">
                      <div className="ph-daily-kicker">{t('premiumHome.daily.kicker')}</div>
                      <div className="ph-daily-title">{t('premiumHome.daily.title')}</div>
                      <div className="ph-daily-sub">{t('premiumHome.daily.sub')}</div>
                      <div className="ph-daily-rewards">
                        <span>🪙 + 50 DC</span>
                        <span>🏆 + 10 XP</span>
                      </div>
                    </div>
                    <div className="ph-daily-side">
                      <div className="ph-daily-progress">0 / 1</div>
                      <button className="ph-daily-btn" onClick={() => onCreateGame('10+5', 'online')}>{t('premiumHome.daily.play')}</button>
                    </div>
                  </div>

                  {/* Live games */}
                  <div className="ph-card ph-live-card">
                    <div className="ph-card-head">
                      <div className="ph-card-title">
                        {t('premiumHome.live.title')}
                        <span className="ph-live-dot" />
                        <span className="ph-live-label">LIVE</span>
                      </div>
                      <button className="ph-card-action" onClick={viewLiveGames}>{t('premiumHome.live.viewAll')} →</button>
                    </div>
                    {liveGamesLoading ? (
                      <div style={{ display: 'flex', gap: 10 }}>
                        {[1, 2, 3].map(i => (
                          <div key={i} className="ph-skel" style={{ flex: 1, height: 88 }} />
                        ))}
                      </div>
                    ) : liveActiveGames.length > 0 ? (
                      <div className="ph-live-match-grid">
                        {liveActiveGames.map((game, index) => (
                          <button
                            key={game.id}
                            className="ph-live-match-card"
                            onClick={() => navigate(`/${game.universe}/watch/${game.id}`)}
                          >
                            <div className="ph-live-board" aria-hidden="true">
                              <span className="ph-live-timer">{index === 0 ? '03:42' : '07:15'}</span>
                              {Array.from({ length: 64 }).map((_, i) => <i key={i} />)}
                            </div>
                            <div className="ph-live-match-info">
                              <span className="ph-live-feature">
                                <span className="ph-live-mini-badge">LIVE</span>
                                {index === 0 ? t('premiumHome.live.featured') : t('premiumHome.live.liveNow')}
                              </span>
                              <div className="ph-live-player">
                                <span className="ph-live-avatar">{game.white.name.slice(0, 1).toUpperCase()}</span>
                                <strong>{game.white.name}</strong>
                                <em>{game.white.rating}</em>
                              </div>
                              <div className="ph-live-player">
                                <span className="ph-live-avatar">{game.black.name.slice(0, 1).toUpperCase()}</span>
                                <strong>{game.black.name}</strong>
                                <em>{game.black.rating}</em>
                              </div>
                              <div className="ph-live-meta">{game.tc} • {t('premiumHome.live.spectators', { count: index === 0 ? 12 : 8 })}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="ph-live-empty">
                        {t('premiumHome.live.empty')}
                      </div>
                    )}
                  </div>

                  <div className="ph-lower-grid">
                    <div className="ph-card ph-upcoming-card">
                      <div className="ph-card-head">
                        <div className="ph-card-title">{t('premiumHome.upcoming.title')}</div>
                        <button className="ph-card-action" onClick={() => navigate(`/${universe}/tournaments`)}>{t('premiumHome.common.seeAll')} →</button>
                      </div>
                      {[
                        ['🏆', t('premiumHome.upcoming.eveningTournament'), t('premiumHome.upcoming.todayAt', { time: '20:00' }), '128'],
                        ['🏆', t('premiumHome.upcoming.weekendArena'), t('premiumHome.upcoming.tomorrowAt', { time: '15:00' }), '256'],
                        ['🏆', t('premiumHome.upcoming.classicPrestige'), t('premiumHome.upcoming.sundayMay26', { time: '17:00' }), '64'],
                      ].map(([icon, name, date, players]) => (
                        <button
                          key={name}
                          className="ph-upcoming-row"
                          onClick={() => navigate(`/${universe}/tournaments`)}
                        >
                          <span className="ph-upcoming-icon">{icon}</span>
                          <span className="ph-upcoming-main"><strong>{name}</strong><small>{date}</small></span>
                          <span className="ph-upcoming-players">♟ {players}</span>
                          <span className="ph-register-badge">{t('premiumHome.upcoming.registration')}</span>
                        </button>
                      ))}
                    </div>

                    <div className="ph-card ph-ranking-card">
                      <div className="ph-card-head">
                        <div className="ph-card-title">{t('premiumHome.ranking.title')}</div>
                        <button className="ph-card-action" onClick={() => navigate(`/${universe}/leaderboard`)}>{t('premiumHome.ranking.viewRanking')} →</button>
                      </div>
                      {displayLeaderboard.slice(0, 5).map(entry => (
                        <button
                          key={entry.rank}
                          className="ph-rank-row"
                          onClick={() => navigate(`/${universe}/profile/${encodeURIComponent(entry.name)}`)}
                        >
                          <span className={`ph-rank-medal rank-${entry.rank}`}>{entry.rank}</span>
                          <span className="ph-rank-avatar">{entry.name.slice(0, 1).toUpperCase()}</span>
                          <strong>{entry.name}</strong>
                          <em>{entry.score}</em>
                        </button>
                      ))}
                      <button
                        className="ph-rank-row ph-rank-me"
                        onClick={() => user ? navigate(`/${universe}/profile/${encodeURIComponent(user.name)}`) : onOpenAuth()}
                      >
                        <span className="ph-rank-medal">—</span>
                        <span className="ph-rank-avatar">{(user?.name || t('premiumHome.ranking.you')).slice(0, 1).toUpperCase()}</span>
                        <strong>{t('premiumHome.ranking.you')}</strong>
                        <em>{user?.rating?.[universe] ?? 1987}</em>
                      </button>
                    </div>
                  </div>

                  {/* Quote */}
                  <div className="ph-quote">
                    <span className="ph-quote-guillemet">"</span>
                    <p className="ph-quote-body">
                      {t('premiumHome.quote.line1')}<br />
                      {t('premiumHome.quote.line2')}<br />
                      {t('premiumHome.quote.line3')}<br />
                      {t('premiumHome.quote.line4')}
                    </p>
                    <div className="ph-quote-sig">DamCash</div>
                  </div>

                </div>

                {/* ─── Right column ─── */}
                <aside className="ph-col-right">

                  {/* Leaderboard */}
                  <div className="ph-card">
                    <div className="ph-card-head">
                      <div className="ph-card-title">🏅 {t('premiumHome.ranking.general')}</div>
                      <button className="ph-card-action" onClick={() => navigate(`/${universe}/leaderboard`)}>
                        {t('premiumHome.common.seeAll')} →
                      </button>
                    </div>

                    {leaderboardLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="ph-skel" style={{ height: 30, marginBottom: 8 }} />
                      ))
                    ) : (
                      displayLeaderboard.map(entry => (
                        <div key={entry.rank} className="ph-lb-row">
                          <span className={`ph-lb-rank${entry.rank === 1 ? ' gold' : entry.rank === 2 ? ' silver' : entry.rank === 3 ? ' bronze' : ''}`}>
                            {entry.rank}
                          </span>
                          {entry.country && (
                            <span className="ph-lb-flag" title={countryName(entry.country)}>
                              {countryFlag(entry.country)}
                            </span>
                          )}
                          {entry.wins !== undefined ? (
                            <PlayerHoverCard
                              username={entry.name}
                              rating={entry.score}
                              wins={entry.wins ?? 0}
                              losses={entry.losses ?? 0}
                              draws={entry.draws ?? 0}
                              games={entry.games ?? 0}
                              country={entry.country ?? ''}
                            >
                              <span
                                className="ph-lb-name"
                                onClick={() => navigate(`/${universe}/profile/${encodeURIComponent(entry.name)}`)}
                              >
                                {entry.name}
                              </span>
                            </PlayerHoverCard>
                          ) : (
                            <span
                              className="ph-lb-name"
                              onClick={() => navigate(`/${universe}/profile/${encodeURIComponent(entry.name)}`)}
                            >
                              {entry.name}
                            </span>
                          )}
                          <span className="ph-lb-score">{entry.score.toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Upcoming tournaments */}
                  <div className="ph-card">
                    <div className="ph-card-head">
                      <div className="ph-card-title">📅 {t('premiumHome.upcoming.title')}</div>
                      <button className="ph-card-action" onClick={() => navigate(`/${universe}/tournaments`)}>
                        {t('premiumHome.common.seeAll')} →
                      </button>
                    </div>
                    {MOCK_TOURNAMENTS.map(tournament => (
                      <div
                        key={tournament.id}
                        className="ph-tourn-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/${universe}/tournaments`)}
                      >
                        <div className="ph-tourn-icon">🏆</div>
                        <div className="ph-tourn-body">
                          <div className="ph-tourn-name">{t(tournament.nameKey)}</div>
                          <div className="ph-tourn-type">{t(tournament.typeKey)}</div>
                        </div>
                        <div className="ph-tourn-right">
                          <div className="ph-tourn-date">{t(tournament.dateKey)}</div>
                          <div className="ph-tourn-time">{tournament.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                </aside>
              </div>
            </>
          )}

          {/* ── Lobby tab ── */}
          {activeTab === 'lobby' && (
            <div className="tab-content-enter">
              <LobbyTab
                onMatchFound={(roomId, myColor) =>
                  navigate(`/${universe}/game/${roomId}?color=${myColor}`)
                }
              />
            </div>
          )}

          {/* ── Correspondence tab ── */}
          {activeTab === 'correspondence' && (
            <div className="tab-content-enter">
              <CorrespondenceTab />
            </div>
          )}

        </main>
      </div>

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
