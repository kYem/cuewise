import React, { useEffect } from 'react';
import { Clock } from './Clock';
import { QuoteDisplay } from './QuoteDisplay';
import { useQuoteStore } from '../stores/quote-store';

export const NewTabPage: React.FC = () => {
  const initialize = useQuoteStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-6xl mx-auto">
        {/* Clock Section */}
        <Clock />

        {/* Quote Display Section */}
        <div className="mt-8">
          <QuoteDisplay />
        </div>

        {/* Footer */}
        <footer className="mt-16 text-center">
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
