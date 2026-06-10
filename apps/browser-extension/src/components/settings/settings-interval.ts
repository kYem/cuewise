/** Quote-interval bounds: 10 seconds to 1 hour. */
const MIN_INTERVAL = 10;
const MAX_INTERVAL = 3600;

/**
 * Parse a custom quote-interval entry into clamped seconds, or null when the
 * input is empty or non-numeric (so an empty blur leaves the value untouched
 * rather than silently snapping it to the minimum).
 */
export function quoteIntervalToSeconds(raw: string, unit: 'sec' | 'min'): number | null {
  if (raw.trim() === '') {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const seconds = unit === 'min' ? Math.round(parsed) * 60 : Math.round(parsed);
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, seconds));
}
