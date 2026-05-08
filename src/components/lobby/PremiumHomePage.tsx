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
import { countryFlag, countryName } from '../../lib/countries';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onCreateGame: (tc: string, mode: 'online' | 'computer', color?: 'white' | 'black' | 'random') => void;
  onOpenWallet: () => void;
  onChallengeFriend: () => void;
  onPlayComputer: () => void;
}

// ── Time controls ─────────────────────────────────────────────────────────────

interface TcOption { value: string; label: string; category: string; }

const CHESS_TC: TcOption[] = [
  { value: '1+0',   label: '1+0',   category: 'Bullet'    },
  { value: '2+1',   label: '2+1',   category: 'Bullet'    },
  { value: '2+0',   label: '2+0',   category: 'Bullet'    },
  { value: '3+0',   label: '3+0',   category: 'Blitz'     },
  { value: '5+0',   label: '5+0',   category: 'Blitz'     },
  { value: '5+3',   label: '5+3',   category: 'Blitz'     },
  { value: '10+0',  label: '10+0',  category: 'Rapide'    },
  { value: '10+5',  label: '10+5',  category: 'Rapide'    },
  { value: '15+10', label: '15+10', category: 'Rapide'    },
  { value: '30+0',  label: '30+0',  category: 'Classique' },
  { value: '30+20', label: '30+20', category: 'Classique' },
  { value: '45+0',  label: '45+0',  category: 'Classique' },
];

const CHECKERS_TC: TcOption[] = [
  { value: '1+0',   label: '1+0',   category: 'Bullet'    },
  { value: '2+1',   label: '2+1',   category: 'Bullet'    },
  { value: '2+0',   label: '2+0',   category: 'Bullet'    },
  { value: '3+0',   label: '3+0',   category: 'Blitz'     },
  { value: '5+0',   label: '5+0',   category: 'Blitz'     },
  { value: '5+3',   label: '5+3',   category: 'Blitz'     },
  { value: '10+0',  label: '10+0',  category: 'Rapide'    },
  { value: '15+0',  label: '15+0',  category: 'Rapide'    },
  { value: '15+15', label: '15+15', category: 'Rapide'    },
  { value: '20+0',  label: '20+0',  category: 'Classique' },
  { value: '30+0',  label: '30+0',  category: 'Classique' },
  { value: '45+0',  label: '45+0',  category: 'Classique' },
];

// ── Static data ───────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { key: 'quick',       label: 'Partie rapide',   detail: 'Jouer maintenant',     icon: '⚡', action: 'quick'       },
  { key: 'challenge',   label: 'Défis',           detail: 'Inviter un ami',       icon: '⚔️', action: 'challenge'   },
  { key: 'tournaments', label: 'Tournois',         detail: 'Événements et prix',   icon: '🏆', action: 'tournaments' },
  { key: 'leaderboard', label: 'Classement',       detail: 'Meilleurs joueurs',    icon: '📊', action: 'leaderboard' },
  { key: 'community',   label: 'Communauté',       detail: 'Joueurs en ligne',     icon: '👥', action: 'lobby'       },
  { key: 'rewards',     label: 'Récompenses',      detail: 'Portefeuille et mises', icon: '💰', action: 'wallet'     },
] as const;

const MOCK_ACTIVITY = [
  { id: 1, type: 'win' as const,        opponent: 'Magnus_Jr',   result: '+15 pts',  game: 'Échecs', time: 'Il y a 2h'    },
  { id: 2, type: 'tournament' as const, name: 'Tournoi Blitz',   reward: '+$5.00',   time: 'Hier'                        },
  { id: 3, type: 'loss' as const,       opponent: 'CheckersPro', result: '−12 pts',  game: 'Dames',  time: 'Il y a 2 j.' },
];

const MOCK_TOURNAMENTS = [
  { id: 1, name: 'Grand Prix Dames',      time: 'Demain 18h00', players: 32, prize: '$50'  },
  { id: 2, name: 'Blitz Échecs #14',      time: 'Sam. 15h00',   players: 16, prize: '$20'  },
  { id: 3, name: 'Championnat Classique', time: 'Dim. 10h00',   players: 64, prize: '$100' },
];

