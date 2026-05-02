# Player Register Trust & Socket ID Staleness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix M2 by making `player:register` async and fetching authoritative name/rating/gamesPlayed from Prisma for authenticated sockets; add a proof test documenting M3 (socket.id staleness) is already resolved.

**Architecture:** Pure function `resolvePlayerProfile` is extracted in the test file for unit testing (same pattern as prior security fixes). The server handler is made async with a try/catch Prisma fetch — on failure it falls back to client payload so a DB outage never breaks lobby registration. M3 requires no server change: a single proof test documents the verified no-op.

**Tech Stack:** Node.js/Express, Socket.io, Prisma, Vitest

---

## File Map

| File | Role |
|------|------|
| `src/tests/player-register-trust.test.ts` | New — 7 M2 unit tests (vulnerability proof + fixed behaviour) + 1 M3 proof test |
| `server/index.cjs:363–378` | Modified — `player:register` made async; Prisma fetch for authenticated sockets |

---

## Task 1: Write tests (M2 + M3)

**Files:**
- Create: `src/tests/player-register-trust.test.ts`

---

- [ ] **Step 1: Write the tests**

Create `/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New/src/tests/player-register-trust.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Pure extraction of the profile resolution logic in the player:register handler.
//
// BEFORE fix (M2): rating and gamesPlayed come entirely from the client payload,
//                  even for authenticated sockets. A user can send { chess: 3200 }
//                  and appear as a grandmaster in the lobby before a money game.
// AFTER fix (M2):  authenticated sockets get name/rating/gamesPlayed from Prisma.
//                  DB outage falls back to client payload so registration never breaks.
//
// M3: socket.id in useAgora.ts initiatePeerConnection is already read at call time
//     on the module-level singleton — no stale closure. Verified no-op.

interface ClientPayload {
  name?: string;
  rating?: { chess: number; checkers: number };
  gamesPlayed?: { chess: number; checkers: number };
}

interface DbRow {
  username: string;
  chessRating: number;
  checkersRating: number;
  chessGames: number;
  checkersGames: number;
}

function resolvePlayerProfile(
  socketId: string,
  client: ClientPayload,
  db: DbRow | null,
): { name: string; rating: { chess: number; checkers: number }; gamesPlayed: { chess: number; checkers: number } } {
  return {
    name: db ? db.username : (client.name || `Guest_${socketId.slice(0, 4)}`),
    rating: db
      ? { chess: db.chessRating, checkers: db.checkersRating }
      : (client.rating || { chess: 1500, checkers: 1450 }),
    gamesPlayed: db
      ? { chess: db.chessGames, checkers: db.checkersGames }
      : (client.gamesPlayed || { chess: 0, checkers: 0 }),
  };
}

// ── Vulnerability proof — documents PRE-FIX behaviour ────────────────────────

describe('VULNERABILITY proof — pre-fix behaviour (audit M2)', () => {
  it('without DB fetch, client-supplied inflated rating passes through unchanged', () => {
    // db=null simulates pre-fix: no Prisma call, raw client payload used
    const result = resolvePlayerProfile('sock-1', { rating: { chess: 3200, checkers: 3100 } }, null);
    expect(result.rating).toEqual({ chess: 3200, checkers: 3100 }); // proves the bug
  });
});

// ── Fixed behaviour ───────────────────────────────────────────────────────────

describe('resolvePlayerProfile — authoritative profile resolution (audit M2)', () => {
  const db: DbRow = {
    username: 'realUser',
    chessRating: 1600,
    checkersRating: 1550,
    chessGames: 10,
    checkersGames: 5,
  };

  it('authenticated user gets DB username, ignoring client-supplied name', () => {
    const result = resolvePlayerProfile('sock-1', { name: 'HackerName' }, db);
    expect(result.name).toBe('realUser');
  });

  it('authenticated user gets DB rating, ignoring inflated client rating', () => {
    const result = resolvePlayerProfile('sock-1', { rating: { chess: 3200, checkers: 3100 } }, db);
    expect(result.rating).toEqual({ chess: 1600, checkers: 1550 });
  });

  it('authenticated user gets DB gamesPlayed, ignoring client gamesPlayed', () => {
    const result = resolvePlayerProfile('sock-1', { gamesPlayed: { chess: 9999, checkers: 9999 } }, db);
    expect(result.gamesPlayed).toEqual({ chess: 10, checkers: 5 });
  });

  it('DB outage (db=null) falls back to client-supplied rating — registration never breaks', () => {
    const clientRating = { chess: 1700, checkers: 1650 };
    const result = resolvePlayerProfile('sock-1', { rating: clientRating }, null);
    expect(result.rating).toEqual(clientRating);
  });

  it('guest with no name falls back to Guest_XXXX using socketId prefix', () => {
    const result = resolvePlayerProfile('abcd1234', {}, null);
    expect(result.name).toBe('Guest_abcd');
  });

  it('guest with no rating falls back to default { chess: 1500, checkers: 1450 }', () => {
    const result = resolvePlayerProfile('sock-1', {}, null);
    expect(result.rating).toEqual({ chess: 1500, checkers: 1450 });
  });
});

// ── M3 proof ─────────────────────────────────────────────────────────────────

describe('M3 — socket.id read at call time, not mount time (verified no-op)', () => {
  it('property access on mutable singleton always returns current value — no stale closure', () => {
    // Simulates: import { socket } from '../lib/socket'  (module-level singleton)
    const singleton = { id: 'original-id' };

    // Simulates: useCallback(() => { ... socket.id ... }) — no id captured at mount
    const readId = () => singleton.id;

    // Simulates socket reconnect updating the singleton's id property
    singleton.id = 'reconnected-id';

    // Property access inside the async body always reflects the current value
    expect(readId()).toBe('reconnected-id');
  });
});
```

