// Shared between the posture controller (writes) and the glow windows (read) —
// same-origin localStorage is the IPC-free channel into the isolated overlays.
export const GLOW_INTENSITY_KEY = 'cuewise.posture.glowIntensity';

export type GlowIntensity = 'subtle' | 'standard';

export function readGlowIntensity(): GlowIntensity {
  try {
    const value = localStorage.getItem(GLOW_INTENSITY_KEY);
    if (value === 'subtle' || value === 'standard') {
      return value;
    }
  } catch {
    // Storage unavailable — fall through to the default; kept logger-free so the
    // glow windows stay dependency-light.
  }
  return 'standard';
}
