/** Stand-in key material: these tests assert placement on the wire, not that it is real base64url. */
export function wire<T extends string>(value: string): T {
  return value as T;
}
