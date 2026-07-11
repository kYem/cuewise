import { logger } from '@cuewise/shared';
import { vi } from 'vitest';

/** No-op `logger.warn` spy; `vitest.config.ts`'s `restoreMocks: true` restores it after the test. */
export function spyOnLoggerWarn() {
  return vi.spyOn(logger, 'warn').mockImplementation(() => {});
}

/** No-op `logger.error` spy; `vitest.config.ts`'s `restoreMocks: true` restores it after the test. */
export function spyOnLoggerError() {
  return vi.spyOn(logger, 'error').mockImplementation(() => {});
}
