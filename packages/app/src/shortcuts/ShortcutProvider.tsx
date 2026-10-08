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
import {
  claimShortcutEvent,
  isMacPlatform,
  isPaletteChord,
  isPaletteKeyEvent,
  isShortcutKeyEvent,
} from '../utils/keyboard-shortcut';
import { CommandPalette } from './CommandPalette';
import { ShortcutCheatSheet } from './ShortcutCheatSheet';
import { SHORTCUTS, type Shortcut, type ShortcutId } from './shortcut-table';

type Run = () => void;

interface Registry {
  register(id: ShortcutId, run: React.MutableRefObject<Run>): () => void;
}

export interface ShortcutUi {
  liveShortcuts: Shortcut[];
  run(id: ShortcutId): boolean;
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

export const SEQUENCE_TIMEOUT_MS = 1500;

const BARE_KEYS = new Map(
  SHORTCUTS.filter((s) => s.keys.length === 1 && s.boundBy === undefined).map((s) => [
    s.keys[0],
    s.id,
  ])
);

const AFTER_G = new Map(
  SHORTCUTS.filter((s) => s.keys.length === 2 && s.keys[0] === 'g').map((s) => [s.keys[1], s.id])
);

export const ShortcutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const handlers = useRef(new Map<ShortcutId, React.MutableRefObject<Run>>());
  const [registered, setRegistered] = useState<ReadonlySet<ShortcutId>>(new Set());
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const closePalette = useCallback(() => setIsPaletteOpen(false), []);

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

  /** False when nothing handles `id` right now, so the caller leaves the key to the page. */
  const run = useCallback((id: ShortcutId): boolean => {
    const hash = NAV_HASH[id];
    if (hash !== undefined) {
      window.location.hash = hash;
      return true;
    }
    if (id === 'help') {
      setIsCheatSheetOpen(true);
      return true;
    }
    const handler = handlers.current.get(id);
    if (handler === undefined) {
      return false;
    }
    handler.current();
    return true;
  }, []);

  const liveShortcuts = useMemo(
    () =>
      SHORTCUTS.filter(
        (s) => NAV_HASH[s.id] !== undefined || s.id === 'help' || registered.has(s.id)
      ),
    [registered]
  );

  const closeCheatSheet = useCallback(() => setIsCheatSheetOpen(false), []);
  const paletteOpenRef = useRef(isPaletteOpen);
  paletteOpenRef.current = isPaletteOpen;
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const clearPending = () => {
      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
      }
    };
    const handle = (event: KeyboardEvent) => {
      if (isPaletteChord(event)) {
        claimShortcutEvent(event);
        event.preventDefault();
        clearPending();
        if (paletteOpenRef.current) {
          setIsPaletteOpen(false);
        } else if (isPaletteKeyEvent(event)) {
          setIsPaletteOpen(true);
        }
        return;
      }
      if (pendingG.current !== null) {
        const id = AFTER_G.get(event.key);
        clearPending();
        if (id !== undefined && isShortcutKeyEvent(event)) {
          claimShortcutEvent(event);
          event.preventDefault();
          run(id);
        }
        return;
      }
      if (!isShortcutKeyEvent(event)) {
        return;
      }
      if (event.key === 'g') {
        claimShortcutEvent(event);
        pendingG.current = window.setTimeout(() => {
          pendingG.current = null;
        }, SEQUENCE_TIMEOUT_MS);
        return;
      }
      const id = BARE_KEYS.get(event.key);
      if (id === undefined || !run(id)) {
        return;
      }
      claimShortcutEvent(event);
      event.preventDefault();
    };
    // Capture phase: runs before every bubble listener, whatever order they registered in.
    document.addEventListener('keydown', handle, true);
    return () => {
      document.removeEventListener('keydown', handle, true);
      clearPending();
    };
  }, [run]);

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
      <UiContext.Provider value={ui}>
        {children}
        <ShortcutCheatSheet
          isOpen={isCheatSheetOpen}
          onClose={closeCheatSheet}
          shortcuts={liveShortcuts}
          mac={isMacPlatform()}
        />
        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={closePalette}
          shortcuts={liveShortcuts}
          onRun={run}
        />
      </UiContext.Provider>
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
