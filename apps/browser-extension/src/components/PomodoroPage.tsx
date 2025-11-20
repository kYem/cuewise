import type React from 'react';
import { useEffect, useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { PageHeader } from './PageHeader';
import { PomodoroTimer } from './PomodoroTimer';
import { QuoteDisplay } from './QuoteDisplay';

export const PomodoroPage: React.FC = () => {
  const initialize = useQuoteStore((state) => state.initialize);
  const refreshQuote = useQuoteStore((state) => state.refreshQuote);
  const initializeSettings = useSettingsStore((state) => state.initialize);
  const quoteChangeInterval = useSettingsStore((state) => state.settings.quoteChangeInterval);
  const [lastManualRefresh, setLastManualRefresh] = useState(Date.now());

  useEffect(() => {
    initialize();
    initializeSettings();
  }, [initialize, initializeSettings]);

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
    <div className="min-h-screen w-full bg-background">
      <PageHeader
        currentPage="pomodoro"
        title="Pomodoro Timer"
        subtitle="Stay focused and productive with timed work sessions"
      />

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
  );
};
