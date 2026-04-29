import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserStore, useNotificationStore } from '../../stores';
import { useTournamentStore } from '../../stores/tournamentStore';
import { TournamentList } from './TournamentList';
import { AppErrorBoundary } from '../common/AppErrorBoundary';
import '../../styles/tournaments.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const FORMAT_LABEL: Record<string, string> = {
  arena: '🎪 Arena', swiss: '🔀 Swiss', roundrobin: '🔄 Round Robin',
};

// ── Medal helper ──────────────────────────────────────────────────────────────
function medal(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank);
}

// ── Main component ────────────────────────────────────────────────────────────

export const TournamentPage: React.FC = () => {
  const { universe, id } = useParams<{ universe: string; id: string }>();
  const navigate = useNavigate();
  const { user } = useUserStore();
  const { addNotification } = useNotificationStore();
  const { tournaments, fetchOne, joinTournament, leaveTournament, loading } = useTournamentStore();

  const [activeTab, setActiveTab] = useState<'standings' | 'pairings' | 'games' | 'info'>('standings');
  const [, forceUpdate] = useState(0);
  const [joining, setJoining] = useState(false);

  // Countdown re-render
  useEffect(() => {
    const timer = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch this tournament from API on mount
  useEffect(() => {
    if (id) fetchOne(id);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <h2 style={{ color: 'var(--text-1)' }}>Tournament not found</h2>
        <button className="btn btn-secondary" onClick={() => navigate(`/${universe}`)}>
          ← Back to Lobby
        </button>
      </div>
    );
  }

  const myName   = user?.name || '';
  const hasJoined = !!myName && tournament.players.some(p => p.name === myName);

  const now        = Date.now();
  const startsIn   = tournament.startsAt - now;
  const endsAt     = tournament.startsAt + tournament.durationMs;
  const timeLeftMs = endsAt - now;

  const handleJoin = async () => {
    if (!user) { addNotification('Sign in to join tournaments', 'error'); return; }
    setJoining(true);
    try {
      if (hasJoined) {
        await leaveTournament(tournament.id);
        addNotification('You withdrew from the tournament.', 'info');
      } else {
        await joinTournament(tournament.id);
        addNotification(`You joined ${tournament.name}!`, 'success');
      }
    } catch (e: any) {
      addNotification(e?.message || 'Failed to update registration', 'error');
    } finally {
      setJoining(false);
    }
  };

  // Sorted standings
  const standings = [...tournament.players].sort((a, b) =>
    b.score !== a.score ? b.score - a.score : b.performance - a.performance
  );

  const isRunning  = tournament.status === 'running';
  const isUpcoming = tournament.status === 'upcoming';

  return (
    <div className="tp-page">
      {/* ── Back ── */}
      <button className="tp-back" onClick={() => navigate(`/${universe}`)}>
        ← Back to Lobby
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
              {tournament.rated && <><span>·</span><span>★ Rated</span></>}
              {tournament.betEntry > 0 && <><span>·</span><span>💰 ${tournament.betEntry} entry</span></>}
              {tournament.prizePool > 0 && <><span>·</span><span className="tp-prize">🎁 ${tournament.prizePool} prize</span></>}
            </div>
          </div>
        </div>

        <div className="tp-hero-right">
          {/* Countdown */}
          {isRunning && (
            <div className="tp-countdown-wrap">
              <div className="tp-countdown-label">Time remaining</div>
              <div className="tp-countdown">{formatCountdown(timeLeftMs)}</div>
            </div>
          )}
          {isUpcoming && (
            <div className="tp-countdown-wrap">
              <div className="tp-countdown-label">Starts in</div>
              <div className="tp-countdown">{formatCountdown(startsIn)}</div>
            </div>
          )}

          {/* CTA */}
          {tournament.status !== 'finished' && (
            <button
              className={`btn ${hasJoined ? 'tp-btn-withdraw' : 'tp-btn-join'}`}
              onClick={handleJoin}
              disabled={joining}
            >
              {joining ? '…' : hasJoined
                ? isRunning ? '🏳 Withdraw' : '✕ Cancel'
                : isRunning ? '▶ Join Now' : '✓ Register'}
            </button>
          )}
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="tp-stats-bar">
        <div className="tp-stat">
          <span className="tp-stat-val">{tournament.players.length}</span>
          <span className="tp-stat-label">Players</span>
        </div>
        <div className="tp-stat">
          <span className="tp-stat-val">{tournament.games.length}</span>
          <span className="tp-stat-label">Games played</span>
        </div>
        {tournament.format !== 'arena' && (
          <div className="tp-stat">
            <span className="tp-stat-val">{tournament.currentRound}/{tournament.totalRounds}</span>
            <span className="tp-stat-label">Rounds</span>
          </div>
        )}
        <div className="tp-stat">
          <span className="tp-stat-val">
            {isRunning ? '🔴 LIVE' : isUpcoming ? '⏰' : '✅ Ended'}
          </span>
          <span className="tp-stat-label">Status</span>
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
            {tab === 'standings' ? '📊 Standings'
           : tab === 'pairings'  ? '⚔️ Pairings'
           : tab === 'games'     ? '🎮 Games'
           :                       'ℹ️ Info'}
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
                {isUpcoming ? 'No registrations yet — be the first!' : 'No players yet'}
              </div>
              {isUpcoming && !hasJoined && (
                <button className="btn tp-btn-join" style={{ marginTop: 16 }} onClick={handleJoin}>
                  ✓ Register Now
                </button>
              )}
            </div>
          ) : (
            <AppErrorBoundary key={tournament.id}>
              <div className="tp-table-head">
                <span>#</span>
                <span>Player</span>
                <span className="tp-col-center">Score</span>
                <span className="tp-col-center">Games</span>
                <span className="tp-col-center">W / D / L</span>
                <span className="tp-col-center">Perf.</span>
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
                          {player.name || 'Unknown'}
                          {isMe && <span className="tp-you-badge">you</span>}
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
                {isUpcoming ? 'Pairings will be drawn when the tournament starts' : 'No pairings yet'}
              </div>
            </div>
          ) : (
            <>
              {/* Current / Next round header */}
              <div className="tp-round-header">
                {isRunning
                  ? `Round ${tournament.currentRound} — Live Pairings`
                  : isUpcoming
                  ? 'Registered players (pairings TBD)'
                  : `Final pairings — ${tournament.totalRounds || tournament.games.length} rounds`}
              </div>

              {/* Arena: show all current games as pairings */}
              {tournament.format === 'arena' && isRunning && tournament.games.length > 0 && (
                <div className="tp-pairing-list">
                  {[...tournament.games].reverse().slice(0, 8).map((g, i) => {
                    const wp = tournament.players.find(p => p.name === g.white);
                    const bp = tournament.players.find(p => p.name === g.black);
                    const done = g.result !== '*';
                    return (
                      <div key={g.id} className={`tp-pairing-row ${done ? 'done' : 'live'}`}>
                        <span className="tp-pair-board">#{i + 1}</span>
                        <div className="tp-pair-player white">
                          <span className="tp-pair-name">{g.white}</span>
                          <span className="tp-pair-rating">{wp?.rating ?? '?'}</span>
                        </div>
                        <span className={`tp-pair-result ${done ? (g.result === '1-0' ? 'white-win' : g.result === '0-1' ? 'black-win' : 'draw') : 'live'}`}>
                          {done ? g.result : '● vs'}
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
                        <span>{p.name}{p.name === myName && <span className="tp-you-badge">you</span>}</span>
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
                No games played yet
              </div>
            </div>
          ) : (
            [...tournament.games].reverse().map(game => (
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
                  <span>{game.moves} moves</span>
                  <span>·</span>
                  <span>{game.duration}</span>
                  <span>·</span>
                  <span>{timeAgo(game.playedAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── INFO ── */}
      {activeTab === 'info' && (
        <div className="tp-info-panel">
          <div className="tp-info-grid">
            <div className="tp-info-card">
              <div className="tp-info-label">Format</div>
              <div className="tp-info-val">{FORMAT_LABEL[tournament.format]}</div>
            </div>
            <div className="tp-info-card">
              <div className="tp-info-label">Time Control</div>
              <div className="tp-info-val">⏱ {tournament.timeControl}</div>
            </div>
            <div className="tp-info-card">
              <div className="tp-info-label">Rating</div>
              <div className="tp-info-val">{tournament.rated ? '★ Rated' : '☆ Casual'}</div>
            </div>
            {tournament.betEntry > 0 && (
              <div className="tp-info-card">
                <div className="tp-info-label">Entry Fee</div>
                <div className="tp-info-val">💰 ${tournament.betEntry}</div>
              </div>
            )}
            {tournament.prizePool > 0 && (
              <div className="tp-info-card">
                <div className="tp-info-label">Prize Pool</div>
                <div className="tp-info-val prize">🎁 ${tournament.prizePool}</div>
              </div>
            )}
            <div className="tp-info-card">
              <div className="tp-info-label">Max Players</div>
              <div className="tp-info-val">{tournament.maxPlayers}</div>
            </div>
            {tournament.totalRounds > 0 && (
              <div className="tp-info-card">
                <div className="tp-info-label">Rounds</div>
                <div className="tp-info-val">{tournament.totalRounds}</div>
              </div>
            )}
          </div>

          <div className="tp-desc-box">
            <div className="tp-desc-title">About this tournament</div>
            <p className="tp-desc-text">{tournament.description}</p>
          </div>

          {tournament.format === 'arena' && (
            <div className="tp-rules-box">
              <div className="tp-desc-title">Arena Rules</div>
              <ul className="tp-rules">
                <li>Players can join and leave at any time during the tournament.</li>
                <li>Games are paired automatically against available opponents.</li>
                <li>Win = 2 pts · Draw = 1 pt · Loss = 0 pts</li>
                <li>A win streak activates 🔥 Berserk mode — double points risk.</li>
                <li>Standings are determined by score, then by performance rating.</li>
              </ul>
            </div>
          )}

          {tournament.format === 'swiss' && (
            <div className="tp-rules-box">
              <div className="tp-desc-title">Swiss Rules</div>
              <ul className="tp-rules">
                <li>All players play {tournament.totalRounds} rounds.</li>
                <li>Players with similar scores are paired each round.</li>
                <li>Win = 1 pt · Draw = 0.5 pt · Loss = 0 pt</li>
                <li>Final ranking by total score, then tiebreaks (Buchholz, SB).</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
