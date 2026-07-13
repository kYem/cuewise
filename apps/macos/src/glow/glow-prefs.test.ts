import { afterEach, describe, expect, it, vi } from 'vitest';
import { glowVignetteClassName, readGlowIntensity, readGlowStyle } from './glow-prefs';

vi.mock('@cuewise/shared', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function stubStorage(getItem: () => string | null): void {
  vi.stubGlobal('localStorage', { getItem });
}

describe('readGlowIntensity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a stored valid intensity', () => {
    stubStorage(() => 'subtle');
    expect(readGlowIntensity()).toBe('subtle');
    stubStorage(() => 'intense');
    expect(readGlowIntensity()).toBe('intense');
  });

  it('maps the legacy strong tier to standard', () => {
    stubStorage(() => 'strong');
    expect(readGlowIntensity()).toBe('standard');
  });

  it('falls back to standard for garbage values', () => {
    stubStorage(() => 'blinding');
    expect(readGlowIntensity()).toBe('standard');
  });

  it('falls back to standard when nothing is stored', () => {
    stubStorage(() => null);
    expect(readGlowIntensity()).toBe('standard');
  });

  it('falls back to standard when storage throws', () => {
    stubStorage(() => {
      throw new Error('storage disabled');
    });
    expect(readGlowIntensity()).toBe('standard');
  });
});

describe('readGlowStyle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a stored valid style', () => {
    stubStorage(() => 'border');
    expect(readGlowStyle()).toBe('border');
    stubStorage(() => 'tint');
    expect(readGlowStyle()).toBe('tint');
  });

  it('falls back to glow for garbage, missing, or throwing storage', () => {
    stubStorage(() => 'confetti');
    expect(readGlowStyle()).toBe('glow');
    stubStorage(() => null);
    expect(readGlowStyle()).toBe('glow');
    stubStorage(() => {
      throw new Error('storage disabled');
    });
    expect(readGlowStyle()).toBe('glow');
  });
});

describe('glowVignetteClassName', () => {
  it('emits only the base class for the default glow/standard pair', () => {
    expect(glowVignetteClassName('glow', 'standard')).toBe('glow-vignette');
  });

  it('adds a style modifier for non-glow styles', () => {
    expect(glowVignetteClassName('border', 'standard')).toBe('glow-vignette glow-style-border');
  });

  it('adds an intensity modifier for non-standard intensities', () => {
    expect(glowVignetteClassName('glow', 'subtle')).toBe('glow-vignette glow-vignette--subtle');
  });

  it('combines both modifiers on one element for the compound CSS selectors', () => {
    expect(glowVignetteClassName('tint', 'intense')).toBe(
      'glow-vignette glow-style-tint glow-vignette--intense'
    );
  });
});
