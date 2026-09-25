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
    const store = new D1SyncStore(env.DB);
    const failures: unknown[] = [];
    async function run(name: string, job: () => Promise<string>): Promise<void> {
      try {
        logger.info(await job());
      } catch (err) {
        logger.error(`scheduled ${name} failed`, err);
        failures.push(err);
      }
    }
    await run('tombstone purge', async () => {
      const purged = await store.purgeTombstones(TOMBSTONE_RETENTION_MS);
      return `scheduled purge removed ${purged} tombstones past the retention window`;
    });
    await run('pairing purge', async () => {
      const purged = await store.purgeExpiredPairings(Date.now());
      return `scheduled purge removed ${purged} expired pairing requests`;
    });
    await run('sign-in code purge', async () => {
      const purged = await store.purgeExpiredSignInCodes(Date.now());
      return `scheduled purge removed ${purged} expired sign-in codes`;
    });
    await run('parked-grant purge', async () => {
      const sweep = await revokeExpiredParkedGrants(
        store,
        createNotionClient(env),
        env,
        Date.now()
      );
      return `scheduled purge swept ${sweep.swept} unclaimed notion grants: ${sweep.revoked} revoked, ${sweep.failed} left to retry, ${sweep.abandoned} abandoned`;
    });
    // After every job has run, so one failing purge cannot starve the others; the throw still
    // marks the cron failed in Cloudflare.
    if (failures.length > 0) {
      throw new AggregateError(failures, `${failures.length} scheduled purge(s) failed`);
    }
  },
} satisfies ExportedHandler<Env>;
