import { describe, expect, it } from 'vitest';
import { addTag, uniqueSorted } from './utils';

describe('uniqueSorted', () => {
  it('dedupes and locale-sorts, dropping falsy values', () => {
    expect(uniqueSorted(['b', 'a', 'b', '', undefined, null, 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for all-falsy input', () => {
    expect(uniqueSorted([undefined, null, ''])).toEqual([]);
  });
});

describe('addTag', () => {
  it('appends a trimmed tag', () => {
    expect(addTag(['a'], '  b  ')).toEqual(['a', 'b']);
  });

  it('strips a trailing comma', () => {
    expect(addTag([], 'redis,')).toEqual(['redis']);
  });

  it('dedupes case-insensitively, keeping the existing tag', () => {
    expect(addTag(['HTTP'], 'http')).toEqual(['HTTP']);
  });

  it('returns the same array (no-op) for empty/whitespace/comma-only input', () => {
    const tags = ['a'];
    expect(addTag(tags, '   ')).toBe(tags);
    expect(addTag(tags, ',')).toBe(tags);
  });
});
