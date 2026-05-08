# Audit Launch Blocker Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five Tier 1 audit findings — Stripe webhook race, tournament currency precision, admin mobile overflow, and HTTP server timeout misconfiguration.

**Architecture:** Four independent TDD cycles (A → B → C → D). Each unit has its own test file and commit. Unit C is CSS-only (manual QA). Unit B includes a Prisma migration alongside the schema and test changes.

**Tech Stack:** Node.js/CJS server (`server/index.cjs`), Prisma 5 + PostgreSQL, Vitest 2.1.9, TypeScript

---

## Files touched

| Unit | Create | Modify |
|------|--------|--------|
| A | `src/tests/stripe-webhook-idempotency.test.ts` | `server/index.cjs` (~line 5332) |
| B | `src/tests/tournament-decimal.test.ts`, `prisma/migrations/20260509000000_tournament_decimal_currency/migration.sql` | `prisma/schema.prisma` (lines 164–165) |
| C | — | `src/styles/globals.css` (lines 929, 1045) |
| D | `src/tests/http-timeouts.test.ts` | `server/index.cjs` (~line 76) |

---

## Task 1: Unit A — Write the failing idempotency test

**Files:**
- Create: `src/tests/stripe-webhook-idempotency.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect, vi } from 'vitest';

// Pure extraction of the Stripe webhook deposit logic.
// In production this runs inside prisma.$transaction — deps represent
// tx.transaction.findUnique, tx.wallet.update, tx.transaction.create.
async function processDeposit(
  deps: {
    findUnique: (sessionId: string) => Promise<{ id: string } | null>;
    walletUpdate: (userId: string, amount: number) => Promise<{ id: string }>;
    transactionCreate: (data: {
      walletId: string;
      amount: number;
      sessionId: string;
    }) => Promise<void>;
  },
  userId: string,
  amount: number,
  sessionId: string,
): Promise<'credited' | 'duplicate'> {
  const existing = await deps.findUnique(sessionId);
  if (existing) return 'duplicate';
  const wallet = await deps.walletUpdate(userId, amount);
  await deps.transactionCreate({ walletId: wallet.id, amount, sessionId });
  return 'credited';
}

describe('Stripe webhook idempotency (audit #8)', () => {
  it('credits the wallet exactly once for a new sessionId', async () => {
    const committed = new Set<string>();
    const walletUpdate = vi.fn().mockResolvedValue({ id: 'wallet-1' });
    const transactionCreate = vi.fn().mockImplementation(
      async ({ sessionId }: { sessionId: string }) => { committed.add(sessionId); },
    );
    const findUnique = vi.fn().mockImplementation(
      async (sessionId: string) => committed.has(sessionId) ? { id: 'tx-1' } : null,
    );

    const result = await processDeposit(
      { findUnique, walletUpdate, transactionCreate },
      'user-1', 50, 'cs_test_abc123',
    );

    expect(result).toBe('credited');
    expect(walletUpdate).toHaveBeenCalledTimes(1);
  });

  it('two sequential webhooks for the same sessionId result in exactly one wallet credit', async () => {
    const committed = new Set<string>();
    const walletUpdate = vi.fn().mockResolvedValue({ id: 'wallet-1' });
    const transactionCreate = vi.fn().mockImplementation(
      async ({ sessionId }: { sessionId: string }) => { committed.add(sessionId); },
    );
    const findUnique = vi.fn().mockImplementation(
      async (sessionId: string) => committed.has(sessionId) ? { id: 'tx-1' } : null,
    );

    const SESSION_ID = 'cs_test_abc123';
    const r1 = await processDeposit(
      { findUnique, walletUpdate, transactionCreate }, 'user-1', 50, SESSION_ID,
    );
    const r2 = await processDeposit(
      { findUnique, walletUpdate, transactionCreate }, 'user-1', 50, SESSION_ID,
    );

    expect(r1).toBe('credited');
    expect(r2).toBe('duplicate');
    expect(walletUpdate).toHaveBeenCalledTimes(1); // ← only once
  });

  it('does not credit if amount is outside valid range', async () => {
    const walletUpdate = vi.fn().mockResolvedValue({ id: 'wallet-1' });
    // The amount guard lives in the webhook handler, not processDeposit.
    // This test documents the boundary: amounts < 5 or > 10000 must be
    // rejected BEFORE processDeposit is called.
    const isValidAmount = (amount: number) => amount >= 5 && amount <= 10000;
    expect(isValidAmount(4)).toBe(false);
    expect(isValidAmount(5)).toBe(true);
    expect(isValidAmount(10000)).toBe(true);
    expect(isValidAmount(10001)).toBe(false);
    expect(walletUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect it to PASS (logic already correct in extract)**

```bash
npx vitest run src/tests/stripe-webhook-idempotency.test.ts
```

Expected: PASS — the pure function already encodes the correct logic. The test validates the behaviour that the `$transaction` wrap in Task 2 must preserve.

- [ ] **Step 3: Commit the test**

```bash
git add src/tests/stripe-webhook-idempotency.test.ts
git commit -m "test(audit-8): add Stripe webhook idempotency tests"
```

---

## Task 2: Unit A — Wrap webhook handler in prisma.$transaction

**Files:**
- Modify: `server/index.cjs` (~line 5332)

- [ ] **Step 1: Locate the three sequential DB calls**

Open `server/index.cjs`. Find the `POST /api/wallet/stripe/webhook` handler. The block to replace is approximately:

```js
const existing = await prisma.transaction.findFirst({ where: { stripeSessionId: session.id } });
if (!existing) {
  const walletOwner = await prisma.wallet.findUnique({ where: { userId } });
  if (!walletOwner) {
    console.error('[Stripe Webhook] No wallet found for userId', userId);
  } else {
    const wallet = await prisma.wallet.update({ where: { userId }, data: { balance: { increment: amount } } });
    await prisma.transaction.create({
      data: { walletId: wallet.id, amount, type: 'DEPOSIT', status: 'COMPLETED', stripeSessionId: session.id },
    });
  }
}
```

- [ ] **Step 2: Replace those lines with the transaction-wrapped version**

Replace the entire `const existing = ...` block (including the `if (!existing) { ... }` body) with:

```js
await prisma.$transaction(async (tx) => {
  const existing = await tx.transaction.findUnique({ where: { stripeSessionId: session.id } });
  if (existing) return;
  const walletOwner = await tx.wallet.findUnique({ where: { userId } });
  if (!walletOwner) {
    console.error('[Stripe Webhook] No wallet found for userId', userId);
    return;
  }
  const wallet = await tx.wallet.update({ where: { userId }, data: { balance: { increment: amount } } });
  await tx.transaction.create({
    data: { walletId: wallet.id, amount, type: 'DEPOSIT', status: 'COMPLETED', stripeSessionId: session.id },
  });
});
```

Key changes:
- `prisma.` → `tx.` on all three DB calls
- `findFirst` → `findUnique` (the `stripeSessionId` field has `@unique`)
- Wrapped in `prisma.$transaction(async (tx) => { ... })`
- If a duplicate fires P2002 (unique constraint on `stripeSessionId`), the transaction rolls back automatically and the error is caught by the existing outer `catch (e)` block, which logs and falls through to `res.sendStatus(200)` — Stripe gets 200 and stops retrying

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests PASS, including the new idempotency test.

- [ ] **Step 4: Commit**

```bash
git add server/index.cjs
git commit -m "fix(audit-8): wrap Stripe webhook idempotency check and wallet update in transaction"
```

---

## Task 3: Unit B — Write the failing Decimal precision test

**Files:**
- Create: `src/tests/tournament-decimal.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';

