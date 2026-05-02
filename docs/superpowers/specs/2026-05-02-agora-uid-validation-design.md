# Agora UID Validation — Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate and clamp the `uid` parameter in `/api/agora/token` before passing it to the Agora token builder, preventing malformed UID values from producing tokens for unintended channel participants.

**Audit finding addressed:**
- H3 HIGH — `uid` is destructured from `req.body` and passed directly to `RtcTokenBuilder.buildTokenWithUid` with no type or range check.

**Architecture:** One line added to `server/index.cjs` inside the `/api/agora/token` handler, plus three substitutions of `uid` → `safeUid`. New pure-function test file.

**Tech Stack:** Node.js/Express, Vitest

---

## The vulnerability

`server/index.cjs` line 2521:
```js
const { channelName, uid = 0, socketId } = req.body;
```

`uid` is then passed unvalidated to:
- `RtcTokenBuilder.buildTokenWithUid(..., uid, ...)` — the token builder (line 2574)
- Both `res.json(...)` responses (lines 2562, 2579)

Agora UIDs must be unsigned 32-bit integers (0–4294967295). A caller supplying `-1`, `1.5`, `"evil"`, or `9999999999` may cause the SDK to coerce the value silently, producing a token scoped to an unintended UID.

---

## The fix

**One line added immediately after destructuring (line 2522):**
```js
const safeUid = (Number.isInteger(uid) && uid >= 0 && uid <= 0xFFFFFFFF) ? uid : 0;
```

**Three substitutions — `uid` → `safeUid` in the handler body:**

| Location | Before | After |
|----------|--------|-------|
| Null-token path response (~line 2562) | `uid` | `safeUid` |
| `buildTokenWithUid` call (~line 2574) | `uid` | `safeUid` |
| Success response (~line 2579) | `uid` | `safeUid` |

**Why `0` as fallback:** Agora treats UID 0 as dynamic assignment — the server assigns a unique ID per join. It is always safe and leaks no information about the validation failure.

---

## Testing

Pure function extracted in `src/tests/agora-uid.test.ts`:

```ts
function sanitizeUid(val: unknown): number {
  return (Number.isInteger(val) && (val as number) >= 0 && (val as number) <= 0xFFFFFFFF)
    ? (val as number)
    : 0;
}
```

Test cases:
- `0` → `0` (zero is valid)
- `100` → `100` (normal valid UID)
- `0xFFFFFFFF` (4294967295) → `4294967295` (max valid)
- `-1` → `0` (negative rejected)
- `1.5` → `0` (float rejected)
- `"abc"` → `0` (string rejected)
- `undefined` → `0` (missing rejected)
- `4294967296` (0xFFFFFFFF + 1) → `0` (above max rejected)

---

## Files changed

| File | Change |
|------|--------|
| `server/index.cjs` | 1 line added + 3 substitutions inside `/api/agora/token` handler |
| `src/tests/agora-uid.test.ts` | New: 8 unit tests for `sanitizeUid` |

## Commit

`fix(security): validate and clamp uid in /api/agora/token to Agora's 32-bit range (audit H3)`
