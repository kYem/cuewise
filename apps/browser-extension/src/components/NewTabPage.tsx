import { Plus, Timer } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';
import { AddQuoteForm } from './AddQuoteForm';
import { Clock } from './Clock';
import { GoalsSection } from './GoalsSection';
import { Modal } from './Modal';
import { QuoteDisplay } from './QuoteDisplay';
import { RemindersSection } from './RemindersSection';

export const NewTabPage: React.FC = () => {
  const initialize = useQuoteStore((state) => state.initialize);
  const [isAddQuoteModalOpen, setIsAddQuoteModalOpen] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleQuoteAdded = () => {
    setIsAddQuoteModalOpen(false);
    // Optionally show success message
  };

  const handleOpenPomodoro = () => {
    window.location.hash = 'pomodoro';
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto">
      <div className="w-full flex flex-col items-center p-8 py-12">
        <div className="w-full max-w-6xl mx-auto space-y-12">
          {/* Clock Section */}
          <Clock />

          {/* Quote Display Section */}
          <div className="flex justify-center">
            <QuoteDisplay />
          </div>

          {/* Pomodoro Button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleOpenPomodoro}
              className="group relative flex items-center gap-3 px-8 py-4 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all hover:scale-105 border border-gray-200/50"
            >
              <Timer className="w-6 h-6 text-primary-600" />
              <span className="text-lg font-medium text-gray-800">Start Pomodoro Timer</span>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary-500/0 via-primary-500/5 to-primary-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>

          {/* Goals Section */}
          <div className="flex justify-center">
            <GoalsSection />
          </div>

          {/* Reminders Section */}
          <div className="flex justify-center">
            <RemindersSection />
          </div>

          {/* Footer */}
          <footer className="mt-8 text-center pb-8">
            <p className="text-sm text-gray-400">
              Press{' '}
              <kbd className="px-2 py-1 bg-white rounded border border-gray-300 text-xs font-mono">
                Ctrl
              </kbd>
              {' + '}
              <kbd className="px-2 py-1 bg-white rounded border border-gray-300 text-xs font-mono">
                T
              </kbd>{' '}
              to open a new tab
            </p>
          </footer>
        </div>
      </div>

      {/* Floating Action Button - Add Custom Quote */}
      <button
        type="button"
        onClick={() => setIsAddQuoteModalOpen(true)}
        className="fixed bottom-8 right-8 p-4 bg-primary-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all group"
        title="Add custom quote"
      >
        <Plus className="w-6 h-6" />
        <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-sm px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Add Custom Quote
        </span>
      </button>

      {/* Add Quote Modal */}
      <Modal
        isOpen={isAddQuoteModalOpen}
        onClose={() => setIsAddQuoteModalOpen(false)}
        title="Add Custom Quote"
      >
        <AddQuoteForm onSuccess={handleQuoteAdded} />
      </Modal>
    </div>
  );
};
