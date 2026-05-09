import React, { useRef, useEffect } from 'react';

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

const GRADIENTS = [
  ['#667eea','#764ba2'],['#f093fb','#f5576c'],['#4facfe','#00f2fe'],
  ['#43e97b','#38f9d7'],['#fa709a','#fee140'],['#a18cd1','#fbc2eb'],
  ['#fccb90','#d57eeb'],['#96fbc4','#f9f586'],
];
function gradientForName(name: string) {
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % GRADIENTS.length;
  return `linear-gradient(135deg, ${GRADIENTS[idx][0]}, ${GRADIENTS[idx][1]})`;
}

const IconMic = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const IconMicOff = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
    <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const IconVideo = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);
const IconVideoOff = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34"/>
    <polygon points="23 7 16 12 23 17 23 7"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const IconEndCall = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconStartCall = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/>
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);

export const PlayerVideoAvatar: React.FC<Props> = ({
  name,
  isLocal,
  isActiveTurn,
  hasStream,
  isMuted,
  isVideoOff,
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
      {/* Ring + circle */}
      <div className="pva-ring">
        <div className="pva-circle" ref={circleRef}>
          {/* Gradient placeholder */}
          {showPlaceholder && (
            <div className="pva-placeholder" style={{ background: gradientForName(name) }}>
              {isConnecting
                ? <div className="pva-spinner" />
                : initial}
            </div>
          )}

          {/* LIVE badge — anchored top-left on the circle */}
          {isLive && <span className="pva-live-badge">LIVE</span>}

          {/* Start call CTA — centered inside circle when no stream */}
          {isLocal && !hasStream && !isConnecting && (
            <button className="pva-start-btn" onClick={onStartCall} title="Démarrer la vidéo">
              <IconStartCall />
            </button>
          )}
        </div>
      </div>

      {/* Controls row — below circle, visible only when local + streaming */}
      {isLocal && hasStream && (
        <div className="pva-ctrl-row">
          <button
            className={`pva-ctrl-btn ${isMuted ? 'pva-ctrl-off' : ''}`}
            onClick={onToggleMute}
            title={isMuted ? 'Activer micro' : 'Couper micro'}
          >
            {isMuted ? <IconMicOff /> : <IconMic />}
          </button>
          <button
            className={`pva-ctrl-btn ${isVideoOff ? 'pva-ctrl-off' : ''}`}
            onClick={onToggleVideo}
            title={isVideoOff ? 'Activer caméra' : 'Couper caméra'}
          >
            {isVideoOff ? <IconVideoOff /> : <IconVideo />}
          </button>
          <button
            className="pva-ctrl-btn pva-ctrl-end"
            onClick={onLeave}
            title="Raccrocher"
          >
            <IconEndCall />
          </button>
        </div>
      )}
    </div>
  );
};
