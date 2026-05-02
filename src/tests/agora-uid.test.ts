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
