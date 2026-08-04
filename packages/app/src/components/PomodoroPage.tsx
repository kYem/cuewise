import type React from 'react';
import { useEffect, useState } from 'react';
import { useCalendarStore } from '../stores/calendar-store';
import { useFocusModeStore } from '../stores/focus-mode-store';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { resolvePomodoroCompanion } from '../utils/calendar-visibility';
import type { ChromeVariant } from '../utils/chrome-variant';
import { CalendarStrip } from './CalendarStrip';
import { FocusMode } from './FocusMode';
import { PageHeader } from './PageHeader';
import { PomodoroTimer } from './PomodoroTimer';
import { QuoteDisplay } from './QuoteDisplay';
import { SoundsMiniPlayer } from './sounds';

// top-20 clears PageHeader, which is 4.5rem tall once a plain theme makes it opaque.
const PLAYER_OFFSET = 'fixed top-20 left-4 z-50';

export const PomodoroPage: React.FC = () => {
  const initialize = useQuoteStore((state) => state.initialize);
  const refreshQuote = useQuoteStore((state) => state.refreshQuote);
  const initializeSettings = useSettingsStore((state) => state.initialize);
  const quoteChangeInterval = useSettingsStore((state) => state.settings.quoteChangeInterval);
  const colorTheme = useSettingsStore((state) => state.settings.colorTheme);
  const pomodoroMusicEnabled = useSettingsStore((state) => state.settings.pomodoroMusicEnabled);
  const pomodoroCompanion = useSettingsStore((state) => state.settings.pomodoroCompanion);
  const initCalendar = useCalendarStore((state) => state.initialize);
  // Hides the mini player: FocusMode renders its own.
  const isFocusModeActive = useFocusModeStore((state) => state.isActive);
  const [lastManualRefresh, setLastManualRefresh] = useState(Date.now());

  useEffect(() => {
    initialize();
    initializeSettings();
  }, [initialize, initializeSettings]);

  // Folds the build-time feature gate into the setting (see calendar-visibility):
  // an unprovisioned build falls back to 'quote' and never renders the strip.
  const companionMode = resolvePomodoroCompanion(pomodoroCompanion);

  // Only touch calendar state when the companion actually shows it — avoids a
  // storage read + refresh for the default 'quote' users.
  useEffect(() => {
    if (companionMode !== 'quote') {
      initCalendar();
    }
  }, [companionMode, initCalendar]);

  // App paints the Glass photo app-wide, this page included, so there is nothing to render
  // here — the flag only decides whether the chrome sits on a photo or on the theme.
  const showBackgroundImage = colorTheme === 'glass';

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

  // White-on-dark only reads over the photo; without it the page can be light.
  const chromeVariant: ChromeVariant = showBackgroundImage ? 'overlay' : 'surface';

  // Companion shown beside the timer on large screens
  let companion: React.ReactNode;
  if (companionMode === 'calendar') {
    companion = <CalendarStrip variant={chromeVariant} />;
  } else if (companionMode === 'both') {
    companion = (
      <div className="flex w-full flex-col items-center gap-density-lg">
        <CalendarStrip lean variant={chromeVariant} />
        <QuoteDisplay onManualRefresh={() => setLastManualRefresh(Date.now())} hideCategory />
      </div>
    );
  } else {
    companion = <QuoteDisplay onManualRefresh={() => setLastManualRefresh(Date.now())} />;
  }

  return (
    <div className="min-h-screen w-full relative">
      <div className="relative z-10">
        <PageHeader currentPage="pomodoro" />

        {pomodoroMusicEnabled && !isFocusModeActive && (
          <div className={PLAYER_OFFSET}>
            <SoundsMiniPlayer variant={chromeVariant} />
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-density-lg items-center justify-center min-h-[calc(100vh-12rem)] px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex-shrink-0">
            <PomodoroTimer variant={chromeVariant} />
          </div>

          <div className="hidden lg:flex lg:max-w-2xl">{companion}</div>
        </div>
      </div>

      <FocusMode />
    </div>
  );
};
