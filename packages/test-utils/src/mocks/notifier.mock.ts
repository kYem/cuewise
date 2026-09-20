import type { Notifier } from '@cuewise/shared';
import { type Mock, vi } from 'vitest';

export interface FakeNotifier extends Notifier {
  notify: Mock<Notifier['notify']>;
  clear: Mock<Notifier['clear']>;
  permission: Mock<Notifier['permission']>;
}

/** A Notifier of spies. Script a member per test: `notifier.permission.mockResolvedValue('denied')`. */
export function fakeNotifier(): FakeNotifier {
  return {
    notify: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    permission: vi.fn(async () => 'unknown' as const),
  };
}
