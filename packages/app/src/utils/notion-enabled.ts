/** Whether this build ships the Notion integration; off unless a client id was supplied. */
export function isNotionEnabled(): boolean {
  return (import.meta.env.VITE_NOTION_CLIENT_ID ?? '').trim() !== '';
}
