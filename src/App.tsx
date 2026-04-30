import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, Navigate, useParams, useLocation } from 'react-router-dom';
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
  const restoreSession = useUserStore(s => s.restoreSession);
  const listenToAuthChanges = useUserStore(s => s.listenToAuthChanges);
  const universe = useUniverseStore(s => s.universe);
  const setUniverse = useUniverseStore(s => s.setUniverse);

  const initPresence    = useInviteStore(s => s.initPresence);
  const setOnlinePlayers = useInviteStore(s => s.setOnlinePlayers);
  const openConfig      = useInviteStore(s => s.openConfig);
  const closeConfig     = useInviteStore(s => s.closeConfig);
  const configOpen      = useInviteStore(s => s.configOpen);

  const initFriends        = useFriendsStore(s => s.initialize);
  const syncOnlinePlayers  = useFriendsStore(s => s.syncOnlinePlayers);

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
    }
  }, [user?.id]);

  useEffect(() => {
    const parts = location.pathname.split('/');
    if (parts[1] === 'chess' || parts[1] === 'checkers') {
      setUniverse(parts[1]);
    }
  }, [location.pathname, setUniverse]);

  useEffect(() => {
    const handlePlayersOnline = (list: OnlinePlayer[]) => {
      const others = list.filter((p) => p.socketId !== socket.id);
      setOnlinePlayers(others);
      syncOnlinePlayers(others);
    };
    const handleRoomCreated = ({ roomId, universe: uv }: { roomId: string; universe: string }) => {
      setSearching(null);
      navigate(`/${uv}/game/${roomId}`);
    };
    const handleGameStart = ({ roomId, config }: { roomId: string; config: { universe: string } }) => {
      setSearching(null);
      navigate(`/${config.universe}/game/${roomId}`);
    };

    socket.on('players:online', handlePlayersOnline);
    socket.on('room:created', handleRoomCreated);
    socket.on('game-start', handleGameStart);

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
    };
  }, [navigate, setOnlinePlayers, syncOnlinePlayers]);

  const handleCreateGame = (tc: string, mode: 'online' | 'computer') => {
    if (!user) { setShowAuth(true); return; }
    if (mode === 'computer') {
      navigate(`/${universe}/play/computer/${tc}`);
    } else {
      setSearching({ tc, mode });
      socket.emit('seek:create', { tc, universe });
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
    <div className={`app-container ${universe}-universe`}>
      <Header
        onOpenAuth={() => setShowAuth(true)}
        onOpenWallet={() => setShowWallet(true)}
        onInvitePlayer={handleInvitePlayer}
        onOpenCreateGame={() => openConfig()}
      />

      <div className="layout-body">
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

            <Route path="/chess/game/:roomId"    element={<ProtectedRoute><main className="main-content"><ChessGame /></main></ProtectedRoute>} />
            <Route path="/checkers/game/:roomId" element={<ProtectedRoute><main className="main-content"><DraughtsGame /></main></ProtectedRoute>} />
            <Route path="/chess/play/computer/:tc"    element={<ProtectedRoute><main className="main-content"><ChessGame /></main></ProtectedRoute>} />
            <Route path="/checkers/play/computer/:tc" element={<ProtectedRoute><main className="main-content"><DraughtsGame /></main></ProtectedRoute>} />

            <Route path="/:universe/tournaments"     element={<ProtectedRoute><main className="main-content"><TournamentPage /></main></ProtectedRoute>} />
            <Route path="/:universe/tournament/:id" element={<ProtectedRoute><main className="main-content"><TournamentPage /></main></ProtectedRoute>} />

            <Route path="/:universe/profile/:name" element={<ProtectedRoute><main className="main-content"><ProfilePage /></main></ProtectedRoute>} />
            <Route path="/:universe/leaderboard"  element={<main className="main-content"><LeaderboardPage /></main>} />

            <Route path="/:universe/analysis" element={<main className="main-content"><AnalysisBoard /></main>} />
            <Route path="/:universe/editor"   element={<main className="main-content"><BoardEditorPage /></main>} />

            <Route path="/:universe/puzzles"        element={<main className="main-content"><PuzzlesPage /></main>} />
            <Route path="/:universe/puzzle-streak" element={<main className="main-content"><PuzzleStreakPage /></main>} />
            <Route path="/:universe/puzzle-storm"  element={<main className="main-content"><PuzzleStormPage /></main>} />

            <Route path="/game/:id" element={<main className="main-content"><GameReplayPage /></main>} />
            <Route path="/join/:code" element={<JoinByCodeRedirect />} />

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
    const handleGameStart = ({ roomId, config }: { roomId: string; config: { universe: string } }) => {
      navigate(`/${config.universe}/game/${roomId}`);
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
