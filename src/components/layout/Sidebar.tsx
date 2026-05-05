import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useUniverseStore, useUserStore, useLiveGamesStore } from '../../stores';
import { OnlinePlayersList } from '../invite/OnlinePlayersList';
import { OnlinePlayer, useInviteStore } from '../../stores/inviteStore';
import { useTournamentStore } from '../../stores/tournamentStore';
import { FriendsPanel } from '../social/FriendsPanel';
import { displayTournamentName } from '../../lib/tournamentDisplay';
import { formatLocalDateTime } from '../../lib/timezone';

interface Props {
  onCreateGame: () => void;
  onChallengeFriend: () => void;
  onPlayComputer: () => void;
  onInvitePlayer: (player: OnlinePlayer) => void;
  onChallengeFriendDirect: (socketId: string, name: string) => void;
  onOpenWallet: () => void;
}

export const Sidebar: React.FC<Props> = ({
  onCreateGame, onChallengeFriend, onPlayComputer, onInvitePlayer, onChallengeFriendDirect, onOpenWallet
}) => {
  const { t } = useTranslation();
  const { universe } = useUniverseStore();
  const { user } = useUserStore();
  const navigate = useNavigate();
  const { tournaments } = useTournamentStore();
  const { onlinePlayers } = useInviteStore();
  const { games } = useLiveGamesStore();

  const visibleTournaments = tournaments
    .filter(t_ => t_.universe === universe)
    .slice(0, 4);

  const playerCount = onlinePlayers.filter(p => p.universe === universe).length;
  const gameCount   = games.filter(g => g.universe === universe && g.status === 'playing').length;

  return (
    <aside className="sidebar">
      {/* Stats */}
      <div className="sidebar-stats">
        {user && (
          <div className="sidebar-wallet-card">
            <span className="sidebar-wallet-label">{t('betting.balance')}</span>
            <div className="sidebar-wallet-balance">
              <strong className="sidebar-wallet-value">${Number(user.walletBalance).toFixed(2)}</strong>
            </div>
            <button
              className="btn btn-primary btn-sm sidebar-wallet-action"
              onClick={onOpenWallet}
              title={t('sidebar.topUpWallet')}
            >
              + {t('betting.deposit')}
            </button>
          </div>
        )}
        <div className="sidebar-counts">
          <div className="sidebar-count">
            <strong>{playerCount}</strong>
            <span>{t('lobby.players')}</span>
          </div>
          <div className="sidebar-count">
            <strong>{gameCount}</strong>
            <span>{t('lobby.gamesInPlay')}</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="sidebar-section">
        <button className="sidebar-btn" onClick={onCreateGame} aria-label={t('nav.createGame')}>
          {t('nav.createGame')}
        </button>
        <button className="sidebar-btn" onClick={onChallengeFriend} aria-label={t('nav.challengeFriend')}>
          {t('nav.challengeFriend')}
        </button>
        <button className="sidebar-btn" onClick={onPlayComputer} aria-label={t('nav.playComputer')}>
          {t('nav.playComputer')}
        </button>
      </div>

      {/* Online players — clickable to challenge */}
      <div className="sidebar-section" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <OnlinePlayersList onInvite={onInvitePlayer} />
      </div>

      {/* Tournaments */}
      <div className="sidebar-section" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="sidebar-subtitle" style={{ marginBottom: 0 }}>{t('lobby.tournaments')}</div>
          <button
            onClick={() => navigate(`/${universe}/tournaments`)}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0,
            }}
          >
            {t('leaderboard.viewAll')}
          </button>
        </div>
        {visibleTournaments.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 12px' }}>
            {t('tournament.noTournaments', 'No tournaments right now')}
          </div>
        ) : visibleTournaments.map((t_) => (
          <div
            key={t_.id}
            className="tournament-item"
            onClick={() => navigate(`/${universe}/tournament/${t_.id}`)}
          >
            <div className="tournament-info">
              <div className="tournament-name">{displayTournamentName(t_)}</div>
              <div className="tournament-meta">
                {formatLocalDateTime(t_.startsAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }, true)} · {t_.players.length} {t('lobby.players')}
                {t_.status === 'running' && (
                  <span style={{
                    marginLeft: 6,
                    background: 'rgba(239,68,68,0.18)', color: '#ef4444',
                    fontSize: 9, fontWeight: 800, padding: '1px 5px',
                    borderRadius: 8, textTransform: 'uppercase',
                  }}>{t('social.live')}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Friends */}
      <div className="sidebar-section">
        <FriendsPanel onChallenge={onChallengeFriendDirect} />
      </div>

      {/* Footer */}
      <div style={{ padding: '0 12px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
        {t('sidebar.description')}
      </div>
    </aside>
  );
};
