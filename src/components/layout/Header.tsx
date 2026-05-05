import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useUniverseStore, useUserStore } from '../../stores';
import { PlayerSearchBar } from '../invite/PlayerSearchBar';
import { OnlinePlayer } from '../../stores/inviteStore';
import { NotificationCenter } from '../common/NotificationCenter';
import { getSoundEnabled, toggleSoundGlobal } from '../../hooks/useSound';
import '../../styles/nav-dropdown.css';

interface Props {
  onOpenWallet: () => void;
  onOpenAuth: () => void;
  onInvitePlayer: (player: OnlinePlayer) => void;
  onOpenCreateGame: () => void;
}

const LANGUAGES = [
  { code: 'en', flag: '🇬🇧' },
  { code: 'fr', flag: '🇫🇷' },
  { code: 'ru', flag: '🇷🇺' },
  { code: 'nl', flag: '🇳🇱' },
  { code: 'zh', flag: '🇨🇳' },
];

// ── Nav menu definitions ───────────────────────────────────────────────────────

interface NavItem {
  icon: string;
  labelKey: string;
  descKey: string;
  path?: string;
  action?: string;
}

interface NavSection {
  titleKey?: string;
  items: NavItem[];
}

interface NavMenu {
  key: string;
  labelKey: string;
  sections: NavSection[];
}

const CHESS_MENUS: NavMenu[] = [
  {
    key: 'watch',
    labelKey: 'nav.watch',
    sections: [
      {
        items: [
          { icon: '📺', labelKey: 'menu.liveGames',       descKey: 'menu.descWatchLive',        path: '/chess' },
          { icon: '🏆', labelKey: 'lobby.tournaments',    descKey: 'menu.descTournaments',      path: '/chess/tournaments' },
          { icon: '📡', labelKey: 'lobby.streamers',      descKey: 'menu.descStreamers',        path: '/chess/coming-soon/streamers' },
          { icon: '🎬', labelKey: 'menu.gameOfDay',       descKey: 'menu.descGameOfDay',        path: '/chess/coming-soon/game-of-the-day' },
          { icon: '📼', labelKey: 'menu.broadcasts',      descKey: 'menu.descBroadcasts',       path: '/chess/coming-soon/broadcasts' },
        ],
      },
    ],
  },
  {
    key: 'community',
    labelKey: 'nav.community',
    sections: [
      {
        titleKey: 'menu.connect',
        items: [
          { icon: '👥', labelKey: 'tournament.players',   descKey: 'menu.descPlayers',          path: '/chess/leaderboard' },
          { icon: '🏘️', labelKey: 'menu.teams',           descKey: 'menu.descTeams',            path: '/chess/coming-soon/teams' },
          { icon: '💬', labelKey: 'menu.forum',           descKey: 'menu.descForum',            path: '/chess/coming-soon/forum' },
          { icon: '📰', labelKey: 'menu.blog',            descKey: 'menu.descBlog',             path: '/chess/coming-soon/blog' },
        ],
      },
      {
        titleKey: 'menu.events',
        items: [
          { icon: '🏅', labelKey: 'menu.simuls',          descKey: 'menu.descSimuls',           path: '/chess/coming-soon/simuls' },
          { icon: '📊', labelKey: 'lobby.leaderboard',    descKey: 'menu.descLeaderboard',      path: '/chess/leaderboard' },
        ],
      },
    ],
  },
  {
    key: 'tools',
    labelKey: 'nav.tools',
    sections: [
      {
        titleKey: 'menu.analysis',
        items: [
          { icon: '🔬', labelKey: 'menu.analysisBoard',   descKey: 'menu.descAnalysisBoard',   path: '/chess/analysis' },
          { icon: '📚', labelKey: 'menu.openingExplorer', descKey: 'menu.descOpeningExplorer', path: '/chess/opening-explorer' },
          { icon: '🏗️', labelKey: 'menu.boardEditor',     descKey: 'menu.descBoardEditor',     path: '/chess/board-editor' },
          { icon: '⚙️', labelKey: 'menu.gameImporter',    descKey: 'menu.descGameImporter',    path: '/chess/import' },
        ],
      },
      {
        titleKey: 'menu.training',
        items: [
          { icon: '🧩', labelKey: 'menu.puzzles',         descKey: 'menu.descPuzzles',         path: '/chess/puzzles' },
          { icon: '🔢', labelKey: 'menu.puzzleStreak',    descKey: 'menu.descPuzzleStreak',    path: '/chess/puzzle-streak' },
          { icon: '🕐', labelKey: 'menu.puzzleStorm',     descKey: 'menu.descPuzzleStorm',     path: '/chess/puzzle-storm' },
        ],
      },
    ],
  },
  {
    key: 'learn',
    labelKey: 'nav.learn',
    sections: [
      {
        titleKey: 'menu.courses',
        items: [
          { icon: '📖', labelKey: 'menu.chessBasics',     descKey: 'menu.descChessBasics',     path: '/chess/coming-soon/chess-basics' },
          { icon: '🎓', labelKey: 'menu.practice',        descKey: 'menu.descPractice',        path: '/chess/play/computer/5+0' },
          { icon: '📝', labelKey: 'menu.coordinates',     descKey: 'menu.descCoordinates',     path: '/chess/coordinates' },
        ],
      },
      {
        titleKey: 'menu.study',
        items: [
          { icon: '🗂️', labelKey: 'menu.myStudies',       descKey: 'menu.descMyStudies',       path: '/chess/my-studies' },
          { icon: '📡', labelKey: 'menu.allStudies',       descKey: 'menu.descAllStudies',      path: '/chess/coming-soon/all-studies' },
          { icon: '👨‍💻', labelKey: 'menu.endgameTraining', descKey: 'menu.descEndgameTraining', path: '/chess/endgame-training' },
        ],
      },
    ],
  },
];

