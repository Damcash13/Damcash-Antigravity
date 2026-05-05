import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, Navigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
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
import { socket } from './lib/socket';
import { api } from './lib/api';
import { useSafetyStore } from './stores/safetyStore';
import { useDirectMessageStore } from './stores/directMessageStore';
import { useNotifCenterStore } from './stores/notifCenterStore';
import { DirectMessagesModal } from './components/messages/DirectMessagesModal';

// Lazy load pages
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

// ── Lobby wrapper ─────────────────────────────────────────────────────────────

const LobbyView: React.FC<{
  onCreateGame:    (tc: string, mode: 'online' | 'computer') => void;
  onChallengeFriend: () => void;
  onPlayComputer:  () => void;
  onInvitePlayer:  (player: OnlinePlayer) => void;
  onChallengeFriendDirect: (socketId: string, name: string) => void;
  onOpenWallet:    () => void;
}> = ({ onCreateGame, onChallengeFriend, onPlayComputer, onInvitePlayer, onChallengeFriendDirect, onOpenWallet }) => {
  return (
  <>
    <Sidebar
      onCreateGame={() => onCreateGame('5+0', 'online')}
      onChallengeFriend={onChallengeFriend}
      onPlayComputer={onPlayComputer}
      onInvitePlayer={onInvitePlayer}
      onChallengeFriendDirect={onChallengeFriendDirect}
      onOpenWallet={onOpenWallet}
    />
    <main className="main-content">
      <HomePage onCreateGame={onCreateGame} />
    </main>
  </>
  );
};

