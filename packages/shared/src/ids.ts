/**
 * Time-sortable `timestamp-suffix` id. Suffix uses getRandomValues (CSPRNG) —
 * unlike crypto.randomUUID(), it also works from insecure contexts.
 */
export function generateId(): string {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(9)), (byte) =>
    (byte % 36).toString(36)
  ).join('');
  return `${Date.now()}-${suffix}`;
}
