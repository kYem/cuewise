/**
 * Logger abstraction for Cuewise
 *
 * This provides a unified logging interface that can be easily integrated
 * with third-party services like Sentry, LogRocket, or Datadog.
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogContext {
  [key: string]: unknown;
}

export interface LoggerConfig {
  /** Minimum log level to output (debug < info < warn < error) */
  minLevel: LogLevel;
  /** Enable/disable logging entirely */
  enabled: boolean;
  /** Include timestamp in logs */
  includeTimestamp: boolean;
  /** Custom prefix for all logs */
  prefix?: string;
}

/**
 * Logger interface that can be implemented by different providers
 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error | unknown, context?: LogContext): void;
  setConfig(config: Partial<LoggerConfig>): void;
  getConfig(): LoggerConfig;
}

/**
 * Console-based logger implementation
 */
class ConsoleLogger implements Logger {
  private config: LoggerConfig = {
    minLevel: LogLevel.DEBUG,
    enabled: true,
    includeTimestamp: true,
    prefix: '[Cuewise]',
  };

  private levelPriority: Record<LogLevel, number> = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
  };

  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    return this.levelPriority[level] >= this.levelPriority[this.config.minLevel];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const parts: string[] = [];

    if (this.config.prefix) {
      parts.push(this.config.prefix);
    }

    if (this.config.includeTimestamp) {
      parts.push(new Date().toISOString());
    }

    parts.push(`[${level.toUpperCase()}]`);
    parts.push(message);

    return parts.join(' ');
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const formatted = this.formatMessage(LogLevel.DEBUG, message);
    if (context) {
      console.debug(formatted, context);
    } else {
      console.debug(formatted);
    }
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const formatted = this.formatMessage(LogLevel.INFO, message);
    if (context) {
      console.info(formatted, context);
    } else {
      console.info(formatted);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const formatted = this.formatMessage(LogLevel.WARN, message);
    if (context) {
      console.warn(formatted, context);
    } else {
      console.warn(formatted);
    }
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const formatted = this.formatMessage(LogLevel.ERROR, message);

    if (error && context) {
      console.error(formatted, error, context);
    } else if (error) {
      console.error(formatted, error);
    } else if (context) {
      console.error(formatted, context);
    } else {
      console.error(formatted);
    }
  }
}

/**
 * Sentry logger implementation (placeholder for future integration)
 *
 * To integrate Sentry:
 * 1. Install: pnpm add @sentry/browser (or @sentry/react-native)
 * 2. Initialize Sentry in your app entry point
 * 3. Uncomment and implement this class
 * 4. Use createLogger('sentry') or setGlobalLogger(new SentryLogger())
 */
/*
import * as Sentry from '@sentry/browser';

class SentryLogger implements Logger {
  private consoleLogger = new ConsoleLogger();

  setConfig(config: Partial<LoggerConfig>): void {
    this.consoleLogger.setConfig(config);
  }

  getConfig(): LoggerConfig {
    return this.consoleLogger.getConfig();
  }

  debug(message: string, context?: LogContext): void {
    this.consoleLogger.debug(message, context);
    Sentry.addBreadcrumb({
      level: 'debug',
      message,
      data: context,
    });
  }

  info(message: string, context?: LogContext): void {
    this.consoleLogger.info(message, context);
    Sentry.addBreadcrumb({
      level: 'info',
      message,
      data: context,
    });
  }

  warn(message: string, context?: LogContext): void {
    this.consoleLogger.warn(message, context);
    Sentry.captureMessage(message, {
      level: 'warning',
      contexts: { custom: context },
    });
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    this.consoleLogger.error(message, error, context);

    if (error instanceof Error) {
      Sentry.captureException(error, {
        contexts: { custom: context },
        tags: { message },
      });
    } else {
      Sentry.captureMessage(message, {
        level: 'error',
        contexts: { custom: { ...context, error } },
      });
    }
  }
}
*/

// Global logger instance
let globalLogger: Logger = new ConsoleLogger();

/**
 * Get the global logger instance
 */
export function getLogger(): Logger {
  return globalLogger;
}

/**
 * Set a custom logger implementation globally
 *
 * @example
 * // Use Sentry logger in production
 * if (import.meta.env.PROD) {
 *   setGlobalLogger(new SentryLogger());
 * }
 */
export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}

/**
 * Create a logger with custom configuration
 *
 * @example
 * // Create a production logger (errors/warnings only)
 * const logger = createLogger({
 *   minLevel: LogLevel.WARN,
 *   includeTimestamp: false,
 * });
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  const logger = new ConsoleLogger();
  if (config) {
    logger.setConfig(config);
  }
  return logger;
}

/**
 * Configure the global logger
 *
 * @example
 * // Production: only log warnings and errors
 * if (import.meta.env.PROD) {
 *   configureLogger({
 *     minLevel: LogLevel.WARN,
 *     includeTimestamp: false,
 *   });
 * }
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  globalLogger.setConfig(config);
}

/**
 * Convenience export: default logger instance
 *
 * @example
 * import { logger } from '@cuewise/shared';
 *
 * logger.debug('Debug info', { userId: 123 });
 * logger.info('User logged in');
 * logger.warn('Deprecated API usage');
 * logger.error('Failed to save', error, { operation: 'save-goal' });
 */
export const logger = getLogger();
