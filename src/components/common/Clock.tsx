import React, { useEffect, useRef, useCallback } from 'react';

interface Props {
  timeMs: number;
  active: boolean;
  onExpire?: () => void;
  onTick?: (ms: number) => void;
}

function formatTime(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export const Clock: React.FC<Props> = ({ timeMs, active, onExpire, onTick }) => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeRef = useRef(timeMs);
  const lastTickRef = useRef<number>(0);

  const tick = useCallback(() => {
    const now = Date.now();
    const elapsed = lastTickRef.current ? now - lastTickRef.current : 100;
    lastTickRef.current = now;
    timeRef.current = Math.max(0, timeRef.current - elapsed);
    onTick?.(timeRef.current);
    if (timeRef.current <= 0) {
      onExpire?.();
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [onExpire, onTick]);

  useEffect(() => {
    timeRef.current = timeMs;
  }, [timeMs]);

  useEffect(() => {
    if (active) {
      lastTickRef.current = Date.now();
      intervalRef.current = setInterval(tick, 100);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, tick]);

  const isLow = timeMs < 30000;
  const className = `player-clock ${active ? 'active' : ''} ${isLow && active ? 'low' : ''}`;
  const ariaLabel = `${active ? 'Active clock' : 'Clock'}: ${formatTime(timeMs)}${isLow && active ? ' — low time!' : ''}`;

  return (
    <span className={className} role="timer" aria-label={ariaLabel} aria-live={active ? 'polite' : 'off'}>
      {isLow && active && <span aria-hidden="true" style={{ marginRight: 3 }}>⚠</span>}
      {formatTime(timeMs)}
    </span>
  );
};
