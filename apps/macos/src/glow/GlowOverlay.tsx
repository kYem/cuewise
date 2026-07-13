import type React from 'react';
import { useEffect, useState } from 'react';
import { readGlowIntensity } from './glow-prefs';
import './glow-overlay.css';

/**
 * A glow window's whole UI: a full-viewport, click-through screen-edge vignette.
 * Native code (`glow.rs`) shows/hides the windows; this renders unconditionally.
 */
export function GlowOverlay(): React.JSX.Element {
  // Windows are reused (hidden, not destroyed), so remount the vignette whenever
  // the document becomes visible again — otherwise the enter fade plays only once.
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setEpoch((current) => current + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Re-read per show (the epoch remount) so a Settings change applies next glow.
  const intensity = readGlowIntensity();
  const className =
    intensity === 'subtle' ? 'glow-vignette glow-vignette--subtle' : 'glow-vignette';
  return <div key={epoch} className={className} aria-hidden="true" />;
}
