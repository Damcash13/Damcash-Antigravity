import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserStore, useNotificationStore, RatingEntry } from '../../stores';
import type { SocialLinks } from '../../types';
import { useTournamentStore } from '../../stores/tournamentStore';
import { ratingBand, performanceRating } from '../../lib/elo';
import { api, ApiUserProfile, ApiUserStats, ApiMatch, ApiFullStats } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useInviteStore } from '../../stores/inviteStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useDirectMessageStore } from '../../stores/directMessageStore';
import { AvatarUpload } from './AvatarUpload';
import { countryFlag, countryName } from '../../lib/countries';
import { displayTournamentName } from '../../lib/tournamentDisplay';
import { formatLocalDate, formatLocalDateTime, getUserTimeZone } from '../../lib/timezone';
import '../../styles/profile.css';

// ── Sparkline ─────────────────────────────────────────────────────────────────
const Sparkline: React.FC<{ data: number[]; color: string; width?: number; height?: number }> = ({
  data, color, width = 160, height = 44,
}) => {
  if (data.length < 2) return <div style={{ width, height, opacity: 0.3, fontSize: 11, color: 'var(--text-3)', display:'flex', alignItems:'center', justifyContent:'center' }}>No data</div>;
  const min = Math.min(...data) - 5;
  const max = Math.max(...data) + 5;
  const range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`
  ).join(' ');
  const trend = data[data.length - 1] >= data[0];
  const c = trend ? color : '#ef4444';
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <defs>
        <linearGradient id={`g-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.35" />
          <stop offset="100%" stopColor={c} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#g-${color.replace('#','')})`} />
      <polyline points={pts} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ── Activity heatmap (GitHub-style, 12 weeks) ─────────────────────────────────
type ProfileRatingEntry = RatingEntry & {
  matchId?: string;
  timeControl?: string;
  tournamentId?: string | null;
};

type ActivityEntry = { playedAt: number };

const PlayerFlag: React.FC<{ country?: string; className?: string }> = ({ country, className }) => {
  const flag = countryFlag(country || '');
  if (!flag) return null;
  return (
    <span className={className || 'pf-player-flag'} title={countryName(country || '')}>
      {flag}
    </span>
  );
};

const ActivityHeatmap: React.FC<{ history: ActivityEntry[] }> = ({ history }) => {
  const WEEKS = 26;
  const DAYS  = 7;
  const now   = Date.now();

  // Build bucket: day index to count
  const buckets: Record<number, number> = {};
  history.forEach(e => {
    const dayIdx = Math.floor((now - e.playedAt) / 86_400_000);
    if (dayIdx < WEEKS * DAYS) buckets[dayIdx] = (buckets[dayIdx] || 0) + 1;
  });

  const cells = Array.from({ length: WEEKS * DAYS }, (_, i) => buckets[i] || 0);
  const maxV  = Math.max(...cells, 1);

  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAY_LABELS   = ['S','M','T','W','T','F','S'];

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-day-labels">
        {DAY_LABELS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="heatmap-grid" style={{ gridTemplateColumns: `repeat(${WEEKS}, 14px)` }}>
        {Array.from({ length: WEEKS }, (_, wi) =>
          Array.from({ length: DAYS }, (_, di) => {
            const idx   = wi * DAYS + di;
            const count = cells[idx] || 0;
            const alpha = count === 0 ? 0 : 0.2 + 0.8 * (count / maxV);
            return (
              <div
                key={`${wi}-${di}`}
                className="heatmap-cell"
                title={count > 0 ? `${count} game${count > 1 ? 's' : ''}` : 'No games'}
                style={{ background: count === 0 ? 'var(--bg-3)' : `rgba(56,189,248,${alpha})` }}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

// ── Rating chart with labeled axes ───────────────────────────────────────────
const RatingChart: React.FC<{ entries: RatingEntry[]; color: string; currentRating: number }> = ({
  entries, color, currentRating,
}) => {
  const W = 680; const H = 120; const PAD = { top: 12, right: 16, bottom: 28, left: 48 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;

  if (entries.length < 2) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
        Play rated games to build your chart
      </div>
    );
  }

  const data = entries.map(e => e.after);
  const allVals = [...data, currentRating];
  const minV = Math.floor((Math.min(...allVals) - 20) / 50) * 50;
  const maxV = Math.ceil((Math.max(...allVals) + 20) / 50) * 50;
  const range = maxV - minV || 1;

  const toX = (i: number) => PAD.left + (i / (data.length - 1)) * iW;
  const toY = (v: number) => PAD.top + iH - ((v - minV) / range) * iH;

  const pts = data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const area = `${PAD.left},${H - PAD.bottom} ${pts} ${PAD.left + iW},${H - PAD.bottom}`;

  // Y axis ticks
  const yTicks: number[] = [];
  for (let v = minV; v <= maxV; v += 50) yTicks.push(v);

  // X axis: show dates at evenly spaced points
  const xLabels = [0, Math.floor(data.length / 2), data.length - 1].map(i => ({
    x: toX(i),
    label: formatLocalDate(entries[i].playedAt, { month: 'short', day: 'numeric' }),
  }));

  const trend = data[data.length - 1] >= data[0];
  const lineColor = trend ? color : '#ef4444';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', maxWidth: W }}>
      <defs>
        <linearGradient id="rg-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines + Y labels */}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={PAD.left} x2={PAD.left + iW} y1={toY(v)} y2={toY(v)}
            stroke="var(--border)" strokeWidth="0.8" strokeDasharray="3,3" />
          <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end" fontSize="10" fill="var(--text-3)">{v}</text>
        </g>
      ))}

      {/* Area fill */}
      <polygon points={area} fill="url(#rg-area)" />

      {/* Line */}
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Current rating dot */}
      <circle cx={toX(data.length - 1)} cy={toY(data[data.length - 1])} r="4" fill={lineColor} />

      {/* X axis labels */}
      {xLabels.map(({ x, label }, i) => (
        <text key={i} x={x} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--text-3)">{label}</text>
      ))}

      {/* Axes */}
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--border)" strokeWidth="1" />
      <line x1={PAD.left} x2={PAD.left + iW} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--border)" strokeWidth="1" />
    </svg>
  );
};

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard: React.FC<{ icon?: string; label: string; value: string | number; sub?: string; color?: string }> = ({
  label, value, sub, color,
}) => (
  <div className="pf-stat-card">
    <div className="pf-stat-body">
      <div className="pf-stat-val" style={color ? { color } : undefined}>{value}</div>
      <div className="pf-stat-label">{label}</div>
      {sub && <div className="pf-stat-sub">{sub}</div>}
    </div>
  </div>
);

// ── Achievements ─────────────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  { id: 'first_win',    label: 'First Victory',    desc: 'Win your first game',         check: (s: any) => (s?.chess?.wins ?? 0) + (s?.checkers?.wins ?? 0) >= 1 },
  { id: 'ten_games',    label: 'Getting Started',  desc: 'Play 10 games',               check: (s: any) => (s?.totalGames ?? 0) >= 10 },
  { id: 'fifty_games',  label: 'Veteran',          desc: 'Play 50 games',               check: (s: any) => (s?.totalGames ?? 0) >= 50 },
  { id: 'streak_5',     label: 'On Fire',          desc: '5 win streak',                check: (s: any) => (s?.bestStreak ?? 0) >= 5 },
  { id: 'streak_10',    label: 'Unstoppable',      desc: '10 win streak',               check: (s: any) => (s?.bestStreak ?? 0) >= 10 },
  { id: 'rating_1400',  label: 'Advanced',         desc: 'Reach 1400 rating',           check: (s: any) => (s?.chess?.rating ?? 0) >= 1400 || (s?.checkers?.rating ?? 0) >= 1400 },
  { id: 'rating_1800',  label: 'Expert',           desc: 'Reach 1800 rating',           check: (s: any) => (s?.chess?.rating ?? 0) >= 1800 || (s?.checkers?.rating ?? 0) >= 1800 },
  { id: 'tournament',   label: 'Competitor',       desc: 'Join a tournament',           check: (s: any) => (s?.tournaments?.length ?? 0) >= 1 },
  { id: 'bet_winner',   label: 'High Roller',      desc: 'Win 5 bet games',             check: (s: any) => (s?.wallet?.betsWon ?? 0) >= 5 },
  { id: 'both_games',   label: 'Dual Player',      desc: 'Play both chess & checkers',  check: (s: any) => (s?.chess?.games ?? 0) >= 1 && (s?.checkers?.games ?? 0) >= 1 },
];

