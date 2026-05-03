import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiH2H } from '../../lib/api';

interface Props {
  playerA: string;   // username of "me"
  playerB: string;   // username of opponent
  universe: 'chess' | 'checkers';
}

export const HeadToHeadPanel: React.FC<Props> = ({ playerA, playerB, universe }) => {
  const { t } = useTranslation();
  const [h2h, setH2H] = useState<ApiH2H | null>(null);

  useEffect(() => {
    if (!playerA || !playerB || playerA === playerB) return;
    api.users.headToHead(playerA, playerB, universe)
      .then(setH2H)
      .catch(() => setH2H(null));
  }, [playerA, playerB, universe]);

  if (!h2h) return null;

  const total = (s: { a: number; b: number; draws: number }) => s.a + s.b + s.draws;

  const ScoreRow: React.FC<{
    label: string;
    score: { a: number; b: number; draws: number };
  }> = ({ label, score }) => {
    const tot = total(score);
    const aW  = tot > 0 ? (score.a / tot) * 100 : 33.3;
    const dW  = tot > 0 ? (score.draws / tot) * 100 : 33.3;
    const bW  = tot > 0 ? (score.b / tot) * 100 : 33.3;

    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 10, color: 'var(--text-3)', marginBottom: 3,
        }}>
          <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 16, textAlign: 'center' }}>
            {score.a}
          </span>
          <span style={{ letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
          <span style={{ fontWeight: 700, color: 'var(--text-2)', minWidth: 16, textAlign: 'center' }}>
            {score.b}
          </span>
        </div>
        {/* Progress bar: me | draws | opponent */}
        <div style={{
          display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden',
          background: 'var(--bg-3)',
        }}>
          {aW > 0 && (
            <div style={{ width: `${aW}%`, background: 'var(--accent)', transition: 'width 0.4s' }} />
          )}
          {dW > 0 && (
            <div style={{ width: `${dW}%`, background: 'var(--text-3)', transition: 'width 0.4s' }} />
          )}
          {bW > 0 && (
            <div style={{ width: `${bW}%`, background: 'var(--text-2)', transition: 'width 0.4s' }} />
          )}
        </div>
        {score.draws > 0 && (
          <div style={{ fontSize: 9, color: 'var(--text-3)', textAlign: 'center', marginTop: 1 }}>
            {score.draws} {t('game.draw').toLowerCase()}
          </div>
        )}
      </div>
    );
  };

  // Show the panel only if there is at least one game in the history (all-time)
  const hasHistory = h2h.all ? total(h2h.all) > 0 : total(h2h.year) > 0;
  if (!hasHistory) return null;

  return (
    <div style={{
      padding: '8px 12px',
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-2)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 6,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          ⚔️ {t('game.h2hTitle')}
        </span>
        <div style={{ display: 'flex', gap: 10, fontSize: 10 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{playerA}</span>
          <span style={{ color: 'var(--text-3)' }}>vs</span>
          <span style={{ color: 'var(--text-2)', fontWeight: 700 }}>{playerB}</span>
        </div>
      </div>

      {h2h.all && total(h2h.all) > 0 && (
        <ScoreRow label={t('game.h2hAllTime') || 'All time'} score={h2h.all} />
      )}
      {total(h2h.today) > 0 && (
        <ScoreRow label={t('game.h2hToday')} score={h2h.today} />
      )}
      {total(h2h.year) > 0 && total(h2h.year) !== (h2h.all ? total(h2h.all) : 0) && (
        <ScoreRow label={t('game.h2hYear')} score={h2h.year} />
      )}
    </div>
  );
};
