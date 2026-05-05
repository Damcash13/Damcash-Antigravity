import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUniverseStore, useUserStore } from '../../stores';
import { useTournamentStore, Tournament, TournamentStatus } from '../../stores/tournamentStore';
import { api } from '../../lib/api';
import { socket } from '../../lib/socket';
import { useNotificationStore } from '../../stores';
import '../../styles/tournaments.css';

const STATUS_COLORS: Record<TournamentStatus, string> = {
  upcoming: '#3b82f6',
  running:  '#22c55e',
  finished: 'var(--text-3)',
};

const TIME_CONTROLS = ['1+0', '2+1', '3+0', '3+2', '5+0', '5+3', '10+0', '10+5', '15+10', '30+0'];
const ENTRY_PRESETS = [0, 5, 10, 25, 50, 100];
const PRIZE_PRESETS = [0, 25, 50, 100, 250, 500];
const JOIN_WINDOW_MS = 3 * 60_000;
const PAIRING_CUTOFF_MS = 2 * 60_000;
const FINISHED_VISIBLE_MS = 5 * 60_000;
const MAX_TOURNAMENT_MONEY = 1000;

interface CreateForm {
  name: string;
  icon: string;
  universe: 'chess' | 'checkers';
  format: 'arena' | 'swiss' | 'roundrobin';
  timeControl: string;
  durationMs: number;
  totalRounds: number;
  startsInMinutes: number;
  rated: boolean;
  betEntry: number;
  prizePool: number;
}

const DEFAULT_FORM: CreateForm = {
  name: '',
  icon: '🏆',
  universe: 'chess',
  format: 'arena',
  timeControl: '5+0',
  durationMs: 3600000,
  totalRounds: 0,
  startsInMinutes: 15,
  rated: true,
  betEntry: 0,
  prizePool: 0,
};

interface Props {
  onSelectTournament: (id: string) => void;
}

