import { Hono } from 'hono';
import type { Env } from './env';

export type AppDeps = {};

export function createApp(_deps: AppDeps = {}): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.get('/v1/health', (c) => {
    return c.json({ status: 'ok' });
  });
  return app;
}

export default createApp();