const CHECKERS_MENUS: NavMenu[] = [
  {
    key: 'watch',
    labelKey: 'nav.watch',
    sections: [
      {
        items: [
          { icon: '📺', labelKey: 'menu.liveGames',              descKey: 'menu.descWatchLiveCheckers',    path: '/checkers' },
          { icon: '🏆', labelKey: 'lobby.tournaments',           descKey: 'menu.descTournaments',          path: '/checkers/tournaments' },
          { icon: '🏅', labelKey: 'menu.frisianChampionship',    descKey: 'menu.descFrisianChampionship',  path: '/checkers/coming-soon/frisian-championship' },
          { icon: '📼', labelKey: 'menu.broadcasts',             descKey: 'menu.descBroadcastsCheckers',  path: '/checkers/coming-soon/broadcasts' },
        ],
      },
    ],
  },
  {
    key: 'community',
    labelKey: 'nav.community',
    sections: [
      {
        titleKey: 'menu.connect',
        items: [
          { icon: '👥', labelKey: 'tournament.players',          descKey: 'menu.descPlayersCheckers',      path: '/checkers/leaderboard' },
          { icon: '🏘️', labelKey: 'menu.clubs',                  descKey: 'menu.descClubs',                path: '/checkers/coming-soon/teams' },
          { icon: '💬', labelKey: 'menu.forum',                  descKey: 'menu.descForumCheckers',        path: '/checkers/coming-soon/forum' },
        ],
      },
      {
        titleKey: 'menu.events',
        items: [
          { icon: '📊', labelKey: 'lobby.leaderboard',           descKey: 'menu.descLeaderboardCheckers', path: '/checkers/leaderboard' },
          { icon: '🌍', labelKey: 'menu.worldRankings',          descKey: 'menu.descWorldRankings',        path: '/checkers/coming-soon/world-rankings' },
        ],
      },
    ],
  },
  {
    key: 'tools',
    labelKey: 'nav.tools',
    sections: [
      {
        titleKey: 'menu.analysis',
        items: [
          { icon: '🔬', labelKey: 'menu.analysisBoard',          descKey: 'menu.descAnalysisBoardCheckers', path: '/checkers/analysis' },
          { icon: '🏗️', labelKey: 'menu.boardEditor',            descKey: 'menu.descBoardEditorCheckers',  path: '/checkers/board-editor' },
          { icon: '⚙️', labelKey: 'menu.pdnImporter',            descKey: 'menu.descPdnImporter',          path: '/checkers/import' },
        ],
      },
      {
        titleKey: 'menu.training',
        items: [
          { icon: '🧩', labelKey: 'menu.draughtsPuzzles',        descKey: 'menu.descDraughtsPuzzles',      path: '/checkers/puzzles' },
          { icon: '🎯', labelKey: 'menu.endgameTrainer',         descKey: 'menu.descEndgameTrainer',       path: '/checkers/endgame-training' },
        ],
      },
    ],
  },
  {
    key: 'learn',
    labelKey: 'nav.learn',
    sections: [
      {
        titleKey: 'menu.gettingStarted',
        items: [
          { icon: '📖', labelKey: 'menu.draughtsRules',          descKey: 'menu.descDraughtsRules',        path: '/checkers/coming-soon/draughts-rules' },
          { icon: '🎓', labelKey: 'menu.practiceMode',           descKey: 'menu.descPracticeMode',         path: '/checkers/play/computer/5+0' },
        ],
      },
      {
        titleKey: 'menu.strategy',
        items: [
          { icon: '🗂️', labelKey: 'menu.openingTheory',          descKey: 'menu.descOpeningTheory',        path: '/checkers/opening-explorer' },
          { icon: '📝', labelKey: 'menu.tacticsGuide',           descKey: 'menu.descTacticsGuide',         path: '/checkers/coming-soon/tactics-guide' },
        ],
      },
    ],
  },
];

