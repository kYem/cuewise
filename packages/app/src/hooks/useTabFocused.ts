import { useEffect, useState } from 'react';

function isFocused(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
}

/** Whether this tab is the one in front of the user: visible, in the focused window. */
export function useTabFocused(): boolean {
  const [focused, setFocused] = useState(isFocused);

  useEffect(() => {
    const update = () => setFocused(isFocused());
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  }, []);

  return focused;
}
