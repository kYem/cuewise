import type React from 'react';
import './glow-overlay.css';

/**
 * The whole UI of a glow window (`index.html#glow`): a full-viewport, click-through
 * screen-edge vignette. Visibility is managed natively (`glow.rs` shows/hides the
 * windows), so this renders unconditionally — no stores, no listeners, no state.
 */
export function GlowOverlay(): React.JSX.Element {
  return <div className="glow-vignette" aria-hidden="true" />;
}
