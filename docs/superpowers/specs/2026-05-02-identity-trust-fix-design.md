# Identity Trust Fix — Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate three audit findings that share a single root cause — the server trusting client-supplied identity instead of deriving it from the authenticated session or live socket state.

**Audit findings addressed:**
- #1 CRITICAL — `invite:send` accepts `fromName`/`fromRating` from the client payload, allowing impersonation
- #2 CRITICAL — `/api/agora/token` has no auth middleware; unauthenticated callers can obtain tokens for any room
- #13 LOW — `/api/agora/token` does not verify `channelName` belongs to a room the requesting user is in

**Architecture:** Two targeted changes to `server/index.cjs`. One follow-on change to `src/lib/api.ts` and `src/hooks/useAgora.ts` to pass `socketId` for the guest path. No new files. No changes to auth infrastructure.

**Tech Stack:** Node.js/Express, Socket.io, Supabase Auth (JWT), Vitest for unit tests

---

## Finding #1 — invite:send identity derivation

### Current code (server/index.cjs ~line 620)

```js
socket.on('invite:send', ({ targetSocketId, config, fromName, fromRating }) => {
  io.to(targetSocketId).emit('invite:received', {
    fromName: fromName || players.get(socket.id)?.name || 'Unknown',
    fromRating: fromRating || players.get(socket.id)?.rating?.chess || 1500,
    ...
  });
});
```

The `||` chain means a client-supplied `fromName` wins unconditionally over the server's registered value for the socket.

### Fix

Remove `fromName` and `fromRating` from the destructured payload. The server always derives both fields from `players.get(socket.id)`:

```js
socket.on('invite:send', ({ targetSocketId, config }) => {
  io.to(targetSocketId).emit('invite:received', {
    fromName:   players.get(socket.id)?.name         || 'Unknown',
    fromRating: players.get(socket.id)?.rating?.chess || 1500,
    ...
  });
});
```

### Out of scope (documented for later)

`player:register` itself trusts client-supplied `name` and `rating` — an authenticated user can still register with a different display name than their DB profile. Fixing that requires pulling the profile from Prisma on registration for authenticated sockets. Not touched in this session.

---

## Findings #2 & #13 — /api/agora/token hybrid auth + room check

### Design choice: Option C (hybrid, not requireAuth-only)

Guests can obtain an Agora token but **only for a room their active socket is currently assigned to**. This preserves full feature access for unauthenticated users (important for top-of-funnel) while making enumeration attacks impossible — knowing a room ID from outside is useless without an active socket in that room.

### New endpoint logic

```
POST /api/agora/token
Body: { channelName: string, uid?: number, socketId?: string }

Path A — Bearer token present (authenticated user):
  1. supabase.auth.getUser(token) — invalid → 401
  2. rooms.get(channelName)       — missing  → 403
  3. socketToUserId.get(room.players.white) === user.id
     OR socketToUserId.get(room.players.black) === user.id
                                  — false    → 403
  4. Issue Agora token

Path B — No Bearer token (guest):
  1. socketId required in body    — missing  → 403
  2. io.sockets.sockets.has(socketId) — stale → 403
  3. rooms.get(channelName)       — missing  → 403
  4. room.players.white === socketId
     OR room.players.black === socketId
                                  — false    → 403
  5. Issue Agora token
```

**Complexity:** O(1) for both paths. Authenticated path does two Map lookups (white + black socketIds against `socketToUserId`). Guest path does one socket registry lookup + two equality checks.

**Error responses:** All gate failures return `403 Forbidden` with `{ error: 'Forbidden' }` — no information about whether the room exists or who is in it.

### Client changes required

`src/lib/api.ts` — add optional `socketId` parameter:
```ts
token: (channelName: string, uid = 0, socketId?: string) =>
  request('/api/agora/token', {
    method: 'POST',
    body: JSON.stringify({ channelName, uid, ...(socketId ? { socketId } : {}) }),
  })
```

`src/hooks/useAgora.ts` — pass `socket.id` from the Socket.io client when requesting the token:
```ts
const { token, uid } = await api.agora.token(channelName, 0, socket?.id);
```

(The server ignores `socketId` on the authenticated path, so passing it for auth users is harmless.)

---

## Testing approach

Unit tests added to `src/tests/agora-auth.test.ts` and `src/tests/invite-identity.test.ts` using the same pure-function extraction pattern as `settling.test.ts`.

**invite:send tests:**
- `resolveInviteSender(playersMap, socketId, payload)` — verifies payload `fromName` is never used
- Payload with `fromName: 'Magnus'` for a socket registered as `'Alice'` → result is `'Alice'`
- Missing registration → `'Unknown'`

**Agora room membership tests:**
- `isAuthedUserInRoom(roomsMap, socketToUserIdMap, channelName, userId)` — pure function
- User in room as white → true
- User in room as black → true
- User not in room → false
- Room doesn't exist → false

- `isGuestSocketInRoom(roomsMap, channelName, socketId)` — pure function
- Socket is white → true
- Socket is black → true
- Socket not in room → false
- Room doesn't exist → false

Integration tests for the auth gate (401/403 HTTP responses) are noted as requiring supertest + server spinup, which is outside the current test infrastructure. Documented as a follow-up item.

---

## Files changed

| File | Change |
|------|--------|
| `server/index.cjs` | Finding #1: remove `fromName`/`fromRating` from `invite:send` destructuring |
| `server/index.cjs` | Findings #2/#13: replace `/api/agora/token` handler body with hybrid auth + room check |
| `src/lib/api.ts` | Add optional `socketId` param to `agora.token()` |
| `src/hooks/useAgora.ts` | Pass `socket.id` to `api.agora.token()` call |
| `src/tests/invite-identity.test.ts` | New: unit tests for finding #1 |
| `src/tests/agora-auth.test.ts` | New: unit tests for findings #2/#13 |

## Commits (one per finding)

1. `fix(security): derive invite sender identity from socket state, not payload (audit #1)`
2. `fix(security): require room membership for Agora token — hybrid auth for guests (audit #2 #13)`