// ── App component ─────────────────────────────────────────────────────────────

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

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

  const initFriends        = useFriendsStore(s => s.initialize);
  const syncOnlinePlayers  = useFriendsStore(s => s.syncOnlinePlayers);
  const setBlockedUsers    = useSafetyStore(s => s.setBlockedUsers);
  const setMessageUnreadCount = useDirectMessageStore(s => s.setUnreadCount);
  const bumpMessageUnreadCount = useDirectMessageStore(s => s.bumpUnreadCount);
  const pushCenterNotification = useNotifCenterStore(s => s.push);

  const [showAuth, setShowAuth] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [searching, setSearching] = useState<{ tc: string; mode: string } | null>(null);

  useRatingUpdates();

  useEffect(() => {
    restoreSession();
    listenToAuthChanges();
  }, []);

  useEffect(() => {
    if (user?.id) {
      initPresence(user.name, user.rating ?? { chess: 1500, checkers: 1450 });
      initFriends();
      if (isLoggedIn) {
        api.safety.blocked()
          .then(({ blockedUsers }) => setBlockedUsers(blockedUsers))
          .catch(() => {});
        api.messages.conversations()
          .then(({ conversations }) => setMessageUnreadCount(conversations.reduce((sum, item) => sum + item.unreadCount, 0)))
          .catch(() => {});
      }
    }
  }, [user?.id, isLoggedIn, setBlockedUsers, setMessageUnreadCount]);

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
    const handlePlayersOnline = (list: OnlinePlayer[]) => {
      const others = list.filter((p) => p.socketId !== socket.id);
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
        icon: '💬',
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

    const handleAuthUnauthorized = () => {
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
  }, [bumpMessageUnreadCount, navigate, pushCenterNotification, setOnlinePlayers, setWalletBalance, syncOnlinePlayers]);

  const handleCreateGame = (tc: string, mode: 'online' | 'computer') => {
    if (!user) { setShowAuth(true); return; }
    if (mode === 'computer') {
      navigate(`/${universe}/play/computer/${tc}`);
    } else {
      if (!isLoggedIn) {
        setShowAuth(true);
        useNotificationStore.getState().addNotification('Please sign in to play rated online games.', 'warning');
        return;
      }
      setSearching({ tc, mode });
      socket.emit('seek', { timeControl: tc, universe, betAmount: 0, rated: true });
    }
  };

  const handleChallengeFriend = () => {
    if (!user) { setShowAuth(true); return; }
    openConfig();
  };

  const handleInvitePlayer = (player: OnlinePlayer) => {
    if (!user) { setShowAuth(true); return; }
    openConfig({ socketId: player.socketId, name: player.name });
  };

  const handleChallengeFriendDirect = (socketId: string, name: string) => {
    if (!user) { setShowAuth(true); return; }
    openConfig({ socketId, name });
  };

  return (
    <div className={`app-wrapper app-container ${universe}-universe`}>
      <Header
        onOpenAuth={() => setShowAuth(true)}
        onOpenWallet={() => setShowWallet(true)}
        onInvitePlayer={handleInvitePlayer}
        onOpenCreateGame={() => openConfig()}
      />

      <div className="main-layout">
        {searching && (
          <SearchingOverlay
            timeControl={searching.tc}
            onCancel={() => {
              setSearching(null);
              socket.emit('seek:cancel');
            }}
          />
        )}

        <Suspense fallback={<div className="spinner-overlay"><div className="spinner" /></div>}>
          <Routes>
            <Route path="/" element={<Navigate to={`/${universe}`} replace />} />

            <Route path="/:universe" element={
              <LobbyView
                onCreateGame={handleCreateGame}
                onChallengeFriend={handleChallengeFriend}
                onPlayComputer={() => handleCreateGame('5+0', 'computer')}
                onInvitePlayer={handleInvitePlayer}
                onChallengeFriendDirect={handleChallengeFriendDirect}
                onOpenWallet={() => setShowWallet(true)}
              />
            } />

            <Route path="/chess/game/:id"    element={<ProtectedRoute><main className="main-content"><ChessGame /></main></ProtectedRoute>} />
            <Route path="/checkers/game/:id" element={<ProtectedRoute><main className="main-content"><DraughtsGame /></main></ProtectedRoute>} />
            <Route path="/chess/play/:mode/:tc"    element={<ProtectedRoute><main className="main-content"><ChessGame /></main></ProtectedRoute>} />
            <Route path="/checkers/play/:mode/:tc" element={<ProtectedRoute><main className="main-content"><DraughtsGame /></main></ProtectedRoute>} />

            <Route path="/:universe/tournaments"     element={<ProtectedRoute><main className="main-content"><TournamentPage /></main></ProtectedRoute>} />
            <Route path="/:universe/tournament/:id" element={<ProtectedRoute><main className="main-content"><TournamentPage /></main></ProtectedRoute>} />

            <Route path="/:universe/profile/:name" element={<ProtectedRoute><main className="main-content"><ProfilePage /></main></ProtectedRoute>} />
            <Route path="/:universe/leaderboard"  element={<main className="main-content"><LeaderboardPage /></main>} />

            <Route path="/:universe/analysis" element={<main className="main-content"><AnalysisBoard /></main>} />
            <Route path="/:universe/editor"   element={<main className="main-content"><BoardEditorPage /></main>} />
            <Route path="/:universe/board-editor" element={<main className="main-content"><BoardEditorPage /></main>} />
            <Route path="/:universe/opening-explorer" element={<main className="main-content"><OpeningExplorerPage /></main>} />
            <Route path="/:universe/my-studies" element={<ProtectedRoute><main className="main-content"><MyStudiesPage /></main></ProtectedRoute>} />
            <Route path="/:universe/endgame-training" element={<main className="main-content"><EndgameTrainingPage /></main>} />
            <Route path="/:universe/coordinates" element={<main className="main-content"><CoordinatesPage /></main>} />
            <Route path="/:universe/import" element={<main className="main-content"><GameImporterPage /></main>} />
            <Route path="/:universe/coming-soon/:feature" element={<main className="main-content"><ComingSoonPage /></main>} />
            <Route path="/:universe/admin" element={<ProtectedRoute><main className="main-content"><AdminSafetyPage /></main></ProtectedRoute>} />
            <Route path="/:universe/admin/safety" element={<ProtectedRoute><main className="main-content"><AdminSafetyPage /></main></ProtectedRoute>} />

            <Route path="/:universe/puzzles"        element={<main className="main-content"><PuzzlesPage /></main>} />
            <Route path="/:universe/puzzle-streak" element={<main className="main-content"><PuzzleStreakPage /></main>} />
            <Route path="/:universe/puzzle-storm"  element={<main className="main-content"><PuzzleStormPage /></main>} />

            <Route path="/:universe/watch/:id" element={<main className="main-content"><SpectateGame /></main>} />
            <Route path="/game/:id" element={<main className="main-content"><GameReplayPage /></main>} />
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
  const user = useUserStore(s => s.user);
  useEffect(() => {
    if (!code) return;
    const handleGameStart = (data: any) => {
      const color = data.color || (data.black === socket.id ? 'b' : 'w');
      navigate(`/${data.config.universe}/game/${data.roomId}?color=${color}`, { state: data });
    };
    const handleError = () => navigate('/');
    socket.on('game-start', handleGameStart);
    socket.on('room:error', handleError);
    socket.emit('room:join', {
      code: code.toUpperCase(),
      joinerName: useUserStore.getState().user?.name || 'Guest',
      joinerRating: useUserStore.getState().user?.rating?.chess || 1500,
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
  const location = useLocation();

  if (!user) {
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
