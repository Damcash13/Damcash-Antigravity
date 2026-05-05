import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFriendsStore, Friend } from '../../stores/friendsStore';
import { useUniverseStore } from '../../stores';
import { socket } from '../../lib/socket';
import { api } from '../../lib/api';
import { countryFlag, countryName } from '../../lib/countries';

// ── Friend row ────────────────────────────────────────────────────────────────
const FriendRow: React.FC<{ f: Friend; canChallenge: boolean; onChallenge: () => void; onRemove: () => void }> = ({ f, canChallenge, onChallenge, onRemove }) => {
  const { t } = useTranslation();
  const universe = useUniverseStore(s => s.universe);
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', borderRadius: 8,
        background: hover ? 'var(--bg-2)' : 'transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'var(--bg-3)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 12, fontWeight: 700,
        color: f.online ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0,
      }}>
        {f.name[0]?.toUpperCase()}
      </div>

      {/* Name + status */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: f.online ? 'var(--text-1)' : 'var(--text-3)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {f.country && (
            <span className="player-inline-flag" title={countryName(f.country)}>
              {countryFlag(f.country)}
            </span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {f.name}
          </span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
          Elo {f.rating[universe]} · {f.online
            ? f.status === 'playing'
              ? `${t('social.inGame')}${f.currentTC ? ` · ${f.currentTC}` : ''}`
            : f.status === 'seeking'
              ? `${t('social.seeking')}${f.currentTC ? ` ${f.currentTC}` : ''}`
            : t('social.onlineStatus')
          : t('social.offline')}
        </div>
      </div>

      {/* Actions (show on hover) */}
      {hover && canChallenge && (
        <button
          onClick={onChallenge}
          style={{
            background: 'var(--accent)', border: 'none', borderRadius: 6,
            color: '#000', padding: '4px 8px', cursor: 'pointer',
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}
          title={t('social.challenge')}
        >
          {t('social.challenge')}
        </button>
      )}
      {hover && (
        <button
          onClick={onRemove}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            color: 'var(--text-3)', padding: '4px 6px', cursor: 'pointer',
            fontSize: 10, flexShrink: 0,
          }}
          title={t('social.removeFriend')}
        >
          Remove
        </button>
      )}
    </div>
  );
};

// ── Pending request row ───────────────────────────────────────────────────────
const RequestRow: React.FC<{
  req: ReturnType<typeof useFriendsStore.getState>['requests'][number];
  onAccept: () => void;
  onDecline: () => void;
}> = ({ req, onAccept, onDecline }) => {
  const { t } = useTranslation();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
      background: 'var(--accent-dim)', borderRadius: 8, marginBottom: 4,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
      }}>
        {req.fromName[0]?.toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{req.fromName}</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{t('social.wantsToBeFriends')}</div>
      </div>
      <button onClick={onAccept} style={{ background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#000', padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Accept</button>
      <button onClick={onDecline} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-2)', padding: '3px 6px', cursor: 'pointer', fontSize: 11 }}>Decline</button>
    </div>
  );
};

// ── Add friend input ──────────────────────────────────────────────────────────
const AddFriendBar: React.FC = () => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [focus, setFocus] = useState(false);

  React.useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const data = await api.users.search(query);
        setResults(data);
      } catch (e) {
        console.error('Search failed', e);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const sendRequest = async (username: string) => {
    try {
      await api.friends.request({ targetUsername: username });
      // Friend request system also emits socket events for real-time notification
      setQuery('');
      setResults([]);
    } catch (e) {
      alert(t('social.requestFailed'));
    }
  };

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', position: 'relative' }}>
      <input
        type="text"
        placeholder={t('social.addFriendPlaceholder')}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore="true"
        data-lpignore="true"
        style={{
          width: '100%', padding: '6px 10px', borderRadius: 7, fontSize: 12,
          background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-1)',
        }}
      />
      {focus && results.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 12, right: 12,
          background: 'var(--bg-1)', border: '1px solid var(--border)',
          borderRadius: 8, overflow: 'hidden', zIndex: 200,
          boxShadow: 'var(--shadow)',
        }}>
          {results.map(p => (
            <button
              key={p.id}
              onClick={() => sendRequest(p.username)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '8px 12px', background: 'none',
                border: 'none', cursor: 'pointer', color: 'var(--text-1)',
                textAlign: 'left', fontSize: 13,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
                {p.rating?.chess ?? '?'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{t('social.add')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main panel ────────────────────────────────────────────────────────────────
interface Props {
  onChallenge: (socketId: string, name: string) => void;
}

export const FriendsPanel: React.FC<Props> = ({ onChallenge }) => {
  const { t } = useTranslation();
  const universe = useUniverseStore(s => s.universe);
  const { friends, requests, removeFriend, addFriend, removeRequest } = useFriendsStore();
  const [collapsed, setCollapsed] = useState(false);

  const incoming = requests.filter(r => r.direction === 'incoming');
  const online   = friends.filter(f => f.online);
  const offline  = friends.filter(f => !f.online);

  const handleAccept = (req: typeof requests[number]) => {
    socket.emit('friend:accept', { fromSocketId: req.fromSocketId });
    addFriend({
      id: req.fromSocketId,
      name: req.fromName,
      rating: req.fromRating,
      online: true,
      status: 'idle',
      socketId: req.fromSocketId,
      addedAt: Date.now(),
    });
    removeRequest(req.id);
  };

  const handleDecline = (reqId: string, fromSocketId: string) => {
    socket.emit('friend:decline', { fromSocketId });
    removeRequest(reqId);
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px 6px', cursor: 'pointer',
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('social.friends')}
          {online.length > 0 && (
            <span style={{ background: '#22c55e20', color: '#22c55e', fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>
              {online.length} {t('social.online')}
            </span>
          )}
          {incoming.length > 0 && (
            <span style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>
              {incoming.length}
            </span>
          )}
        </div>
        <span style={{ color: 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>{collapsed ? 'Show' : 'Hide'}</span>
      </div>

      {!collapsed && (
        <>
          {/* Incoming requests */}
          {incoming.length > 0 && (
            <div style={{ padding: '4px 12px 0' }}>
              {incoming.map(req => (
                <RequestRow
                  key={req.id}
                  req={req}
                  onAccept={() => handleAccept(req)}
                  onDecline={() => handleDecline(req.id, req.fromSocketId)}
                />
              ))}
            </div>
          )}

          {/* Friends list */}
          {friends.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
              {t('social.noFriendsYet')}
            </div>
          ) : (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {[...online, ...offline].map(f => (
                <FriendRow
                  key={f.name}
                  f={f}
                  canChallenge={Boolean(f.socketId && f.universe === universe)}
                  onChallenge={() => f.socketId && onChallenge(f.socketId, f.name)}
                  onRemove={() => removeFriend(f.name)}
                />
              ))}
            </div>
          )}

          {/* Add friend */}
          <AddFriendBar />
        </>
      )}
    </div>
  );
};
