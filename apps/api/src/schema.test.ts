import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('D1 schema', () => {
  it('creates all six tables', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'd1\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name"
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual([
      'auth_codes',
      'identities',
      'key_envelopes',
      'records',
      'tokens',
      'users',
    ]);
  });
});
