import { describe, expect, it } from 'vitest';
import { COUNTRIES, countryMatches, countryName } from '../lib/countries';

describe('countries list', () => {
  it('includes Côte d’Ivoire with ISO code CI', () => {
    expect(countryName('CI')).toBe("Côte d'Ivoire");
    expect(COUNTRIES.some(country => country.code === 'CI')).toBe(true);
  });

  it('finds Côte d’Ivoire with accent-free and English alias searches', () => {
    const ivoryCoast = COUNTRIES.find(country => country.code === 'CI');
    expect(ivoryCoast).toBeTruthy();
    expect(countryMatches(ivoryCoast!, 'cote')).toBe(true);
    expect(countryMatches(ivoryCoast!, 'ivory coast')).toBe(true);
  });
});
