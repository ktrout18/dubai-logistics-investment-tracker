/**
 * Exact area unit conversion.
 *
 * Each factor is held as an integer ratio (numerator / power-of-ten
 * denominator) taken from the international definitions:
 *   1 ft    = 0.3048 m            → 1 sq ft  = 0.09290304 m²       (exact)
 *   1 acre  = 4046.8564224 m²     (international acre, exact)
 *   1 ha    = 10 000 m²           (exact)
 * Multiplying an integer-valued input by the integer numerator is exact in
 * IEEE-754 doubles (below 2^53), and a single division by a power of ten
 * returns the correctly rounded double of the true decimal result, so
 * e.g. `toSquareMetres(1_000_000, 'sqft') === 92903.04`.
 */
import type { AreaUnit } from './schema.ts';

interface Ratio {
  num: number;
  den: number;
}

/** m² per unit, as exact integer ratios. */
export const M2_PER_UNIT: Readonly<Record<AreaUnit, Ratio>> = {
  sqm: { num: 1, den: 1 },
  sqft: { num: 9_290_304, den: 100_000_000 },
  hectare: { num: 10_000, den: 1 },
  acre: { num: 40_468_564_224, den: 10_000_000 },
};

/** Decimal factor (m² per unit) for display purposes. */
export function m2PerUnit(unit: AreaUnit): number {
  const r = M2_PER_UNIT[unit];
  return r.num / r.den;
}

function decimals(x: number): number {
  if (Number.isInteger(x)) return 0;
  const s = String(x);
  if (s.includes('e')) return 15;
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
}

/**
 * Convert `value` in `unit` to square metres, exactly as far as doubles allow.
 * Decimal inputs (e.g. 1.25 million sq ft written as 1250000 or 12.5 acres)
 * are scaled to integers first so the product stays exact.
 */
export function toSquareMetres(value: number, unit: AreaUnit): number {
  if (!Number.isFinite(value)) throw new RangeError('area value must be finite');
  const r = M2_PER_UNIT[unit];
  const d = Math.min(decimals(value), 10);
  const scale = 10 ** d;
  const intVal = Math.round(value * scale);
  const product = intVal * r.num;
  if (Number.isSafeInteger(product)) return product / (r.den * scale);
  return (value * r.num) / r.den;
}

/** Convert square metres to `unit` (inverse of `toSquareMetres`). */
export function fromSquareMetres(valueM2: number, unit: AreaUnit): number {
  if (!Number.isFinite(valueM2)) throw new RangeError('area value must be finite');
  const r = M2_PER_UNIT[unit];
  return (valueM2 * r.den) / r.num;
}

/** Round to `dp` decimal places (default 2) using half-away-from-zero on the decimal representation. */
export function roundTo(value: number, dp = 2): number {
  if (!Number.isFinite(value)) return value;
  // Shift via the decimal exponent (not by multiplying) so 1.005 → 1.01.
  const abs = Math.abs(value);
  if (String(abs).includes('e')) {
    const f = 10 ** dp;
    return (value < 0 ? -1 : 1) * (Math.round(abs * f) / f);
  }
  const shifted = Math.round(Number(`${abs}e${dp}`));
  const out = Number(`${shifted}e-${dp}`);
  return value < 0 ? -out : out;
}

/**
 * Tolerance used by the validator when comparing a stored `valueM2` to the
 * exact conversion of `originalValue`: the larger of 1 m² and 0.1 % of the
 * exact value. This allows sources' and editors' rounding but catches unit
 * mix-ups (sq ft vs m² differ by ~10.76×).
 */
export function conversionTolerance(exactM2: number): number {
  return Math.max(1, Math.abs(exactM2) * 0.001);
}

/** True when `storedM2` matches the exact conversion of (originalValue, unit) within tolerance. */
export function conversionMatches(storedM2: number, originalValue: number, unit: AreaUnit): boolean {
  const exact = toSquareMetres(originalValue, unit);
  return Math.abs(storedM2 - exact) <= conversionTolerance(exact);
}
