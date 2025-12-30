import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFocusModeStore } from '../../stores/focus-mode-store';
import { useSettingsStore } from '../../stores/settings-store';
import { MusicMiniPlayer } from '../MusicMiniPlayer';
import { BackgroundImage } from './BackgroundImage';
import { FocusModeControls } from './FocusModeControls';
import { FocusModeQuote } from './FocusModeQuote';
import { FocusModeTimer } from './FocusModeTimer';

/**
 * Full-screen focus mode overlay.
 * Features a scenic background image, large timer, and optional quote.
 */
export function FocusMode() {
  const { isActive, exitFocusMode, currentImageUrl, isImageLoading } = useFocusModeStore();
  const { settings } = useSettingsStore();

  // Handle escape key to exit
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitFocusMode();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Prevent body scroll when focus mode is active
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isActive, exitFocusMode]);

  // Don't render if not active
  if (!isActive) {
    return null;
  }

  const content = (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Focus mode">
      {/* Background layers */}
      <BackgroundImage url={currentImageUrl} isLoading={isImageLoading} />

      {/* Dark overlay for better text readability */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content layer */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center">
        {/* Timer */}
        <FocusModeTimer />

        {/* Quote (optional) */}
        {settings.focusModeShowQuote && <FocusModeQuote />}

        {/* Controls */}
        <FocusModeControls onExit={exitFocusMode} />
      </div>

      {/* Music Mini Player - Floating in top-left */}
      {settings.pomodoroMusicEnabled && (
        <div className="absolute top-4 left-4 z-20">
          <MusicMiniPlayer />
        </div>
      )}
    </div>
  );

  // Render as portal to ensure it's on top of everything
  return createPortal(content, document.body);
}
