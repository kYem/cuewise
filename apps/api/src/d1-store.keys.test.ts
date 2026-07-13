import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { newUser } from './__fixtures__/api-test-helpers.fixtures';
import { D1SyncStore } from './d1-store';

describe('D1SyncStore key envelopes', () => {
  it('returns null before any envelope is stored', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'k1');
    await expect(store.getKeyEnvelope(userId, 'recovery')).resolves.toBeNull();
  });

  it('put then get round-trips the opaque envelope and stamps updatedAt', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'k2');
    await store.putKeyEnvelope(userId, 'recovery', 'v1.dk-1.aaaa.bbbb');
    const got = await store.getKeyEnvelope(userId, 'recovery');
    expect(got?.envelope).toBe('v1.dk-1.aaaa.bbbb');
    expect(got?.updatedAt).toBeGreaterThan(0);
  });

  it('put overwrites: regeneration replaces the previous blob', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'k3');
    await store.putKeyEnvelope(userId, 'recovery', 'v1.dk-1.old1.old2');
    await store.putKeyEnvelope(userId, 'recovery', 'v1.dk-1.new1.new2');
    const got = await store.getKeyEnvelope(userId, 'recovery');
    expect(got?.envelope).toBe('v1.dk-1.new1.new2');
  });

  it('envelopes are isolated per user and per kind', async () => {
    const store = new D1SyncStore(env.DB);
    const a = await newUser(store, 'k4a');
    const b = await newUser(store, 'k4b');
    await store.putKeyEnvelope(a, 'recovery', 'v1.dk-1.userA.blob');
    await expect(store.getKeyEnvelope(b, 'recovery')).resolves.toBeNull();
    await expect(store.getKeyEnvelope(a, 'device:x')).resolves.toBeNull();
  });

  it('deleteUser removes the envelope', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'k5');
    await store.putKeyEnvelope(userId, 'recovery', 'v1.dk-1.aaaa.bbbb');
    await store.deleteUser(userId);
    // A fresh identical identity gets a NEW user id; the old id must have nothing.
    await expect(store.getKeyEnvelope(userId, 'recovery')).resolves.toBeNull();
  });

  it('putKeyEnvelopeIfAbsent creates the row and returns true when none existed', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'k6');
    await expect(store.putKeyEnvelopeIfAbsent(userId, 'recovery', 'v1.dk-1.first')).resolves.toBe(
      true
    );
    const got = await store.getKeyEnvelope(userId, 'recovery');
    expect(got?.envelope).toBe('v1.dk-1.first');
  });

  it('putKeyEnvelopeIfAbsent returns false and leaves the existing row untouched', async () => {
    const store = new D1SyncStore(env.DB);
    const userId = await newUser(store, 'k7');
    await store.putKeyEnvelopeIfAbsent(userId, 'recovery', 'v1.dk-1.first');
    await expect(store.putKeyEnvelopeIfAbsent(userId, 'recovery', 'v1.dk-1.second')).resolves.toBe(
      false
    );
    const got = await store.getKeyEnvelope(userId, 'recovery');
    expect(got?.envelope).toBe('v1.dk-1.first');
  });

  it('putKeyEnvelopeIfAbsent is isolated per user', async () => {
    const store = new D1SyncStore(env.DB);
    const a = await newUser(store, 'k8a');
    const b = await newUser(store, 'k8b');
    await expect(store.putKeyEnvelopeIfAbsent(a, 'recovery', 'v1.dk-1.a-only')).resolves.toBe(true);
    await expect(store.putKeyEnvelopeIfAbsent(b, 'recovery', 'v1.dk-1.b-only')).resolves.toBe(true);
  });
});
