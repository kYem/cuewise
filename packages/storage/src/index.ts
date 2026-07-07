// Platform-agnostic storage interface

export * from './adapters/async-storage-adapter';

// Storage adapters for different platforms
export * from './adapters/chrome-storage-adapter';
export * from './adapters/local-storage-adapter';
// KeyValueStore adapter (platform seam)
export { ChromeKeyValueStore } from './chrome-key-value-store';
// Legacy exports (backward compatibility - kept for current extension)
export * from './chrome-storage';
export * from './storage-helpers';
export * from './storage-interface';
