/** Hosts a development build reaches: the Vite dev server, plus the sync API when sync is on. */
export function devHostPermissions(syncApiBaseUrl: string): string[] {
  const hosts = ['http://localhost:5173/*'];
  if (syncApiBaseUrl !== '') {
    hosts.push(`${new URL(syncApiBaseUrl).origin}/*`);
  }
  return hosts;
}
