import React, { useRef, useEffect } from 'react';
import { countryFlag } from '../../lib/countries';

interface Props {
  name: string;
  rating: number;
  country?: string;
  isLocal: boolean;
  // Video state
  hasStream: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  // Agora element ref setter
  setVideoEl: (el: HTMLElement | null) => void;
  // Controls (local player only)
  onStartCall?: () => void;
  onToggleMute?: () => void;
  onToggleVideo?: () => void;
  onLeave?: () => void;
}

export const PlayerVideoAvatar: React.FC<Props> = ({
  name,
  rating,
  country,
  isLocal,
  hasStream,
  isMuted,
  isVideoOff,
  isConnected,
  isConnecting,
  setVideoEl,
  onStartCall,
  onToggleMute,
  onToggleVideo,
  onLeave,
}) => {
  const circleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVideoEl(circleRef.current);
    return () => setVideoEl(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initial = name.trim()[0]?.toUpperCase() || '?';
  const showPlaceholder = !hasStream || isVideoOff;

  return (
    <div className="pva-wrap">
      <div className="pva-circle" ref={circleRef}>
        {/* Agora renders <video> directly inside this div */}
        {showPlaceholder && (
          <div className="pva-placeholder">{initial}</div>
        )}
        {isConnecting && !hasStream && (
          <div className="pva-connecting">
            <div className="pva-spinner" />
          </div>
        )}
        {isConnected && <div className="pva-dot" />}

        {/* Hover overlay — controls for local, status for remote */}
        <div className="pva-overlay">
          {isLocal && (
            <div className="pva-controls">
              {!hasStream ? (
                <button
                  className="pva-btn pva-btn-call"
                  onClick={onStartCall}
                  title="Start video"
                >
                  📹
                </button>
              ) : (
                <>
                  <button
                    className={`pva-btn ${isMuted ? 'pva-btn-on' : ''}`}
                    onClick={onToggleMute}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? '🔇' : '🎤'}
                  </button>
                  <button
                    className={`pva-btn ${isVideoOff ? 'pva-btn-on' : ''}`}
                    onClick={onToggleVideo}
                    title={isVideoOff ? 'Enable camera' : 'Disable camera'}
                  >
                    {isVideoOff ? '📵' : '📹'}
                  </button>
                  <button
                    className="pva-btn pva-btn-end"
                    onClick={onLeave}
                    title="End call"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Player info below the circle */}
      <div className="pva-info">
        <span className="pva-name">
          {country && <span className="pva-flag">{countryFlag(country)}</span>}
          {name}
        </span>
        <span className="pva-rating">({rating})</span>
      </div>
    </div>
  );
};
