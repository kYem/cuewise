import { describe, expect, it } from 'vitest';
import { MAX_REQUEST_BODY_BYTES, parseJsonBody } from './http';

function context(opts: { contentLength?: string; json: () => Promise<unknown> }) {
  return {
    req: {
      header: (name: string) => (name === 'Content-Length' ? opts.contentLength : undefined),
      json: opts.json,
    },
  };
}

describe('parseJsonBody', () => {
  it('rejects an over-cap Content-Length with 413 before the body is ever parsed', async () => {
    let parsed = false;
    const res = await parseJsonBody(
      context({
        contentLength: String(MAX_REQUEST_BODY_BYTES + 1),
        json: async () => {
          parsed = true;
          return {};
        },
      })
    );
    expect(res).toBeInstanceOf(Response);
    if (!(res instanceof Response)) {
      throw new Error('expected a Response');
    }
    expect(res.status).toBe(413);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('payload_too_large');
    expect(parsed).toBe(false);
  });

  it('parses a normally-sized JSON body', async () => {
    const res = await parseJsonBody(
      context({ contentLength: '20', json: async () => ({ ok: true }) })
    );
    expect(res).toEqual({ ok: true });
  });

  it('returns 400 invalid_request when the body is not JSON', async () => {
    const res = await parseJsonBody(
      context({
        json: async () => {
          throw new Error('bad json');
        },
      })
    );
    expect(res).toBeInstanceOf(Response);
    if (!(res instanceof Response)) {
      throw new Error('expected a Response');
    }
    expect(res.status).toBe(400);
    const body = await res.json<{ code: string }>();
    expect(body.code).toBe('invalid_request');
  });
});
