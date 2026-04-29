import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUniverseStore } from '../../stores';
import { useTournamentStore, Tournament, TournamentStatus } from '../../stores/tournamentStore';
import '../../styles/tournaments.css';

function timeUntil(ts: number): string {
  const diff = ts - Date.now();
  if (diff <= 0) return 'Started';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

function timeLeft(t: Tournament): string {
  const end = t.startsAt + t.durationMs;
  const diff = end - Date.now();
  if (diff <= 0) return 'Ended';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

const STATUS_COLORS: Record<TournamentStatus, string> = {
  upcoming: '#3b82f6',
  running:  '#22c55e',
  finished: 'var(--text-3)',
};

interface Props {
  onSelectTournament: (id: string) => void;
}

export const TournamentList: React.FC<Props> = ({ onSelectTournament }) => {
  const { universe } = useUniverseStore();
  const { t } = useTranslation();
  const { tournaments, loading, fetchTournaments } = useTournamentStore();
  const [filter, setFilter] = useState<'all' | TournamentStatus>('all');

  useEffect(() => { fetchTournaments(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = tournaments
    .filter(tObj => tObj.universe === universe)
    .filter(tObj => filter === 'all' || tObj.status === filter);

  const FORMAT_LABELS: Record<string, string> = {
    arena: t('tournament.arena'),
    swiss: t('tournament.swiss'),
    roundrobin: t('tournament.roundRobin'),
  };

  const timeUntilStr = (ts: number): string => {
    const diff = ts - Date.now();
    if (diff <= 0) return t('tournament.running');
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h > 0) return `${t('tournament.startsIn')} ${h}h ${m}m`;
    return `${t('tournament.startsIn')} ${m}m`;
  };

  const timeLeftStr = (tObj: Tournament): string => {
    const end = tObj.startsAt + tObj.durationMs;
    const diff = end - Date.now();
    if (diff <= 0) return t('tournament.finished');
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h > 0) return `${h}h ${m}m ${t('tournament.timeRemaining').toLowerCase()}`;
    return `${m}m ${t('tournament.timeRemaining').toLowerCase()}`;
  };

  return (
    <div className="tl-container">
      <div className="tl-topbar">
        <div>
          <h2 className="tl-title">🏆 {t('lobby.tournaments')}</h2>
          <p className="tl-sub">
            {universe === 'chess' ? `♟ ${t('profile.chess')}` : `⬤ ${t('profile.checkers')}`} · {visible.length}
          </p>
        </div>

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
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
          <div style={{ fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>{t('tournament.noTournaments')}</div>
        </div>
      )}

      <div className="tl-grid">
        {visible.map(tourn => (
          <div
            key={tourn.id}
            className={`tl-card ${tourn.status === 'running' ? 'running' : ''}`}
            onClick={() => onSelectTournament(tourn.id)}
          >
            {/* Header */}
            <div className="tl-card-head">
              <span className="tl-card-icon">{tourn.icon}</span>
              <div className="tl-card-status-wrap">
                <span
                  className="tl-status-dot"
                  style={{ background: STATUS_COLORS[tourn.status] }}
                />
                <span className="tl-status-label" style={{ color: STATUS_COLORS[tourn.status] }}>
                  {tourn.status === 'running'  ? t('tournament.running') :
                   tourn.status === 'upcoming' ? t('tournament.upcoming') : t('tournament.finished')}
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
              {tourn.betEntry > 0 && <span className="tl-tag bet">💰 ${tourn.betEntry} {t('tournament.entry').toLowerCase()}</span>}
              {tourn.prizePool > 0 && <span className="tl-tag prize">🎁 ${tourn.prizePool}</span>}
            </div>

            {/* Footer */}
            <div className="tl-card-footer">
              <div className="tl-footer-info">
                <span>👥 {tourn.players.length}{tourn.maxPlayers ? `/${tourn.maxPlayers}` : ''}</span>
                <span>·</span>
                <span>
                  {tourn.status === 'running'
                    ? timeLeftStr(tourn)
                    : tourn.status === 'upcoming'
                    ? timeUntilStr(tourn.startsAt)
                    : t('tournament.finished')}
                </span>
              </div>
              <button className="tl-enter-btn">
                {tourn.status === 'running' ? `${t('lobby.watch')} →` : `${t('leaderboard.viewAll')} →`}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
