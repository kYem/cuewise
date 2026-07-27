/**
 * Ties a schema to the interface it validates, at compile time. The interfaces stay
 * hand-written — inferring them would churn hundreds of imports — so two descriptions drift.
 */

/**
 * Blind to *optional* fields: `{id: string}` and `{id: string; note?: T}` are mutually
 * assignable. Safe only because readers return the original value, never zod's parsed copy.
 */
type Matches<Schema, Interface> = [Schema] extends [Interface]
  ? [Interface] extends [Schema]
    ? true
    : false
  : false;

/**
 * The mismatch has to land on a *parameter*: a `never` return type is still callable.
 *
 * @example assertNoDrift<z.infer<typeof quoteSchema>, Quote>();
 */
export function assertNoDrift<Schema, Interface>(
  ..._drift: Matches<Schema, Interface> extends true
    ? []
    : [error: 'schema and interface describe different shapes']
): void {
  // Type-level only.
}
