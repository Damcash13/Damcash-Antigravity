export const HOUSE_CUT = 0.05;

export function calculateBetPayout(amount: number): {
  platformFee: number;
  potentialWin: number;
} {
  return {
    platformFee:  amount * 2 * HOUSE_CUT,
    potentialWin: amount * 2 * (1 - HOUSE_CUT),
  };
}
