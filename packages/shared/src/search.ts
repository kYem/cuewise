/**
 * Case-insensitive substring match of `query` against a set of text fields
 * (null/undefined fields are ignored). An empty/whitespace query matches
 * everything. Shared by the deck-management pages so their search stays
 * consistent — each page passes its own fields.
 */
export function matchesSearchQuery(fields: (string | undefined | null)[], query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return fields.some((field) => (field ?? '').toLowerCase().includes(normalized));
}
