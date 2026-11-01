/** Dedupe (dropping falsy values) and locale-sort a list of strings. */
export function uniqueSorted(values: (string | undefined | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b)
  );
}

/** Append a trimmed tag, deduped case-insensitively. Returns the same array on no-op. */
export function addTag(tags: string[], value: string): string[] {
  const next = value.trim().replace(/,$/, '');
  if (next.length === 0 || tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) {
    return tags;
  }
  return [...tags, next];
}
