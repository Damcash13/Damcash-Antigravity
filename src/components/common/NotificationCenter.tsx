import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifCenterStore, CenterNotif } from '../../stores/notifCenterStore';

// ── Relative time ─────────────────────────────────────────────────────────────
function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Type config ───────────────────────────────────────────────────────────────
const TYPE_CFG: Record<string, { icon: string; accent: string }> = {
  challenge:       { icon: '⚔️',  accent: '#f59e0b' },
  game_result:     { icon: '🎮',  accent: '#22c55e' },
  friend_request:  { icon: '👥',  accent: '#3b82f6' },
  friend_accepted: { icon: '✅',  accent: '#22c55e' },
  tournament:      { icon: '🏆',  accent: '#fbbf24' },
  system:          { icon: 'ℹ️',  accent: '#64748b' },
};

// ── Single notification row ───────────────────────────────────────────────────
const NotifRow: React.FC<{ n: CenterNotif; onRead: () => void }> = ({ n, onRead }) => {
  const navigate = useNavigate();
  const cfg = TYPE_CFG[n.type] ?? TYPE_CFG.system;

  const handleClick = () => {
    onRead();
    if (n.link) navigate(n.link);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex', gap: 10, padding: '10px 14px', cursor: n.link ? 'pointer' : 'default',
        background: n.read ? 'transparent' : 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid var(--border)',
        transition: 'background 0.15s',
        position: 'relative',
      }}
      onMouseEnter={e => { if (n.link) (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = n.read ? 'transparent' : 'rgba(255,255,255,0.03)'; }}
    >
      {/* Unread dot */}
      {!n.read && (
        <div style={{
          position: 'absolute', top: 12, right: 10,
          width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)',
        }} />
      )}

      {/* Icon */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: cfg.accent + '20',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
      }}>
        {n.icon ?? cfg.icon}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: n.read ? 500 : 700,
          color: 'var(--text-1)', marginBottom: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {n.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>{n.body}</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{ago(n.createdAt)}</div>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const NotificationCenter: React.FC = () => {
  const { notifs, unread, markRead, markAllRead } = useNotifCenterStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const visible = filter === 'unread' ? notifs.filter(n => !n.read) : notifs;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative', width: 34, height: 34, borderRadius: '50%',
          border: 'none', background: open ? 'var(--bg-3)' : 'transparent',
          color: 'var(--text-2)', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }}
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, borderRadius: 8,
            background: '#ef4444', color: '#fff',
            fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1,
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 340, maxHeight: 480,
          background: 'var(--bg-1)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--shadow)',
          display: 'flex', flexDirection: 'column',
          zIndex: 500, overflow: 'hidden',
          animation: 'slideUp 0.2s ease',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-2)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              Notifications
              {unread > 0 && (
                <span style={{
                  marginLeft: 8, background: 'rgba(239,68,68,0.2)', color: '#ef4444',
                  fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 10,
                }}>
                  {unread} new
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Filter pills */}
              {(['all', 'unread'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: filter === f ? 'var(--accent-dim)' : 'transparent',
                    color: filter === f ? 'var(--accent)' : 'var(--text-3)',
                    fontSize: 11, fontWeight: 600,
                  }}
                >
                  {f === 'all' ? 'All' : 'Unread'}
                </button>
              ))}
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--accent)', fontSize: 11, fontWeight: 600,
                    padding: '3px 4px',
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visible.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '40px 20px',
                color: 'var(--text-3)', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 8,
              }}>
                <div style={{ fontSize: 32 }}>🔔</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </div>
              </div>
            ) : (
              visible.map(n => (
                <NotifRow
                  key={n.id}
                  n={n}
                  onRead={() => { markRead(n.id); setOpen(false); }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
