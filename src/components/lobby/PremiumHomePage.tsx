import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  useUniverseStore, useLiveGamesStore, useNotificationStore, useUserStore, LiveGame,
} from '../../stores';
import { LobbyTab } from './LobbyTab';
import { CorrespondenceTab } from './CorrespondenceTab';
import { CustomGameModal } from './CustomGameModal';
import { LiveGamesSection } from './LiveGamePreview';
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
}

// ── Time controls ─────────────────────────────────────────────────────────────

interface TcOption { value: string; label: string; category: string; }

const CHESS_TC: TcOption[] = [
  { value: '1+0', label: '1+0', category: 'Bullet' },
  { value: '2+1', label: '2+1', category: 'Bullet' },
  { value: '2+0', label: '2+0', category: 'Bullet' },
  { value: '3+0', label: '3+0', category: 'Blitz' },
  { value: '5+0', label: '5+0', category: 'Blitz' },
  { value: '5+3', label: '5+3', category: 'Blitz' },
  { value: '10+0',  label: '10+0',  category: 'Rapide' },
  { value: '10+5',  label: '10+5',  category: 'Rapide' },
  { value: '15+10', label: '15+10', category: 'Rapide' },
  { value: '30+0',  label: '30+0',  category: 'Classique' },
  { value: '30+20', label: '30+20', category: 'Classique' },
  { value: '45+0',  label: '45+0',  category: 'Classique' },
];

const CHECKERS_TC: TcOption[] = [
  { value: '1+0',   label: '1+0',   category: 'Bullet' },
  { value: '2+1',   label: '2+1',   category: 'Bullet' },
  { value: '2+0',   label: '2+0',   category: 'Bullet' },
  { value: '3+0',   label: '3+0',   category: 'Blitz' },
  { value: '5+0',   label: '5+0',   category: 'Blitz' },
  { value: '5+3',   label: '5+3',   category: 'Blitz' },
  { value: '10+0',  label: '10+0',  category: 'Rapide' },
  { value: '15+0',  label: '15+0',  category: 'Rapide' },
  { value: '15+15', label: '15+15', category: 'Rapide' },
  { value: '20+0',  label: '20+0',  category: 'Classique' },
  { value: '30+0',  label: '30+0',  category: 'Classique' },
  { value: '45+0',  label: '45+0',  category: 'Classique' },
];

// ── Static content ────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { key: 'quick',       label: 'Partie rapide',  detail: 'Jouer maintenant',      icon: '⚡', action: 'quick'       },
  { key: 'challenges',  label: 'Défis',          detail: 'Inviter un ami',         icon: '⚔️', action: 'challenge'   },
  { key: 'tournaments', label: 'Tournois',        detail: 'Événements & prix',      icon: '🏆', action: 'tournaments' },
  { key: 'leaderboard', label: 'Classement',      detail: 'Meilleurs joueurs',      icon: '📊', action: 'leaderboard' },
  { key: 'community',   label: 'Communauté',      detail: 'Joueurs en ligne',       icon: '👥', action: 'lobby'       },
  { key: 'rewards',     label: 'Récompenses',     detail: 'Portefeuille & mises',   icon: '💰', action: 'wallet'      },
] as const;

type ActivityType = 'win' | 'loss' | 'challenge';

interface MockActivity { id: number; type: ActivityType; title: string; detail: string; tag: string; time: string; }

const MOCK_ACTIVITY: MockActivity[] = [
  {
    id: 1, type: 'win',
    title: 'Amina_23 a remporté une partie de dames',
    detail: '3 - 1', tag: 'Victoire', time: 'Il y a 5 min',
  },
  {
    id: 2, type: 'win',
    title: "LucasM a gagné une partie d'échecs",
    detail: '1 - 0', tag: 'Victoire', time: 'Il y a 12 min',
  },
  {
    id: 3, type: 'challenge',
    title: 'Défi accepté par SophieB',
    detail: '', tag: 'Voir le défi', time: 'Il y a 23 min',
  },
];

