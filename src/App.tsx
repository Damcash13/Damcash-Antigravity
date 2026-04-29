import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { HomePage } from './components/lobby/HomePage';
import { SearchingOverlay } from './components/lobby/SearchingOverlay';
import { ChessGame } from './components/chess/ChessGame';
import { DraughtsGame } from './components/draughts/DraughtsGame';
import { AuthModal } from './components/common/AuthModal';
import { WalletModal } from './components/common/WalletModal';
import { Notifications } from './components/common/Notifications';
import { GameConfigModal } from './components/invite/GameConfigModal';
import { IncomingInviteToast } from './components/invite/IncomingInviteToast';
import { useUniverseStore, useUserStore } from './stores';
import { useInviteStore, OnlinePlayer } from './stores/inviteStore';
import { useFriendsStore } from './stores/friendsStore';
import { useNotifCenterStore } from './stores/notifCenterStore';
import { TournamentPage } from './components/tournament/TournamentPage';
import { TournamentList } from './components/tournament/TournamentList';
import { CorrespondenceGame } from './components/correspondence/CorrespondenceGame';
import { RatingCard } from './components/profile/RatingCard';
import { ProfilePage } from './components/profile/ProfilePage';
import { LeaderboardPage } from './components/leaderboard/LeaderboardPage';
import { AnalysisBoard } from './components/analysis/AnalysisBoard';
import { SpectateGame } from './components/spectate/SpectateGame';
import { ComingSoonPage } from './components/common/ComingSoonPage';
import { PuzzlesPage } from './components/puzzles/PuzzlesPage';
import { PuzzleStreakPage } from './components/puzzles/PuzzleStreakPage';
import { PuzzleStormPage } from './components/puzzles/PuzzleStormPage';
import { BoardEditorPage } from './components/tools/BoardEditorPage';
import { CoordinatesPage } from './components/tools/CoordinatesPage';
import { OpeningExplorerPage } from './components/tools/OpeningExplorerPage';
import { EndgameTrainingPage } from './components/tools/EndgameTrainingPage';
import { GameImporterPage } from './components/tools/GameImporterPage';
import { MyStudiesPage } from './components/tools/MyStudiesPage';
import { GameReplayPage } from './components/games/GameReplayPage';
import { useRatingUpdates } from './hooks/useRatingUpdates';
import { socket } from './lib/socket';
import { api } from './lib/api';
import { checkSupabaseHealth, isSupabaseReachable, supabase } from './lib/supabase';


// ── Lobby wrapper ─────────────────────────────────────────────────────────────

