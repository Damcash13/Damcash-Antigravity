import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../styles/lobby-room.css';
import { socket } from '../../lib/socket';
import { useUniverseStore, useUserStore } from '../../stores';
import { useInviteStore, OnlinePlayer } from '../../stores/inviteStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { supabase } from '../../lib/supabase';
import { PlayerHoverCard } from '../common/PlayerHoverCard';

const MAX_CHAT_LEN = 300;
function sanitizeChat(str: unknown, maxLen = MAX_CHAT_LEN): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

// ── Types ──────────────────────────────────────────────────────────────────────
export interface PublicSeek {
  seekId: string;
  socketId: string;
  name: string;
  avatarUrl?: string;
  rating: { chess: number; checkers: number };
  timeControl: string;
  universe: 'chess' | 'checkers';
  betAmount: number;
  rated: boolean;
  createdAt: number;
}

export interface LobbyChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  universe: 'chess' | 'checkers';
  text: string;
  timestamp: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function tcCategory(tc: string): { labelKey: string; color: string } {
  const [min] = tc.split('+').map(Number);
  if (min <= 2)  return { labelKey: 'time.bullet',   color: '#ef4444' };
  if (min <= 5)  return { labelKey: 'time.blitz',    color: '#f59e0b' };
  if (min <= 15) return { labelKey: 'time.rapid',    color: '#22c55e' };
  return               { labelKey: 'time.classical', color: '#3b82f6' };
}

function elapsed(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

const TIME_CONTROLS = ['1+0','2+1','3+0','3+2','5+0','5+3','10+0','10+5','15+10','30+0'];
const BET_PRESETS   = [0, 5, 10, 25, 50, 100];

// ── Posting form (inline, compact) ────────────────────────────────────────────
const PostSeekForm: React.FC<{ onPost: () => void; onCancel: () => void }> = ({ onPost, onCancel }) => {
  const { t } = useTranslation();
  const { universe } = useUniverseStore();
  const { user } = useUserStore();
  const [tc,       setTc]       = useState('5+0');
  const [bet,      setBet]      = useState(0);
  const [rated,    setRated]    = useState(!!user);
  const [customBet,setCustomBet]= useState('');

  const handlePost = () => {
    socket.emit('seek', {
      timeControl: tc,
      universe,
      betAmount: customBet ? Math.max(0, parseFloat(customBet) || 0) : bet,
      rated,
    });
    onPost();
  };

  return (
    <div className="lobby-post-form">
      <div className="lpf-header">
        <span className="lpf-title">{t('lobby.postTable')}</span>
        <button className="lpf-cancel" onClick={onCancel}>×</button>
      </div>

      <div className="lpf-field-label">{t('tournament.timeControl')}</div>
      <div className="lpf-tc-grid">
        {TIME_CONTROLS.map(tcVal => {
          const { color } = tcCategory(tcVal);
          return (
            <button
              key={tcVal}
              className={`lpf-tc-btn ${tc === tcVal ? 'active' : ''}`}
              style={{
                borderColor:  tc === tcVal ? color : undefined,
                background:   tc === tcVal ? `${color}22` : undefined,
                color:        tc === tcVal ? color : undefined,
              }}
              onClick={() => setTc(tcVal)}
            >
              {tcVal}
            </button>
          );
        })}
      </div>

      <div className="lpf-field-label" style={{ marginTop: 12 }}>{t('lobby.wager')}</div>
      <div className="lpf-bet-row">
        {BET_PRESETS.map(b => (
          <button
            key={b}
            className={`lpf-bet-btn ${customBet === '' && bet === b ? 'active' : ''}`}
            onClick={() => { setBet(b); setCustomBet(''); }}
          >
            {b === 0 ? t('lobby.free') : `$${b}`}
          </button>
        ))}
        <input
          type="number" min="0" placeholder="$?"
          value={customBet}
          onChange={e => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setCustomBet(v); }}
          className="lpf-custom-input"
        />
      </div>

      <div className="lpf-rated-row">
        <button
          className={`lpf-toggle ${rated ? 'on' : ''}`}
          onClick={() => setRated(r => !r)}
        >
          <div className="lpf-toggle-thumb" />
        </button>
        <span className="lpf-rated-label">
          {rated ? t('tournament.rated') : t('lobby.casual')}
        </span>
        {user && (
          <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>
            ({universe === 'chess' ? user.rating.chess : user.rating.checkers})
          </span>
        )}
      </div>

      <button className="lpf-submit" onClick={handlePost}>
        {t('lobby.postOpenTable')}
      </button>
    </div>
  );
};

