import { cn } from '@cuewise/ui';
import type React from 'react';
import { chipPresentation } from './chip-presentation';
import { usePosture } from './posture-controller';

/**
 * Ambient posture status on the main webview while tracking is on. All the
 * precedence logic lives in `chipPresentation` (pure, unit-tested).
 */
export function PostureChip(): React.JSX.Element | null {
  const presentation = chipPresentation(usePosture());
  if (presentation === null) {
    return null;
  }

  return (
    <output
      className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs font-medium text-secondary shadow-sm backdrop-blur"
      aria-label={`Posture: ${presentation.label}`}
    >
      <span className={cn('h-2 w-2 rounded-full', presentation.dot)} />
      {presentation.label}
    </output>
  );
}
