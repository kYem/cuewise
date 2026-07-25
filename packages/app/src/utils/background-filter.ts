import { BACKGROUND_EFFECT_BOUNDS } from '@cuewise/shared';
import type { CSSProperties } from 'react';

export const MAX_BACKGROUND_DIM = BACKGROUND_EFFECT_BOUNDS.backgroundDim.max;
export const MAX_BACKGROUND_BLUR_PX = BACKGROUND_EFFECT_BOUNDS.backgroundBlur.max;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Filter style for a background image layer. Defaults (0, 0) return an empty
 * object so untouched settings leave the DOM exactly as before.
 */
export function getBackgroundFilterStyle(dim: number, blur: number): CSSProperties {
  const clampedDim = clamp(dim, 0, MAX_BACKGROUND_DIM);
  const clampedBlur = clamp(blur, 0, MAX_BACKGROUND_BLUR_PX);

  const filters: string[] = [];
  if (clampedDim > 0) {
    // Integer math ((100 - dim) / 100) avoids float artifacts like 0.6699999….
    filters.push(`brightness(${(100 - clampedDim) / 100})`);
  }
  if (clampedBlur > 0) {
    filters.push(`blur(${clampedBlur}px)`);
  }

  if (filters.length === 0) {
    return {};
  }

  const style: CSSProperties = { filter: filters.join(' ') };
  if (clampedBlur > 0) {
    // Bleed the layer past every edge by 2× the blur radius (≈2σ of the Gaussian),
    // so the blurred edge falloff lands off-screen instead of showing as a halo band.
    // The layers pin all four inset-0 edges, so negative margin expands them outward.
    // Consumers must be position:fixed or sit inside a clipping (overflow-hidden)
    // parent, or the bleed extends the nearest scroll container's scrollable area.
    style.margin = `-${2 * clampedBlur}px`;
  }
  return style;
}
