import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiAdminDashboard } from '../../lib/api';
import { useNotificationStore, useUniverseStore } from '../../stores';
import { formatLocalDateTime, getUserTimeZone } from '../../lib/timezone';

const formatDuration = (ms: number | null | undefined) => {
  if (!ms || ms < 0) return '-';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) return '-';
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
};

const formatTime = (value?: string | null) =>
  value ? formatLocalDateTime(value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }, true) : '-';

export const AdminSafetyPage: React.FC = () => {
  const navigate = useNavigate();
  const universe = useUniverseStore(s => s.universe);
  const addNotification = useNotificationStore(s => s.addNotification);
  const [dashboard, setDashboard] = useState<ApiAdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.admin.dashboard();
      setDashboard(result);
    } catch (err: any) {
      setError(err?.message || 'Could not load admin dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const paymentIssueCount = useMemo(() => (
    (dashboard?.failedPayments.transactions.length || 0) +
    (dashboard?.failedPayments.walletFailures.length || 0)
  ), [dashboard]);

  const handleRefresh = async () => {
    await loadDashboard();
    addNotification('Admin dashboard refreshed.', 'info');
  };

  if (loading && !dashboard) {
    return (
      <div className="admin-safety-page">
        <div className="admin-safety-empty"><div className="spinner" /><span>Loading admin dashboard...</span></div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="admin-safety-page">
        <div className="admin-safety-header">
          <div>
            <div className="admin-safety-kicker">Owner Tools</div>
            <h1>Admin Dashboard</h1>
            <p>This private page is reserved for the owner account yves.ahipo@gmail.com.</p>
          </div>
          <button className="btn btn-secondary" onClick={() => navigate(`/${universe}`)}>Back to lobby</button>
        </div>
        <div className="admin-safety-error">
          <strong>Could not load admin dashboard.</strong>
          <span>{error || 'Unknown error'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-safety-page">
      <div className="admin-safety-header">
        <div>
          <div className="admin-safety-kicker">Owner Tools</div>
          <h1>Admin Dashboard</h1>
          <p>Live operational view for users, games, tournaments, payments, disputes, flagged accounts, health, and server errors. Times shown in {getUserTimeZone()}.</p>
        </div>
        <div className="admin-safety-actions">
          <button className="btn btn-secondary" onClick={() => navigate(`/${universe}`)}>
            Back to lobby
          </button>
          <button className="btn btn-primary" onClick={handleRefresh}>
            Refresh
          </button>
        </div>
      </div>

      <div className="admin-safety-kpis">
        <div><strong>{dashboard.health.activeUsers}</strong><span>Active users</span></div>
        <div><strong>{dashboard.health.activeGames}</strong><span>Active games</span></div>
        <div><strong>{dashboard.tournaments.summary.running}</strong><span>Running tournaments</span></div>
        <div><strong>{paymentIssueCount}</strong><span>Payment issues</span></div>
        <div><strong>{dashboard.disputedGames.length}</strong><span>Disputed games</span></div>
        <div><strong>{dashboard.flaggedUsers.length}</strong><span>Flagged users</span></div>
        <div><strong>{dashboard.health.recentErrorCount}</strong><span>Recent errors</span></div>
        <div><strong>{formatDuration(dashboard.health.uptime * 1000)}</strong><span>Server uptime</span></div>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Server Health</h2>
          <span>{formatTime(dashboard.health.checkedAt)}</span>
        </div>
        <div className="admin-health-grid">
          <div><span>Status</span><strong>{dashboard.health.ok ? 'Healthy' : 'Check server'}</strong></div>
          <div><span>Database</span><strong>{dashboard.health.db}</strong></div>
          <div><span>Environment</span><strong>{dashboard.health.nodeEnv}</strong></div>
          <div><span>Open seeks</span><strong>{dashboard.health.openSeeks}</strong></div>
          <div><span>Memory RSS</span><strong>{formatBytes(dashboard.health.memory.rss)}</strong></div>
          <div><span>Heap used</span><strong>{formatBytes(dashboard.health.memory.heapUsed)}</strong></div>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Active Users</h2>
          <span>{dashboard.activeUsers.length}</span>
        </div>
        {dashboard.activeUsers.length === 0 ? (
          <div className="admin-safety-empty">No active users right now.</div>
        ) : (
          <div className="admin-mini-table users">
            <div className="head"><span>User</span><span>Status</span><span>Mode</span><span>Rating</span><span>Connected</span></div>
            {dashboard.activeUsers.map(user => (
              <div key={user.socketId}>
                <span>{user.name}</span>
                <span className={`admin-pill ${user.status}`}>{user.status}</span>
                <span>{user.universe}</span>
                <span>{user.rating[user.universe as 'chess' | 'checkers'] ?? '-'}</span>
                <span>{formatDuration(user.connectedForMs)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Active Games</h2>
          <span>{dashboard.activeGames.length}</span>
        </div>
        {dashboard.activeGames.length === 0 ? (
          <div className="admin-safety-empty">No active games right now.</div>
        ) : (
          <div className="admin-mini-table games">
            <div className="head"><span>Players</span><span>Mode</span><span>TC</span><span>Money</span><span>Moves</span><span>Age</span></div>
            {dashboard.activeGames.map(game => (
              <div key={game.roomId}>
                <span>{game.white?.name || 'White'} vs {game.black?.name || 'Black'}</span>
                <span>{game.tournamentName || game.universe}</span>
                <span>{game.timeControl}</span>
                <span>{game.betAmount > 0 ? `$${game.betAmount}` : '-'}</span>
                <span>{game.moveCount}</span>
                <span>{formatDuration(game.durationMs)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Tournaments</h2>
          <span>{dashboard.tournaments.summary.upcoming} upcoming · {dashboard.tournaments.summary.running} running</span>
        </div>
        <div className="admin-mini-table tournaments">
          <div className="head"><span>Name</span><span>Status</span><span>Starts</span><span>Players</span><span>Games</span><span>Prize</span></div>
          {dashboard.tournaments.recent.slice(0, 12).map(tournament => (
            <div key={tournament.id}>
              <span>{tournament.name}</span>
              <span className={`admin-pill ${tournament.lifecycle}`}>{tournament.lifecycle}</span>
              <span>{formatTime(tournament.startsAt)}</span>
              <span>{tournament.playerCount}</span>
              <span>{tournament.matchCount}</span>
              <span>${tournament.prizePool.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Failed Payments</h2>
          <span>{paymentIssueCount}</span>
        </div>
        {paymentIssueCount === 0 ? (
          <div className="admin-safety-empty">No failed payments or wallet settlement failures found.</div>
        ) : (
          <div className="admin-mini-table payments">
            <div className="head"><span>Who / Game</span><span>Type</span><span>Amount</span><span>Status</span><span>When</span></div>
            {dashboard.failedPayments.transactions.map(tx => (
              <div key={tx.id}>
                <span>{tx.username}</span>
                <span>{tx.type}</span>
                <span>${tx.amount.toFixed(2)}</span>
                <span className="admin-pill failed">{tx.status}</span>
                <span>{formatTime(tx.createdAt)}</span>
              </div>
            ))}
            {dashboard.failedPayments.walletFailures.map(game => (
              <div key={game.id}>
                <span>{game.white} vs {game.black}</span>
                <span>Wallet settlement</span>
                <span>${game.betAmount.toFixed(2)}</span>
                <span className="admin-pill failed">{game.walletStatus}</span>
                <span>{formatTime(game.endedAt || game.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Disputed Games</h2>
          <span>{dashboard.disputedGames.length}</span>
        </div>
        {dashboard.disputedGames.length === 0 ? (
          <div className="admin-safety-empty">No disputed game or suspicious review reports.</div>
        ) : (
          <div className="admin-mini-table disputes">
            <div className="head"><span>Reporter</span><span>Target</span><span>Reason</span><span>Match / Payment</span><span>When</span></div>
            {dashboard.disputedGames.map(report => (
              <div key={report.id}>
                <span>{report.reporterUsername || 'Unknown'}</span>
                <span>{report.targetUsername || report.targetResolvedUsername || 'System'}</span>
                <span>{report.reason.replace(/_/g, ' ')}</span>
                <span>{report.matchId || report.paymentId || '-'}</span>
                <span>{formatTime(report.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Flagged Users</h2>
          <span>{dashboard.flaggedUsers.length}</span>
        </div>
        {dashboard.flaggedUsers.length === 0 ? (
          <div className="admin-safety-empty">No flagged users yet.</div>
        ) : (
          <div className="admin-mini-table flagged">
            <div className="head"><span>User</span><span>Open</span><span>Total</span><span>Reasons</span><span>Last flagged</span></div>
            {dashboard.flaggedUsers.map(user => (
              <div key={user.username}>
                <span>{user.username}</span>
                <span>{user.openCount}</span>
                <span>{user.reportCount}</span>
                <span>{user.reasons.map(reason => reason.replace(/_/g, ' ')).join(', ')}</span>
                <span>{formatTime(user.lastFlaggedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>Recent Errors</h2>
          <span>{dashboard.recentErrors.length}</span>
        </div>
        {dashboard.recentErrors.length === 0 ? (
          <div className="admin-safety-empty">No recent server errors recorded in this process.</div>
        ) : (
          <div className="admin-error-list">
            {dashboard.recentErrors.slice(0, 10).map((err, index) => (
              <div key={`${err.at}-${index}`}>
                <strong>{formatTime(err.at)}</strong>
                <span>{err.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
