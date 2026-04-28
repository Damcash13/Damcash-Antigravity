import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { socket } from '../../lib/socket';
import { useUniverseStore } from '../../stores';

interface Props {
  timeControl: string;
  betAmount?: number;
  onCancel: () => void;
  onMatchFound?: (roomId: string, myColor: 'w' | 'b') => void;
}

export const SearchingOverlay: React.FC<Props> = ({ timeControl, betAmount = 0, onCancel }) => {
  const { t } = useTranslation();
  const { universe } = useUniverseStore();
  const [dots, setDots] = useState('');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    socket.emit('seek', { timeControl, universe, betAmount });

    const dotsInterval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);

    const elapsedInterval = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);

    return () => {
      clearInterval(dotsInterval);
      clearInterval(elapsedInterval);
    };
  }, [timeControl, universe, betAmount]);

  return (
    <div className="searching-overlay">
      <div className="spinner" />
      <div style={{ fontSize: 20, fontWeight: 700 }}>
        {t('game.searchingForOpponent')}{dots}
      </div>
      <div style={{ color: 'var(--text-2)', fontSize: 14 }}>
        {t('tournament.timeControl')}: <strong style={{ color: 'var(--accent)' }}>{timeControl}</strong>
        {betAmount > 0 && (
          <span style={{ marginLeft: 12, color: '#22c55e', fontWeight: 700 }}>
            💰 ${betAmount}
          </span>
        )}
      </div>
      <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
        {t('game.elapsed', { n: elapsed })}
      </div>
      <button className="btn btn-secondary" onClick={onCancel}>
        {t('common.cancel')}
      </button>
    </div>
  );
};
