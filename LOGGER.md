# Logger System

**Location**: `packages/shared/src/logger.ts`

## Overview

Cuewise uses a centralized logging abstraction that provides:
- **Platform-agnostic** logging interface
- **Environment-aware** log levels (verbose in dev, quiet in prod)
- **Easy integration** with third-party services (Sentry, LogRocket, Datadog)
- **Type-safe** logging with context support

## Quick Start

### Basic Usage

```typescript
import { logger } from '@cuewise/shared';

// Debug (development only by default)
logger.debug('User clicked refresh button', { userId: 123, timestamp: Date.now() });

// Info
logger.info('Quote refreshed successfully');

// Warning
logger.warn('Deprecated API usage detected');

// Error
logger.error('Failed to save quote', error, { quoteId: 'abc-123', operation: 'save' });
```

### Log Levels

The logger supports four log levels, from lowest to highest priority:

1. **DEBUG** - Verbose development information
2. **INFO** - General informational messages
3. **WARN** - Warning messages (potential issues)
4. **ERROR** - Error messages (failures)

By default:
- **Development**: Shows DEBUG and above (all logs)
- **Production**: Shows WARN and above (only warnings and errors)

## Configuration

### Environment-Based Configuration

The logger is automatically configured based on environment in `apps/browser-extension/src/lib/logger-config.ts`:

```typescript
import { initializeLogger } from './lib/logger-config';

// Call early in your app (e.g., main.tsx)
initializeLogger();
```

**Development** (import.meta.env.DEV):
```typescript
{
  minLevel: LogLevel.DEBUG,
  enabled: true,
  includeTimestamp: true,
  prefix: '[Cuewise]'
}
```

**Production** (import.meta.env.PROD):
```typescript
{
  minLevel: LogLevel.WARN,
  enabled: true,
  includeTimestamp: false,
  prefix: '[Cuewise]'
}
```

### Custom Configuration

```typescript
import { configureLogger, LogLevel } from '@cuewise/shared';

// Only show errors
configureLogger({
  minLevel: LogLevel.ERROR,
  includeTimestamp: false,
  prefix: '[MyApp]'
});

// Disable logging entirely
configureLogger({
  enabled: false
});
```

### Create Custom Logger Instance

```typescript
import { createLogger, LogLevel } from '@cuewise/shared';

// Create a logger for a specific module
const analyticsLogger = createLogger({
  minLevel: LogLevel.INFO,
  prefix: '[Analytics]'
});

analyticsLogger.info('Event tracked', { event: 'page_view' });
```

## API Reference

### logger.debug(message, context?)

Log debug information (development only by default).

```typescript
logger.debug('Rendering component', {
  component: 'QuoteDisplay',
  props: { quoteId: '123' }
});
```

**Output (dev)**:
```
[Cuewise] 2025-01-15T10:30:00.000Z [DEBUG] Rendering component { component: 'QuoteDisplay', props: { quoteId: '123' } }
```

### logger.info(message, context?)

Log informational messages.

```typescript
logger.info('User logged in', { userId: 'user-123' });
```

### logger.warn(message, context?)

Log warnings about potential issues.

```typescript
logger.warn('API rate limit approaching', {
  remainingCalls: 10,
  resetTime: Date.now() + 60000
});
```

### logger.error(message, error?, context?)

Log errors with optional Error object and context.

```typescript
try {
  await saveQuote(quote);
} catch (error) {
  logger.error('Failed to save quote', error, {
    quoteId: quote.id,
    operation: 'save'
  });
}
```

**Output**:
```
[Cuewise] [ERROR] Failed to save quote Error: Network timeout { quoteId: 'abc-123', operation: 'save' }
```

## Context Object

The optional `context` parameter accepts any key-value pairs:

```typescript
interface LogContext {
  [key: string]: unknown;
}
```

**Best practices**:
- Include relevant IDs (userId, quoteId, etc.)
- Add operation context (operation, action, etc.)
- Include metadata (timestamp, count, status)
- Avoid sensitive data (passwords, tokens)

**Example**:
```typescript
logger.error('Payment failed', error, {
  userId: user.id,
  amount: 29.99,
  currency: 'USD',
  paymentMethod: 'card',
  attempt: 3
  // ❌ DO NOT: cardNumber: '1234-5678-9012-3456'
});
```

## Integration with Third-Party Services

### Sentry Integration (Future)

The logger is designed to easily integrate with Sentry or other error tracking services.

**Steps to integrate**:

1. **Install Sentry**:
```bash
pnpm add @sentry/browser @sentry/react
```

2. **Uncomment SentryLogger** in `packages/shared/src/logger.ts`:
```typescript
// Uncomment the SentryLogger class implementation
```

