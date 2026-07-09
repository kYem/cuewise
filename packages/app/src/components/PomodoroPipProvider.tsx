import { logger } from '@cuewise/shared';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useToastStore } from '../stores/toast-store';
import { isDocumentPipSupported, syncPipWindowStyles } from '../utils/pip-window';
import { ErrorBoundary } from './ErrorBoundary';
import { PomodoroPipWidget } from './PomodoroPipWidget';

interface PomodoroPipContextValue {
  isSupported: boolean;
  open: () => void;
}

const PomodoroPipContext = createContext<PomodoroPipContextValue | null>(null);

// Compact float — just enough for the session label, time, and one control.
const PIP_SIZE = { width: 300, height: 190 };
const OPEN_ERROR_MESSAGE = "Couldn't open the pop-out timer. Please try again.";

// Float-sized error fallback: the default ErrorBoundary panel is window-sized and
// its reload button reloads the opener tab (its realm), not the float.
const PIP_ERROR_FALLBACK = (
  <div className="flex h-screen w-screen items-center justify-center bg-surface px-4 text-center text-sm text-tertiary">
    Timer unavailable — reopen it from Cuewise.
  </div>
);

export function PomodoroPipProvider({ children }: { children: ReactNode }) {
  const pipRef = useRef<Window | null>(null);
  const rootRef = useRef<Root | null>(null);
  // Synchronous re-entrancy guard: pipRef is only set after the requestWindow
  // await, so a rapid second click would otherwise open a second window.
  const openingRef = useRef(false);
  const isSupported = isDocumentPipSupported();

  const open = useCallback(async () => {
    const dpip = window.documentPictureInPicture;
    if (!dpip || pipRef.current || openingRef.current) {
      return;
    }
    openingRef.current = true;

    let pip: Window;
    try {
      // Called during the click gesture — requestWindow consumes user activation.
      pip = await dpip.requestWindow(PIP_SIZE);
    } catch (error) {
      logger.error('Failed to open pomodoro picture-in-picture window', error);
      // Document PiP shows no permission prompt, so a rejection is a real failure
      // (lost activation, policy block, existing PiP) — acknowledge the click.
      useToastStore.getState().warning(OPEN_ERROR_MESSAGE);
      return;
    } finally {
      openingRef.current = false;
    }

    pipRef.current = pip;

    // Reset refs before unmounting so an unmount throw can't strand pipRef;
    // registered up-front so a failed render below still recovers on close.
    pip.addEventListener('pagehide', () => {
      const root = rootRef.current;
      rootRef.current = null;
      pipRef.current = null;
      try {
        root?.unmount();
      } catch (error) {
        logger.error('Failed to unmount pomodoro pop-out root', error);
      }
    });

    try {
      syncPipWindowStyles(pip);
      // A dedicated React root (not a portal) so event delegation binds to the PiP
      // document; mounted in an owned container, not document.body.
      const container = pip.document.createElement('div');
      pip.document.body.appendChild(container);
      const root = createRoot(container);
      rootRef.current = root;
      // ErrorBoundary so a later re-render throw shows a fallback in the float
      // instead of a blank window with stranded refs.
      root.render(
        <ErrorBoundary fallback={PIP_ERROR_FALLBACK}>
          <PomodoroPipWidget />
        </ErrorBoundary>
      );
    } catch (error) {
      logger.error('Failed to render the pomodoro pop-out', error);
      useToastStore.getState().warning(OPEN_ERROR_MESSAGE);
      pip.close(); // fires pagehide → teardown resets refs
    }
  }, []);

  const value = useMemo(() => ({ isSupported, open }), [isSupported, open]);

  return <PomodoroPipContext.Provider value={value}>{children}</PomodoroPipContext.Provider>;
}

const NOOP_PIP: PomodoroPipContextValue = {
  isSupported: false,
  open: () => undefined,
};

/** Pomodoro pop-out controls. Returns a no-op fallback outside the provider (e.g. in tests). */
export function usePomodoroPip(): PomodoroPipContextValue {
  return useContext(PomodoroPipContext) ?? NOOP_PIP;
}
