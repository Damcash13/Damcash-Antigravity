import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../stores';
import { useInviteStore } from '../../stores/inviteStore';
import { useLiveGamesStore } from '../../stores';

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
  const { user: me }       = useUserStore();
  const { onlinePlayers, openConfig } = useInviteStore();
  const { games: liveGames }          = useLiveGamesStore();

  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Is this player in any live game right now?
  const liveGame = liveGames.find(
    g => g.status === 'playing' &&
      (g.white.name === username || g.black.name === username)
  );

  // Is this player online (connected via socket)?
  const onlineEntry = onlinePlayers.find(p => p.name === username);
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

  const handleInvite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onlineEntry) openConfig({ socketId: onlineEntry.socketId, name: onlineEntry.name });
    setVisible(false);
  };

  const handleViewProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/profile/${username}`);
    setVisible(false);
  };

  const handleWatchGame = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (liveGame) navigate(`/${liveGame.universe}/watch/${liveGame.id}`);
    setVisible(false);
  };

  return (
    <span
      className="phc-anchor"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
            ) : (isOnline && me && me.username !== username) ? (
              <button className="phc-btn phc-btn-invite" onClick={handleInvite}>
                ⚔ Challenge
              </button>
            ) : null}
            <button className="phc-btn phc-btn-profile" onClick={handleViewProfile}>
              👤 View profile
            </button>
            <button className="phc-btn phc-btn-stats" onClick={handleViewProfile}>
              📊 Stats
            </button>
            <button className="phc-btn phc-btn-message" onClick={() => {}}>
              💬 Message
            </button>
          </div>
        </div>
      )}
    </span>
  );
};
