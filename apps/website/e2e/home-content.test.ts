import { describe, expect, it } from 'vitest';
import { DEMO_STEPS } from '../public/scripts/demo-remote.js';
import { DOCK_STEPS, INSIDE_GROUPS } from '../src/lib/home-content';

describe('home content', () => {
  it('has one dock step per demo step, in the same order', () => {
    expect(DOCK_STEPS.map((step) => step.key)).toEqual([...DEMO_STEPS]);
  });

  it('lists twelve capabilities in three groups of four', () => {
    expect(INSIDE_GROUPS.map((group) => group.rows.length)).toEqual([4, 4, 4]);
  });

  it('keeps the terms the old homepage already used', () => {
    const copy = JSON.stringify(INSIDE_GROUPS).toLowerCase();
    for (const term of [
      'spaced-repetition',
      'active recall',
      'starter packs',
      'collections',
      'favorite',
      'trends',
    ]) {
      expect(copy).toContain(term);
    }
  });
});
