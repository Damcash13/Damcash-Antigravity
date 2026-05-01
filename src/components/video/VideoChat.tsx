import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebRTC } from '../../hooks/useWebRTC';

interface Props {
  roomId: string;
  playerName: string;
  opponentName: string;
}

export const VideoChat: React.FC<Props> = ({ roomId, playerName, opponentName }) => {
  const { t } = useTranslation();
  const {
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    isConnected,
    isConnecting,
    error,
    startLocalStream,
    stopLocalStream,
    toggleMute,
    toggleVideo,
    initiatePeerConnection,
    publishLocalTracks,
    setLocalVideoEl,
    setRemoteVideoEl,
  } = useWebRTC();

  const localVideoContainerRef = useRef<HTMLDivElement>(null);
  const remoteVideoContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-join the channel in listen-only mode on mount
    // so we can see the opponent immediately if they are already broadcasting.
    if (roomId) {
      initiatePeerConnection(roomId, false);
    }
  }, [roomId, initiatePeerConnection]);

  useEffect(() => {
    if (localStream && localVideoContainerRef.current) {
      setLocalVideoEl(localVideoContainerRef.current);
    }
  }, [localStream, setLocalVideoEl]);

  useEffect(() => {
    if (remoteStream && remoteVideoContainerRef.current) {
      setRemoteVideoEl(remoteVideoContainerRef.current);
    }
  }, [remoteStream, setRemoteVideoEl]);

  const handleStart = () => {
    publishLocalTracks();
  };

  const handleStop = () => {
    stopLocalStream();
  };

  return (
    <div className="video-chat">
      <div className="video-streams">
        {/* Local stream */}
        <div className="video-stream">
          {localStream ? (
            <div 
              ref={localVideoContainerRef}
              id="local-video" 
              style={{ width: '100%', height: '100%', borderRadius: 'inherit', overflow: 'hidden', display: isVideoOff ? 'none' : 'block' }} 
            />
          ) : null}
          {(!localStream || isVideoOff) && (
            <div className="video-placeholder">
              <span style={{ fontSize: 24 }}>👤</span>
              <span style={{ fontSize: 10 }}>
                {isVideoOff ? t('video.cameraOff') : t('common.offline')}
              </span>
            </div>
          )}
          <div className="video-stream-label">{playerName} (You)</div>
        </div>

        {/* Remote stream */}
        <div className="video-stream">
          {remoteStream ? (
            <div 
              ref={remoteVideoContainerRef}
              id="remote-video" 
              style={{ width: '100%', height: '100%', borderRadius: 'inherit', overflow: 'hidden' }} 
            />
          ) : (
            <div className="video-placeholder">
              <span style={{ fontSize: 24 }}>👤</span>
              <span style={{ fontSize: 10 }}>
                {isConnecting
                  ? t('video.connecting')
                  : localStream
                  ? t('video.disconnected')
                  : t('common.offline')}
              </span>
            </div>
          )}
          <div className="video-stream-label">{opponentName}</div>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', textAlign: 'center' }}>
          {error}
        </div>
      )}

      <div className="video-footer">
        {!localStream ? (
          <button
            className="video-ctrl-btn call"
            onClick={handleStart}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <div className="btn-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'btn-spin 0.6s linear infinite' }} />
            ) : '📹'}
            {isConnecting ? t('video.connecting') : t('video.startCall')}
          </button>
        ) : (
          <div className="video-ctrl-group">
            <button
              className={`video-ctrl-btn ${isMuted ? 'active' : ''}`}
              onClick={toggleMute}
              title={isMuted ? t('video.unmuteAudio') : t('video.muteAudio')}
            >
              {isMuted ? '🔇' : '🎤'}
            </button>
            <button
              className={`video-ctrl-btn ${isVideoOff ? 'active' : ''}`}
              onClick={toggleVideo}
              title={isVideoOff ? t('video.enableVideo') : t('video.disableVideo')}
            >
              {isVideoOff ? '📵' : '📹'}
            </button>
            <button
              className="video-ctrl-btn end-call"
              onClick={handleStop}
              title={t('video.endCall')}
            >
              📵 {t('video.endCall')}
            </button>
          </div>
        )}
      </div>

      {isConnected && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--accent)' }}>
          ● {t('video.connected')}
        </div>
      )}
    </div>
  );
};
