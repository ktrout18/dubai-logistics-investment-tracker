import { describe, expect, it } from 'vitest';
import { conversionMatches, fromSquareMetres, m2PerUnit, roundTo, toSquareMetres } from '../index.ts';

describe('exact unit conversion', () => {
  it('uses the exact international factors', () => {
    expect(m2PerUnit('sqft')).toBe(0.09290304);
    expect(m2PerUnit('acre')).toBe(4046.8564224);
    expect(m2PerUnit('hectare')).toBe(10_000);
    expect(m2PerUnit('sqm')).toBe(1);
  });

  it('converts without floating-point noise', () => {
    expect(toSquareMetres(1, 'sqft')).toBe(0.09290304);
    expect(toSquareMetres(1_000_000, 'sqft')).toBe(92903.04);
    expect(toSquareMetres(538_000, 'sqft')).toBe(49981.83552);
    expect(toSquareMetres(1.2e6, 'sqft')).toBe(111483.648);
    expect(toSquareMetres(10.5, 'sqft')).toBe(0.97548192);
    expect(toSquareMetres(1, 'acre')).toBe(4046.8564224);
    expect(toSquareMetres(12.5, 'acre')).toBe(50585.70528);
    expect(toSquareMetres(20, 'acre')).toBe(80937.128448);
    expect(toSquareMetres(2.5, 'hectare')).toBe(25_000);
    expect(toSquareMetres(0.1, 'hectare')).toBe(1_000);
    expect(toSquareMetres(123_456, 'sqm')).toBe(123_456);
    // naive float multiplication would give 0.30000000000000004-style noise here
    expect(toSquareMetres(3, 'sqft')).toBe(0.27870912);
  });

  it('round-trips', () => {
    expect(fromSquareMetres(92903.04, 'sqft')).toBeCloseTo(1_000_000, 6);
    expect(fromSquareMetres(10_000, 'hectare')).toBe(1);
    expect(fromSquareMetres(4046.8564224, 'acre')).toBe(1);
  });

  it('tolerance accepts rounding but catches unit mix-ups', () => {
    expect(conversionMatches(49981.84, 538_000, 'sqft')).toBe(true);
    expect(conversionMatches(49_982, 538_000, 'sqft')).toBe(true);
    expect(conversionMatches(50_000, 538_000, 'sqft')).toBe(true); // 0.04 % — source rounding
    expect(conversionMatches(538_000, 538_000, 'sqft')).toBe(false);
    expect(conversionMatches(50_100, 538_000, 'sqft')).toBe(false); // 0.24 %
  });

  it('roundTo', () => {
    expect(roundTo(49981.83552, 2)).toBe(49981.84);
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
  });

  it('rejects non-finite input', () => {
    expect(() => toSquareMetres(Number.NaN, 'sqft')).toThrow();
  });
});