const AchievementBadge: React.FC<{ achievement: typeof ACHIEVEMENTS[0]; unlocked: boolean }> = ({ achievement, unlocked }) => (
  <div className={`pf-achievement ${unlocked ? 'unlocked' : 'locked'}`} title={achievement.desc}>
    <div className="pf-achievement-info">
      <div className="pf-achievement-name">{achievement.label}</div>
      <div className="pf-achievement-desc">{achievement.desc}</div>
    </div>
  </div>
);

// ── Social links display ─────────────────────────────────────────────────────
const SocialLinksRow: React.FC<{ links?: SocialLinks }> = ({ links }) => {
  if (!links) return null;
  const items = [
    links.twitter  && { label: 'Twitter',   url: `https://twitter.com/${links.twitter}` },
    links.lichess  && { label: 'Lichess',   url: `https://lichess.org/@/${links.lichess}` },
    links.chessCom && { label: 'Chess.com', url: `https://chess.com/member/${links.chessCom}` },
  ].filter(Boolean) as { label: string; url: string }[];
  if (items.length === 0) return null;
  return (
    <div className="pf-social-row">
      {items.map(item => (
        <a key={item.label} className="pf-social-link" href={item.url} target="_blank" rel="noopener noreferrer" title={item.label}>
          <span>{item.label}</span>
        </a>
      ))}
    </div>
  );
};

const getStoredRatingHistory = (fullStats: ApiFullStats | null, fallback: RatingEntry[] = []): ProfileRatingEntry[] =>
  fullStats?.ratingHistory?.length ? fullStats.ratingHistory : fallback;

const matchOpponent = (match: ApiMatch, username: string) =>
  match.white.username === username ? match.black : match.white;

const matchOpponentRating = (match: ApiMatch, username: string) => {
  const isWhite = match.white.username === username;
  const rating = isWhite
    ? match.blackRatingAfter ?? match.blackRatingBefore ?? match.black?.[match.universe === 'checkers' ? 'checkersRating' : 'chessRating']
    : match.whiteRatingAfter ?? match.whiteRatingBefore ?? match.white?.[match.universe === 'checkers' ? 'checkersRating' : 'chessRating'];
  return typeof rating === 'number' ? rating : null;
};

const MatchOpponentIdentity: React.FC<{ match: ApiMatch; username: string; showPrefix?: boolean }> = ({ match, username, showPrefix }) => {
  const opp = matchOpponent(match, username);
  const rating = matchOpponentRating(match, username);
  return (
    <span className="pf-player-inline">
      {showPrefix && <span>vs</span>}
      <PlayerFlag country={opp.country} className="pf-inline-flag" />
      <span>{opp.username}</span>
      {rating != null && <span className="pf-inline-rating">Elo {rating}</span>}
    </span>
  );
};

const matchResultForUser = (match: ApiMatch, username: string): 'win' | 'draw' | 'loss' | null => {
  const isWhite = match.white.username === username;
  if (match.result === 'draw') return 'draw';
  if ((isWhite && match.result === 'white') || (!isWhite && match.result === 'black')) return 'win';
  if ((isWhite && match.result === 'black') || (!isWhite && match.result === 'white')) return 'loss';
  return null;
};

const matchRatingDeltaForUser = (match: ApiMatch, username: string) => {
  const delta = match.white.username === username ? match.whiteRatingDelta : match.blackRatingDelta;
  return typeof delta === 'number' ? delta : null;
};

const matchPlayedAt = (match: ApiMatch) => new Date(match.endedAt ?? match.createdAt).getTime();

const canReviewMatch = (match: ApiMatch) =>
  Boolean(match.pgn?.trim()) || (Array.isArray(match.moveList) && match.moveList.length > 0);

const profileUniverseLabel = (universe: string, t: any) =>
  universe === 'chess' ? t('profile.chess') : t('profile.checkers');

const resultLabel = (result: 'win' | 'draw' | 'loss' | null | undefined) =>
  result === 'win' ? 'Win' : result === 'draw' ? 'Draw' : result === 'loss' ? 'Loss' : '—';

const transactionTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    DEPOSIT: 'Deposit',
    WITHDRAWAL: 'Withdraw',
    BET_WON: 'Bet payout',
    BET_PLACED: 'Bet escrow',
    BET_REFUND: 'Bet refund',
    TOURNAMENT_ENTRY: 'Tournament entry',
    TOURNAMENT_REFUND: 'Tournament refund',
    TOURNAMENT_PAYOUT: 'Tournament payout',
  };
  return labels[type] ?? type;
};

