import { describe, expect, it } from 'vitest';
import { getBackgroundFilterStyle } from './background-filter';

describe('getBackgroundFilterStyle', () => {
  it('returns an empty style at the defaults so the DOM is unchanged', () => {
    expect(getBackgroundFilterStyle(0, 0)).toEqual({});
  });

  it('maps dim to a brightness filter without any transform', () => {
    expect(getBackgroundFilterStyle(40, 0)).toEqual({ filter: 'brightness(0.6)' });
  });

  it('maps blur to a blur filter and bleeds the layer past the edges to hide the halo', () => {
    expect(getBackgroundFilterStyle(0, 8)).toEqual({
      filter: 'blur(8px)',
      margin: '-16px',
    });
  });

  it('combines dim and blur into a single filter declaration', () => {
    expect(getBackgroundFilterStyle(40, 8)).toEqual({
      filter: 'brightness(0.6) blur(8px)',
      margin: '-16px',
    });
  });

  it('avoids floating point artifacts for dim values that do not divide evenly', () => {
    expect(getBackgroundFilterStyle(33, 0)).toEqual({ filter: 'brightness(0.67)' });
  });

  it('clamps dim to the 0-100 range', () => {
    expect(getBackgroundFilterStyle(150, 0)).toEqual({ filter: 'brightness(0)' });
    expect(getBackgroundFilterStyle(-10, 0)).toEqual({});
  });

  it('clamps blur to the 0-20 range', () => {
    expect(getBackgroundFilterStyle(0, 50)).toEqual({
      filter: 'blur(20px)',
      margin: '-40px',
    });
    expect(getBackgroundFilterStyle(0, -5)).toEqual({});
  });
});
