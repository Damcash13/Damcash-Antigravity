import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserStore, useNotificationStore } from '../../stores';
import { useTournamentStore } from '../../stores/tournamentStore';
import { TournamentList } from './TournamentList';
import { socket } from '../../lib/socket';
import { AppErrorBoundary } from '../common/AppErrorBoundary';
import { formatLocalDateTime, getTimeZoneLabel, getUserTimeZone } from '../../lib/timezone';
import '../../styles/tournaments.css';

// ── Helpers ───────────────────────────────────────────────────────────────────
const JOIN_WINDOW_MS = 3 * 60_000;
const PAIRING_CUTOFF_MS = 2 * 60_000;

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function formatStartTime(ts: number): string {
  return formatLocalDateTime(ts, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }, true);
}

function formatExactTime(ts: number): string {
  return formatLocalDateTime(ts, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }, true);
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function formatMoney(value: number): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function getLiveStatus(startsAt: number, durationMs: number, now: number) {
  const endsAt = startsAt + durationMs;
  if (now >= endsAt) return 'finished';
  if (now >= startsAt) return 'running';
  return 'upcoming';
}

// ── Medal helper ──────────────────────────────────────────────────────────────
function medal(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank);
}

// ── Countdown — isolated so only this subtree re-renders every second ─────────
const TournamentCountdown: React.FC<{ targetTs: number; label: string }> = React.memo(({ targetTs, label }) => {
  const [ms, setMs] = useState(targetTs - Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = targetTs - Date.now();
      setMs(remaining);
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [targetTs]);

  return (
    <div className="tp-countdown-wrap">
      <div className="tp-countdown-label">{label}</div>
      <div className="tp-countdown">{formatCountdown(ms)}</div>
    </div>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

export const TournamentPage: React.FC = () => {
  const { universe, id } = useParams<{ universe: string; id: string }>();
  const navigate = useNavigate();
  const user = useUserStore(s => s.user);
  const addNotification = useNotificationStore(s => s.addNotification);
  const tournaments = useTournamentStore(s => s.tournaments);
  const fetchOne = useTournamentStore(s => s.fetchOne);
  const joinTournament = useTournamentStore(s => s.joinTournament);
  const leaveTournament = useTournamentStore(s => s.leaveTournament);
  const pairTournament = useTournamentStore(s => s.pairTournament);
  const loading = useTournamentStore(s => s.loading);

  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'standings' | 'pairings' | 'games' | 'info'>('standings');
  const [joining, setJoining] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const FORMAT_LABEL: Record<string, string> = {
    arena: `🎪 ${t('tournament.arena')}`,
    swiss: `🔀 ${t('tournament.swiss')}`,
    roundrobin: `🔄 ${t('tournament.roundRobin')}`,
  };

  // Fetch this tournament from API on mount
  useEffect(() => {
    if (id) {
      fetchOne(id);
      socket.emit('tournament:subscribe', { id });

      const handleUpdate = (data: { id?: string } = {}) => {
        if (!data.id || data.id === id) {
          fetchOne(id);
        }
      };

      socket.on('tournament:updated', handleUpdate);
      socket.on('tournament:global_update', handleUpdate);

      return () => {
        socket.emit('tournament:unsubscribe', { id });
        socket.off('tournament:updated', handleUpdate);
        socket.off('tournament:global_update', handleUpdate);
      };
    }
  }, [id, fetchOne]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // If no id, show the list
  if (!id) {
    return (
      <TournamentList onSelectTournament={(tid) => navigate(`/${universe}/tournament/${tid}`)} />
    );
  }

  const tournament = tournaments.find(t => t.id === id);

  if (loading && !tournament) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
        <h2 style={{ color: 'var(--text-1)' }}>{t('common.error')}</h2>
        <p>{t('tournament.noTournaments')}</p>
        <button className="btn btn-secondary" onClick={() => navigate(`/${universe}`)}>
          ← {t('tournament.backToLobby')}
        </button>
      </div>
    );
  }

  const myName   = user?.name || '';
  const hasJoined = !!myName && tournament.players.some(p => p.name === myName);

  const endsAt     = tournament.startsAt + tournament.durationMs;

  const handleJoin = async () => {
    if (!user) { addNotification('Sign in to join tournaments', 'error'); return; }
    setJoining(true);
    try {
      if (hasJoined) {
        const result = await leaveTournament(tournament.id);
        addNotification(result.message || t('tournament.leftSuccessfully') || 'Left tournament', result.refunded ? 'success' : 'info');
      } else {
        await joinTournament(tournament.id);
        addNotification(
          tournament.betEntry > 0
            ? `Joined tournament. Entry fee charged: $${Number(tournament.betEntry).toFixed(2)} and recorded in wallet history.`
            : t('tournament.joinedSuccessfully') || 'Successfully joined tournament',
          'success'
        );
      }
    } catch (e: any) {
      addNotification(e?.message || t('common.error'), 'error');
    } finally {
      setJoining(false);
    }
  };

  const handlePair = async () => {
    if (!user) { addNotification('Sign in to play tournament games', 'error'); return; }
    if (!hasJoined) { addNotification('Join the tournament before pairing', 'error'); return; }
    if (endsAt - Date.now() <= PAIRING_CUTOFF_MS) {
      addNotification('Pairing is closed for the final 2 minutes', 'info');
      return;
    }
    setPairing(true);
    try {
      const result = await pairTournament(tournament.id);
      if (result.paired) {
        addNotification(`Pairing found${result.opponent ? ` vs ${result.opponent}` : ''}`, 'success');
      } else {
        addNotification(result.message || 'No available opponent yet. Stay on this page or try again in a few seconds.', 'info');
      }
    } catch (e: any) {
      addNotification(e?.message || 'Could not request pairing. Check your connection and try again in a few seconds.', 'error');
    } finally {
      setPairing(false);
    }
  };

  // Sorted standings
  const standings = [...tournament.players].sort((a, b) =>
    b.score !== a.score ? b.score - a.score : b.performance - a.performance
  );

  const status = getLiveStatus(tournament.startsAt, tournament.durationMs, now);
  const isRunning  = status === 'running';
  const isUpcoming = status === 'upcoming';
  const isFinished = status === 'finished';
  const displayRound = isUpcoming ? 0 : Math.max(tournament.currentRound, 1);
  const startsIn = tournament.startsAt - now;
  const timeLeft = endsAt - now;
  const waitingRoomOpen = isUpcoming && startsIn <= JOIN_WINDOW_MS;
  const pairingOpen = isRunning && timeLeft > PAIRING_CUTOFF_MS;
  const waitingRoomOpensAt = tournament.startsAt - JOIN_WINDOW_MS;
  const pairingClosesAt = endsAt - PAIRING_CUTOFF_MS;
  const liveGames = tournament.games.filter(g => g.result === '*');
  const finishedGames = tournament.games.filter(g => g.result !== '*');
  const scoringText = tournament.format === 'arena'
    ? 'Win = 2 pts · Draw = 1 pt · Loss = 0 pts'
    : 'Win = 1 pt · Draw = 0.5 pt · Loss = 0 pts';
  const pairingText = tournament.format === 'arena'
    ? 'Pairing is on demand against any available online opponent.'
    : 'Pairing prefers opponents you have not played, then closest score, then closest rating.';
  const lateJoinText = isFinished
    ? 'This tournament is closed. New players cannot join.'
    : isRunning
    ? pairingOpen
      ? 'Late joining is open. New players can join, request games, and catch up while pairings remain open.'
      : 'Late joining can still place you in the room, but new pairings are closed for the final 2 minutes.'
    : 'Players can register now, then enter the waiting room during the final 3 minutes before start.';
  const moneyRulesText = tournament.betEntry > 0
    ? `Entry fee is ${formatMoney(tournament.betEntry)}. It is charged when you join and added to the prize pool. Leaving before the start refunds the entry fee; after the start, entry fees are not automatically refunded. At the end, the top score receives the prize pool; tied top scores split it evenly. Current prize pool: ${formatMoney(tournament.prizePool)}.`
    : tournament.prizePool > 0
    ? `No entry fee is required. At the end, the top score receives the prize pool; tied top scores split it evenly. Current prize pool: ${formatMoney(tournament.prizePool)}.`
    : `No entry fee is required. Current prize pool: ${formatMoney(tournament.prizePool)}.`;
  const entryLabel = tournament.betEntry > 0 ? formatMoney(tournament.betEntry) : '';
  const joinCta = hasJoined
    ? isRunning ? `🏳 ${t('tournament.withdraw')}` : `✕ ${t('common.cancel')}`
    : isRunning ? tournament.betEntry > 0 ? `Join for ${entryLabel} & catch up` : `Join & catch up`
    : waitingRoomOpen ? tournament.betEntry > 0 ? `Join waiting room · ${entryLabel}` : `Join waiting room`
    : tournament.betEntry > 0 ? `Register · ${entryLabel}` : t('tournament.registerNow');

  return (
    <div className="tp-page">
      {/* ── Back ── */}
      <button className="tp-back" onClick={() => navigate(`/${universe}`)}>
        ← {t('tournament.backToLobby')}
      </button>

      {/* ── Hero header ── */}
      <div className={`tp-hero ${isRunning ? 'running' : ''}`}>
        <div className="tp-hero-left">
          <div className="tp-hero-icon">{tournament.icon}</div>
          <div>
            <div className="tp-hero-name">{tournament.name}</div>
            <div className="tp-hero-meta">
              <span>{FORMAT_LABEL[tournament.format]}</span>
              <span>·</span>
              <span>⏱ {tournament.timeControl}</span>
              <span>·</span>
              <span>Starts {formatStartTime(tournament.startsAt)}</span>
              {tournament.rated && <><span>·</span><span>★ {t('tournament.rated')}</span></>}
              {tournament.betEntry > 0 && <><span>·</span><span>{formatMoney(tournament.betEntry)} {t('tournament.entry').toLowerCase()}</span></>}
              {tournament.prizePool > 0 && <><span>·</span><span className="tp-prize">{formatMoney(tournament.prizePool)} {t('tournament.prize').toLowerCase()}</span></>}
            </div>
          </div>
        </div>

        <div className="tp-hero-right">
          {/* Countdown */}
          {isRunning && (
            <TournamentCountdown targetTs={endsAt} label={t('tournament.timeRemaining')} />
          )}
          {isUpcoming && (
            <TournamentCountdown
              targetTs={tournament.startsAt}
              label={waitingRoomOpen ? 'Waiting room countdown' : t('tournament.startsIn')}
            />
          )}

          {/* CTA */}
          {!isFinished && (
            <button
              className={`btn ${hasJoined ? 'tp-btn-withdraw' : 'tp-btn-join'}`}
              onClick={handleJoin}
              disabled={joining}
            >
              {joining ? '…' : joinCta}
            </button>
          )}
          {isRunning && hasJoined && pairingOpen && (
            <button
              className="btn tp-btn-join"
              onClick={handlePair}
              disabled={pairing}
            >
              {pairing ? 'Pairing…' : '⚔ Find game'}
            </button>
          )}
        </div>
      </div>

      {!isFinished && (
        <div className={`tp-start-notice ${isRunning ? 'running' : waitingRoomOpen ? 'open' : ''}`}>
          <strong>
            {isRunning
              ? 'Tournament in progress'
              : waitingRoomOpen
              ? 'Waiting room open'
              : `Waiting room opens ${formatStartTime(waitingRoomOpensAt)}`}
          </strong>
          <span>
            {isRunning
              ? pairingOpen
                ? 'Late joining is open, so new players can still enter and catch up.'
                : 'Pairing is closed for the final 2 minutes. Current games can finish.'
              : `Starts ${formatStartTime(tournament.startsAt)}. Players can wait from H-3 until the tournament begins.`}
          </span>
        </div>
      )}

      <div className={`tp-money-notice ${tournament.betEntry > 0 ? 'paid' : 'free'}`}>
        <strong>{tournament.betEntry > 0 ? `Paid tournament · ${formatMoney(tournament.betEntry)} entry` : 'Free tournament'}</strong>
        <span>
          {tournament.betEntry > 0
            ? `Your wallet is charged when you join. Entry fees go into the prize pool, now ${formatMoney(tournament.prizePool)}. Top score wins the pool; tied top scores split evenly. Leaving before start refunds the entry fee.`
            : tournament.prizePool > 0
            ? `No wallet charge is required to join. Top score wins the ${formatMoney(tournament.prizePool)} prize pool; tied top scores split evenly.`
            : `No wallet charge is required to join. Current prize pool: ${formatMoney(tournament.prizePool)}.`}
        </span>
      </div>

      <div className="tp-clarity-panel">
        <div className="tp-clarity-head">
          <div>
            <div className="tp-clarity-title">Tournament clarity</div>
            <div className="tp-clarity-sub">
              {isRunning ? 'In progress now' : isUpcoming ? 'Upcoming schedule' : 'Finished tournament record'}
            </div>
          </div>
          <span className={`tp-clarity-status ${status}`}>
            {isRunning ? t('tournament.running') : isUpcoming ? t('tournament.upcoming') : t('tournament.finished')}
          </span>
        </div>

        <div className="tp-timeline-grid">
          <div className="tp-timeline-card">
            <span className="tp-timeline-label">Your timezone</span>
            <strong>{getUserTimeZone()}</strong>
            <small>{getTimeZoneLabel(tournament.startsAt)}</small>
          </div>
          <div className="tp-timeline-card">
            <span className="tp-timeline-label">Exact start</span>
            <strong>{formatExactTime(tournament.startsAt)}</strong>
          </div>
          <div className="tp-timeline-card">
            <span className="tp-timeline-label">Waiting room opens</span>
            <strong>{formatExactTime(waitingRoomOpensAt)}</strong>
            <small>H-3 minutes</small>
          </div>
          <div className="tp-timeline-card">
            <span className="tp-timeline-label">Pairing closes</span>
            <strong>{formatExactTime(pairingClosesAt)}</strong>
            <small>Final 2 minutes</small>
          </div>
          <div className="tp-timeline-card">
            <span className="tp-timeline-label">Tournament ends</span>
            <strong>{formatExactTime(endsAt)}</strong>
            <small>{formatDuration(tournament.durationMs)} duration</small>
          </div>
        </div>

        <div className="tp-rules-grid">
          <div className="tp-rule-card">
            <span className="tp-rule-label">Late joining</span>
            <p>{lateJoinText}</p>
          </div>
          <div className="tp-rule-card">
            <span className="tp-rule-label">Scoring system</span>
            <p>{scoringText}</p>
          </div>
          <div className="tp-rule-card">
            <span className="tp-rule-label">Pairing method</span>
            <p>{pairingText}</p>
          </div>
          <div className="tp-rule-card">
            <span className="tp-rule-label">Games record</span>
            <p>{liveGames.length} current · {finishedGames.length} finished · standings update after each result.</p>
          </div>
          <div className="tp-rule-card">
            <span className="tp-rule-label">Entry fees / prizes</span>
            <p>{moneyRulesText}</p>
          </div>
        </div>

        <div className="tp-clarity-bottom">
          <div className="tp-mini-standings">
            <span className="tp-rule-label">Current standings</span>
            {standings.length === 0 ? (
              <span className="tp-muted-line">No players registered yet.</span>
            ) : standings.slice(0, 3).map((p, idx) => (
              <div key={p.id || p.name} className="tp-mini-standing-row">
                <span>{medal(idx + 1)} {p.name}</span>
                <strong>{p.score ?? 0}</strong>
              </div>
            ))}
          </div>
          <div className="tp-mini-games">
            <span className="tp-rule-label">Current / finished games</span>
            <div className="tp-game-counts">
              <strong>{liveGames.length}</strong><span>current</span>
              <strong>{finishedGames.length}</strong><span>finished</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="tp-stats-bar">
        <div className="tp-stat">
          <span className="tp-stat-val">{tournament.players.length}</span>
          <span className="tp-stat-label">{t('tournament.players')}</span>
        </div>
        <div className="tp-stat">
          <span className="tp-stat-val">{liveGames.length}/{finishedGames.length}</span>
          <span className="tp-stat-label">current / finished</span>
        </div>
        {tournament.format !== 'arena' && (
          <div className="tp-stat">
            <span className="tp-stat-val">{displayRound}/{tournament.totalRounds}</span>
            <span className="tp-stat-label">{t('tournament.rounds')}</span>
          </div>
        )}
        <div className="tp-stat">
          <span className="tp-stat-val">
            {isRunning ? `🔴 ${t('tournament.running')}` : isUpcoming ? '⏰' : `✅ ${t('tournament.finished')}`}
          </span>
          <span className="tp-stat-label">{t('tournament.standing')}</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="tp-tabs">
        {(['standings', 'pairings', 'games', 'info'] as const).map(tab => (
          <button
            key={tab}
            className={`tp-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'standings' ? `📊 ${t('tournament.standing')}`
           : tab === 'pairings'  ? `⚔️ ${t('tournament.pairingsTBD').split(' ')[0]}`
           : tab === 'games'     ? `🎮 ${t('common.games')}`
           :                       `ℹ️ ${t('profile.overview')}`}
          </button>
        ))}
      </div>

      {/* ── STANDINGS ── */}
      {activeTab === 'standings' && (
        <div className="tp-standings">
          {standings.length === 0 ? (
            <div className="tp-empty">
              <div style={{ fontSize: 40 }}>👥</div>
              <div style={{ fontWeight: 700, color: 'var(--text-2)', marginTop: 8 }}>
                {isUpcoming ? t('tournament.noRegistrations') : t('tournament.noTournaments')}
              </div>
              <div className="tp-empty-help">
                {isUpcoming
                  ? `Registration is open. The waiting room opens at ${formatStartTime(waitingRoomOpensAt)}.`
                  : isRunning
                  ? 'No players are currently in the standings. Join while late entry is open, then request a game.'
                  : 'No standings were recorded for this tournament.'}
              </div>
              {isUpcoming && !hasJoined && (
                <button className="btn tp-btn-join" style={{ marginTop: 16 }} onClick={handleJoin}>
                  {waitingRoomOpen
                    ? tournament.betEntry > 0 ? `Join waiting room · ${entryLabel}` : 'Join waiting room'
                    : tournament.betEntry > 0 ? `Register · ${entryLabel}` : t('tournament.registerNow')}
                </button>
              )}
              {isRunning && hasJoined && pairingOpen && (
                <button className="btn tp-btn-join" style={{ marginTop: 16 }} onClick={handlePair} disabled={pairing}>
                  {pairing ? 'Pairing…' : '⚔ Find tournament game'}
                </button>
              )}
            </div>
          ) : (
            <AppErrorBoundary key={tournament.id}>
              <div className="tp-table-head">
                <span>#</span>
                <span>{t('leaderboard.player')}</span>
                <span className="tp-col-center">{t('tournament.score')}</span>
                <span className="tp-col-center">{t('common.games')}</span>
                <span className="tp-col-center">W / D / L</span>
                <span className="tp-col-center">{t('tournament.standing')}</span>
              </div>
              {standings.map((player, idx) => {
                const rank = idx + 1;
                const isMe = player.name === myName;
                return (
                  <div key={player.id || idx} className={`tp-table-row ${isMe ? 'me' : ''} ${rank <= 3 ? 'top3' : ''}`}>
                    <span className="tp-rank">{medal(rank)}</span>
                    <span className="tp-player-cell">
                      <div className="tp-player-avatar" style={{ background: isMe ? 'var(--accent)' : undefined }}>
                        {(player.name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="tp-player-name">
                          {player.name || t('common.unknown')}
                          {isMe && <span className="tp-you-badge">{t('lobby.you')}</span>}
                          {player.fire && <span title="On a streak">🔥</span>}
                        </div>
                        <div className="tp-player-rating">{player.rating ?? '—'}</div>
                      </div>
                    </span>
                    <span className="tp-col-center tp-score">{player.score ?? 0}</span>
                    <span className="tp-col-center tp-dim">{player.games ?? 0}</span>
                    <span className="tp-col-center tp-wdl">
                      <span className="tp-w">{player.wins ?? 0}</span>
                      <span className="tp-d">{player.draws ?? 0}</span>
                      <span className="tp-l">{player.losses ?? 0}</span>
                    </span>
                    <span className="tp-col-center tp-perf">{player.performance ?? '—'}</span>
                  </div>
                );
              })}
            </AppErrorBoundary>
          )}
        </div>
      )}

      {/* ── PAIRINGS ── */}
      {activeTab === 'pairings' && (
        <div className="tp-pairings">
          {tournament.players.length < 2 ? (
            <div className="tp-empty">
              <div style={{ fontSize: 40 }}>⚔️</div>
              <div style={{ fontWeight: 700, color: 'var(--text-2)', marginTop: 8 }}>
                {t('tournament.pairingsTBD')}
              </div>
              <div className="tp-empty-help">
                {isUpcoming
                  ? 'Pairings appear after the tournament starts and at least two players are registered.'
                  : 'Need at least two available online players before a tournament game can be paired.'}
              </div>
            </div>
          ) : (
            <>
              {/* Current / Next round header */}
              <div className="tp-round-header">
                {isRunning
                  ? tournament.format === 'arena'
                    ? `Live pairings — ${pairingOpen ? 'pairing open' : 'pairing closed'}`
                    : `${t('tournament.round')} ${displayRound} — ${t('tournament.livePairings')}`
                  : isUpcoming
                  ? t('tournament.registeredPlayers')
                  : `${t('tournament.finalPairings')} — ${tournament.totalRounds || tournament.games.length} ${t('tournament.rounds').toLowerCase()}`}
              </div>

              {/* Arena: show current games as pairings */}
              {tournament.format === 'arena' && isRunning && liveGames.length > 0 && (
                <div className="tp-pairing-list">
                  {liveGames.slice(0, 8).map((g, i) => {
                    const wp = tournament.players.find(p => p.name === g.white);
                    const bp = tournament.players.find(p => p.name === g.black);
                    return (
                      <div key={g.id} className="tp-pairing-row live">
                        <span className="tp-pair-board">#{i + 1}</span>
                        <div className="tp-pair-player white">
                          <span className="tp-pair-name">{g.white}</span>
                          <span className="tp-pair-rating">{wp?.rating ?? '?'}</span>
                        </div>
                        <span className="tp-pair-result live">
                          ● vs
                        </span>
                        <div className="tp-pair-player black">
                          <span className="tp-pair-name">{g.black}</span>
                          <span className="tp-pair-rating">{bp?.rating ?? '?'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {tournament.format === 'arena' && isRunning && liveGames.length === 0 && (
                <div className="tp-inline-note">
                  {pairingOpen
                    ? `No current games. Joined players can request a tournament game until ${formatStartTime(pairingClosesAt)}.`
                    : 'No current games. New pairings are closed for the final 2 minutes.'}
                </div>
              )}

              {/* Swiss / Round-robin: show bracket-style round grid */}
              {(tournament.format === 'swiss' || tournament.format === 'roundrobin') && (
                <div className="tp-bracket">
                  {Array.from({ length: Math.max(tournament.currentRound, 1) }, (_, ri) => {
                    const roundGames = tournament.games.filter((_, gi) => {
                      const gamesPerRound = Math.floor(tournament.players.length / 2);
                      return gamesPerRound > 0
                        ? Math.floor(gi / gamesPerRound) === ri
                        : gi === ri;
                    });
                    return (
                      <div key={ri} className="tp-round-col">
                        <div className="tp-round-label">Round {ri + 1}</div>
                        {roundGames.length === 0 ? (
                          <div className="tp-pair-tbd">TBD</div>
                        ) : roundGames.map(g => (
                          <div key={g.id} className={`tp-bracket-card ${g.result !== '*' ? 'done' : 'live'}`}>
                            <div className={`tp-bc-player ${g.result === '1-0' ? 'winner' : ''}`}>{g.white}</div>
                            <div className="tp-bc-result">{g.result === '*' ? '—' : g.result}</div>
                            <div className={`tp-bc-player ${g.result === '0-1' ? 'winner' : ''}`}>{g.black}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Upcoming: show registered players list as a seeding table */}
              {isUpcoming && (
                <div className="tp-seeding">
                  <div className="tp-seed-head">
                    <span>Seed</span><span>Player</span><span className="tp-col-center">Rating</span>
                  </div>
                  {[...tournament.players]
                    .sort((a, b) => b.rating - a.rating)
                    .map((p, i) => (
                    <div key={p.id} className={`tp-seed-row ${p.name === myName ? 'me' : ''}`}>
                      <span className="tp-rank">{i + 1}</span>
                      <span className="tp-player-cell">
                        <div className="tp-player-avatar" style={{ background: p.name === myName ? 'var(--accent)' : undefined }}>
                          {p.name[0]?.toUpperCase()}
                        </div>
                        <span>{p.name}{p.name === myName && <span className="tp-you-badge">{t('lobby.you')}</span>}</span>
                      </span>
                      <span className="tp-col-center tp-dim">{p.rating}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── GAMES ── */}
      {activeTab === 'games' && (
        <div className="tp-games-list">
          {tournament.games.length === 0 ? (
            <div className="tp-empty">
              <div style={{ fontSize: 40 }}>🎮</div>
              <div style={{ fontWeight: 700, color: 'var(--text-2)', marginTop: 8 }}>
                {t('tournament.gamesPlayedYet')}
              </div>
              <div className="tp-empty-help">
                {isUpcoming
                  ? `No games yet. Games can start at ${formatStartTime(tournament.startsAt)}.`
                  : pairingOpen
                  ? 'No tournament games have started yet. Joined players can stay here and request a pairing.'
                  : 'No tournament games were recorded before pairing closed.'}
              </div>
            </div>
          ) : (
            <>
              {liveGames.length > 0 && (
                <div className="tp-games-section">
                  <div className="tp-games-section-title">Current games ({liveGames.length})</div>
                  {liveGames.map(game => (
                    <div key={game.id} className="tp-game-row live">
                      <div className="tp-game-players">
                        <span className="tp-gp white">{game.white}</span>
                        <span className="tp-result-badge live">LIVE</span>
                        <span className="tp-gp black">{game.black}</span>
                      </div>
                      <div className="tp-game-meta">
                        <span>{game.moves} {t('game.moves').toLowerCase()}</span>
                        <span>·</span>
                        <span>Started {timeAgo(game.playedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {finishedGames.length > 0 && (
                <div className="tp-games-section">
                  <div className="tp-games-section-title">Finished games ({finishedGames.length})</div>
                  {finishedGames.map(game => (
                    <div key={game.id} className="tp-game-row">
                      <div className="tp-game-players">
                        <span className="tp-gp white">{game.white}</span>
                        <span className={`tp-result-badge ${
                          game.result === '1-0' ? 'white-win'
                          : game.result === '0-1' ? 'black-win'
                          : 'draw'
                        }`}>
                          {game.result}
                        </span>
                        <span className="tp-gp black">{game.black}</span>
                      </div>
                      <div className="tp-game-meta">
                        <span>{game.moves} {t('game.moves').toLowerCase()}</span>
                        <span>·</span>
                        <span>{game.duration}</span>
                        <span>·</span>
                        <span>{timeAgo(game.playedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── INFO ── */}
      {activeTab === 'info' && (
        <div className="tp-info-panel">
          <div className="tp-info-grid">
            <div className="tp-info-card">
              <div className="tp-info-label">{t('tournament.startsAt')}</div>
              <div className="tp-info-val">{formatStartTime(tournament.startsAt)}</div>
            </div>
            <div className="tp-info-card">
              <div className="tp-info-label">Waiting room</div>
              <div className="tp-info-val">{formatStartTime(waitingRoomOpensAt)}</div>
              <div className="tp-info-note">Opens 3 minutes before start</div>
            </div>
            <div className="tp-info-card">
              <div className="tp-info-label">Pairing closes</div>
              <div className="tp-info-val">{formatStartTime(pairingClosesAt)}</div>
              <div className="tp-info-note">No new pairings in final 2 minutes</div>
            </div>
            <div className="tp-info-card">
              <div className="tp-info-label">{t('tournament.format')}</div>
              <div className="tp-info-val">{FORMAT_LABEL[tournament.format]}</div>
            </div>
            <div className="tp-info-card">
              <div className="tp-info-label">{t('tournament.timeControl')}</div>
              <div className="tp-info-val">⏱ {tournament.timeControl}</div>
            </div>
            <div className="tp-info-card">
              <div className="tp-info-label">{t('common.rating')}</div>
              <div className="tp-info-val">{tournament.rated ? `★ ${t('tournament.rated')}` : `☆ ${t('tournament.unrated')}`}</div>
            </div>
            {tournament.betEntry > 0 && (
              <div className="tp-info-card">
                <div className="tp-info-label">{t('tournament.entry')}</div>
                <div className="tp-info-val">{formatMoney(tournament.betEntry)}</div>
              </div>
            )}
            {tournament.prizePool > 0 && (
              <div className="tp-info-card">
                <div className="tp-info-label">{t('tournament.prizePool')}</div>
                <div className="tp-info-val prize">{formatMoney(tournament.prizePool)}</div>
              </div>
            )}
            <div className="tp-info-card">
              <div className="tp-info-label">{t('tournament.maxPlayers')}</div>
              <div className="tp-info-val">{tournament.maxPlayers}</div>
            </div>
            {tournament.totalRounds > 0 && (
              <div className="tp-info-card">
                <div className="tp-info-label">{t('tournament.rounds')}</div>
                <div className="tp-info-val">{tournament.totalRounds}</div>
              </div>
            )}
          </div>

          <div className="tp-desc-box">
            <div className="tp-desc-title">{t('tournament.aboutTournament')}</div>
            <p className="tp-desc-text">{tournament.description}</p>
          </div>

          {tournament.format === 'arena' && (
            <div className="tp-rules-box">
              <div className="tp-desc-title">{t('tournament.arenaRules')}</div>
              <ul className="tp-rules">
                <li>Players may join before start or late while the tournament is running.</li>
                <li>Players request games against available online opponents until the final 2-minute pairing cutoff.</li>
                <li>{scoringText}</li>
                <li>Standings are sorted by score, then performance rating.</li>
              </ul>
            </div>
          )}

          {tournament.format === 'swiss' && (
            <div className="tp-rules-box">
              <div className="tp-desc-title">{t('tournament.swissRules')}</div>
              <ul className="tp-rules">
                <li>Players may join before start or late while the tournament is running.</li>
                <li>{pairingText}</li>
                <li>{scoringText}</li>
                <li>Standings are sorted by score, then performance rating.</li>
              </ul>
            </div>
          )}

          {tournament.format === 'roundrobin' && (
            <div className="tp-rules-box">
              <div className="tp-desc-title">{t('tournament.roundRobin')}</div>
              <ul className="tp-rules">
                <li>Players may join before start or late while the tournament is running.</li>
                <li>{pairingText}</li>
                <li>{scoringText}</li>
                <li>Standings are sorted by score, then performance rating.</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