// ── Public profile (other users) ─────────────────────────────────────────────
const PublicProfilePage: React.FC<{ username: string }> = ({ username }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user: me } = useUserStore();
  const isLoggedIn = useUserStore(s => s.isLoggedIn);
  const addNotification = useNotificationStore(s => s.addNotification);
  const { onlinePlayers, openConfig } = useInviteStore();
  const blockedUsers = useSafetyStore(s => s.blockedUsers);
  const blockUser = useSafetyStore(s => s.blockUser);
  const unblockUser = useSafetyStore(s => s.unblockUser);
  const openConversation = useDirectMessageStore(s => s.openConversation);
  const [profile,   setProfile]   = useState<ApiUserProfile | null>(null);
  const [stats,     setStats]     = useState<ApiUserStats | null>(null);
  const [games,     setGames]     = useState<ApiMatch[]>([]);
  const [fullStats, setFullStats] = useState<ApiFullStats | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [universe,  setUniverse]  = useState<'chess' | 'checkers'>('chess');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.users.get(username),
      api.users.stats(username),
      api.users.games(username),
      api.users.fullStats(username),
    ])
      .then(([p, s, g, fs]) => { setProfile(p); setStats(s); setGames(g); setFullStats(fs); })
      .catch(() => setError('Player not found'))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
      <div className="spinner" />
    </div>
  );

  if (error || !profile || !stats) return (
    <div className="pf-no-user">
      <h2 style={{ color: 'var(--text-1)', margin: '16px 0 8px' }}>{t('common.unknown')}</h2>
      <p style={{ color: 'var(--text-3)', marginBottom: 20 }}>No account with username <strong>{username}</strong></p>
      <button className="btn btn-primary" onClick={() => navigate(-1)}>Back</button>
    </div>
  );

  const fallbackStats = universe === 'chess' ? stats.chess : stats.checkers;
  const durableStats = fullStats?.[universe];
  const uStats = {
    rating: durableStats?.rating ?? fallbackStats.rating,
    peak: durableStats?.peak ?? fallbackStats.peak,
    games: durableStats?.games ?? fallbackStats.games,
    wins: durableStats?.wins ?? fallbackStats.wins,
    losses: durableStats?.losses ?? fallbackStats.losses,
    draws: durableStats?.draws ?? fallbackStats.draws,
    bestStreak: durableStats?.bestStreak ?? fullStats?.bestStreak ?? 0,
    favouriteTC: durableStats?.favouriteTC ?? fullStats?.favouriteTC ?? null,
  };
  const winRate = uStats.games > 0 ? Math.round((uStats.wins / uStats.games) * 100) : 0;
  const publicRatingHistory = getStoredRatingHistory(fullStats).filter(e => e.universe === universe);
  const publicSparkData = [...publicRatingHistory].reverse().slice(-40).map(e => e.after);
  const publicActivity = games.length > 0
    ? games.map(g => ({ playedAt: matchPlayedAt(g) })).filter(e => Number.isFinite(e.playedAt))
    : publicRatingHistory;
  const publicRecentGames = games.filter(g => g.universe === universe).slice(0, 15);
  const rating = uStats.rating;
  const band   = ratingBand(rating);
  const joined = formatLocalDate(profile.createdAt, { year: 'numeric', month: 'long' });
  const isBlocked = blockedUsers.includes(profile.username.trim().toLowerCase());
  const onlineEntry = onlinePlayers.find(p => p.name === profile.username && p.universe === universe);

  const handleChallenge = () => {
    if (isBlocked) {
      addNotification(`Unblock ${profile.username} before challenging them.`, 'warning');
      return;
    }
    if (!onlineEntry) {
      addNotification(`${profile.username} is not online right now.`, 'info');
      return;
    }
    openConfig({ socketId: onlineEntry.socketId, name: onlineEntry.name, universe: onlineEntry.universe });
  };

  const handleReport = async () => {
    if (!isLoggedIn) {
      addNotification('Sign in to report a user.', 'warning');
      return;
    }
    try {
      await api.safety.report({
        targetUsername: profile.username,
        reason: 'profile_report',
        context: 'profile_page',
        notes: 'Reported from public profile.',
      });
      addNotification(`Report received for ${profile.username}.`, 'success');
    } catch (err: any) {
      addNotification(err?.message || 'Could not send report. Please try again.', 'error');
    }
  };

  const handleMessage = () => {
    if (!isLoggedIn) {
      addNotification('Sign in to message players.', 'warning');
      return;
    }
    if (isBlocked) {
      addNotification(`Unblock ${profile.username} before messaging them.`, 'warning');
      return;
    }
    openConversation(profile.username);
  };

  const handleReview = async () => {
    if (!isLoggedIn) {
      addNotification('Sign in to request a review.', 'warning');
      return;
    }
    try {
      await api.safety.review({
        targetUsername: profile.username,
        reason: 'suspicious_game_or_payment',
        notes: 'Suspicious game/payment review requested from public profile.',
      });
      addNotification(`Review request recorded for ${profile.username}.`, 'success');
    } catch (err: any) {
      addNotification(err?.message || 'Could not request review. Please try again.', 'error');
    }
  };

  const handleBlock = async () => {
    if (isBlocked) {
      unblockUser(profile.username);
      if (!isLoggedIn) {
        addNotification(`Unblocked ${profile.username}.`, 'info');
        return;
      }
      try {
        await api.safety.unblock(profile.username);
        addNotification(`Unblocked ${profile.username}.`, 'info');
      } catch (err: any) {
        addNotification(err?.message || 'Unblocked locally. Server sync will retry later.', 'warning');
      }
      return;
    }

    blockUser(profile.username);
    if (!isLoggedIn) {
      addNotification(`Blocked ${profile.username} on this device.`, 'info');
      return;
    }
    try {
      await api.safety.block({ targetUsername: profile.username });
      addNotification(`Blocked ${profile.username}.`, 'info');
    } catch (err: any) {
      addNotification(err?.message || 'Blocked locally. Server sync will retry later.', 'warning');
    }
  };

  return (
    <div className="pf-page">
      <div className="pf-hero">
        <div className="pf-hero-bg" />
        <div className="pf-hero-inner">
          <div className="pf-avatar-wrap">
            <div className="pf-avatar">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                profile.username[0]?.toUpperCase()
              )}
            </div>
          </div>
          <div className="pf-hero-info">
            <div className="pf-hero-name-row">
              <PlayerFlag country={profile.country} />
              <h1 className="pf-hero-name">{profile.username}</h1>
              <span className="pf-rating-chip">Elo {rating}</span>
              <span className="pf-rank-badge" style={{ background: band.color + '28', color: band.color }}>{band.label}</span>
              {me && me.name !== profile.username && (
                <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }}>Follow</button>
              )}
            </div>
            <div className="pf-hero-sub">
              <span>{uStats.games} {t('common.games')}</span>
              <span>·</span>
              <span style={{ color: winRate >= 50 ? '#22c55e' : '#ef4444' }}>{winRate}% {t('common.winRate')}</span>
              <span>·</span>
              <span>{t('profile.memberSince')} {joined}</span>
            </div>
            {me && me.name !== profile.username && (
              <div className="pf-safety-actions">
                <button className="btn btn-primary btn-sm" onClick={handleChallenge} disabled={!onlineEntry || isBlocked}>
                  Challenge
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleMessage} disabled={isBlocked}>
                  Message
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleReport}>
                  Report
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleReview}>
                  Review
                </button>
                <button className="btn btn-secondary btn-sm pf-danger-btn" onClick={handleBlock}>
                  {isBlocked ? 'Unblock' : 'Block'}
                </button>
              </div>
            )}
          </div>
          <div className="pf-universe-switch">
            <button className={`pf-usw ${universe === 'chess' ? 'active' : ''}`} onClick={() => setUniverse('chess')}>{t('profile.chess')}</button>
            <button className={`pf-usw ${universe === 'checkers' ? 'active' : ''}`} onClick={() => setUniverse('checkers')}>{t('profile.checkers')}</button>
          </div>
        </div>
      </div>

      <div className="pf-tab-body">
        {/* KPI strip */}
        <div className="pf-kpi-strip">
          <div className="pf-kpi">
            <div className="pf-kpi-val">{fullStats?.totalGames ?? uStats.games}</div>
            <div className="pf-kpi-lbl">{t('profile.totalGames')}</div>
          </div>
          <div className="pf-kpi">
            <div className="pf-kpi-val" style={{ color: '#22c55e' }}>{fullStats ? fullStats.chess.wins + fullStats.checkers.wins : uStats.wins}</div>
            <div className="pf-kpi-lbl">{t('common.wins')}</div>
          </div>
          <div className="pf-kpi">
            <div className="pf-kpi-val" style={{ color: '#ef4444' }}>{fullStats ? fullStats.chess.losses + fullStats.checkers.losses : uStats.losses}</div>
            <div className="pf-kpi-lbl">{t('common.losses')}</div>
          </div>
          <div className="pf-kpi">
            <div className="pf-kpi-val" style={{ color: '#94a3b8' }}>{fullStats ? fullStats.chess.draws + fullStats.checkers.draws : uStats.draws}</div>
            <div className="pf-kpi-lbl">{t('common.draws')}</div>
          </div>
          <div className="pf-kpi">
            <div className="pf-kpi-val" style={{ color: '#f59e0b' }}>{fullStats?.tournaments.length ?? 0}</div>
            <div className="pf-kpi-lbl">{t('profile.tournaments')}</div>
          </div>
          <div className="pf-kpi">
            <div className="pf-kpi-val">{fullStats ? (() => { const h = Math.floor(fullStats.estimatedPlayMs/3_600_000); return h>=1?`${h}h`:`${Math.floor(fullStats.estimatedPlayMs/60_000)}m`; })() : '—'}</div>
            <div className="pf-kpi-lbl">{t('profile.timePlayed')}</div>
          </div>
          <div className="pf-kpi">
            <div className="pf-kpi-val">{fullStats ? formatLocalDate(fullStats.joinedAt, { month: 'short', year: 'numeric' }) : joined}</div>
            <div className="pf-kpi-lbl">{t('profile.memberSince')}</div>
          </div>
          <div className="pf-kpi">
            <div className="pf-kpi-val">{fullStats?.bestStreak ?? 0}</div>
            <div className="pf-kpi-lbl">{t('profile.bestStreak')}</div>
          </div>
        </div>

        <div className="pf-overview-grid">
          <div className="pf-main-col">
            {/* Rating card */}
            <div className="pf-section">
              <div className="pf-section-title">{t('common.rating')}</div>
              <div className="pf-rating-banner">
                <div>
                  <div className="pf-big-rating" style={{ color: band.color }}>{rating}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                    {profileUniverseLabel(universe, t)} — {band.label}
                  </div>
                </div>
              </div>
              <div className="pf-rating-row">
                <div className="pf-mini-badge"><span>{t('profile.peak')}</span><strong>{uStats.peak}</strong></div>
                <div className="pf-mini-badge"><span>{t('common.games')}</span><strong>{uStats.games}</strong></div>
                <div className="pf-mini-badge"><span>{t('common.winRate')}</span><strong>{winRate}%</strong></div>
                <div className="pf-mini-badge"><span>{t('profile.favouriteTC')}</span><strong>{uStats.favouriteTC ?? '—'}</strong></div>
              </div>
            </div>

            <div className="pf-section">
              <div className="pf-section-title">{t('common.rating')}</div>
              <div className="pf-rating-banner">
                <div>
                  <div className="pf-big-rating" style={{ color: band.color }}>{rating}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                    {publicRatingHistory.length} rated games recorded
                  </div>
                </div>
                <Sparkline data={publicSparkData} color={band.color} width={180} height={55} />
              </div>
              <RatingChart entries={[...publicRatingHistory].reverse().slice(-60)} color={band.color} currentRating={rating} />
            </div>

            {/* W/D/L */}
            <div className="pf-section">
              <div className="pf-section-title">{t('profile.history')} — {profileUniverseLabel(universe, t)}</div>
              <div className="pf-wdl-bar-wrap">
                <div className="pf-wdl-bar">
                  <div className="pf-wdl-w" style={{ flex: uStats.wins   || 0.01 }} />
                  <div className="pf-wdl-d" style={{ flex: uStats.draws  || 0.01 }} />
                  <div className="pf-wdl-l" style={{ flex: uStats.losses || 0.01 }} />
                </div>
                <div className="pf-wdl-nums">
                  <span className="w">{uStats.wins}W</span>
                  <span className="d">{uStats.draws}D</span>
                  <span className="l">{uStats.losses}L</span>
                  <span className="total">/ {uStats.games}</span>
                </div>
              </div>
            </div>

            <div className="pf-section">
              <div className="pf-section-title">Activity</div>
              <ActivityHeatmap history={publicActivity} />
            </div>

            {/* Recent games */}
            {publicRecentGames.length > 0 && (
              <div className="pf-section">
                <div className="pf-section-title">{t('profile.recentGames')}</div>
                <div className="pf-hist-head pf-public-games">
                  <span>{t('common.player')}</span>
                  <span className="c">{t('common.white')}/{t('common.black')}</span>
                  <span className="c">{t('game.drawResult')}</span>
                  <span className="c">TC</span>
                  <span className="c">{t('common.today')}</span>
                  <span className="c">Review</span>
                </div>
                {publicRecentGames.map(g => {
                  const isWhite = g.white.username === profile.username;
                  const myResult = matchResultForUser(g, profile.username);
                  const rc = myResult ?? '';
                  return (
                    <div key={g.id} className="pf-hist-row pf-public-games">
                      <span className="pf-hist-opp"><MatchOpponentIdentity match={g} username={profile.username} showPrefix /></span>
                      <span className="c pf-dim">{isWhite ? 'White' : 'Black'}</span>
                      <span className={`c pf-result ${rc}`}>
                        {resultLabel(myResult)}
                      </span>
                      <span className="c pf-dim" style={{ fontSize: 11 }}>{g.timeControl}</span>
                      <span className="c pf-dim" style={{ fontSize: 11 }}>
                        {formatLocalDate(g.endedAt ?? g.createdAt)}
                      </span>
                      <span className="c">
                        {canReviewMatch(g)
                          ? <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => navigate(`/game/${g.id}`)}>Review</button>
                          : <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                        }
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main export ───────────────────────────────────────────────────────────────
const TABS = ['Overview','Rating','History','Tournaments','Settings'] as const;
type Tab = typeof TABS[number];

export const ProfilePage: React.FC = () => {
  const navigate  = useNavigate();
  const { name: paramUsername } = useParams<{ name?: string }>();
  const { user, ratingHistory, gamesPlayed, saveUsername, updateProfile } = useUserStore();
  const { tournaments } = useTournamentStore();

  // All hooks must appear before any conditional return
  const [tab,         setTab]         = useState<Tab>('Overview');
  const [universe,    setUniverse]    = useState<'chess' | 'checkers'>('chess');
  const [editName,    setEditName]    = useState(false);
  const [nameInput,   setNameInput]   = useState(user?.name || '');
  const [apiGames,    setApiGames]    = useState<ApiMatch[]>([]);
  const [fullStats,   setFullStats]   = useState<ApiFullStats | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [newUsername, setNewUsername] = useState(user?.name || '');
  const [countryCode, setCountryCode] = useState(user?.country || '');
  const [newPw,       setNewPw]       = useState('');
  const [pwMsg,       setPwMsg]       = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'win' | 'draw' | 'loss'>('all');
  const [historyPage, setHistoryPage] = useState(0);
  const HISTORY_PAGE_SIZE = 20;
  const [bioInput,       setBioInput]       = useState(user?.bio || '');
  const [socialTwitter,  setSocialTwitter]  = useState(user?.socialLinks?.twitter || '');
  const [socialLichess,  setSocialLichess]  = useState(user?.socialLinks?.lichess || '');
  const [socialChessCom, setSocialChessCom] = useState(user?.socialLinks?.chessCom || '');
  const { t } = useTranslation();
  const { addNotification } = useNotificationStore();

  useEffect(() => {
    if (!user || (paramUsername && paramUsername !== user.name)) return;
    setProfileLoading(true);
    Promise.all([
      api.users.games(user.name).then(setApiGames).catch(err => {
        if (err?.status !== 404) addNotification(t('errors.profileLoad', 'Could not load game history'), 'error');
      }),
      api.users.fullStats(user.name).then(setFullStats).catch(err => {
        if (err?.status !== 404) addNotification(t('errors.statsLoad', 'Could not load stats'), 'error');
      }),
    ]).finally(() => setProfileLoading(false));
  }, [user?.name]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Viewing another user's profile
  if (paramUsername && paramUsername !== user?.name) {
    return <PublicProfilePage username={paramUsername} />;
  }

  if (!user) {
    return (
      <div className="pf-no-user">
        <h2 style={{ color: 'var(--text-1)', margin: '16px 0 8px' }}>{t('common.login')}</h2>
        <p style={{ color: 'var(--text-3)', marginBottom: 20 }}>{t('auth.playAsGuest')}</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>{t('lobby.lobby')}</button>
      </div>
    );
  }

  const storedRatingHistory = getStoredRatingHistory(fullStats, ratingHistory);
  const history      = storedRatingHistory.filter(e => e.universe === universe);
  const uvStats      = fullStats?.[universe];
  const rating       = uvStats?.rating ?? user.rating[universe];
  const band         = ratingBand(rating);
  const totalGames   = uvStats?.games ?? gamesPlayed[universe] ?? 0;
  const wins         = uvStats?.wins ?? history.filter(e => e.result === 'win').length;
  const draws        = uvStats?.draws ?? history.filter(e => e.result === 'draw').length;
  const losses       = uvStats?.losses ?? history.filter(e => e.result === 'loss').length;
  const winRate      = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const ratingPoints = history.flatMap(e => [e.before, e.after]);
  const peak         = uvStats?.peak ?? (ratingPoints.length > 0 ? Math.max(rating, ...ratingPoints) : rating);
  const low          = ratingPoints.length > 0 ? Math.min(rating, ...ratingPoints) : rating;
  const sparkData    = [...history].reverse().slice(-40).map(e => e.after);
  const last10       = history.slice(0, 10);
  const currentStreak = (() => {
    if (apiGames.length > 0) {
      let n = 0;
      for (const g of apiGames.filter(match => match.universe === universe)) {
        if (matchResultForUser(g, user.name) === 'win') n++;
        else break;
      }
      return n;
    }
    let n = 0;
    for (const e of history) { if (e.result === 'win') n++; else break; }
    return n;
  })();
  const bestStreak   = uvStats?.bestStreak ?? fullStats?.bestStreak ?? currentStreak;
  const activityEntries = apiGames.length > 0
    ? apiGames.map(g => ({ playedAt: matchPlayedAt(g) })).filter(e => Number.isFinite(e.playedAt))
    : storedRatingHistory;
  const recentMatches = apiGames.filter(g => g.universe === universe).slice(0, 5);

  const perfRating   = history.length > 0
    ? performanceRating(history.map(e => e.opponentRating), history.map(e => e.result))
    : rating;

  const myTournaments = tournaments.filter(t => t.players.some(p => p.name === user.name));

  const byCategory: Record<string, RatingEntry[]> = { Bullet: [], Blitz: [], Rapid: [], Classical: [] };

  if (profileLoading) {
    return (
      <div className="pf-page" style={{ padding: 24 }}>
        {/* Hero skeleton */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
          <div className="skeleton" style={{ width: 80, height: 80, borderRadius: '50%' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="skeleton skeleton-line-lg" style={{ width: 180 }} />
            <div className="skeleton skeleton-line" style={{ width: 120 }} />
          </div>
        </div>
        {/* Stats skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: 70, borderRadius: 10 }} />
          ))}
        </div>
        {/* Content skeleton */}
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="skeleton-row" style={{ padding: '10px 0' }}>
            <div className="skeleton skeleton-circle" />
            <div className="skeleton skeleton-line" style={{ width: `${60 + (i % 3) * 20}%` }} />
            <div className="skeleton skeleton-line-sm" style={{ width: 50, marginLeft: 'auto' }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="pf-page">
      {/* ── Hero ── */}
      <div className="pf-hero">
        <div className="pf-hero-bg" />
        <div className="pf-hero-inner">
          <div className="pf-avatar-wrap">
            <div className="pf-avatar pf-avatar-lg">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                user.name[0]?.toUpperCase()
              )}
            </div>
            {currentStreak >= 3 && <div className="pf-streak-badge">Streak {currentStreak}</div>}
            <div className="pf-online-dot" title="Online" />
          </div>
          <div className="pf-hero-info">
            <div className="pf-hero-name-row">
              <PlayerFlag country={user.country} />
              {editName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    className="pf-name-input"
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === 'Enter') {
                        setEditName(false);
                        if (nameInput.trim() && nameInput !== user.name) {
                          try { await saveUsername(nameInput); } catch {}
                        }
                      }
                      if (e.key === 'Escape') setEditName(false);
                    }}
                    autoFocus
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={async () => {
                      setEditName(false);
                      if (nameInput.trim() && nameInput !== user.name) {
                        try { await saveUsername(nameInput); } catch {}
                      }
                    }}
                  >Save</button>
                </div>
              ) : (
                <h1 className="pf-hero-name" onClick={() => { setEditName(true); setNameInput(user.name); }}>
                  {user.name} <span className="pf-edit-icon">Edit</span>
                </h1>
              )}
              <span className="pf-rating-chip">Elo {rating}</span>
              <span className="pf-rank-badge" style={{ background: band.color + '28', color: band.color }}>
                {band.label}
              </span>
            </div>
            {user.bio && <p className="pf-hero-bio">{user.bio}</p>}
            <div className="pf-hero-sub">
              <span>${Number(user.walletBalance).toFixed(2)}</span>
              <span>·</span>
              <span>{totalGames} {t('common.games')}</span>
              <span>·</span>
              <span style={{ color: winRate >= 50 ? '#22c55e' : '#ef4444' }}>
                {winRate}% {t('common.winRate')}
              </span>
              <span>·</span>
              <span>{fullStats ? formatLocalDate(fullStats.joinedAt, { month: 'short', year: 'numeric' }) : '—'}</span>
            </div>
            <SocialLinksRow links={user.socialLinks} />
          </div>

          {/* Universe switch */}
          <div className="pf-universe-switch">
            <button className={`pf-usw ${universe === 'chess' ? 'active' : ''}`} onClick={() => setUniverse('chess')}>{t('profile.chess')}</button>
            <button className={`pf-usw ${universe === 'checkers' ? 'active' : ''}`} onClick={() => setUniverse('checkers')}>{t('profile.checkers')}</button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="pf-tabs">
        {TABS.map(tabKey => {
          const tabLabel = tabKey === 'Overview'    ? t('profile.overview')    :
                           tabKey === 'Rating'      ? t('common.rating')       :
                           tabKey === 'History'     ? t('profile.history')     :
                           tabKey === 'Tournaments' ? t('profile.tournaments') : t('profile.settings');
          return (
            <button key={tabKey} className={`pf-tab ${tab === tabKey ? 'active' : ''}`} onClick={() => setTab(tabKey)}>
              {tabLabel}
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════ OVERVIEW ═══════════════════════════════ */}
      {tab === 'Overview' && (
        <div className="pf-tab-body">
          {/* ── Top KPI strip ── */}
          <div className="pf-kpi-strip">
            <div className="pf-kpi">
              <div className="pf-kpi-val">{fullStats ? fullStats.totalGames : (gamesPlayed.chess + gamesPlayed.checkers)}</div>
              <div className="pf-kpi-lbl">{t('profile.totalGames')}</div>
            </div>
            <div className="pf-kpi">
              <div className="pf-kpi-val" style={{ color: '#22c55e' }}>
                {fullStats ? fullStats.chess.wins + fullStats.checkers.wins : wins}
              </div>
              <div className="pf-kpi-lbl">{t('common.wins')}</div>
            </div>
            <div className="pf-kpi">
              <div className="pf-kpi-val" style={{ color: '#ef4444' }}>
                {fullStats ? fullStats.chess.losses + fullStats.checkers.losses : losses}
              </div>
              <div className="pf-kpi-lbl">{t('common.losses')}</div>
            </div>
            <div className="pf-kpi">
              <div className="pf-kpi-val" style={{ color: '#94a3b8' }}>
                {fullStats ? fullStats.chess.draws + fullStats.checkers.draws : draws}
              </div>
              <div className="pf-kpi-lbl">{t('common.draws')}</div>
            </div>
            <div className="pf-kpi">
              <div className="pf-kpi-val" style={{ color: '#f59e0b' }}>
                {fullStats ? fullStats.tournaments.length : myTournaments.length}
              </div>
              <div className="pf-kpi-lbl">{t('profile.tournaments')}</div>
            </div>
            <div className="pf-kpi">
              <div className="pf-kpi-val">
                {fullStats ? (() => {
                  const h = Math.floor(fullStats.estimatedPlayMs / 3_600_000);
                  return h >= 1 ? `${h}h` : `${Math.floor(fullStats.estimatedPlayMs / 60_000)}m`;
                })() : '—'}
              </div>
              <div className="pf-kpi-lbl">{t('profile.timePlayed')}</div>
            </div>
            <div className="pf-kpi">
              <div className="pf-kpi-val">
                {fullStats ? formatLocalDate(fullStats.joinedAt, { month: 'short', year: 'numeric' }) : '—'}
              </div>
              <div className="pf-kpi-lbl">{t('profile.memberSince')}</div>
            </div>
            <div className="pf-kpi">
              <div className="pf-kpi-val">{uvStats?.favouriteTC ?? fullStats?.favouriteTC ?? '—'}</div>
              <div className="pf-kpi-lbl">{t('profile.favouriteTC')}</div>
            </div>
          </div>

          <div className="pf-overview-grid">
            {/* Left: main stats */}
            <div className="pf-main-col">
              {/* Rating card */}
              <div className="pf-section">
                <div className="pf-section-title">{t('common.rating')}</div>
                <div className="pf-rating-banner">
                  <div>
                    <div className="pf-big-rating" style={{ color: band.color }}>{rating}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                      {profileUniverseLabel(universe, t)} — {band.label}
                    </div>
                  </div>
                  <Sparkline data={sparkData} color={band.color} width={180} height={55} />
                </div>
                <div className="pf-rating-row">
                  <div className="pf-mini-badge"><span>{t('profile.peak')}</span><strong>{peak}</strong></div>
                  <div className="pf-mini-badge"><span>Low</span><strong>{low}</strong></div>
                  <div className="pf-mini-badge"><span>Perf.</span><strong>{perfRating}</strong></div>
                  <div className="pf-mini-badge"><span>{t('profile.bestStreak')}</span><strong>{bestStreak}</strong></div>
                </div>
              </div>

              {/* W/D/L — by universe */}
              <div className="pf-section">
                <div className="pf-section-title">{t('profile.history')} — {profileUniverseLabel(universe, t)}</div>
                {(() => {
                  const uv = fullStats?.[universe];
                  const w = uv?.wins ?? wins, d = uv?.draws ?? draws, l = uv?.losses ?? losses, g = uv?.games ?? totalGames;
                  const wr = g > 0 ? Math.round((w / g) * 100) : 0;
                  return (
                    <>
                      <div className="pf-wdl-bar-wrap">
                        <div className="pf-wdl-bar">
                          <div className="pf-wdl-w" style={{ flex: w || 0.01 }} />
                          <div className="pf-wdl-d" style={{ flex: d || 0.01 }} />
                          <div className="pf-wdl-l" style={{ flex: l || 0.01 }} />
                        </div>
                        <div className="pf-wdl-nums">
                          <span className="w">{w}W</span>
                          <span className="d">{d}D</span>
                          <span className="l">{l}L</span>
                          <span className="total">/ {g}</span>
                        </div>
                      </div>
                      <div className="pf-stat-row">
                        <StatCard label={t('common.wins')} value={w} color="#22c55e" />
                        <StatCard label={t('common.draws')} value={d} color="#94a3b8" />
                        <StatCard label={t('common.losses')} value={l} color="#ef4444" />
                        <StatCard label={t('common.winRate')} value={`${wr}%`} color={wr >= 50 ? '#22c55e' : '#ef4444'} />
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Activity heatmap */}
              <div className="pf-section">
                <div className="pf-section-title">Activity (Last 6 months)</div>
                <ActivityHeatmap history={activityEntries} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>
                  <span>Less</span>
                  {[0.1, 0.3, 0.5, 0.75, 1].map(a => (
                    <div key={a} style={{ width: 12, height: 12, borderRadius: 3, background: `rgba(56,189,248,${a})` }} />
                  ))}
                  <span>More</span>
                </div>
              </div>

              {/* Achievements */}
              <div className="pf-section">
                <div className="pf-section-title">Achievements</div>
                <div className="pf-achievements-grid">
                  {ACHIEVEMENTS.map(a => (
                    <AchievementBadge key={a.id} achievement={a} unlocked={a.check(fullStats)} />
                  ))}
                </div>
              </div>
            </div>

            {/* Right: sidebar */}
            <div className="pf-side-col">
              {/* Streak */}
              {currentStreak > 0 && (
                <div className="pf-section pf-streak-card">
                  <div>
                    <div className="pf-streak-num">{currentStreak}</div>
                    <div className="pf-streak-label">Win streak!</div>
                  </div>
                </div>
              )}

              {/* Wallet & earnings */}
              <div className="pf-section">
                <div className="pf-section-title">{t('profile.walletSummary')}</div>
                <div className="pf-wallet-bal">${Number(user.walletBalance).toFixed(2)}</div>
                <div className="pf-wallet-grid">
                  <div className="pf-wallet-stat"><span>{t('profile.deposited')}</span><strong>${Number(fullStats?.wallet.totalDeposited ?? 0).toFixed(2)}</strong></div>
                  <div className="pf-wallet-stat"><span>{t('profile.withdrawn')}</span><strong>${Number(fullStats?.wallet.totalWithdrawn ?? 0).toFixed(2)}</strong></div>
                  <div className="pf-wallet-stat"><span>{t('profile.betWon')}</span><strong style={{ color: '#22c55e' }}>${Number(fullStats?.wallet.totalBetWon ?? 0).toFixed(2)}</strong></div>
                  <div className="pf-wallet-stat"><span>{t('profile.betLost')}</span><strong style={{ color: '#ef4444' }}>${Number(fullStats?.wallet.totalBetLost ?? 0).toFixed(2)}</strong></div>
                  <div className="pf-wallet-stat"><span>{t('profile.netProfit')}</span>
                    <strong style={{ color: Number(fullStats?.wallet.netProfit ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                      {Number(fullStats?.wallet.netProfit ?? 0) >= 0 ? '+' : ''}${Number(fullStats?.wallet.netProfit ?? 0).toFixed(2)}
                    </strong>
                  </div>
                  <div className="pf-wallet-stat"><span>{t('profile.betsPlaced')}</span><strong>{fullStats?.wallet.gamesWithBets ?? 0}</strong></div>
                  <div className="pf-wallet-stat"><span>{t('profile.betsWon')}</span><strong style={{ color: '#22c55e' }}>{fullStats?.wallet.betsWon ?? 0}</strong></div>
                  <div className="pf-wallet-stat"><span>{t('profile.winRate')}</span>
                    <strong>{fullStats?.wallet.gamesWithBets
                       ? Math.round((fullStats.wallet.betsWon / fullStats.wallet.gamesWithBets) * 100) + '%'
                      : '—'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Recent games */}
              <div className="pf-section">
                <div className="pf-section-title">{t('profile.recentGames')}</div>
                {recentMatches.length === 0 && last10.length === 0 ? (
                  <div className="pf-empty-small">{t('profile.noGamesYet')}</div>
                ) : recentMatches.length > 0 ? recentMatches.map(g => {
                  const result = matchResultForUser(g, user.name);
                  const delta = matchRatingDeltaForUser(g, user.name);
                  const reviewable = canReviewMatch(g);
                  return (
                    <button
                      key={g.id}
                      className={`pf-recent-row ${reviewable ? 'pf-recent-reviewable' : ''}`}
                      disabled={!reviewable}
                      onClick={() => reviewable && navigate(`/game/${g.id}`)}
                      title={reviewable ? 'Review game' : 'No saved move record for this game'}
                    >
                      <span className={`pf-result-dot ${result ?? ''}`} />
                      <div className="pf-recent-info">
                        <div className="pf-recent-opp"><MatchOpponentIdentity match={g} username={user.name} showPrefix /></div>
                        <div className="pf-recent-tc">{profileUniverseLabel(g.universe, t)} · {g.timeControl}</div>
                      </div>
                      <div className={`pf-recent-delta ${delta == null || delta >= 0 ? 'pos' : 'neg'}`}>
                        {delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta}`}
                      </div>
                      {reviewable && <span className="pf-recent-review">Review</span>}
                    </button>
                  );
                }) : last10.slice(0, 5).map((e, i) => (
                  <div key={i} className="pf-recent-row">
                    <span className={`pf-result-dot ${e.result}`} />
                    <div className="pf-recent-info">
                      <div className="pf-recent-opp">vs {e.opponent} ({e.opponentRating})</div>
                      <div className="pf-recent-tc">{profileUniverseLabel(e.universe, t)} · {e.timeControl ?? ''}</div>
                    </div>
                    <div className={`pf-recent-delta ${e.delta >= 0 ? 'pos' : 'neg'}`}>
                      {e.delta >= 0 ? '+' : ''}{e.delta}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════ RATING TAB ═════════════════════════════ */}
      {tab === 'Rating' && (
        <div className="pf-tab-body">
          <div className="pf-section">
            <div className="pf-section-title">{t('common.rating')}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <span className="pf-big-rating" style={{ color: band.color }}>{rating}</span>
                <span style={{ color: 'var(--text-3)', fontSize: 13, marginLeft: 8 }}>{band.label}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                <span>{t('profile.peak')}: <strong>{peak}</strong></span>
                <span>Low: <strong>{low}</strong></span>
              </div>
            </div>
            <RatingChart entries={[...history].reverse().slice(-60)} color={band.color} currentRating={rating} />
          </div>

          {/* Per-band explanation */}
          <div className="pf-section">
            <div className="pf-section-title">Rating bands</div>
            <div className="pf-bands-grid">
              {[
                [1000, 'Beginner',          '#94a3b8'],
                [1200, 'Intermediate',      '#22c55e'],
                [1400, 'Advanced',          '#3b82f6'],
                [1600, 'Expert',            '#a855f7'],
                [1800, 'Candidate Master',  '#f59e0b'],
                [2000, 'Master',            '#f97316'],
                [2200, 'International Master','#ef4444'],
                [2400, 'Grandmaster',       '#fbbf24'],
              ].map(([threshold, label, color]) => {
                const isActive = rating >= Number(threshold) &&
                  (threshold === 2400 || rating < Number(threshold) + 200);
                return (
                  <div key={String(label)} className={`pf-band-row ${isActive ? 'active' : ''}`}>
                    <div className="pf-band-dot" style={{ background: color as string }} />
                    <div className="pf-band-info">
                      <div className="pf-band-name" style={isActive ? { color: color as string, fontWeight: 800 } : {}}>{label as string}</div>
                      <div className="pf-band-range">{threshold}+</div>
                    </div>
                    {isActive && <span className="pf-band-you">You</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Performance */}
          <div className="pf-section">
            <div className="pf-section-title">{t('profile.yourStats')}</div>
            <div className="pf-stat-row">
              <StatCard label="Perf." value={perfRating} />
              <StatCard label={t('common.games')} value={totalGames} />
              <StatCard label="K-factor" value={totalGames < 30 ? '40' : rating >= 2400 ? '10' : '32'} sub={totalGames < 30 ? 'Provisional' : 'Standard'} />
              <StatCard label={t('profile.bestStreak')} value={`${bestStreak}W`} color="#f59e0b" />
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════ HISTORY TAB ════════════════════════════ */}
      {tab === 'History' && (
        <div className="pf-tab-body">
          <div className="pf-section">
            {apiGames.length > 0 ? (
              /* API games have IDs and PGN, so show Replay links */
              (() => {
                const allFiltered = apiGames.filter(g => g.universe === universe);
                const filtered = allFiltered.filter(g => {
                  if (historyFilter === 'all') return true;
                  const mr = matchResultForUser(g, user.name);
                  return mr === historyFilter;
                });
                const totalPages = Math.ceil(filtered.length / HISTORY_PAGE_SIZE);
                const paged = filtered.slice(historyPage * HISTORY_PAGE_SIZE, (historyPage + 1) * HISTORY_PAGE_SIZE);
                return (
                  <>
                    <div className="pf-section-title">{t('profile.history')} — {filtered.length} {t('common.games')}</div>
                    <div className="pf-filter-bar">
                      {(['all', 'win', 'draw', 'loss'] as const).map(f => (
                        <button
                          key={f}
                          className={`pf-filter-btn ${historyFilter === f ? 'active' : ''}`}
                          onClick={() => { setHistoryFilter(f); setHistoryPage(0); }}
                        >
                          {f === 'all' ? `All (${allFiltered.length})` : f === 'win' ? 'Wins' : f === 'draw' ? 'Draws' : 'Losses'}
                        </button>
                      ))}
                    </div>
                    {filtered.length === 0 ? (
                      <div className="pf-empty">
                        <div style={{ fontWeight: 700, color: 'var(--text-2)', marginTop: 12 }}>{t('profile.noGamesYet')}</div>
                      </div>
                    ) : (
                      <>
                        <div className="pf-hist-head pf-game-history">
                          <span>#</span><span>Opponent</span>
                          <span className="c">Color</span>
                          <span className="c">Result</span>
                          <span className="c">TC</span>
                          <span className="c">Δ</span>
                          <span className="c">Date</span>
                          <span className="c">Review</span>
                        </div>
                        {paged.map((g, idx) => {
                          const isWhite  = g.white.username === user.name;
                          const myResult = matchResultForUser(g, user.name);
                          const delta    = matchRatingDeltaForUser(g, user.name);
                          const rc = myResult ?? '';
                          return (
                            <div key={g.id} className="pf-hist-row pf-game-history">
                              <span className="pf-hist-num">{filtered.length - (historyPage * HISTORY_PAGE_SIZE + idx)}</span>
                              <span className="pf-hist-opp"><MatchOpponentIdentity match={g} username={user.name} /></span>
                              <span className="c pf-dim" style={{ fontSize: 11 }}>{isWhite ? 'White' : 'Black'}</span>
                              <span className={`c pf-result ${rc}`} title={g.resultReason ?? undefined}>
                                {resultLabel(myResult)}
                              </span>
                              <span className="c pf-dim" style={{ fontSize: 11 }}>{g.timeControl}</span>
                              <span className={`c pf-delta ${delta == null || delta >= 0 ? 'pos' : 'neg'}`}>
                                {delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta}`}
                              </span>
                              <span className="c pf-dim" style={{ fontSize: 11 }}>{formatLocalDate(g.endedAt ?? g.createdAt)}</span>
                              <span className="c">
                                {canReviewMatch(g)
                                  ? <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => navigate(`/game/${g.id}`)}>Review</button>
                                  : <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>
                                }
                              </span>
                            </div>
                          );
                        })}
                        {totalPages > 1 && (
                          <div className="pf-pagination">
                            <button className="btn btn-ghost btn-sm" disabled={historyPage === 0} onClick={() => setHistoryPage(p => p - 1)}>Previous</button>
                            <span className="pf-page-info">Page {historyPage + 1} of {totalPages}</span>
                            <button className="btn btn-ghost btn-sm" disabled={historyPage >= totalPages - 1} onClick={() => setHistoryPage(p => p + 1)}>Next</button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()
            ) : (
              /* Fallback: local ratingHistory */
              <>
                <div className="pf-section-title">{t('profile.history')} — {history.length} {t('common.games')}</div>
                {history.length === 0 ? (
                  <div className="pf-empty">
                    <div style={{ fontWeight: 700, color: 'var(--text-2)', marginTop: 12 }}>{t('profile.noGamesYet')}</div>
                  </div>
                ) : (
                  <>
                    <div className="pf-hist-head">
                      <span>#</span><span>Opponent</span>
                      <span className="c">Opp. Rating</span>
                      <span className="c">Result</span>
                      <span className="c">Rating</span>
                      <span className="c">Δ</span>
                      <span className="c">Date</span>
                    </div>
                    {history.map((e, idx) => {
                      const date = formatLocalDate(e.playedAt);
                      const rc   = e.result === 'win' ? 'win' : e.result === 'draw' ? 'draw' : 'loss';
                      return (
                        <div key={idx} className="pf-hist-row">
                          <span className="pf-hist-num">{history.length - idx}</span>
                          <span className="pf-hist-opp">{e.opponent}</span>
                          <span className="c pf-dim">{e.opponentRating}</span>
                          <span className={`c pf-result ${rc}`}>
                            {resultLabel(e.result)}
                          </span>
                          <span className="c" style={{ fontWeight: 700 }}>{e.after}</span>
                          <span className={`c pf-delta ${e.delta >= 0 ? 'pos' : 'neg'}`}>{e.delta >= 0 ? '+' : ''}{e.delta}</span>
                          <span className="c pf-dim" style={{ fontSize: 11 }}>{date}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>

          {/* Wallet transaction history */}
          {fullStats && (
            <div className="pf-section" style={{ marginTop: 16 }}>
              <div className="pf-section-title">{t('profile.transactionHistory')} · Times shown in {getUserTimeZone()}</div>
              {fullStats.wallet.transactions.length === 0 ? (
                <div className="pf-empty-small">
                  No wallet activity yet. Deposits, withdrawals, bet escrow, payouts, refunds, and tournament entry fees will be listed here.
                </div>
              ) : (
                <>
                  <div className="pf-hist-head pf-wallet-history">
                    <span>Type</span>
                    <span className="c">Amount</span>
                    <span className="c">Status</span>
                    <span className="c">Date</span>
                  </div>
                  {fullStats.wallet.transactions.slice(0, 50).map(tx => {
                    const amount = Number(tx.amount);
                    const positive = amount >= 0;
                    return (
                      <div key={tx.id} className="pf-hist-row pf-wallet-history">
                        <span
                          className="pf-hist-opp"
                          title={tx.matchId ? `${tx.type.startsWith('TOURNAMENT') ? 'Tournament' : 'Match'} ${tx.matchId}` : tx.stripeSessionId ? `Stripe ${tx.stripeSessionId}` : undefined}
                        >
                          {transactionTypeLabel(tx.type)}
                        </span>
                        <span className="c" style={{ fontWeight: 700, color: positive ? '#22c55e' : '#ef4444' }}>
                          {positive ? '+' : '-'}${Math.abs(amount).toFixed(2)}
                        </span>
                        <span className="c pf-dim" style={{ fontSize: 11 }}>{tx.status}</span>
                        <span className="c pf-dim" style={{ fontSize: 11 }}>
                          {formatLocalDateTime(tx.createdAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }, true)}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════ TOURNAMENTS TAB ════════════════════════════ */}
      {tab === 'Tournaments' && (
        <div className="pf-tab-body">
          {/* Summary strip */}
          {fullStats && fullStats.tournaments.length > 0 && (
            <div className="pf-kpi-strip" style={{ marginBottom: 16 }}>
              <div className="pf-kpi">
                <div className="pf-kpi-val">{fullStats.tournaments.length}</div>
                <div className="pf-kpi-lbl">{t('profile.joinedTournaments')}</div>
              </div>
              <div className="pf-kpi">
                <div className="pf-kpi-val" style={{ color: '#22c55e' }}>
                  {fullStats.tournaments.reduce((s, tn) => s + tn.wins, 0)}
                </div>
                <div className="pf-kpi-lbl">{t('common.wins')}</div>
              </div>
              <div className="pf-kpi">
                <div className="pf-kpi-val">
                  {fullStats.tournaments.reduce((s, tn) => s + tn.wins + tn.draws + tn.losses, 0)}
                </div>
                <div className="pf-kpi-lbl">{t('tournament.played')}</div>
              </div>
              <div className="pf-kpi">
                <div className="pf-kpi-val" style={{ color: '#f59e0b' }}>
                  ${fullStats.tournaments.reduce((s, tn) => s + tn.prizePool, 0).toFixed(0)}
                </div>
                <div className="pf-kpi-lbl">{t('tournament.prizePool')}</div>
              </div>
            </div>
          )}
          <div className="pf-section">
            <div className="pf-section-title">{t('profile.tournamentHistory')} ({fullStats?.tournaments.length ?? myTournaments.length})</div>
            {(fullStats?.tournaments.length === 0 || (!fullStats && myTournaments.length === 0)) ? (
              <div className="pf-empty">
                <div style={{ fontWeight: 700, color: 'var(--text-2)', marginTop: 12 }}>{t('profile.noTournamentsYet')}</div>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate(`/${universe}/tournaments`)}>
                  {t('tournament.join')}
                </button>
              </div>
            ) : (fullStats?.tournaments ?? myTournaments.map(tn => {
              const me = tn.players.find(p => p.name === user.name);
              return { id: tn.id, name: tn.name, icon: tn.icon, universe: tn.universe, format: tn.format,
                timeControl: tn.timeControl, status: tn.status, betEntry: tn.betEntry, prizePool: tn.prizePool,
                startsAt: String(tn.startsAt), score: me?.score ?? 0, wins: me?.wins ?? 0, draws: me?.draws ?? 0, losses: me?.losses ?? 0 };
            })).map(tn => (
              <div key={tn.id} className="pf-tourn-row" onClick={() => navigate(`/${tn.universe}/tournament/${tn.id}`)}>
                <div className="pf-tourn-info">
                  <div className="pf-tourn-name">{displayTournamentName(tn)}</div>
                  <div className="pf-tourn-meta">
                    {tn.timeControl} · {tn.format}
                    {tn.betEntry > 0 && <span style={{ color: '#f59e0b', marginLeft: 6 }}>${tn.betEntry} entry</span>}
                    {tn.prizePool > 0 && <span style={{ color: '#22c55e', marginLeft: 6 }}>${tn.prizePool} pool</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                    {formatLocalDateTime(tn.startsAt, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }, true)}
                  </div>
                </div>
                <div className="pf-tourn-stats">
                  <div className="pf-tourn-stat"><span>{t('tournament.score')}</span><strong>{tn.score}</strong></div>
                  <div className="pf-tourn-stat"><span>W/D/L</span><strong style={{ fontSize: 11 }}>{tn.wins}/{tn.draws}/{tn.losses}</strong></div>
                </div>
                <span className={`pf-tourn-status ${tn.status}`}>
                  {tn.status === 'running' ? t('tournament.running') : tn.status === 'upcoming' ? t('tournament.upcoming') : t('tournament.finished')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═════════════════════════════ SETTINGS TAB ══════════════════════════════ */}
      {tab === 'Settings' && (
        <div className="pf-tab-body">
          <div className="pf-section">
            <div className="pf-section-title">{t('profile.editProfile')}</div>
            <div className="pf-settings-grid">
              <div className="pf-setting-row">
                <span className="pf-setting-label">Avatar</span>
                <div className="pf-setting-val">
                  <AvatarUpload />
                </div>
              </div>
              <div className="pf-setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <span className="pf-setting-label">Bio / Tagline</span>
                <textarea
                  className="pf-setting-input"
                  rows={2}
                  maxLength={160}
                  placeholder="Tell the world about your playstyle..."
                  value={bioInput}
                  onChange={e => setBioInput(e.target.value)}
                  style={{ resize: 'vertical', minHeight: 48 }}
                />
                <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>{bioInput.length}/160</div>
              </div>
              <div className="pf-setting-row">
                <span className="pf-setting-label">{t('profile.username')}</span>
                <div className="pf-setting-val">
                  <input
                    className="pf-setting-input"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      try {
                        await saveUsername(newUsername, countryCode);
                        updateProfile({
                          bio: bioInput || undefined,
                          socialLinks: (socialTwitter || socialLichess || socialChessCom) ? {
                            twitter: socialTwitter || undefined,
                            lichess: socialLichess || undefined,
                            chessCom: socialChessCom || undefined,
                          } : undefined,
                        });
                        setSettingsMsg(t('profile.profileSaved'));
                      } catch (e: any) {
                        setSettingsMsg(e?.message || t('auth.somethingWentWrong'));
                      }
                      setTimeout(() => setSettingsMsg(''), 3000);
                    }}
                  >{t('profile.saveChanges')}</button>
                </div>
              </div>
              <div className="pf-setting-row">
                <span className="pf-setting-label">
                  {t('profile.country')} {countryCode && <PlayerFlag country={countryCode} className="pf-setting-flag" />}
                </span>
                <div className="pf-setting-val">
                  <input
                    className="pf-setting-input"
                    placeholder={t('profile.countryPlaceholder')}
                    maxLength={2}
                    value={countryCode}
                    onChange={e => setCountryCode(e.target.value.toUpperCase().slice(0, 2))}
                    style={{ width: 80, textTransform: 'uppercase' }}
                  />
                </div>
              </div>
              <div className="pf-setting-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <span className="pf-setting-label">Social Links</span>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '6px 10px', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Twitter</span>
                  <input className="pf-setting-input" placeholder="username" value={socialTwitter} onChange={e => setSocialTwitter(e.target.value)} />
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Lichess</span>
                  <input className="pf-setting-input" placeholder="username" value={socialLichess} onChange={e => setSocialLichess(e.target.value)} />
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Chess.com</span>
                  <input className="pf-setting-input" placeholder="username" value={socialChessCom} onChange={e => setSocialChessCom(e.target.value)} />
                </div>
              </div>
              {settingsMsg && (
                <div style={{ fontSize: 12, color: settingsMsg === t('profile.profileSaved') ? '#22c55e' : 'var(--danger)', padding: '4px 0' }}>
                  {settingsMsg}
                </div>
              )}
              <div className="pf-setting-row" style={{ marginTop: 8 }}>
                <span className="pf-setting-label">{t('profile.newPassword')}</span>
                <div className="pf-setting-val" style={{ flexDirection: 'column', gap: 6 }}>
                  <input className="pf-setting-input" type="password" placeholder={t('auth.passwordPlaceholder')} value={newPw} onChange={e => setNewPw(e.target.value)} />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      if (!newPw || newPw.length < 6) { setPwMsg(t('auth.passwordTooShort')); setTimeout(() => setPwMsg(''), 3000); return; }
                      try {
                        if (!supabase) throw new Error(t('auth.supabaseError'));
                        const { error } = await supabase.auth.updateUser({ password: newPw });
                        if (error) throw error;
                        setPwMsg(t('profile.passwordChanged'));
                        setNewPw('');
                      } catch (e: any) {
                        setPwMsg(e?.message || t('auth.somethingWentWrong'));
                      }
                      setTimeout(() => setPwMsg(''), 4000);
                    }}
                  >{t('profile.changePassword')}</button>
                  {pwMsg && <div style={{ fontSize: 12, color: pwMsg === t('profile.passwordChanged') ? '#22c55e' : 'var(--danger)' }}>{pwMsg}</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="pf-section">
            <div className="pf-section-title">Preferences</div>
            <div className="pf-settings-grid">
              {[
                { label: 'Show rating change after game',    key: 'show_elo',     default: true },
                { label: 'Sound effects',                    key: 'sounds',       default: true },
                { label: 'Auto-promote to queen',            key: 'autopromote',  default: false },
                { label: 'Confirm resign / draw offers',     key: 'confirm_resign', default: true },
                { label: 'Show legal move hints',            key: 'hints',        default: true },
              ].map(pref => (
                <div key={pref.key} className="pf-setting-row">
                  <span className="pf-setting-label">{pref.label}</span>
                  <PrefToggle defaultOn={pref.default} />
                </div>
              ))}
            </div>
          </div>

          <div className="pf-section">
            <div className="pf-section-title">Danger zone</div>
            <div className="pf-danger-row">
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>Reset rating history</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Clears all recorded ELO changes. Irreversible.</div>
              </div>
              <button className="btn pf-danger-btn">Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Small toggle ──────────────────────────────────────────────────────────────
const PrefToggle: React.FC<{ defaultOn: boolean }> = ({ defaultOn }) => {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      onClick={() => setOn(v => !v)}
      style={{
        position: 'relative', width: 40, height: 22, borderRadius: 11,
        border: 'none', background: on ? 'var(--accent)' : 'var(--bg-3)',
        cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
};
