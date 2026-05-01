import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { socket } from '../../lib/socket';
import { useUserStore, useUniverseStore } from '../../stores';
import { useInviteStore, GameConfig, DEFAULT_CONFIG } from '../../stores/inviteStore';

// ── Sub-components ────────────────────────────────────────────────────────────

const TIME_CONTROLS = [
  { value: '1+0',   label: '1+0',   catKey: 'time.bullet'    },
  { value: '2+1',   label: '2+1',   catKey: 'time.bullet'    },
  { value: '3+0',   label: '3+0',   catKey: 'time.blitz'     },
  { value: '3+2',   label: '3+2',   catKey: 'time.blitz'     },
  { value: '5+0',   label: '5+0',   catKey: 'time.blitz'     },
  { value: '5+3',   label: '5+3',   catKey: 'time.blitz'     },
  { value: '10+0',  label: '10+0',  catKey: 'time.rapid'     },
  { value: '10+5',  label: '10+5',  catKey: 'time.rapid'     },
  { value: '15+10', label: '15+10', catKey: 'time.rapid'     },
  { value: '30+0',  label: '30+0',  catKey: 'time.classical' },
];

const CAT_COLORS: Record<string, string> = {
  'time.bullet': '#ef4444', 'time.blitz': '#f59e0b', 'time.rapid': 'var(--accent)', 'time.classical': '#3b82f6',
};

const BET_PRESETS = [0, 5, 10, 25, 50, 100];

interface Props {
  open: boolean;
  onClose: () => void;
}

