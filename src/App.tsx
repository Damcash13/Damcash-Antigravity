import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, Navigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { SearchingOverlay } from './components/lobby/SearchingOverlay';
import { AuthModal } from './components/common/AuthModal';
import { WalletModal } from './components/common/WalletModal';
import { Notifications } from './components/common/Notifications';
import { GameConfigModal } from './components/invite/GameConfigModal';
import { IncomingInviteToast } from './components/invite/IncomingInviteToast';
import { useUniverseStore, useUserStore } from './stores';
import { useInviteStore, OnlinePlayer } from './stores/inviteStore';
import { useFriendsStore } from './stores/friendsStore';
import { useNotifCenterStore } from './stores/notifCenterStore';
import { useRatingUpdates } from './hooks/useRatingUpdates';
import { socket } from './lib/socket';
import { api } from './lib/api';
import { checkSupabaseHealth, isSupabaseReachable, supabase } from './lib/supabase';

// Lazy load pages
const HomePage = lazy(() => import('./components/lobby/HomePage').then(m => ({ default: m.HomePage })));
const ChessGame = lazy(() => import('./components/chess/ChessGame').then(m => ({ default: m.ChessGame })));
const DraughtsGame = lazy(() => import('./components/draughts/DraughtsGame').then(m => ({ default: m.DraughtsGame })));
const TournamentPage = lazy(() => import('./components/tournament/TournamentPage').then(m => ({ default: m.TournamentPage })));
const TournamentList = lazy(() => import('./components/tournament/TournamentList').then(m => ({ default: m.TournamentList })));
const ProfilePage = lazy(() => import('./components/profile/ProfilePage').then(m => ({ default: m.ProfilePage })));
const LeaderboardPage = lazy(() => import('./components/leaderboard/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })));
const AnalysisBoard = lazy(() => import('./components/analysis/AnalysisBoard').then(m => ({ default: m.AnalysisBoard })));
const SpectateGame = lazy(() => import('./components/spectate/SpectateGame').then(m => ({ default: m.SpectateGame })));
const ComingSoonPage = lazy(() => import('./components/common/ComingSoonPage').then(m => ({ default: m.ComingSoonPage })));
const PuzzlesPage = lazy(() => import('./components/puzzles/PuzzlesPage').then(m => ({ default: m.PuzzlesPage })));
const PuzzleStreakPage = lazy(() => import('./components/puzzles/PuzzleStreakPage').then(m => ({ default: m.PuzzleStreakPage })));
const PuzzleStormPage = lazy(() => import('./components/puzzles/PuzzleStormPage').then(m => ({ default: m.PuzzleStormPage })));
const BoardEditorPage = lazy(() => import('./components/tools/BoardEditorPage').then(m => ({ default: m.BoardEditorPage })));
const CoordinatesPage = lazy(() => import('./components/tools/CoordinatesPage').then(m => ({ default: m.CoordinatesPage })));
const OpeningExplorerPage = lazy(() => import('./components/tools/OpeningExplorerPage').then(m => ({ default: m.OpeningExplorerPage })));
const EndgameTrainingPage = lazy(() => import('./components/tools/EndgameTrainingPage').then(m => ({ default: m.EndgameTrainingPage })));
const GameImporterPage = lazy(() => import('./components/tools/GameImporterPage').then(m => ({ default: m.GameImporterPage })));
const MyStudiesPage = lazy(() => import('./components/tools/MyStudiesPage').then(m => ({ default: m.MyStudiesPage })));
const GameReplayPage = lazy(() => import('./components/games/GameReplayPage').then(m => ({ default: m.GameReplayPage })));
const CorrespondenceGame = lazy(() => import('./components/correspondence/CorrespondenceGame').then(m => ({ default: m.CorrespondenceGame })));

// ── Lobby wrapper ─────────────────────────────────────────────────────────────

const LobbyView: React.FC<{
  onCreateGame:    (tc: string, mode: 'online' | 'computer') => void;
  onChallengeFriend: () => void;
  onPlayComputer:  () => void;
  onInvitePlayer:  (player: OnlinePlayer) => void;
  onChallengeFriendDirect: (socketId: string, name: string) => void;
  onOpenWallet:    () => void;
}> = ({ onCreateGame, onChallengeFriend, onPlayComputer, onInvitePlayer, onChallengeFriendDirect, onOpenWallet }) => {
  const searching = useInviteStore(s => !!s.onlinePlayers.find(p => p.socketId === 'TODO')); // This logic needs to be cleaner
  return (
  <>
    <Sidebar
      onCreateGame={() => onCreateGame('5+0', 'online')}
      onChallengeFriend={onChallengeFriend}
      onPlayComputer={onPlayComputer}
      onInvitePlayer={onInvitePlayer}
      onChallengeFriendDirect={onChallengeFriendDirect}
    />
    <main className="main-content">
      <HomePage onCreateGame={onCreateGame} />
    </main>
  </>
  );
};

// ── App component ─────────────────────────────────────────────────────────────

export default function App() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const user = useUserStore(s => s.user);
  const restoreSession = useUserStore(s => s.restoreSession);
  const listenToAuthChanges = useUserStore(s => s.listenToAuthChanges);
  const universe = useUniverseStore(s => s.universe);
  const setUniverse = useUniverseStore(s => s.setUniverse);

  const initPresence = useInviteStore(s => s.initPresence);
  const cleanupPresence = useInviteStore(s => s.cleanupPresence);
  const setOnlinePlayers = useInviteStore(s => s.setOnlinePlayers);
  const syncOnlinePlayers = useInviteStore(s => s.syncOnlinePlayers);

  const initFriends = useFriendsStore(s => s.init);
  const cleanupFriends = useFriendsStore(s => s.cleanup);

  const initNotifs = useNotifCenterStore(s => s.init);
  const cleanupNotifs = useNotifCenterStore(s => s.cleanup);

  const [showAuth, setShowAuth] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [configTarget, setConfigTarget] = useState<OnlinePlayer | null>(null);
  const [searching, setSearching] = useState<{ tc: string; mode: string } | null>(null);

  useRatingUpdates();

  useEffect(() => {
    restoreSession();
    listenToAuthChanges();
  }, []);

  useEffect(() => {
    if (user?.id) {
      initPresence(user.name);
      initFriends(user.id);
      initNotifs(user.id);
    }
    return () => {
      cleanupPresence();
      cleanupFriends();
      cleanupNotifs();
    };
  }, [user?.id]);

  useEffect(() => {
    const parts = location.pathname.split('/');
    if (parts[1] === 'chess' || parts[1] === 'checkers') {
      setUniverse(parts[1]);
    }
  }, [location.pathname, setUniverse]);

  useEffect(() => {
    socket.on('players:online', (list: any[]) => {
      const others = list.filter((p) => p.socketId !== socket.id);
      setOnlinePlayers(others);
      syncOnlinePlayers(others);
    });
    socket.on('room:created', ({ roomId, universe: uv }) => {
      setSearching(null);
      navigate(`/${uv}/game/${roomId}`);
    });
    return () => {
      socket.off('players:online');
      socket.off('room:created');
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
    setShowConfig(true);
  };

  const handleInvitePlayer = (player: OnlinePlayer) => {
    if (!user) { setShowAuth(true); return; }
    setConfigTarget(player);
    setShowConfig(true);
  };

  const handleChallengeFriendDirect = (socketId: string, name: string) => {
    if (!user) { setShowAuth(true); return; }
    setConfigTarget({ socketId, name, rating: 1500, universe: 'chess' });
    setShowConfig(true);
  };

  return (
    <div className={`app-container ${universe}-universe`}>
      <Header
        onOpenAuth={() => setShowAuth(true)}
        onOpenWallet={() => setShowWallet(true)}
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

            <Route path="/chess/game/:roomId"    element={<main className="main-content"><ChessGame /></main>} />
            <Route path="/checkers/game/:roomId" element={<main className="main-content"><DraughtsGame /></main>} />
            <Route path="/chess/play/computer/:tc"    element={<main className="main-content"><ChessGame isVsComputer /></main>} />
            <Route path="/checkers/play/computer/:tc" element={<main className="main-content"><DraughtsGame isVsComputer /></main>} />
            
            <Route path="/:universe/tournaments"     element={<main className="main-content"><TournamentPage /></main>} />
            <Route path="/:universe/tournament/:id" element={<main className="main-content"><TournamentPage /></main>} />
            
            <Route path="/:universe/profile/:name" element={<main className="main-content"><ProfilePage /></main>} />
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
        open={showConfig}
        onClose={() => { setShowConfig(false); setConfigTarget(null); }}
        target={configTarget}
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
    if (code) {
      api.rooms.joinByCode(code).then(res => {
        navigate(`/${res.universe}/game/${res.roomId}`);
      }).catch(() => navigate('/'));
    }
  }, [code, navigate]);
  return <div className="spinner-overlay"><div className="spinner" /></div>;
}
