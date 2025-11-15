import { BarChart3, Plus, Settings, Timer } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeQuotes();
    initializeSettings();
  }, [initializeQuotes, initializeSettings]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleQuoteAdded = () => {
    setIsAddQuoteModalOpen(false);
    // Optionally show success message
  };

  const handleOpenPomodoro = () => {
    window.location.hash = 'pomodoro';
  };

  const handleOpenInsights = () => {
    setIsMenuOpen(false);
    window.location.hash = 'insights';
  };

  const handleOpenSettings = () => {
    setIsMenuOpen(false);
    setIsSettingsModalOpen(true);
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto">
      <div className="w-full flex flex-col items-center px-4 sm:px-8 py-8 sm:py-12">
        {/* Top Right Navigation */}
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
          </button>

          {/* Menu Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-3 bg-white/80 backdrop-blur-sm text-gray-700 rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all"
              title="Menu"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={handleOpenInsights}
                  className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <BarChart3 className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-medium">View Insights</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenSettings}
                  className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100"
                >
                  <Settings className="w-5 h-5 text-gray-600" />
                  <span className="text-sm font-medium">Settings</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="w-full max-w-7xl mx-auto space-y-8 sm:space-y-12">
          {/* Clock Section */}
          <Clock />

          {/* Quote Display Section */}
          <div className="flex justify-center">
            <QuoteDisplay />
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
