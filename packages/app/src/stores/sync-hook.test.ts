import { logger } from '@cuewise/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  notifyDeleted,
  notifyMutated,
  notifyMutatedBulk,
  type SyncMutationSink,
  setSyncEngine,
} from './sync-hook';

describe('sync-hook', () => {
  afterEach(() => {
    setSyncEngine(null);
    vi.restoreAllMocks();
  });

  it('is a no-op when no engine is registered', () => {
    expect(() => notifyMutated('goals', 'goal-1')).not.toThrow();
    expect(() => notifyDeleted('goals', 'goal-1')).not.toThrow();
  });

  it('calls the registered engine markMutated with the collection and entity id', () => {
    const markMutated = vi.fn();
    const fake: SyncMutationSink = { markMutated, markDeleted: vi.fn() };
    setSyncEngine(fake);

    notifyMutated('goals', 'goal-1');

    expect(markMutated).toHaveBeenCalledWith('goals', 'goal-1');
  });

  it('calls the registered engine markDeleted with the collection and entity id', () => {
    const markDeleted = vi.fn();
    const fake: SyncMutationSink = { markMutated: vi.fn(), markDeleted };
    setSyncEngine(fake);

    notifyDeleted('goals', 'goal-1');

    expect(markDeleted).toHaveBeenCalledWith('goals', 'goal-1');
  });

  it('swallows a synchronous throw from markMutated and logs a warning', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const fake: SyncMutationSink = {
      markMutated: () => {
        throw new Error('boom');
      },
      markDeleted: vi.fn(),
    };
    setSyncEngine(fake);

    expect(() => notifyMutated('goals', 'goal-1')).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('swallows an async rejection from markMutated and logs a warning', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const fake: SyncMutationSink = {
      markMutated: () => Promise.reject(new Error('boom')),
      markDeleted: vi.fn(),
    };
    setSyncEngine(fake);

    expect(() => notifyMutated('goals', 'goal-1')).not.toThrow();
    // Flush the microtask queue so the rejection handler runs before asserting.
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalled();
  });

  it('swallows a throw from markDeleted and logs a warning', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const fake: SyncMutationSink = {
      markMutated: vi.fn(),
      markDeleted: () => {
        throw new Error('boom');
      },
    };
    setSyncEngine(fake);

    expect(() => notifyDeleted('goals', 'goal-1')).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('does not call the sink after setSyncEngine(null) resets it', () => {
    const markMutated = vi.fn();
    setSyncEngine({ markMutated, markDeleted: vi.fn() });
    setSyncEngine(null);

    notifyMutated('goals', 'goal-1');

    expect(markMutated).not.toHaveBeenCalled();
  });

  it('notifyMutatedBulk is a no-op when no engine is registered', () => {
    expect(() => notifyMutatedBulk('goals', ['goal-1', 'goal-2'])).not.toThrow();
  });

  it('notifyMutatedBulk calls the registered engine markMutatedBulk with the id array', () => {
    const markMutatedBulk = vi.fn();
    const fake: SyncMutationSink = {
      markMutated: vi.fn(),
      markDeleted: vi.fn(),
      markMutatedBulk,
    };
    setSyncEngine(fake);

    notifyMutatedBulk('goals', ['goal-1', 'goal-2']);

    expect(markMutatedBulk).toHaveBeenCalledWith('goals', ['goal-1', 'goal-2']);
  });

  it('notifyMutatedBulk swallows a synchronous throw from markMutatedBulk and logs a warning', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const fake: SyncMutationSink = {
      markMutated: vi.fn(),
      markDeleted: vi.fn(),
      markMutatedBulk: () => {
        throw new Error('boom');
      },
    };
    setSyncEngine(fake);

    expect(() => notifyMutatedBulk('goals', ['goal-1'])).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('notifyMutatedBulk swallows an async rejection from markMutatedBulk and logs a warning', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const fake: SyncMutationSink = {
      markMutated: vi.fn(),
      markDeleted: vi.fn(),
      markMutatedBulk: () => Promise.reject(new Error('boom')),
    };
    setSyncEngine(fake);

    expect(() => notifyMutatedBulk('goals', ['goal-1'])).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalled();
  });

  it('notifyMutatedBulk is a no-op when the registered sink has no markMutatedBulk', () => {
    const markMutated = vi.fn();
    setSyncEngine({ markMutated, markDeleted: vi.fn() });

    expect(() => notifyMutatedBulk('goals', ['goal-1'])).not.toThrow();

    expect(markMutated).not.toHaveBeenCalled();
  });
});