export const GameConfigModal: React.FC<Props> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useUserStore();
  const { universe: currentUniverse } = useUniverseStore();
  const { configTarget, setMyRoom } = useInviteStore();

  const [config, setConfig] = useState<GameConfig>({
    ...DEFAULT_CONFIG,
    universe: currentUniverse,
  });
  const [customBet, setCustomBet] = useState('');
  const [step, setStep] = useState<'config' | 'code' | 'waiting'>('config');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'invite' | 'create' | 'join'>(() =>
    configTarget ? 'invite' : 'create'
  );

  // Reset when opened
  useEffect(() => {
    if (open) {
      setStep('config');
      setRoomCode(null);
      setCopied(false);
      setJoinCode('');
      setMode(configTarget ? 'invite' : 'create');
      setConfig({ ...DEFAULT_CONFIG, universe: currentUniverse });
    }
  }, [open, configTarget, currentUniverse]);

  // Listen for room created
  useEffect(() => {
    const handleRoomCreated = (data: { code: string }) => {
      setRoomCode(data.code);
      setMyRoom(data.code, config);
      setStep('code');
    };
    const handleInviteAccepted = () => {
      onClose(); // Close the modal because we are about to be redirected to the game
    };
    socket.on('room:created', handleRoomCreated);
    socket.on('invite:accepted', handleInviteAccepted);
    return () => {
      socket.off('room:created', handleRoomCreated);
      socket.off('invite:accepted', handleInviteAccepted);
    };
  }, [config, setMyRoom]);



  if (!open) return null;

  const effectiveBet = customBet ? parseInt(customBet) || 0 : config.betAmount;

  const handleSendInvite = () => {
    if (!configTarget) return;
    socket.emit('invite:send', {
      targetSocketId: configTarget.socketId,
      config: { ...config, betAmount: effectiveBet },
      fromName: user?.name || 'Guest',
      fromRating: user?.rating[config.universe] || 1500,
    });
    setStep('waiting');
  };

  const handleCreateRoom = () => {
    socket.emit('room:create', {
      config: { ...config, betAmount: effectiveBet },
      creatorName: user?.name || 'Guest',
    });
  };

  const handleJoinByCode = () => {
    if (!joinCode.trim()) return;
    socket.emit('room:join', {
      code: joinCode.trim().toUpperCase(),
      joinerName: user?.name || 'Guest',
      joinerRating: user?.rating[config.universe] || 1500,
    });
  };

  const handleCopyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyLink = () => {
    if (roomCode) {
      navigator.clipboard.writeText(`${window.location.origin}/join/${roomCode}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-1)', border: '1px solid var(--border)',
          borderRadius: 16, width: 480, maxWidth: '95vw', maxHeight: '90vh',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          animation: 'slideUp 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-2)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>
              {configTarget
                ? `⚔️ ${t('nav.challengeFriend')} ${configTarget.name}`
                : mode === 'join' ? `🔑 ${t('createGame.joinByCode')}` : `🎮 ${t('nav.createGame')}`}
            </div>
            {step === 'config' && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {t('createGame.configureSettings')}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-2)',
              fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4 }}
          >✕</button>
        </div>

        {/* Mode tabs (only when no target) */}
        {!configTarget && step === 'config' && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[
              { key: 'create', label: `🔗 ${t('createGame.createRoom').split('&')[0].trim()}` },
              { key: 'join',   label: `🔑 ${t('createGame.joinByCode')}` },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key as any)}
                style={{
                  flex: 1, padding: '10px', border: 'none', background: 'none',
                  color: mode === m.key ? 'var(--accent)' : 'var(--text-2)',
                  borderBottom: `2px solid ${mode === m.key ? 'var(--accent)' : 'transparent'}`,
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  fontFamily: 'var(--font)', transition: 'all 0.2s',
                }}
              >{m.label}</button>
            ))}
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* ── JOIN BY CODE ── */}
          {mode === 'join' && step === 'config' && (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ textAlign: 'center', fontSize: 48 }}>🔑</div>
              <div>
                <label style={labelStyle}>{t('createGame.enterCode')}</label>
                <input
                  autoFocus
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="ABC123"
                  maxLength={6}
                  style={{
                    ...inputStyle,
                    fontSize: 28, fontWeight: 800, letterSpacing: 8,
                    textAlign: 'center', textTransform: 'uppercase',
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJoinByCode(); }}
                />
                <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: 6 }}>
                  {t('createGame.askFriend')}
                </div>
              </div>
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={handleJoinByCode}
                disabled={joinCode.length < 4}
              >
                {t('createGame.joinGame')} →
              </button>
            </div>
          )}

          {/* ── CONFIG FORM (invite or create) ── */}
          {step === 'config' && mode !== 'join' && (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Universe */}
              <div>
                <label style={labelStyle}>{t('createGame.gameType')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['chess', 'checkers'] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setConfig((c) => ({ ...c, universe: u }))}
                      style={{
                        ...choiceBtn,
                        borderColor: config.universe === u ? 'var(--accent)' : 'var(--border)',
                        background: config.universe === u ? 'var(--accent-dim)' : 'var(--bg-2)',
                        color: config.universe === u ? 'var(--accent)' : 'var(--text-2)',
                      }}
                    >
                      {u === 'chess' ? `♟ ${t('profile.chess')}` : `⬤ ${t('profile.checkers')}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time control grid */}
              <div>
                <label style={labelStyle}>{t('tournament.timeControl')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {TIME_CONTROLS.map(({ value, label, catKey }) => (
                    <button
                      key={value}
                      onClick={() => setConfig((c) => ({ ...c, timeControl: value }))}
                      style={{
                        padding: '8px 4px', border: `2px solid ${config.timeControl === value ? CAT_COLORS[catKey] : 'var(--border)'}`,
                        borderRadius: 8, background: config.timeControl === value ? `${CAT_COLORS[catKey]}22` : 'var(--bg-2)',
                        cursor: 'pointer', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: 2, transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: config.timeControl === value ? CAT_COLORS[catKey] : 'var(--text-1)' }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 9, color: CAT_COLORS[catKey], fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t(catKey)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color preference */}
              <div>
                <label style={labelStyle}>{t('createGame.playAs')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { key: 'white',  label: `⬜ ${t('common.white')}` },
                    { key: 'black',  label: `⬛ ${t('common.black')}` },
                    { key: 'random', label: `🎲 ${t('createGame.random')}` },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setConfig((c) => ({ ...c, colorPref: key as any }))}
                      style={{
                        ...choiceBtn, flex: 1,
                        borderColor: config.colorPref === key ? 'var(--accent)' : 'var(--border)',
                        background: config.colorPref === key ? 'var(--accent-dim)' : 'var(--bg-2)',
                        color: config.colorPref === key ? 'var(--accent)' : 'var(--text-2)',
                      }}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* Bet amount */}
              <div>
                <label style={labelStyle}>
                  {t('betting.betAmount')}
                  <span style={{ color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>
                    ({t('betting.balance')}: ${Number(user?.walletBalance ?? 0).toFixed(2) ?? '0.00'})
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {BET_PRESETS.map((b) => (
                    <button
                      key={b}
                      onClick={() => { setConfig((c) => ({ ...c, betAmount: b })); setCustomBet(''); }}
                      style={{
                        padding: '6px 12px', borderRadius: 20,
                        border: `2px solid ${config.betAmount === b && !customBet ? 'var(--accent)' : 'var(--border)'}`,
                        background: config.betAmount === b && !customBet ? 'var(--accent-dim)' : 'var(--bg-2)',
                        color: config.betAmount === b && !customBet ? 'var(--accent)' : 'var(--text-2)',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {b === 0 ? t('createGame.noBet') : `$${b}`}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('createGame.custom')}:</span>
                  <input
                    type="number"
                    placeholder="$0"
                    value={customBet}
                    onChange={(e) => setCustomBet(e.target.value)}
                    min={0}
                    max={user?.walletBalance ?? 1000}
                    style={{ ...inputStyle, width: 100, textAlign: 'right' }}
                  />
                  {effectiveBet > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      → win ${(effectiveBet * 2 * 0.95).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {/* Rated toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t('tournament.rated')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('createGame.affectsRating')}</div>
                </div>
                <button
                  onClick={() => setConfig((c) => ({ ...c, rated: !c.rated }))}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none',
                    background: config.rated ? 'var(--accent)' : 'var(--bg-3)',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', width: 18, height: 18, borderRadius: '50%',
                    background: '#fff', top: 3,
                    left: config.rated ? 23 : 3, transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </button>
              </div>

              {/* Summary */}
              <div style={{
                background: 'var(--bg-2)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '12px 14px',
                display: 'flex', gap: 16, flexWrap: 'wrap',
              }}>
                {[
                  { label: t('createGame.gameType'), value: config.universe === 'chess' ? `♟ ${t('profile.chess')}` : `⬤ ${t('profile.checkers')}` },
                  { label: t('tournament.timeControl'), value: config.timeControl },
                  { label: t('createGame.color'), value: config.colorPref === 'random' ? '🎲' : config.colorPref === 'white' ? '⬜' : '⬛' },
                  { label: t('betting.betAmount'), value: effectiveBet > 0 ? `$${effectiveBet}` : t('createGame.noBet') },
                  { label: t('tournament.rated'), value: config.rated ? '✓' : '✗' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 50 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── WAITING FOR OPPONENT ── */}
          {step === 'waiting' && (
            <div style={{ padding: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, border: '4px solid var(--bg-3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {t('game.waitingForOpponent')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {t('createGame.inviteSent')} · {config.universe} · {config.timeControl}
                {effectiveBet > 0 ? ` · $${effectiveBet}` : ''}
              </div>
              <button className="btn btn-secondary" onClick={() => { socket.emit('invite:cancel'); setStep('config'); }}>
                {t('common.cancel')}
              </button>
            </div>
          )}

          {/* ── ROOM CODE SHARING ── */}
          {step === 'code' && roomCode && (
            <div style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{ fontSize: 14, color: 'var(--text-2)', textAlign: 'center' }}>
                {t('createGame.shareCode')}
              </div>

              {/* Code display */}
              <div style={{
                background: 'var(--bg-2)', border: '2px solid var(--accent)',
                borderRadius: 16, padding: '20px 40px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: 12, color: 'var(--accent)', fontFamily: 'monospace' }}>
                  {roomCode}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                  {t('createGame.expiresIn')}
                </div>
              </div>

              {/* Share buttons */}
              <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCopyCode}>
                  {copied ? `✓ ${t('common.copy')}!` : `📋 ${t('common.copy')}`}
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleCopyLink}>
                  🔗 {t('createGame.copyLink')}
                </button>
              </div>

              {/* QR / share via */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, width: '100%' }}>
                {[
                  { icon: '💬', label: 'WhatsApp', action: () => window.open(`https://wa.me/?text=Join my DamCash game! Code: ${roomCode}`) },
                  { icon: '📧', label: 'Email',    action: () => window.open(`mailto:?subject=DamCash Challenge&body=Join my game! Code: ${roomCode}`) },
                  { icon: '🐦', label: 'Twitter',  action: () => window.open(`https://twitter.com/intent/tweet?text=Join my DamCash game! Code: ${roomCode}`) },
                ].map(({ icon, label, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    style={{
                      padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--border)',
                      borderRadius: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 4, transition: 'border-color 0.15s',
                      fontFamily: 'var(--font)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    <span style={{ fontSize: 20 }}>{icon}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{label}</span>
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
                <div style={{ width: 20, height: 20, border: '2px solid var(--bg-3)', borderTopColor: 'var(--text-3)', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block', verticalAlign: 'middle', marginRight: 8 }} />
                {t('createGame.waitingFriend')}
              </div>
            </div>
          )}
        </div>

        {/* Footer / CTA */}
        {step === 'config' && mode !== 'join' && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-2)', display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: '0 0 auto' }} onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1, fontSize: 15, fontWeight: 800 }}
              onClick={configTarget ? handleSendInvite : handleCreateRoom}
              disabled={effectiveBet > (user?.walletBalance ?? 0) && effectiveBet > 0}
            >
              {configTarget
                ? `⚔️ ${t('createGame.sendChallenge')} ${configTarget.name}`
                : `🔗 ${t('createGame.createRoom')}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: 'var(--text-2)', textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '9px 12px', color: 'var(--text-1)',
  fontSize: 14, fontFamily: 'var(--font)', outline: 'none',
  transition: 'border-color 0.15s',
};

const choiceBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: '2px solid',
  cursor: 'pointer', fontWeight: 700, fontSize: 13,
  transition: 'all 0.15s', fontFamily: 'var(--font)',
};
