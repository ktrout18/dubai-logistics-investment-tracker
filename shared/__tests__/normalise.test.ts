import { describe, expect, it } from 'vitest';
import { KNOWN_ZONES, companyKey, deriveCompanies, findKnownZone, isHttpUrl, normaliseUrl, normaliseZone } from '../index.ts';

describe('zones', () => {
  it('maps aliases to canonical names', () => {
    expect(normaliseZone('JAFZA')).toBe('Jafza');
    expect(normaliseZone('Jebel Ali Free Zone')).toBe('Jafza');
    expect(normaliseZone('Dubai South Logistics District')).toBe('Dubai South – Logistics District');
    expect(normaliseZone('dubai south - logistics district')).toBe('Dubai South – Logistics District');
    expect(normaliseZone('Dubai Investments Park')).toBe('DIP');
    expect(normaliseZone('Technopark')).toBe('National Industries Park');
    expect(normaliseZone('Dubai Commercity')).toBe('Dubai CommerCity');
    expect(normaliseZone('DIC')).toBe('Dubai Industrial City');
  });

  it('keeps unknown zones (trimmed)', () => {
    expect(normaliseZone('  Some   New Zone ')).toBe('Some New Zone');
    expect(findKnownZone('Some New Zone')).toBeUndefined();
  });

  it('has no alias collisions', () => {
    const seen = new Map<string, string>();
    for (const z of KNOWN_ZONES) {
      for (const a of [z.name, ...z.aliases]) {
        const k = a.toLowerCase();
        if (seen.has(k)) expect(seen.get(k)).toBe(z.name);
        seen.set(k, z.name);
      }
    }
  });
});

describe('companies', () => {
  it('companyKey strips legal suffixes', () => {
    expect(companyKey('DP World Limited')).toBe('dp world');
    expect(companyKey('Aramex PJSC')).toBe('aramex');
    expect(companyKey('Emaar Properties L.L.C.')).toBe('emaar properties');
    expect(companyKey('Al-Futtaim Group')).toBe('al futtaim');
  });

  it('deriveCompanies de-duplicates by key, keeping first spelling', () => {
    expect(deriveCompanies({ developer: 'DP World', operator: 'DP World Limited', investor: ' ADQ ' })).toEqual(['DP World', 'ADQ']);
    expect(deriveCompanies({}, ['  '])).toEqual([]);
  });
});

describe('urls', () => {
  it('normalises for comparison', () => {
    expect(normaliseUrl('HTTPS://WWW.Example.com/a/b/?utm_source=x&b=2&a=1#frag')).toBe('https://example.com/a/b?a=1&b=2');
    expect(normaliseUrl('https://example.com/')).toBe('https://example.com');
    expect(normaliseUrl('not a url')).toBe('not a url');
  });

  it('accepts only absolute http(s)', () => {
    expect(isHttpUrl('https://example.com/x')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('example.com/x')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
  });
});
