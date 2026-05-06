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
  const [status, setStatus] = useState<'loading' | 'ready' | 'waiting' | 'unavailable'>('loading');

  useEffect(() => {
    if (!playerA || !playerB || playerB === 'Opponent' || playerA === playerB) {
      setH2H(null);
      setStatus('waiting');
      return;
    }

    let active = true;
    setStatus('loading');
    api.users.headToHead(playerA, playerB, universe)
      .then((record) => {
        if (!active) return;
        setH2H(record);
        setStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setH2H(null);
        setStatus('unavailable');
      });

    return () => { active = false; };
  }, [playerA, playerB, universe]);

  const total = (s: { a: number; b: number; draws: number }) => s.a + s.b + s.draws;

  const ScoreRow: React.FC<{
    label: string;
    score: { a: number; b: number; draws: number };
  }> = ({ label, score }) => {
    const tot = total(score);
    const aW  = tot > 0 ? (score.a / tot) * 100 : 0;
    const dW  = tot > 0 ? (score.draws / tot) * 100 : 0;
    const bW  = tot > 0 ? (score.b / tot) * 100 : 0;

    return (
      <div className="game-h2h-row">
        <div className="game-h2h-row-head">
          <span>{label}</span>
          <span>
            {tot} {tot === 1 ? t('game.game', 'game') : t('game.games', 'games')}
          </span>
        </div>

        <div className="game-h2h-scoreline">
          <div>
            <span>{playerA}</span>
            <strong>{score.a}</strong>
          </div>
          <div>
            {t('game.draws', 'Draws')} <strong>{score.draws}</strong>
          </div>
          <div>
            <strong>{score.b}</strong>
            <span>{playerB}</span>
          </div>
        </div>

        <div className="game-h2h-meter">
          {aW > 0 && <div className="game-h2h-meter-a" style={{ width: `${aW}%` }} />}
          {dW > 0 && <div className="game-h2h-meter-d" style={{ width: `${dW}%` }} />}
          {bW > 0 && <div className="game-h2h-meter-b" style={{ width: `${bW}%` }} />}
        </div>
      </div>
    );
  };

  const rows = h2h ? [
    h2h.all && total(h2h.all) > 0 ? { label: t('game.h2hAllTime', 'All time'), score: h2h.all } : null,
    total(h2h.today) > 0 ? { label: t('game.h2hToday'), score: h2h.today } : null,
    total(h2h.year) > 0 && total(h2h.year) !== (h2h.all ? total(h2h.all) : 0)
      ? { label: t('game.h2hYear'), score: h2h.year }
      : null,
  ].filter(Boolean) as Array<{ label: string; score: { a: number; b: number; draws: number } }> : [];

  const opponentName = playerB && playerB !== 'Opponent' ? playerB : t('game.opponent', 'Opponent');
  const emptyMessage = status === 'loading'
    ? t('game.h2hLoading', 'Loading record...')
    : status === 'waiting'
      ? t('game.h2hWaiting', 'Waiting for opponent details.')
      : status === 'unavailable'
        ? t('game.h2hUnavailable', 'Head-to-head record is unavailable right now.')
        : t('game.h2hNoGames', 'No previous games yet.');

  return (
    <div className="game-h2h-panel">
      <div className="game-h2h-header">
        <span>{t('game.h2hTitle')}</span>
        <div>
          <strong>{playerA}</strong>
          <span>vs</span>
          <strong>{opponentName}</strong>
        </div>
      </div>

      {rows.length > 0 ? (
        rows.map(row => <ScoreRow key={row.label} label={row.label} score={row.score} />)
      ) : (
        <div className="game-h2h-empty">{emptyMessage}</div>
      )}
    </div>
  );
};
