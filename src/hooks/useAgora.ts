/**
 * Agora RTC hook — replaces the fake useWebRTC simulation.
 *
 * SETUP:
 *   npm install agora-rtc-sdk-ng
 *   Add to .env:
 *     VITE_AGORA_APP_ID=your_app_id
 *
 * The hook fetches a short-lived token from the backend (/api/agora/token)
 * which is signed with your App Certificate — never exposed to the client.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../lib/api';

// Agora Web SDK v4 — loaded via npm (agora-rtc-sdk-ng)
// We lazy-import so SSR / non-game pages don't bundle the full SDK.
let AgoraRTC: any = null;
async function getAgoraRTC() {
  if (!AgoraRTC) {
    AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
    AgoraRTC.setLogLevel(2); // 0=DEBUG 1=INFO 2=WARN 3=ERROR 4=NONE
  }
  return AgoraRTC;
}

const _runtimeCfg = typeof window !== 'undefined' ? (window as any).__DC_CFG__ : undefined;
const APP_ID = ((import.meta as any).env?.VITE_AGORA_APP_ID || _runtimeCfg?.AGORA_APP_ID) as string | undefined;

export interface AgoraVideoState {
  localStream: MediaStream | null;   // kept for VideoChat component compatibility
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

export function useAgora() {
  const [state, setState] = useState<AgoraVideoState>({
    localStream: null,
    remoteStream: null,
    isMuted: false,
    isVideoOff: false,
    isConnected: false,
    isConnecting: false,
    error: null,
  });

  const clientRef         = useRef<any>(null);
  const localAudioRef     = useRef<any>(null);
  const localVideoRef     = useRef<any>(null);
  const localVideoElRef   = useRef<HTMLVideoElement | null>(null);
  const remoteVideoElRef  = useRef<HTMLVideoElement | null>(null);
  const joinedRef         = useRef(false);

  /** Attach a local DOM video element so Agora can render into it. */
  const setLocalVideoEl  = useCallback((el: HTMLVideoElement | null) => { localVideoElRef.current  = el; }, []);
  const setRemoteVideoEl = useCallback((el: HTMLVideoElement | null) => { remoteVideoElRef.current = el; }, []);

  const leave = useCallback(async () => {
    try {
      localAudioRef.current?.close();
      localVideoRef.current?.close();
      if (joinedRef.current && clientRef.current) {
        await clientRef.current.leave();
      }
    } catch { /* ignore */ }
    localAudioRef.current  = null;
    localVideoRef.current  = null;
    joinedRef.current      = false;
    setState(s => ({ ...s, localStream: null, remoteStream: null, isConnected: false, isConnecting: false }));
  }, []);

  /** Join a video channel. channelName should be the game roomId. */
  const initiatePeerConnection = useCallback(async (channelName: string) => {
    if (!APP_ID) {
      setState(s => ({ ...s, error: 'Agora App ID not configured (VITE_AGORA_APP_ID)' }));
      return;
    }
    setState(s => ({ ...s, isConnecting: true, error: null }));

    try {
      // 1. Get token from backend (uses authenticated request helper)
      const { token, uid } = await api.agora.token(channelName, 0);

      // 2. Create Agora client
      const RTC = await getAgoraRTC();
      const client = RTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      // 3. Listen for remote users
      client.on('user-published', async (user: any, mediaType: 'audio' | 'video') => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'video') {
          user.videoTrack?.play(remoteVideoElRef.current || 'remote-video');
          setState(s => ({ ...s, isConnected: true }));
        }
        if (mediaType === 'audio') {
          user.audioTrack?.play();
        }
      });

      client.on('user-unpublished', (_user: any, mediaType: 'audio' | 'video') => {
        if (mediaType === 'video') {
          setState(s => ({ ...s, remoteStream: null }));
        }
      });

      // 4. Join channel
      await client.join(APP_ID, channelName, token, uid);
      joinedRef.current = true;

      // 5. Create and publish local tracks
      const [audioTrack, videoTrack] = await RTC.createMicrophoneAndCameraTracks();
      localAudioRef.current = audioTrack;
      localVideoRef.current = videoTrack;

      videoTrack.play(localVideoElRef.current || 'local-video');
      await client.publish([audioTrack, videoTrack]);

      setState(s => ({ ...s, isConnecting: false, isConnected: true }));
    } catch (err: any) {
      const msg = err?.message?.includes('PERMISSION_DENIED')
        ? 'Camera/microphone access denied'
        : err?.message || 'Failed to connect video';
      setState(s => ({ ...s, error: msg, isConnecting: false }));
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (localAudioRef.current) {
      const next = !state.isMuted;
      localAudioRef.current.setEnabled(!next);
      setState(s => ({ ...s, isMuted: next }));
    }
  }, [state.isMuted]);

  const toggleVideo = useCallback(() => {
    if (localVideoRef.current) {
      const next = !state.isVideoOff;
      localVideoRef.current.setEnabled(!next);
      setState(s => ({ ...s, isVideoOff: next }));
    }
  }, [state.isVideoOff]);

  // Cleanup on unmount
  useEffect(() => { return () => { leave(); }; }, [leave]);

  return {
    ...state,
    startLocalStream: () => Promise.resolve(null), // compat shim
    stopLocalStream: leave,
    toggleMute,
    toggleVideo,
    initiatePeerConnection,
    setLocalVideoEl,
    setRemoteVideoEl,
  };
}
