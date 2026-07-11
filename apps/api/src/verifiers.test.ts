import { describe, expect, it } from 'vitest';
import { parseClientIds } from './verifiers';

describe('parseClientIds', () => {
  it('splits on comma and trims whitespace around each entry', () => {
    expect(parseClientIds('a, b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseClientIds('')).toEqual([]);
  });
});
