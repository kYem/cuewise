import { Bell, BellOff, Clock, Moon, Palette, RefreshCw, RotateCcw, Sun } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { usePomodoroStore } from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { Modal } from './Modal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, resetToDefaults } = useSettingsStore();
  const reloadPomodoroSettings = usePomodoroStore((state) => state.reloadSettings);

  // Local state for form controls
  const [workDuration, setWorkDuration] = useState(settings.pomodoroWorkDuration);
  const [breakDuration, setBreakDuration] = useState(settings.pomodoroBreakDuration);
  const [theme, setTheme] = useState(settings.theme);
  const [notifications, setNotifications] = useState(settings.enableNotifications);
  const [quoteInterval, setQuoteInterval] = useState(settings.quoteChangeInterval);

  // Sync local state with store when settings change
  useEffect(() => {
    setWorkDuration(settings.pomodoroWorkDuration);
    setBreakDuration(settings.pomodoroBreakDuration);
    setTheme(settings.theme);
    setNotifications(settings.enableNotifications);
    setQuoteInterval(settings.quoteChangeInterval);
  }, [settings]);

  // Handle save
  const handleSave = async () => {
    await updateSettings({
      pomodoroWorkDuration: workDuration,
      pomodoroBreakDuration: breakDuration,
      theme,
      enableNotifications: notifications,
      quoteChangeInterval: quoteInterval,
    });

    // Reload Pomodoro settings if durations changed
    if (
      workDuration !== settings.pomodoroWorkDuration ||
      breakDuration !== settings.pomodoroBreakDuration
    ) {
      await reloadPomodoroSettings();
    }

    onClose();
  };

  // Handle reset to defaults
  const handleReset = async () => {
    if (window.confirm('Reset all settings to default values?')) {
      await resetToDefaults();
      await reloadPomodoroSettings();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="space-y-8">
        {/* Pomodoro Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-800">Pomodoro Timer</h3>
          </div>

          <div className="space-y-4 pl-7">
            {/* Work Duration */}
            <div>
              <label
                htmlFor="work-duration"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Work Duration:{' '}
                <span className="text-primary-600 font-semibold">{workDuration} minutes</span>
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="work-duration"
                  type="range"
                  min="1"
                  max="60"
                  step="1"
                  value={workDuration}
                  onChange={(e) => setWorkDuration(Number(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={workDuration}
                  onChange={(e) => setWorkDuration(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Break Duration */}
            <div>
              <label
                htmlFor="break-duration"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Break Duration:{' '}
                <span className="text-primary-600 font-semibold">{breakDuration} minutes</span>
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="break-duration"
                  type="range"
                  min="1"
                  max="30"
                  step="1"
                  value={breakDuration}
                  onChange={(e) => setBreakDuration(Number(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={breakDuration}
                  onChange={(e) => setBreakDuration(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Theme Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-800">Theme</h3>
          </div>

          <div className="grid grid-cols-3 gap-3 pl-7">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`p-4 rounded-lg border-2 transition-all ${
                theme === 'light'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <Sun className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
              <span className="block text-sm font-medium text-gray-700">Light</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`p-4 rounded-lg border-2 transition-all ${
                theme === 'dark'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <Moon className="w-6 h-6 mx-auto mb-2 text-indigo-500" />
              <span className="block text-sm font-medium text-gray-700">Dark</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme('auto')}
              className={`p-4 rounded-lg border-2 transition-all ${
                theme === 'auto'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <RefreshCw className="w-6 h-6 mx-auto mb-2 text-gray-500" />
              <span className="block text-sm font-medium text-gray-700">Auto</span>
            </button>
          </div>
        </section>

        {/* Notifications Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            {notifications ? (
              <Bell className="w-5 h-5 text-primary-600" />
            ) : (
              <BellOff className="w-5 h-5 text-gray-400" />
            )}
            <h3 className="text-lg font-semibold text-gray-800">Notifications</h3>
          </div>

          <div className="pl-7">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={notifications}
                  onChange={(e) => setNotifications(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Enable notifications</span>
                <p className="text-xs text-gray-500">
                  Get notified when Pomodoro sessions complete and reminders are due
                </p>
              </div>
            </label>
          </div>
        </section>

        {/* Quote Change Interval Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-800">Quote Change Interval</h3>
          </div>

          <div className="space-y-2 pl-7">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="quote-interval"
                value="manual"
                checked={quoteInterval === 'manual'}
                onChange={(e) => setQuoteInterval(e.target.value as typeof quoteInterval)}
                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 focus:ring-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Manual</span>
                <p className="text-xs text-gray-500">
                  Change quote only when clicking the refresh button
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="quote-interval"
                value="daily"
                checked={quoteInterval === 'daily'}
                onChange={(e) => setQuoteInterval(e.target.value as typeof quoteInterval)}
                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 focus:ring-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Daily</span>
                <p className="text-xs text-gray-500">Automatically change quote once per day</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="quote-interval"
                value="hourly"
                checked={quoteInterval === 'hourly'}
                onChange={(e) => setQuoteInterval(e.target.value as typeof quoteInterval)}
                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 focus:ring-primary-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Hourly</span>
                <p className="text-xs text-gray-500">Automatically change quote every hour</p>
              </div>
            </label>
          </div>
        </section>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
