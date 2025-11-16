/**
 * Logger configuration for browser extension
 *
 * Configures the global logger based on environment:
 * - Development: All log levels, with timestamps
 * - Production: Only warnings and errors, no timestamps
 */

import { configureLogger, LogLevel } from '@cuewise/shared';

/**
 * Initialize logger configuration based on environment
 * Call this early in your app initialization (e.g., in main.tsx)
 */
export function initializeLogger(): void {
  const isDevelopment = import.meta.env.DEV;

  if (isDevelopment) {
    // Development: verbose logging for debugging
    configureLogger({
      minLevel: LogLevel.DEBUG,
      enabled: true,
      includeTimestamp: true,
      prefix: '[Cuewise]',
    });
  } else {
    // Production: only warnings and errors
    configureLogger({
      minLevel: LogLevel.WARN,
      enabled: true,
      includeTimestamp: false,
      prefix: '[Cuewise]',
    });
  }
}
