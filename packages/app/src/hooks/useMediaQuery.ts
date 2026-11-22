import { useCallback, useSyncExternalStore } from 'react';

function queryList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  return window.matchMedia(query);
}

/** Whether a CSS media query matches now; false where matchMedia is unavailable (jsdom). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = queryList(query);
      if (list === null) {
        return () => {};
      }
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query]
  );
  return useSyncExternalStore(subscribe, () => queryList(query)?.matches ?? false);
}
