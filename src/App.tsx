import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, Navigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { SearchingOverlay } from './components/lobby/SearchingOverlay';
import { AuthModal } from './components/common/AuthModal';
import { WalletModal } from './components/common/WalletModal';
import { Notifications } from './components/common/Notifications';
import { GameConfigModal } from './components/invite/GameConfigModal';
import { IncomingInviteToast } from './components/invite/IncomingInviteToast';
import { useUniverseStore, useUserStore, useNotificationStore } from './stores';
import { useInviteStore, OnlinePlayer } from './stores/inviteStore';
import { useFriendsStore } from './stores/friendsStore';
import { useRatingUpdates } from './hooks/useRatingUpdates';
import { clientId, socket } from './lib/socket';
import { api, ApiActiveGame } from './lib/api';
import { supabase, withTimeout } from './lib/supabase';
import { useSafetyStore } from './stores/safetyStore';
import { useDirectMessageStore } from './stores/directMessageStore';
import { useNotifCenterStore } from './stores/notifCenterStore';
import { DirectMessagesModal } from './components/messages/DirectMessagesModal';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';

const HOME_LANGUAGES = ['en', 'fr', 'ru', 'nl', 'zh'] as const;

// Lazy load pages
const PremiumHomePage = lazy(() => import('./components/lobby/PremiumHomePage').then(m => ({ default: m.PremiumHomePage })));
const HomePage = lazy(() => import('./components/lobby/HomePage').then(m => ({ default: m.HomePage })));
const ChessGame = lazy(() => import('./components/chess/ChessGame').then(m => ({ default: m.ChessGame })));
const DraughtsGame = lazy(() => import('./components/draughts/DraughtsGame').then(m => ({ default: m.DraughtsGame })));
const TournamentPage = lazy(() => import('./components/tournament/TournamentPage').then(m => ({ default: m.TournamentPage })));
const ProfilePage = lazy(() => import('./components/profile/ProfilePage').then(m => ({ default: m.ProfilePage })));
const LeaderboardPage = lazy(() => import('./components/leaderboard/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })));
const AnalysisBoard = lazy(() => import('./components/analysis/AnalysisBoard').then(m => ({ default: m.AnalysisBoard })));
const PuzzlesPage = lazy(() => import('./components/puzzles/PuzzlesPage').then(m => ({ default: m.PuzzlesPage })));
const PuzzleStreakPage = lazy(() => import('./components/puzzles/PuzzleStreakPage').then(m => ({ default: m.PuzzleStreakPage })));
const PuzzleStormPage = lazy(() => import('./components/puzzles/PuzzleStormPage').then(m => ({ default: m.PuzzleStormPage })));
const BoardEditorPage = lazy(() => import('./components/tools/BoardEditorPage').then(m => ({ default: m.BoardEditorPage })));
const GameReplayPage = lazy(() => import('./components/games/GameReplayPage').then(m => ({ default: m.GameReplayPage })));
const SpectateGame = lazy(() => import('./components/spectate/SpectateGame').then(m => ({ default: m.SpectateGame })));
const OpeningExplorerPage = lazy(() => import('./components/tools/OpeningExplorerPage').then(m => ({ default: m.OpeningExplorerPage })));
const MyStudiesPage = lazy(() => import('./components/tools/MyStudiesPage').then(m => ({ default: m.MyStudiesPage })));
const EndgameTrainingPage = lazy(() => import('./components/tools/EndgameTrainingPage').then(m => ({ default: m.EndgameTrainingPage })));
const CoordinatesPage = lazy(() => import('./components/tools/CoordinatesPage').then(m => ({ default: m.CoordinatesPage })));
const GameImporterPage = lazy(() => import('./components/tools/GameImporterPage').then(m => ({ default: m.GameImporterPage })));
const ComingSoonPage = lazy(() => import('./components/common/ComingSoonPage').then(m => ({ default: m.ComingSoonPage })));
const AdminSafetyPage = lazy(() => import('./components/admin/AdminSafetyPage').then(m => ({ default: m.AdminSafetyPage })));
const CorrespondenceGame = lazy(() => import('./components/correspondence/CorrespondenceGame').then(m => ({ default: m.CorrespondenceGame })));
const LegalPage = lazy(() => import('./components/common/LegalPage').then(m => ({ default: m.LegalPage })));

// ── Lobby wrapper ─────────────────────────────────────────────────────────────

const LobbyView: React.FC<{
  onCreateGame:    (tc: string, mode: 'online' | 'computer', color?: 'white' | 'black' | 'random') => void;
  onChallengeFriend: () => void;
  onPlayComputer:  () => void;
  onInvitePlayer:  (player: OnlinePlayer) => void;
  onChallengeFriendDirect: (socketId: string, name: string) => void;
  onOpenWallet:    () => void;
  onOpenAuth:      () => void;
  onOpenMessages:  () => void;
}> = ({ onCreateGame, onChallengeFriend, onPlayComputer, onInvitePlayer, onOpenWallet, onOpenAuth, onOpenMessages }) => {
  return (
    <PremiumHomePage
      onCreateGame={onCreateGame}
      onOpenWallet={onOpenWallet}
      onChallengeFriend={onChallengeFriend}
      onPlayComputer={onPlayComputer}
      onInvitePlayer={onInvitePlayer}
      onOpenAuth={onOpenAuth}
      onOpenMessages={onOpenMessages}
    />
  );
};

const PageFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const universe = useUniverseStore(s => s.universe);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(`/${universe}`);
  };

  return (
    <main className="main-content page-frame-premium">
      <div className="page-back-row">
        <button className="page-back-btn" onClick={handleBack}>Back</button>
      </div>
      {children}
    </main>
  );
};

