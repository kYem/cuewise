import { logger } from '@cuewise/shared';

// Shared between the posture controller (writes) and the glow windows (read) —
// same-origin localStorage is the IPC-free channel into the isolated overlays.
export const GLOW_INTENSITY_KEY = 'cuewise.posture.glowIntensity';
export const GLOW_STYLE_KEY = 'cuewise.posture.glowStyle';

export type GlowIntensity = 'subtle' | 'standard' | 'intense';

/** The nudge's visual treatment: soft edge glow, crisp border ring, or a tint. */
export type GlowStyle = 'glow' | 'border' | 'tint';

export function readGlowIntensity(): GlowIntensity {
  try {
    const value = localStorage.getItem(GLOW_INTENSITY_KEY);
    if (value === 'subtle' || value === 'standard' || value === 'intense') {
      return value;
    }
    if (value === 'strong') {
      // Legacy tier from the 4-level scale; its look is today's standard.
      return 'standard';
    }
  } catch (error) {
    // A pref read must never break an overlay — default below, but leave a trace.
    logger.warn('Glow intensity unreadable — using the default', { error });
  }
  return 'standard';
}

export function readGlowStyle(): GlowStyle {
  try {
    const value = localStorage.getItem(GLOW_STYLE_KEY);
    if (value === 'glow' || value === 'border' || value === 'tint') {
      return value;
    }
  } catch (error) {
    // Same rationale as readGlowIntensity.
    logger.warn('Glow style unreadable — using the default', { error });
  }
  return 'glow';
}

/** Vignette class list for a style/intensity pair; the base covers glow + standard. */
export function glowVignetteClassName(style: GlowStyle, intensity: GlowIntensity): string {
  const classes = ['glow-vignette'];
  if (style !== 'glow') {
    classes.push(`glow-style-${style}`);
  }
  if (intensity !== 'standard') {
    classes.push(`glow-vignette--${intensity}`);
  }
  return classes.join(' ');
}
