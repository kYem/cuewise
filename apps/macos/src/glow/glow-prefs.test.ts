import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGlowIntensity } from './glow-prefs';

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