const LobbyView: React.FC<{
  onCreateGame:    (tc: string, mode: 'online' | 'computer') => void;
  onChallengeFriend: () => void;
  onPlayComputer:  () => void;
  onInvitePlayer:  (player: OnlinePlayer) => void;
  onChallengeFriendDirect: (socketId: string, name: string) => void;
  onOpenWallet:    () => void;
}> = ({ onCreateGame, onChallengeFriend, onPlayComputer, onInvitePlayer, onChallengeFriendDirect, onOpenWallet }) => (
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

// ── App ───────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  useTranslation();
  const { universe, setUniverse } = useUniverseStore();
  const { user, restoreSession, setWalletBalance } = useUserStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { addFriend, addRequest, syncOnlinePlayers } = useFriendsStore();
  const { push: pushNotif } = useNotifCenterStore();

  // Keep universe store in sync with the URL so back/forward and direct
  // links always show the right boards in the live-games section.
  useEffect(() => {
    if (location.pathname.startsWith('/checkers')) {
      if (universe !== 'checkers') {
        setUniverse('checkers');
        document.body.className = 'checkers-universe';
      }
    } else if (location.pathname.startsWith('/chess')) {
      if (universe !== 'chess') {
        setUniverse('chess');
        document.body.className = 'chess-universe';
      }
    }
  }, [location.pathname, universe, setUniverse]);
  const { openConfig, configOpen, closeConfig, configTarget, setOnlinePlayers, upsertPlayer, removePlayer } = useInviteStore();

  const [showAuth,   setShowAuth]   = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [searching,  setSearching]  = useState<{ tc: string } | null>(null);
  const [supabaseDown, setSupabaseDown] = useState(false);

  // Supabase health check — show banner if project is paused
  useEffect(() => {
    checkSupabaseHealth().then(ok => { if (!ok) setSupabaseDown(true); });
  }, []);

  // Restore session from stored JWT on app startup
  useEffect(() => {
    restoreSession().then(() => {
      // Only fetch friends list if we actually have an authenticated session
      const { isLoggedIn } = useUserStore.getState();
      if (isLoggedIn) useFriendsStore.getState().initialize();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ELO rating updates (listens to socket 'rating:update')
  useRatingUpdates();

  // Push game result notifications to the center
  useEffect(() => {
    const handler = (data: any) => {
      const sign = data.delta >= 0 ? '+' : '';
      const icon = data.result === 'win' ? '🏆' : data.result === 'draw' ? '🤝' : '💀';
      pushNotif({
        type: 'game_result',
        icon,
        title: `${data.result === 'win' ? 'Victory!' : data.result === 'draw' ? 'Draw' : 'Defeat'} vs ${data.opponent}`,
        body: `Rating: ${data.before} → ${data.after} (${sign}${data.delta})`,
      });
    };
    socket.on('rating:update', handler);
    return () => socket.off('rating:update', handler);
  }, [pushNotif]);

  // Server-authoritative wallet balance updates (pushed after bet escrow/settlement)
  useEffect(() => {
    const handler = ({ balance }: { balance: number }) => {
      setWalletBalance(Number(balance));
    };
    socket.on('wallet:update', handler);
    return () => socket.off('wallet:update', handler);
  }, [setWalletBalance]);

  // ── Universe transition ───────────────────────────────────────────────────
  useEffect(() => {
    setIsTransitioning(true);
    document.body.className = `${universe}-universe`;
    const t = setTimeout(() => setIsTransitioning(false), 400);
    return () => clearTimeout(t);
  }, [universe]);

  // ── Register player on socket connect + broadcast presence ───────────────
  useEffect(() => {
    const register = () => {
      socket.emit('player:register', {
        name: user?.name || `Guest_${Math.random().toString(36).slice(2, 6)}`,
        rating: user?.rating || { chess: 1500, checkers: 1450 },
        universe,
      });
    };
    register();

    // Re-register if socket reconnects
    socket.on('connect', register);
    return () => socket.off('connect', register);
  }, [user, universe]);

  // ── Sync online player list ───────────────────────────────────────────────
  useEffect(() => {
    socket.on('players:online', (list: any[]) => {
      const others = list.filter((p) => p.socketId !== socket.id);
      setOnlinePlayers(others);
      syncOnlinePlayers(others);
    });
    return () => socket.off('players:online');
  }, [setOnlinePlayers, syncOnlinePlayers]);

  // ── Friend events ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onRequest = (data: { id: string; fromSocketId: string; fromName: string; fromRating: any; sentAt: number }) => {
      addRequest({ ...data, direction: 'incoming' });
      pushNotif({ type: 'friend_request', icon: '👥', title: 'Friend request', body: `${data.fromName} wants to be friends` });
    };
    const onAccepted = (data: { socketId: string; name: string; rating: any }) => {
      addFriend({ id: data.socketId, name: data.name, rating: data.rating, online: true, status: 'idle', socketId: data.socketId, addedAt: Date.now() });
      pushNotif({ type: 'friend_accepted', icon: '✅', title: 'Friend accepted', body: `${data.name} accepted your friend request` });
    };
    socket.on('friend:request',  onRequest);
    socket.on('friend:accepted', onAccepted);
    return () => { socket.off('friend:request', onRequest); socket.off('friend:accepted', onAccepted); };
  }, [addRequest, addFriend, pushNotif]);

  // ── Handle game-start (room code / invite accept / matchmaking) ───────────
  useEffect(() => {
    const handleGameStart = (data: {
      roomId: string; white: string; black: string;
      config?: { universe?: string; timeControl?: string; betAmount?: number };
      timeControl?: string;
      whitePlayer?: { name: string; rating: any; country: string };
      blackPlayer?: { name: string; rating: any; country: string };
    }) => {
      const myColor = data.white === socket.id ? 'w' : 'b';
      const univ    = data.config?.universe || universe;
      const tc      = data.config?.timeControl || data.timeControl || '5+0';
      const bet     = data.config?.betAmount || 0;
      setSearching(null);
      closeConfig();
      navigate(
        `/${univ}/game/${data.roomId}?color=${myColor}&tc=${tc}&bet=${bet}`,
        { state: { whitePlayer: data.whitePlayer, blackPlayer: data.blackPlayer } },
      );
    };

    // Error joining a room
    const handleRoomError = (data: { message: string }) => {
      alert(`⚠️ ${data.message}`);
    };

    // Invite declined notification
    const handleInviteDeclined = (data: { byName: string }) => {
      alert(`${data.byName} declined your challenge.`);
    };

    socket.on('game-start',       handleGameStart);
    socket.on('room:error',       handleRoomError);
    socket.on('invite:declined',  handleInviteDeclined);
    return () => {
      socket.off('game-start',      handleGameStart);
      socket.off('room:error',      handleRoomError);
      socket.off('invite:declined', handleInviteDeclined);
    };
  }, [universe, navigate, closeConfig]);

  // ── Matchmaking ───────────────────────────────────────────────────────────
  const handleCreateGame = (tc: string, mode: 'online' | 'computer') => {
    if (mode === 'computer') {
      navigate(`/${universe}/play/computer/${tc}`);
    } else {
      setSearching({ tc });
    }
  };

  // ── Invite actions ────────────────────────────────────────────────────────
  const handleInvitePlayer = (player: OnlinePlayer) => {
    openConfig({ socketId: player.socketId, name: player.name });
  };

  const handleChallengeFriend = () => {
    openConfig();
  };

  const handleChallengeFriendDirect = (socketId: string, name: string) => {
    openConfig({ socketId, name });
  };

  const handleOpenCreateGame = () => {
    openConfig();
  };

  return (
    <div className={`app-wrapper ${isTransitioning ? 'universe-transition' : ''}`}>
      <Header
        onOpenWallet={() => setShowWallet(true)}
        onOpenAuth={() => setShowAuth(true)}
        onInvitePlayer={handleInvitePlayer}
        onOpenCreateGame={handleOpenCreateGame}
      />

      {supabaseDown && (
        <div className="supabase-banner">
          <span>
            <strong>Auth service unreachable.</strong> Sign in may be unavailable.{' '}
            <button
              onClick={() => { checkSupabaseHealth().then(ok => { if (ok) setSupabaseDown(false); }); }}
              style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}
            >Retry</button>.
            You can still play as a guest.
          </span>
          <button onClick={() => setSupabaseDown(false)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>
            ×
          </button>
        </div>
      )}

      <div className="main-layout">
        <Routes>
          <Route path="/" element={<Navigate to={`/${universe}`} replace />} />

          {/* ── Chess lobby ── */}
          <Route
            path="/chess"
            element={
              searching ? (
                <main className="main-content">
                  <SearchingOverlay
                    timeControl={searching.tc}
                    onCancel={() => { setSearching(null); socket.emit('seek:cancel'); }}
                  />
                </main>
              ) : (
                <LobbyView
                  onCreateGame={handleCreateGame}
                  onChallengeFriend={handleChallengeFriend}
                  onPlayComputer={() => navigate(`/chess/play/computer/5+0`)}
                  onInvitePlayer={handleInvitePlayer}
                  onChallengeFriendDirect={handleChallengeFriendDirect}
                  onOpenWallet={() => setShowWallet(true)}
                />
              )
            }
          />

          {/* ── Checkers lobby ── */}
          <Route
            path="/checkers"
            element={
              searching ? (
                <main className="main-content">
                  <SearchingOverlay
                    timeControl={searching.tc}
                    onCancel={() => { setSearching(null); socket.emit('seek:cancel'); }}
                  />
                </main>
              ) : (
                <LobbyView
                  onCreateGame={handleCreateGame}
                  onChallengeFriend={handleChallengeFriend}
                  onPlayComputer={() => navigate(`/checkers/play/computer/5+0`)}
                  onInvitePlayer={handleInvitePlayer}
                  onChallengeFriendDirect={handleChallengeFriendDirect}
                  onOpenWallet={() => setShowWallet(true)}
                />
              )
            }
          />

          {/* ── Game rooms ── */}
          <Route path="/chess/play/:mode/:tc"   element={<main className="main-content"><ChessGame /></main>} />
          <Route path="/chess/game/:id"         element={<main className="main-content"><ChessGame /></main>} />
          <Route path="/checkers/play/:mode/:tc" element={<main className="main-content"><DraughtsGame /></main>} />
          <Route path="/checkers/game/:id"      element={<main className="main-content"><DraughtsGame /></main>} />

          {/* ── Spectate ── */}
          <Route path="/chess/watch/:id"    element={<main className="main-content"><SpectateGame /></main>} />
          <Route path="/checkers/watch/:id" element={<main className="main-content"><SpectateGame /></main>} />

          {/* ── Join by code (shareable link) ── */}
          <Route path="/join/:code" element={<JoinByCodeRedirect />} />

          {/* ── Correspondence games ── */}
          <Route path="/chess/correspondence/:id"    element={<main className="main-content"><CorrespondenceGame /></main>} />
          <Route path="/checkers/correspondence/:id" element={<main className="main-content"><CorrespondenceGame /></main>} />

          {/* ── Tournaments ── */}
          <Route path="/:universe/tournaments"      element={<main className="main-content"><TournamentList onSelectTournament={(id) => navigate(`/${universe}/tournament/${id}`)} /></main>} />
          <Route path="/:universe/tournament/:id"  element={<main className="main-content"><TournamentPage /></main>} />

          {/* ── Game replay ── */}
          <Route path="/game/:id"        element={<main className="main-content"><GameReplayPage /></main>} />
          <Route path="/game/:id/replay" element={<main className="main-content"><GameReplayPage /></main>} />

          {/* ── Profile ── */}
          <Route path="/profile"          element={<main className="main-content"><ProfilePage /></main>} />
          <Route path="/profile/:username" element={<main className="main-content"><ProfilePage /></main>} />

          {/* ── Leaderboard ── */}
          <Route path="/:universe/leaderboard" element={<main className="main-content"><LeaderboardPage /></main>} />

          {/* ── Analysis ── */}
          <Route path="/:universe/analysis" element={<main className="main-content"><AnalysisBoard /></main>} />

          {/* ── Puzzles ── */}
          <Route path="/:universe/puzzles"       element={<main className="main-content"><PuzzlesPage /></main>} />
          <Route path="/:universe/puzzle-streak" element={<main className="main-content"><PuzzleStreakPage /></main>} />
          <Route path="/:universe/puzzle-storm"  element={<main className="main-content"><PuzzleStormPage /></main>} />

          {/* ── Tools ── */}
          <Route path="/:universe/board-editor"      element={<main className="main-content"><BoardEditorPage /></main>} />
          <Route path="/:universe/coordinates"       element={<main className="main-content"><CoordinatesPage /></main>} />
          <Route path="/:universe/opening-explorer"  element={<main className="main-content"><OpeningExplorerPage /></main>} />
          <Route path="/:universe/endgame-training"  element={<main className="main-content"><EndgameTrainingPage /></main>} />
          <Route path="/:universe/import"            element={<main className="main-content"><GameImporterPage /></main>} />
          <Route path="/:universe/my-studies"        element={<main className="main-content"><MyStudiesPage /></main>} />

          {/* ── Wallet payment redirect pages ── */}
          <Route path="/wallet/success" element={<main className="main-content"><WalletSuccessPage /></main>} />
          <Route path="/wallet/cancel"  element={<Navigate to={`/${universe}`} replace />} />

          {/* ── Supabase password-reset redirect ── */}
          <Route path="/reset-password" element={<main className="main-content"><ResetPasswordPage /></main>} />

          {/* ── Correspondence shortcut (from email link) ── */}
          <Route path="/correspondence/:id" element={<main className="main-content"><CorrespondenceGame /></main>} />

          {/* ── Coming soon ── */}
          <Route path="/:universe/coming-soon/:feature" element={<main className="main-content"><ComingSoonPage /></main>} />

          <Route path="*" element={<Navigate to={`/${universe}`} replace />} />
        </Routes>
      </div>

      {/* ── Modals ── */}
      <AuthModal  open={showAuth}   onClose={() => setShowAuth(false)} />
      <WalletModal open={showWallet} onClose={() => setShowWallet(false)} />
      <GameConfigModal open={configOpen} onClose={closeConfig} />
      <RatingCard open={showRating} onClose={() => setShowRating(false)} />

      {/* ── Real-time incoming invites (top-right toast) ── */}
      <IncomingInviteToast />

      {/* ── App notifications ── */}
      <Notifications />
    </div>
  );
};

// ── /wallet/success — verifies Stripe payment and credits balance ─────────────
const WalletSuccessPage: React.FC = () => {
  const navigate = useNavigate();
  const { universe } = useUniverseStore();
  const { updateBalance } = useUserStore();
  const [state, setState] = React.useState<'loading' | 'ok' | 'error'>('loading');
  const [credited, setCredited] = React.useState(0);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (!sessionId) { setState('error'); return; }
    api.wallet.stripeVerify(sessionId)
      .then(result => {
        if (result.ok || result.already_credited) {
          setState('ok');
          if (result.balance) {
            // Sync local wallet balance: compute delta from server balance
            const { user } = useUserStore.getState();
            if (user) updateBalance(result.balance - user.walletBalance);
          }
        } else {
          setState('error');
        }
      })
      .catch(() => setState('error'));
  }, [updateBalance]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16, textAlign: 'center' }}>
      {state === 'loading' && (
        <>
          <div className="spinner" />
          <div style={{ color: 'var(--text-2)', fontSize: 16 }}>Verifying payment…</div>
        </>
      )}
      {state === 'ok' && (
        <>
          <div style={{ fontSize: 56 }}>✅</div>
          <h2 style={{ color: '#22c55e', margin: 0 }}>Payment successful!</h2>
          <p style={{ color: 'var(--text-2)', margin: 0 }}>Your wallet has been credited.</p>
          <button className="btn btn-primary" onClick={() => navigate(`/${universe}`)}>Back to lobby →</button>
        </>
      )}
      {state === 'error' && (
        <>
          <div style={{ fontSize: 56 }}>❌</div>
          <h2 style={{ color: 'var(--danger)', margin: 0 }}>Payment could not be verified</h2>
          <p style={{ color: 'var(--text-2)', margin: 0 }}>Please contact support if your card was charged.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={() => { navigate(`/${universe}`); setTimeout(() => (document.querySelector('.wallet-display') as HTMLButtonElement)?.click(), 300); }}>
              ↩ Try Again
            </button>
            <button className="btn btn-secondary" onClick={() => navigate(`/${universe}`)}>← Go back</button>
          </div>
        </>
      )}
    </div>
  );
};

