/**
 * useRatingUpdates — listens to 'rating:update' from the server,
 * calls store.updateRating, shows a notification, and registers the
 * player on mount with their current rating + gamesPlayed.
 */
import { useEffect } from 'react';
import { clientId, socket } from '../lib/socket';
import { useUserStore, RatingEntry } from '../stores';
import { useNotificationStore, useUniverseStore } from '../stores';

export function useRatingUpdates() {
  const { user, gamesPlayed, updateRating, isLoggedIn } = useUserStore();
  const { addNotification } = useNotificationStore();

  // Register player info when logged in (so server knows their rating + games played)
  useEffect(() => {
    if (!user) return;
    const register = () => {
      socket.emit('player:register', {
        name:        user.name,
        rating:      user.rating,
        gamesPlayed: gamesPlayed,
        universe:    useUniverseStore.getState().universe,
        country:     user.country || '',
        clientId,
      });
    };

    register();
    socket.on('connect', register);
    return () => socket.off('connect', register);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.name, user?.country, gamesPlayed.chess, gamesPlayed.checkers]);

  // Listen for ELO updates
  useEffect(() => {
    const handler = (entry: RatingEntry) => {
      updateRating(entry);
      const sign   = entry.delta >= 0 ? '+' : '';
      const emoji  = entry.result === 'win' ? '🏆' : entry.result === 'draw' ? '🤝' : '📉';
      const uv     = entry.universe === 'chess' ? '♟' : '⬤';
      addNotification(
        `${emoji} Rating update — ${uv} ${entry.before} → ${entry.after} (${sign}${entry.delta}) vs ${entry.opponent}`,
        entry.result === 'win' ? 'success' : entry.result === 'draw' ? 'info' : 'warning',
      );
    };

    socket.on('rating:update', handler);
    return () => socket.off('rating:update', handler);
  }, [updateRating, addNotification]);
}
