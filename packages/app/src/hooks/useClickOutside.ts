import { type RefObject, useEffect, useEffectEvent } from 'react';

type ElementRef = RefObject<Element | null>;

/** Calls `onClickOutside` on a document mousedown that lands in none of `refs`. */
export function useClickOutside(
  refs: ElementRef | readonly ElementRef[],
  onClickOutside: () => void,
  enabled = true
): void {
  const handleMouseDown = useEffectEvent((event: MouseEvent) => {
    const target = event.target as Node;
    const list = Array.isArray(refs) ? refs : [refs];
    if (!list.some((ref) => ref.current?.contains(target))) {
      onClickOutside();
    }
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [enabled]);
}