const MOCK_TOURNAMENTS = [
  { id: 1, name: 'Coupe du Roi',       type: 'Échecs • 32 joueurs', date: '24 mai 2025', time: '20:00' },
  { id: 2, name: 'Masters des Dames',  type: 'Dames • 64 joueurs',  date: '25 mai 2025', time: '18:00' },
  { id: 3, name: 'Grand Prix Hebdo',   type: 'Échecs • 16 joueurs', date: '27 mai 2025', time: '21:00' },
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
  { key: 'home',        label: 'Accueil',        icon: '🏠' },
  { key: 'checkers',    label: 'Jeu de dames',   icon: '⚫' },
  { key: 'chess',       label: "Jeu d'échecs",   icon: '♟' },
  null,
  { key: 'challenges',  label: 'Défis',           icon: '⚔️' },
  { key: 'tournaments', label: 'Tournois',         icon: '🏆' },
  { key: 'leaderboard', label: 'Classement',       icon: '📊' },
  null,
  { key: 'messages',    label: 'Messages',         icon: '💬' },
  { key: 'friends',     label: 'Amis',             icon: '👥' },
  { key: 'shop',        label: 'Boutique',         icon: '🛒' },
  null,
  { key: 'help',        label: 'Aide & Support',   icon: '❓' },
  { key: 'settings',    label: 'Paramètres',       icon: '⚙️' },
] as const;

// ── Header nav ────────────────────────────────────────────────────────────────

