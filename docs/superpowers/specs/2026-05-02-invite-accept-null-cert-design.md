# invite:accept Recipient Verification & Agora Null-Certificate Guard — Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix L1 — any socket that learns an inviteId can steal another player's game slot; fix L3 — a missing AGORA_APP_CERTIFICATE in production silently returns null tokens, bypassing video security.

**Audit findings addressed:**
- L1 LOW — `invite:accept` checks the invite exists but not that `socket.id === invite.toId`, allowing invite theft
- L3 LOW — null-certificate Agora path returns `{ token: null }` regardless of environment; Agora honors null tokens in no-certificate mode

**Architecture:** Two independent one-line/two-line guards added to `server/index.cjs`. One new test file with pure-function tests for both findings.

**Tech Stack:** Node.js/Express, Socket.io, Vitest

---

## Finding L1 — invite:accept recipient verification

### The vulnerability

`server/index.cjs` line 693:

```js
socket.on('invite:accept', ({ inviteId, fromSocketId }) => {
  const invite = invites.get(inviteId);
  if (!invite) { socket.emit('invite:expired'); return; }
  invites.delete(inviteId);
  // ... starts room immediately
```

The handler verifies the invite exists but not that the accepting socket is the intended recipient (`invite.toId`). Any socket that learns an `inviteId` — via network sniffing, log leakage, or guessing — can accept the invite and join the game in place of the real target.

### The fix

One guard added immediately after the existence check:

```js
socket.on('invite:accept', ({ inviteId, fromSocketId }) => {
  const invite = invites.get(inviteId);
  if (!invite) { socket.emit('invite:expired'); return; }
  if (invite.toId !== socket.id) { socket.emit('invite:expired'); return; }
  invites.delete(inviteId);
  // ... rest unchanged
```

**Why `invite:expired` and not a specific error:** Using the same response for "not found" and "wrong recipient" gives no information to an attacker about whether the invite exists or who it's for.

### Pure function for testing

```ts
function canAcceptInvite(inviteToId: string, socketId: string): boolean {
  return inviteToId === socketId;
}
```

### Test cases

- Correct recipient (`inviteToId === socketId`) → true
- Wrong socket (`inviteToId !== socketId`) → false

---

## Finding L3 — null-certificate Agora path in production

### The vulnerability

`server/index.cjs` line 2594:

```js
if (!AgoraAccessToken || !AGORA_APP_CERTIFICATE) {
  console.warn('[Agora] No App Certificate — returning null token (testing only)');
  return res.json({ token: null, appId: AGORA_APP_ID, channel: channelName, uid: safeUid });
}
```

If `AGORA_APP_CERTIFICATE` is accidentally unset in production (env var drop during a redeploy, for example), the endpoint passes the full auth and membership gate, then returns `{ token: null }`. Agora honors null tokens in no-certificate mode — video works but with zero token security. The auth gate passed, so an attacker in a valid room gets an unchecked token.

### The fix

One production guard inside the branch, before the null-token return:

```js
if (!AgoraAccessToken || !AGORA_APP_CERTIFICATE) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(503).json({ error: 'Video not configured' });
  }
  console.warn('[Agora] No App Certificate — returning null token (testing only)');
  return res.json({ token: null, appId: AGORA_APP_ID, channel: channelName, uid: safeUid });
}
```

**Effect:** Dev/test behavior unchanged. In production, a missing certificate fails loudly with 503 rather than silently degrading to no-token mode.

### Pure function for testing

```ts
function resolveNullTokenBehaviour(env: string, hasCertificate: boolean): 'block' | 'allow' {
  if (!hasCertificate && env === 'production') return 'block';
  return 'allow';
}
```

### Test cases

- Production + no certificate → `'block'` (503)
- Development + no certificate → `'allow'` (null token returned, test mode)
- Production + certificate present → `'allow'` (normal token path, never reaches this branch)

---

## Files changed

| File | Change |
|------|--------|
| `server/index.cjs` | L1: one guard in `invite:accept` handler; L3: production guard in null-cert Agora branch |
| `src/tests/invite-accept-null-cert.test.ts` | New: 2 L1 tests + 3 L3 tests |

## Commits (one per finding)

1. `fix(security): verify invite recipient in invite:accept handler (audit L1)`
2. `fix(security): return 503 in production when AGORA_APP_CERTIFICATE is missing (audit L3)`
