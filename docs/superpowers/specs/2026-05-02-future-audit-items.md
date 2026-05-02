# Future Audit Items — Discovered During Identity Trust Fix Session

Findings discovered by the code-reviewer agent on 2026-05-02.
NOT fixed in this session. Schedule for a dedicated security session.

---

## CRITICAL

### C2 — room:request-players can overwrite room.players, undermining Agora gate

**File:** `server/index.cjs` ~line 589–599  
The `room:request-players` handler mutates `room.players.white` or `room.players.black` to the current socket's ID based solely on a `socketToUserId` lookup, with no reconnect-token verification. An attacker who was ever a player in a room could re-register their socket ID into `socketToUserId` and trigger this handler to overwrite the room's player slot, then pass Path A of the Agora token gate with their authenticated user ID.  
**Recommended fix:** `room:request-players` should not silently update `room.players` without the reconnect token; slot reassignment should go through the `room:rejoin` flow exclusively.

---

## HIGH

### H2 — No per-endpoint rate limit on /api/agora/token

**File:** `server/index.cjs` ~line 2498  
The endpoint sits behind the global `apiLimiter` (120 req/min) but has no dedicated tighter limit. The authenticated path calls `supabase.auth.getUser` on every request — an authenticated attacker can hammer Supabase at 120 req/min per IP.  
**Recommended fix:** Apply a dedicated `rateLimit({ windowMs: 60_000, max: 10 })` specifically to `/api/agora/token`, ahead of the global limiter.

### H3 — uid parameter passed unsanitized to Agora token builder

**File:** `server/index.cjs` ~line 2504, 2557  
`uid` is destructured from `req.body` and passed directly to `RtcTokenBuilder.buildTokenWithUid` without validation. A non-integer, negative, or out-of-range value could produce a token for an unintended UID.  
**Recommended fix:** `const safeUid = (Number.isInteger(uid) && uid >= 0 && uid <= 0xFFFFFFFF) ? uid : 0;`

---

## MEDIUM

### M2 — player:register trusts client-supplied rating for authenticated sockets

**File:** `server/index.cjs` ~line 356–368  
For authenticated sockets (`socket.user` set), the rating stored in the `players` Map comes from the client payload — not the DB. An authenticated user can advertise rating `{ chess: 3200 }` in the lobby, misleading opponents before a money game. (The real ELO is used for post-game settlement; this only affects display.)  
**Recommended fix:** For authenticated sockets, fetch the DB rating from Prisma at `player:register` time and discard the client-supplied value.

### M3 — socket.id captured at hook mount time in useAgora, stale on reconnect

**File:** `src/hooks/useAgora.ts` line 125  
`socket.id` is read when `initiatePeerConnection` is called. If the socket reconnects between hook mount and token request (via `reconnectWithToken`), the stale socket ID fails Path B's `io.sockets.sockets.has` check, silently failing the video call for guests. Authenticated users are unaffected (Path A uses JWT).  
**Recommended fix:** Read `socket.id` inside the async body just before the `api.agora.token(...)` call, not from a captured closure. Since `socket` is a module-level singleton, `socket.id` at call time is always current.

---

## LOW

### L1 — invite:accept does not verify accepter is the intended recipient

**File:** `server/index.cjs` ~line 638  
The handler checks that the invite exists but does not assert `socket.id === invite.toId`. Any socket that learns an `inviteId` can accept another player's invite and steal their game slot.  
**Recommended fix:** Add `if (invite.toId !== socket.id) { socket.emit('invite:expired'); return; }` before deleting the invite.

### L2 — invite:send has no socket rate limit

**File:** `server/index.cjs` ~line 625  
`invite:send` does not pass through `socketRateLimit`. A connected client can spam invite notifications to any target socket at full speed.  
**Recommended fix:** Add `if (socketRateLimit(socket.id, 10)) return;` at the top of the handler.

### L3 — null-certificate Agora path is reachable in production

**File:** `server/index.cjs` ~line 2543  
When `AGORA_APP_CERTIFICATE` is absent, the endpoint returns `{ token: null }` after passing the full auth check. If the certificate is accidentally unset in production, Agora honors null tokens in no-certificate mode, bypassing token security entirely.  
**Recommended fix:** Add `if (process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'Video not configured' });` before the null-token return.

---

## H1 — Race window (documented, accepted)

Room teardown and Agora token request are on separate async paths. The membership check happens before the Supabase auth call, so a room destroyed during that await still issues a token. Financial risk: zero (Agora channels are separate from bet settlement and room IDs are 128-bit non-reusable). Token TTL: 3600 seconds. Accepted as-is; document in server comments.
