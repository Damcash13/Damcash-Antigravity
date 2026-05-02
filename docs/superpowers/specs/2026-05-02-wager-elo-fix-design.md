# Wager & ELO Calculation Fix — Design Spec

**Date:** 2026-05-02  
**Status:** Approved  
**Scope:** Bug fixes only — no new features, no refactor beyond what's needed

---

## Problem Summary

Players report two categories of issues:

1. **Wrong wallet balance after winning a wager** — consistent, predictable discrepancy. Winners receive less than the UI promised.
2. **ELO drift** — random, affects both chess and checkers. Ratings shift to unexpected values after games.

---

## Root Causes

### 1. Payout formula mismatch (wager)

The client and server use different formulas for the same fee:

| Location | Formula | Result on $100 bet |
|---|---|---|
| `src/components/betting/BettingPanel.tsx:44–45` | `amount * 2 - amount * 0.05` | $195 displayed |
| `server/index.cjs:1148` | `betAmount * 2 * (1 - 0.05)` | $190 paid |

The server applies the 5% house cut to the full pot (correct). The client applies it only to the original stake (wrong). The displayed payout is $5 higher than what is actually paid on a $100 bet; scales linearly with bet size.

### 2. Stale ELO rating baseline

`settleElo()` (`server/index.cjs:927`) reads player ratings from the in-memory `players` Map:

```js
const wR = wp.rating?.[uv] || 1500;
```

This Map is populated from what the client sends via `player:register`, which comes from zustand's persisted localStorage state. If that state is stale (e.g., from a previous session before a rating change was saved), ELO is calculated from the wrong baseline, producing random drift.

### 3. Non-atomic ELO DB updates

`settleElo()` makes two sequential `prisma.user.update()` calls — one for white, one for black — with no wrapping transaction. If the second call fails (transient DB error, connection drop), one player's rating is persisted and the other's is not. This creates permanent asymmetric drift.

### 4. Missing double-settlement guard on resign

The `game:over` socket handler sets `room.settling = true` before calling `settleElo` and `settleBets`, preventing duplicate execution. The `resign` handler (`server/index.cjs:1233`) makes the same calls with no such guard. A concurrent resign (e.g., both players resign simultaneously, or resign races with a clock timeout) triggers ELO and wallet settlement twice.

---

## Design

### Fix 1 — Align client payout formula (`BettingPanel.tsx`)

Update both display sites (input phase and confirmation step) to use the server's formula:

```ts
const platformFee  = amount * 2 * 0.05;        // 5% of the total pot
const potentialWin = amount * 2 * (1 - 0.05);  // = amount * 1.90
```

The `activeBet` display inline formula (`(activeBet.amount * 2) * 0.95`) already matches the server and needs no change.

**Files changed:** `src/components/betting/BettingPanel.tsx` (lines 44–45 and line 63 display)

---

### Fix 2 — Authoritative ratings from DB in `settleElo()` (`server/index.cjs`)

At the start of `settleElo()`, after resolving `dbWhiteId` and `dbBlackId`, fetch both players' current ratings and game counts from the database before computing ELO. Remove the `|| 1500` fallback from the calculation path (keep it only as a hard guard if a DB record is unexpectedly missing).

```js
// Resolve DB IDs
const dbWhiteId = socketToUserId.get(whiteId);
const dbBlackId = socketToUserId.get(blackId);
if (!dbWhiteId || !dbBlackId) return; // guests — skip ELO

// Fetch authoritative ratings
const [whiteDb, blackDb] = await Promise.all([
  prisma.user.findUnique({
    where: { id: dbWhiteId },
    select: {
      chessRating: true, checkersRating: true,
      chessGames: true,  checkersGames: true,
      peakChessRating: true, peakCheckersRating: true,
    },
  }),
  prisma.user.findUnique({
    where: { id: dbBlackId },
    select: {
      chessRating: true, checkersRating: true,
      chessGames: true,  checkersGames: true,
      peakChessRating: true, peakCheckersRating: true,
    },
  }),
]);
if (!whiteDb || !blackDb) return;

const wR = uv === 'chess' ? whiteDb.chessRating    : whiteDb.checkersRating;
const bR = uv === 'chess' ? blackDb.chessRating    : blackDb.checkersRating;
const wG = uv === 'chess' ? whiteDb.chessGames     : whiteDb.checkersGames;
const bG = uv === 'chess' ? blackDb.chessGames     : blackDb.checkersGames;
```

