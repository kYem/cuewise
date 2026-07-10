import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import app from '../index';

describe('GET /v1/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.request('/v1/health', {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