// ── Status label ──────────────────────────────────────────────────────────────
const StatusDot: React.FC<{ status: OnlinePlayer['status'] }> = ({ status }) => {
  const { t } = useTranslation();
  return (
    <span
      style={{
        color: status === 'playing' ? '#ef4444' : status === 'seeking' ? '#f59e0b' : '#22c55e',
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {status === 'playing' ? t('lobby.playing') : status === 'seeking' ? t('lobby.seeking') : t('lobby.idle')}
    </span>
  );
};

// ── Main export ───────────────────────────────────────────────────────────────
interface Props {
  onMatchFound: (roomId: string, myColor: 'w' | 'b') => void;
}

export const LobbyTab: React.FC<Props> = ({ onMatchFound }) => {
  const { t } = useTranslation();
  const { universe } = useUniverseStore();
  const { user } = useUserStore();
  const { onlinePlayers } = useInviteStore();
  const blockedUsers = useSafetyStore(s => s.blockedUsers);
  const mutedUsers = useSafetyStore(s => s.mutedUsers);
  const muteUser = useSafetyStore(s => s.muteUser);
  const unmuteUser = useSafetyStore(s => s.unmuteUser);
  const [seeks,       setSeeks]       = useState<PublicSeek[]>([]);
  const [seekExpired, setSeekExpired] = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [rightTab,    setRightTab]    = useState<'players' | 'chat'>('chat');
  const [chatMessages,setChatMessages]= useState<LobbyChatMessage[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [chatMuted,   setChatMuted]   = useState(false);
  const [lobbyChannel, setLobbyChannel] = useState<any>(null);
  const chatRef = React.useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);
  const isBlockedName = (name: string) => blockedUsers.includes(name.trim().toLowerCase());
  const isMutedName = (name: string) => mutedUsers.includes(name.trim().toLowerCase());

  // Refresh age counters
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  // Socket: seek list
  useEffect(() => {
    const h = (list: PublicSeek[]) => setSeeks(list);
    socket.on('seeks:list', h);
    // Request current list on mount so we don't have to wait for a new seek
    socket.emit('seeks:request');
    return () => socket.off('seeks:list', h);
  }, []);

  // Supabase: Presence & Chat
  useEffect(() => {
    if (!supabase || !user) return;

    const { initPresence } = useInviteStore.getState();
    initPresence(user.name, user.rating);

    const channel = supabase.channel('lobby');

    channel
      .on('broadcast', { event: 'chat' }, ({ payload }: { payload: any }) => {
        const safe: LobbyChatMessage = {
          id: sanitizeChat(payload?.id, 20) || Math.random().toString(36).substring(7),
          senderId: sanitizeChat(payload?.senderId, 50),
          senderName: sanitizeChat(payload?.senderName, 30),
          universe: payload?.universe === 'checkers' ? 'checkers' : 'chess',
          text: sanitizeChat(payload?.text),
          timestamp: typeof payload?.timestamp === 'number' ? payload.timestamp : Date.now(),
        };
        if (!safe.text) return;
        setChatMessages(prev => [...prev.slice(-49), safe]);
      })
      .subscribe();

    setLobbyChannel(channel);

    return () => {
      channel.unsubscribe();
    };
  }, [user]);



  // Socket: seek expired after 120s
  useEffect(() => {
    const h = () => {
      setSeekExpired(true);
      setShowForm(false);
      setTimeout(() => setSeekExpired(false), 4_000);
    };
    socket.on('seek:expired', h);
    return () => socket.off('seek:expired', h);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (rightTab === 'chat' && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages, rightTab]);

  const handleSendChat = () => {
    if (!chatInput.trim() || !lobbyChannel || !user) return;
    const safeText = sanitizeChat(chatInput);
    if (!safeText) return;
    const msg: LobbyChatMessage = {
      id: Math.random().toString(36).substring(7),
      senderId: user.id,
      senderName: sanitizeChat(user.name, 30),
      universe,
      text: safeText,
      timestamp: Date.now(),
    };
    lobbyChannel.send({
      type: 'broadcast',
      event: 'chat',
      payload: msg,
    });
    setChatMessages(prev => [...prev.slice(-49), msg]);
    setChatInput('');
  };

  const handleAccept = (seek: PublicSeek) => socket.emit('seek:accept', { seekId: seek.seekId });
  const handleCancel = () => { socket.emit('seek:cancel'); };

  const visibleSeeks = seeks.filter(s => s.universe === universe && !isBlockedName(s.name));
  const mySeek       = visibleSeeks.find(s => s.socketId === socket.id);

  // Filter online players to the active universe only.
  const universePlayers = onlinePlayers.filter(p => p.universe === universe);
  const filteredPlayers = universePlayers.filter(p =>
    !isBlockedName(p.name) &&
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalOnline = universePlayers.filter(p => !isBlockedName(p.name)).length;
  const visibleChatMessages = chatMuted ? [] : chatMessages.filter(m => {
    const isMe = m.senderName === user?.name || m.senderId === user?.id || m.senderId === socket.id;
    return m.universe === universe && (isMe || (!isBlockedName(m.senderName) && !isMutedName(m.senderName)));
  });

  const universeName = universe === 'chess' ? t('profile.chess') : t('profile.checkers');

  return (
    <div className="lobby-room-layout">
      {seekExpired && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '10px 18px',
          color: 'var(--text-1)', fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {t('lobby.seekExpired')}
        </div>
      )}

      {/* ══ LEFT: Waiting Room ══════════════════════════════════════════════ */}
      <div className="lobby-waiting-col">

        {/* Header */}
        <div className="lobby-col-header">
          <div>
            <div className="lobby-col-title">{t('lobby.openTables')}</div>
            <div className="lobby-col-sub">
              {visibleSeeks.length} {t('lobby.openTables').toLowerCase()} · {universeName}
            </div>
          </div>
          {!mySeek && !showForm && (
            <button className="lobby-post-btn" onClick={() => setShowForm(true)}>
              {t('lobby.postTable')}
            </button>
          )}
        </div>

        {/* Inline post form */}
        {showForm && !mySeek && (
          <PostSeekForm
            onPost={() => setShowForm(false)}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* MY SEEK BANNER */}
        {mySeek && (
          <div className="lobby-my-seek-banner">
            <div className="lobby-seek-pulse" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>
                {t('lobby.waitingOpponent')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                {mySeek.timeControl} · {mySeek.rated ? t('tournament.rated') : t('lobby.casual')}
                {mySeek.betAmount > 0 && ` · $${mySeek.betAmount}`}
              </div>
            </div>
            <button className="lobby-cancel-seek" onClick={handleCancel}>
              {t('common.cancel')}
            </button>
          </div>
        )}

        {/* SEEKS TABLE */}
        {visibleSeeks.length === 0 ? (
          <div className="lobby-empty-state">
            <div style={{ fontWeight: 700, color: 'var(--text-2)', marginTop: 8 }}>{t('lobby.noOpenTablesYet')}</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
              {t('lobby.beFirst')}
            </div>
          </div>
        ) : (
          <div className="lobby-seeks-table">
            {/* Table header */}
            <div className="lobby-table-head">
              <span>{t('common.player')}</span>
              <span>{t('common.rating')}</span>
              <span>{t('lobby.control')}</span>
              <span>{t('lobby.wager')}</span>
              <span>{t('lobby.age')}</span>
              <span></span>
            </div>

            {visibleSeeks.map(seek => {
              const { labelKey, color } = tcCategory(seek.timeControl);
              const isMine = seek.socketId === socket.id;
              const ratingVal = universe === 'chess' ? seek.rating?.chess : seek.rating?.checkers;

              return (
                <div
                  key={seek.seekId}
                  className={`lobby-seek-row ${isMine ? 'mine' : ''}`}
                >
                  {/* Avatar + Name */}
                  <div className="lobby-seek-player">
                    <div className="lobby-seek-avatar" style={{ background: isMine ? 'var(--accent)' : undefined }}>
                      {seek.avatarUrl ? (
                        <img src={seek.avatarUrl} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        seek.name[0]?.toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="lobby-seek-name">
                        {seek.name}
                        {isMine && <span className="lobby-you-badge">{t('lobby.you')}</span>}
                      </div>
                      <div className="lobby-seek-meta">
                        {seek.rated ? t('tournament.rated') : t('lobby.casual')}
                      </div>
                    </div>
                  </div>

                  {/* Rating */}
                  <div className="lobby-seek-cell">{ratingVal ?? '?'}</div>

                  {/* Time control */}
                  <div className="lobby-seek-cell">
                    <span className="lobby-tc-badge" style={{ color, background: `${color}18` }}>
                      {seek.timeControl}
                    </span>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, textAlign: 'center' }}>{t(labelKey)}</div>
                  </div>

                  {/* Wager */}
                  <div className="lobby-seek-cell">
                    {seek.betAmount > 0 ? (
                      <span className="lobby-bet-badge">${seek.betAmount}</span>
                    ) : (
                      <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{t('lobby.free')}</span>
                    )}
                  </div>

                  {/* Age */}
                  <div className="lobby-seek-cell lobby-age">{elapsed(seek.createdAt)}</div>

                  {/* Action */}
                  <div className="lobby-seek-action">
                    {isMine ? (
                      <button className="lobby-cancel-btn" onClick={handleCancel}>{t('common.cancel')}</button>
                    ) : (
                      <button className="lobby-join-btn" onClick={() => handleAccept(seek)}>
                        {t('tournament.join')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ RIGHT: Online Players & Global Chat ═══════════════════════════════ */}
      <div className="lobby-players-col" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 620 }}>

        {/* Tabs */}
        <div className="lobby-right-tabs">
          <button
            className={`lobby-rtab ${rightTab === 'chat' ? 'active' : ''}`}
            onClick={() => setRightTab('chat')}
          >
            {t('lobby.lobbyChat')}
          </button>
          <button
            className={`lobby-rtab ${rightTab === 'players' ? 'active' : ''}`}
            onClick={() => setRightTab('players')}
          >
            {t('lobby.onlinePlayers')} ({totalOnline})
          </button>
        </div>

        {rightTab === 'players' ? (
          <>
            {/* Search */}
            <div className="lobby-search-row">
              <input
                className="lobby-player-search"
                placeholder={t('lobby.searchPlayers')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

        {/* Status legend */}
        <div className="lobby-status-legend">
          <span>{t('lobby.idle')}</span>
          <span>{t('lobby.seeking')}</span>
          <span>{t('lobby.playing')}</span>
        </div>

        {/* Player list */}
        <div className="lobby-player-list">
          {filteredPlayers.length === 0 ? (
            <div className="lobby-empty-state" style={{ padding: '24px 0' }}>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
                {searchQuery ? t('lobby.noPlayersFound') : t('lobby.noOtherPlayers')}
              </div>
            </div>
          ) : (
            filteredPlayers.map(player => {
              const isMe = player.socketId === socket.id;
              const myRating = universe === 'chess'
                ? player.rating.chess
                : player.rating.checkers;

              // Check if this player has an open seek
              const theirSeek = seeks.find(s => s.socketId === player.socketId && s.universe === universe);

              const canChallenge = !isMe && !theirSeek;

              return (
                <PlayerHoverCard
                  key={player.socketId}
                  username={player.name}
                  rating={myRating}
                  wins={0}
                  losses={0}
                  draws={0}
                  games={0}
                  country={player.country}
                >
                  <div
                    className={`lobby-player-card ${isMe ? 'me' : ''} ${canChallenge ? 'actionable' : ''}`}
                  >
                    <div className="lobby-player-avatar" style={{ background: isMe ? 'var(--accent)' : undefined }}>
                      {player.name[0]?.toUpperCase()}
                    </div>
                    <div className="lobby-player-info">
                      <div className="lobby-player-name">
                        {player.name}
                        {isMe && <span className="lobby-you-badge">{t('lobby.you')}</span>}
                      </div>
                      <div className="lobby-player-sub">
                        {myRating}
                        {theirSeek && (
                          <span className="lobby-seeking-pill">
                            {t('lobby.seeking')} {theirSeek.timeControl}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusDot status={theirSeek ? 'seeking' : player.status} />
                      {canChallenge && (
                        <span className="lobby-challenge-btn" aria-label={`Open actions for ${player.name}`}>
                          Actions
                        </span>
                      )}
                      {theirSeek && (
                        <button className="lobby-join-btn" onClick={(e) => { e.stopPropagation(); handleAccept(theirSeek); }}>
                          {t('tournament.join')}
                        </button>
                      )}
                    </div>
                  </div>
                </PlayerHoverCard>
              );
            })
          )}
        </div>
        </>
        ) : (
          <div className="lobby-chat-container">
            <div className="lobby-chat-safety-row">
              <span>Mute/report from usernames. Suspicious games or payments can be sent for review.</span>
              <button
                className={`lobby-chat-mute ${chatMuted ? 'active' : ''}`}
                onClick={() => setChatMuted(v => !v)}
              >
                {chatMuted ? 'Unmute chat' : 'Mute chat'}
              </button>
            </div>
            <div className="lobby-chat-msgs" ref={chatRef}>
              {chatMuted ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  Lobby chat is muted on this device.
                </div>
              ) : visibleChatMessages.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  {t('lobby.welcomeLobby', { universe: universeName })}
                </div>
              ) : (
                visibleChatMessages.map(msg => {
                  const isMe = msg.senderName === user?.name || msg.senderId === user?.id || msg.senderId === socket.id;
                  const chatPlayer = onlinePlayers.find(p => p.name === msg.senderName && p.universe === universe);
                  const chatRating = chatPlayer
                    ? universe === 'chess' ? chatPlayer.rating.chess : chatPlayer.rating.checkers
                    : 1500;
                  const muted = isMutedName(msg.senderName);
                  return (
                    <div key={msg.id} className={`lobby-chat-msg ${isMe ? 'mine' : ''}`}>
                      {!isMe && (
                        <div className="lobby-chat-meta">
                          <PlayerHoverCard
                            username={msg.senderName}
                            rating={chatRating}
                            wins={0}
                            losses={0}
                            draws={0}
                            games={0}
                            country={chatPlayer?.country}
                          >
                            <span className="lobby-chat-name">{msg.senderName}</span>
                          </PlayerHoverCard>
                          <button
                            className="lobby-chat-name-action"
                            onClick={() => muted ? unmuteUser(msg.senderName) : muteUser(msg.senderName)}
                          >
                            {muted ? 'Unmute' : 'Mute'}
                          </button>
                        </div>
                      )}
                      <div className="lobby-chat-bubble">{msg.text}</div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="lobby-chat-input-row">
              <input
                className="lobby-chat-input"
                placeholder={chatMuted ? 'Chat is muted' : t('lobby.typeMessage')}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
                maxLength={200}
                disabled={chatMuted}
              />
              <button className="lobby-chat-send" onClick={handleSendChat} disabled={chatMuted}>Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
