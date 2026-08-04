import { COLOR_THEMES, type ColorTheme } from '@cuewise/shared';

/** Every theme that paints its own colours instead of a photo. */
export const PLAIN_THEMES = (Object.keys(COLOR_THEMES) as ColorTheme[]).filter(
  (theme) => theme !== 'glass'
);