function persistRejoinToken(data: any, color: 'w' | 'b') {
  const token = data?.rejoinToken || data?.token;
  const roomId = data?.roomId;
  const universe = data?.config?.universe;
  if (!token || !roomId || !universe) return;

  try {
    sessionStorage.setItem(
      universe === 'checkers' ? 'damcash_rejoin_draughts' : 'damcash_rejoin_chess',
      JSON.stringify({ roomId, token, color: color === 'w' ? 'white' : 'black' }),
    );
  } catch {}
}

function HomeLanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const activeLanguage = i18n.language.split('-')[0];

  return (
    <div
      aria-label={t('menu.language', 'Language')}
      style={{
        position: 'fixed',
        top: 14,
        right: 14,
        zIndex: 650,
        display: 'flex',
        gap: 4,
        padding: 4,
        border: '1px solid var(--border)',
        borderRadius: 999,
        background: 'rgba(12, 15, 20, 0.86)',
        backdropFilter: 'blur(14px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
      }}
    >
      {HOME_LANGUAGES.map(code => (
        <button
          key={code}
          type="button"
          onClick={() => i18n.changeLanguage(code)}
          title={t(`languages.${code}`, code.toUpperCase())}
          aria-pressed={activeLanguage === code}
          style={{
            minWidth: 34,
            minHeight: 28,
            border: 'none',
            borderRadius: 999,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 800,
            color: activeLanguage === code ? '#0b0d12' : 'var(--text-2)',
            background: activeLanguage === code ? 'var(--accent)' : 'transparent',
          }}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ── App component ─────────────────────────────────────────────────────────────

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHomePage = /^\/(chess|checkers)\/?$/.test(location.pathname);

  const user = useUserStore(s => s.user);
  const isLoggedIn = useUserStore(s => s.isLoggedIn);
  const restoreSession = useUserStore(s => s.restoreSession);
  const listenToAuthChanges = useUserStore(s => s.listenToAuthChanges);
  const setWalletBalance = useUserStore(s => s.setWalletBalance);
  const universe = useUniverseStore(s => s.universe);
  const setUniverse = useUniverseStore(s => s.setUniverse);

  const initPresence    = useInviteStore(s => s.initPresence);
  const setOnlinePlayers = useInviteStore(s => s.setOnlinePlayers);
  const openConfig      = useInviteStore(s => s.openConfig);
  const closeConfig     = useInviteStore(s => s.closeConfig);
  const configOpen      = useInviteStore(s => s.configOpen);
  const updatePresenceUniverse = useInviteStore(s => s.updatePresenceUniverse);
  const cleanupPresence = useInviteStore(s => s.cleanupPresence);

  const initFriends        = useFriendsStore(s => s.initialize);
  const syncOnlinePlayers  = useFriendsStore(s => s.syncOnlinePlayers);
  const setBlockedUsers    = useSafetyStore(s => s.setBlockedUsers);
  const setMessageUnreadCount = useDirectMessageStore(s => s.setUnreadCount);
  const bumpMessageUnreadCount = useDirectMessageStore(s => s.bumpUnreadCount);
  const openMessages = useDirectMessageStore(s => s.openInbox);
  const pushCenterNotification = useNotifCenterStore(s => s.push);

  const [showAuth, setShowAuth] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [searching, setSearching] = useState<{ tc: string; mode: string } | null>(null);
  const [activeGamePrompt, setActiveGamePrompt] = useState<ApiActiveGame | null>(null);
  const authRecoveryRef = useRef(false);

  useRatingUpdates();

  useEffect(() => {
    restoreSession();
    listenToAuthChanges();
    window.addEventListener('beforeunload', cleanupPresence);
    return () => {
      window.removeEventListener('beforeunload', cleanupPresence);
      cleanupPresence();
    };
  }, [cleanupPresence, listenToAuthChanges, restoreSession]);

  useEffect(() => {
    if (user?.id) {
      initPresence(user.name, user.rating ?? { chess: 1500, checkers: 1450 });
      initFriends();
      if (isLoggedIn) {
        api.safety.blocked({ suppressAuthEvent: true })
          .then(({ blockedUsers }) => setBlockedUsers(blockedUsers))
          .catch(() => {});
        api.messages.conversations({ suppressAuthEvent: true })
          .then(({ conversations }) => setMessageUnreadCount(conversations.reduce((sum, item) => sum + item.unreadCount, 0)))
          .catch(() => {});
      }
    }
  }, [user?.id, isLoggedIn, setBlockedUsers, setMessageUnreadCount]);

  useEffect(() => {
    if (!user?.id || !isLoggedIn) {
      setActiveGamePrompt(null);
      return;
    }
    const parts = location.pathname.split('/');
    const isGameRoute = parts.length >= 4 && (parts[1] === 'chess' || parts[1] === 'checkers') && parts[2] === 'game';
    if (isGameRoute) {
      setActiveGamePrompt(null);
      return;
    }

    let cancelled = false;
    api.me.activeGame({ suppressAuthEvent: true })
      .then(({ activeGame }) => {
        if (!cancelled) setActiveGamePrompt(activeGame);
      })
      .catch(() => {
        if (!cancelled) setActiveGamePrompt(null);
      });
    return () => { cancelled = true; };
  }, [user?.id, isLoggedIn, location.pathname]);

  useEffect(() => {
    const parts = location.pathname.split('/');
    if (parts[1] === 'chess' || parts[1] === 'checkers') {
      setUniverse(parts[1]);
    }
  }, [location.pathname, setUniverse]);

  useEffect(() => {
    document.body.classList.toggle('chess-universe', universe === 'chess');
    document.body.classList.toggle('checkers-universe', universe === 'checkers');
  }, [universe]);

  useEffect(() => {
    if (!user) return;
    updatePresenceUniverse(universe);
  }, [universe, updatePresenceUniverse, user]);

  useEffect(() => {
    const handlePlayersOnline = (list: OnlinePlayer[]) => {
      const currentName = user?.name?.trim().toLowerCase();
      const others = list.filter((p) => {
        if (p.socketId === socket.id) return false;
        if (p.userId && user?.id && p.userId === user.id) return false;
        if (p.clientId && p.clientId === clientId) return false;
        if (currentName && p.name.trim().toLowerCase() === currentName) return false;
        return true;
      });
      setOnlinePlayers(others);
      syncOnlinePlayers(others);
    };
    const handleRoomCreated = ({ roomId, universe: uv }: { roomId: string; universe: string }) => {
      // Don't navigate yet! Stay in the lobby with the searching overlay until game-start
      console.log(`[Lobby] Room created: ${roomId}, waiting for opponent...`);
    };
    const handleGameStart = (data: any) => {
      console.log('[Socket] Game-start received!', data);
      useNotificationStore.getState().addNotification('Game starting! Redirecting...', 'success');
      setSearching(null);
      // Use the explicit color from the server if provided, otherwise fall back to detection
      const color = data.color || (data.black === socket.id ? 'b' : 'w');
      persistRejoinToken(data, color);
      navigate(`/${data.config.universe}/game/${data.roomId}?color=${color}`, { state: data });
    };

    const handleRoomError = (data: any) => {
      useNotificationStore.getState().addNotification(data.message || 'Room error', 'error');
      setSearching(null);
    };

    const handleWalletUpdate = (data: { balance?: number | string; message?: string }) => {
      const balance = Number(data.balance);
      if (Number.isFinite(balance)) setWalletBalance(balance);
      if (data.message) useNotificationStore.getState().addNotification(data.message, 'info');
    };

    const handleDirectMessage = (data: { fromUsername: string; body: string }) => {
      bumpMessageUnreadCount();
      useNotificationStore.getState().addNotification(`New message from ${data.fromUsername}`, 'info');
      pushCenterNotification({
        type: 'system',
        icon: '',
        title: `Message from ${data.fromUsername}`,
        body: data.body,
      });
    };

    socket.on('players:online', handlePlayersOnline);
    socket.on('room:created', handleRoomCreated);
    socket.on('game-start', handleGameStart);
    socket.on('room:error', handleRoomError);
    socket.on('wallet:update', handleWalletUpdate);
    socket.on('direct-message:new', handleDirectMessage);

    const handleAuthUnauthorized = async () => {
      if (authRecoveryRef.current) return;
      authRecoveryRef.current = true;

      try {
        const restoreIfStillSignedIn = async () => {
          await restoreSession();
          const state = useUserStore.getState();
          return Boolean(state.user && state.isLoggedIn);
        };

        const { data: { session } } = await withTimeout<any>(
          supabase?.auth.getSession() ?? Promise.resolve({ data: { session: null } }),
          5_000,
          'Session check',
        );

        if (session?.access_token) {
          if (await restoreIfStillSignedIn()) return;
        }

        const { data, error } = await withTimeout<any>(
          supabase?.auth.refreshSession() ?? Promise.resolve({ data: { session: null }, error: null }),
          8_000,
          'Session refresh',
        );

        if (!error && data?.session?.access_token) {
          if (await restoreIfStillSignedIn()) return;
        }
      } catch (err) {
        console.warn('[auth] Could not verify session after unauthorized response; keeping local session:', err);
        useNotificationStore.getState().addNotification('Connection interrupted. Keeping you signed in while the session is checked again.', 'warning');
        return;
      } finally {
        authRecoveryRef.current = false;
      }

      useUserStore.getState().logout();
      useNotificationStore.getState().addNotification('Session expired. Please log in again.', 'warning');
      navigate('/');
      setShowAuth(true);
    };
    window.addEventListener('auth:unauthorized', handleAuthUnauthorized);

    return () => {
      window.removeEventListener('auth:unauthorized', handleAuthUnauthorized);
      socket.off('players:online', handlePlayersOnline);
      socket.off('room:created', handleRoomCreated);
      socket.off('game-start', handleGameStart);
      socket.off('room:error', handleRoomError);
      socket.off('wallet:update', handleWalletUpdate);
      socket.off('direct-message:new', handleDirectMessage);
    };
  }, [bumpMessageUnreadCount, navigate, pushCenterNotification, restoreSession, setOnlinePlayers, setWalletBalance, syncOnlinePlayers, user?.id, user?.name]);

  const handleCreateGame = (tc: string, mode: 'online' | 'computer', color: 'white' | 'black' | 'random' = 'random') => {
    if (!user) { setShowAuth(true); return; }
    if (mode === 'computer') {
      const colorParam = color === 'random' ? '' : `?color=${color}`;
      navigate(`/${universe}/play/computer/${tc}${colorParam}`);
    } else {
      if (!isLoggedIn) {
        setShowAuth(true);
        useNotificationStore.getState().addNotification('Please sign in to play rated online games.', 'warning');
        return;
      }
      setSearching({ tc, mode });
      socket.emit('seek', {
        timeControl: tc,
        universe,
        betAmount: 0,
        rated: true,
        publishAfterMs: 30_000,
        expireAfterMs: 10 * 60_000,
        source: 'quick',
      });
    }
  };

  const handleChallengeFriend = () => {
    if (!user) { setShowAuth(true); return; }
    openConfig();
  };

  const handleInvitePlayer = (player: OnlinePlayer) => {
    if (!user) { setShowAuth(true); return; }
    if (player.universe !== universe) {
      useNotificationStore.getState().addNotification(
        `${player.name} is active in ${player.universe === 'chess' ? 'Chess' : 'Checkers'}. Switch universes to challenge them.`,
        'warning',
      );
      return;
    }
    openConfig({ socketId: player.socketId, name: player.name, universe: player.universe, userId: player.userId, clientId: player.clientId });
  };

  const handleChallengeFriendDirect = (socketId: string, name: string) => {
    if (!user) { setShowAuth(true); return; }
    const target = useInviteStore.getState().onlinePlayers.find(p => p.socketId === socketId);
    if (!target || target.universe !== universe) {
      useNotificationStore.getState().addNotification(
        `${name} is not available in the ${universe === 'chess' ? 'Chess' : 'Checkers'} lobby right now.`,
        'warning',
      );
      return;
    }
    openConfig({ socketId, name, universe: target.universe, userId: target.userId, clientId: target.clientId });
  };

  return (
    <div className={`app-wrapper app-container ${universe}-universe`}>
      {!isHomePage && (
        <Header
          onOpenAuth={() => setShowAuth(true)}
          onOpenWallet={() => setShowWallet(true)}
          onInvitePlayer={handleInvitePlayer}
          onOpenCreateGame={() => openConfig()}
        />
      )}
      {isHomePage && <HomeLanguageSwitcher />}

      <div className={isHomePage ? 'ph-app-root' : 'main-layout'}>
        {activeGamePrompt && (
          <div style={{
            position: 'fixed',
            left: '50%',
            bottom: 18,
            transform: 'translateX(-50%)',
            zIndex: 700,
            width: 'min(520px, calc(100vw - 24px))',
            border: '1px solid var(--accent)',
            background: 'var(--bg-1)',
            boxShadow: 'var(--shadow)',
            borderRadius: 12,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, color: 'var(--text-1)', fontSize: 14 }}>Active game in progress</div>
              <div style={{ color: 'var(--text-2)', fontSize: 12, marginTop: 2 }}>
                {activeGamePrompt.universe === 'checkers' ? 'Checkers' : 'Chess'} · {activeGamePrompt.timeControl} · {activeGamePrompt.rated ? 'Rated' : 'Casual'}
                {activeGamePrompt.betAmount > 0 ? ` · $${activeGamePrompt.betAmount}` : ''}
                {activeGamePrompt.opponent?.name ? ` · vs ${activeGamePrompt.opponent.name}` : ''}
              </div>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                const color = activeGamePrompt.color === 'white' ? 'w' : 'b';
                if (activeGamePrompt.token) {
                  try {
                    sessionStorage.setItem(
                      activeGamePrompt.universe === 'checkers' ? 'damcash_rejoin_draughts' : 'damcash_rejoin_chess',
                      JSON.stringify({ roomId: activeGamePrompt.roomId, token: activeGamePrompt.token }),
                    );
                  } catch {}
                }
                navigate(`/${activeGamePrompt.universe}/game/${activeGamePrompt.roomId}?color=${color}`);
                setActiveGamePrompt(null);
              }}
            >
              Rejoin
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setActiveGamePrompt(null)}>
              Later
            </button>
          </div>
        )}
        {searching && (
          <SearchingOverlay
            timeControl={searching.tc}
            onOpenTable={() => setSearching(null)}
            onCancel={() => {
              setSearching(null);
              socket.emit('seek:cancel');
            }}
          />
        )}

        <Suspense fallback={<div className="spinner-overlay"><div className="spinner" /></div>}>
          <Routes>
            <Route path="/terms" element={<LegalPage />} />
            <Route path="/privacy" element={<LegalPage />} />
            <Route path="/" element={<Navigate to={`/${universe}`} replace />} />

            <Route path="/:universe" element={
              <LobbyView
                onCreateGame={handleCreateGame}
                onChallengeFriend={handleChallengeFriend}
                onPlayComputer={() => handleCreateGame('5+0', 'computer')}
                onInvitePlayer={handleInvitePlayer}
                onChallengeFriendDirect={handleChallengeFriendDirect}
                onOpenWallet={() => setShowWallet(true)}
                onOpenAuth={() => setShowAuth(true)}
                onOpenMessages={openMessages}
              />
            } />

            <Route path="/chess/game/:id"    element={<ProtectedRoute><main className="main-content"><AppErrorBoundary><ChessGame /></AppErrorBoundary></main></ProtectedRoute>} />
            <Route path="/checkers/game/:id" element={<ProtectedRoute><main className="main-content"><AppErrorBoundary><DraughtsGame /></AppErrorBoundary></main></ProtectedRoute>} />
            <Route path="/chess/play/:mode/:tc"    element={<GuestPlayableRoute><main className="main-content"><AppErrorBoundary><ChessGame /></AppErrorBoundary></main></GuestPlayableRoute>} />
            <Route path="/checkers/play/:mode/:tc" element={<GuestPlayableRoute><main className="main-content"><AppErrorBoundary><DraughtsGame /></AppErrorBoundary></main></GuestPlayableRoute>} />

            <Route path="/:universe/tournaments"     element={<ProtectedRoute><PageFrame><TournamentPage /></PageFrame></ProtectedRoute>} />
            <Route path="/:universe/tournament/:id" element={<ProtectedRoute><PageFrame><TournamentPage /></PageFrame></ProtectedRoute>} />
            <Route path="/:universe/correspondence/:id" element={<ProtectedRoute><PageFrame><CorrespondenceGame /></PageFrame></ProtectedRoute>} />

            <Route path="/:universe/profile/:name" element={<ProtectedRoute><PageFrame><ProfilePage /></PageFrame></ProtectedRoute>} />
            <Route path="/:universe/leaderboard"  element={<PageFrame><LeaderboardPage /></PageFrame>} />

            <Route path="/:universe/analysis" element={<PageFrame><AnalysisBoard /></PageFrame>} />
            <Route path="/:universe/board-editor" element={<PageFrame><BoardEditorPage /></PageFrame>} />
            <Route path="/:universe/opening-explorer" element={<PageFrame><OpeningExplorerPage /></PageFrame>} />
            <Route path="/:universe/my-studies" element={<ProtectedRoute><PageFrame><MyStudiesPage /></PageFrame></ProtectedRoute>} />
            <Route path="/:universe/endgame-training" element={<PageFrame><EndgameTrainingPage /></PageFrame>} />
            <Route path="/:universe/coordinates" element={<PageFrame><CoordinatesPage /></PageFrame>} />
            <Route path="/:universe/import" element={<PageFrame><GameImporterPage /></PageFrame>} />
            <Route path="/:universe/coming-soon/:feature" element={<PageFrame><ComingSoonPage /></PageFrame>} />
            <Route path="/:universe/admin" element={<AdminRoute><PageFrame><AdminSafetyPage /></PageFrame></AdminRoute>} />
            <Route path="/:universe/admin/safety" element={<AdminRoute><PageFrame><AdminSafetyPage /></PageFrame></AdminRoute>} />

            <Route path="/:universe/puzzles"        element={<PageFrame><PuzzlesPage /></PageFrame>} />
            <Route path="/:universe/puzzle-streak" element={<PageFrame><PuzzleStreakPage /></PageFrame>} />
            <Route path="/:universe/puzzle-storm"  element={<PageFrame><PuzzleStormPage /></PageFrame>} />

            <Route path="/:universe/watch/:id" element={<PageFrame><SpectateGame /></PageFrame>} />
            <Route path="/game/:id" element={<PageFrame><GameReplayPage /></PageFrame>} />
            <Route path="/join/:code" element={<JoinByCodeRedirect />} />
            <Route path="/wallet/success" element={<WalletReturn status="success" />} />
            <Route path="/wallet/cancel" element={<WalletReturn status="cancel" />} />

            <Route path="*" element={<Navigate to={`/${universe}`} replace />} />
          </Routes>
        </Suspense>
      </div>

      <AuthModal  open={showAuth}   onClose={() => setShowAuth(false)} />
      <WalletModal open={showWallet} onClose={() => setShowWallet(false)} />
      <GameConfigModal
        open={configOpen}
        onClose={closeConfig}
      />
      <DirectMessagesModal />
      <IncomingInviteToast />
      <Notifications />
    </div>
  );
}

