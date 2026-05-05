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
      <div style={{
        display: 'grid',
        gap: 7,
        padding: '9px 0',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {label}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {tot} {tot === 1 ? t('game.game', 'game') : t('game.games', 'games')}
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
            <span style={{ color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerA}</span>
            <strong style={{ color: 'var(--accent)' }}>{score.a}</strong>
          </div>
          <div style={{ color: 'var(--text-3)' }}>
            Draws <strong style={{ color: 'var(--text-2)' }}>{score.draws}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
            <strong style={{ color: 'var(--text-2)' }}>{score.b}</strong>
            <span style={{ color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{playerB}</span>
          </div>
        </div>

        <div style={{
          display: 'flex', height: 6, borderRadius: 6, overflow: 'hidden',
          background: 'var(--bg-3)',
        }}>
          {aW > 0 && (
            <div style={{ width: `${aW}%`, background: 'var(--accent)', transition: 'width 160ms ease-out' }} />
          )}
          {dW > 0 && (
            <div style={{ width: `${dW}%`, background: 'var(--text-3)', transition: 'width 160ms ease-out' }} />
          )}
          {bW > 0 && (
            <div style={{ width: `${bW}%`, background: 'var(--text-2)', transition: 'width 160ms ease-out' }} />
          )}
        </div>
      </div>
    );
  };

  // Show the panel only if there is at least one game in the history (all-time)
  const hasHistory = h2h.all ? total(h2h.all) > 0 : total(h2h.year) > 0;
  if (!hasHistory) return null;

  return (
    <div style={{
      marginTop: 10,
      padding: '12px 14px 5px',
      border: '1px solid var(--border)',
      borderRadius: 8,
      background: 'var(--bg-card)',
      boxShadow: '0 10px 24px rgba(0,0,0,0.14)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 12,
        marginBottom: 2,
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {t('game.h2hTitle')}
        </span>
        <div style={{
          display: 'flex',
          gap: 8,
          minWidth: 0,
          fontSize: 12,
          alignItems: 'center',
        }}>
          <span style={{ color: 'var(--accent)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerA}</span>
          <span style={{ color: 'var(--text-3)' }}>vs</span>
          <span style={{ color: 'var(--text-2)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerB}</span>
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
