import { useEffect } from 'react';
import confetti from '../../assets/lottie/confetti.json';
import type { CelebrationType } from '../../stores/celebration-store';
import { useCelebrationStore } from '../../stores/celebration-store';
import { useSettingsStore } from '../../stores/settings-store';
import { LottiePlayer } from './LottiePlayer';

const CELEBRATION_ASSETS: Record<CelebrationType, object> = {
  pomodoro: confetti,
  allGoals: confetti,
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Top-level, non-interactive overlay that plays a celebration animation when the
 * celebration store has an active type. Gated by the celebrationsEnabled setting
 * and prefers-reduced-motion; mounted once in App next to the toast container.
 *
 * INVARIANT: this overlay must stay permanently mounted. The store's debounce
 * (celebrate() is a no-op while `active` is set) relies on this component clearing
 * `active` via dismiss() — both on completion and on the disabled/reduced-motion
 * path below. If the overlay were conditionally unmounted, a celebrate() fired
 * while it was absent would leave `active` stuck and block all future celebrations.
 */
export function CelebrationOverlay() {
  const active = useCelebrationStore((state) => state.active);
  const dismiss = useCelebrationStore((state) => state.dismiss);
  const celebrationsEnabled = useSettingsStore((state) => state.settings.celebrationsEnabled);

  const reducedMotion = prefersReducedMotion();
  const shouldShow = active !== null && celebrationsEnabled && !reducedMotion;

  // If a celebration was queued but we shouldn't show it (disabled / reduced
  // motion), clear it so the store's debounce doesn't get stuck.
  useEffect(() => {
    if (active !== null && !shouldShow) {
      dismiss();
    }
  }, [active, shouldShow, dismiss]);

  if (!shouldShow || active === null) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-none">
      <LottiePlayer
        animationData={CELEBRATION_ASSETS[active]}
        onComplete={dismiss}
        className="w-full h-full max-w-2xl"
      />
    </div>
  );
}
