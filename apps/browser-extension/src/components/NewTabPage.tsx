import { BarChart3, BookMarked, PanelRight, Plus, Settings, Timer } from 'lucide-react';
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
  const refreshQuote = useQuoteStore((state) => state.refreshQuote);
  const initializeSettings = useSettingsStore((state) => state.initialize);
  const quoteChangeInterval = useSettingsStore((state) => state.settings.quoteChangeInterval);
  const showThemeSwitcher = useSettingsStore((state) => state.settings.showThemeSwitcher);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const [isAddQuoteModalOpen, setIsAddQuoteModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [lastManualRefresh, setLastManualRefresh] = useState(Date.now());
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeQuotes();
    initializeSettings();
  }, [initializeQuotes, initializeSettings]);

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

  const handleOpenQuoteManagement = () => {
    setIsMenuOpen(false);
    window.location.hash = 'quotes';
  };

  const handleOpenSettings = () => {
    setIsMenuOpen(false);
    setIsSettingsModalOpen(true);
  };

  const handleToggleThemeSwitcher = () => {
    updateSettings({ showThemeSwitcher: !showThemeSwitcher });
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto">
      <div className="w-full flex flex-col items-center px-density-md py-density-lg relative">
        {/* Top Right Navigation */}
        <div className="absolute top-4 right-4 sm:top-8 sm:right-8 flex items-center gap-density-sm z-50">
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
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  type="button"
                  onClick={handleOpenQuoteManagement}
                  className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <BookMarked className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  <span className="text-sm font-medium">Manage Quotes</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenInsights}
                  className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-t border-gray-100 dark:border-gray-700"
                >
                  <BarChart3 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  <span className="text-sm font-medium">View Insights</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleThemeSwitcher}
                  className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-t border-gray-100 dark:border-gray-700"
                >
                  <PanelRight className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  <span className="text-sm font-medium">Theme Switcher</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenSettings}
                  className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-t border-gray-100 dark:border-gray-700"
                >
                  <Settings className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  <span className="text-sm font-medium">Settings</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="w-full max-w-7xl mx-auto space-y-density-xl">
          {/* Clock Section */}
          <Clock />

          {/* Quote Display Section */}
          <div className="flex justify-center">
            <QuoteDisplay onManualRefresh={() => setLastManualRefresh(Date.now())} />
          </div>

          {/* Two Column Layout for Larger Screens */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-density-lg">
            {/* Left Column */}
            <div className="space-y-density-md">
              {/* Goals Section */}
              <GoalsSection />
            </div>

            {/* Right Column */}
            <div className="space-y-density-md">
              {/* Reminders Section */}
              <RemindersSection />
            </div>
          </div>

          {/* Footer */}
          <footer className="mt-8 text-center py-density-lg">
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
