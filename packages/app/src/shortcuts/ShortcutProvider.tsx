import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SHORTCUTS, type Shortcut, type ShortcutId } from './shortcut-table';

type Run = () => void;

interface Registry {
  register(id: ShortcutId, run: React.MutableRefObject<Run>): () => void;
}

export interface ShortcutUi {
  liveShortcuts: Shortcut[];
  run(id: ShortcutId): void;
  openCheatSheet(): void;
  openPalette(): void;
}

const RegistryContext = createContext<Registry | null>(null);
const UiContext = createContext<ShortcutUi | null>(null);

const NAV_HASH: Partial<Record<ShortcutId, string>> = {
  'go.home': '',
  'go.pomodoro': 'pomodoro',
  'go.insights': 'insights',
  'go.quotes': 'quotes',
  'go.goals': 'goals',
  'go.concepts': 'concepts',
};

export const ShortcutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const handlers = useRef(new Map<ShortcutId, React.MutableRefObject<Run>>());
  const [registered, setRegistered] = useState<ReadonlySet<ShortcutId>>(new Set());
  const [, setIsCheatSheetOpen] = useState(false);
  const [, setIsPaletteOpen] = useState(false);

  const registry = useMemo<Registry>(
    () => ({
      register(id, run) {
        handlers.current.set(id, run);
        setRegistered((prev) => new Set(prev).add(id));
        return () => {
          if (handlers.current.get(id) !== run) {
            return;
          }
          handlers.current.delete(id);
          setRegistered((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        };
      },
    }),
    []
  );

  const run = useCallback((id: ShortcutId) => {
    const hash = NAV_HASH[id];
    if (hash !== undefined) {
      window.location.hash = hash;
      return;
    }
    if (id === 'help') {
      setIsCheatSheetOpen(true);
      return;
    }
    handlers.current.get(id)?.current();
  }, []);

  const liveShortcuts = useMemo(
    () =>
      SHORTCUTS.filter(
        (s) => NAV_HASH[s.id] !== undefined || s.id === 'help' || registered.has(s.id)
      ),
    [registered]
  );

  const ui = useMemo<ShortcutUi>(
    () => ({
      liveShortcuts,
      run,
      openCheatSheet: () => setIsCheatSheetOpen(true),
      openPalette: () => setIsPaletteOpen(true),
    }),
    [liveShortcuts, run]
  );

  return (
    <RegistryContext.Provider value={registry}>
      <UiContext.Provider value={ui}>{children}</UiContext.Provider>
    </RegistryContext.Provider>
  );
};

/** Offers `run` for `id` while mounted; pass `null` while the component cannot act on it. */
export function useShortcutAction(id: ShortcutId, run: Run | null): void {
  const registry = useContext(RegistryContext);
  const runRef = useRef<Run>(() => undefined);
  if (run !== null) {
    runRef.current = run;
  }
  const live = run !== null;
  useEffect(() => {
    if (registry === null || !live) {
      return;
    }
    return registry.register(id, runRef);
  }, [registry, id, live]);
}

export function useShortcutUi(): ShortcutUi | null {
  return useContext(UiContext);
}