function JoinByCodeRedirect() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    if (!code) return;
    const handleGameStart = (data: any) => {
      const color = data.color || (data.black === socket.id ? 'b' : 'w');
      persistRejoinToken(data, color);
      navigate(`/${data.config.universe}/game/${data.roomId}?color=${color}`, { state: data });
    };
    const handleError = () => navigate('/');
    socket.on('game-start', handleGameStart);
    socket.on('room:error', handleError);
    socket.emit('room:join', {
      code: code.toUpperCase(),
    });
    return () => {
      socket.off('game-start', handleGameStart);
      socket.off('room:error', handleError);
    };
  }, [code, navigate]);
  return <div className="spinner-overlay"><div className="spinner" /></div>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useUserStore(s => s.user);
  const isLoggedIn = useUserStore(s => s.isLoggedIn);
  const location = useLocation();

  if (!user || !isLoggedIn) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function GuestPlayableRoute({ children }: { children: React.ReactNode }) {
  const user = useUserStore(s => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useUserStore(s => s.user);
  const isLoggedIn = useUserStore(s => s.isLoggedIn);
  const location = useLocation();

  if (!user || !isLoggedIn || !user.isAdmin) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function WalletReturn({ status }: { status: 'success' | 'cancel' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const universe = useUniverseStore(s => s.universe);
  const setWalletBalance = useUserStore(s => s.setWalletBalance);
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const finish = async () => {
      if (status === 'cancel') {
        useNotificationStore.getState().addNotification('Payment cancelled. Your wallet balance was not changed.', 'info');
        navigate(`/${universe}`, { replace: true });
        return;
      }

      const sessionId = searchParams.get('session_id');
      if (!sessionId) {
        useNotificationStore.getState().addNotification('Could not verify the payment because the checkout session was missing. Your wallet was not credited.', 'error');
        navigate(`/${universe}`, { replace: true });
        return;
      }

      try {
        const result = await api.wallet.stripeVerify(sessionId);
        if (typeof result.balance === 'number') setWalletBalance(result.balance);
        useNotificationStore.getState().addNotification(result.already_credited ? 'Payment was already credited. Wallet balance refreshed.' : 'Payment verified. Wallet balance updated and audit entry recorded.', 'success');
      } catch (err: any) {
        useNotificationStore.getState().addNotification(err?.message || 'Could not verify payment. Your wallet was not credited; please check transaction history or try again.', 'error');
      } finally {
        navigate(`/${universe}`, { replace: true });
      }
    };

    finish();
  }, [navigate, searchParams, setWalletBalance, status, universe]);

  return <div className="spinner-overlay"><div className="spinner" /></div>;
}