// ── Leaderboard entry type ────────────────────────────────────────────────────

interface LbEntry {
  rank: number; name: string; country: string;
  rating: number; games: number; wins: number; losses: number; draws: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const PremiumHomePage: React.FC<Props> = ({
  onCreateGame, onOpenWallet, onChallengeFriend, onPlayComputer,
}) => {
  const navigate   = useNavigate();
  const location   = useLocation();
  const universe   = useUniverseStore(s => s.universe);
  const setUniverse = useUniverseStore(s => s.setUniverse);
  const games           = useLiveGamesStore(s => s.games);
  const syncServerGames = useLiveGamesStore(s => s.syncServerGames);
  const addNotification = useNotificationStore(s => s.addNotification);
  const user = useUserStore(s => s.user);

  const [activeTab, setActiveTab] = useState<'quick' | 'lobby' | 'correspondence'>('quick');
  const [showCustom, setShowCustom] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LbEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [liveGamesLoading, setLiveGamesLoading]     = useState(true);

  // Fetch leaderboard
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
        .catch(() => { if (showErr) addNotification('Impossible de charger les parties en direct', 'error'); });

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

  const isHome = location.pathname === `/${universe}` || location.pathname === `/${universe}/`;

  const NAV_ITEMS: Array<{ key: string; label: string; icon: string; onClick: () => void } | null> = [
    { key: 'home',        label: 'Accueil',         icon: '🏠', onClick: () => navigate(`/${universe}`) },
    { key: 'checkers',    label: 'Jeu de dames',    icon: '⚫', onClick: () => { setUniverse('checkers'); navigate('/checkers'); } },
    { key: 'chess',       label: "Jeu d'échecs",    icon: '♟', onClick: () => { setUniverse('chess'); navigate('/chess'); } },
    null,
    { key: 'challenges',  label: 'Défis',            icon: '⚔️', onClick: onChallengeFriend },
    { key: 'tournaments', label: 'Tournois',          icon: '🏆', onClick: () => navigate(`/${universe}/tournaments`) },
    { key: 'leaderboard', label: 'Classement',        icon: '📊', onClick: () => navigate(`/${universe}/leaderboard`) },
    null,
    { key: 'messages',    label: 'Messages',          icon: '💬', onClick: () => navigate(`/${universe}/coming-soon/messages`) },
    { key: 'friends',     label: 'Amis',              icon: '👥', onClick: () => navigate(`/${universe}/coming-soon/friends`) },
    { key: 'shop',        label: 'Boutique',          icon: '🛒', onClick: () => navigate(`/${universe}/coming-soon/shop`) },
    null,
    { key: 'help',        label: 'Aide & Support',    icon: '❓', onClick: () => navigate(`/${universe}/coming-soon/help`) },
    { key: 'settings',    label: 'Paramètres',        icon: '⚙️', onClick: () => navigate(`/${universe}/coming-soon/settings`) },
  ];

  const handleShortcut = (action: string) => {
    if (action === 'quick')       { setActiveTab('lobby'); onCreateGame('10+0', 'online'); }
    else if (action === 'challenge')   { onChallengeFriend(); }
    else if (action === 'tournaments') { navigate(`/${universe}/tournaments`); }
    else if (action === 'leaderboard') { navigate(`/${universe}/leaderboard`); }
    else if (action === 'lobby')       { setActiveTab('lobby'); }
    else if (action === 'wallet')      { onOpenWallet(); }
  };

  return (
    <div className="ph-wrap">

      {/* ── Premium nav sidebar ── */}
      <aside className="ph-sidebar">
        <div className="ph-logo">Dam<span>Cash</span></div>

        <nav className="ph-nav" role="navigation" aria-label="Navigation principale">
          {NAV_ITEMS.map((item, i) =>
            item === null
              ? <div key={`div-${i}`} className="ph-nav-divider" />
              : (
                <button
                  key={item.key}
                  className={`ph-nav-item${item.key === 'home' && isHome ? ' active' : ''}`}
                  onClick={item.onClick}
                  title={item.label}
                >
                  <span className="ph-nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              )
          )}
        </nav>

        {user && (
          <div className="ph-sidebar-wallet">
            <div className="ph-sidebar-wallet-label">Solde du portefeuille</div>
            <div className="ph-sidebar-wallet-amount">${Number(user.walletBalance).toFixed(2)}</div>
            <button className="ph-sidebar-wallet-btn" onClick={onOpenWallet}>+ Déposer</button>
          </div>
        )}
      </aside>

      {/* ── Main content ── */}
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

        {/* ── Quick tab ── */}
        {activeTab === 'quick' && (
          <div className="ph-quick-content">

            {/* Hero */}
            <section className="ph-hero" aria-label="Bannière principale">
              <div className="ph-hero-copy">
                <div className="ph-hero-kicker">DamCash — Saison actuelle</div>
                <h1 className="ph-hero-title">SAISON DES CHAMPIONS</h1>
                <p className="ph-hero-sub">
                  Jouez aux échecs et au jeu de dames, montez dans le classement,
                  participez aux tournois et suivez les parties en direct.
                </p>
                <div className="ph-hero-actions">
                  <button className="ph-hero-btn-primary" onClick={() => navigate(`/${universe}/tournaments`)}>
                    Tournois
                  </button>
                  <button className="ph-hero-btn-secondary" onClick={() => setShowCustom(true)}>
                    Partie personnalisée
                  </button>
                </div>
              </div>
              <div className="ph-hero-art" aria-hidden="true">
                <div className="ph-trophy">🏆</div>
              </div>
            </section>

            {/* Dashboard 2-col grid */}
            <div className="ph-grid">

              {/* ── Left column ── */}
              <div className="ph-col-main">

                {/* Game cards */}
                <div className="ph-game-cards">
                  <div
                    className="ph-game-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => { setUniverse('checkers'); onCreateGame('5+0', 'online'); }}
                    onKeyDown={e => e.key === 'Enter' && (setUniverse('checkers'), onCreateGame('5+0', 'online'))}
                  >
                    <div className="ph-game-card-icon">⚫</div>
                    <span className="ph-game-card-name">Jeu de dames</span>
                    <span className="ph-game-card-desc">Tactiques rapides et finales nettes.</span>
                    <div className="ph-game-card-btn">Jouer maintenant →</div>
                  </div>
                  <div
                    className="ph-game-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => { setUniverse('chess'); onCreateGame('5+0', 'online'); }}
                    onKeyDown={e => e.key === 'Enter' && (setUniverse('chess'), onCreateGame('5+0', 'online'))}
                  >
                    <div className="ph-game-card-icon">♟</div>
                    <span className="ph-game-card-name">Jeu d'échecs</span>
                    <span className="ph-game-card-desc">Stratégie, calcul, victoire.</span>
                    <div className="ph-game-card-btn">Jouer maintenant →</div>
                  </div>
                </div>

                {/* Shortcuts */}
                <div className="ph-shortcuts">
                  {SHORTCUTS.map(s => (
                    <button key={s.key} className="ph-shortcut" onClick={() => handleShortcut(s.action)}>
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
                      <div key={a.id} className="ph-activity-item">
                        <div className={`ph-activity-dot ${a.type}`}>
                          {a.type === 'win' ? '✓' : a.type === 'loss' ? '✗' : '🏆'}
                        </div>
                        <div className="ph-activity-text">
                          <div className="ph-activity-title">
                            {a.type === 'tournament'
                              ? (a as typeof MOCK_ACTIVITY[1]).name
                              : `vs ${(a as typeof MOCK_ACTIVITY[0]).opponent} · ${(a as typeof MOCK_ACTIVITY[0]).game}`}
                          </div>
                          <div className="ph-activity-meta">{a.time}</div>
                        </div>
                        <div className={`ph-activity-result ${a.type}`}>
                          {a.type === 'tournament'
                            ? (a as typeof MOCK_ACTIVITY[1]).reward
                            : (a as typeof MOCK_ACTIVITY[0]).result}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick pairing */}
                <div className="ph-card">
                  <div className="ph-card-head">
                    <div className="ph-card-title">Appariement rapide</div>
                    <button className="ph-card-link" onClick={() => setActiveTab('lobby')}>Lobby →</button>
                  </div>
                  <div className="ph-pairing-grid">
                    {Object.entries(grouped).map(([cat, tcs]) => (
                      <React.Fragment key={cat}>
                        <div className="ph-cat-label">
                          <span className="ph-cat-dot" />
                          {cat}
                        </div>
                        {tcs.map(({ value, label }) => (
                          <div
                            key={value}
                            className="ph-time-card"
                            role="button"
                            tabIndex={0}
                            onClick={() => { setActiveTab('lobby'); onCreateGame(value, 'online'); }}
                            onKeyDown={e => e.key === 'Enter' && (setActiveTab('lobby'), onCreateGame(value, 'online'))}
                          >
                            <div className="ph-time-value">{label}</div>
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
              </div>

              {/* ── Right column ── */}
              <aside className="ph-col-aside">

                {/* Leaderboard */}
                <div className="ph-card">
                  <div className="ph-card-head">
                    <div className="ph-card-title">Classement</div>
                    <button className="ph-card-link" onClick={() => navigate(`/${universe}/leaderboard`)}>
                      Voir tout →
                    </button>
                  </div>
                  {leaderboardLoading ? (
                    Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="ph-skel" style={{ height: 28, marginBottom: 6 }} />
                    ))
                  ) : leaderboard.length === 0 ? (
                    <div style={{ color: '#8A7A6A', fontSize: 12, padding: '4px 0' }}>
                      Aucun joueur classé
                    </div>
                  ) : leaderboard.map(entry => (
                    <div key={entry.rank} className="ph-lb-row">
                      <span className={`ph-lb-rank${entry.rank === 1 ? ' gold' : entry.rank === 2 ? ' silver' : entry.rank === 3 ? ' bronze' : ''}`}>
                        {entry.rank}
                      </span>
                      {entry.country && (
                        <span className="ph-lb-flag" title={countryName(entry.country)}>
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
                          className="ph-lb-name"
                          onClick={() => navigate(`/${universe}/profile/${encodeURIComponent(entry.name)}`)}
                        >
                          {entry.name}
                        </span>
                      </PlayerHoverCard>
                      <span className="ph-lb-rating">{entry.rating}</span>
                    </div>
                  ))}
                </div>

                {/* Quote */}
                <div className="ph-quote">
                  <span className="ph-quote-mark">"</span>
                  <p className="ph-quote-text">
                    Chaque mouvement compte. Chaque décision façonne le champion que tu deviendras.
                  </p>
                  <div className="ph-quote-attr">DamCash</div>
                </div>

                {/* Upcoming tournaments */}
                <div className="ph-card">
                  <div className="ph-card-head">
                    <div className="ph-card-title">Tournois à venir</div>
                    <button className="ph-card-link" onClick={() => navigate(`/${universe}/tournaments`)}>
                      Voir tout →
                    </button>
                  </div>
                  {MOCK_TOURNAMENTS.map(t => (
                    <div
                      key={t.id}
                      className="ph-tourn-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/${universe}/tournaments`)}
                    >
                      <div className="ph-tourn-badge">🏆</div>
                      <div className="ph-tourn-info">
                        <div className="ph-tourn-name">{t.name}</div>
                        <div className="ph-tourn-meta">{t.time} · {t.players} joueurs</div>
                      </div>
                      <div className="ph-tourn-prize">{t.prize}</div>
                    </div>
                  ))}
                </div>

              </aside>
            </div>
          </div>
        )}

        {/* ── Lobby tab ── */}
        {activeTab === 'lobby' && (
          <div className="tab-content-enter">
            <LobbyTab
              onMatchFound={(roomId, myColor) => navigate(`/${universe}/game/${roomId}?color=${myColor}`)}
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
