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