3. **Initialize Sentry** in `apps/browser-extension/src/lib/logger-config.ts`:
```typescript
import * as Sentry from '@sentry/browser';
import { setGlobalLogger, SentryLogger } from '@cuewise/shared';

export function initializeSentry(): void {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_APP_VERSION,
      tracesSampleRate: 0.1,
    });

    setGlobalLogger(new SentryLogger());
  }
}
```

4. **Call in main.tsx**:
```typescript
import { initializeSentry } from './lib/logger-config';

initializeSentry();
initializeLogger();
```

**What it does**:
- **DEBUG/INFO**: Adds breadcrumbs to Sentry (visible in error context)
- **WARN**: Sends warning messages to Sentry
- **ERROR**: Captures exceptions with full stack traces
- Still logs to console in development

### Other Services

The logger interface can be implemented for any service:

```typescript
import { Logger, LogContext } from '@cuewise/shared';

class CustomLogger implements Logger {
  debug(message: string, context?: LogContext): void {
    // Send to your service
  }

  info(message: string, context?: LogContext): void {
    // Send to your service
  }

  warn(message: string, context?: LogContext): void {
    // Send to your service
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    // Send to your service
  }

  setConfig(config: Partial<LoggerConfig>): void {
    // Configure
  }

  getConfig(): LoggerConfig {
    // Return config
  }
}

// Use globally
import { setGlobalLogger } from '@cuewise/shared';
setGlobalLogger(new CustomLogger());
```

## Migration from console.log

### Before
```typescript
console.log('Quote refreshed');
console.error('Failed to save:', error);
console.warn('Deprecated method');
```

### After
```typescript
import { logger } from '@cuewise/shared';

logger.info('Quote refreshed');
logger.error('Failed to save', error);
logger.warn('Deprecated method');
```

### Benefits
- ✅ Environment-aware (no debug logs in production)
- ✅ Structured context data
- ✅ Easy Sentry integration
- ✅ Consistent formatting
- ✅ Type-safe

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
// ✅ GOOD: Use debug for development info
logger.debug('Initializing store', { storeType: 'quotes' });

// ❌ BAD: Using info for verbose debugging
logger.info('Initializing store', { storeType: 'quotes' });
```

### 2. Include Relevant Context

```typescript
// ✅ GOOD: Helpful context
logger.error('Failed to save goal', error, {
  goalId: goal.id,
  userId: user.id,
  operation: 'create'
});

// ❌ BAD: Missing context
logger.error('Failed to save goal', error);
```

### 3. Don't Log Sensitive Data

```typescript
// ✅ GOOD: Redact sensitive data
logger.info('User authenticated', {
  userId: user.id,
  email: user.email.replace(/(?<=.).(?=.*@)/g, '*')
});

// ❌ BAD: Logging sensitive data
logger.info('User authenticated', {
  userId: user.id,
  password: user.password // NEVER LOG PASSWORDS!
});
```

### 4. Use Error Object for Errors

```typescript
// ✅ GOOD: Pass Error object
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', error, { operation: 'risky' });
}

// ❌ BAD: Converting error to string
catch (error) {
  logger.error(`Operation failed: ${error}`);
}
```

### 5. Keep Messages Concise

```typescript
// ✅ GOOD: Short message, details in context
logger.error('Quote save failed', error, {
  quoteId: quote.id,
  reason: 'Network timeout'
});

// ❌ BAD: Long message with interpolation
logger.error(`Failed to save quote ${quote.id} because of network timeout`);
```

## Examples from Codebase

### Error Boundary
```typescript
// apps/browser-extension/src/components/ErrorBoundary.tsx
public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
  logger.error('ErrorBoundary caught an error', error, {
    componentStack: errorInfo.componentStack,
  });
}
```

### Store Error Handling
```typescript
// apps/browser-extension/src/stores/quote-store.ts
try {
  await setQuotes(quotes);
} catch (error) {
  logger.error('Error initializing quote store', error);
  set({ error: errorMessage, isLoading: false });
}
```

## Troubleshooting

### Logs not appearing in development

Check that logger is initialized:
```typescript
// In main.tsx
import { initializeLogger } from './lib/logger-config';
initializeLogger();
```

### Too many logs in production

Increase minimum log level:
```typescript
configureLogger({
  minLevel: LogLevel.ERROR // Only errors
});
```

### Need to disable logging temporarily

```typescript
configureLogger({
  enabled: false
});
```

## Future Enhancements

Potential improvements:
- [ ] Log rotation for long-running apps
- [ ] Performance metrics logging
- [ ] User action tracking
- [ ] Remote logging endpoints
- [ ] Log filtering by module/tag
- [ ] Structured logging (JSON format)

---

**Version**: 1.0.0
**Last Updated**: 2025-01-15
