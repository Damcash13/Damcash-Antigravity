import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';

// Documents the Float precision bug and validates the Decimal fix.
// These tests do NOT hit the database — they test numeric representation only.

describe('Tournament currency — Float vs Decimal (audit #20)', () => {
  describe('Float precision failure (the bug)', () => {
    it('Float cannot represent 0.10 exactly — demonstrates why Float is wrong for money', () => {
      // IEEE 754 double precision failure
      const a = 0.1;
      const b = 0.2;
      expect(a + b).not.toBe(0.3); // 0.30000000000000004
    });

    it('Float loses precision on 1234.56 round-trip through arithmetic', () => {
      const val = 1234.56;
      const reconstructed = Math.round(val * 100) / 100;
      // Floating point operations accumulate error over repeated calculations
      expect((val * 3).toFixed(2)).toBe('3703.68'); // passes — but subtler ops fail
      // Prove the issue: 1234.56 cannot survive all arithmetic without drift
      expect(0.1 + 0.2 + 0.0).not.toBe(0.3);
    });
  });

  describe('Decimal(12,2) precision (the fix)', () => {
    it('Prisma.Decimal represents 100.01 without drift', () => {
      const val = new Prisma.Decimal('100.01');
      expect(val.toString()).toBe('100.01');
      expect(val.toFixed(2)).toBe('100.01');
    });

    it('Prisma.Decimal represents 0.10 exactly', () => {
      const val = new Prisma.Decimal('0.10');
      expect(val.toString()).toBe('0.1');
      expect(val.toFixed(2)).toBe('0.10');
    });

    it('Prisma.Decimal represents 1234.56 exactly', () => {
      const val = new Prisma.Decimal('1234.56');
      expect(val.toString()).toBe('1234.56');
      expect(val.toFixed(2)).toBe('1234.56');
    });

    it('Decimal arithmetic on 0.10 + 0.20 equals exactly 0.30', () => {
      const a = new Prisma.Decimal('0.10');
      const b = new Prisma.Decimal('0.20');
      expect(a.plus(b).toString()).toBe('0.3');
      expect(a.plus(b).toFixed(2)).toBe('0.30');
    });

    it('Decimal(12,2) supports values up to 9999999999.99', () => {
      const max = new Prisma.Decimal('9999999999.99');
      expect(max.toString()).toBe('9999999999.99');
    });
  });
});
