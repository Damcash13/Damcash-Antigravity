/**
 * ELO Rating Engine — DamCash
 *
 * Based on FIDE rules with:
 *  - Variable K-factor (provisonal / normal / master)
 *  - Expected score calculation
 *  - Multi-result support (chess + draughts)
 */

export type GameResult = 'win' | 'loss' | 'draw';

/** K-factor based on rating band (FIDE-style) */
export function kFactor(rating: number, gamesPlayed: number): number {
  // Provisional player (< 30 games)
  if (gamesPlayed < 30) return 40;
  // Master (2400+)
  if (rating >= 2400) return 10;
  // Standard
  if (rating >= 2100) return 20;
  return 32;
}

/** Expected score for player A vs player B */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** Actual score values */
const SCORE_VALUE: Record<GameResult, number> = {
  win:  1,
  draw: 0.5,
  loss: 0,
};

export interface EloChange {
  before: number;
  after:  number;
  delta:  number;      // signed (positive = gained)
}

/**
 * Compute new ratings for both players after a game.
 * Returns { white, black } EloChange objects.
 */
export function computeElo(
  whiteRating:  number,
  blackRating:  number,
  result:       GameResult,  // from WHITE's perspective
  whiteGames:   number,
  blackGames:   number,
): { white: EloChange; black: EloChange } {
  const Ew = expectedScore(whiteRating, blackRating);
  const Eb = expectedScore(blackRating, whiteRating);

  const Sw = SCORE_VALUE[result];
  const Sb = 1 - Sw;

  const Kw = kFactor(whiteRating, whiteGames);
  const Kb = kFactor(blackRating, blackGames);

  const newWhite = Math.round(whiteRating + Kw * (Sw - Ew));
  const newBlack = Math.round(blackRating + Kb * (Sb - Eb));

  return {
    white: { before: whiteRating, after: newWhite, delta: newWhite - whiteRating },
    black: { before: blackRating, after: newBlack, delta: newBlack - blackRating },
  };
}

/**
 * Human-readable rating band label.
 */
export function ratingBand(rating: number): { label: string; color: string } {
  if (rating < 1200) return { label: 'Beginner',     color: '#94a3b8' };
  if (rating < 1400) return { label: 'Intermediate', color: '#22c55e' };
  if (rating < 1600) return { label: 'Advanced',     color: '#3b82f6' };
  if (rating < 1800) return { label: 'Expert',       color: '#a855f7' };
  if (rating < 2000) return { label: 'Candidate Master', color: '#f59e0b' };
  if (rating < 2200) return { label: 'Master',       color: '#f97316' };
  if (rating < 2400) return { label: 'International Master', color: '#ef4444' };
  return                    { label: 'Grandmaster',   color: '#fbbf24' };
}

/**
 * Performance rating for a set of games.
 * Simple average of opponent ratings, adjusted by score.
 */
export function performanceRating(
  opponentRatings: number[],
  results: GameResult[],
): number {
  if (opponentRatings.length === 0) return 1500;
  const avgOpp = opponentRatings.reduce((a, b) => a + b, 0) / opponentRatings.length;
  const score  = results.reduce((a, r) => a + SCORE_VALUE[r], 0);
  const pct    = score / results.length;
  // dp = opponent average + 400 * log10(pct / (1-pct))
  if (pct >= 1)   return avgOpp + 800;
  if (pct <= 0)   return avgOpp - 800;
  return Math.round(avgOpp + 400 * Math.log10(pct / (1 - pct)));
}
