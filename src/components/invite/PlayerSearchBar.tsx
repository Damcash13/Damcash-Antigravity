import React, { useState, useRef, useEffect } from 'react';
import { socket } from '../../lib/socket';
import { useInviteStore, OnlinePlayer } from '../../stores/inviteStore';
import { useUniverseStore } from '../../stores';

interface Props {
  onInvite: (player: OnlinePlayer) => void;
}

export const PlayerSearchBar: React.FC<Props> = ({ onInvite }) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const { onlinePlayers } = useInviteStore();
  const { universe } = useUniverseStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Filter local online players by query
  const results = query.length >= 1
    ? onlinePlayers
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8)
    : onlinePlayers.slice(0, 6);   // show first 6 when focused with no query

  const showDrop = focused && (query.length >= 1 || onlinePlayers.length > 0);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const statusColor = (s: OnlinePlayer['status']) =>
    s === 'playing' ? '#f59e0b' : s === 'seeking' ? 'var(--accent)' : '#22c55e';

  const statusLabel = (s: OnlinePlayer['status']) =>
    s === 'playing' ? 'In game' : s === 'seeking' ? 'Seeking' : 'Idle';

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-2)', border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8, padding: '6px 12px', transition: 'border-color 0.2s',
      }}>
        <span style={{ color: 'var(--text-3)', fontSize: 14 }}>🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search players…"
          style={{
            background: 'none', border: 'none', outline: 'none',
            color: 'var(--text-1)', fontSize: 13, fontFamily: 'var(--font)',
            width: 160,
          }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
          >✕</button>
        )}
      </div>

      {/* Dropdown */}
      {showDrop && (
        <div
          ref={dropRef}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            background: 'var(--bg-1)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            width: 280, zIndex: 400, overflow: 'hidden',
            animation: 'slideUp 0.15s ease',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '8px 14px', borderBottom: '1px solid var(--border)',
            fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
            textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--bg-2)',
          }}>
            <span>Online Players</span>
            <span style={{ color: 'var(--accent)' }}>{onlinePlayers.length} online</span>
          </div>

          {results.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              {query ? `No players found for "${query}"` : 'No players online yet'}
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {results.map((player) => (
                <div
                  key={player.socketId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: 'var(--bg-3)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 14, fontWeight: 800,
                    color: 'var(--accent)', flexShrink: 0, position: 'relative',
                  }}>
                    {player.name[0].toUpperCase()}
                    <div style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 10, height: 10, borderRadius: '50%',
                      background: statusColor(player.status),
                      border: '2px solid var(--bg-1)',
                    }} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {player.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 6 }}>
                      <span style={{ color: statusColor(player.status) }}>● {statusLabel(player.status)}</span>
                      <span>{universe === 'chess' ? `♟ ${player.rating.chess}` : `⬤ ${player.rating.checkers}`}</span>
                    </div>
                  </div>

                  {/* Challenge button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onInvite(player);
                      setQuery('');
                      setFocused(false);
                    }}
                    disabled={player.status === 'playing'}
                    style={{
                      padding: '5px 10px', background: player.status === 'playing' ? 'var(--bg-3)' : 'var(--accent)',
                      border: 'none', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      color: player.status === 'playing' ? 'var(--text-3)' : '#000',
                      cursor: player.status === 'playing' ? 'default' : 'pointer',
                      flexShrink: 0, fontFamily: 'var(--font)',
                      transition: 'background 0.15s',
                    }}
                  >
                    {player.status === 'playing' ? 'In game' : '⚔️ Challenge'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer: join by code shortcut */}
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-2)' }}>
            <button
              onClick={() => { setFocused(false); setQuery(''); onInvite({ socketId: '__code__', name: '', rating: { chess: 0, checkers: 0 }, status: 'idle', universe }); }}
              style={{
                width: '100%', padding: '8px', background: 'none',
                border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-2)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)'; }}
            >
              🔑 Join by room code instead
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
