import React, { useEffect, useMemo, useState } from 'react';
import { api, ApiModerationReport } from '../../lib/api';
import { useNotificationStore, useUniverseStore } from '../../stores';
import { useNavigate } from 'react-router-dom';

export const AdminSafetyPage: React.FC = () => {
  const navigate = useNavigate();
  const universe = useUniverseStore(s => s.universe);
  const addNotification = useNotificationStore(s => s.addNotification);
  const [reports, setReports] = useState<ApiModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReports = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.safety.adminModeration(75);
      setReports(result.reports);
    } catch (err: any) {
      setError(err?.message || 'Could not load moderation dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const summary = useMemo(() => ({
    open: reports.filter(r => r.status === 'open').length,
    playerReports: reports.filter(r => r.reason.includes('report')).length,
    reviews: reports.filter(r => r.context === 'suspicious_review' || r.reason.includes('suspicious')).length,
  }), [reports]);

  const handleRefresh = async () => {
    await loadReports();
    addNotification('Moderation dashboard refreshed.', 'info');
  };

  return (
    <div className="admin-safety-page">
      <div className="admin-safety-header">
        <div>
          <div className="admin-safety-kicker">Safety</div>
          <h1>Moderation Dashboard</h1>
          <p>Reports, blocks, suspicious game reviews, and wallet review requests land here for admin follow-up.</p>
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
        <div><strong>{summary.open}</strong><span>Open</span></div>
        <div><strong>{summary.playerReports}</strong><span>User reports</span></div>
        <div><strong>{summary.reviews}</strong><span>Review requests</span></div>
        <div><strong>{reports.length}</strong><span>Total loaded</span></div>
      </div>

      {loading ? (
        <div className="admin-safety-empty"><div className="spinner" /><span>Loading moderation queue...</span></div>
      ) : error ? (
        <div className="admin-safety-error">
          <strong>Could not load moderation queue.</strong>
          <span>{error}</span>
        </div>
      ) : reports.length === 0 ? (
        <div className="admin-safety-empty">No moderation reports yet.</div>
      ) : (
        <div className="admin-safety-table">
          <div className="admin-safety-row head">
            <span>When</span>
            <span>Reporter</span>
            <span>Target</span>
            <span>Type</span>
            <span>Context</span>
            <span>Notes</span>
          </div>
          {reports.map(report => (
            <div className="admin-safety-row" key={report.id}>
              <span>{new Date(report.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span>{report.reporterUsername || 'Unknown'}</span>
              <span>{report.targetResolvedUsername || report.targetUsername || 'System'}</span>
              <span className="admin-safety-type">{report.reason.replace(/_/g, ' ')}</span>
              <span>{report.context || '-'}</span>
              <span>{report.notes || report.matchId || report.paymentId || '-'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