// ── Dropdown component ─────────────────────────────────────────────────────────

const NavDropdown: React.FC<{
  menu: NavMenu;
  activeKey: string | null;
  onOpen: (key: string) => void;
  onClose: () => void;
  navigate: (path: string) => void;
}> = ({ menu, activeKey, onOpen, onClose, navigate }) => {
  const { t } = useTranslation();
  const isOpen = activeKey === menu.key;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  return (
    <div className="nav-dropdown-wrap" ref={ref}>
      <button
        className={`nav-btn ${isOpen ? 'active' : ''}`}
        onClick={() => isOpen ? onClose() : onOpen(menu.key)}
      >
        {t(menu.labelKey)}
        <span className={`nav-chevron ${isOpen ? 'open' : ''}`}>›</span>
      </button>

      {isOpen && (
        <div className={`nav-dropdown-panel ${menu.sections.length > 1 ? 'wide' : ''}`}>
          {menu.sections.map((section, si) => (
            <div key={si} className="nav-dropdown-section">
              {section.titleKey && (
                <div className="nav-section-title">{t(section.titleKey)}</div>
              )}
              {section.items.map((item, ii) => (
                <button
                  key={ii}
                  className="nav-dropdown-item"
                  onClick={() => {
                    if (item.path) navigate(item.path);
                    onClose();
                  }}
                >
                  <span className="nav-item-icon">{item.icon}</span>
                  <span className="nav-item-text">
                    <span className="nav-item-label">{t(item.labelKey)}</span>
                    <span className="nav-item-desc">{t(item.descKey)}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Hamburger Menu ─────────────────────────────────────────────────────────────

const HamburgerMenu: React.FC<{
  menus: NavMenu[];
  universe: 'chess' | 'checkers';
  onUniverseSwitch: (u: 'chess' | 'checkers') => void;
  soundOn: boolean;
  onToggleSound: () => void;
  i18n: any;
  t: any;
  navigate: (path: string) => void;
  onClose: () => void;
  onLogout?: () => void;
}> = ({ menus, universe, onUniverseSwitch, soundOn, onToggleSound, i18n, t, navigate, onClose, onLogout }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const go = (path: string) => { navigate(path); onClose(); };

  return (
    <div className="hamburger-panel" ref={ref}>
      {/* Universe switch */}
      <div className="hamburger-section">
        <div className="hamburger-section-title">{t('menu.universe')}</div>
        <div className="hamburger-universe-row">
          <button
            className={`hamburger-universe-btn ${universe === 'chess' ? 'active' : ''}`}
            onClick={() => { onUniverseSwitch('chess'); onClose(); }}
          >
            ♟ {t('profile.chess')}
          </button>
          <button
            className={`hamburger-universe-btn ${universe === 'checkers' ? 'active' : ''}`}
            onClick={() => { onUniverseSwitch('checkers'); onClose(); }}
          >
            ⬤ {t('profile.checkers')}
          </button>
        </div>
      </div>

      {/* Nav menus */}
      {menus.map(menu => (
        <div key={menu.key} className="hamburger-section">
          <div className="hamburger-section-title">{t(menu.labelKey)}</div>
          {menu.sections.map((section, si) =>
            section.items.map((item, ii) => (
              <button
                key={`${si}-${ii}`}
                className="hamburger-nav-item"
                onClick={() => go(item.path || `/${universe}`)}
              >
                <span>{item.icon}</span>
                <span>{t(item.labelKey)}</span>
              </button>
            ))
          )}
        </div>
      ))}

      {/* Settings */}
      <div className="hamburger-section">
        <div className="hamburger-section-title">{t('menu.settings')}</div>
        <div className="hamburger-settings-row">
          <button className="hamburger-setting-btn" onClick={() => { onToggleSound(); }}>
            {soundOn ? `🔊 ${t('menu.soundOn')}` : `🔇 ${t('menu.soundOff')}`}
          </button>
          <div className="lang-switcher">
            <div className="lang-switcher-label">{t('menu.language')}</div>
            <div className="lang-pill-grid">
              {LANGUAGES.map(({ code, flag }) => {
                const active = i18n.language.split('-')[0] === code;
                return (
                  <button
                    key={code}
                    className={`lang-pill${active ? ' active' : ''}`}
                    onClick={() => i18n.changeLanguage(code)}
                    title={t(`languages.${code}`)}
                  >
                    <span className="lang-pill-flag">{flag}</span>
                    <span className="lang-pill-code">{code.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Logout */}
      {onLogout && (
        <div className="hamburger-section">
          <button
            className="hamburger-nav-item"
            onClick={() => { onLogout(); onClose(); }}
            style={{ color: '#ef4444', fontWeight: 700 }}
          >
            <span>🚪</span>
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
};

// ── Main Header ────────────────────────────────────────────────────────────────

export const Header: React.FC<Props> = ({ onOpenWallet, onOpenAuth, onInvitePlayer, onOpenCreateGame }) => {
  const { t, i18n } = useTranslation();
  const { universe, toggleUniverse } = useUniverseStore();
  const { user, isLoggedIn, logout, lastRatingChange } = useUserStore();
  const navigate = useNavigate();
  const [soundOn, setSoundOn] = useState(() => getSoundEnabled());
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  const menus = universe === 'chess' ? CHESS_MENUS : CHECKERS_MENUS;

  const handleUniverseSwitch = useCallback((target: 'chess' | 'checkers') => {
    if (universe === target) return;
    toggleUniverse();
    document.body.className = `${target}-universe`;
    navigate(`/${target}`);
  }, [universe, toggleUniverse, navigate]);

  const handleInviteOrCode = (player: OnlinePlayer) => {
    if (player.socketId === '__code__') {
      onOpenCreateGame();
    } else {
      onInvitePlayer(player);
    }
  };

  return (
    <header className="header">
      <div className="header-inner">
        {/* Logo */}
        <a className="logo" onClick={() => navigate(`/${universe}`)} style={{ cursor: 'pointer' }}>
          <img src="/logo.svg" alt="DamCash" style={{ width: 42, height: 42, borderRadius: 10, display: 'block', flexShrink: 0 }} />
          <span className="logo-wordmark">
            <span className="logo-dam">DAM</span><span className="logo-cash">CASH</span>
          </span>
        </a>

        {/* Right side */}
        <div className="header-right">
          <div className="header-search-wrap">
            <PlayerSearchBar onInvite={handleInviteOrCode} />
          </div>

          <button
            className="btn btn-secondary btn-sm header-play-wrap"
            onClick={onOpenCreateGame}
            title={t('header.createRoomTitle')}
            style={{ whiteSpace: 'nowrap' }}
          >
            🔗 Play
          </button>

          {/* Notification center */}
          <NotificationCenter />

          {/* Wallet / Auth */}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="wallet-display" onClick={onOpenWallet}>
                <span className="wallet-icon">💰</span>
                <span className="wallet-amount">${Number(user.walletBalance).toFixed(2)}</span>
              </button>
              {isLoggedIn && (
                <button
                  className="header-avatar-btn"
                  onClick={() => navigate(`/${universe}/profile/${encodeURIComponent(user.name)}`)}
                  title={t('header.profileTitle', { name: user.name })}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '4px 8px', minWidth: 48 }}
                >
                  <span className="header-avatar-letter">{user.name[0]?.toUpperCase()}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1 }}>
                    {user.rating[universe]}
                    {lastRatingChange && lastRatingChange.universe === universe && Date.now() - lastRatingChange.playedAt < 120_000 && (
                      <span style={{
                        marginLeft: 3, fontWeight: 800,
                        color: lastRatingChange.delta >= 0 ? '#22c55e' : '#ef4444',
                      }}>
                        {lastRatingChange.delta >= 0 ? '+' : ''}{lastRatingChange.delta}
                      </span>
                    )}
                  </span>
                </button>
              )}
            </div>
          ) : (
            <>
              <button className="btn-signin"   onClick={onOpenAuth}>{t('nav.signIn')}</button>
              <button className="btn-register" onClick={onOpenAuth}>{t('nav.register')}</button>
            </>
          )}

          {/* Hamburger — contains nav, universe switch, language, sound */}
          <div style={{ position: 'relative' }}>
            <button
              className={`hamburger-btn ${hamburgerOpen ? 'active' : ''}`}
              onClick={() => setHamburgerOpen(o => !o)}
              aria-label="Menu"
            >
              <span className="hamburger-line" />
              <span className="hamburger-line" />
              <span className="hamburger-line" />
            </button>

            {hamburgerOpen && (
              <HamburgerMenu
                menus={menus}
                universe={universe}
                onUniverseSwitch={handleUniverseSwitch}
                soundOn={soundOn}
                onToggleSound={() => { const next = toggleSoundGlobal(); setSoundOn(next); }}
                i18n={i18n}
                t={t}
                navigate={navigate}
                onClose={() => setHamburgerOpen(false)}
                onLogout={user ? () => { logout(); navigate('/'); } : undefined}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
