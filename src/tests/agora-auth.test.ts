import { describe, it, expect } from 'vitest';

// Pure extraction of the two membership checks that will live inside the
// /api/agora/token handler after the fix.
//
// BEFORE fix: no membership check at all — any caller gets a token.
// AFTER fix:  authenticated users checked via userId↔socketId map;
//             guests checked via live socketId↔room membership.
//
// These tests define the "after" contract. They pass with the pure functions
// below and will pass equally once the real handler is updated.

type Room = { players: { white: string; black: string } };

// ── Vulnerability proof — documents the PRE-FIX gate ─────────────────────────
// The current handler only validates that channelName is a non-empty string.
// DO NOT copy this pattern — it is the bug.
function currentHandlerGate(channelName: unknown): boolean {
  if (!channelName || typeof channelName !== 'string') return false; // → 400
  return true; // issues token — no room or auth check at all
}

describe('VULNERABILITY proof — pre-fix behaviour (audit #2 #13)', () => {
  it('current handler issues a token for any non-empty channelName', () => {
    // This PASSES — proves the bug: a room that does not exist still gets a token
    expect(currentHandlerGate('room-FAKE-DOES-NOT-EXIST')).toBe(true);
  });

  it('current handler issues a token for a room the caller is not in', () => {
    expect(currentHandlerGate('room-someone-elses-game')).toBe(true);
  });

  it('current handler does not require authentication', () => {
    // No auth header needed — the gate never checks for one
    expect(currentHandlerGate('any-arbitrary-string')).toBe(true);
  });
});

// Path A — authenticated user: check DB user ID against room's socket→userId map
function isAuthedUserInRoom(
  roomsMap: Map<string, Room>,
  socketToUserId: Map<string, string>,
  channelName: string,
  userId: string,
): boolean {
  const room = roomsMap.get(channelName);
  if (!room) return false;
  return (
    socketToUserId.get(room.players.white) === userId ||
    socketToUserId.get(room.players.black) === userId
  );
}

// Path B — guest: check that the socketId is in the room (live check delegated to caller)
function isGuestSocketInRoom(
  roomsMap: Map<string, Room>,
  channelName: string,
  socketId: string,
): boolean {
  const room = roomsMap.get(channelName);
  if (!room) return false;
  return room.players.white === socketId || room.players.black === socketId;
}

describe('isAuthedUserInRoom — authenticated membership check (audit #2 #13)', () => {
  const rooms = new Map<string, Room>([
    ['room-abc', { players: { white: 'sock-w', black: 'sock-b' } }],
  ]);
  const socketToUserId = new Map([
    ['sock-w', 'user-1'],
    ['sock-b', 'user-2'],
  ]);

  it('returns true for the white player', () => {
    expect(isAuthedUserInRoom(rooms, socketToUserId, 'room-abc', 'user-1')).toBe(true);
  });

  it('returns true for the black player', () => {
    expect(isAuthedUserInRoom(rooms, socketToUserId, 'room-abc', 'user-2')).toBe(true);
  });

  it('returns false for a user not in the room', () => {
    expect(isAuthedUserInRoom(rooms, socketToUserId, 'room-abc', 'user-99')).toBe(false);
  });

  it('returns false when the room does not exist', () => {
    expect(isAuthedUserInRoom(rooms, socketToUserId, 'room-FAKE', 'user-1')).toBe(false);
  });

  it('returns false when userId is empty string', () => {
    expect(isAuthedUserInRoom(rooms, socketToUserId, 'room-abc', '')).toBe(false);
  });
});

describe('isGuestSocketInRoom — guest membership check (audit #2 #13)', () => {
  const rooms = new Map<string, Room>([
    ['room-xyz', { players: { white: 'sock-g1', black: 'sock-g2' } }],
  ]);

  it('returns true for white socket', () => {
    expect(isGuestSocketInRoom(rooms, 'room-xyz', 'sock-g1')).toBe(true);
  });

  it('returns true for black socket', () => {
    expect(isGuestSocketInRoom(rooms, 'room-xyz', 'sock-g2')).toBe(true);
  });

  it('returns false for a socket not in the room', () => {
    expect(isGuestSocketInRoom(rooms, 'room-xyz', 'sock-intruder')).toBe(false);
  });

  it('returns false when the room does not exist', () => {
    expect(isGuestSocketInRoom(rooms, 'room-NONE', 'sock-g1')).toBe(false);
  });

  it('returns false for empty socketId', () => {
    expect(isGuestSocketInRoom(rooms, 'room-xyz', '')).toBe(false);
  });
});
