/** Stand-in key material: callers assert placement on the wire, so it need not be real base64url. */
export function wire<T extends string>(value: string): T {
  return value as T;
}
