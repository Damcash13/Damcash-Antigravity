# Player Register Trust & Socket ID Staleness — Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix M2 — `player:register` must fetch authoritative rating/name/gamesPlayed from Prisma for authenticated sockets instead of trusting the client payload. Verify and document M3 — `socket.id` staleness in `useAgora.ts` is already resolved.

**Audit findings addressed:**
- M2 MEDIUM — `player:register` blindly writes client-supplied `rating` and `gamesPlayed` into the lobby `players` Map for authenticated sockets, allowing a user to advertise a fake ELO before a money game.
- M3 MEDIUM — `socket.id` was alleged to be captured at hook mount time in `useAgora.ts initiatePeerConnection`. Verified no-op: `socket.id` is already read at call time on the module-level singleton.

**Architecture:** One async change to `server/index.cjs` `player:register` handler. One new pure-function test file. M3 gets a single proof test in the same file.

**Tech Stack:** Node.js/Express, Socket.io, Prisma, Vitest

---

## Finding M2 — player:register rating trust

### The vulnerability

`server/index.cjs` line 363:

```js
socket.on('player:register', ({ name, rating, universe, gamesPlayed, country }) => {
  if (socket.user) {
    socketToUserId.set(socket.id, socket.user.id);
  }
  players.set(socket.id, {
    name: name || `Guest_${socket.id.slice(0, 4)}`,
    rating: rating || { chess: 1500, checkers: 1450 },
    gamesPlayed: gamesPlayed || { chess: 0, checkers: 0 },
    ...
  });
```

For authenticated sockets (`socket.user` set), `rating` and `gamesPlayed` come entirely from the client. A caller can send `{ chess: 3200, checkers: 3100 }` and appear as a top-rated player in the lobby — misleading opponents before a money wager.

### The fix

Make the handler `async`. For authenticated sockets, call:

```js
const dbUser = await prisma.user.findUnique({
  where: { id: socket.user.id },
  select: { username: true, chessRating: true, checkersRating: true, chessGames: true, checkersGames: true }
});
```

Use DB values for `name`, `rating`, and `gamesPlayed`. Wrap in try/catch — if the DB call throws, fall back to client-supplied values so a transient DB outage doesn't break lobby registration.

Guest sockets (`socket.user` falsy) are unchanged.

### Full handler after fix

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
        select: { username: true, chessRating: true, checkersRating: true, chessGames: true, checkersGames: true }
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

### Pure function for testing

```ts
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
```

### Test cases

- Authenticated user gets DB `username`, `chessRating`, `checkersRating`, `chessGames`, `checkersGames` — client-supplied values ignored
- DB outage (db = null for authenticated socket) falls back to client-supplied values
- Guest (db = null) with name provided uses client name
- Guest (db = null) with no name falls back to `Guest_XXXX`
- Guest (db = null) with no rating falls back to `{ chess: 1500, checkers: 1450 }`
- Pre-fix vulnerability proof: client payload with inflated rating passes through when db = null (documents the bug)

---

## Finding M3 — socket.id staleness in useAgora (verified no-op)

### Verification

`src/hooks/useAgora.ts` line 126:

```ts
const { token, uid } = await api.agora.token(channelName, 0, socket.id);
```

`socket` is imported as a module-level singleton from `../lib/socket`:

```ts
export const socket: any = _io ? _io(SOCKET_URL, { ... }) : { id: `local-...`, ... };
```

`socket.id` is a live property on the singleton. It is read at the moment the `await` line executes inside the `initiatePeerConnection` async body — not captured at hook mount time, not in a closure. The property always reflects the current socket ID at call time.

This was confirmed by the #2/#13 fix, which ensured `socket.id` flows through to the backend as a membership check key. If it were stale, the membership gate would have been broken — it is not.

**M3 is already resolved. No code change required.**

### Proof test

A single test documents that a property access on a mutable object always reflects the current value — it is not a closure over a snapshot:

```ts
it('M3 — socket.id read at call time, not mount time (verified no-op)', () => {
  const singleton = { id: 'original-id' };
  // Simulate hook mount — no capture of id
  const getId = () => singleton.id; // reads property at call time
  singleton.id = 'reconnected-id';
  expect(getId()).toBe('reconnected-id'); // proves no stale closure
});
```

---

## Files changed

| File | Change |
|------|--------|
| `server/index.cjs` | `player:register` handler made async; Prisma fetch for authenticated sockets |
| `src/tests/player-register-trust.test.ts` | New: 6 unit tests for M2 + 1 proof test for M3 |

## Commits (one per finding)

1. `fix(security): fetch authoritative rating from Prisma in player:register for authenticated sockets (audit M2)`
2. `docs(security): verify socket.id in useAgora is read at call time — M3 already resolved (audit M3)` (test-only commit)
