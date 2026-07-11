import { logger } from '@cuewise/shared';
import { vi } from 'vitest';

/** No-op `logger.warn` spy; caller restores it via the standard `afterEach(vi.restoreAllMocks)`. */
export function spyOnLoggerWarn() {
  return vi.spyOn(logger, 'warn').mockImplementation(() => {});
}

/** No-op `logger.error` spy; caller restores it via the standard `afterEach(vi.restoreAllMocks)`. */
export function spyOnLoggerError() {
  return vi.spyOn(logger, 'error').mockImplementation(() => {});
}
