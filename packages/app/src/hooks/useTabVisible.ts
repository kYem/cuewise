import { useEffect, useState } from 'react';

function isVisible(): boolean {
  return document.visibilityState === 'visible';
}

/**
 * Whether this tab is the one showing in its window. Not `hasFocus`: a new tab opens with focus in
 * the address bar, and a card waiting there must still show.
 */
export function useTabVisible(): boolean {
  const [visible, setVisible] = useState(isVisible);

  useEffect(() => {
    const update = () => setVisible(isVisible());
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return visible;
}
