import type React from 'react';
import { useEffect, useState } from 'react';
import { GLOW_INTENSITY_KEY, GLOW_STYLE_KEY, readGlowIntensity, readGlowStyle } from './glow-prefs';
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
    // Same-origin webviews may fire `storage` on the pref write — a visible
    // preview then restyles live; otherwise the next show picks it up at mount.
    const onStorage = (event: StorageEvent) => {
      if (event.key === GLOW_INTENSITY_KEY || event.key === GLOW_STYLE_KEY) {
        setEpoch((current) => current + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('storage', onStorage);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Re-read per show (the epoch remount) so a Settings change applies next glow.
  const intensity = readGlowIntensity();
  const style = readGlowStyle();
  const classes = ['glow-vignette'];
  if (style !== 'glow') {
    classes.push(`glow-style-${style}`);
  }
  if (intensity !== 'standard') {
    classes.push(`glow-vignette--${intensity}`);
  }
  return <div key={epoch} className={classes.join(' ')} aria-hidden="true" />;
}