const HEADER_NAV = [
  { label: 'Accueil',     key: 'home' },
  { label: 'Jeux',        key: 'games' },
  { label: 'Tournois',    key: 'tournaments' },
  { label: 'Classement',  key: 'leaderboard' },
  { label: 'Communauté',  key: 'community' },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export const PremiumHomePage: React.FC<Props> = ({
  onCreateGame, onOpenWallet, onChallengeFriend, onPlayComputer,
  onInvitePlayer, onOpenAuth,
}) => {
  const navigate    = useNavigate();
  const location    = useLocation();
  const universe    = useUniverseStore(s => s.universe);
  const setUniverse = useUniverseStore(s => s.setUniverse);
  const games           = useLiveGamesStore(s => s.games);
  const syncServerGames = useLiveGamesStore(s => s.syncServerGames);
  const addNotification = useNotificationStore(s => s.addNotification);
  const user    = useUserStore(s => s.user);
  const isLoggedIn = useUserStore(s => s.isLoggedIn);

  const [activeTab, setActiveTab] = useState<'quick' | 'lobby' | 'correspondence'>('quick');
  const [showCustom, setShowCustom] = useState(false);
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
    const refresh = (showErr: boolean) =>
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
        .catch(() => {
          if (showErr) addNotification('Impossible de charger les parties en direct', 'error');
        });

    setLiveGamesLoading(true);
    refresh(true).finally(() => { if (!cancelled) setLiveGamesLoading(false); });

    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      refresh(false);
    }, 5_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [addNotification, syncServerGames, universe]);

  const timeControls = universe === 'chess' ? CHESS_TC : CHECKERS_TC;
  const liveCount    = games.filter(g => g.universe === universe && g.status === 'playing').length;

  const grouped: Record<string, TcOption[]> = {};
  for (const tc of timeControls) {
    if (!grouped[tc.category]) grouped[tc.category] = [];
    grouped[tc.category].push(tc);
  }

  // Displayed leaderboard: real API data or mock fallback
  const displayLeaderboard: Array<{ rank: number; name: string; score: number; country?: string; wins?: number; losses?: number; draws?: number; games?: number }> =
    leaderboard.length > 0
      ? leaderboard.map(e => ({ rank: e.rank, name: e.name, score: e.rating, country: e.country, wins: e.wins, losses: e.losses, draws: e.draws, games: e.games }))
      : MOCK_LEADERBOARD;

  const isHome = /^\/(chess|checkers)\/?$/.test(location.pathname);

  const handleSidebarNav = (key: string) => {
    if (key === 'home')        navigate(`/${universe}`);
    else if (key === 'checkers')    { setUniverse('checkers'); navigate('/checkers'); }
    else if (key === 'chess')       { setUniverse('chess');    navigate('/chess'); }
    else if (key === 'challenges')  onChallengeFriend();
    else if (key === 'tournaments') navigate(`/${universe}/tournaments`);
    else if (key === 'leaderboard') navigate(`/${universe}/leaderboard`);
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

  return (
    <div className="ph-layout">

      {/* ══════════════════════════════════════
          PREMIUM HEADER
      ══════════════════════════════════════ */}
      <header className="ph-header">
        <div className="ph-header-inner">

          {/* Logo */}
          <button className="ph-header-logo" onClick={() => navigate(`/${universe}`)}>
            <img src="/logo.svg" alt="DamCash" className="ph-logo-img" />
            <span className="ph-logo-crown">👑</span>
            <span className="ph-logo-word">Dam<span>Cash</span></span>
          </button>

          {/* Nav */}
          <nav className="ph-header-nav" role="navigation" aria-label="Navigation principale">
            {HEADER_NAV.map(item => (
              <button
                key={item.key}
                className={`ph-hnav-item${item.key === 'home' && isHome ? ' active' : ''}`}
                onClick={() => handleHeaderNav(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="ph-header-right">
            <div className="ph-header-search-wrap">
              <PlayerSearchBar onInvite={onInvitePlayer} />
            </div>

            {isLoggedIn && user ? (
              <>
                <NotificationCenter />
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
                    <span className="ph-header-username">{user.name}</span>
                    <span className="ph-header-score">{user.rating[universe]}</span>
                  </div>
                </button>
              </>
            ) : (
              <div className="ph-header-auth">
                <button className="ph-btn-auth secondary" onClick={onOpenAuth}>
                  Se connecter
                </button>
                <button className="ph-btn-auth primary" onClick={onOpenAuth}>
                  S'inscrire
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════
          BODY : sidebar + main
      ══════════════════════════════════════ */}
      <div className="ph-body">

        {/* ── Left sidebar ── */}
        <aside className="ph-sidebar" aria-label="Navigation latérale">
          <nav className="ph-sidebar-nav" role="navigation">
            {SIDEBAR_NAV.map((item, i) =>
              item === null
                ? <div key={`hr-${i}`} className="ph-sidebar-hr" />
                : (
                  <button
                    key={item.key}
                    className={`ph-sidebar-item${item.key === 'home' && isHome ? ' active' : ''}`}
                    onClick={() => handleSidebarNav(item.key)}
                    title={item.label}
                  >
                    <span className="ph-sidebar-icon">{item.icon}</span>
                    {item.label}
                  </button>
                )
            )}
          </nav>

          {user && (
            <div className="ph-sidebar-wallet">
              <div className="ph-sidebar-wallet-label">Solde du portefeuille</div>
              <div className="ph-sidebar-wallet-amount">
                ${Number(user.walletBalance).toFixed(2)}
              </div>
              <button className="ph-sidebar-deposit" onClick={onOpenWallet}>
                + Déposer des fonds
              </button>
            </div>
          )}
        </aside>

        {/* ── Main scrollable area ── */}
        <main className="ph-main">

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
                {tab === 'quick' ? 'Partie rapide' : tab === 'lobby' ? 'Lobby' : 'Correspondance'}
              </button>
            ))}
          </div>

          {/* ── Quick tab content ── */}
          {activeTab === 'quick' && (
            <>
              {/* Hero banner */}
              <section className="ph-hero" aria-label="Bannière saison">
                <div className="ph-hero-bg-dots" aria-hidden="true" />
                <div className="ph-hero-glow" aria-hidden="true" />

                <div className="ph-hero-copy">
                  <div className="ph-hero-eyebrow">DamCash — Saison Actuelle</div>
                  <h1 className="ph-hero-h1">
                    SAISON DES
                    <span className="ph-hero-h1-gold">CHAMPIONS</span>
                  </h1>
                  <p className="ph-hero-tagline">Participez. Gagnez. Soyez légende.</p>
                  <p className="ph-hero-desc">
                    Des tournois excitants et des récompenses exclusives vous attendent.
                  </p>
                  <div className="ph-hero-actions">
                    <button
                      className="ph-hero-cta"
                      onClick={() => navigate(`/${universe}/tournaments`)}
                    >
                      Découvrir les tournois
                    </button>
                    <button className="ph-hero-cta-ghost" onClick={() => setShowCustom(true)}>
                      Partie personnalisée
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
                        <div className="ph-gc-badge">⚫ Jeu de dames</div>
                        <div className="ph-gc-title">Affrontez des joueurs du monde entier</div>
                        <div className="ph-gc-sub">Tactiques rapides et finales nettes.</div>
                        <button className="ph-gc-btn">Jouer maintenant →</button>
                      </div>
                    </div>

                    {/* Échecs card */}
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
                        <div className="ph-gc-badge">♟ Jeu d'échecs</div>
                        <div className="ph-gc-title">Stratégie. Réflexion. Victoire.</div>
                        <div className="ph-gc-sub">Calcul, vision, maîtrise.</div>
                        <button className="ph-gc-btn">Jouer maintenant →</button>
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
                        <div className="ph-shortcut-label">{s.label}</div>
                        <div className="ph-shortcut-detail">{s.detail}</div>
                      </button>
                    ))}
                  </div>

                  {/* Recent activity */}
                  <div className="ph-card">
                    <div className="ph-card-head">
                      <div className="ph-card-title">Activité récente</div>
                    </div>
                    <div className="ph-activity-list">
                      {MOCK_ACTIVITY.map(a => (
                        <div key={a.id} className="ph-activity-row">
                          <div className={`ph-activity-icon ${a.type}`}>
                            {a.type === 'win' ? '✓' : a.type === 'loss' ? '✗' : '⚔️'}
                          </div>
                          <div className="ph-activity-body">
                            <div className="ph-activity-title">{a.title}</div>
                            <div className="ph-activity-meta">{a.detail && `${a.detail} · `}{a.time}</div>
                          </div>
                          <span className={`ph-activity-tag ${a.type}`}>{a.tag}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick pairing */}
                  <div className="ph-card">
                    <div className="ph-card-head">
                      <div className="ph-card-title">Appariement rapide</div>
                      <button className="ph-card-action" onClick={() => setActiveTab('lobby')}>
                        Voir le lobby →
                      </button>
                    </div>
                    <div className="ph-pairing-grid">
                      {Object.entries(grouped).map(([cat, tcs]) => (
                        <React.Fragment key={cat}>
                          <div className="ph-pairing-cat-label">
                            <span className="ph-pairing-cat-dot" />
                            {cat}
                          </div>
                          {tcs.map(({ value, label }) => (
                            <div
                              key={value}
                              className="ph-time-card"
                              role="button"
                              tabIndex={0}
                              onClick={() => { setActiveTab('lobby'); onCreateGame(value, 'online'); }}
                              onKeyDown={e => { if (e.key === 'Enter') { setActiveTab('lobby'); onCreateGame(value, 'online'); } }}
                            >
                              <div className="ph-time-val">{label}</div>
                              <div className="ph-time-cat">{cat}</div>
                            </div>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  {/* Live games */}
                  <div className="ph-card">
                    <div className="ph-card-head">
                      <div className="ph-card-title">
                        Parties en direct
                        {!liveGamesLoading && liveCount > 0 && (
                          <span className="ph-live-pill">{liveCount} en cours</span>
                        )}
                      </div>
                    </div>
                    {liveGamesLoading ? (
                      <div style={{ display: 'flex', gap: 10 }}>
                        {[1, 2, 3].map(i => (
                          <div key={i} className="ph-skel" style={{ flex: 1, height: 88 }} />
                        ))}
                      </div>
                    ) : (
                      <LiveGamesSection
                        games={games}
                        universe={universe}
                        onClickGame={(id, univ) => navigate(`/${univ}/watch/${id}`)}
                      />
                    )}
                  </div>

                  {/* Quote */}
                  <div className="ph-quote">
                    <span className="ph-quote-guillemet">"</span>
                    <p className="ph-quote-body">
                      Chaque coup compte.<br />
                      Chaque décision<br />
                      façonne le champion<br />
                      en vous.
                    </p>
                    <div className="ph-quote-sig">DamCash</div>
                  </div>

                </div>

                {/* ─── Right column ─── */}
                <aside className="ph-col-right">

                  {/* Leaderboard */}
                  <div className="ph-card">
                    <div className="ph-card-head">
                      <div className="ph-card-title">🏅 Classement général</div>
                      <button className="ph-card-action" onClick={() => navigate(`/${universe}/leaderboard`)}>
                        Voir tout →
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
                      <div className="ph-card-title">📅 Tournois à venir</div>
                      <button className="ph-card-action" onClick={() => navigate(`/${universe}/tournaments`)}>
                        Voir tout →
                      </button>
                    </div>
                    {MOCK_TOURNAMENTS.map(t => (
                      <div
                        key={t.id}
                        className="ph-tourn-row"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/${universe}/tournaments`)}
                      >
                        <div className="ph-tourn-icon">🏆</div>
                        <div className="ph-tourn-body">
                          <div className="ph-tourn-name">{t.name}</div>
                          <div className="ph-tourn-type">{t.type}</div>
                        </div>
                        <div className="ph-tourn-right">
                          <div className="ph-tourn-date">{t.date}</div>
                          <div className="ph-tourn-time">{t.time}</div>
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
