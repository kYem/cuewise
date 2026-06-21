import { describe, expect, it } from 'vitest';
import { matchesSearchQuery } from './search';

describe('matchesSearchQuery', () => {
  it('matches case-insensitively against any field', () => {
    expect(matchesSearchQuery(['Saga pattern', 'compensating txns'], 'SAGA')).toBe(true);
    expect(matchesSearchQuery(['Saga pattern', 'compensating txns'], 'compensat')).toBe(true);
    expect(matchesSearchQuery(['Saga pattern'], '  saga  ')).toBe(true); // the query is trimmed
  });

  it('returns false when no field contains the query', () => {
    expect(matchesSearchQuery(['Saga pattern', 'compensating txns'], 'idempotency')).toBe(false);
  });

  it('treats an empty or whitespace query as matching everything', () => {
    expect(matchesSearchQuery(['anything'], '')).toBe(true);
    expect(matchesSearchQuery([], '   ')).toBe(true);
  });

  it('ignores null/undefined fields', () => {
    expect(matchesSearchQuery([undefined, null, 'DDIA book'], 'ddia')).toBe(true);
    expect(matchesSearchQuery([undefined, null], 'x')).toBe(false);
  });
});