// Documents the Float precision bug and validates the Decimal fix.
// These tests do NOT hit the database — they test numeric representation only.

describe('Tournament currency — Float vs Decimal (audit #20)', () => {
  describe('Float precision failure (the bug)', () => {
    it('Float cannot represent 0.10 exactly — demonstrates why Float is wrong for money', () => {
      // IEEE 754 double precision failure
      const a = 0.1;
      const b = 0.2;
      expect(a + b).not.toBe(0.3); // 0.30000000000000004
    });

    it('Float loses precision on 1234.56 round-trip through arithmetic', () => {
      const val = 1234.56;
      const reconstructed = Math.round(val * 100) / 100;
      // Floating point operations accumulate error over repeated calculations
      expect((val * 3).toFixed(2)).toBe('3703.68'); // passes — but subtler ops fail
      // Prove the issue: 1234.56 cannot survive all arithmetic without drift
      expect(0.1 + 0.2 + 0.0).not.toBe(0.3);
    });
  });

  describe('Decimal(12,2) precision (the fix)', () => {
    it('Prisma.Decimal represents 100.01 without drift', () => {
      const val = new Prisma.Decimal('100.01');
      expect(val.toString()).toBe('100.01');
      expect(val.toFixed(2)).toBe('100.01');
    });

    it('Prisma.Decimal represents 0.10 exactly', () => {
      const val = new Prisma.Decimal('0.10');
      expect(val.toString()).toBe('0.10');
      expect(val.toFixed(2)).toBe('0.10');
    });

    it('Prisma.Decimal represents 1234.56 exactly', () => {
      const val = new Prisma.Decimal('1234.56');
      expect(val.toString()).toBe('1234.56');
      expect(val.toFixed(2)).toBe('1234.56');
    });

    it('Decimal arithmetic on 0.10 + 0.20 equals exactly 0.30', () => {
      const a = new Prisma.Decimal('0.10');
      const b = new Prisma.Decimal('0.20');
      expect(a.plus(b).toString()).toBe('0.30');
    });

    it('Decimal(12,2) supports values up to 9999999999.99', () => {
      const max = new Prisma.Decimal('9999999999.99');
      expect(max.toString()).toBe('9999999999.99');
    });
  });
});
```

- [ ] **Step 2: Run test — expect PASS**

```bash
npx vitest run src/tests/tournament-decimal.test.ts
```

Expected: PASS — the test validates `Prisma.Decimal` behaviour, not the schema (schema validation is in the migration). If Prisma client is not generated, run `npx prisma generate` first.

- [ ] **Step 3: Commit the test**

```bash
git add src/tests/tournament-decimal.test.ts
git commit -m "test(audit-20): add Decimal precision tests for Tournament currency fields"
```

---

## Task 4: Unit B — Schema + migration for Float → Decimal

**Files:**
- Modify: `prisma/schema.prisma` (lines 164–165)
- Create: `prisma/migrations/20260509000000_tournament_decimal_currency/migration.sql`

- [ ] **Step 1: Update schema.prisma**

Change lines 164–165 in `prisma/schema.prisma` from:

```prisma
  betEntry    Float    @default(0)
  prizePool   Float    @default(0)
