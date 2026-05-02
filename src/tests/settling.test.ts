import { describe, it, expect, vi } from 'vitest';

// Simulates the room.settling guard pattern used in server/index.cjs.
// Extracted as a pure function so it can be unit-tested without a server.
function makeRoom() {
  return { settling: false, settledCount: 0 };
}

function handleSettle(room: ReturnType<typeof makeRoom>, settleFn: () => void) {
  if (room.settling) return;  // ← this is the fix (was missing from resign handler)
  room.settling = true;
  settleFn();
}

describe('double-settlement guard — regression tests', () => {
  it('settleFn is called exactly once on a single resign', () => {
    const room = makeRoom();
    const settleFn = vi.fn();
    handleSettle(room, settleFn);
    expect(settleFn).toHaveBeenCalledTimes(1);
  });

  it('settleFn is called exactly once when two concurrent resigns fire', () => {
    const room = makeRoom();
    const settleFn = vi.fn();
    // Simulate both players resigning simultaneously
    handleSettle(room, settleFn);
    handleSettle(room, settleFn); // second call — must be ignored
    expect(settleFn).toHaveBeenCalledTimes(1);
  });

  it('settleFn is NOT called if room.settling is already true on arrival', () => {
    const room = makeRoom();
    room.settling = true; // already settled (e.g. by game:over racing ahead)
    const settleFn = vi.fn();
    handleSettle(room, settleFn);
    expect(settleFn).not.toHaveBeenCalled();
  });

  it('without the guard, concurrent resigns would call settleFn twice', () => {
    // Documents the pre-fix behaviour — DO NOT copy this pattern
    function handleSettleWithoutGuard(
      room: { settling: boolean },
      settleFn: () => void,
    ) {
      room.settling = true;
      settleFn(); // no guard — always executes
    }

    const room = makeRoom();
    const settleFn = vi.fn();
    handleSettleWithoutGuard(room, settleFn);
    handleSettleWithoutGuard(room, settleFn);
    expect(settleFn).toHaveBeenCalledTimes(2); // proves the bug existed
  });
});
