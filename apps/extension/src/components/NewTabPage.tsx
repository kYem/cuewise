import React, { useEffect } from 'react';
import { Clock } from './Clock';
import { QuoteDisplay } from './QuoteDisplay';
import { GoalsSection } from './GoalsSection';
import { useQuoteStore } from '../stores/quote-store';

export const NewTabPage: React.FC = () => {
  const initialize = useQuoteStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-8 py-12">
      <div className="w-full max-w-6xl mx-auto space-y-12">
        {/* Clock Section */}
        <Clock />

        {/* Quote Display Section */}
        <div className="flex justify-center">
          <QuoteDisplay />
        </div>

        {/* Goals Section */}
        <div className="flex justify-center">
          <GoalsSection />
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            Press{' '}
            <kbd className="px-2 py-1 bg-white rounded border border-gray-300 text-xs font-mono">
              Ctrl
            </kbd>
            {' + '}
            <kbd className="px-2 py-1 bg-white rounded border border-gray-300 text-xs font-mono">
              T
            </kbd>
            {' '}to open a new tab
          </p>
        </footer>
      </div>
    </div>
  );
};
