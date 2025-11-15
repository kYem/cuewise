import { BarChart3, Plus, Settings, Timer } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { AddQuoteForm } from './AddQuoteForm';
import { Clock } from './Clock';
import { GoalsSection } from './GoalsSection';
import { Modal } from './Modal';
import { QuoteDisplay } from './QuoteDisplay';
import { RemindersSection } from './RemindersSection';
import { SettingsModal } from './SettingsModal';

export const NewTabPage: React.FC = () => {
  const initializeQuotes = useQuoteStore((state) => state.initialize);
  const initializeSettings = useSettingsStore((state) => state.initialize);
  const [isAddQuoteModalOpen, setIsAddQuoteModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  useEffect(() => {
    initializeQuotes();
    initializeSettings();
  }, [initializeQuotes, initializeSettings]);

  const handleQuoteAdded = () => {
    setIsAddQuoteModalOpen(false);
    // Optionally show success message
  };

  const handleOpenPomodoro = () => {
    window.location.hash = 'pomodoro';
  };

  const handleOpenInsights = () => {
    window.location.hash = 'insights';
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto">
      <div className="w-full flex flex-col items-center px-4 sm:px-8 py-8 sm:py-12">
        {/* Top Right Buttons */}
        <div className="fixed top-4 right-4 sm:top-8 sm:right-8 flex items-center gap-2 z-50">
          {/* Pomodoro Button */}
          <button
            type="button"
            onClick={handleOpenPomodoro}
            className="group relative flex items-center gap-2 px-4 py-3 bg-white/80 backdrop-blur-sm text-gray-700 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all"
            title="Start Pomodoro Timer"
          >
            <Timer className="w-5 h-5 text-primary-600" />
            <span className="hidden sm:inline text-sm font-medium text-gray-800">Pomodoro</span>
            <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-sm px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none sm:hidden">
              Start Pomodoro
            </span>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-3 bg-white/80 backdrop-blur-sm text-gray-700 rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all group"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
            <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-sm px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Settings
            </span>
          </button>
        </div>

        <div className="w-full max-w-7xl mx-auto space-y-8 sm:space-y-12">
          {/* Clock Section */}
          <Clock />

          {/* Quote Display Section */}
          <div className="flex justify-center">
            <QuoteDisplay />
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Pomodoro Button */}
            <button
              type="button"
              onClick={handleOpenPomodoro}
              className="w-full group relative flex items-center justify-center gap-3 px-6 py-5 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all hover:scale-105 border border-gray-200/50"
            >
              <Timer className="w-6 h-6 text-primary-600" />
              <span className="text-lg font-medium text-gray-800">Pomodoro Timer</span>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary-500/0 via-primary-500/5 to-primary-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            {/* Insights Button */}
            <button
              type="button"
              onClick={handleOpenInsights}
              className="w-full group relative flex items-center justify-center gap-3 px-6 py-5 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all hover:scale-105 border border-gray-200/50"
            >
              <BarChart3 className="w-6 h-6 text-purple-600" />
              <span className="text-lg font-medium text-gray-800">View Insights</span>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>

          {/* Two Column Layout for Larger Screens */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Goals Section */}
              <GoalsSection />
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Reminders Section */}
              <RemindersSection />
            </div>
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
        className="fixed bottom-8 right-8 p-4 bg-primary-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all group z-50"
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

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} />
    </div>
  );
};
