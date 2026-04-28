/**
 * Agora RTC client singleton.
 * Centralises client creation so the SDK is only initialised once per page.
 *
 * Usage:
 *   import { getAgoraClient } from '../lib/agora';
 *   const client = await getAgoraClient();
 */

let _client: any = null;

export async function getAgoraClient(): Promise<any> {
  if (_client) return _client;
  const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
  AgoraRTC.setLogLevel(3); // 3 = ERROR only in production
  _client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
  return _client;
}

export async function getAgoraRTC(): Promise<any> {
  const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
  return AgoraRTC;
}

/** Fetch a short-lived token from our backend. */
export async function fetchAgoraToken(channelName: string, uid = 0): Promise<{ token: string | null; appId: string; uid: number }> {
  const res = await fetch('/api/agora/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelName, uid }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'Failed to get Agora token');
  }
  return res.json();
}
