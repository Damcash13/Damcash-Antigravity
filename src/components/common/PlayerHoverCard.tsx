import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore, useNotificationStore, useUniverseStore } from '../../stores';
import { useInviteStore } from '../../stores/inviteStore';
import { useLiveGamesStore } from '../../stores';
import { useSafetyStore } from '../../stores/safetyStore';
import { useDirectMessageStore } from '../../stores/directMessageStore';
import { api } from '../../lib/api';

// Convert ISO 3166-1 alpha-2 code → emoji flag (e.g. "US" → 🇺🇸)
export function countryFlag(code: string): string {
  if (!code || code.length !== 2) return '';
  const base = 0x1F1E6 - 65;
  return String.fromCodePoint(
    code.toUpperCase().charCodeAt(0) + base,
    code.toUpperCase().charCodeAt(1) + base,
  );
}

interface Props {
  username: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  games: number;
  country?: string;
  children: React.ReactNode;
}

export const PlayerHoverCard: React.FC<Props> = ({
  username, rating, wins, losses, draws, games, country, children,
}) => {
  const navigate   = useNavigate();
  const universe = useUniverseStore(s => s.universe);
  const { user: me }       = useUserStore();
  const isLoggedIn = useUserStore(s => s.isLoggedIn);
  const addNotification = useNotificationStore(s => s.addNotification);
  const { onlinePlayers, openConfig } = useInviteStore();
  const { games: liveGames }          = useLiveGamesStore();
  const blockedUsers = useSafetyStore(s => s.blockedUsers);
  const mutedUsers = useSafetyStore(s => s.mutedUsers);
  const blockUser = useSafetyStore(s => s.blockUser);
  const unblockUser = useSafetyStore(s => s.unblockUser);
  const muteUser = useSafetyStore(s => s.muteUser);
  const unmuteUser = useSafetyStore(s => s.unmuteUser);
  const openConversation = useDirectMessageStore(s => s.openConversation);

  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameKey = username.trim().toLowerCase();
  const isBlockedUser = blockedUsers.includes(usernameKey);
  const isMutedUser = mutedUsers.includes(usernameKey);

  // Is this player in any live game right now?
  const liveGame = liveGames.find(
    g => g.universe === universe &&
      g.status === 'playing' &&
      (g.white.name === username || g.black.name === username)
  );

  // Is this player online (connected via socket)?
  const onlineEntry = onlinePlayers.find(p => p.name === username && p.universe === universe);
  const isPlaying = !!liveGame;
  const isOnline  = !!onlineEntry || isPlaying;

  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
  const flag    = countryFlag(country || '');

  const handleMouseEnter = () => {
    timerRef.current && clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), 180);
  };
  const handleMouseLeave = () => {
    timerRef.current && clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 200);
  };
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    timerRef.current && clearTimeout(timerRef.current);
    setVisible(v => !v);
  };

  const handleInvite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBlockedUser) {
      addNotification(`Unblock ${username} before challenging them.`, 'warning');
      setVisible(false);
      return;
    }
    if (onlineEntry) openConfig({ socketId: onlineEntry.socketId, name: onlineEntry.name, universe: onlineEntry.universe });
    setVisible(false);
  };

  const handleViewProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/${universe}/profile/${encodeURIComponent(username)}`);
    setVisible(false);
  };

  const handleWatchGame = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (liveGame) navigate(`/${liveGame.universe}/watch/${liveGame.id}`);
    setVisible(false);
  };
  const handleMessage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!me || !isLoggedIn) {
      addNotification('Sign in to message players.', 'warning');
      setVisible(false);
      return;
    }
    if (isBlockedUser) {
      addNotification(`Unblock ${username} before messaging them.`, 'warning');
      setVisible(false);
      return;
    }
    openConversation(username);
    setVisible(false);
  };

  const handleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMutedUser) {
      unmuteUser(username);
      addNotification(`Unmuted ${username} in chat.`, 'info');
    } else {
      muteUser(username);
      addNotification(`Muted ${username} in chat.`, 'info');
    }
    setVisible(false);
  };

  const handleReport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!me || !isLoggedIn) {
      addNotification('Sign in to report a user.', 'warning');
      setVisible(false);
      return;
    }
    try {
      await api.safety.report({
        targetUsername: username,
        reason: 'player_menu',
        context: 'username_click',
        notes: 'Reported from the player action menu.',
      });
      addNotification(`Report received for ${username}.`, 'success');
    } catch (err: any) {
      addNotification(err?.message || 'Could not send report. Please try again.', 'error');
    } finally {
      setVisible(false);
    }
  };

  const handleReview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!me || !isLoggedIn) {
      addNotification('Sign in to request a review.', 'warning');
      setVisible(false);
      return;
    }
    try {
      await api.safety.review({
        targetUsername: username,
        reason: 'suspicious_game_or_payment',
        notes: 'Review requested from the player action menu.',
      });
      addNotification(`Review request recorded for ${username}.`, 'success');
    } catch (err: any) {
      addNotification(err?.message || 'Could not request review. Please try again.', 'error');
    } finally {
      setVisible(false);
    }
  };

  const handleBlock = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBlockedUser) {
      unblockUser(username);
      if (!isLoggedIn) {
        addNotification(`Unblocked ${username}.`, 'info');
        setVisible(false);
        return;
      }
      try {
        await api.safety.unblock(username);
        addNotification(`Unblocked ${username}.`, 'info');
      } catch (err: any) {
        addNotification(err?.message || 'Unblocked locally. Server sync will retry later.', 'warning');
      } finally {
        setVisible(false);
      }
      return;
    }

    blockUser(username);
    if (!isLoggedIn) {
      addNotification(`Blocked ${username} on this device.`, 'info');
      setVisible(false);
      return;
    }
    try {
      await api.safety.block({ targetUsername: username });
      addNotification(`Blocked ${username}. They are hidden from chat and quick player lists.`, 'info');
    } catch (err: any) {
      addNotification(err?.message || 'Blocked locally. Server sync will retry later.', 'warning');
    } finally {
      setVisible(false);
    }
  };

  return (
    <span
      className="phc-anchor"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {children}

      {visible && (
        <div
          className="phc-card"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Header */}
          <div className="phc-header">
            <div className="phc-avatar">
              {username.slice(0, 2).toUpperCase()}
            </div>
            <div className="phc-info">
              <div className="phc-name">
                {flag && <span className="phc-flag">{flag}</span>}
                {username}
              </div>
              <div className={`phc-status ${isPlaying ? 'playing' : isOnline ? 'online' : 'offline'}`}>
                <span className="phc-dot" />
                {isPlaying ? 'Playing now' : isOnline ? 'Online' : 'Offline'}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="phc-stats">
            <div className="phc-stat">
              <span className="phc-stat-val">{rating}</span>
              <span className="phc-stat-lbl">Rating</span>
            </div>
            <div className="phc-stat">
              <span className="phc-stat-val">{games}</span>
              <span className="phc-stat-lbl">Games</span>
            </div>
            <div className="phc-stat">
              <span className="phc-stat-val" style={{ color: '#22c55e' }}>{winRate}%</span>
              <span className="phc-stat-lbl">Win rate</span>
            </div>
          </div>

          {/* W/D/L mini bar */}
          {games > 0 && (
            <div className="phc-wdl">
              <div className="phc-wdl-bar" style={{ width: `${Math.round((wins / games) * 100)}%`, background: '#22c55e' }} />
              <div className="phc-wdl-bar" style={{ width: `${Math.round((draws / games) * 100)}%`, background: 'var(--text-3)' }} />
              <div className="phc-wdl-bar" style={{ width: `${Math.round((losses / games) * 100)}%`, background: '#ef4444' }} />
            </div>
          )}

          {/* Actions */}
          <div className="phc-actions">
            {isPlaying ? (
              <button className="phc-btn phc-btn-watch" onClick={handleWatchGame}>
                👁 Watch game
              </button>
            ) : (isOnline && me && me.name !== username) ? (
              <button className="phc-btn phc-btn-invite" onClick={handleInvite}>
                ⚔ Challenge
              </button>
            ) : null}
            {isBlockedUser && (
              <div className="phc-safety-note">
                Blocked locally
              </div>
            )}
            <button className="phc-btn phc-btn-profile" onClick={handleViewProfile}>
              👤 View profile
            </button>
            <button className="phc-btn phc-btn-stats" onClick={handleViewProfile}>
              📊 Stats
            </button>
            {me && me.name !== username && (
              <button className="phc-btn phc-btn-message" onClick={handleMessage}>
                💬 Message
              </button>
            )}
            {me && me.name !== username && (
              <button className="phc-btn phc-btn-muted" onClick={handleMute}>
                {isMutedUser ? '🔊 Unmute' : '🔇 Mute chat'}
              </button>
            )}
            {me && me.name !== username && (
              <button className="phc-btn phc-btn-report" onClick={handleReport}>
                🚩 Report
              </button>
            )}
            {me && me.name !== username && (
              <button className="phc-btn phc-btn-review" onClick={handleReview}>
                🛡 Review
              </button>
            )}
            {me && me.name !== username && (
              <button className="phc-btn phc-btn-block" onClick={handleBlock}>
                {isBlockedUser ? '✅ Unblock' : '🚫 Block'}
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
};
