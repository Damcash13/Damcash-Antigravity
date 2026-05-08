import React, { useState, useEffect } from 'react';
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
}

// ── Static content ────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { key: 'quick',       label: 'Partie rapide',  detail: 'Jouez sans attendre',       icon: '⚡', action: 'quick'       },
  { key: 'challenges',  label: 'Défis',          detail: 'Affrontez des adversaires', icon: '⚔️', action: 'challenge'   },
  { key: 'tournaments', label: 'Tournois',       detail: 'Compétitions exclusives',   icon: '🏆', action: 'tournaments' },
  { key: 'leaderboard', label: 'Classement',     detail: 'Voyez où vous vous situez', icon: '📊', action: 'leaderboard' },
] as const;

type ActivityType = 'win' | 'loss' | 'challenge';

interface MockActivity { id: number; type: ActivityType; title: string; detail: string; tag: string; time: string; }

const MOCK_ACTIVITY: MockActivity[] = [
  {
    id: 1, type: 'win',
    title: 'Amina_23 a remporté une partie',
    detail: '3 - 1', tag: 'Victoire', time: 'il y a 5 min',
  },
  {
    id: 2, type: 'win',
    title: "LucasM a gagné une partie d'échecs",
    detail: '1 - 0', tag: 'Victoire', time: 'il y a 12 min',
  },
  {
    id: 3, type: 'challenge',
    title: 'Défi accepté par SophieB',
    detail: '', tag: 'Voir le défi', time: 'il y a 23 min',
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

  // Displayed leaderboard: real API data or mock fallback
  const displayLeaderboard: Array<{ rank: number; name: string; score: number; country?: string; wins?: number; losses?: number; draws?: number; games?: number }> =
    leaderboard.length > 0
      ? leaderboard.map(e => ({ rank: e.rank, name: e.name, score: e.rating, country: e.country, wins: e.wins, losses: e.losses, draws: e.draws, games: e.games }))
      : MOCK_LEADERBOARD;
  const liveActiveGames = games.filter(g => g.universe === universe && g.status === 'playing').slice(0, 2);
  const quickPairingGroups = [
    { cat: 'Bullet', icon: '▭', values: ['1+0', '2+1', '2+0'] },
    { cat: 'Blitz', icon: '⚡', values: ['3+0', '5+0', '5+3'] },
    { cat: 'Rapide', icon: '◷', values: ['10+0', '10+5', '15+10'] },
    { cat: 'Classique', icon: '♜', values: ['30+0', '30+20', '45+0'] },
  ];

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
            <span className="ph-logo-monogram" aria-hidden="true">
              <span className="ph-logo-crown">♛</span>
              <span className="ph-logo-d">D</span>
              <span className="ph-logo-c">C</span>
            </span>
            <span className="ph-logo-separator" aria-hidden="true" />
            <span className="ph-logo-lockup">
              <span className="ph-logo-word"><span>Dam</span><span>Cash</span></span>
              <span className="ph-logo-tagline">Stratégie. Rapidité. Victoire.</span>
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
                  <div className="ph-hero-eyebrow">DAMCASH — SAISON ACTUELLE</div>
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
                        <div className="ph-gc-badge">JEU DE DAMES</div>
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
                        <div className="ph-gc-badge">JEU D'ÉCHECS</div>
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
                  <div className="ph-card ph-activity-card">
                    <div className="ph-card-head">
                      <div className="ph-card-title">Activité récente</div>
                      <button className="ph-card-action">Tout voir →</button>
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
                  <div className="ph-card ph-quick-card">
                    <div className="ph-card-head">
                      <div className="ph-card-title"><span className="ph-card-title-icon">⚡</span> Appariement rapide</div>
                      <button className="ph-card-action" onClick={() => setActiveTab('lobby')}>
                        Voir le lobby →
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
                      <div className="ph-daily-kicker">Défi du jour</div>
                      <div className="ph-daily-title">Gagnez avec les Blancs</div>
                      <div className="ph-daily-sub">Terminez la partie avec une victoire.</div>
                      <div className="ph-daily-rewards">
                        <span>🪙 + 50 DC</span>
                        <span>🏆 + 10 XP</span>
                      </div>
                    </div>
                    <div className="ph-daily-side">
                      <div className="ph-daily-progress">0 / 1</div>
                      <button className="ph-daily-btn" onClick={() => onCreateGame('10+5', 'online')}>Jouer</button>
                    </div>
                  </div>

                  {/* Live games */}
                  <div className="ph-card ph-live-card">
                    <div className="ph-card-head">
                      <div className="ph-card-title">
                        Parties en direct
                        <span className="ph-live-dot" />
                        <span className="ph-live-label">LIVE</span>
                      </div>
                      <button className="ph-card-action" onClick={() => navigate(`/${universe}`)}>Voir toutes →</button>
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
                                {index === 0 ? 'En vedette' : 'En direct'}
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
                              <div className="ph-live-meta">{game.tc} • {index === 0 ? 12 : 8} spectateurs</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="ph-live-empty">
                        Aucune partie en direct pour le moment.
                      </div>
                    )}
                  </div>

                  <div className="ph-lower-grid">
                    <div className="ph-card ph-upcoming-card">
                      <div className="ph-card-head">
                        <div className="ph-card-title">Tournois à venir</div>
                        <button className="ph-card-action" onClick={() => navigate(`/${universe}/tournaments`)}>Voir tout →</button>
                      </div>
                      {[
                        ['🏆', 'Tournoi du Soir', "Aujourd'hui • 20:00", '128'],
                        ['🏆', 'Week-End Arena', 'Demain • 15:00', '256'],
                        ['🏆', 'Classique Prestige', 'Dim. 26 mai • 17:00', '64'],
                      ].map(([icon, name, date, players]) => (
                        <div key={name} className="ph-upcoming-row">
                          <span className="ph-upcoming-icon">{icon}</span>
                          <span className="ph-upcoming-main"><strong>{name}</strong><small>{date}</small></span>
                          <span className="ph-upcoming-players">♟ {players}</span>
                          <span className="ph-register-badge">Inscription</span>
                        </div>
                      ))}
                    </div>

                    <div className="ph-card ph-ranking-card">
                      <div className="ph-card-head">
                        <div className="ph-card-title">Classement</div>
                        <button className="ph-card-action" onClick={() => navigate(`/${universe}/leaderboard`)}>Voir le classement →</button>
                      </div>
                      {displayLeaderboard.slice(0, 5).map(entry => (
                        <div key={entry.rank} className="ph-rank-row">
                          <span className={`ph-rank-medal rank-${entry.rank}`}>{entry.rank}</span>
                          <span className="ph-rank-avatar">{entry.name.slice(0, 1).toUpperCase()}</span>
                          <strong>{entry.name}</strong>
                          <em>{entry.score}</em>
                        </div>
                      ))}
                      <div className="ph-rank-row ph-rank-me">
                        <span className="ph-rank-medal">—</span>
                        <span className="ph-rank-avatar">{(user?.name || 'Vous').slice(0, 1).toUpperCase()}</span>
                        <strong>Vous</strong>
                        <em>{user?.rating?.[universe] ?? 1987}</em>
                      </div>
                    </div>
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
