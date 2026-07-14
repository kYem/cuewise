import { configurePlatform, getSyncSink } from '@cuewise/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeKvStore } from './__fixtures__/fake-kv-store';
import { FakeScheduler } from './__fixtures__/fake-scheduler';
import { createSyncEngine } from './create-engine';

describe('createSyncEngine', () => {
  afterEach(() => {
    configurePlatform({ syncSink: null });
  });

  it('wires ApiClient + SessionManager + SyncEngine so enableSync calls the given baseUrl', async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input) => {
      calls.push(typeof input === 'string' ? input : input.toString());
      return new Response(JSON.stringify({ token: 'fake-session-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const engine = createSyncEngine({
      baseUrl: 'https://sync.example.test',
      keyStore: new FakeKvStore(),
      scheduler: new FakeScheduler(),
      fetchFn,
    });

    expect(engine.getStatus()).toBe('disabled');

    // exchangeToken is the first real network call enableSync makes; asserting it hit the
    // configured baseUrl proves the factory actually threaded baseUrl through to ApiClient
    // rather than e.g. constructing it with a hardcoded or empty one. The call after it
    // (getRecoveryEnvelope) fails against this stub's canned body, so the overall call
    // rejects — irrelevant to what this test is verifying.
    await expect(engine.enableSync('dev', 'dev-cred', 'Test Device')).rejects.toThrow();
    expect(calls[0]).toBe('https://sync.example.test/v1/auth/token');
  });

  it('self-registers the constructed engine as the platform sync sink', () => {
    const engine = createSyncEngine({
      baseUrl: 'https://sync.example.test',
      keyStore: new FakeKvStore(),
      scheduler: new FakeScheduler(),
    });

    expect(getSyncSink()).toBe(engine);
  });
});
