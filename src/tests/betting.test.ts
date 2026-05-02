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
