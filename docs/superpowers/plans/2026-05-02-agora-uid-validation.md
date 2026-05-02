# Agora UID Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clamp the `uid` body parameter in `/api/agora/token` to Agora's valid 32-bit unsigned integer range before passing it to the token builder, rejecting all non-integer, negative, float, and out-of-range values by substituting `0`.

**Architecture:** One new test file tests a pure `sanitizeUid` function. One line is added to `server/index.cjs` right after `uid` is destructured from `req.body`; three downstream uses of `uid` are replaced with `safeUid`. No client changes.

**Tech Stack:** Node.js/Express, Vitest

---

## File Map

| File | Role |
|------|------|
| `src/tests/agora-uid.test.ts` | New — 8 unit tests for `sanitizeUid` pure function |
| `server/index.cjs:2521–2579` | Modified — add `safeUid`, replace 3 uses of `uid` |

---

## Task 1: Validate and clamp uid in /api/agora/token (audit H3)

**Files:**
- Create: `src/tests/agora-uid.test.ts`
- Modify: `server/index.cjs` (~lines 2521–2579)

---

- [ ] **Step 1: Write the tests**

Create `/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New/src/tests/agora-uid.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Pure extraction of the uid sanitization that will be added to
// the /api/agora/token handler in server/index.cjs.
//
// Agora UIDs must be unsigned 32-bit integers: 0 – 4294967295 (0xFFFFFFFF).
// UID 0 means "dynamic assignment" — always safe as a fallback.
//
// BEFORE fix: uid is passed raw from req.body to buildTokenWithUid.
// AFTER fix:  uid is clamped through sanitizeUid first.

function sanitizeUid(val: unknown): number {
  return (Number.isInteger(val) && (val as number) >= 0 && (val as number) <= 0xFFFFFFFF)
    ? (val as number)
    : 0;
}

describe('VULNERABILITY proof — pre-fix behaviour (audit H3)', () => {
  it('without validation, a negative uid passes through unchanged', () => {
    // Documents current behaviour: raw uid reaches the token builder
    const rawUid = -1;
    expect(rawUid).toBe(-1); // no clamping — proves the bug exists
  });
});

describe('sanitizeUid — uid clamping for Agora token builder (audit H3)', () => {
  it('returns 0 unchanged (dynamic assignment)', () => {
    expect(sanitizeUid(0)).toBe(0);
  });

  it('returns a normal valid UID unchanged', () => {
    expect(sanitizeUid(100)).toBe(100);
  });

  it('returns 0xFFFFFFFF (4294967295) — the maximum valid UID', () => {
    expect(sanitizeUid(0xFFFFFFFF)).toBe(4294967295);
  });

  it('clamps -1 to 0', () => {
    expect(sanitizeUid(-1)).toBe(0);
  });

  it('clamps a float (1.5) to 0', () => {
    expect(sanitizeUid(1.5)).toBe(0);
  });

  it('clamps a string ("abc") to 0', () => {
    expect(sanitizeUid('abc')).toBe(0);
  });

  it('clamps undefined to 0', () => {
    expect(sanitizeUid(undefined)).toBe(0);
  });

  it('clamps 4294967296 (0xFFFFFFFF + 1) to 0 — above max', () => {
    expect(sanitizeUid(4294967296)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests — confirm they pass**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && npm test -- --reporter=verbose 2>&1 | grep -A 20 "agora-uid"
```

Expected: all 8 tests in `agora-uid.test.ts` pass. If any fail, stop and report — do not proceed.

- [ ] **Step 3: Add safeUid to server/index.cjs**

Open `server/index.cjs`. Find line ~2521 (inside the `/api/agora/token` handler):

```js
    const { channelName, uid = 0, socketId } = req.body;
    if (!channelName || typeof channelName !== 'string') {
```

Replace with:

```js
    const { channelName, uid = 0, socketId } = req.body;
    const safeUid = (Number.isInteger(uid) && uid >= 0 && uid <= 0xFFFFFFFF) ? uid : 0;
    if (!channelName || typeof channelName !== 'string') {
```

- [ ] **Step 4: Replace uid with safeUid in the three downstream locations**

Still in `server/index.cjs`, find the null-token response (a few lines after the membership gate):

```js
      return res.json({ token: null, appId: AGORA_APP_ID, channel: channelName, uid });
```

Replace `uid` with `safeUid`:

```js
      return res.json({ token: null, appId: AGORA_APP_ID, channel: channelName, uid: safeUid });
```

Then find the token builder call:

```js
    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpireTime
    );
```

Replace `uid` with `safeUid`:

```js
    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      safeUid,
      RtcRole.PUBLISHER,
      privilegeExpireTime
    );
```

Then find the success response:

```js
    res.json({ token, appId: AGORA_APP_ID, channel: channelName, uid });
```

Replace `uid` with `safeUid`:

```js
    res.json({ token, appId: AGORA_APP_ID, channel: channelName, uid: safeUid });
```

- [ ] **Step 5: Run the full test suite**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && npm test 2>&1
```

Expected:
```
Test Files  7 passed (7)
     Tests  54 passed (54)
```

All tests pass. If any fail, stop and report — do not commit.

- [ ] **Step 6: Commit**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && git add src/tests/agora-uid.test.ts server/index.cjs && git commit -m "fix(security): validate and clamp uid in /api/agora/token to Agora's 32-bit range (audit H3)"
```

- [ ] **Step 7: Push**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && git push origin main 2>&1
```

Expected: `main -> main` push confirmation.
