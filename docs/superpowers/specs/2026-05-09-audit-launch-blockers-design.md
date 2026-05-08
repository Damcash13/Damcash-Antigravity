# Tier 1 Launch Blocker Fixes — Design Spec

**Date:** 2026-05-09  
**Audit findings addressed:** #8, #9, #10, #20, #21  
**Status:** Approved, ready for implementation

---

## Scope

Four independent fix units derived from the non-security audit. Each is self-contained and has no cross-unit dependencies. Order of implementation: A → B → C → D.

Do NOT touch any other audit findings in this session.

---

## Unit A — Stripe webhook idempotency race (#8)

**File:** `server/index.cjs` — the `POST /api/wallet/stripe/webhook` handler (~line 5312)

**Problem:** The idempotency check (`findFirst`) and the two wallet writes (`wallet.update` + `transaction.create`) are three separate sequential awaits. Two concurrent Stripe webhook deliveries for the same `checkout.session.completed` event can both pass the `findFirst` guard before either has written, resulting in a double wallet credit.

**Fix:** Wrap all three operations in `prisma.$transaction(async (tx) => { ... })`. Inside the transaction, upgrade `findFirst` to `findUnique` on the unique `stripeSessionId` field (faster and semantically correct). P2002 (unique constraint violation on `stripeSessionId`) will bubble out of the transaction and be caught by the existing outer `catch (e)` block, which logs and returns 200 — silently swallowing the duplicate and preventing Stripe from retrying indefinitely.

**Implementation:**

Replace the three sequential awaits with:

```js
await prisma.$transaction(async (tx) => {
  const existing = await tx.transaction.findUnique({
    where: { stripeSessionId: session.id },
  });
  if (existing) return;
  const wallet = await tx.wallet.update({
    where: { userId },
    data: { balance: { increment: amount } },
  });
  await tx.transaction.create({
    data: {
      walletId: wallet.id,
      amount,
      type: 'DEPOSIT',
      status: 'COMPLETED',
      stripeSessionId: session.id,
    },
  });
});
```

**Test:** Two simultaneous webhook calls for the same `stripeSessionId` result in exactly one wallet credit and exactly one `Transaction` row.

---

## Unit B — Tournament currency precision (#20)

**File:** `prisma/schema.prisma` lines 164–165; new Prisma migration

**Problem:** `Tournament.betEntry` and `Tournament.prizePool` are typed `Float` (PostgreSQL `double precision`). All other money fields use `Decimal @db.Decimal(12, 2)`: `Wallet.balance`, `Transaction.amount`, `Match.betAmount`. Float arithmetic introduces precision loss at scale (e.g. `0.10 + 0.20 ≠ 0.30`).

**Fix:** Change both fields to `Decimal @db.Decimal(12, 2)` in the schema and write a Prisma migration.

**Schema change:**
```prisma
betEntry  Decimal  @default(0) @db.Decimal(12, 2)
prizePool Decimal  @default(0) @db.Decimal(12, 2)
```

**Migration SQL (forward):**
```sql
ALTER TABLE "Tournament"
  ALTER COLUMN "betEntry"  TYPE NUMERIC(12,2) USING "betEntry"::NUMERIC(12,2),
  ALTER COLUMN "prizePool" TYPE NUMERIC(12,2) USING "prizePool"::NUMERIC(12,2);
```

**Rollback SQL:**
```sql
ALTER TABLE "Tournament"
  ALTER COLUMN "betEntry"  TYPE DOUBLE PRECISION USING "betEntry"::DOUBLE PRECISION,
  ALTER COLUMN "prizePool" TYPE DOUBLE PRECISION USING "prizePool"::DOUBLE PRECISION;
```

**Data safety:** All existing rows have default value `0`; no precision loss possible. PostgreSQL handles the `double precision → numeric(12,2)` cast automatically via the `USING` clause.

**Tests:** `betEntry` and `prizePool` values `100.01`, `0.10`, `1234.56` round-trip cleanly through Prisma without floating-point drift. Verify by reading back the stored value and asserting exact equality.

---

## Unit C — Admin table mobile overflow (#9, #10)

**File:** `src/styles/globals.css` lines 929 and 1045

**Clarification on audit:** The audit named the offending classes as `game-room-layout` and `lobby-room-layout`, but the actual classes at those line numbers are `.admin-safety-row` (880px) and `.admin-mini-table > div` (760px). These are admin panel data tables. The player-facing `lobby-room-layout` already has a correct `@media (max-width: 840px)` breakpoint in `lobby-room.css`.

**Problem:** The hard `min-width` on the inner grid rows fights the `overflow-x: auto` container that already wraps them. The container expands to match the child's `min-width`, causing full-page horizontal overflow on mobile rather than a contained table scroll.

**Fix:** Remove both `min-width` declarations. The `grid-template-columns` values (fixed px + `minmax`) already define the intrinsic scroll width. The admin user scrolls horizontally within the container — acceptable for an internal tool where data density matters more than narrow-screen elegance.

**Changes (2 line deletions only, no HTML/TSX changes):**
- Remove `min-width: 880px` from `.admin-safety-row` (line 929)
- Remove `min-width: 760px` from `.admin-mini-table > div` (line 1045)

**Verification:** Manual QA at 360px, 768px, and desktop. No unit tests (CSS).

---

## Unit D — HTTP server timeouts (#21)

**File:** `server/index.cjs` line 76 — immediately after `const httpServer = createServer(app)`

**Problem:** `httpServer` is created with no timeout configuration. Connections can hang indefinitely under slow-loris attack or stalled clients, eventually exhausting Railway container file descriptors.

**Fix:** Set three timeout properties before `httpServer.listen`:

```js
httpServer.headersTimeout  = 10_000;   // 10s — slow-loris guard on HTTP handshake
httpServer.requestTimeout  = 0;        // disabled — Socket.IO long-poll/WS needs long-lived connections
httpServer.keepAliveTimeout = 65_000;  // 65s — outlasts Railway LB's ~60s idle timeout
```

**Rationale for each value:**
- `headersTimeout = 10_000`: Kills connections that never finish sending HTTP headers within 10 seconds. Guards against slow-loris. 10s is generous for any legitimate client behind Railway's load balancer.
- `requestTimeout = 0`: Any non-zero value would spuriously kill Socket.IO long-poll requests, SSE connections, and WebSocket upgrade handshakes. Socket.IO manages its own heartbeat/disconnect. Must be 0.
- `keepAliveTimeout = 65_000`: Railway's LB closes idle connections at ~60s. If Node's keepAlive timeout is shorter, the LB can send a new request on a half-closed socket → `ECONNRESET`. Setting 65s ensures Node outlasts the LB.

**Test:** A simulated slow-loris connection (sends partial headers, then stalls) is killed within `headersTimeout + ~1s`.

---

## Commit plan

One commit per unit, referencing the audit number:

| Unit | Commit message |
|------|---------------|
| A | `fix(audit-8): wrap Stripe webhook idempotency check and wallet update in transaction` |
| B | `fix(audit-20): change Tournament.betEntry and prizePool from Float to Decimal(12,2)` |
| C | `fix(audit-9,10): remove blocking min-width from admin table rows` |
| D | `fix(audit-21): set headersTimeout, requestTimeout, keepAliveTimeout on httpServer` |

Push to `origin/main` only after all tests green.

---

## Out of scope

All other audit findings are explicitly deferred. Do not touch them in this session.
