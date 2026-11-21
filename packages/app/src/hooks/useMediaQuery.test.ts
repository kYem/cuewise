import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { stubMatchMedia } from '../components/__fixtures__/media-query.fixtures';
import { useMediaQuery } from './useMediaQuery';

const originalMatchMedia = window.matchMedia;

describe('useMediaQuery', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('reports whether the query matches', () => {
    stubMatchMedia(true);

    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));

    expect(result.current).toBe(true);
  });

  it('follows the query when the viewport changes', () => {
    const listeners = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));

    stubMatchMedia(true);
    act(() => {
      for (const listener of listeners) {
        listener();
      }
    });

    expect(result.current).toBe(true);
  });

  it('reports no match where matchMedia is unavailable', () => {
    Object.assign(window, { matchMedia: undefined });

    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));

    expect(result.current).toBe(false);
  });
});
