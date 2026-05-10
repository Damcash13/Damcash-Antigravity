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
import { socket } from '../lib/socket';

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

// App ID is a public Agora identifier — safe as a hardcoded fallback.
// Tries build-time env var first, then /api/config, then falls back to the constant.
const AGORA_APP_ID_DEFAULT = 'e68bae3377a749a883bc32f169e8d2f7';
const _buildTimeAppId = (import.meta as any).env?.VITE_AGORA_APP_ID as string | undefined;
let _cachedAppId: string | undefined = _buildTimeAppId || undefined;

async function getAppId(): Promise<string> {
  if (_cachedAppId) return _cachedAppId;
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const cfg = await res.json();
      if (cfg?.agoraAppId) _cachedAppId = cfg.agoraAppId;
    }
  } catch { /* network error — use default */ }
  return _cachedAppId || AGORA_APP_ID_DEFAULT;
}

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
  const channelNameRef         = useRef<string | null>(null);
  const joinPromiseRef         = useRef<Promise<void> | null>(null);
  const listenersAttachedRef   = useRef(false);

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
    channelNameRef.current = null;
    joinPromiseRef.current = null;
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

  /** Start broadcasting local camera and microphone */
  const publishLocalTracks = useCallback(async () => {
    if (localVideoRef.current) return true; // already publishing

    if (!clientRef.current || !joinedRef.current) {
      setState(s => ({ ...s, error: 'Video room is still connecting' }));
      return false;
    }

    setState(s => ({ ...s, isConnecting: true, error: null }));

    try {
      const RTC = await getAgoraRTC();
      const [audioTrack, videoTrack] = await RTC.createMicrophoneAndCameraTracks();
      localAudioRef.current = audioTrack;
      localVideoRef.current = videoTrack;

      await clientRef.current.publish([audioTrack, videoTrack]);
      
      setState(s => ({
        ...s,
        localStream: {} as any,
        isConnecting: false,
        isConnected: true,
        isMuted: false,
        isVideoOff: false,
      }));

      if (localVideoElRef.current) {
        videoTrack.play(localVideoElRef.current);
      }
      return true;
    } catch (err: any) {
      console.error('Agora publish error:', err);
      const msg = err?.message?.includes('PERMISSION_DENIED')
        ? 'Camera/microphone access denied'
        : 'Failed to start camera';
      setState(s => ({ ...s, error: msg, isConnecting: false }));
      return false;
    }
  }, []);

  /** Join a video channel. channelName should be the game roomId. */
  const initiatePeerConnection = useCallback(async (channelName: string, autoPublish = true) => {
    if (!channelName) return;

    if (joinPromiseRef.current && channelNameRef.current === channelName) {
      await joinPromiseRef.current;
      if (autoPublish) await publishLocalTracks();
      return;
    }

    if (joinedRef.current && channelNameRef.current === channelName) {
      setState(s => ({ ...s, isConnecting: false, isConnected: true, error: null }));
      if (autoPublish) await publishLocalTracks();
      return;
    }

    if (joinedRef.current && channelNameRef.current !== channelName) {
      await leave();
    }

    setState(s => ({ ...s, isConnecting: true, error: null }));
    channelNameRef.current = channelName;

    const joinTask = (async () => {
      // 0. Resolve App ID (build-time env → /api/config → hardcoded fallback)
      const appId = await getAppId();

      // 1. Get token from backend
      const { token, uid } = await api.agora.token(channelName, 0, socket.id);

      // 2. Create Agora client
      const RTC = await getAgoraRTC();
      if (!clientRef.current) {
        clientRef.current = RTC.createClient({ mode: 'rtc', codec: 'vp8' });
      }
      const client = clientRef.current;

      // 3. Listen for remote users (already joined? don't re-add listeners)
      if (!listenersAttachedRef.current) {
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
        listenersAttachedRef.current = true;
      }

      // 4. Join channel
      await client.join(appId, channelName, token, uid);
      joinedRef.current = true;

      setState(s => ({ ...s, isConnecting: false, isConnected: true }));

      // 5. Optionally publish local tracks
      if (autoPublish) {
        await publishLocalTracks();
      }
    })();

    joinPromiseRef.current = joinTask;
    try {
      await joinTask;
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
    } finally {
      if (joinPromiseRef.current === joinTask) joinPromiseRef.current = null;
    }
  }, [leave, publishLocalTracks]);

  /** One-click camera start: join the room if needed, then publish camera/mic. */
  const startCamera = useCallback(async (channelName: string) => {
    if (!channelName) return false;
    if (!joinedRef.current || channelNameRef.current !== channelName || joinPromiseRef.current) {
      await initiatePeerConnection(channelName, false);
    }
    return publishLocalTracks();
  }, [initiatePeerConnection, publishLocalTracks]);

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
    startCamera,
    setLocalVideoEl,
    setRemoteVideoEl,
  };
}
