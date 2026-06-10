/**
 * Case-insensitive substring matcher for settings search.
 * Returns true when the filter is empty (everything matches) or when any of the
 * provided texts contains the trimmed query.
 */
export function settingsMatch(filter: string, ...texts: (string | undefined)[]): boolean {
  if (!filter || !filter.trim()) {
    return true;
  }
  const query = filter.trim().toLowerCase();
  return texts
    .filter((text): text is string => Boolean(text))
    .join(' ')
    .toLowerCase()
    .includes(query);
}
