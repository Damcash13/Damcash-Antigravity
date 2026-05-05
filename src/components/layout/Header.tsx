import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useUniverseStore, useUserStore } from '../../stores';
import { PlayerSearchBar } from '../invite/PlayerSearchBar';
import { OnlinePlayer } from '../../stores/inviteStore';
import { getSoundEnabled, toggleSoundGlobal } from '../../hooks/useSound';
import { useDirectMessageStore } from '../../stores/directMessageStore';
import '../../styles/nav-dropdown.css';

interface Props {
  onOpenWallet: () => void;
  onOpenAuth: () => void;
  onInvitePlayer: (player: OnlinePlayer) => void;
  onOpenCreateGame: () => void;
}

const LANGUAGES = [
  { code: 'en' },
  { code: 'fr' },
  { code: 'ru' },
  { code: 'nl' },
  { code: 'zh' },
];

const OWNER_ADMIN_EMAIL = 'yves.ahipo@gmail.com';

// ── Nav menu definitions ───────────────────────────────────────────────────────

interface NavItem {
  label: string;
  path?: string;
  action?: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

interface NavMenu {
  key: string;
  label: string;
  sections: NavSection[];
}

const buildMenus = (universe: 'chess' | 'checkers'): NavMenu[] => [
  {
    key: 'play',
    label: 'Play',
    sections: [
      {
        items: [
          { label: 'Quick game', action: 'quickGame' },
          { label: 'Challenge a friend', action: 'challengeFriend' },
          { label: 'Play computer', path: `/${universe}/play/computer/5+0` },
          { label: 'Tournaments', path: `/${universe}/tournaments` },
        ],
      },
    ],
  },
  {
    key: 'watch',
    label: 'Watch',
    sections: [
      {
        items: [
          { label: 'Live games', path: `/${universe}` },
          { label: 'Leaderboard', path: `/${universe}/leaderboard` },
        ],
      },
    ],
  },
  {
    key: 'account',
    label: 'Account',
    sections: [
      {
        items: [
          { label: 'Profile', action: 'profile' },
          { label: 'Wallet', action: 'wallet' },
          { label: 'Messages', action: 'messages' },
          { label: 'Friends', path: `/${universe}` },
        ],
      },
    ],
  },
  {
    key: 'tools',
    label: 'Tools',
    sections: [
      {
        items: [
          { label: 'Analysis board', path: `/${universe}/analysis` },
          { label: 'Board editor', path: `/${universe}/board-editor` },
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
        {menu.label}
      </button>

      {isOpen && (
        <div className={`nav-dropdown-panel ${menu.sections.length > 1 ? 'wide' : ''}`}>
          {menu.sections.map((section, si) => (
            <div key={si} className="nav-dropdown-section">
              {section.title && (
                <div className="nav-section-title">{section.title}</div>
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
                  <span className="nav-item-text">
                    <span className="nav-item-label">{item.label}</span>
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
  showAdminTools?: boolean;
  user: ReturnType<typeof useUserStore.getState>['user'];
  onOpenAuth: () => void;
  onOpenWallet: () => void;
  onOpenMessages: () => void;
  onOpenCreateGame: () => void;
}> = ({
  menus,
  universe,
  onUniverseSwitch,
  soundOn,
  onToggleSound,
  i18n,
  t,
  navigate,
  onClose,
  onLogout,
  showAdminTools,
  user,
  onOpenAuth,
  onOpenWallet,
  onOpenMessages,
  onOpenCreateGame,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const go = (path: string) => { navigate(path); onClose(); };
  const runAction = (action?: string) => {
    if (!action) return;
    if (action === 'quickGame' || action === 'challengeFriend') {
      onOpenCreateGame();
    } else if (action === 'wallet') {
      user ? onOpenWallet() : onOpenAuth();
    } else if (action === 'messages') {
      user ? onOpenMessages() : onOpenAuth();
    } else if (action === 'profile') {
      user ? navigate(`/${universe}/profile/${encodeURIComponent(user.name)}`) : onOpenAuth();
    }
    onClose();
  };

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
            {t('profile.chess')}
          </button>
          <button
            className={`hamburger-universe-btn ${universe === 'checkers' ? 'active' : ''}`}
            onClick={() => { onUniverseSwitch('checkers'); onClose(); }}
          >
            {t('profile.checkers')}
          </button>
        </div>
      </div>

      {/* Nav menus */}
      {menus.map(menu => (
        <div key={menu.key} className="hamburger-section">
          <div className="hamburger-section-title">{menu.label}</div>
          {menu.sections.map((section, si) =>
            section.items.map((item, ii) => (
              <button
                key={`${si}-${ii}`}
                className="hamburger-nav-item"
                onClick={() => item.action ? runAction(item.action) : go(item.path || `/${universe}`)}
              >
                <span>{item.label}</span>
              </button>
            ))
          )}
        </div>
      ))}

      {showAdminTools && (
        <div className="hamburger-section">
          <div className="hamburger-section-title">Owner</div>
          <button className="hamburger-nav-item" onClick={() => go(`/${universe}/admin`)}>
            <span>Admin Dashboard</span>
          </button>
        </div>
      )}

      {/* Settings */}
      <div className="hamburger-section">
        <div className="hamburger-section-title">{t('menu.settings')}</div>
        <div className="hamburger-settings-row">
          <button className="hamburger-setting-btn" onClick={() => { onToggleSound(); }}>
            {soundOn ? t('menu.soundOn') : t('menu.soundOff')}
          </button>
          <div className="lang-switcher">
            <div className="lang-switcher-label">{t('menu.language')}</div>
            <div className="lang-pill-grid">
              {LANGUAGES.map(({ code }) => {
                const active = i18n.language.split('-')[0] === code;
                return (
                  <button
                    key={code}
                    className={`lang-pill${active ? ' active' : ''}`}
                    onClick={() => i18n.changeLanguage(code)}
                    title={t(`languages.${code}`)}
                  >
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
  const openMessages = useDirectMessageStore(s => s.openInbox);
  const navigate = useNavigate();
  const [soundOn, setSoundOn] = useState(() => getSoundEnabled());
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  const menus = buildMenus(universe);
  const showAdminTools = user?.email?.toLowerCase() === OWNER_ADMIN_EMAIL;

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
          <img src="/logo.svg" alt="DamCash" className="logo-mark" />
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
            Play
          </button>

          {/* Wallet / Auth */}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="wallet-display" onClick={onOpenWallet}>
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
              <span className="header-menu-label">Menu</span>
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
                showAdminTools={showAdminTools}
                user={user}
                onOpenAuth={onOpenAuth}
                onOpenWallet={onOpenWallet}
                onOpenMessages={openMessages}
                onOpenCreateGame={onOpenCreateGame}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
