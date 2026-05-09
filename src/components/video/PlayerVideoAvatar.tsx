import React, { useRef, useEffect } from 'react';
import { countryFlag } from '../../lib/countries';

interface Props {
  name: string;
  rating: number;
  country?: string;
  isLocal: boolean;
  isActiveTurn: boolean;
  hasStream: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  setVideoEl: (el: HTMLElement | null) => void;
  onStartCall?: () => void;
  onToggleMute?: () => void;
  onToggleVideo?: () => void;
  onLeave?: () => void;
}

// Deterministic gradient per player name
const GRADIENTS = [
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#a18cd1', '#fbc2eb'],
  ['#fccb90', '#d57eeb'],
  ['#96fbc4', '#f9f586'],
];

function gradientForName(name: string): string {
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % GRADIENTS.length;
  const [a, b] = GRADIENTS[idx];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

// SVG icons — clean, no emoji
const IconMic = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const IconMicOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
    <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const IconVideo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);
const IconVideoOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34"/>
    <polygon points="23 7 16 12 23 17 23 7"/><line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const IconPhone = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07C9.44 17.25 7.76 15.57 6.46 13.62A19.79 19.79 0 0 1 3.39 5a2 2 0 0 1 1.99-2H8.4a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L9.68 10.6"/>
    <line x1="23" y1="1" x2="1" y2="23"/>
  </svg>
);
const IconCamera = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);

export const PlayerVideoAvatar: React.FC<Props> = ({
  name,
  rating,
  country,
  isLocal,
  isActiveTurn,
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
  const isLive = hasStream && !isVideoOff;

  return (
    <div className={`pva-wrap ${isActiveTurn ? 'pva-active-turn' : ''}`}>
      {/* Ring wrapper — handles the glow animation */}
      <div className="pva-ring">
        <div className="pva-circle" ref={circleRef}>
          {/* Video injected by Agora SDK here */}

          {/* Gradient placeholder */}
          {showPlaceholder && (
            <div
              className="pva-placeholder"
              style={{ background: gradientForName(name) }}
            >
              {initial}
            </div>
          )}

          {/* Connecting spinner */}
          {isConnecting && !hasStream && (
            <div className="pva-connecting">
              <div className="pva-spinner" />
            </div>
          )}

          {/* Hover controls overlay */}
          <div className="pva-overlay">
            {isLocal && (
              <div className="pva-controls">
                {!hasStream ? (
                  <button className="pva-btn pva-btn-start" onClick={onStartCall} title="Démarrer la vidéo">
                    <IconCamera />
                  </button>
                ) : (
                  <>
                    <button
                      className={`pva-btn ${isMuted ? 'pva-btn-active' : ''}`}
                      onClick={onToggleMute}
                      title={isMuted ? 'Activer le micro' : 'Couper le micro'}
                    >
                      {isMuted ? <IconMicOff /> : <IconMic />}
                    </button>
                    <button
                      className={`pva-btn ${isVideoOff ? 'pva-btn-active' : ''}`}
                      onClick={onToggleVideo}
                      title={isVideoOff ? 'Activer la caméra' : 'Couper la caméra'}
                    >
                      {isVideoOff ? <IconVideoOff /> : <IconVideo />}
                    </button>
                    <button className="pva-btn pva-btn-end" onClick={onLeave} title="Raccrocher">
                      <IconPhone />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Badges row */}
      <div className="pva-badges">
        {isLive && <span className="pva-live-badge">LIVE</span>}
        {isConnecting && !isLive && <span className="pva-connecting-badge">...</span>}
      </div>

      {/* Player info */}
      <div className="pva-info">
        <span className="pva-name">
          {country && <span className="pva-flag">{countryFlag(country)}</span>}
          <span className="pva-name-text">{name}</span>
        </span>
        <span className="pva-rating">{rating}</span>
      </div>
    </div>
  );
};
