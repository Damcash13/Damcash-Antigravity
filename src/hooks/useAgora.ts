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
    try {
      AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      AgoraRTC.setLogLevel(2); // 0=DEBUG 1=INFO 2=WARN 3=ERROR 4=NONE
    } catch (err: any) {
      // Vite chunk-loading failure after redeployment — old cached pages
      // reference chunk filenames that no longer exist on the server.
      if (err?.message?.includes('dynamically imported module') || err?.message?.includes('Failed to fetch')) {
        console.warn('[Agora] Chunk load failed — app was updated. Prompting reload.');
        throw new Error('APP_UPDATED');
      }
      throw err;
    }
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

  const clientRef              = useRef<any>(null);
  const localAudioRef          = useRef<any>(null);
  const localVideoRef          = useRef<any>(null);
  const localVideoElRef        = useRef<HTMLElement | null>(null);
  const remoteVideoElRef       = useRef<HTMLElement | null>(null);
  const pendingRemoteTrackRef  = useRef<any>(null);
  const joinedRef              = useRef(false);

  /** Attach a local DOM element — plays the track immediately if already ready. */
  const setLocalVideoEl = useCallback((el: HTMLElement | null) => {
    localVideoElRef.current = el;
    if (el && localVideoRef.current) {
      localVideoRef.current.play(el);
    }
  }, []);

  /** Attach a remote DOM element — plays any buffered remote track immediately. */
  const setRemoteVideoEl = useCallback((el: HTMLElement | null) => {
    remoteVideoElRef.current = el;
    if (el && pendingRemoteTrackRef.current) {
      pendingRemoteTrackRef.current.play(el);
      pendingRemoteTrackRef.current = null;
    }
  }, []);

  const leave = useCallback(async () => {
    try {
      if (localAudioRef.current) {
        localAudioRef.current.stop();
        localAudioRef.current.close();
      }
      if (localVideoRef.current) {
        localVideoRef.current.stop();
        localVideoRef.current.close();
      }
      if (joinedRef.current && clientRef.current) {
        await clientRef.current.leave();
      }
    } catch (err) {
      console.error('Agora leave error:', err);
    }
    localAudioRef.current = null;
    localVideoRef.current = null;
    joinedRef.current = false;
    setState(s => ({
      ...s,
      localStream: null,
      remoteStream: null,
      isConnected: false,
      isConnecting: false,
      isMuted: false,
      isVideoOff: false
    }));
  }, []);

  /** Join a video channel. channelName should be the game roomId. */
  const initiatePeerConnection = useCallback(async (channelName: string, autoPublish = true) => {
    if (!APP_ID) {
      setState(s => ({ ...s, error: 'Agora App ID not configured (VITE_AGORA_APP_ID)' }));
      return;
    }
    setState(s => ({ ...s, isConnecting: true, error: null }));

    try {
      // 1. Get token from backend
      const { token, uid } = await api.agora.token(channelName, 0);

      // 2. Create Agora client
      const RTC = await getAgoraRTC();
      if (!clientRef.current) {
        clientRef.current = RTC.createClient({ mode: 'rtc', codec: 'vp8' });
      }
      const client = clientRef.current;

      // 3. Listen for remote users (already joined? don't re-add listeners)
      if (!joinedRef.current) {
        client.on('user-published', async (user: any, mediaType: 'audio' | 'video') => {
          await client.subscribe(user, mediaType);
          if (mediaType === 'video') {
            if (remoteVideoElRef.current) {
              user.videoTrack?.play(remoteVideoElRef.current);
            } else {
              pendingRemoteTrackRef.current = user.videoTrack;
            }
            setState(s => ({ ...s, remoteStream: {} as any }));
          }
          if (mediaType === 'audio') {
            user.audioTrack?.play();
          }
        });

        client.on('user-unpublished', (user: any, mediaType: 'audio' | 'video') => {
          if (mediaType === 'video') {
            setState(s => ({ ...s, remoteStream: null }));
          }
        });

        // 4. Join channel
        await client.join(APP_ID, channelName, token, uid);
        joinedRef.current = true;
      }

      setState(s => ({ ...s, isConnecting: false, isConnected: true }));

      // 5. Optionally publish local tracks
      if (autoPublish) {
        await publishLocalTracks();
      }

    } catch (err: any) {
      console.error('Agora join error:', err);
      if (err?.message === 'APP_UPDATED') {
        setState(s => ({ ...s, isConnecting: false, error: 'App was updated — please refresh the page' }));
        return;
      }
      const msg = err?.message?.includes('PERMISSION_DENIED')
        ? 'Camera/microphone access denied'
        : err?.message || 'Failed to connect video';
      setState(s => ({ ...s, error: msg, isConnecting: false }));
    }
  }, []);

  /** Start broadcasting local camera and microphone */
  const publishLocalTracks = useCallback(async () => {
    if (!clientRef.current || !joinedRef.current) return;
    if (localVideoRef.current) return; // already publishing

    try {
      const RTC = await getAgoraRTC();
      const [audioTrack, videoTrack] = await RTC.createMicrophoneAndCameraTracks();
      localAudioRef.current = audioTrack;
      localVideoRef.current = videoTrack;

      await clientRef.current.publish([audioTrack, videoTrack]);
      
      setState(s => ({ ...s, localStream: {} as any }));

      if (localVideoElRef.current) {
        videoTrack.play(localVideoElRef.current);
      }
    } catch (err: any) {
      console.error('Agora publish error:', err);
      const msg = err?.message?.includes('PERMISSION_DENIED')
        ? 'Camera/microphone access denied'
        : 'Failed to start camera';
      setState(s => ({ ...s, error: msg }));
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
    publishLocalTracks,
    setLocalVideoEl,
    setRemoteVideoEl,
  };
}
