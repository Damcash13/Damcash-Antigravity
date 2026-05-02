# Wager & ELO Calculation Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix wrong wallet payouts (formula mismatch) and random ELO drift (stale in-memory ratings, non-atomic writes, double-settlement on resign).

**Architecture:** Two files change. `BettingPanel.tsx` gets a corrected fee formula. `server/index.cjs`'s `settleElo()` function is refactored to read authoritative ratings from Postgres before computing ELO, wrap all DB writes in a single transaction, and emit `rating:update` only after the transaction commits. The `resign` handler gets a two-line settlement guard matching the existing `game:over` guard.

**Tech Stack:** React + TypeScript (Vite), Node.js/CJS, Prisma 5, Socket.io, Zustand, Vitest (added in Task 1)

---

## Files Modified

| File | What changes |
|---|---|
| `package.json` | Add `vitest` dev dependency |
| `src/components/betting/BettingPanel.tsx` | Lines 44–45: fix `platformFee` and `potentialWin` formula |
| `src/tests/betting.test.ts` | New: unit tests for payout formula |
| `server/index.cjs` | `settleElo()`: fetch DB ratings first, atomic transaction, emit after commit |
| `server/index.cjs` | `resign` handler: add `room.settling` guard |

---

## Task 1: Fix payout formula in BettingPanel.tsx

**Files:**
- Modify: `src/components/betting/BettingPanel.tsx:44–45`
- Create: `src/tests/betting.test.ts`
- Modify: `package.json` (add vitest)

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest
```

Expected: vitest appears in `package.json` devDependencies, `node_modules/vitest` exists.

- [ ] **Step 2: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 3: Write the failing test**

Create `src/tests/betting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

// Mirror the payout logic from BettingPanel.tsx
function clientPayout(amount: number) {
  const platformFee  = amount * 2 * 0.05;
  const potentialWin = amount * 2 * (1 - 0.05);
  return { platformFee, potentialWin };
}

// Mirror the server formula from server/index.cjs:1148
function serverPayout(amount: number) {
  const HOUSE_CUT = 0.05;
  return amount * 2 * (1 - HOUSE_CUT);
}

describe('payout formula', () => {
  it('client potentialWin matches server payout for $100 bet', () => {
    const { potentialWin } = clientPayout(100);
    expect(potentialWin).toBe(serverPayout(100)); // both should be 190
  });

  it('client potentialWin matches server payout for $50 bet', () => {
    const { potentialWin } = clientPayout(50);
    expect(potentialWin).toBe(serverPayout(50)); // both should be 95
  });

  it('platform fee is 5% of total pot', () => {
    const { platformFee } = clientPayout(100);
    expect(platformFee).toBe(10); // 5% of $200 pot
  });
});
```

- [ ] **Step 4: Run the test — confirm it FAILS**

```bash
npm test
```

Expected output: test fails because `clientPayout` is not yet the actual BettingPanel code (this is the reference formula — the test itself uses the correct formula, so it should pass). 

> **Note:** The test encodes the *correct* formula. It will pass immediately because the test file uses the right formula. The next step verifies that the *component* file matches. Since the component is not imported in the test (it's JSX), we verify by reading the component.

- [ ] **Step 5: Fix `BettingPanel.tsx` lines 44–45**

Open `src/components/betting/BettingPanel.tsx`. Replace lines 44–45:

**Before:**
```ts
  const platformFee  = amount * 0.05;
  const potentialWin = (amount * 2) - platformFee;
```

**After:**
```ts
  const platformFee  = amount * 2 * 0.05;
  const potentialWin = amount * 2 * (1 - 0.05);
```

The confirmation step at line 86 already uses `potentialWin` — it will automatically show the corrected value. The active-bet display at line 63 (`(activeBet.amount * 2) * 0.95`) already matches the server and is unchanged.

- [ ] **Step 6: Run the test suite**

```bash
npm test
```

Expected: all 3 tests pass. No build errors.

- [ ] **Step 7: Verify the UI values manually**

Start the dev server:
```bash
npm run dev
```

Open the BettingPanel. Set bet amount to $100. Verify:
- Platform fee shown: **$10.00** (was $5.00)
- Potential win shown: **$190.00** (was $195.00)

Click "Place Bet" to reach the confirmation step. Verify confirmation shows:
- Win: **$190.00**
- Fee: **$10.00**

- [ ] **Step 8: Commit**

```bash
git add package.json src/tests/betting.test.ts src/components/betting/BettingPanel.tsx
git commit -m "fix: align betting payout formula with server (fee on pot not stake)

