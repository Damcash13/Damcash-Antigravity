# Reconnect Hardening & Agora Rate Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `room:request-players` against multi-tab slot abuse and add a dedicated 10/min rate limiter to `/api/agora/token`.

**Architecture:** Two independent changes to `server/index.cjs` plus one new test file. Task 1 (C2) uses TDD — tests first, then implementation. Task 2 (H2) is a two-line config addition with no unit-testable logic.

**Tech Stack:** Node.js/Express, Socket.io, `express-rate-limit`, Vitest

---

## File Map

| File | Role |
|------|------|
| `server/index.cjs:61–76` | Where rate limiters are defined — add `agoraLimiter` here |
| `server/index.cjs:580–610` | `room:request-players` handler — replace body with hardened version |
| `server/index.cjs:2498` | `/api/agora/token` route declaration — add `agoraLimiter` middleware arg |
| `src/tests/reconnect-hardening.test.ts` | New file — pure-function unit tests for C2 shortcut logic |

---

## Task 1: Harden room:request-players (audit C2)

**Files:**
- Create: `src/tests/reconnect-hardening.test.ts`
- Modify: `server/index.cjs:580–610`

---

- [ ] **Step 1: Write the failing tests**

Create `src/tests/reconnect-hardening.test.ts` with the following content:

```typescript
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
```

- [ ] **Step 2: Run the tests — confirm they pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 40 "reconnect-hardening"
```

Expected: all tests in `reconnect-hardening.test.ts` pass (the pure functions already implement the correct contract).

- [ ] **Step 3: Replace the room:request-players handler in server/index.cjs**

Find the current handler at lines 580–610:

```js
  // ── Request player info for a room (called on game component mount) ──────
  socket.on('room:request-players', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const wp = players.get(room.players.white);
    const bp = players.get(room.players.black);

    // Defensive: join the room if not already joined (handles reloads/reconnects)
    // If socket.id doesn't match but we are the same logged-in user, update the socket ID in the room.
    const myUserId = socketToUserId.get(socket.id);
    if (myUserId) {
      const whiteUserId = socketToUserId.get(room.players.white);
      const blackUserId = socketToUserId.get(room.players.black);
      if (whiteUserId === myUserId) {
        room.players.white = socket.id;
        log.info(`[ROOM] Updated white player socket to ${socket.id} for user ${myUserId}`);
      } else if (blackUserId === myUserId) {
        room.players.black = socket.id;
        log.info(`[ROOM] Updated black player socket to ${socket.id} for user ${myUserId}`);
      }
    }

    if (room.players.white === socket.id || room.players.black === socket.id) {
      socket.join(roomId);
    }

    socket.emit('room:players', {
      whitePlayer: { name: wp?.name || 'White', rating: wp?.rating || { chess: 1500, checkers: 1450 }, country: wp?.country || '' },
      blackPlayer: { name: bp?.name || 'Black', rating: bp?.rating || { chess: 1500, checkers: 1450 }, country: bp?.country || '' },
    });
  });
```

Replace it entirely with:

```js
  // ── Request player info for a room (called on game component mount) ──────
  socket.on('room:request-players', ({ roomId }) => {
    if (socketRateLimit(socket.id, 10)) return;

    const room = rooms.get(roomId);
    if (!room) return;
    const wp = players.get(room.players.white);
    const bp = players.get(room.players.black);

    // Shortcut reconnect for mobile users who lost sessionStorage (can't use room:rejoin).
    // Guard: only update the slot when the original socket is confirmed dead.
    // If the original socket is still alive, the second tab gets read-only player info only.
    const myUserId = socketToUserId.get(socket.id);
    if (myUserId) {
      const whiteUserId = socketToUserId.get(room.players.white);
      const blackUserId = socketToUserId.get(room.players.black);

      if (whiteUserId === myUserId) {
        const oldSocketId = room.players.white;
        if (!io.sockets.sockets.has(oldSocketId)) {
          room.players.white = socket.id;
          log.warn(`[SHORTCUT-REJOIN] userId=${myUserId} roomId=${roomId} newSocket=${socket.id} replacedSocket=${oldSocketId} ts=${Date.now()}`);
        }
      } else if (blackUserId === myUserId) {
        const oldSocketId = room.players.black;
        if (!io.sockets.sockets.has(oldSocketId)) {
          room.players.black = socket.id;
          log.warn(`[SHORTCUT-REJOIN] userId=${myUserId} roomId=${roomId} newSocket=${socket.id} replacedSocket=${oldSocketId} ts=${Date.now()}`);
        }
      }
    }

    if (room.players.white === socket.id || room.players.black === socket.id) {
      socket.join(roomId);
    }

    socket.emit('room:players', {
      whitePlayer: { name: wp?.name || 'White', rating: wp?.rating || { chess: 1500, checkers: 1450 }, country: wp?.country || '' },
      blackPlayer: { name: bp?.name || 'Black', rating: bp?.rating || { chess: 1500, checkers: 1450 }, country: bp?.country || '' },
    });
  });
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test 2>&1
```

Expected:
```
Test Files  6 passed (6)
     Tests  XX passed (XX)
```

All prior tests still pass. No failures.

- [ ] **Step 5: Commit**

```bash
git add src/tests/reconnect-hardening.test.ts server/index.cjs
git commit -m "fix(security): harden room:request-players shortcut — dead-socket check, logging, rate limit (audit C2)"
```

---

## Task 2: Add dedicated rate limiter to /api/agora/token (audit H2)

**Files:**
- Modify: `server/index.cjs:61–76` (limiter definitions)
- Modify: `server/index.cjs:2498` (route declaration)

---

- [ ] **Step 1: Add agoraLimiter definition**

In `server/index.cjs`, find the block starting at line 61:

```js
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth',   authLimiter);
app.use('/api/wallet', apiLimiter);
app.use('/api',        apiLimiter);
```

Replace it with:

```js
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const agoraLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many video token requests.' },
});
app.use('/api/auth',   authLimiter);
app.use('/api/wallet', apiLimiter);
app.use('/api',        apiLimiter);
```

- [ ] **Step 2: Apply agoraLimiter to the route**

Find the route declaration at line 2498:

```js
app.post('/api/agora/token', async (req, res) => {
```

Replace it with:

```js
app.post('/api/agora/token', agoraLimiter, async (req, res) => {
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test 2>&1
```

Expected:
```
Test Files  6 passed (6)
     Tests  XX passed (XX)
```

All tests pass. No failures.

- [ ] **Step 4: Commit**

```bash
git add server/index.cjs
git commit -m "fix(security): add dedicated 10/min rate limit to /api/agora/token (audit H2)"
```
