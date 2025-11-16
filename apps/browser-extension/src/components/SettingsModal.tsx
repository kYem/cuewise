import { AMBIENT_SOUNDS } from '@cuewise/shared';
import { Bell, BellOff, Clock, Music, RefreshCw, RotateCcw } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { usePomodoroStore } from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { Modal } from './Modal';
import { StorageIndicator } from './StorageIndicator';

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
  const [longBreakDuration, setLongBreakDuration] = useState(settings.pomodoroLongBreakDuration);
  const [longBreakInterval, setLongBreakInterval] = useState(settings.pomodoroLongBreakInterval);
  const [ambientSound, setAmbientSound] = useState(settings.pomodoroAmbientSound);
  const [ambientVolume, setAmbientVolume] = useState(settings.pomodoroAmbientVolume);
  const [notifications, setNotifications] = useState(settings.enableNotifications);
  const [quoteInterval, setQuoteInterval] = useState(settings.quoteChangeInterval);
  const [timeFormat, setTimeFormat] = useState(settings.timeFormat);

  // Sync local state with store when settings change
  useEffect(() => {
    setWorkDuration(settings.pomodoroWorkDuration);
    setBreakDuration(settings.pomodoroBreakDuration);
    setLongBreakDuration(settings.pomodoroLongBreakDuration);
    setLongBreakInterval(settings.pomodoroLongBreakInterval);
    setAmbientSound(settings.pomodoroAmbientSound);
    setAmbientVolume(settings.pomodoroAmbientVolume);
    setNotifications(settings.enableNotifications);
    setQuoteInterval(settings.quoteChangeInterval);
    setTimeFormat(settings.timeFormat);
  }, [settings]);

  // Format interval for display
  const formatInterval = (seconds: number): string => {
    if (seconds === 0) return 'Manual';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const remainingMinutes = Math.floor((seconds % 3600) / 60);
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  };

  // Handle save
  const handleSave = async () => {
    await updateSettings({
      pomodoroWorkDuration: workDuration,
      pomodoroBreakDuration: breakDuration,
      pomodoroLongBreakDuration: longBreakDuration,
      pomodoroLongBreakInterval: longBreakInterval,
      pomodoroAmbientSound: ambientSound,
      pomodoroAmbientVolume: ambientVolume,
      enableNotifications: notifications,
      quoteChangeInterval: quoteInterval,
      timeFormat,
    });

    // Reload Pomodoro settings if any pomodoro settings changed
    if (
      workDuration !== settings.pomodoroWorkDuration ||
      breakDuration !== settings.pomodoroBreakDuration ||
      longBreakDuration !== settings.pomodoroLongBreakDuration ||
      longBreakInterval !== settings.pomodoroLongBreakInterval ||
      ambientSound !== settings.pomodoroAmbientSound ||
      ambientVolume !== settings.pomodoroAmbientVolume
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
            <h3 className="text-lg font-semibold text-primary">Pomodoro Timer</h3>
          </div>

          <div className="space-y-4 pl-7">
            {/* Work Duration */}
            <div>
              <label
                htmlFor="work-duration"
                className="block text-sm font-medium text-primary mb-2"
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
                  className="flex-1 h-2 bg-divider rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={workDuration}
                  onChange={(e) => setWorkDuration(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Break Duration */}
            <div>
              <label
                htmlFor="break-duration"
                className="block text-sm font-medium text-primary mb-2"
              >
                Short Break Duration:{' '}
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
                  className="flex-1 h-2 bg-divider rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={breakDuration}
                  onChange={(e) => setBreakDuration(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Long Break Duration */}
            <div>
              <label
                htmlFor="long-break-duration"
                className="block text-sm font-medium text-primary mb-2"
              >
                Long Break Duration:{' '}
                <span className="text-primary-600 font-semibold">{longBreakDuration} minutes</span>
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="long-break-duration"
                  type="range"
                  min="10"
                  max="60"
                  step="1"
                  value={longBreakDuration}
                  onChange={(e) => setLongBreakDuration(Number(e.target.value))}
                  className="flex-1 h-2 bg-divider rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <input
                  type="number"
                  min="10"
                  max="60"
                  value={longBreakDuration}
                  onChange={(e) => setLongBreakDuration(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Long Break Interval */}
            <div>
              <label
                htmlFor="long-break-interval"
                className="block text-sm font-medium text-primary mb-2"
              >
                Long Break After:{' '}
                <span className="text-primary-600 font-semibold">
                  {longBreakInterval} session{longBreakInterval !== 1 ? 's' : ''}
                </span>
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="long-break-interval"
                  type="range"
                  min="2"
                  max="10"
                  step="1"
                  value={longBreakInterval}
                  onChange={(e) => setLongBreakInterval(Number(e.target.value))}
                  className="flex-1 h-2 bg-divider rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={longBreakInterval}
                  onChange={(e) => setLongBreakInterval(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Ambient Sound Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Music className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-primary">Ambient Sounds</h3>
          </div>

          <div className="space-y-4 pl-7">
            {/* Ambient Sound Selection */}
            <div>
              <label
                htmlFor="ambient-sound"
                className="block text-sm font-medium text-primary mb-2"
              >
                Sound Type
              </label>
              <select
                id="ambient-sound"
                value={ambientSound}
                onChange={(e) => setAmbientSound(e.target.value)}
                className="w-full px-3 py-2 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {Object.entries(AMBIENT_SOUNDS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-secondary mt-1">
                Ambient sounds play during work sessions only
              </p>
            </div>

            {/* Volume Control */}
            {ambientSound !== 'none' && (
              <div>
                <label
                  htmlFor="ambient-volume"
                  className="block text-sm font-medium text-primary mb-2"
                >
                  Volume: <span className="text-primary-600 font-semibold">{ambientVolume}%</span>
                </label>
                <div className="flex items-center gap-4">
                  <input
                    id="ambient-volume"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={ambientVolume}
                    onChange={(e) => setAmbientVolume(Number(e.target.value))}
                    className="flex-1 h-2 bg-divider rounded-lg appearance-none cursor-pointer accent-primary-600"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={ambientVolume}
                    onChange={(e) => setAmbientVolume(Number(e.target.value))}
                    className="w-16 px-2 py-1 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Notifications Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            {notifications ? (
              <Bell className="w-5 h-5 text-primary-600" />
            ) : (
              <BellOff className="w-5 h-5 text-tertiary" />
            )}
            <h3 className="text-lg font-semibold text-primary">Notifications</h3>
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
                <div className="w-11 h-6 bg-divider peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </div>
              <div>
                <span className="text-sm font-medium text-primary">Enable notifications</span>
                <p className="text-xs text-secondary">
                  Get notified when Pomodoro sessions complete and reminders are due
                </p>
              </div>
            </label>
          </div>
        </section>

        {/* Time Format Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-primary">Time Format</h3>
          </div>

          <div className="grid grid-cols-2 gap-3 pl-7">
            <button
              type="button"
              onClick={() => setTimeFormat('12h')}
              className={`p-4 rounded-lg border-2 transition-all ${
                timeFormat === '12h'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-border hover:border-primary-300 bg-surface'
              }`}
            >
              <div className="text-2xl font-bold text-primary mb-1">2:30</div>
              <div className="text-xs text-primary-600 font-medium mb-2">PM</div>
              <span className="block text-sm font-medium text-primary">12-hour</span>
            </button>

            <button
              type="button"
              onClick={() => setTimeFormat('24h')}
              className={`p-4 rounded-lg border-2 transition-all ${
                timeFormat === '24h'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-border hover:border-primary-300 bg-surface'
              }`}
            >
              <div className="text-2xl font-bold text-primary mb-1">14:30</div>
              <div className="text-xs text-transparent font-medium mb-2">.</div>
              <span className="block text-sm font-medium text-primary">24-hour</span>
            </button>
          </div>
        </section>

        {/* Quote Change Interval Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-primary">Quote Change Interval</h3>
          </div>

          <div className="space-y-4 pl-7">
            {/* Current interval display */}
            <div className="flex items-center justify-between">
              <div className="block text-sm font-medium text-primary">
                Current interval:{' '}
                <span className="text-primary-600 font-semibold">
                  {formatInterval(quoteInterval)}
                </span>
              </div>
            </div>

            {/* Quick preset buttons */}
            <div>
              <p className="text-xs text-secondary mb-2">Quick presets:</p>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setQuoteInterval(0)}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${
                    quoteInterval === 0
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-variant text-primary hover:bg-border'
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setQuoteInterval(10)}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${
                    quoteInterval === 10
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-variant text-primary hover:bg-border'
                  }`}
                >
                  10s
                </button>
                <button
                  type="button"
                  onClick={() => setQuoteInterval(30)}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${
                    quoteInterval === 30
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-variant text-primary hover:bg-border'
                  }`}
                >
                  30s
                </button>
                <button
                  type="button"
                  onClick={() => setQuoteInterval(60)}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${
                    quoteInterval === 60
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-variant text-primary hover:bg-border'
                  }`}
                >
                  1m
                </button>
                <button
                  type="button"
                  onClick={() => setQuoteInterval(300)}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${
                    quoteInterval === 300
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-variant text-primary hover:bg-border'
                  }`}
                >
                  5m
                </button>
                <button
                  type="button"
                  onClick={() => setQuoteInterval(1800)}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${
                    quoteInterval === 1800
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-variant text-primary hover:bg-border'
                  }`}
                >
                  30m
                </button>
                <button
                  type="button"
                  onClick={() => setQuoteInterval(3600)}
                  className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${
                    quoteInterval === 3600
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-variant text-primary hover:bg-border'
                  }`}
                >
                  1h
                </button>
              </div>
            </div>

            {/* Custom interval slider and input */}
            {quoteInterval > 0 && (
              <div>
                <label
                  htmlFor="quote-interval"
                  className="block text-sm font-medium text-primary mb-2"
                >
                  Custom interval (10s - 1h):
                </label>
                <div className="flex items-center gap-4">
                  <input
                    id="quote-interval"
                    type="range"
                    min="10"
                    max="3600"
                    step="1"
                    value={quoteInterval}
                    onChange={(e) => setQuoteInterval(Number(e.target.value))}
                    className="flex-1 h-2 bg-divider rounded-lg appearance-none cursor-pointer accent-primary-600"
                  />
                  <input
                    type="number"
                    min="10"
                    max="3600"
                    value={quoteInterval}
                    onChange={(e) => setQuoteInterval(Number(e.target.value))}
                    className="w-20 px-2 py-1 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-xs text-secondary w-8">sec</span>
                </div>
              </div>
            )}

            <p className="text-xs text-secondary">
              {quoteInterval === 0
                ? 'Quotes will only change when you click the refresh button'
                : `Quotes will automatically change every ${formatInterval(quoteInterval).toLowerCase()}`}
            </p>
          </div>
        </section>

        {/* Storage Usage */}
        <StorageIndicator mode="full" />

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-surface border border-border rounded-lg hover:bg-surface-variant transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-primary bg-surface border border-border rounded-lg hover:bg-surface-variant transition-colors"
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
