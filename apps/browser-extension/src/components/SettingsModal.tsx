import {
  AMBIENT_SOUNDS,
  type AmbientSoundType,
  FOCUS_IMAGE_CATEGORIES,
  type FocusImageCategory,
  NOTIFICATION_SOUNDS,
  type NotificationSoundType,
  type SettingsLogLevel,
} from '@cuewise/shared';
import {
  ArrowRight,
  Bell,
  BellOff,
  Bug,
  Clock,
  Cloud,
  CloudOff,
  Headphones,
  Maximize2,
  Music,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { usePomodoroStore } from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { ambientSoundPlayer } from '../utils/ambient-sounds';
import { previewSound } from '../utils/sounds';
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
  const [longBreakDuration, setLongBreakDuration] = useState(settings.pomodoroLongBreakDuration);
  const [longBreakInterval, setLongBreakInterval] = useState(settings.pomodoroLongBreakInterval);
  const [ambientSound, setAmbientSound] = useState(settings.pomodoroAmbientSound);
  const [ambientVolume, setAmbientVolume] = useState(settings.pomodoroAmbientVolume);
  const [startSound, setStartSound] = useState(settings.pomodoroStartSound);
  const [completionSound, setCompletionSound] = useState(settings.pomodoroCompletionSound);
  const [notifications, setNotifications] = useState(settings.enableNotifications);
  const [quoteInterval, setQuoteInterval] = useState(settings.quoteChangeInterval);
  const [timeFormat, setTimeFormat] = useState(settings.timeFormat);
  const [syncEnabled, setSyncEnabled] = useState(settings.syncEnabled);
  const [enableGoalTransfer, setEnableGoalTransfer] = useState(settings.enableGoalTransfer);
  const [goalTransferTime, setGoalTransferTime] = useState(settings.goalTransferTime);
  const [logLevel, setLogLevel] = useState(settings.logLevel);
  const [focusModeEnabled, setFocusModeEnabled] = useState(settings.focusModeEnabled);
  const [focusModeImageCategory, setFocusModeImageCategory] = useState(
    settings.focusModeImageCategory
  );
  const [focusModeShowQuote, setFocusModeShowQuote] = useState(settings.focusModeShowQuote);
  const [focusModeAutoEnter, setFocusModeAutoEnter] = useState(settings.focusModeAutoEnter);
  const [showClock, setShowClock] = useState(settings.showClock);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [pomodoroMusicEnabled, setPomodoroMusicEnabled] = useState(settings.pomodoroMusicEnabled);
  const [pomodoroMusicVolume, setPomodoroMusicVolume] = useState(settings.pomodoroMusicVolume);
  const [pomodoroMusicAutoStart, setPomodoroMusicAutoStart] = useState(
    settings.pomodoroMusicAutoStart
  );
  const [pomodoroMusicPlayDuringBreaks, setPomodoroMusicPlayDuringBreaks] = useState(
    settings.pomodoroMusicPlayDuringBreaks
  );

  // Sync local state with store when settings change
  useEffect(() => {
    setWorkDuration(settings.pomodoroWorkDuration);
    setBreakDuration(settings.pomodoroBreakDuration);
    setLongBreakDuration(settings.pomodoroLongBreakDuration);
    setLongBreakInterval(settings.pomodoroLongBreakInterval);
    setAmbientSound(settings.pomodoroAmbientSound);
    setAmbientVolume(settings.pomodoroAmbientVolume);
    setStartSound(settings.pomodoroStartSound);
    setCompletionSound(settings.pomodoroCompletionSound);
    setNotifications(settings.enableNotifications);
    setQuoteInterval(settings.quoteChangeInterval);
    setTimeFormat(settings.timeFormat);
    setSyncEnabled(settings.syncEnabled);
    setEnableGoalTransfer(settings.enableGoalTransfer);
    setGoalTransferTime(settings.goalTransferTime);
    setLogLevel(settings.logLevel);
    setFocusModeEnabled(settings.focusModeEnabled);
    setFocusModeImageCategory(settings.focusModeImageCategory);
    setFocusModeShowQuote(settings.focusModeShowQuote);
    setFocusModeAutoEnter(settings.focusModeAutoEnter);
    setShowClock(settings.showClock);
    setPomodoroMusicEnabled(settings.pomodoroMusicEnabled);
    setPomodoroMusicVolume(settings.pomodoroMusicVolume);
    setPomodoroMusicAutoStart(settings.pomodoroMusicAutoStart);
    setPomodoroMusicPlayDuringBreaks(settings.pomodoroMusicPlayDuringBreaks);
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

  // Toggle ambient sound preview
  const togglePreview = () => {
    if (isPreviewPlaying) {
      ambientSoundPlayer.stop();
      setIsPreviewPlaying(false);
    } else {
      if (ambientSound !== 'none') {
        ambientSoundPlayer.play(ambientSound as AmbientSoundType, ambientVolume);
        setIsPreviewPlaying(true);
      }
    }
  };

  // Update preview volume when slider changes
  useEffect(() => {
    if (isPreviewPlaying) {
      ambientSoundPlayer.setVolume(ambientVolume);
    }
  }, [ambientVolume, isPreviewPlaying]);

  // Stop preview when modal closes or sound changes
  useEffect(() => {
    if (!isOpen && isPreviewPlaying) {
      ambientSoundPlayer.stop();
      setIsPreviewPlaying(false);
    }
  }, [isOpen, isPreviewPlaying]);

  // Stop preview when ambient sound changes
  useEffect(() => {
    if (isPreviewPlaying) {
      ambientSoundPlayer.stop();
      setIsPreviewPlaying(false);
    }
  }, [ambientSound]);

  // Handle save
  const handleSave = async () => {
    // Stop preview if playing
    if (isPreviewPlaying) {
      ambientSoundPlayer.stop();
      setIsPreviewPlaying(false);
    }

    // Check if sync setting changed
    const syncChanged = syncEnabled !== settings.syncEnabled;

    await updateSettings({
      pomodoroWorkDuration: workDuration,
      pomodoroBreakDuration: breakDuration,
      pomodoroLongBreakDuration: longBreakDuration,
      pomodoroLongBreakInterval: longBreakInterval,
      pomodoroAmbientSound: ambientSound,
      pomodoroAmbientVolume: ambientVolume,
      pomodoroStartSound: startSound,
      pomodoroCompletionSound: completionSound,
      enableNotifications: notifications,
      quoteChangeInterval: quoteInterval,
      timeFormat,
      syncEnabled,
      enableGoalTransfer,
      goalTransferTime,
      logLevel,
      focusModeEnabled,
      focusModeImageCategory,
      focusModeShowQuote,
      focusModeAutoEnter,
      showClock,
      pomodoroMusicEnabled,
      pomodoroMusicVolume,
      pomodoroMusicAutoStart,
      pomodoroMusicPlayDuringBreaks,
    });

    // If sync setting changed, reload the page to apply storage changes
    if (syncChanged) {
      window.location.reload();
      return;
    }

    // Reload Pomodoro settings if any pomodoro settings changed
    if (
      workDuration !== settings.pomodoroWorkDuration ||
      breakDuration !== settings.pomodoroBreakDuration ||
      longBreakDuration !== settings.pomodoroLongBreakDuration ||
      longBreakInterval !== settings.pomodoroLongBreakInterval ||
      ambientSound !== settings.pomodoroAmbientSound ||
      ambientVolume !== settings.pomodoroAmbientVolume ||
      startSound !== settings.pomodoroStartSound ||
      completionSound !== settings.pomodoroCompletionSound
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
                  className="flex-1"
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
                  className="flex-1"
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
                  className="flex-1"
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
                  className="flex-1"
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
              <div className="flex items-center gap-2">
                <select
                  id="ambient-sound"
                  value={ambientSound}
                  onChange={(e) => setAmbientSound(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {Object.entries(AMBIENT_SOUNDS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                {ambientSound !== 'none' && (
                  <button
                    type="button"
                    onClick={togglePreview}
                    className={`p-2 rounded-md transition-all ${
                      isPreviewPlaying
                        ? 'bg-primary-600 text-white hover:bg-primary-700'
                        : 'bg-surface-variant text-primary hover:bg-border'
                    }`}
                    title={isPreviewPlaying ? 'Stop preview' : 'Test sound'}
                  >
                    {isPreviewPlaying ? (
                      <Square className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5" />
                    )}
                  </button>
                )}
              </div>
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
                    className="flex-1"
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

        {/* Notification Sounds Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-primary">Notification Sounds</h3>
          </div>

          <div className="space-y-4 pl-7">
            {/* Start Sound Selection */}
            <div>
              <label htmlFor="start-sound" className="block text-sm font-medium text-primary mb-2">
                Start Sound
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="start-sound"
                  value={startSound}
                  onChange={(e) => setStartSound(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {Object.entries(NOTIFICATION_SOUNDS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                {startSound !== 'none' && (
                  <button
                    type="button"
                    onClick={() => previewSound(startSound as NotificationSoundType, 'start')}
                    className="p-2 rounded-md bg-surface-variant text-primary hover:bg-border transition-all"
                    title="Test sound"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-secondary mt-1">Played when a Pomodoro session starts</p>
            </div>

            {/* Completion Sound Selection */}
            <div>
              <label
                htmlFor="completion-sound"
                className="block text-sm font-medium text-primary mb-2"
              >
                Completion Sound
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="completion-sound"
                  value={completionSound}
                  onChange={(e) => setCompletionSound(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {Object.entries(NOTIFICATION_SOUNDS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                {completionSound !== 'none' && (
                  <button
                    type="button"
                    onClick={() =>
                      previewSound(completionSound as NotificationSoundType, 'completion')
                    }
                    className="p-2 rounded-md bg-surface-variant text-primary hover:bg-border transition-all"
                    title="Test sound"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-secondary mt-1">
                Played when a session completes (work or break)
              </p>
            </div>
          </div>
        </section>

        {/* Focus Music Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Headphones className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-primary">Focus Music</h3>
          </div>

          <div className="space-y-4 pl-7">
            {/* Enable Focus Music Toggle */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={pomodoroMusicEnabled}
                  onChange={(e) => setPomodoroMusicEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-divider peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </div>
              <div>
                <span className="text-sm font-medium text-primary">Enable focus music</span>
                <p className="text-xs text-secondary">
                  Play YouTube music playlists during Pomodoro sessions
                </p>
              </div>
            </label>

            {pomodoroMusicEnabled && (
              <>
                {/* Auto-Start Toggle */}
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={pomodoroMusicAutoStart}
                      onChange={(e) => setPomodoroMusicAutoStart(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-divider peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-primary">Auto-start with timer</span>
                    <p className="text-xs text-secondary">
                      Automatically play music when you start a Pomodoro session
                    </p>
                  </div>
                </label>

                {/* Play During Breaks Toggle */}
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={pomodoroMusicPlayDuringBreaks}
                      onChange={(e) => setPomodoroMusicPlayDuringBreaks(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-divider peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-primary">Play during breaks</span>
                    <p className="text-xs text-secondary">
                      Continue playing music during break sessions
                    </p>
                  </div>
                </label>

                {/* Volume Control */}
                <div>
                  <label
                    htmlFor="music-volume"
                    className="block text-sm font-medium text-primary mb-2"
                  >
                    Volume:{' '}
                    <span className="text-primary-600 font-semibold">{pomodoroMusicVolume}%</span>
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      id="music-volume"
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={pomodoroMusicVolume}
                      onChange={(e) => setPomodoroMusicVolume(Number(e.target.value))}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      value={pomodoroMusicVolume}
                      onChange={(e) => setPomodoroMusicVolume(Number(e.target.value))}
                      className="w-16 px-2 py-1 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <p className="text-xs text-secondary">
                  Browse and select playlists from the mini player on the Pomodoro page
                </p>
              </>
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

        {/* Chrome Sync Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            {syncEnabled ? (
              <Cloud className="w-5 h-5 text-primary-600" />
            ) : (
              <CloudOff className="w-5 h-5 text-tertiary" />
            )}
            <h3 className="text-lg font-semibold text-primary">Chrome Sync</h3>
          </div>

          <div className="pl-7">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={syncEnabled}
                  onChange={(e) => setSyncEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-divider peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </div>
              <div>
                <span className="text-sm font-medium text-primary">Enable Chrome Sync</span>
                <p className="text-xs text-secondary">
                  Sync your custom quotes, goals, and reminders across all Chrome browsers where
                  you're signed in
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  Note: Built-in quotes stay in local storage. Sync has a 100KB total limit and 8KB
                  per-item limit. Pomodoro sessions may exceed limits over time.
                </p>
              </div>
            </label>
          </div>
        </section>

        {/* Clock & Time Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-primary">Clock & Time</h3>
          </div>

          <div className="space-y-4 pl-7">
            {/* Show Clock Toggle */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={showClock}
                  onChange={(e) => setShowClock(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-divider peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </div>
              <div>
                <span className="text-sm font-medium text-primary">Show clock on home page</span>
                <p className="text-xs text-secondary">
                  Display time, date, and greeting on the main page
                </p>
              </div>
            </label>

            {/* Time Format - only show when clock is enabled */}
            {showClock && (
              <div className="grid grid-cols-2 gap-3">
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
            )}
          </div>
        </section>

        {/* Goal Transfer Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <ArrowRight className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-primary">Goal Transfer</h3>
          </div>

          <div className="space-y-4 pl-7">
            {/* Enable Goal Transfer Toggle */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={enableGoalTransfer}
                  onChange={(e) => setEnableGoalTransfer(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-divider peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </div>
              <div>
                <span className="text-sm font-medium text-primary">Enable goal transfers</span>
                <p className="text-xs text-secondary">
                  Show option to transfer incomplete goals to tomorrow after end-of-day time
                </p>
              </div>
            </label>

            {/* Transfer Time Setting */}
            {enableGoalTransfer && (
              <div>
                <label
                  htmlFor="goal-transfer-time"
                  className="block text-sm font-medium text-primary mb-2"
                >
                  End-of-day time:{' '}
                  <span className="text-primary-600 font-semibold">
                    {timeFormat === '12h'
                      ? `${goalTransferTime % 12 || 12}:00 ${goalTransferTime >= 12 ? 'PM' : 'AM'}`
                      : `${goalTransferTime.toString().padStart(2, '0')}:00`}
                  </span>
                </label>
                <div className="flex items-center gap-4">
                  <input
                    id="goal-transfer-time"
                    type="range"
                    min="0"
                    max="23"
                    step="1"
                    value={goalTransferTime}
                    onChange={(e) => setGoalTransferTime(Number(e.target.value))}
                    className="flex-1"
                  />
                  <select
                    value={goalTransferTime}
                    onChange={(e) => setGoalTransferTime(Number(e.target.value))}
                    className="w-24 px-2 py-1 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {timeFormat === '12h'
                          ? `${i % 12 || 12}:00 ${i >= 12 ? 'PM' : 'AM'}`
                          : `${i.toString().padStart(2, '0')}:00`}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-secondary mt-2">
                  Transfer button will appear on incomplete goals after this time
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Focus Mode Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Maximize2 className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-primary">Focus Mode</h3>
          </div>

          <div className="space-y-4 pl-7">
            {/* Enable Focus Mode Toggle */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={focusModeEnabled}
                  onChange={(e) => setFocusModeEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-divider peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </div>
              <div>
                <span className="text-sm font-medium text-primary">Enable focus mode</span>
                <p className="text-xs text-secondary">
                  Show fullscreen button on Pomodoro timer with scenic backgrounds
                </p>
              </div>
            </label>

            {focusModeEnabled && (
              <>
                {/* Image Category Selection */}
                <div>
                  <label
                    htmlFor="focus-image-category"
                    className="block text-sm font-medium text-primary mb-2"
                  >
                    Background Category
                  </label>
                  <select
                    id="focus-image-category"
                    value={focusModeImageCategory}
                    onChange={(e) =>
                      setFocusModeImageCategory(e.target.value as FocusImageCategory)
                    }
                    className="w-full px-3 py-2 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {Object.entries(FOCUS_IMAGE_CATEGORIES).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-secondary mt-1">High-quality photos from Unsplash</p>
                </div>

                {/* Show Quote Toggle */}
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={focusModeShowQuote}
                      onChange={(e) => setFocusModeShowQuote(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-divider peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-primary">Show quote</span>
                    <p className="text-xs text-secondary">Display current quote in focus mode</p>
                  </div>
                </label>

                {/* Auto-Enter Toggle */}
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={focusModeAutoEnter}
                      onChange={(e) => setFocusModeAutoEnter(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-divider peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-primary">Auto-enter on start</span>
                    <p className="text-xs text-secondary">
                      Automatically enter focus mode when starting a work session
                    </p>
                  </div>
                </label>
              </>
            )}
          </div>
        </section>

        {/* Debug Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Bug className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-primary">Debug</h3>
          </div>

          <div className="pl-7">
            <div>
              <label htmlFor="log-level" className="block text-sm font-medium text-primary mb-2">
                Console Log Level
              </label>
              <select
                id="log-level"
                value={logLevel}
                onChange={(e) => setLogLevel(e.target.value as SettingsLogLevel)}
                className="w-full px-3 py-2 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="none">None - No console logs</option>
                <option value="error">Error - Only errors</option>
                <option value="warn">Warning - Errors and warnings</option>
                <option value="info">Info - Errors, warnings, and info</option>
                <option value="debug">Debug - All logs (verbose)</option>
              </select>
              <p className="text-xs text-secondary mt-2">
                Control what messages appear in the browser console. Higher levels include all lower
                levels.
              </p>
            </div>
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
                    className="flex-1"
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

        {/* Version Info */}
        <div className="text-center text-xs text-tertiary pt-4">
          {__APP_NAME__}{' '}
          <a
            href="https://github.com/kYem/cuewise/blob/main/apps/browser-extension/CHANGELOG.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline"
          >
            v{__APP_VERSION__}
          </a>
        </div>
      </div>
    </Modal>
  );
};
