import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUniverseStore, useUserStore } from '../../stores';
import { useCorrespondenceStore, CorrGame } from '../../stores/correspondenceStore';

const DAY_MS = 86_400_000;

const TIME_OPTIONS = [
  { label: '1 day',  value: DAY_MS,      icon: '⚡' },
  { label: '3 days', value: 3 * DAY_MS,  icon: '🌙' },
  { label: '7 days', value: 7 * DAY_MS,  icon: '📅' },
  { label: '14 days',value: 14 * DAY_MS, icon: '🗓️' },
];

function timeLeft(game: CorrGame): string {
  const deadline = game.lastMovedAt + game.timePerMove;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return 'Time out';
  const d = Math.floor(remaining / DAY_MS);
  const h = Math.floor((remaining % DAY_MS) / 3_600_000);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const d = Math.floor(diff / DAY_MS);
  const h = Math.floor((diff % DAY_MS) / 3_600_000);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return 'just now';
}

type Panel = 'list' | 'create';

export const CorrespondenceTab: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { universe } = useUniverseStore();
  const { user } = useUserStore();
  const { games, createGame } = useCorrespondenceStore();
  const [panel, setPanel] = useState<Panel>('list');
  const [selectedTime, setSelectedTime] = useState(DAY_MS);
  const [opponentName, setOpponentName] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'waiting' | 'ended'>('all');

  const myName = user?.name || 'Guest';

  const filtered = games.filter(g =>
    g.universe === universe &&
    (filterStatus === 'all' || g.status === filterStatus)
  );

  const handleCreate = async () => {
    const game = await createGame({
      universe,
      timePerMove: selectedTime,
      myName,
      opponentName: opponentName.trim() || undefined,
    });
    navigate(`/${universe}/correspondence/${game.id}`);
  };

  const isMyTurn = (g: CorrGame) =>
    g.status === 'active' && g.currentTurn === g.myColor;

  return (
    <div className="corr-container">
      {/* ── Header ── */}
      <div className="corr-header">
        <div>
          <h2 className="corr-title">✉️ {t('correspondence.title')}</h2>
          <p className="corr-subtitle">{t('correspondence.timePerMove')}</p>
        </div>
        <div className="corr-header-actions">
          <button
            className={`corr-tab-btn ${panel === 'list' ? 'active' : ''}`}
            onClick={() => setPanel('list')}
          >
            📋 {t('correspondence.yourGames')}
          </button>
          <button
            className={`corr-tab-btn ${panel === 'create' ? 'active' : ''}`}
            onClick={() => setPanel('create')}
          >
            ➕ {t('correspondence.newGame')}
          </button>
        </div>
      </div>

      {/* ── Create panel ── */}
      {panel === 'create' && (
        <div className="corr-create-panel">
          <div className="corr-section-label">Time per move</div>
          <div className="corr-time-grid">
            {TIME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`corr-time-btn ${selectedTime === opt.value ? 'active' : ''}`}
                onClick={() => setSelectedTime(opt.value)}
              >
                <span className="corr-time-icon">{opt.icon}</span>
                <span className="corr-time-label">{opt.label}</span>
              </button>
            ))}
          </div>

          <div className="corr-section-label" style={{ marginTop: 20 }}>
            {t('correspondence.opponentUsername')}
          </div>
          <input
            className="corr-input"
            placeholder={t('correspondence.vsAnyone')}
            value={opponentName}
            onChange={e => setOpponentName(e.target.value)}
          />

          <div className="corr-create-summary">
            <span>🌐 {universe === 'chess' ? t('profile.chess') : t('profile.checkers')}</span>
            <span>⏱ {TIME_OPTIONS.find(o => o.value === selectedTime)?.label} / {t('correspondence.timePerMove')}</span>
            {opponentName && <span>👤 {opponentName}</span>}
          </div>

          <button className="btn btn-accent corr-create-btn" onClick={handleCreate}>
            {t('correspondence.startNewGame')}
          </button>
        </div>
      )}

      {/* ── Games list ── */}
      {panel === 'list' && (
        <>
          {/* Status filter chips */}
          <div className="corr-filter-row">
            {(['all', 'active', 'waiting', 'ended'] as const).map(s => (
              <button
                key={s}
                className={`corr-filter-chip ${filterStatus === s ? 'active' : ''}`}
                onClick={() => setFilterStatus(s)}
              >
                {s === 'all' ? t('leaderboard.viewAll') : s === 'active' ? `🎮 ${t('correspondence.active')}` : s === 'waiting' ? `⏳ ${t('correspondence.waiting')}` : `✅ ${t('correspondence.ended')}`}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="corr-empty">
              <div style={{ fontSize: 48, marginBottom: 12 }}>✉️</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{t('correspondence.noGames')}</div>
              <button className="btn btn-accent" onClick={() => setPanel('create')}>
                {t('correspondence.startNewGame')}
              </button>
            </div>
          ) : (
            <div className="corr-game-list">
              {filtered.map(g => {
                const myTurn = isMyTurn(g);
                return (
                  <div
                    key={g.id}
                    className={`corr-game-card ${myTurn ? 'my-turn' : ''} ${g.status === 'ended' ? 'ended' : ''}`}
                    onClick={() => navigate(`/${g.universe}/correspondence/${g.id}`)}
                  >
                    {/* Left: turn indicator + avatar */}
                    <div className="corr-card-left">
                      <div className={`corr-turn-dot ${myTurn ? 'your-turn' : ''}`} />
                    </div>

                    {/* Middle: game info */}
                    <div className="corr-card-body">
                      <div className="corr-card-players">
                        <span className={`corr-color-badge ${g.myColor}`} />
                        <strong>{g.whitePlayer}</strong>
                        <span style={{ color: 'var(--text-3)', margin: '0 4px' }}>vs</span>
                        <strong>{g.blackPlayer}</strong>
                      </div>
                      <div className="corr-card-meta">
                        <span>{g.universe === 'chess' ? `♟ ${t('profile.chess')}` : `⬤ ${t('profile.checkers')}`}</span>
                        <span>·</span>
                        <span>{TIME_OPTIONS.find(o => o.value === g.timePerMove)?.label ?? '?'}/move</span>
                        <span>·</span>
                        <span>{g.moves.length} moves</span>
                        <span>·</span>
                        <span>{timeAgo(g.lastMovedAt)}</span>
                      </div>
                    </div>

                    {/* Right: status badge + time left */}
                    <div className="corr-card-right">
                      {g.status === 'ended' ? (
                        <span className="corr-status-badge ended">
                          {g.result === 'draw' ? '½-½' : g.result === g.myColor ? `${t('game.youWon')} ✓` : t('game.youLost')}
                        </span>
                      ) : g.status === 'waiting' ? (
                        <span className="corr-status-badge waiting">⏳ {t('correspondence.waiting')}</span>
                      ) : myTurn ? (
                        <span className="corr-status-badge your-turn">🔔 {t('correspondence.yourTurn')}</span>
                      ) : (
                        <div>
                          <div className="corr-status-badge waiting">⏳ {t('correspondence.theirTurn')}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, textAlign: 'right' }}>
                            {timeLeft(g)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