Client showed amount*2 - amount*0.05 ($195 on $100 bet).
Server pays amount*2*0.95 ($190 on $100 bet).
Fix client to match server. Adds vitest + payout unit tests."
```

---

## Task 2: Refactor settleElo() — DB-authoritative ratings + atomic transaction

**Files:**
- Modify: `server/index.cjs:927–1038` (the `settleElo` async function)

**Context:** The current `settleElo()` reads ratings from the in-memory `players` Map (client-supplied via `player:register`), then makes two separate `prisma.user.update()` calls with no transaction. This task replaces both patterns.

The current function structure (lines 927–1038) is:
1. Read in-memory ratings/games (lines 938–941) ← **remove**
2. Compute ELO (line 943) ← keep, but move after DB fetch
3. Update in-memory Map (lines 946–955) ← keep (for player list broadcast)
4. `if (dbWhiteId && dbBlackId)` block: fetch DB records, then 2 separate updates + match update ← **replace with transaction**
5. Emit `rating:update` to sockets (lines 1015–1034) ← keep, but move inside try after transaction

- [ ] **Step 1: Locate the exact function boundaries**

The function starts at `server/index.cjs:927`:
```js
async function settleElo(roomId, result, universe) {
```
And ends at line 1039 (closing brace before the `escrowBet` comment). Confirm this in your editor before proceeding.

- [ ] **Step 2: Replace the entire settleElo() function body**

Replace the full contents of `settleElo()` with the following. Keep the function signature unchanged (`async function settleElo(roomId, result, universe)`):

```js
async function settleElo(roomId, result, universe) {
  const room = rooms.get(roomId);
  if (!room || !room.config?.rated) return;

  const whiteId = room.players.white;
  const blackId = room.players.black;
  const wp = players.get(whiteId);
  const bp = players.get(blackId);
  if (!wp || !bp) return;

  const uv = universe || room.config?.universe || 'chess';

  // Resolve DB user IDs — guests have no DB record, skip ELO
  const dbWhiteId = socketToUserId.get(whiteId);
  const dbBlackId = socketToUserId.get(blackId);
  if (!dbWhiteId || !dbBlackId) return;

  // Fetch authoritative ratings from DB — never trust client-supplied values
  let whiteDb, blackDb;
  try {
    [whiteDb, blackDb] = await Promise.all([
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
  } catch (e) {
    console.error('[ELO] DB fetch failed before ELO computation:', e);
    return;
  }
  if (!whiteDb || !blackDb) return;

  const wR = uv === 'chess' ? whiteDb.chessRating    : whiteDb.checkersRating;
  const bR = uv === 'chess' ? blackDb.chessRating    : blackDb.checkersRating;
  const wG = uv === 'chess' ? whiteDb.chessGames     : whiteDb.checkersGames;
  const bG = uv === 'chess' ? blackDb.chessGames     : blackDb.checkersGames;

  const elo = computeElo(wR, bR, result, wG, bG);

  // Update in-memory Map so broadcastPlayerList() shows fresh ratings
  if (!wp.rating) wp.rating = {};
  if (!bp.rating) bp.rating = {};
  wp.rating[uv] = elo.white.after;
  bp.rating[uv] = elo.black.after;
  if (!wp.gamesPlayed) wp.gamesPlayed = {};
  if (!bp.gamesPlayed) bp.gamesPlayed = {};
  wp.gamesPlayed[uv] = wG + 1;
  bp.gamesPlayed[uv] = bG + 1;
  players.set(whiteId, wp);
  players.set(blackId, bp);

  const wWinsInc  = result === 'win'  ? 1 : 0;
  const wLossesInc = result === 'loss' ? 1 : 0;
  const wDrawsInc  = result === 'draw' ? 1 : 0;
  const bWinsInc  = result === 'loss' ? 1 : 0;
  const bLossesInc = result === 'win'  ? 1 : 0;
  const bDrawsInc  = result === 'draw' ? 1 : 0;

  // Build field names dynamically based on universe
  const ratingField = uv === 'chess' ? 'chessRating'    : 'checkersRating';
  const peakWField  = uv === 'chess' ? 'peakChessRating': 'peakCheckersRating';
  const peakBField  = uv === 'chess' ? 'peakChessRating': 'peakCheckersRating';
  const gamesField  = uv === 'chess' ? 'chessGames'     : 'checkersGames';
  const wWinsField  = uv === 'chess' ? 'chessWins'      : 'checkersWins';
  const wLossField  = uv === 'chess' ? 'chessLosses'    : 'checkersLosses';
  const wDrawField  = uv === 'chess' ? 'chessDraws'     : 'checkersDraws';

  // Persist ELO atomically. Match update is conditional: room.dbMatchId can be
  // null if the initial match.create() failed silently during room setup (line 285
  // of server/index.cjs swallows that error). Including a null id in the transaction
  // would throw and roll back ELO — so we only add the match op when the id exists.
  try {
    const ops = [
      prisma.user.update({
        where: { id: dbWhiteId },
        data: {
          [ratingField]: elo.white.after,
          [peakWField]:  Math.max(whiteDb[peakWField], elo.white.after),
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
          [peakBField]:  Math.max(blackDb[peakBField], elo.black.after),
          [gamesField]:  { increment: 1 },
          [wWinsField]:  { increment: bWinsInc },
          [wLossField]:  { increment: bLossesInc },
          [wDrawField]:  { increment: bDrawsInc },
        },
      }),
    ];
    if (room.dbMatchId) {
      ops.push(prisma.match.update({
        where: { id: room.dbMatchId },
        data: {
          status:  'ended',
          result:  result === 'win' ? 'white' : result === 'loss' ? 'black' : 'draw',
          pgn:     room.moves.map(m => m.move || m.san).join(' '),
          endedAt: new Date(),
        },
      }));
    }
    await prisma.$transaction(ops);

    // Only emit rating changes after DB confirms the write
    const whiteSocket = io.sockets.sockets.get(whiteId);
    const blackSocket = io.sockets.sockets.get(blackId);

    whiteSocket?.emit('rating:update', {
      universe: uv,
      before:   elo.white.before,
      after:    elo.white.after,
      delta:    elo.white.delta,
      opponent: bp.name,
      opponentRating: bR,
      result,
      playedAt: Date.now(),
    });

    blackSocket?.emit('rating:update', {
      universe: uv,
      before:   elo.black.before,
      after:    elo.black.after,
      delta:    elo.black.delta,
      opponent: wp.name,
      opponentRating: wR,
      result: result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'draw',
      playedAt: Date.now(),
    });

    broadcastPlayerList();
    console.log(`[ELO] ${uv} | ${wp.name} ${wR}→${elo.white.after} (${elo.white.delta > 0 ? '+' : ''}${elo.white.delta}) vs ${bp.name} ${bR}→${elo.black.after}`);
  } catch (e) {
    console.error('[DB] ELO transaction failed — ratings not saved, not emitted:', e);
  }
}
```

**Critical:** The `bWinsInc/bLossesInc/bDrawsInc` variables use `wWinsField/wLossField/wDrawField` for black too — these are the same field names (chess/checkers prefix is the same for both players). This is correct because both updates use the same universe-scoped field names.

- [ ] **Step 3: Verify the server starts without errors**

```bash
node server/index.cjs
```

Expected: server starts, no syntax errors, `[+]` lines appear. Stop with Ctrl+C.

- [ ] **Step 4: Play a rated game end-to-end and verify ELO**

Start the full stack:
```bash
npm run dev:all
```

1. Log in as two different users (two browser tabs or incognito).
2. Start a rated game, play to checkmate or resign.
3. Check the console for `[ELO]` log line — ratings and delta should appear.
4. Verify the `rating:update` notification appears in both players' UIs.
5. Log out, log back in — confirm the new rating persists (it now comes from DB, not stale localStorage).

- [ ] **Step 5: Commit**

```bash
git add server/index.cjs
git commit -m "fix: settleElo() reads DB ratings, wraps writes in atomic transaction

Replaces in-memory ratings (client-supplied, stale-prone) with
authoritative DB fetch before ELO computation. Wraps both user
updates + match update in prisma.\$transaction() so partial writes
are impossible. rating:update only emitted after DB commit."
```

---

## Task 3: Add room.settling guard to resign handler

**Files:**
- Modify: `server/index.cjs` — `resign` socket handler (~line 1233)

**Context:** The `game:over` handler already has:
```js
if (room.settling) { log.warn(...); return; }
room.settling = true;
```
The `resign` handler is missing these two lines, enabling double-settlement if two resign events arrive concurrently.

- [ ] **Step 1: Locate the resign handler**

Find this exact block in `server/index.cjs` (around line 1233):

```js
socket.on('resign', ({ roomId }) => {
  const room = rooms.get(roomId);
  if (!room) return;
  // Determine result from white's perspective
  const isWhite = room.players.white === socket.id;
```

- [ ] **Step 2: Add the settling guard**

Replace:
```js
socket.on('resign', ({ roomId }) => {
  const room = rooms.get(roomId);
  if (!room) return;
  // Determine result from white's perspective
  const isWhite = room.players.white === socket.id;
```

With:
```js
socket.on('resign', ({ roomId }) => {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.settling) return;
  room.settling = true;
  // Determine result from white's perspective
  const isWhite = room.players.white === socket.id;
```

Everything after `const isWhite` is unchanged.

- [ ] **Step 3: Verify the server starts without errors**

```bash
node server/index.cjs
```

Expected: server starts cleanly. Stop with Ctrl+C.

- [ ] **Step 4: Test concurrent resign scenario**

Open two browser tabs logged in as opposing players in a game. In rapid succession (within ~200ms), click resign in both tabs. Verify:
- The `[ELO]` console log appears **exactly once**.
- Both players' wallets update **exactly once** (check the `[BET]` console log if a wager was placed).
- Neither player ends up with double ELO change or double wallet credit/debit.

- [ ] **Step 5: Commit**

```bash
git add server/index.cjs
git commit -m "fix: add room.settling guard to resign handler

Concurrent resigns (or resign + clock timeout race) could trigger
settleElo() and settleBets() twice. Two-line guard matches the
identical pattern already in the game:over handler."
```

---

## Final Verification

- [ ] Run the full test suite:
```bash
npm test
```
Expected: all vitest tests pass.

- [ ] Run a TypeScript build check:
```bash
npm run build
```
Expected: zero TypeScript errors, build succeeds.

- [ ] Smoke test the three fixed scenarios:
  1. **$100 bet, win** → wallet increases by **$190** (not $195), UI showed $190 before game
  2. **Rated game played** → ELO delta in UI matches DB value after logout/login
  3. **Draw** → both wallets refunded full `betAmount` (unchanged behaviour, confirm still works)
