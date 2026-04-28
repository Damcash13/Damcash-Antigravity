/**
 * useWebRTC — backward-compat shim.
 *
 * All game components (ChessGame, DraughtsGame) import this hook.
 * We now delegate to useAgora (real Agora SDK) transparently.
 *
 * To keep using the old browser-native WebRTC peer-to-peer approach instead,
 * swap the import below back to the P2P implementation.
 */
export { useAgora as useWebRTC } from './useAgora';
export type { AgoraVideoState as VideoCallState } from './useAgora';
