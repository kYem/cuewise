import { createPortal } from 'react-dom';
import { useDialogChrome } from '../../hooks/useDialogChrome';
import { useFocusModeStore } from '../../stores/focus-mode-store';
import {
  selectBackgroundBlur,
  selectBackgroundDim,
  useSettingsStore,
} from '../../stores/settings-store';
import { SoundsMiniPlayer } from '../sounds';
import { BackgroundImage } from './BackgroundImage';
import { FocusModeControls } from './FocusModeControls';
import { FocusModeGoal } from './FocusModeGoal';
import { FocusModeQuote } from './FocusModeQuote';
import { FocusModeTimer } from './FocusModeTimer';

/**
 * Full-screen focus mode overlay.
 * Features a scenic background image, large timer, and optional quote.
 */
export function FocusMode() {
  const { isActive, exitFocusMode, currentImageUrl, isImageLoading } = useFocusModeStore();
  const { settings } = useSettingsStore();
  const backgroundDim = useSettingsStore(selectBackgroundDim);
  const backgroundBlur = useSettingsStore(selectBackgroundBlur);

  useDialogChrome({ open: isActive, onClose: exitFocusMode });

  // Don't render if not active
  if (!isActive) {
    return null;
  }

  const content = (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Focus mode">
      {/* Background layers */}
      <BackgroundImage
        url={currentImageUrl}
        isLoading={isImageLoading}
        dim={backgroundDim}
        blur={backgroundBlur}
      />

      {/* Dark overlay for better text readability */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content layer */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center">
        {/* Timer */}
        <FocusModeTimer />

        {/* Current goal (optional) */}
        {settings.focusModeShowGoal && <FocusModeGoal />}

        {/* Quote (optional) */}
        {settings.focusModeShowQuote && <FocusModeQuote />}

        {/* Controls */}
        <FocusModeControls onExit={exitFocusMode} />
      </div>

      {/* Music Mini Player - Floating in top-left */}
      {settings.pomodoroMusicEnabled && (
        <div className="absolute top-4 left-4 z-20">
          <SoundsMiniPlayer />
        </div>
      )}
    </div>
  );

  // Render as portal to ensure it's on top of everything
  return createPortal(content, document.body);
}
