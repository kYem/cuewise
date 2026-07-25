import type { CSSProperties } from 'react';

export const MAX_BACKGROUND_DIM = 100;
export const MAX_BACKGROUND_BLUR_PX = 20;

/** Oversize the blurred layer so its soft edges bleed off-screen instead of haloing. */
const BLUR_EDGE_SCALE = 'scale(1.05)';

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
    style.transform = BLUR_EDGE_SCALE;
  }
  return style;
}
