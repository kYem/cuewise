import { logger } from '@cuewise/shared';
import { D1SyncStore, TOMBSTONE_RETENTION_MS } from './d1-store';
import type { Env } from './env';
import app from './index';

// Deployment entry: the Hono app's fetch handler plus the scheduled tombstone purge (see the
// `triggers.crons` in wrangler.jsonc). `index.ts` stays the app so tests drive it directly.
export default {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    try {
      const purged = await new D1SyncStore(env.DB).purgeTombstones(TOMBSTONE_RETENTION_MS);
      logger.info(`scheduled purge removed ${purged} tombstones past the retention window`);
    } catch (err) {
      // Annotate for a searchable log, then rethrow so Cloudflare still marks the cron failed.
      logger.error('scheduled tombstone purge failed', err);
      throw err;
    }
  },
} satisfies ExportedHandler<Env>;
