/**
 * useWebRTC — backward-compat shim.
 * Delegates to useAgora (Agora RTC SDK).
 */
export { useAgora as useWebRTC } from './useAgora';
export type { AgoraVideoState as VideoCallState } from './useAgora';