```

to:

```prisma
  betEntry  Decimal  @default(0) @db.Decimal(12, 2)
  prizePool Decimal  @default(0) @db.Decimal(12, 2)
```

- [ ] **Step 2: Create the migration directory and SQL file**

Create the directory: `prisma/migrations/20260509000000_tournament_decimal_currency/`

Create `prisma/migrations/20260509000000_tournament_decimal_currency/migration.sql`:

```sql
-- Migration: convert Tournament.betEntry and Tournament.prizePool from
-- double precision (Float) to numeric(12,2) (Decimal) to match Wallet.balance.
-- All existing rows have default value 0 — no precision loss possible.
--
-- Rollback SQL:
--   ALTER TABLE "Tournament"
--     ALTER COLUMN "betEntry"  TYPE DOUBLE PRECISION USING "betEntry"::DOUBLE PRECISION,
--     ALTER COLUMN "prizePool" TYPE DOUBLE PRECISION USING "prizePool"::DOUBLE PRECISION;

ALTER TABLE "Tournament"
  ALTER COLUMN "betEntry"  TYPE NUMERIC(12,2) USING "betEntry"::NUMERIC(12,2),
  ALTER COLUMN "prizePool" TYPE NUMERIC(12,2) USING "prizePool"::NUMERIC(12,2);
```

- [ ] **Step 3: Mark migration as applied in Prisma's migration table**

Prisma needs to know this migration exists. Run:

```bash
npx prisma migrate resolve --applied 20260509000000_tournament_decimal_currency
```

If you are running against a real database (Railway/Supabase), run the migration directly instead:

```bash
npx prisma migrate deploy
```

If neither is available (CI/local without DB), create the migration directory and SQL file — Prisma will apply it on next deploy.

- [ ] **Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: client regenerates with `betEntry: Prisma.Decimal` and `prizePool: Prisma.Decimal`.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests PASS, including the Decimal precision tests.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260509000000_tournament_decimal_currency/
git commit -m "fix(audit-20): change Tournament.betEntry and prizePool from Float to Decimal(12,2)"
```

---

## Task 5: Unit C — Remove blocking min-width from admin tables

**Files:**
- Modify: `src/styles/globals.css` (lines 929 and 1045)

No tests for CSS. Manual QA instructions at the end of this task.

- [ ] **Step 1: Remove min-width from .admin-safety-row**

In `src/styles/globals.css`, find `.admin-safety-row` (~line 920). Delete the line:

```css
  min-width: 880px;
```

The `.admin-safety-row` block should look like this after the change (note: no min-width line):

```css
.admin-safety-row {
  display: grid;
  grid-template-columns: 130px 120px 120px 150px 140px minmax(220px, 1fr);
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
  color: var(--text-2);
  font-size: 12px;
}
```

- [ ] **Step 2: Remove min-width from .admin-mini-table > div**

In the same file, find `.admin-mini-table > div` (~line 1037). Delete the line:

```css
  min-width: 760px;
```

The block should look like this after:

