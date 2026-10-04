import { useEffect } from 'react';
import { useSoundsStore } from '../stores/sounds-store';
import { isAmbientSoundingAnywhere } from '../utils/ambient-sounds';

export const AMBIENT_LIVENESS_INTERVAL_MS = 5000;

/**
 * The leader notices ambient dying with the tab that played it, which no handover reports when
 * this tab already leads. Polled with `ifAvailable`: a queued request would block new claims.
 */
export function useAmbientLiveness(): void {
  const isLeader = useSoundsStore((state) => state.isLeader);
  const activeSource = useSoundsStore((state) => state.activeSource);
  const isPlaying = useSoundsStore((state) => state.isPlaying);
  const markAmbientSilent = useSoundsStore((state) => state.markAmbientSilent);

  useEffect(() => {
    // Without locks the answer covers only this tab, so ambient in another would read as dead.
    if (navigator.locks === undefined) {
      return;
    }
    if (!isLeader || activeSource !== 'ambient' || !isPlaying) {
      return;
    }
    let stopped = false;
    const interval = setInterval(() => {
      void isAmbientSoundingAnywhere().then((sounding) => {
        if (!sounding && !stopped) {
          markAmbientSilent();
        }
      });
    }, AMBIENT_LIVENESS_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [isLeader, activeSource, isPlaying, markAmbientSilent]);
}
