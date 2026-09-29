import { getNotifier, logger } from '@cuewise/shared';
import { useEffect, useState } from 'react';

/**
 * True when the host reports notifications as denied for Cuewise. Re-asked each time `active`
 * turns on, so allowing them in the browser clears the hint on the next open.
 */
export function useNotificationsBlocked(active: boolean): boolean {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!active) {
      return;
    }
    let current = true;
    Promise.resolve()
      .then(() => getNotifier().permission())
      .then((permission) => {
        if (current) {
          setBlocked(permission === 'denied');
        }
      })
      .catch((error) => logger.error('Could not read the notification permission', error));
    return () => {
      current = false;
    };
  }, [active]);

  return blocked;
}
