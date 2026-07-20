import { describe, expect, it } from 'vitest';
import { computeScaledDimensions, MAX_BACKGROUND_DIMENSION } from './custom-background';

describe('computeScaledDimensions', () => {
  it('leaves an image already within the limit untouched', () => {
    expect(computeScaledDimensions(1280, 720, 1920)).toEqual({ width: 1280, height: 720 });
  });

  it('scales a too-wide image down to the limit', () => {
    expect(computeScaledDimensions(3840, 2160, 1920)).toEqual({ width: 1920, height: 1080 });
  });

  it('preserves the aspect ratio when scaling', () => {
    const { width, height } = computeScaledDimensions(3000, 1000, 1500);
    expect(width / height).toBeCloseTo(3, 5);
  });

  it('rounds to whole pixels, since canvas cannot draw fractions', () => {
    const { width, height } = computeScaledDimensions(1000, 333, 500);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
  });

  it('scales a portrait image by its longest side', () => {
    expect(computeScaledDimensions(1000, 4000, 2000)).toEqual({ width: 500, height: 2000 });
  });

  it('never collapses a very wide, short image to zero height', () => {
    const { height } = computeScaledDimensions(10000, 5, 1920);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it('defaults to a bound that covers common displays without bloating storage', () => {
    expect(MAX_BACKGROUND_DIMENSION).toBe(1920);
  });

  it('never yields a zero dimension for an image reporting no intrinsic size', () => {
    // An SVG without width/height reports naturalWidth 0; a 0-wide canvas encodes to "data:,".
    expect(computeScaledDimensions(0, 0, 1920)).toEqual({ width: 1, height: 1 });
  });

  it('floors a sub-pixel dimension that is already inside the bound', () => {
    expect(computeScaledDimensions(0.4, 800, 1920)).toEqual({ width: 1, height: 800 });
  });
});
