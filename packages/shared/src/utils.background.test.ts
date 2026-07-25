import { describe, expect, it } from 'vitest';
import { BACKGROUND_EFFECT_BOUNDS } from './constants';
import { clampBackgroundEffects } from './utils';

describe('clampBackgroundEffects', () => {
  it('leaves in-range values untouched', () => {
    expect(clampBackgroundEffects({ backgroundDim: 40, backgroundBlur: 8 })).toEqual({
      backgroundDim: 40,
      backgroundBlur: 8,
    });
  });

  it('clamps values above the bounds', () => {
    expect(clampBackgroundEffects({ backgroundDim: 500, backgroundBlur: 100 })).toEqual({
      backgroundDim: BACKGROUND_EFFECT_BOUNDS.backgroundDim.max,
      backgroundBlur: BACKGROUND_EFFECT_BOUNDS.backgroundBlur.max,
    });
  });

  it('clamps values below the bounds', () => {
    expect(clampBackgroundEffects({ backgroundDim: -10, backgroundBlur: -5 })).toEqual({
      backgroundDim: 0,
      backgroundBlur: 0,
    });
  });

  it('rounds fractional values', () => {
    expect(clampBackgroundEffects({ backgroundDim: 39.6 })).toEqual({ backgroundDim: 40 });
  });

  it('heals NaN to the minimum instead of persisting corruption', () => {
    expect(clampBackgroundEffects({ backgroundDim: Number.NaN })).toEqual({ backgroundDim: 0 });
  });

  it('passes through patches that do not touch background effects', () => {
    expect(clampBackgroundEffects({ showClock: true })).toEqual({ showClock: true });
  });
});
