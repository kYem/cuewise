import { describe, expect, it } from 'vitest';
import confetti from './confetti.json';

describe('confetti.json', () => {
  it('has the required top-level Lottie fields', () => {
    expect(typeof confetti.v).toBe('string'); // bodymovin version
    expect(typeof confetti.fr).toBe('number'); // frame rate
    expect(typeof confetti.ip).toBe('number'); // in point
    expect(typeof confetti.op).toBe('number'); // out point
    expect(typeof confetti.w).toBe('number'); // width
    expect(typeof confetti.h).toBe('number'); // height
  });

  it('contains at least one layer', () => {
    expect(Array.isArray(confetti.layers)).toBe(true);
    expect(confetti.layers.length).toBeGreaterThan(0);
  });

  it('is a finite, non-looping clip (op > ip)', () => {
    expect(confetti.op).toBeGreaterThan(confetti.ip);
  });

  it('contains no Lottie expressions (CSP-safe for the lottie_light build)', () => {
    // Lottie expressions are string-valued `x` fields; easing handles use numeric
    // `x`. Guards the documented asset-swap path from breaking MV3 CSP.
    const serialized = JSON.stringify(confetti);
    expect(serialized).not.toMatch(/"x":"/);
  });
});
