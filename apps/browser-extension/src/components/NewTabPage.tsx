import { APP_LINKS, formatClockTime, formatLongDate, getGreeting } from '@cuewise/shared';
import { BarChart3, BookMarked, Flag, PanelRight, Settings, Timer } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { usePomodoroStorageSync, usePomodoroStore } from '../stores/pomodoro-store';
import { useQuoteStore } from '../stores/quote-store';
import { useSettingsStore } from '../stores/settings-store';
import { ActivePomodoroWidget } from './ActivePomodoroWidget';
import { Clock } from './Clock';
import { GoalsSection } from './GoalsSection';
import { GoalButton } from './goals';
import { QuoteDisplay } from './QuoteDisplay';
import { RemindersSection } from './RemindersSection';
import { SettingsModal } from './SettingsModal';
import { WelcomeModal } from './WelcomeModal';

export const NewTabPage: React.FC = () => {
  const initializeQuotes = useQuoteStore((state) => state.initialize);
  const refreshQuote = useQuoteStore((state) => state.refreshQuote);
  const initializeSettings = useSettingsStore((state) => state.initialize);
  const settingsLoading = useSettingsStore((state) => state.isLoading);
  const quoteChangeInterval = useSettingsStore((state) => state.settings.quoteChangeInterval);
  const showThemeSwitcher = useSettingsStore((state) => state.settings.showThemeSwitcher);
  const timeFormat = useSettingsStore((state) => state.settings.timeFormat);
  const hasSeenOnboarding = useSettingsStore((state) => state.settings.hasSeenOnboarding);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const initializePomodoro = usePomodoroStore((state) => state.initialize);
  const pomodoroStatus = usePomodoroStore((state) => state.status);

  // Enable cross-tab synchronization for Pomodoro timer
  usePomodoroStorageSync();

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
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

  // Show welcome modal on first visit
  useEffect(() => {
    if (!settingsLoading && !hasSeenOnboarding) {
      setIsWelcomeOpen(true);
    }
  }, [settingsLoading, hasSeenOnboarding]);

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

  const handleCloseWelcome = async () => {
    setIsWelcomeOpen(false);
    await updateSettings({ hasSeenOnboarding: true });
  };

  const handleOpenPomodoro = () => {
    window.location.hash = 'pomodoro';
  };

  const handleOpenInsights = () => {
    setIsMenuOpen(false);
    window.location.hash = 'insights';
  };

  const handleOpenGoals = () => {
    setIsMenuOpen(false);
    window.location.hash = 'goals';
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
        className={`fixed top-0 left-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/50 shadow-sm transition-all duration-300 ${
          showStickyHeader
            ? 'translate-y-0 opacity-100'
            : '-translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{
          right: showThemeSwitcher ? '320px' : '0',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Time, Greeting & Date + Objectives */}
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

              {/* Objectives Button - in sticky header */}
              <GoalButton />
            </div>

            {/* Right: Navigation */}
            <nav aria-label="Main navigation" className="flex items-center gap-density-sm">
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
                  aria-expanded={isMenuOpen}
                  aria-haspopup="menu"
                  className="p-2.5 bg-surface/80 backdrop-blur-sm text-primary rounded-full shadow-md hover:shadow-lg hover:scale-110 transition-all"
                  title="Menu"
                >
                  <Settings className="w-5 h-5" />
                </button>

                {/* Dropdown Menu */}
                {isMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-48 bg-surface-elevated rounded-lg shadow-xl border border-border overflow-hidden"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleOpenGoals}
                      className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors"
                    >
                      <Flag className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-medium">Goals</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleOpenQuoteManagement}
                      className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                    >
                      <BookMarked className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-medium">Manage Quotes</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleOpenInsights}
                      className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                    >
                      <BarChart3 className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-medium">View Insights</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleToggleThemeSwitcher}
                      className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                    >
                      <PanelRight className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-medium">Theme Switcher</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleOpenSettings}
                      className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                    >
                      <Settings className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-medium">Settings</span>
                    </button>
                  </div>
                )}
              </div>
            </nav>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full flex flex-col items-center px-density-md py-density-lg relative">
        {/* Floating Top Left - Objectives Button */}
        <div
          className={`absolute top-4 left-4 sm:top-8 sm:left-8 z-40 transition-all duration-300 ${
            showStickyHeader ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <GoalButton />
        </div>

        {/* Floating Top Right Navigation - Only visible when not scrolled */}
        <nav
          aria-label="Main navigation"
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
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
              className="p-2.5 bg-surface/80 backdrop-blur-sm text-primary rounded-full shadow-md hover:shadow-lg hover:scale-110 transition-all"
              title="Menu"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-48 bg-surface-elevated rounded-lg shadow-xl border border-border overflow-hidden"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleOpenGoals}
                  className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors"
                >
                  <Flag className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-medium">Goals</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleOpenQuoteManagement}
                  className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                >
                  <BookMarked className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-medium">Manage Quotes</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleOpenInsights}
                  className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                >
                  <BarChart3 className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-medium">View Insights</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleToggleThemeSwitcher}
                  className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                >
                  <PanelRight className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-medium">Theme Switcher</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleOpenSettings}
                  className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-surface-variant transition-colors border-t border-divider"
                >
                  <Settings className="w-5 h-5 text-primary-600" />
                  <span className="text-sm font-medium">Settings</span>
                </button>
              </div>
            )}
          </div>
        </nav>

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
          <footer className="mt-8 py-density-lg flex items-center justify-center gap-4">
            <span className="text-sm text-tertiary">
              <a
                href={APP_LINKS.website}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary-600 hover:underline transition-colors"
              >
                {__APP_NAME__}
              </a>{' '}
              <a
                href={APP_LINKS.changelog}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline"
              >
                v{__APP_VERSION__}
              </a>
            </span>
            <span className="text-tertiary">·</span>
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

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} />

      {/* Welcome Modal - First-time users */}
      <WelcomeModal isOpen={isWelcomeOpen} onClose={handleCloseWelcome} />
    </div>
  );
};