export const TournamentList: React.FC<Props> = ({ onSelectTournament }) => {
  const { universe } = useUniverseStore();
  const user = useUserStore(s => s.user);
  const { t } = useTranslation();
  const { tournaments, loading, fetchTournaments } = useTournamentStore();
  const addNotification = useNotificationStore(s => s.addNotification);
  const [filter, setFilter] = useState<'all' | TournamentStatus>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateForm>({ ...DEFAULT_FORM, universe: universe as 'chess' | 'checkers' });
  const [now, setNow] = useState(Date.now());

  const formatMoney = (value: number): string => `$${Number(value || 0).toFixed(2)}`;
  const clampMoney = (value: number): number => Math.max(0, Math.min(MAX_TOURNAMENT_MONEY, Number(value) || 0));

  const handleCreate = async () => {
    if (!form.name.trim()) { addNotification('Tournament name is required', 'error'); return; }
    setCreating(true);
    try {
      const startsAt = new Date(Date.now() + form.startsInMinutes * 60 * 1000).toISOString();
      await api.tournaments.create({
        name: form.name.trim(),
        icon: form.icon,
        universe: form.universe,
        format: form.format,
        timeControl: form.timeControl,
        durationMs: form.durationMs,
        totalRounds: form.format === 'arena' ? 0 : form.totalRounds || 7,
        rated: form.rated,
        betEntry: clampMoney(form.betEntry),
        prizePool: clampMoney(form.prizePool),
        description: form.betEntry > 0
          ? `Paid tournament. Entry fee is ${formatMoney(form.betEntry)}; entry fees are added to the prize pool.`
          : `Free tournament. No wallet charge is required to join.`,
        startsAt,
      });
      addNotification('Tournament created!', 'success');
      setShowCreate(false);
      setForm({ ...DEFAULT_FORM, universe: universe as 'chess' | 'checkers' });
      fetchTournaments();
    } catch (e: any) {
      addNotification(e?.message || 'Failed to create tournament', 'error');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => { fetchTournaments(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handleUpdate = () => fetchTournaments();
    socket.on('tournament:global_update', handleUpdate);
    return () => socket.off('tournament:global_update', handleUpdate);
  }, [fetchTournaments]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const FORMAT_LABELS: Record<string, string> = {
    arena: t('tournament.arena'),
    swiss: t('tournament.swiss'),
    roundrobin: t('tournament.roundRobin'),
  };

  const liveStatus = (tObj: Tournament): TournamentStatus => {
    const end = tObj.startsAt + tObj.durationMs;
    if (now >= end) return 'finished';
    if (now >= tObj.startsAt) return 'running';
    return 'upcoming';
  };

  const exactTimeStr = (ts: number): string =>
    new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const shortCountdown = (ms: number): string => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const timeUntilStr = (ts: number): string => {
    const diff = ts - now;
    if (diff <= 0) return t('tournament.running');
    if (diff <= JOIN_WINDOW_MS) return `Waiting room open · ${shortCountdown(diff)}`;
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const relative = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return `Starts ${exactTimeStr(ts)} · in ${relative}`;
  };

  const timeLeftStr = (tObj: Tournament): string => {
    const end = tObj.startsAt + tObj.durationMs;
    const diff = end - now;
    if (diff <= 0) return t('tournament.finished');
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const left = h > 0 ? `${h}h ${m}m` : `${m}m`;
    if (diff <= PAIRING_CUTOFF_MS) return `Pairing closed · ${left} left`;
    return `Late join open · ${left} left`;
  };

  const clarityLine = (tObj: Tournament): string => {
    const status = liveStatus(tObj);
    const waitingRoomAt = tObj.startsAt - JOIN_WINDOW_MS;
    const pairingClosesAt = tObj.startsAt + tObj.durationMs - PAIRING_CUTOFF_MS;
    if (status === 'upcoming') return `Waiting room opens ${exactTimeStr(waitingRoomAt)} (H-3)`;
    if (status === 'running' && now >= pairingClosesAt) return 'Late joins allowed · Pairing closed for final 2 minutes';
    if (status === 'running') return `Late joins allowed · Pairing closes ${exactTimeStr(pairingClosesAt)}`;
    return 'Final standings and games are available';
  };

  const moneyLine = (tObj: Tournament): string => {
    if (tObj.betEntry > 0) {
      return `Entry fee ${formatMoney(tObj.betEntry)} · Prize pool ${formatMoney(tObj.prizePool)} · charged on join`;
    }
    if (tObj.prizePool > 0) return `Free entry · Prize pool ${formatMoney(tObj.prizePool)}`;
    return 'Free entry · No wallet charge';
  };

  const compareTournaments = (a: Tournament, b: Tournament): number => {
    const statusOrder: Record<TournamentStatus, number> = { running: 0, upcoming: 1, finished: 2 };
    const statusA = liveStatus(a);
    const statusB = liveStatus(b);
    if (statusA !== statusB) return statusOrder[statusA] - statusOrder[statusB];
    if (statusA === 'finished') return b.startsAt - a.startsAt;
    return a.startsAt - b.startsAt;
  };

  const isVisibleInLobby = (tObj: Tournament): boolean => {
    if (liveStatus(tObj) !== 'finished') return true;
    return now < tObj.startsAt + tObj.durationMs + FINISHED_VISIBLE_MS;
  };

  const visible = tournaments
    .filter(tObj => tObj.universe === universe)
    .filter(isVisibleInLobby)
    .filter(tObj => filter === 'all' || liveStatus(tObj) === filter)
    .sort(compareTournaments);

  const emptyTitle = filter === 'running'
    ? 'No tournament is running right now'
    : filter === 'upcoming'
    ? 'No upcoming tournaments found'
    : filter === 'finished'
    ? 'No finished tournaments yet'
    : t('tournament.noTournaments');
  const emptyHelp = filter === 'running'
    ? 'Hourly tournaments should run 24/7. Refresh in a few seconds while the scheduler catches up, or create one manually.'
    : filter === 'upcoming'
    ? 'Hourly events are created automatically ahead of time. Refresh in a few seconds or create a tournament now.'
    : filter === 'finished'
    ? 'Finished tournaments stay here for 5 minutes, then move out of the lobby while records remain available from profiles and direct links.'
    : 'Hourly tournaments are created automatically. If this stays empty, the server scheduler may need a restart.';

  return (
    <div className="tl-container">
      <div className="tl-topbar">
        <div>
          <h2 className="tl-title">🏆 {t('lobby.tournaments')}</h2>
          <p className="tl-sub">
            {universe === 'chess' ? `♟ ${t('profile.chess')}` : `⬤ ${t('profile.checkers')}`} · {visible.length}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Filter chips */}
          <div className="tl-filters">
            {(['all', 'running', 'upcoming', 'finished'] as const).map(f => (
              <button
                key={f}
                className={`tl-chip ${filter === f ? 'active' : ''}`}
                style={filter === f && f !== 'all' ? { borderColor: STATUS_COLORS[f as TournamentStatus], color: STATUS_COLORS[f as TournamentStatus] } : {}}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? t('leaderboard.viewAll') : f === 'running' ? `🔴 ${t('tournament.running')}` : f === 'upcoming' ? `⏰ ${t('tournament.upcoming')}` : `✅ ${t('tournament.finished')}`}
              </button>
            ))}
          </div>

          {user && (
            <button
              className="btn btn-primary"
              style={{ whiteSpace: 'nowrap', fontSize: 13 }}
              onClick={() => setShowCreate(true)}
            >
              + {t('tournament.createTournament') || 'Create'}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
          <div style={{ fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>{emptyTitle}</div>
          <div className="tp-empty-help">{emptyHelp}</div>
          {user && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>
              + {t('tournament.createTournament') || 'Create Tournament'}
            </button>
          )}
        </div>
      )}

      {/* ── Create Tournament Modal ── */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div style={{
            background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 12,
            padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: 'var(--text-1)' }}>🏆 {t('tournament.createTournament') || 'Create Tournament'}</h3>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Name + Icon */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ width: 48, textAlign: 'center', fontSize: 20, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 4px', color: 'var(--text-1)' }}
                  value={form.icon}
                  onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                  maxLength={2}
                  title="Icon (emoji)"
                />
                <input
                  style={{ flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-1)' }}
                  placeholder="Tournament name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  maxLength={100}
                />
              </div>

              {/* Universe + Format */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ color: 'var(--text-3)', fontSize: 12 }}>
                  Game
                  <select
                    style={{ display: 'block', width: '100%', marginTop: 4, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)' }}
                    value={form.universe}
                    onChange={e => setForm(f => ({ ...f, universe: e.target.value as 'chess' | 'checkers' }))}
                  >
                    <option value="chess">♟ Chess</option>
                    <option value="checkers">⬤ Checkers</option>
                  </select>
                </label>
                <label style={{ color: 'var(--text-3)', fontSize: 12 }}>
                  {t('tournament.format') || 'Format'}
                  <select
                    style={{ display: 'block', width: '100%', marginTop: 4, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)' }}
                    value={form.format}
                    onChange={e => setForm(f => ({ ...f, format: e.target.value as CreateForm['format'] }))}
                  >
                    <option value="arena">🎪 Arena</option>
                    <option value="swiss">🔀 Swiss</option>
                    <option value="roundrobin">🔄 Round Robin</option>
                  </select>
                </label>
              </div>

              {/* Time control + Duration */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ color: 'var(--text-3)', fontSize: 12 }}>
                  {t('tournament.timeControl') || 'Time Control'}
                  <select
                    style={{ display: 'block', width: '100%', marginTop: 4, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)' }}
                    value={form.timeControl}
                    onChange={e => setForm(f => ({ ...f, timeControl: e.target.value }))}
                  >
                    {TIME_CONTROLS.map(tc => <option key={tc} value={tc}>{tc}</option>)}
                  </select>
                </label>
                <label style={{ color: 'var(--text-3)', fontSize: 12 }}>
                  Duration
                  <select
                    style={{ display: 'block', width: '100%', marginTop: 4, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)' }}
                    value={form.durationMs}
                    onChange={e => setForm(f => ({ ...f, durationMs: Number(e.target.value) }))}
                  >
                    <option value={600000}>10 min</option>
                    <option value={1800000}>30 min</option>
                    <option value={3600000}>1 hour</option>
                    <option value={7200000}>2 hours</option>
                    <option value={14400000}>4 hours</option>
                  </select>
                </label>
              </div>

              {/* Starts in + Rounds (swiss/rr only) */}
              <div style={{ display: 'grid', gridTemplateColumns: form.format !== 'arena' ? '1fr 1fr' : '1fr', gap: 8 }}>
                <label style={{ color: 'var(--text-3)', fontSize: 12 }}>
                  Starts in
                  <select
                    style={{ display: 'block', width: '100%', marginTop: 4, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)' }}
                    value={form.startsInMinutes}
                    onChange={e => setForm(f => ({ ...f, startsInMinutes: Number(e.target.value) }))}
                  >
                    <option value={5}>5 minutes</option>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={120}>2 hours</option>
                    <option value={1440}>1 day</option>
                  </select>
                </label>
                {form.format !== 'arena' && (
                  <label style={{ color: 'var(--text-3)', fontSize: 12 }}>
                    Rounds
                    <input
                      type="number"
                      min={3} max={15}
                      style={{ display: 'block', width: '100%', marginTop: 4, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-1)' }}
                      value={form.totalRounds || 7}
                      onChange={e => setForm(f => ({ ...f, totalRounds: Math.max(3, Math.min(15, Number(e.target.value))) }))}
                    />
                  </label>
                )}
              </div>

              {/* Rated toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', color: 'var(--text-2)' }}>
                <input
                  type="checkbox"
                  checked={form.rated}
                  onChange={e => setForm(f => ({ ...f, rated: e.target.checked }))}
                  style={{ width: 16, height: 16 }}
                />
                ★ {t('tournament.rated') || 'Rated'} — affects player ratings
              </label>

              <div className="tl-money-panel">
                <div className="tl-money-head">
                  <div>
                    <div className="tl-money-title">Entry fee</div>
                    <div className="tl-money-sub">Choose what a player pays from their wallet when joining.</div>
                  </div>
                  <strong>{form.betEntry > 0 ? formatMoney(form.betEntry) : 'Free'}</strong>
                </div>
                <div className="tl-money-options" aria-label="Entry fee presets">
                  {ENTRY_PRESETS.map(amount => (
                    <button
                      key={amount}
                      type="button"
                      className={`tl-money-btn ${form.betEntry === amount ? 'active' : ''}`}
                      onClick={() => setForm(f => ({ ...f, betEntry: amount }))}
                    >
                      {amount === 0 ? 'Free' : `$${amount}`}
                    </button>
                  ))}
                </div>
                <label className="tl-money-input-label">
                  Custom entry fee
                  <input
                    type="number"
                    min={0}
                    max={MAX_TOURNAMENT_MONEY}
                    step={1}
                    value={form.betEntry}
                    onChange={e => setForm(f => ({ ...f, betEntry: clampMoney(Number(e.target.value)) }))}
                  />
                </label>
              </div>

              <div className="tl-money-panel">
                <div className="tl-money-head">
                  <div>
                    <div className="tl-money-title">Starting prize pool</div>
                    <div className="tl-money-sub">Optional owner-funded prize before player entry fees are added.</div>
                  </div>
                  <strong>{formatMoney(form.prizePool)}</strong>
                </div>
                <div className="tl-money-options" aria-label="Starting prize pool presets">
                  {PRIZE_PRESETS.map(amount => (
                    <button
                      key={amount}
                      type="button"
                      className={`tl-money-btn ${form.prizePool === amount ? 'active' : ''}`}
                      onClick={() => setForm(f => ({ ...f, prizePool: amount }))}
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
                <label className="tl-money-input-label">
                  Custom starting prize
                  <input
                    type="number"
                    min={0}
                    max={MAX_TOURNAMENT_MONEY}
                    step={1}
                    value={form.prizePool}
                    onChange={e => setForm(f => ({ ...f, prizePool: clampMoney(Number(e.target.value)) }))}
                  />
                </label>
              </div>

              <div className={`tl-money-summary ${form.betEntry > 0 ? 'paid' : 'free'}`}>
                <strong>{form.betEntry > 0 ? 'Paid tournament' : 'Free tournament'}</strong>
                <span>
                  {form.betEntry > 0
                    ? `Players pay ${formatMoney(form.betEntry)} on join. The fee is added to the prize pool and refunded only if they leave before the start.`
                    : 'Players can join without a wallet charge.'}
                </span>
                <span>Starting prize pool: {formatMoney(form.prizePool)}.</span>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '10px 0', marginTop: 4 }}
                onClick={handleCreate}
                disabled={creating || !form.name.trim()}
              >
                {creating ? '…' : `+ ${t('tournament.createTournament') || 'Create Tournament'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tl-grid">
        {visible.map(tourn => {
          const status = liveStatus(tourn);
          return (
            <div
              key={tourn.id}
              className={`tl-card ${status === 'running' ? 'running' : ''}`}
              onClick={() => onSelectTournament(tourn.id)}
            >
              {/* Header */}
              <div className="tl-card-head">
                <span className="tl-card-icon">{tourn.icon}</span>
                <div className="tl-card-status-wrap">
                  <span
                    className="tl-status-dot"
                    style={{ background: STATUS_COLORS[status] }}
                  />
                  <span className="tl-status-label" style={{ color: STATUS_COLORS[status] }}>
                    {status === 'running'  ? t('tournament.running') :
                     status === 'upcoming' ? t('tournament.upcoming') : t('tournament.finished')}
                  </span>
                </div>
              </div>

              <div className="tl-card-name">{tourn.name}</div>
              <div className="tl-card-desc">{tourn.description}</div>

              {/* Tags */}
              <div className="tl-tags">
                <span className="tl-tag">{FORMAT_LABELS[tourn.format]}</span>
                <span className="tl-tag">{tourn.timeControl}</span>
                {tourn.rated && <span className="tl-tag rated">★ {t('tournament.rated')}</span>}
                {tourn.betEntry > 0 && <span className="tl-tag bet">{formatMoney(tourn.betEntry)} entry</span>}
                {tourn.prizePool > 0 && <span className="tl-tag prize">{formatMoney(tourn.prizePool)} pool</span>}
              </div>

              <div className={`tl-money-row ${tourn.betEntry > 0 ? 'paid' : 'free'}`}>
                {moneyLine(tourn)}
              </div>

              <div className="tl-card-rules">
                <span>Starts {exactTimeStr(tourn.startsAt)}</span>
                <span>{clarityLine(tourn)}</span>
              </div>

              {/* Footer */}
              <div className="tl-card-footer">
                <div className="tl-footer-info">
                  <span>👥 {tourn.players.length}{tourn.maxPlayers ? `/${tourn.maxPlayers}` : ''}</span>
                  <span>·</span>
                  <span>
                    {status === 'running'
                      ? timeLeftStr(tourn)
                      : status === 'upcoming'
                      ? timeUntilStr(tourn.startsAt)
                      : t('tournament.finished')}
                  </span>
                </div>
                <button className="tl-enter-btn">
                  {status === 'running' ? 'Join / watch →' : `${t('leaderboard.viewAll')} →`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