// ── /reset-password — handles Supabase password-reset redirect ───────────────
const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { universe } = useUniverseStore();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm]   = React.useState('');
  const [status, setStatus]     = React.useState<'form' | 'loading' | 'done' | 'error'>('form');
  const [errMsg, setErrMsg]     = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg('');
    if (password.length < 6) { setErrMsg('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setErrMsg('Passwords do not match.'); return; }
    if (!supabase) { setErrMsg('Auth service unavailable.'); return; }
    setStatus('loading');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStatus('done');
      setTimeout(() => navigate(`/${universe}`), 2500);
    } catch (err: any) {
      setErrMsg(err.message || 'Failed to update password.');
      setStatus('error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20, padding: '40px 20px' }}>
      {status === 'done' ? (
        <>
          <div style={{ fontSize: 56 }}>✅</div>
          <h2 style={{ color: '#22c55e', margin: 0 }}>Password updated!</h2>
          <p style={{ color: 'var(--text-2)', margin: 0 }}>Redirecting you back…</p>
        </>
      ) : (
        <>
          <h2 style={{ margin: 0, fontSize: 22 }}>Set new password</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
            <input type="password" placeholder="New password (min 6 chars)" value={password} onChange={e => setPassword(e.target.value)} required />
            <input type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            {errMsg && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{errMsg}</div>}
            <button type="submit" className={`btn btn-primary btn-full${status === 'loading' ? ' btn-loading' : ''}`} disabled={status === 'loading'}>
              {status === 'loading' ? '…' : 'Update password'}
            </button>
            <button type="button" className="btn btn-secondary btn-full" onClick={() => navigate(`/${universe}`)}>← Cancel</button>
          </form>
        </>
      )}
    </div>
  );
};

// ── /join/:code page — auto-joins a room by code ─────────────────────────────
const JoinByCodeRedirect: React.FC = () => {
  const { openConfig } = useInviteStore();
  const { code } = useParams<{ code: string }>();

  useEffect(() => {
    if (code) {
      socket.emit('room:join', {
        code: code.toUpperCase(),
        joinerName: 'Guest',
        joinerRating: 1500,
      });
    } else {
      openConfig();
    }
  }, [code, openConfig]);

  return (
    <main className="main-content">
      <div className="searching-overlay">
        <div className="spinner" />
        <div style={{ fontSize: 18, fontWeight: 700 }}>Joining room {code}…</div>
      </div>
    </main>
  );
};

export default App;
