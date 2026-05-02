import { describe, it, expect } from 'vitest';
import { computeElo, kFactor, expectedScore } from '../lib/elo';

describe('computeElo — regression tests', () => {
  describe('basic correctness', () => {
    it('winner gains rating, loser loses rating', () => {
      const { white, black } = computeElo(1500, 1500, 'win', 50, 50);
      expect(white.delta).toBeGreaterThan(0);
      expect(black.delta).toBeLessThan(0);
    });

    it('draw produces smaller deltas than a win/loss', () => {
      const win  = computeElo(1500, 1500, 'win',  50, 50);
      const draw = computeElo(1500, 1500, 'draw', 50, 50);
      expect(Math.abs(draw.white.delta)).toBeLessThan(Math.abs(win.white.delta));
    });

    it('deltas are zero-sum when K-factors are equal', () => {
      // Both players at same rating band and games played → same K-factor
      const { white, black } = computeElo(1600, 1600, 'win', 50, 50);
      expect(white.delta + black.delta).toBe(0);
    });
  });

  describe('ELO baseline — stale ratings cause drift', () => {
    // This test documents WHY the DB-authoritative fix matters.
    // If settleElo() uses a stale in-memory rating instead of the DB value,
    // the expected score is computed from the wrong baseline, shifting both
    // players' new ratings by a wrong amount.

    it('using stale 1500 for a 1800-rated player produces wrong ELO', () => {
      const dbRating    = 1800; // authoritative (from DB)
      const staleRating = 1500; // what stale localStorage might report
      const opponentRating = 1600;
      const games = 50;

      const correct = computeElo(dbRating,    opponentRating, 'win', games, games);
      const stale   = computeElo(staleRating, opponentRating, 'win', games, games);

      // Stale input gives a completely wrong result — the computation returns ~1520
      // instead of ~1808, an error of ~288 points. The direction doesn't matter;
      // what matters is that the stale baseline corrupts the output entirely.
      expect(correct.white.after).not.toBe(stale.white.after);
      expect(stale.white.after).toBeLessThan(correct.white.after);
    });

    it('symmetric: stale rating also corrupts the opponent result', () => {
      const { black: correctBlack } = computeElo(1800, 1600, 'win', 50, 50);
      const { black: staleBlack  } = computeElo(1500, 1600, 'win', 50, 50);
      expect(correctBlack.after).not.toBe(staleBlack.after);
    });
  });

  describe('kFactor', () => {
    it('provisional player (< 30 games) gets K=40', () => {
      expect(kFactor(1500, 0)).toBe(40);
      expect(kFactor(1500, 29)).toBe(40);
    });

    it('master (2400+) gets K=10', () => {
      expect(kFactor(2400, 100)).toBe(10);
    });

    it('standard player (2100–2399) gets K=20', () => {
      expect(kFactor(2100, 100)).toBe(20);
      expect(kFactor(2399, 100)).toBe(20);
    });

    it('regular player (< 2100, >= 30 games) gets K=32', () => {
      expect(kFactor(1500, 30)).toBe(32);
      expect(kFactor(2099, 100)).toBe(32);
    });
  });

  describe('expectedScore', () => {
    it('equal ratings give 0.5 expected score', () => {
      expect(expectedScore(1500, 1500)).toBeCloseTo(0.5);
    });

    it('higher-rated player has expected score > 0.5', () => {
      expect(expectedScore(1600, 1400)).toBeGreaterThan(0.5);
    });

    it('lower-rated player has expected score < 0.5', () => {
      expect(expectedScore(1400, 1600)).toBeLessThan(0.5);
    });
  });
});
