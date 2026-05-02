import { describe, it, expect } from 'vitest';

// Pure extraction of the slot-update logic in the room:request-players handler.
// liveSocketIds simulates io.sockets.sockets (has() is the only method used).
//
// BEFORE fix: slot is overwritten whenever userId matches, regardless of whether
//             the original socket is still alive.
// AFTER fix:  slot is only overwritten when the original socket is confirmed dead.

type Room = { players: { white: string; black: string } };

function applyShortcutRejoin(
  room: Room,
  socketToUserId: Map<string, string>,
  liveSocketIds: Set<string>,
  myUserId: string | undefined,
  newSocketId: string,
): { updated: boolean; color: 'white' | 'black' | null } {
  if (!myUserId) return { updated: false, color: null };

  const whiteUserId = socketToUserId.get(room.players.white);
  const blackUserId = socketToUserId.get(room.players.black);

  if (whiteUserId === myUserId) {
    const oldSocketId = room.players.white;
    if (!liveSocketIds.has(oldSocketId)) {
      room.players.white = newSocketId;
      return { updated: true, color: 'white' };
    }
    return { updated: false, color: null };
  }

  if (blackUserId === myUserId) {
    const oldSocketId = room.players.black;
    if (!liveSocketIds.has(oldSocketId)) {
      room.players.black = newSocketId;
      return { updated: true, color: 'black' };
    }
    return { updated: false, color: null };
  }

  return { updated: false, color: null };
}

// ── Vulnerability proof — documents PRE-FIX behaviour ────────────────────────
function applyShortcutRejoinBuggy(
  room: Room,
  socketToUserId: Map<string, string>,
  myUserId: string | undefined,
  newSocketId: string,
): { updated: boolean; color: 'white' | 'black' | null } {
  if (!myUserId) return { updated: false, color: null };
  const whiteUserId = socketToUserId.get(room.players.white);
  const blackUserId = socketToUserId.get(room.players.black);
  if (whiteUserId === myUserId) {
    room.players.white = newSocketId; // no dead-socket check — always overwrites
    return { updated: true, color: 'white' };
  }
  if (blackUserId === myUserId) {
    room.players.black = newSocketId;
    return { updated: true, color: 'black' };
  }
  return { updated: false, color: null };
}

describe('VULNERABILITY proof — pre-fix behaviour (audit C2)', () => {
  it('buggy version overwrites white slot even when original socket is still alive', () => {
    const room: Room = { players: { white: 'old-sock-w', black: 'sock-b' } };
    const socketToUserId = new Map([['old-sock-w', 'user-1'], ['new-sock', 'user-1']]);
    const result = applyShortcutRejoinBuggy(room, socketToUserId, 'user-1', 'new-sock');
    // This PASSES — proves the bug: second tab steals the slot even with first tab alive
    expect(result.updated).toBe(true);
    expect(room.players.white).toBe('new-sock');
  });
});

describe('applyShortcutRejoin — hardened shortcut logic (audit C2)', () => {
  it('updates white slot when old socket is dead', () => {
    const room: Room = { players: { white: 'old-sock-w', black: 'sock-b' } };
    const socketToUserId = new Map([['old-sock-w', 'user-1'], ['new-sock', 'user-1']]);
    const liveSocketIds = new Set<string>(['sock-b']); // old-sock-w is NOT alive
    const result = applyShortcutRejoin(room, socketToUserId, liveSocketIds, 'user-1', 'new-sock');
    expect(result).toEqual({ updated: true, color: 'white' });
    expect(room.players.white).toBe('new-sock');
  });

  it('updates black slot when old socket is dead', () => {
    const room: Room = { players: { white: 'sock-w', black: 'old-sock-b' } };
    const socketToUserId = new Map([['sock-w', 'user-1'], ['old-sock-b', 'user-2'], ['new-sock', 'user-2']]);
    const liveSocketIds = new Set<string>(['sock-w']); // old-sock-b is NOT alive
    const result = applyShortcutRejoin(room, socketToUserId, liveSocketIds, 'user-2', 'new-sock');
    expect(result).toEqual({ updated: true, color: 'black' });
    expect(room.players.black).toBe('new-sock');
  });

  it('does NOT update white slot when old socket is still alive', () => {
    const room: Room = { players: { white: 'old-sock-w', black: 'sock-b' } };
    const socketToUserId = new Map([['old-sock-w', 'user-1'], ['new-sock', 'user-1']]);
    const liveSocketIds = new Set<string>(['old-sock-w', 'sock-b']); // old-sock-w IS alive
    const result = applyShortcutRejoin(room, socketToUserId, liveSocketIds, 'user-1', 'new-sock');
    expect(result).toEqual({ updated: false, color: null });
    expect(room.players.white).toBe('old-sock-w'); // slot unchanged
  });

  it('does NOT update when userId does not match any player in the room', () => {
    const room: Room = { players: { white: 'sock-w', black: 'sock-b' } };
    const socketToUserId = new Map([['sock-w', 'user-1'], ['sock-b', 'user-2']]);
    const liveSocketIds = new Set<string>();
    const result = applyShortcutRejoin(room, socketToUserId, liveSocketIds, 'user-99', 'new-sock');
    expect(result).toEqual({ updated: false, color: null });
    expect(room.players.white).toBe('sock-w');
    expect(room.players.black).toBe('sock-b');
  });

  it('does NOT update when myUserId is undefined (guest socket)', () => {
    const room: Room = { players: { white: 'sock-w', black: 'sock-b' } };
    const socketToUserId = new Map<string, string>();
    const liveSocketIds = new Set<string>();
    const result = applyShortcutRejoin(room, socketToUserId, liveSocketIds, undefined, 'new-sock');
    expect(result).toEqual({ updated: false, color: null });
  });
});
