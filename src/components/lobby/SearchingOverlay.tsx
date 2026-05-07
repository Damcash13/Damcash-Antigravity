import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { socket } from '../../lib/socket';

interface Props {
  timeControl: string;
  betAmount?: number;
  onCancel: () => void;
  onOpenTable?: () => void;
  onMatchFound?: (roomId: string, myColor: 'w' | 'b') => void;
}

export const SearchingOverlay: React.FC<Props> = ({ timeControl, betAmount = 0, onCancel, onOpenTable }) => {
  const { t } = useTranslation();
  const [dots, setDots] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [expired, setExpired] = useState(false);
  const [published, setPublished] = useState(false);
  const onCancelRef = useRef(onCancel);
  const onOpenTableRef = useRef(onOpenTable);
  onCancelRef.current = onCancel;
  onOpenTableRef.current = onOpenTable;

  useEffect(() => {
    const handleExpired = () => {
      setExpired(true);
      setTimeout(() => onCancelRef.current(), 2500);
    };
    const handlePublished = () => {
      setPublished(true);
      setTimeout(() => onOpenTableRef.current?.(), 1000);
    };
    socket.on('seek:expired', handleExpired);
    socket.on('seek:published', handlePublished);

    const dotsInterval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);

    const elapsedInterval = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);

    return () => {
      socket.off('seek:expired', handleExpired);
      socket.off('seek:published', handlePublished);
      clearInterval(dotsInterval);
      clearInterval(elapsedInterval);
    };
  }, []);

  if (expired) {
    return (
      <div className="searching-overlay">
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--warning, #f59e0b)' }}>
          {t('game.seekExpired', 'No opponent found')}
        </div>
        <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
          {t('game.seekExpiredDesc', 'Your seek expired after {{n}} seconds', { n: elapsed })}
        </div>
        <button className="btn btn-secondary" onClick={onCancel}>
          {t('common.dismiss', 'Dismiss')}
        </button>
      </div>
    );
  }

  if (published) {
    return (
      <div className="searching-overlay">
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
          {t('game.openTableCreated', 'Open table created')}
        </div>
        <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
          {t('game.openTableCreatedDesc', 'Players can now join you from the lobby.')}
        </div>
      </div>
    );
  }

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
            Stake ${betAmount}
          </span>
        )}
      </div>
      <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
        {t('game.elapsed', { n: elapsed })}
      </div>
      <div style={{ color: 'var(--text-3)', fontSize: 12 }}>
        {t('game.autoPostAfter', 'If nobody joins in 30 seconds, this becomes an open lobby table.')}
      </div>
      <button className="btn btn-secondary" onClick={onCancel}>
        {t('common.cancel')}
      </button>
    </div>
  );
};
