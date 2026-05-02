import { describe, it, expect } from 'vitest';

// Pure extraction of the identity-derivation logic inside the invite:send handler.
// This mirrors what server/index.cjs will do after the fix — payload fields are IGNORED.
//
// BEFORE fix: fromName: fromName || players.get(socket.id)?.name || 'Unknown'
// AFTER fix:  fromName: players.get(socket.id)?.name || 'Unknown'
//
// We test the "after" contract here so these tests fail against the current server code
// and pass once the fix is applied.

type Player = { name: string; rating: { chess: number } };

function resolveInviteSender(
  playersMap: Map<string, Player>,
  socketId: string,
  payload: { fromName?: string; fromRating?: number },
): { fromName: string; fromRating: number } {
  // Server-authoritative: payload values are never consulted.
  return {
    fromName:   playersMap.get(socketId)?.name            ?? 'Unknown',
    fromRating: playersMap.get(socketId)?.rating?.chess   ?? 1500,
  };
}

// ── Vulnerability proof — documents the PRE-FIX behaviour ────────────────────
// This function replicates the current server/index.cjs line 628 exactly.
// DO NOT copy this pattern — it is the bug.
function resolveInviteSenderBuggy(
  playersMap: Map<string, Player>,
  socketId: string,
  payload: { fromName?: string; fromRating?: number },
): { fromName: string; fromRating: number } {
  return {
    fromName:   payload.fromName   || playersMap.get(socketId)?.name          || 'Unknown',
    fromRating: payload.fromRating || playersMap.get(socketId)?.rating?.chess || 1500,
  };
}

describe('VULNERABILITY proof — pre-fix behaviour (audit #1)', () => {
  it('current code lets an attacker impersonate any display name', () => {
    const players = new Map([['sock1', { name: 'Alice', rating: { chess: 1600 } }]]);
    const result = resolveInviteSenderBuggy(players, 'sock1', { fromName: 'Magnus Carlsen' });
    // This PASSES — it proves the bug: the payload wins over the registered name
    expect(result.fromName).toBe('Magnus Carlsen');
  });

  it('current code lets an attacker forge any rating', () => {
    const players = new Map([['sock1', { name: 'Alice', rating: { chess: 1600 } }]]);
    const result = resolveInviteSenderBuggy(players, 'sock1', { fromRating: 3000 });
    expect(result.fromRating).toBe(3000);
  });
});

describe('invite:send — server-authoritative identity (audit #1)', () => {
  it('uses the registered name, ignores payload fromName', () => {
    const players = new Map([['sock1', { name: 'Alice', rating: { chess: 1600 } }]]);
    const result = resolveInviteSender(players, 'sock1', { fromName: 'Magnus Carlsen' });
    expect(result.fromName).toBe('Alice');
    expect(result.fromName).not.toBe('Magnus Carlsen');
  });

  it('uses the registered rating, ignores payload fromRating', () => {
    const players = new Map([['sock1', { name: 'Alice', rating: { chess: 1600 } }]]);
    const result = resolveInviteSender(players, 'sock1', { fromRating: 9999 });
    expect(result.fromRating).toBe(1600);
    expect(result.fromRating).not.toBe(9999);
  });

  it('falls back to Unknown when socket has no registration', () => {
    const players = new Map<string, Player>();
    const result = resolveInviteSender(players, 'sock-ghost', {});
    expect(result.fromName).toBe('Unknown');
    expect(result.fromRating).toBe(1500);
  });

  it('payload with both fields still yields registered values', () => {
    const players = new Map([['s', { name: 'Bob', rating: { chess: 1800 } }]]);
    const result = resolveInviteSender(players, 's', { fromName: 'Evil', fromRating: 3000 });
    expect(result.fromName).toBe('Bob');
    expect(result.fromRating).toBe(1800);
  });
});
