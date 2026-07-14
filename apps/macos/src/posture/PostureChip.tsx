import { useFocusModeStore, useSettingsStore } from '@cuewise/app';
import { cn } from '@cuewise/ui';
import type React from 'react';
import { useEffect, useState } from 'react';
import { chipPlacement, chipPresentation, chipVisibleOnSurface } from './chip-presentation';
import { usePosture } from './posture-controller';

/**
 * Ambient posture status on the main webview while tracking is on. All the
 * precedence and surface logic lives in chip-presentation (pure, unit-tested).
 */
export function PostureChip(): React.JSX.Element | null {
  const presentation = chipPresentation(usePosture());
  const showThemeSwitcher = useSettingsStore((state) => state.settings.showThemeSwitcher);
  const reminderPanelPinned = useSettingsStore((state) => state.settings.reminderPanelPinned);
  const focusModeActive = useFocusModeStore((state) => state.isActive);
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);
  if (presentation === null || !chipVisibleOnSurface(hash, focusModeActive)) {
    return null;
  }
  const placement = chipPlacement({
    hash,
    focusModeActive,
    reminderPanelPinned,
    showThemeSwitcher,
  });

  return (
    <output
      className={cn(
        'fixed inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs font-medium text-secondary shadow-sm backdrop-blur',
        placement
      )}
      aria-label={`Posture: ${presentation.label}`}
    >
      <span className={cn('h-2 w-2 rounded-full', presentation.dot)} />
      {presentation.label}
    </output>
  );
}