The in-memory `players` Map is still updated after the game (for the player list broadcast), but is no longer the source of truth for ELO input.

**Files changed:** `server/index.cjs` — `settleElo()` function

---

### Fix 3 — Atomic ELO DB writes (`server/index.cjs`)

Wrap both `prisma.user.update()` calls and the `prisma.match.update()` call inside a single `prisma.$transaction([...])`. Move the `rating:update` socket emissions to *after* the transaction resolves, so clients only see a rating change that was actually persisted.

```js
await prisma.$transaction([
  prisma.user.update({
    where: { id: dbWhiteId },
    data: {
      [ratingField]: elo.white.after,
      [peakField]:   Math.max(whiteDb[peakField], elo.white.after),
      [gamesField]:  { increment: 1 },
      [wWinsField]:  { increment: wWinsInc },
      [wLossField]:  { increment: wLossesInc },
      [wDrawField]:  { increment: wDrawsInc },
    },
  }),
  prisma.user.update({
    where: { id: dbBlackId },
    data: {
      [ratingField]: elo.black.after,
      [peakField]:   Math.max(blackDb[peakField], elo.black.after),
      [gamesField]:  { increment: 1 },
      [bWinsField]:  { increment: bWinsInc },
      [bLossField]:  { increment: bLossesInc },
      [bDrawField]:  { increment: bDrawsInc },
    },
  }),
  prisma.match.update({
    where: { id: room.dbMatchId },
    data: {
      status:  'ended',
      result:  result === 'win' ? 'white' : result === 'loss' ? 'black' : 'draw',
      pgn:     room.moves.map(m => m.move || m.san).join(' '),
      endedAt: new Date(),
    },
  }),
]);

// Only emit rating:update after confirmed DB write
whiteSocket?.emit('rating:update', { ... });
blackSocket?.emit('rating:update', { ... });
```

If the transaction throws, the catch block logs the error and does not emit `rating:update` — no false positives shown to users.

**Files changed:** `server/index.cjs` — `settleElo()` function

---

### Fix 4 — Double-settlement guard on resign (`server/index.cjs`)

Add the same `room.settling` guard already present in `game:over` to the `resign` handler:

```js
socket.on('resign', ({ roomId }) => {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.settling) return;   // already settling — ignore duplicate
  room.settling = true;         // claim settlement atomically

  const isWhite  = room.players.white === socket.id;
  const result   = isWhite ? 'loss' : 'win';
  const universe = room.config?.universe;
  io.to(roomId).emit('game-over', { result: 'resign', by: socket.id });
  if (room.config?.rated !== false) settleElo(roomId, result, universe);
  settleBets(roomId, result);
  rooms.delete(roomId);
  reconnectTokens.delete(roomId);
  const p = players.get(socket.id);
  if (p) { p.status = 'idle'; p.currentTC = null; players.set(socket.id, p); broadcastPlayerList(); }
});
```

**Files changed:** `server/index.cjs` — `resign` socket handler

---

## Files Changed Summary

| File | Change |
|---|---|
| `src/components/betting/BettingPanel.tsx` | Align `platformFee` and `potentialWin` formula to match server |
| `server/index.cjs` | `settleElo()`: fetch ratings from DB, wrap updates in transaction, emit after commit |
| `server/index.cjs` | `resign` handler: add `room.settling` guard |

---

## What This Does NOT Change

- ELO formula (`computeElo`, `kFactor`, `expectedScore`) — mathematically correct as-is
- Escrow logic (`escrowBet`) — already uses `prisma.$transaction` with `FOR UPDATE` locks
- Draw settlement — already refunds both players correctly
- `game:over` handler — already has `room.settling` guard

---

## Testing

- Place a $100 bet, win — confirm wallet credit is $190 (not $195) and UI now shows $190 before the game starts
- Place a $100 bet, draw — confirm both players receive $100 refund (unchanged)
- Play a rated game, check ELO before/after — confirm delta matches what DB shows, not client localStorage
- Simulate concurrent resigns (two browser tabs, both resign within ~100ms) — confirm ELO and wallet settle exactly once
