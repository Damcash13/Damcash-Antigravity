import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInviteStore, OnlinePlayer } from '../../stores/inviteStore';
import { useUniverseStore } from '../../stores';
import { api, ApiUserProfile } from '../../lib/api';
import { countryFlag } from '../../lib/countries';

interface Props {
  onInvite: (player: OnlinePlayer) => void;
}

export const PlayerSearchBar: React.FC<Props> = ({ onInvite }) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [directoryResults, setDirectoryResults] = useState<ApiUserProfile[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const { onlinePlayers } = useInviteStore();
  const { universe } = useUniverseStore();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const universePlayers = onlinePlayers.filter((p) => p.universe === universe);
  const trimmedQuery = query.trim();

  // Filter local online players by query
  const onlineResults = trimmedQuery.length >= 1
    ? universePlayers
        .filter((p) => p.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
        .slice(0, 6)
    : universePlayers.slice(0, 6);   // show first 6 when focused with no query

  const onlineNames = new Set(onlineResults.map(p => p.name.toLowerCase()));
  const profileResults = trimmedQuery.length >= 1
    ? directoryResults
        .filter((p) => !onlineNames.has(p.username.toLowerCase()))
        .slice(0, Math.max(0, 8 - onlineResults.length))
    : [];
  const showDrop = focused && (trimmedQuery.length >= 1 || universePlayers.length > 0);

  useEffect(() => {
    if (trimmedQuery.length < 1) {
      setDirectoryResults([]);
      setDirectoryLoading(false);
      return;
    }

    let active = true;
    setDirectoryLoading(true);
    const timer = setTimeout(() => {
      api.users.search(trimmedQuery, { universe, playedOnly: true })
        .then((players) => {
          if (active) setDirectoryResults(players);
        })
        .catch(() => {
          if (active) setDirectoryResults([]);
        })
        .finally(() => {
          if (active) setDirectoryLoading(false);
        });
    }, 180);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [trimmedQuery]);

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

  const viewProfile = (username: string) => {
    setQuery('');
    setFocused(false);
    navigate(`/${universe}/profile/${encodeURIComponent(username)}`);
  };

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
            <span style={{ color: 'var(--accent)' }}>{universePlayers.length} online</span>
          </div>

          {onlineResults.length === 0 && profileResults.length === 0 && !directoryLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              {trimmedQuery ? `No players found for "${trimmedQuery}"` : 'No players online yet'}
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {onlineResults.length > 0 && (
                <div style={{ padding: '8px 14px 4px', color: 'var(--text-3)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Online now
                </div>
              )}
              {onlineResults.map((player) => (
                <div
                  key={player.socketId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => viewProfile(player.name)}
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
                      <span style={{ color: statusColor(player.status) }}>{statusLabel(player.status)}</span>
                      <span>{universe === 'chess' ? player.rating.chess : player.rating.checkers}</span>
                      {player.country && <span title={player.country}>{countryFlag(player.country)}</span>}
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
                    {player.status === 'playing' ? 'In game' : 'Challenge'}
                  </button>
                </div>
              ))}

              {trimmedQuery && (profileResults.length > 0 || directoryLoading) && (
                <div style={{ padding: '8px 14px 4px', color: 'var(--text-3)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', borderTop: onlineResults.length ? '1px solid var(--border)' : 'none' }}>
                  Players
                </div>
              )}
              {directoryLoading && profileResults.length === 0 ? (
                <div style={{ padding: '12px 14px', color: 'var(--text-3)', fontSize: 12 }}>
                  Searching...
                </div>
              ) : profileResults.map((player) => {
                const rating = universe === 'chess' ? player.chessRating : player.checkersRating;
                return (
                  <div
                    key={player.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', cursor: 'pointer', transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => viewProfile(player.username)}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: 'var(--bg-3)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 14, fontWeight: 800,
                      color: 'var(--text-2)', flexShrink: 0,
                    }}>
                      {player.username[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {player.username}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 6 }}>
                        <span>{rating}</span>
                        {player.country && <span title={player.country}>{countryFlag(player.country)}</span>}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        viewProfile(player.username);
                      }}
                      style={{
                        padding: '5px 10px', background: 'transparent',
                        border: '1px solid var(--border)', borderRadius: 20, fontSize: 11, fontWeight: 700,
                        color: 'var(--text-2)', cursor: 'pointer', flexShrink: 0, fontFamily: 'var(--font)',
                      }}
                    >
                      Profile
                    </button>
                  </div>
                );
              })}
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
