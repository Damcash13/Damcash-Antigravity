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
      // 1234.56 cannot be represented exactly in IEEE 754 double precision
      expect((1234.56).toPrecision(20)).not.toBe('1234.5600000000000000');
      // Repeated arithmetic operations accumulate drift: 0.1 + 0.2 + 0.3 should be 0.6
      const driftTest = 0.1 + 0.2 + 0.3;
      expect(driftTest).not.toBe(0.6); // actual: 0.6000000000000001
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
      // toString() normalises trailing zeros ('0.10' → '0.1'); toFixed(2) preserves them
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
      // toString() normalises trailing zeros; toFixed(2) is the money-safe format
      expect(a.plus(b).toString()).toBe('0.3');
      expect(a.plus(b).toFixed(2)).toBe('0.30');
    });

    it('Decimal(12,2) supports values up to 9999999999.99', () => {
      const max = new Prisma.Decimal('9999999999.99');
      expect(max.toString()).toBe('9999999999.99');
    });
  });
});
