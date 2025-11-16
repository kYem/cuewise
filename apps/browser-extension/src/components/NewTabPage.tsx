import { formatClockTime, formatLongDate, getGreeting } from '@cuewise/shared';
import { BarChart3, BookMarked, PanelRight, Plus, Settings, Timer } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { usePomodoroStorageSync, usePomodoroStore } from '../stores/pomodoro-store';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { ActivePomodoroWidget } from './ActivePomodoroWidget';
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
  const timeFormat = useSettingsStore((state) => state.settings.timeFormat);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const initializePomodoro = usePomodoroStore((state) => state.initialize);
  const pomodoroStatus = usePomodoroStore((state) => state.status);

  // Enable cross-tab synchronization for Pomodoro timer
  usePomodoroStorageSync();

  const [isAddQuoteModalOpen, setIsAddQuoteModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [lastManualRefresh, setLastManualRefresh] = useState(Date.now());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const stickyMenuRef = useRef<HTMLDivElement>(null);
  const floatingMenuRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);

  // Update time every second for sticky header
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Observe clock visibility to show/hide sticky header
  useEffect(() => {
    const currentClockRef = clockRef.current;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show sticky header when clock is not visible
        setShowStickyHeader(!entry.isIntersecting);
      },
      {
        threshold: 0,
        rootMargin: '-120px 0px 0px 0px', // Trigger earlier to prevent gap
      }
    );

    if (currentClockRef) {
      observer.observe(currentClockRef);
    }

    return () => {
      if (currentClockRef) {
        observer.unobserve(currentClockRef);
      }
    };
  }, []);

  useEffect(() => {
    initializeQuotes();
    initializeSettings();
    initializePomodoro();
  }, [initializeQuotes, initializeSettings, initializePomodoro]);

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
      const clickedInStickyMenu = stickyMenuRef.current?.contains(event.target as Node);
      const clickedInFloatingMenu = floatingMenuRef.current?.contains(event.target as Node);

      if (!clickedInStickyMenu && !clickedInFloatingMenu) {
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

  const { time, period } = formatClockTime(currentTime, timeFormat);
  const greeting = getGreeting(currentTime);
  const longDate = formatLongDate(currentTime);

  return (
    <div className="min-h-screen w-full overflow-y-auto">
      {/* Sticky Header - Only visible when scrolled */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 w-full bg-background/95 backdrop-blur-md border-b border-border/50 shadow-sm transition-all duration-300 ${
          showStickyHeader
            ? 'translate-y-0 opacity-100'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Time, Greeting & Date */}
            <div className="flex items-center gap-4">
              {/* Time */}
              <div className="flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-bold text-primary tabular-nums">
                  {time}
                </span>
                {period && <span className="text-sm font-medium text-secondary">{period}</span>}
              </div>

              {/* Greeting & Date - Hidden on small screens */}
              <div className="hidden md:flex flex-col">
                <span className="text-sm font-medium text-primary">{greeting}</span>
                <span className="text-xs text-secondary">{longDate}</span>
              </div>
            </div>

            {/* Right: Navigation */}
            <div className="flex items-center gap-density-sm">
              {/* Pomodoro Button or Active Session Widget */}
              {pomodoroStatus !== 'idle' ? (
                <ActivePomodoroWidget />
              ) : (
                <button
                  type="button"
                  onClick={handleOpenPomodoro}
                  className="group relative flex items-center gap-2 px-4 py-2.5 bg-surface/80 backdrop-blur-sm text-primary rounded-full shadow-md hover:shadow-lg hover:scale-105 transition-all"
                  title="Start Pomodoro Timer"
                >
                  <Timer className="w-5 h-5 text-primary-600" />
                  <span className="hidden sm:inline text-sm font-medium text-primary">
                    Pomodoro
                  </span>
                </button>
              )}

              {/* Menu Dropdown */}
              <div className="relative" ref={stickyMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="p-2.5 bg-surface/80 backdrop-blur-sm text-primary rounded-full shadow-md hover:shadow-lg hover:scale-110 transition-all"
                  title="Menu"
                >
                  <Settings className="w-5 h-5" />
                </button>

                {/* Dropdown Menu */}
                {isMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-surface-elevated rounded-lg shadow-xl border border-border overflow-hidden">
                    <button
                      type="button"
                      onClick={handleOpenQuoteManagement}
                      className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors"
                    >
                      <BookMarked className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-medium">Manage Quotes</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenInsights}
                      className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                    >
                      <BarChart3 className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-medium">View Insights</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleThemeSwitcher}
                      className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                    >
                      <PanelRight className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-medium">Theme Switcher</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenSettings}
                      className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                    >
                      <Settings className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-medium">Settings</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full flex flex-col items-center px-density-md py-density-lg relative">
        {/* Floating Top Right Navigation - Only visible when not scrolled */}
        <div
          className={`absolute top-4 right-4 sm:top-8 sm:right-8 flex items-center gap-density-sm z-40 transition-all duration-300 ${
            showStickyHeader ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          {/* Pomodoro Button or Active Session Widget */}
          {pomodoroStatus !== 'idle' ? (
            <ActivePomodoroWidget />
          ) : (
            <button
              type="button"
              onClick={handleOpenPomodoro}
              className="group relative flex items-center gap-2 px-4 py-2.5 bg-surface/80 backdrop-blur-sm text-primary rounded-full shadow-md hover:shadow-lg hover:scale-105 transition-all"
              title="Start Pomodoro Timer"
            >
              <Timer className="w-5 h-5 text-primary-600" />
              <span className="hidden sm:inline text-sm font-medium text-primary">Pomodoro</span>
            </button>
          )}

          {/* Menu Dropdown */}
          <div className="relative" ref={floatingMenuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2.5 bg-surface/80 backdrop-blur-sm text-primary rounded-full shadow-md hover:shadow-lg hover:scale-110 transition-all"
              title="Menu"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-surface-elevated rounded-lg shadow-xl border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={handleOpenQuoteManagement}
                  className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors"
                >
                  <BookMarked className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-medium">Manage Quotes</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenInsights}
                  className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                >
                  <BarChart3 className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-medium">View Insights</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleThemeSwitcher}
                  className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                >
                  <PanelRight className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-medium">Theme Switcher</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenSettings}
                  className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                >
                  <Settings className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-medium">Settings</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="w-full max-w-7xl mx-auto space-y-density-xl">
          {/* Clock Section - Observe this for sticky header */}
          <div ref={clockRef}>
            <Clock />
          </div>

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
            <p className="text-sm text-tertiary">
              Press{' '}
              <kbd className="px-2 py-1 bg-surface rounded border border-border text-xs font-mono">
                Ctrl
              </kbd>
              {' + '}
              <kbd className="px-2 py-1 bg-surface rounded border border-border text-xs font-mono">
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
