import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// jest-dom still augments vitest's pre-5 one-parameter `Assertion<T>`, which no longer merges.
declare module 'vitest' {
  interface Assertion<R extends void | Promise<void> = void, T = unknown>
    extends TestingLibraryMatchers<unknown, R> {}
}
