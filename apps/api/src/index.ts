import { logger } from '@cuewise/shared';
import { Hono } from 'hono';
import type { Env } from './env';
import { problem } from './problems';

export type AppDeps = {};

export function createApp(_deps: AppDeps = {}): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/v1/health', (c) => {
    return c.json({ status: 'ok' });
  });
  app.notFound(() => {
    return problem('not_found');
  });
  app.onError((err) => {
    logger.error('Unhandled API error', err);
    return problem('internal');
  });
  return app;
}

export default createApp();
