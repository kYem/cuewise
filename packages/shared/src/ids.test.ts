import { describe, expect, it } from 'vitest';
import { generateId } from './ids';

describe('generateId', () => {
  it('returns a timestamp-suffix id with a 9-char base36 suffix', () => {
    expect(generateId()).toMatch(/^\d+-[a-z0-9]{9}$/);
  });

  it('generates unique ids across many calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });
});
