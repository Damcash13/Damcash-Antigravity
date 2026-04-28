import React from 'react';
import { useNotificationStore } from '../../stores';

export const Notifications: React.FC = () => {
  const { notifications, removeNotification } = useNotificationStore();

  return (
    <div className="notifications">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`notification ${n.type}`}
          onClick={() => removeNotification(n.id)}
        >
          {n.message}
        </div>
      ))}
    </div>
  );
};
