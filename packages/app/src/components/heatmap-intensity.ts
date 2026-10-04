const primaryAt = (percent: number) =>
  `color-mix(in oklch, var(--color-primary-600) ${percent}%, transparent)`;

/** One hue at rising strength, so the steps stay apart on glass and dark surfaces too. */
export const INTENSITY_COLORS = {
  none: 'var(--color-surface-variant)',
  low: primaryAt(30),
  medium: primaryAt(55),
  high: primaryAt(78),
  peak: primaryAt(100),
} as const;

export type IntensityLevel = keyof typeof INTENSITY_COLORS;

export const FILLED_INTENSITY_LEVELS: IntensityLevel[] = ['low', 'medium', 'high', 'peak'];

export function intensityLevel(value: number, max: number): IntensityLevel {
  if (value === 0) {
    return 'none';
  }
  const intensity = (value / max) * 100;
  if (intensity < 25) {
    return 'low';
  }
  if (intensity < 50) {
    return 'medium';
  }
  if (intensity < 75) {
    return 'high';
  }
  return 'peak';
}
