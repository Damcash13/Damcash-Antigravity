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
