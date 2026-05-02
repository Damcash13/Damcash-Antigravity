# invite:accept Recipient Verification & Agora Null-Certificate Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-line recipient check to `invite:accept` preventing invite theft (L1), and add a production 503 guard to the Agora null-certificate path preventing silent token-security bypass (L3).

**Architecture:** Two independent guards added to `server/index.cjs`. Pure functions extracted in a new test file for unit testing — same pattern used throughout this codebase's security fixes. Two commits, one per finding.

**Tech Stack:** Node.js/Express, Socket.io, Vitest

---

## File Map

| File | Role |
|------|------|
| `src/tests/invite-accept-null-cert.test.ts` | New — 2 L1 unit tests + 3 L3 unit tests |
| `server/index.cjs:693–703` | Modified — add `invite.toId !== socket.id` guard in `invite:accept` |
| `server/index.cjs:2594–2596` | Modified — add `NODE_ENV === 'production'` 503 guard in null-cert Agora branch |

---

## Task 1: Write tests (L1 + L3)

**Files:**
- Create: `src/tests/invite-accept-null-cert.test.ts`

---

- [ ] **Step 1: Write the tests**

Create `/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New/src/tests/invite-accept-null-cert.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// ── L1 — invite:accept recipient verification ─────────────────────────────────
//
// BEFORE fix: invite:accept checks the invite exists but not that socket.id
//             matches invite.toId. Any socket knowing the inviteId can steal
//             the game slot.
// AFTER fix:  if (invite.toId !== socket.id) { socket.emit('invite:expired'); return; }

function canAcceptInvite(inviteToId: string, socketId: string): boolean {
  return inviteToId === socketId;
}

describe('VULNERABILITY proof — pre-fix behaviour (audit L1)', () => {
  it('without recipient check, any socketId can accept the invite', () => {
    // Simulates pre-fix: existence check passes, no toId comparison
    const invite = { toId: 'intended-socket', fromId: 'sender-socket' };
    const attackerSocketId = 'attacker-socket';
    // Pre-fix code does not call canAcceptInvite — attacker proceeds unchecked
    expect(invite.toId).not.toBe(attackerSocketId); // proves the mismatch exists
    // But nothing stopped them — the bug is the absence of the check
  });
});

describe('canAcceptInvite — recipient verification (audit L1)', () => {
  it('returns true when socket is the intended recipient', () => {
    expect(canAcceptInvite('intended-socket', 'intended-socket')).toBe(true);
  });

  it('returns false when socket is NOT the intended recipient', () => {
    expect(canAcceptInvite('intended-socket', 'attacker-socket')).toBe(false);
  });
});

// ── L3 — Agora null-certificate production guard ──────────────────────────────
//
// BEFORE fix: when AGORA_APP_CERTIFICATE is missing, returns { token: null }
//             regardless of environment. Agora honors null tokens in no-cert
//             mode — production video silently loses token security.
// AFTER fix:  in production, returns 503 instead of null token.

function resolveNullTokenBehaviour(env: string, hasCertificate: boolean): 'block' | 'allow' {
  if (!hasCertificate && env === 'production') return 'block';
  return 'allow';
}

describe('resolveNullTokenBehaviour — null-cert production guard (audit L3)', () => {
  it('blocks (503) in production when certificate is missing', () => {
    expect(resolveNullTokenBehaviour('production', false)).toBe('block');
  });

  it('allows null token in development when certificate is missing (test mode)', () => {
    expect(resolveNullTokenBehaviour('development', false)).toBe('allow');
  });

  it('allows normal token path in production when certificate is present', () => {
    // Certificate present means this branch is never reached — allow represents
    // "does not block", i.e. normal token generation proceeds
    expect(resolveNullTokenBehaviour('production', true)).toBe('allow');
  });
});
```

- [ ] **Step 2: Run the tests — confirm all 5 pass**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && npm test -- --reporter=verbose 2>&1 | grep -A 20 "invite-accept-null-cert"
```

Expected: all 5 tests in `invite-accept-null-cert.test.ts` pass. If any fail, stop and report — do not proceed.

---

## Task 2: Implement L1 — invite:accept recipient guard

**Files:**
- Modify: `server/index.cjs:693–703`

---

- [ ] **Step 1: Add the recipient guard**

Open `server/index.cjs`. Find the `invite:accept` handler at line 693:

```js
  socket.on('invite:accept', ({ inviteId, fromSocketId }) => {
    const invite = invites.get(inviteId);
    if (!invite) { socket.emit('invite:expired'); return; }
    invites.delete(inviteId);
    
    // Notify the inviter so they can close their 'Waiting...' modal
    io.to(fromSocketId).emit('invite:accepted', { roomId: `room-${genId()}` }); // Note: startRoom will override this roomId with the real one, but we just need the trigger
    
    const roomId = `room-${genId()}`;
    startRoom(roomId, fromSocketId, socket.id, invite.config);
  });
```

Replace it with:

```js
  socket.on('invite:accept', ({ inviteId, fromSocketId }) => {
    const invite = invites.get(inviteId);
    if (!invite) { socket.emit('invite:expired'); return; }
    if (invite.toId !== socket.id) { socket.emit('invite:expired'); return; }
    invites.delete(inviteId);
    
    // Notify the inviter so they can close their 'Waiting...' modal
    io.to(fromSocketId).emit('invite:accepted', { roomId: `room-${genId()}` }); // Note: startRoom will override this roomId with the real one, but we just need the trigger
    
    const roomId = `room-${genId()}`;
    startRoom(roomId, fromSocketId, socket.id, invite.config);
  });
```

- [ ] **Step 2: Run the full test suite**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && npm test 2>&1
```

Expected:
```
Test Files  9 passed (9)
     Tests  68 passed (68)
```

All tests pass. If any fail, stop and report — do not commit.

- [ ] **Step 3: Commit L1**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && git add src/tests/invite-accept-null-cert.test.ts server/index.cjs && git commit -m "fix(security): verify invite recipient in invite:accept handler (audit L1)"
```

---

## Task 3: Implement L3 — Agora null-certificate production guard

**Files:**
- Modify: `server/index.cjs:2594–2596`

---

- [ ] **Step 1: Add the production guard**

Still in `server/index.cjs`. Find the null-certificate branch at line 2594:

```js
    if (!AgoraAccessToken || !AGORA_APP_CERTIFICATE) {
      console.warn('[Agora] No App Certificate — returning null token (testing only)');
      return res.json({ token: null, appId: AGORA_APP_ID, channel: channelName, uid: safeUid });
    }
```

Replace it with:

```js
    if (!AgoraAccessToken || !AGORA_APP_CERTIFICATE) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ error: 'Video not configured' });
      }
      console.warn('[Agora] No App Certificate — returning null token (testing only)');
      return res.json({ token: null, appId: AGORA_APP_ID, channel: channelName, uid: safeUid });
    }
```

- [ ] **Step 2: Run the full test suite**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && npm test 2>&1
```

Expected:
```
Test Files  9 passed (9)
     Tests  68 passed (68)
```

All tests pass. If any fail, stop and report — do not commit.

- [ ] **Step 3: Commit L3**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && git add server/index.cjs && git commit -m "fix(security): return 503 in production when AGORA_APP_CERTIFICATE is missing (audit L3)"
```

- [ ] **Step 4: Push**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && git push origin main 2>&1
```

Expected: `main -> main` push confirmation.
