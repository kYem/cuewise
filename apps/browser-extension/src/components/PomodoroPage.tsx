import { ArrowLeft } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
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

  const handleBackToHome = () => {
    window.location.hash = '';
  };

  return (
    <div className="min-h-screen w-full p-density-lg">
      {/* Back Button */}
      <button
        type="button"
        onClick={handleBackToHome}
        className="mb-8 flex items-center gap-density-xs text-secondary hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to Home</span>
      </button>

      {/* Split Layout for Large Screens */}
      <div className="flex flex-col lg:flex-row gap-density-lg items-center justify-center min-h-[calc(100vh-8rem)]">
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
