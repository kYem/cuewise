import type React from 'react';
import { useEffect, useState } from 'react';
import { useFocusModeStore } from '../stores/focus-mode-store';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { getPreloadedCurrentUrl } from '../utils/image-preload-cache';
import { loadImageWithFallback } from '../utils/unsplash';
import { FocusMode } from './FocusMode';
import { PageHeader } from './PageHeader';
import { PomodoroTimer } from './PomodoroTimer';
import { QuoteDisplay } from './QuoteDisplay';
import { SoundsMiniPlayer } from './sounds';

export const PomodoroPage: React.FC = () => {
  const initialize = useQuoteStore((state) => state.initialize);
  const refreshQuote = useQuoteStore((state) => state.refreshQuote);
  const initializeSettings = useSettingsStore((state) => state.initialize);
  const quoteChangeInterval = useSettingsStore((state) => state.settings.quoteChangeInterval);
  const focusModeImageCategory = useSettingsStore((state) => state.settings.focusModeImageCategory);
  const pomodoroMusicEnabled = useSettingsStore((state) => state.settings.pomodoroMusicEnabled);
  const isFocusModeActive = useFocusModeStore((state) => state.isActive);
  const [lastManualRefresh, setLastManualRefresh] = useState(Date.now());
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    initialize();
    initializeSettings();
  }, [initialize, initializeSettings]);

  // Load background image (use preloaded if available)
  useEffect(() => {
    let cancelled = false;

    const loadBackground = async () => {
      // Check if we have a preloaded image from hovering on the button
      const preloadedUrl = getPreloadedCurrentUrl(focusModeImageCategory);
      if (preloadedUrl) {
        setBackgroundImage(preloadedUrl);
        setImageLoaded(true);
        return;
      }

      // Fall back to loading a new image
      try {
        const imageUrl = await loadImageWithFallback(focusModeImageCategory);
        if (!cancelled) {
          setBackgroundImage(imageUrl);
          setImageLoaded(true);
        }
      } catch {
        // Failed to load image, will show solid background
        if (!cancelled) {
          setImageLoaded(true);
        }
      }
    };

    loadBackground();

    return () => {
      cancelled = true;
    };
  }, [focusModeImageCategory]);

  // Auto-refresh quotes based on interval setting
  useEffect(() => {
    // If interval is 0 (manual), don't set up auto-refresh
    if (quoteChangeInterval === 0) {
      return;
    }

    // Set up interval timer (convert seconds to milliseconds)
    const intervalId = setInterval(() => {
      refreshQuote();
    }, quoteChangeInterval * 1000);

    // Cleanup on unmount or when interval changes
    return () => {
      clearInterval(intervalId);
    };
  }, [quoteChangeInterval, refreshQuote, lastManualRefresh]);

  return (
    <div className="min-h-screen w-full relative">
      {/* Background Image */}
      <div
        className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${
          imageLoaded && backgroundImage ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        <PageHeader currentPage="pomodoro" transparent />

        {/* Music Mini Player - Fixed position below header */}
        {/* Hidden when focus mode is active (FocusMode has its own mini player) */}
        {pomodoroMusicEnabled && !isFocusModeActive && (
          <div className="fixed top-16 left-4 z-50">
            <SoundsMiniPlayer />
          </div>
        )}

        {/* Split Layout for Large Screens */}
        <div className="flex flex-col lg:flex-row gap-density-lg items-center justify-center min-h-[calc(100vh-12rem)] px-4 sm:px-6 lg:px-8 py-8">
          {/* Pomodoro Timer */}
          <div className="flex-shrink-0">
            <PomodoroTimer />
          </div>

          {/* Quote Display - Hidden on small screens, shown on large screens */}
          <div className="hidden lg:flex lg:max-w-2xl">
            <QuoteDisplay onManualRefresh={() => setLastManualRefresh(Date.now())} />
          </div>
        </div>
      </div>

      {/* Focus Mode Overlay (renders as portal) */}
      <FocusMode />
    </div>
  );
};
