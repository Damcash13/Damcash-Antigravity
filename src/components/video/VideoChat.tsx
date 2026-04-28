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
  } = useWebRTC();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const handleStart = () => {
    initiatePeerConnection(roomId);
  };

  const handleStop = () => {
    stopLocalStream();
  };

  return (
    <div className="video-chat">
      <div className="video-streams">
        {/* Local stream */}
        <div className="video-stream">
          {localStream && !isVideoOff ? (
            <video ref={localVideoRef} autoPlay muted playsInline />
          ) : (
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
            <video ref={remoteVideoRef} autoPlay playsInline />
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

      <div className="video-controls">
        {!localStream ? (
          <button
            className="video-ctrl-btn call"
            onClick={handleStart}
            title={t('video.startCall')}
            style={{ width: 'auto', borderRadius: 20, padding: '6px 14px', fontSize: 12 }}
          >
            📹 {t('video.startCall')}
          </button>
        ) : (
          <>
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
              📵
            </button>
          </>
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
