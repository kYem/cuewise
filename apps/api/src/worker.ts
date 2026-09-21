import { logger } from '@cuewise/shared';
import { D1SyncStore, TOMBSTONE_RETENTION_MS } from './d1-store';
import type { Env } from './env';
import app from './index';
import { createNotionClient } from './notion-client';
import { revokeExpiredParkedGrants } from './routes/notion';

// Deployment entry: the Hono app's fetch handler plus the daily purges (see `triggers.crons` in
// wrangler.jsonc). `index.ts` stays the app so tests drive it directly.
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
    try {
      const purged = await new D1SyncStore(env.DB).purgeExpiredPairings(Date.now());
      logger.info(`scheduled purge removed ${purged} expired pairing requests`);
    } catch (err) {
      logger.error('scheduled pairing purge failed', err);
      throw err;
    }
    try {
      const sweep = await revokeExpiredParkedGrants(
        new D1SyncStore(env.DB),
        createNotionClient(env),
        env,
        Date.now()
      );
      logger.info(
        `scheduled purge swept ${sweep.swept} unclaimed notion grants: ${sweep.revoked} revoked, ${sweep.failed} not`
      );
    } catch (err) {
      logger.error('scheduled parked-grant purge failed', err);
      throw err;
    }
  },
} satisfies ExportedHandler<Env>;
