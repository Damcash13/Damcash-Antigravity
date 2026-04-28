import React from 'react';
import { useTranslation } from 'react-i18next';
import { useInviteStore, OnlinePlayer } from '../../stores/inviteStore';
import { useUniverseStore } from '../../stores';

interface Props {
  onInvite: (player: OnlinePlayer) => void;
}

export const OnlinePlayersList: React.FC<Props> = ({ onInvite }) => {
  const { t } = useTranslation();
  const { onlinePlayers } = useInviteStore();
  const { universe } = useUniverseStore();

  const visible = onlinePlayers.slice(0, 8);

  if (visible.length === 0) return null;

  const statusColor = (s: OnlinePlayer['status']) =>
    s === 'playing' ? '#f59e0b' : s === 'seeking' ? 'var(--accent)' : '#22c55e';

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        padding: '0 12px 6px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{t('lobby.onlinePlayers')}</span>
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{onlinePlayers.length}</span>
      </div>

      {visible.map((player) => (
        <div
          key={player.socketId}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          onClick={() => player.status !== 'playing' && onInvite(player)}
          title={player.status === 'playing' ? `${player.name} is in a game` : `Challenge ${player.name}`}
        >
          {/* Status dot */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: statusColor(player.status), flexShrink: 0,
          }} />

          {/* Name */}
          <span style={{
            flex: 1, fontSize: 13, color: 'var(--text-1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {player.name}
          </span>

          {/* Rating */}
          <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
            {universe === 'chess' ? player.rating.chess : player.rating.checkers}
          </span>

          {/* Challenge icon */}
          {player.status !== 'playing' && (
            <span style={{ fontSize: 13, flexShrink: 0, opacity: 0.6 }}>⚔️</span>
          )}
        </div>
      ))}

      {onlinePlayers.length > 8 && (
        <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }}>
          {t('social.moreOnline', { count: onlinePlayers.length - 8 })}
        </div>
      )}
    </div>
  );
};