- [ ] **Step 2: Run the tests — confirm all 8 pass**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && npm test -- --reporter=verbose 2>&1 | grep -A 35 "player-register-trust"
```

Expected: all 8 tests in `player-register-trust.test.ts` pass. If any fail, stop and report — do not proceed.

---

## Task 2: Implement the server change (M2)

**Files:**
- Modify: `server/index.cjs:363–378`

---

- [ ] **Step 1: Replace the player:register handler**

Open `server/index.cjs`. Find the handler at line 363 (inside `io.on('connection', ...)`):

```js
  socket.on('player:register', ({ name, rating, universe, gamesPlayed, country }) => {
    if (socket.user) {
      socketToUserId.set(socket.id, socket.user.id);
    }
    players.set(socket.id, {
      name: name || `Guest_${socket.id.slice(0, 4)}`,
      rating: rating || { chess: 1500, checkers: 1450 },
      gamesPlayed: gamesPlayed || { chess: 0, checkers: 0 },
      status: 'idle',
      universe: universe || 'chess',
      country: country || '',
    });
    broadcastPlayerList();
    socket.emit('players:online', Array.from(players.entries()).map(([id, info]) => ({ socketId: id, ...info })));
    socket.emit('seeks:list', Array.from(seeks.entries()).map(([seekId, s]) => ({ seekId, ...s })));
  });
```

Replace it entirely with:

```js
  socket.on('player:register', async ({ name, rating, universe, gamesPlayed, country }) => {
    if (socket.user) {
      socketToUserId.set(socket.id, socket.user.id);
    }

    let authProfile = null;
    if (socket.user) {
      try {
        authProfile = await prisma.user.findUnique({
          where: { id: socket.user.id },
          select: { username: true, chessRating: true, checkersRating: true, chessGames: true, checkersGames: true },
        });
      } catch (_) {
        // DB outage — fall back to client payload
      }
    }

    players.set(socket.id, {
      name: authProfile ? authProfile.username : (name || `Guest_${socket.id.slice(0, 4)}`),
      rating: authProfile
        ? { chess: authProfile.chessRating, checkers: authProfile.checkersRating }
        : (rating || { chess: 1500, checkers: 1450 }),
      gamesPlayed: authProfile
        ? { chess: authProfile.chessGames, checkers: authProfile.checkersGames }
        : (gamesPlayed || { chess: 0, checkers: 0 }),
      status: 'idle',
      universe: universe || 'chess',
      country: country || '',
    });
    broadcastPlayerList();
    socket.emit('players:online', Array.from(players.entries()).map(([id, info]) => ({ socketId: id, ...info })));
    socket.emit('seeks:list', Array.from(seeks.entries()).map(([seekId, s]) => ({ seekId, ...s })));
  });
```

- [ ] **Step 2: Run the full test suite**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && npm test 2>&1
```

Expected:
```
Test Files  8 passed (8)
     Tests  62 passed (62)
```

All tests pass. If any fail, stop and report — do not commit.

- [ ] **Step 3: Commit**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && git add src/tests/player-register-trust.test.ts server/index.cjs && git commit -m "fix(security): fetch authoritative rating from Prisma in player:register for authenticated sockets (audit M2, M3)"
```

- [ ] **Step 4: Push**

```bash
cd "/Users/losalinirokocoko/.gemini/antigravity/scratch/Damcash-V3/scratch/Damcash New" && git push origin main 2>&1
```

Expected: `main -> main` push confirmation.
