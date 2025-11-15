// Platform-agnostic storage interface
export * from './storage-interface';

// Storage adapters for different platforms
export * from './adapters/chrome-storage-adapter';
export * from './adapters/local-storage-adapter';
export * from './adapters/async-storage-adapter';

// Legacy exports (backward compatibility - kept for current extension)
export * from './chrome-storage';
export * from './storage-helpers';
