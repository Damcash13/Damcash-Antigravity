import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../common/Modal';
import { api, ApiConversation, ApiDirectMessage } from '../../lib/api';
import { useDirectMessageStore } from '../../stores/directMessageStore';
import { useNotificationStore, useUserStore } from '../../stores';
import { useSafetyStore } from '../../stores/safetyStore';
import { socket } from '../../lib/socket';
import { formatLocalDateTime } from '../../lib/timezone';

const formatTime = (value: string) =>
  formatLocalDateTime(value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }, true);

export const DirectMessagesModal: React.FC = () => {
  const { open, initialUsername, close, setUnreadCount } = useDirectMessageStore();
  const { user, isLoggedIn } = useUserStore();
  const addNotification = useNotificationStore(s => s.addNotification);
  const blockedUsers = useSafetyStore(s => s.blockedUsers);
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ApiDirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);

  const selectedKey = selected?.trim().toLowerCase() || '';
  const isBlocked = selectedKey ? blockedUsers.includes(selectedKey) : false;

  const totalUnread = useMemo(
    () => conversations.reduce((sum, item) => sum + item.unreadCount, 0),
    [conversations],
  );

  const loadConversations = async () => {
    if (!isLoggedIn) return;
    setLoadingConversations(true);
    setError('');
    try {
      const result = await api.messages.conversations();
      setConversations(result.conversations);
      setUnreadCount(result.conversations.reduce((sum, item) => sum + item.unreadCount, 0));
      if (!selected && !initialUsername && result.conversations.length > 0) {
        setSelected(result.conversations[0].otherUsername);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not load messages.');
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadThread = async (username: string) => {
    if (!isLoggedIn || !username) return;
    setLoadingThread(true);
    setError('');
    try {
      const result = await api.messages.thread(username);
      setMessages(result.messages);
      await loadConversations();
    } catch (err: any) {
      setMessages([]);
      setError(err?.message || 'Could not load this conversation.');
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (initialUsername) setSelected(initialUsername);
    loadConversations();
  }, [open, initialUsername, isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !selected) return;
    loadThread(selected);
  }, [open, selected, isLoggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const handleIncoming = (data: { fromUsername: string }) => {
      loadConversations();
      if (selected && data.fromUsername === selected) loadThread(selected);
    };
    socket.on('direct-message:new', handleIncoming);
    return () => {
      socket.off('direct-message:new', handleIncoming);
    };
  }, [open, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, loadingThread]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!selected || !body || sending) return;
    if (isBlocked) {
      addNotification(`Unblock ${selected} before messaging them.`, 'warning');
      return;
    }
    setSending(true);
    setError('');
    try {
      const result = await api.messages.send({ toUsername: selected, body });
      setMessages(prev => [...prev, result.message]);
      setDraft('');
      await loadConversations();
    } catch (err: any) {
      setError(err?.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <Modal open={open} onClose={close} title="Messages" maxWidth={520}>
        <div className="dm-empty">
          <strong>Sign in to use messages.</strong>
          <span>Direct messages are tied to player accounts so conversations can be stored and reviewed safely.</span>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={close} title="Messages" maxWidth={820}>
      <div className="dm-shell">
        <aside className="dm-sidebar">
          <div className="dm-sidebar-head">
            <span>Inbox</span>
            {totalUnread > 0 && <strong>{totalUnread}</strong>}
          </div>
          <button className="dm-refresh" onClick={loadConversations} disabled={loadingConversations}>
            {loadingConversations ? 'Refreshing...' : 'Refresh'}
          </button>
          <div className="dm-conversation-list">
            {loadingConversations && conversations.length === 0 ? (
              <div className="dm-muted">Loading conversations...</div>
            ) : conversations.length === 0 && !selected ? (
              <div className="dm-muted">No messages yet. Click a username and choose Message to start one.</div>
            ) : (
              conversations.map(item => (
                <button
                  key={item.otherUserId}
                  className={`dm-conversation ${selected === item.otherUsername ? 'active' : ''}`}
                  onClick={() => setSelected(item.otherUsername)}
                >
                  <span className="dm-avatar">{item.otherUsername.slice(0, 1).toUpperCase()}</span>
                  <span className="dm-conversation-main">
                    <span className="dm-conversation-name">
                      {item.otherUsername}
                      {item.unreadCount > 0 && <strong>{item.unreadCount}</strong>}
                    </span>
                    <span className="dm-preview">{item.lastBody}</span>
                  </span>
                </button>
              ))
            )}
            {selected && !conversations.some(c => c.otherUsername === selected) && (
              <button className="dm-conversation active" onClick={() => setSelected(selected)}>
                <span className="dm-avatar">{selected.slice(0, 1).toUpperCase()}</span>
                <span className="dm-conversation-main">
                  <span className="dm-conversation-name">{selected}</span>
                  <span className="dm-preview">New conversation</span>
                </span>
              </button>
            )}
          </div>
        </aside>

        <section className="dm-thread">
          {selected ? (
            <>
              <div className="dm-thread-head">
                <div>
                  <strong>{selected}</strong>
                  <span>{isBlocked ? 'Blocked locally' : 'Private conversation'}</span>
                </div>
              </div>
              <div className="dm-messages" ref={messagesRef}>
                {loadingThread ? (
                  <div className="dm-empty">Loading conversation...</div>
                ) : messages.length === 0 ? (
                  <div className="dm-empty">
                    <strong>No messages yet.</strong>
                    <span>Send a short note to start the conversation.</span>
                  </div>
                ) : (
                  messages.map(message => {
                    const mine = message.senderUsername === user?.name || message.senderId === user?.id;
                    return (
                      <div key={message.id} className={`dm-message ${mine ? 'mine' : ''}`}>
                        <div className="dm-bubble">
                          <span>{message.body}</span>
                          <small>{formatTime(message.createdAt)}</small>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {error && <div className="dm-error">{error}</div>}
              <div className="dm-compose">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value.slice(0, 1000))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={isBlocked ? `Unblock ${selected} before messaging.` : `Message ${selected}`}
                  disabled={sending || isBlocked}
                />
                <button className="btn btn-primary" onClick={handleSend} disabled={sending || !draft.trim() || isBlocked}>
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </>
          ) : (
            <div className="dm-empty">
              <strong>Select a conversation.</strong>
              <span>Your messages are stored so you can review them later.</span>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
};
