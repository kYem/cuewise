/**
 * Ties a schema to the interface it validates, at compile time.
 *
 * The interfaces in `types.ts` stay hand-written — they are imported in hundreds of places
 * and inferring them from schemas would churn every one — so the schema is a second
 * description of the same shape, and two descriptions drift. `assertNoDrift` makes that
 * drift a type error at the point of definition rather than a runtime surprise months
 * later: add a field to the interface and its schema stops matching, and vice versa.
 */

/** Mutual assignability. Catches an added, removed or retyped field in either direction. */
type Matches<Schema, Interface> = [Schema] extends [Interface]
  ? [Interface] extends [Schema]
    ? true
    : false
  : false;

/**
 * Compiles to a no-op when the two agree. When they disagree it demands an argument that
 * cannot be produced, so the call fails with "Expected 1 arguments, but got 0".
 *
 * The mismatch has to land on a *parameter*: a function whose return type is `never` is
 * still perfectly callable, so expressing the failure as a return type catches nothing.
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
