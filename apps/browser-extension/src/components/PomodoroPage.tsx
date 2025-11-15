import { ArrowLeft } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';
import { useQuoteStore } from '../stores/quote-store';
import { PomodoroTimer } from './PomodoroTimer';
import { QuoteDisplay } from './QuoteDisplay';

export const PomodoroPage: React.FC = () => {
  const initialize = useQuoteStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleBackToHome = () => {
    window.location.hash = '';
  };

  return (
    <div className="min-h-screen w-full p-8 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100">
      {/* Back Button */}
      <button
        type="button"
        onClick={handleBackToHome}
        className="mb-8 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to Home</span>
      </button>

      {/* Split Layout for Large Screens */}
      <div className="flex flex-col lg:flex-row gap-8 items-center justify-center min-h-[calc(100vh-8rem)]">
        {/* Pomodoro Timer */}
        <div className="flex-shrink-0">
          <PomodoroTimer />
        </div>

        {/* Quote Display - Hidden on small screens, shown on large screens */}
        <div className="hidden lg:flex lg:max-w-2xl">
          <QuoteDisplay />
        </div>
      </div>
    </div>
  );
};