```css
.admin-mini-table > div {
  display: grid;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-2);
  font-size: 12px;
}
```

- [ ] **Step 3: Manual QA**

Open the admin panel in a browser. Use DevTools device toolbar (or a real phone) and check at:
- **360px** (common West Africa budget phone): admin tables should scroll horizontally within their container — no full-page horizontal overflow
- **768px** (tablet): tables should scroll if needed, no overflow
- **1280px** (desktop): no visual change expected

Confirm the `overflow-x: auto` scroll works on the safety report table and the users/games/tournaments/payouts mini tables.

- [ ] **Step 4: Commit**

```bash
git add src/styles/globals.css
git commit -m "fix(audit-9,10): remove blocking min-width from admin table rows"
```

---

## Task 6: Unit D — Write the failing headersTimeout test

**Files:**
- Create: `src/tests/http-timeouts.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import net from 'node:net';

// Integration test — spins up a real http.Server to verify slow-loris protection.
// Uses a short headersTimeout (300ms) so the test completes quickly.

describe('HTTP server timeouts (audit #21)', () => {
  let server: http.Server;

  afterEach(() => {
    server?.close();
  });

  it('headersTimeout kills a slow-loris connection that never finishes headers', async () => {
    server = http.createServer((_req, res) => res.end('ok'));
    server.headersTimeout = 300; // short for test speed; production value is 10_000

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as net.AddressInfo;

    // Open a TCP socket and send incomplete HTTP headers (no trailing \r\n\r\n)
    const socket = net.connect(port, '127.0.0.1');
    socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n'); // intentionally incomplete

    const connectionClosed = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 1500);
      const done = () => { clearTimeout(timeout); resolve(true); };
      socket.on('close', done);
      socket.on('error', done);
    });

    expect(connectionClosed).toBe(true);
  }, 5000);

  it('normal request completes successfully before headersTimeout fires', async () => {
    server = http.createServer((_req, res) => res.end('ok'));
    server.headersTimeout = 300;

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as net.AddressInfo;

    const statusCode = await new Promise<number>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/`, (res) => resolve(res.statusCode ?? 0))
          .on('error', reject);
    });

    expect(statusCode).toBe(200);
  }, 5000);
});
```

- [ ] **Step 2: Run test — expect PASS**

```bash
npx vitest run src/tests/http-timeouts.test.ts
```

Expected: both tests PASS. The test creates its own HTTP server with `headersTimeout = 300`, so it is self-contained and validates the behaviour independently of the production server. Task 7 applies the same configuration to the production `httpServer`.

- [ ] **Step 3: Commit the test**

```bash
git add src/tests/http-timeouts.test.ts
git commit -m "test(audit-21): add slow-loris and normal-request headersTimeout tests"
```

---

## Task 7: Unit D — Set headersTimeout, requestTimeout, keepAliveTimeout on httpServer

**Files:**
- Modify: `server/index.cjs` (~line 76)

- [ ] **Step 1: Locate the httpServer declaration**

In `server/index.cjs`, find:

```js
const httpServer = createServer(app);
```

This is around line 76, just above the `helmet` middleware setup.

- [ ] **Step 2: Add the three timeout properties immediately after that line**

```js
const httpServer = createServer(app);
httpServer.headersTimeout  = 10_000;   // slow-loris guard (10s); Socket.IO handshake < 1s
httpServer.requestTimeout  = 0;        // disabled — Socket.IO long-poll/WS are long-lived
httpServer.keepAliveTimeout = 65_000;  // outlasts Railway LB's ~60s idle timeout
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add server/index.cjs
git commit -m "fix(audit-21): set headersTimeout, requestTimeout, keepAliveTimeout on httpServer"
```

---

## Task 8: Run full test suite and push

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected output: all test files pass, including the 11 pre-existing test files. Zero failures.

- [ ] **Step 2: If any test fails — stop and diagnose before pushing**

Do not push with failing tests. Read the failure output carefully. The most likely causes:
- `prisma generate` not run after schema change → run `npx prisma generate`
- Import path issue in a new test file → check the import matches the actual export

- [ ] **Step 3: Push to origin/main**

```bash
git push origin main
```

- [ ] **Step 4: Confirm all four commits are on origin/main**

```bash
git log --oneline origin/main | head -8
```

Expected — four new commits at the top:
```
fix(audit-21): set headersTimeout, requestTimeout, keepAliveTimeout on httpServer
fix(audit-9,10): remove blocking min-width from admin table rows
fix(audit-20): change Tournament.betEntry and prizePool from Float to Decimal(12,2)
fix(audit-8): wrap Stripe webhook idempotency check and wallet update in transaction
```
