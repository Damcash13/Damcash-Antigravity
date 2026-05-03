import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../../lib/socket';
import { useInviteStore, IncomingInvite } from '../../stores/inviteStore';
import { useNotifCenterStore } from '../../stores/notifCenterStore';
import { useSound } from '../../hooks/useSound';

// Single invite card
const InviteCard: React.FC<{ invite: IncomingInvite }> = ({ invite }) => {
  const { dismissIncoming } = useInviteStore();
  const navigate = useNavigate();
  const { play } = useSound();

  const timeLeft = Math.max(0, Math.round((invite.expiresAt - Date.now()) / 1000));

  const handleAccept = () => {
    socket.emit('invite:accept', { inviteId: invite.inviteId, fromSocketId: invite.fromSocketId });
    play('notification');
    dismissIncoming(invite.inviteId);
    // Navigation happens via 'game-start' socket event in App.tsx
  };

  const handleDecline = () => {
    socket.emit('invite:decline', { inviteId: invite.inviteId, fromSocketId: invite.fromSocketId });
    dismissIncoming(invite.inviteId);
  };

  const { config } = invite;
  const betLabel = config.betAmount > 0 ? ` · $${config.betAmount}` : '';

  return (
    <div style={{
      background: 'var(--bg-1)', border: '1px solid var(--accent)',
      borderRadius: 14, padding: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      animation: 'slideIn 0.3s ease', minWidth: 300, maxWidth: 360,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'var(--accent-dim)', border: '2px solid var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 800, color: 'var(--accent)',
        }}>
          {invite.fromName[0].toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            ⚔️ Challenge from {invite.fromName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            Rating: {invite.fromRating}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>
          {timeLeft}s
        </div>
      </div>

      {/* Game config */}
      <div style={{
        background: 'var(--bg-2)', borderRadius: 10, padding: '10px 14px',
        display: 'flex', gap: 20, marginBottom: 14,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18 }}>{config.universe === 'chess' ? '♟' : '⬤'}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{config.universe}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{config.timeControl}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>time</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16 }}>{config.colorPref === 'random' ? '🎲' : config.colorPref === 'white' ? '⬜' : '⬛'}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>color</div>
        </div>
        {config.betAmount > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#f59e0b' }}>${config.betAmount}</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>bet</div>
          </div>
        )}
        {config.rated && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15 }}>⭐</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>rated</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleDecline}
          style={{
            flex: 1, padding: '9px', background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10,
            color: '#ef4444', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            fontFamily: 'var(--font)', transition: 'background 0.15s',
          }}
        >
          ✗ Decline
        </button>
        <button
          onClick={handleAccept}
          style={{
            flex: 2, padding: '9px', background: 'var(--accent)',
            border: 'none', borderRadius: 10, color: '#000',
            fontWeight: 800, fontSize: 14, cursor: 'pointer',
            fontFamily: 'var(--font)', transition: 'background 0.15s',
          }}
        >
          ⚔️ Accept Challenge
        </button>
      </div>
    </div>
  );
};

// ── Main component (mounts globally) ─────────────────────────────────────────

export const IncomingInviteToast: React.FC = () => {
  const { incoming, addIncoming, dismissIncoming } = useInviteStore();
  const { push: pushNotif } = useNotifCenterStore();
  const { play } = useSound();
  const navigate = useNavigate();

  useEffect(() => {
    const handleInviteReceived = (data: IncomingInvite) => {
      addIncoming(data);
      play('notification');
      pushNotif({
        type: 'challenge',
        icon: '⚔️',
        title: `Challenge from ${data.fromName}`,
        body: `${data.fromName} challenged you to a game`,
      });
      // Auto-dismiss after 30s
      setTimeout(() => dismissIncoming(data.inviteId), 30_000);
    };

    const handleInviteCancelled = ({ inviteId }: { inviteId: string }) => {
      dismissIncoming(inviteId);
    };

    const handleInviteStarted = (data: any) => {
      // Navigate immediately
      const color = data.color || (data.black === socket.id ? 'b' : 'w');
      navigate(`/${data.config.universe}/game/${data.roomId}?color=${color}`, { state: data });
    };

    socket.on('invite:received', handleInviteReceived);
    socket.on('invite:cancelled', handleInviteCancelled);
    socket.on('invite:started', handleInviteStarted);
    return () => {
      socket.off('invite:received', handleInviteReceived);
      socket.off('invite:cancelled', handleInviteCancelled);
      socket.off('invite:started', handleInviteStarted);
    };
  }, [addIncoming, dismissIncoming, play, navigate]);

  if (incoming.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 70, right: 20,
      zIndex: 600, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {incoming.map((inv) => (
        <InviteCard key={inv.inviteId} invite={inv} />
      ))}
    </div>
  );
};
