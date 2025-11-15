/**
 * Logger configuration for browser extension
 *
 * Configures the global logger based on environment:
 * - Development: All log levels, with timestamps
 * - Production: Only warnings and errors, no timestamps
 */

import { LogLevel, configureLogger } from '@cuewise/shared';

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

/**
 * Future: Initialize Sentry integration
 *
 * To add Sentry:
 * 1. Install: pnpm add @sentry/browser @sentry/react
 * 2. Uncomment and configure below
 * 3. Implement SentryLogger in packages/shared/src/logger.ts
 */
/*
import * as Sentry from '@sentry/browser';
import { setGlobalLogger, SentryLogger } from '@cuewise/shared';

export function initializeSentry(): void {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_APP_VERSION,
      tracesSampleRate: 0.1,
      beforeSend(event) {
        // Filter out sensitive data
        return event;
      },
    });

    // Use Sentry logger in production
    setGlobalLogger(new SentryLogger());
  }
}
*/
