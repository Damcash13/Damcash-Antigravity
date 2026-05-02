import { describe, it, expect } from 'vitest';
import { calculateBetPayout, HOUSE_CUT } from '../lib/betting';

// Server formula (mirrors server/index.cjs:1148)
const serverPayout = (amount: number) => amount * 2 * (1 - HOUSE_CUT);

describe('calculateBetPayout — payout formula regression', () => {
  it('potentialWin matches server payout on $100 bet', () => {
    expect(calculateBetPayout(100).potentialWin).toBe(serverPayout(100)); // 190
  });

  it('potentialWin matches server payout on $50 bet', () => {
    expect(calculateBetPayout(50).potentialWin).toBe(serverPayout(50)); // 95
  });

  it('platform fee is 5% of total pot, not 5% of stake', () => {
    // Old (broken) formula: amount * 0.05 = $5 on $100 bet
    // Correct formula: amount * 2 * 0.05 = $10 on $100 bet
    expect(calculateBetPayout(100).platformFee).toBe(10);
  });

  it('potentialWin + platformFee equals total pot', () => {
    const amount = 75;
    const { platformFee, potentialWin } = calculateBetPayout(amount);
    expect(platformFee + potentialWin).toBeCloseTo(amount * 2);
  });
});
