# Reconnect Hardening & Agora Rate Limit — Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the `room:request-players` shortcut reconnect path and add a dedicated rate limiter to `/api/agora/token`, addressing code-review findings C2 and H2.

**Audit findings addressed:**
- C2 CRITICAL — `room:request-players` overwrites `room.players` without verifying the original socket is dead, allowing multi-tab slot abuse and undermining the Agora membership gate
- H2 HIGH — `/api/agora/token` has no dedicated rate limit; authenticated callers can hammer `supabase.auth.getUser` at the global 120 req/min ceiling

**Architecture:** Two targeted changes to `server/index.cjs` only. No client changes. No new files.

**Tech Stack:** Node.js/Express, Socket.io, `express-rate-limit`, Vitest

---

## Finding C2 — room:request-players hardening

### Design rationale

The shortcut reconnect path (`room:request-players` userId match) is load-bearing for West African mobile users whose browsers clear `sessionStorage` when backgrounded, losing the `room:rejoin` token. Removing it would degrade UX for the target market. The threat model is "stranger steals slot" — already blocked by the `socketToUserId` userId match. The remaining seam (same user, second tab) is closed by requiring the original socket to be dead before any slot update.

### Three guards added to the handler

**Guard 1 — dead-socket check (the primary fix)**

Before overwriting `room.players[color]`, check `io.sockets.sockets.has(oldSocketId)`:

```
oldSocket alive?  → reject silently. Slot NOT updated.
                    Socket still receives room:players (read-only).
                    Cannot join room as player or affect Agora gate.

oldSocket dead?   → slot updated. Legitimate mobile reconnect.
```

**Guard 2 — structured log on every shortcut use**

When the shortcut fires successfully (dead socket confirmed, slot updated):
```
log.warn(`[SHORTCUT-REJOIN] userId=${myUserId} roomId=${roomId} newSocket=${socket.id} replacedSocket=${oldSocketId} ts=${Date.now()}`);
```
Tag `SHORTCUT-REJOIN` is searchable for abuse pattern detection.

**Guard 3 — rate limit**

`socketRateLimit(socket.id, 10)` at the top of the handler. Same pattern as `room:rejoin` (server line 533). Caps shortcut attempts at 10 per socket per minute.

### Full handler after fix

```js
socket.on('room:request-players', ({ roomId }) => {
  if (socketRateLimit(socket.id, 10)) return;                    // Guard 3

  const room = rooms.get(roomId);
  if (!room) return;
  const wp = players.get(room.players.white);
  const bp = players.get(room.players.black);

  const myUserId = socketToUserId.get(socket.id);
  if (myUserId) {
    const whiteUserId = socketToUserId.get(room.players.white);
    const blackUserId = socketToUserId.get(room.players.black);

    if (whiteUserId === myUserId) {
      const oldSocketId = room.players.white;
      if (!io.sockets.sockets.has(oldSocketId)) {               // Guard 1
        room.players.white = socket.id;
        log.warn(`[SHORTCUT-REJOIN] userId=${myUserId} roomId=${roomId} newSocket=${socket.id} replacedSocket=${oldSocketId} ts=${Date.now()}`); // Guard 2
      }
    } else if (blackUserId === myUserId) {
      const oldSocketId = room.players.black;
      if (!io.sockets.sockets.has(oldSocketId)) {               // Guard 1
        room.players.black = socket.id;
        log.warn(`[SHORTCUT-REJOIN] userId=${myUserId} roomId=${roomId} newSocket=${socket.id} replacedSocket=${oldSocketId} ts=${Date.now()}`); // Guard 2
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

---

## Finding H2 — /api/agora/token dedicated rate limit

### Design

A new `agoraLimiter` defined alongside existing limiters at server startup:

```js
const agoraLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many video token requests.' },
});
```

Applied at route level:
```js
app.post('/api/agora/token', agoraLimiter, async (req, res) => { ... });
```

**Why route-level:** Express applies route-level middleware before `app.use` router-level middleware. `agoraLimiter` fires first; both limiters are independent counters. A caller hitting the Agora endpoint is capped at 10/min rather than 120/min. The global `apiLimiter` remains as a second fence.

**Effect:** Worst-case `supabase.auth.getUser` call rate from one IP drops from 120/min to 10/min — a 12× reduction. Normal video usage is one token request per game join; 10/min is comfortable for rapid reconnect cycles.

---

## Testing approach

Pure-function unit tests in `src/tests/reconnect-hardening.test.ts`.

**C2 tests — `applyShortcutRejoin(room, socketToUserId, liveSocketIds, myUserId, newSocketId)`**

Extracted pure function. `liveSocketIds` is a `Set<string>` simulating `io.sockets.sockets`.

- Old socket dead + userId matches white → slot updated, returns `{ updated: true, color: 'white' }`
- Old socket dead + userId matches black → slot updated, returns `{ updated: true, color: 'black' }`
- Old socket still alive → slot NOT updated, returns `{ updated: false }`
- userId not in room → no update, returns `{ updated: false }`
- No userId (guest) → no update, returns `{ updated: false }`

**H2 tests**

The rate limiter is Express middleware — not unit-testable without supertest. Documented as an integration test requiring server spinup. The limiter config (`max: 10, windowMs: 60_000`) is verified by inspection.

---

## Files changed

| File | Change |
|------|--------|
| `server/index.cjs` | C2: add 3 guards to `room:request-players` handler |
| `server/index.cjs` | H2: define `agoraLimiter`, apply to `/api/agora/token` route |
| `src/tests/reconnect-hardening.test.ts` | New: unit tests for C2 shortcut logic |

## Commits (one per finding)

1. `fix(security): harden room:request-players shortcut — dead-socket check, logging, rate limit (audit C2)`
2. `fix(security): add dedicated 10/min rate limit to /api/agora/token (audit H2)`
