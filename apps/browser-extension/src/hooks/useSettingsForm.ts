import type {
  FocusImageCategory,
  FocusPosition,
  NotificationSoundType,
  QuoteDisplayMode,
  Settings,
  SettingsLogLevel,
  TimeFormat,
} from '@cuewise/shared';
import { useEffect, useState } from 'react';

/**
 * Form state for settings modal.
 * Contains all editable settings as a single object.
 */
export interface SettingsFormState {
  // Pomodoro timer settings
  pomodoroWorkDuration: number;
  pomodoroBreakDuration: number;
  pomodoroLongBreakDuration: number;
  pomodoroLongBreakInterval: number;
  pomodoroStartSound: string;
  pomodoroCompletionSound: string;

  // Focus music settings
  pomodoroMusicEnabled: boolean;
  pomodoroMusicAutoStart: boolean;
  pomodoroMusicPlayDuringBreaks: boolean;

  // Notification settings
  enableNotifications: boolean;

  // Chrome sync
  syncEnabled: boolean;

  // Clock & time
  showClock: boolean;
  timeFormat: TimeFormat;

  // Goal transfer
  enableGoalTransfer: boolean;
  goalTransferTime: number;

  // Focus mode
  focusModeEnabled: boolean;
  focusModeImageCategory: FocusImageCategory;
  focusModeShowQuote: boolean;
  focusModeAutoEnter: boolean;

  // Quote settings
  quoteDisplayMode: QuoteDisplayMode;
  quoteChangeInterval: number;
  enableQuoteAnimation: boolean;

  // Focus position
  focusPosition: FocusPosition;

  // Debug
  logLevel: SettingsLogLevel;
}

/**
 * Extract form state from settings object.
 */
function settingsToFormState(settings: Settings): SettingsFormState {
  return {
    pomodoroWorkDuration: settings.pomodoroWorkDuration,
    pomodoroBreakDuration: settings.pomodoroBreakDuration,
    pomodoroLongBreakDuration: settings.pomodoroLongBreakDuration,
    pomodoroLongBreakInterval: settings.pomodoroLongBreakInterval,
    pomodoroStartSound: settings.pomodoroStartSound,
    pomodoroCompletionSound: settings.pomodoroCompletionSound,
    pomodoroMusicEnabled: settings.pomodoroMusicEnabled,
    pomodoroMusicAutoStart: settings.pomodoroMusicAutoStart,
    pomodoroMusicPlayDuringBreaks: settings.pomodoroMusicPlayDuringBreaks,
    enableNotifications: settings.enableNotifications,
    syncEnabled: settings.syncEnabled,
    showClock: settings.showClock,
    timeFormat: settings.timeFormat,
    enableGoalTransfer: settings.enableGoalTransfer,
    goalTransferTime: settings.goalTransferTime,
    focusModeEnabled: settings.focusModeEnabled,
    focusModeImageCategory: settings.focusModeImageCategory,
    focusModeShowQuote: settings.focusModeShowQuote,
    focusModeAutoEnter: settings.focusModeAutoEnter,
    quoteDisplayMode: settings.quoteDisplayMode,
    quoteChangeInterval: settings.quoteChangeInterval,
    enableQuoteAnimation: settings.enableQuoteAnimation,
    focusPosition: settings.focusPosition,
    logLevel: settings.logLevel,
  };
}

interface UseSettingsFormOptions {
  /** Current settings from the store */
  settings: Settings;
  /** Function to update settings in the store */
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  /** Function to reload pomodoro settings after changes */
  reloadPomodoroSettings: () => Promise<void>;
  /** Callback when save completes (e.g., close modal) */
  onSaveComplete: () => void;
}

interface UseSettingsFormReturn {
  /** Current form state */
  form: SettingsFormState;

  /** Update a single field */
  setField: <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => void;

  /** Update multiple fields at once */
  setFields: (updates: Partial<SettingsFormState>) => void;

  /** Save changes to the store */
  handleSave: () => Promise<void>;

  /** Check if a specific pomodoro setting changed */
  hasPomodoroChanges: () => boolean;

  /** Check if sync setting changed */
  hasSyncChanges: () => boolean;
}

/**
 * Hook to manage settings form state.
 * Replaces multiple useState calls with a single form object.
 */
export function useSettingsForm({
  settings,
  updateSettings,
  reloadPomodoroSettings,
  onSaveComplete,
}: UseSettingsFormOptions): UseSettingsFormReturn {
  const [form, setForm] = useState<SettingsFormState>(() => settingsToFormState(settings));

  // Sync form state when settings change externally
  useEffect(() => {
    setForm(settingsToFormState(settings));
  }, [settings]);

  const setField = <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const setFields = (updates: Partial<SettingsFormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const hasPomodoroChanges = () => {
    return (
      form.pomodoroWorkDuration !== settings.pomodoroWorkDuration ||
      form.pomodoroBreakDuration !== settings.pomodoroBreakDuration ||
      form.pomodoroLongBreakDuration !== settings.pomodoroLongBreakDuration ||
      form.pomodoroLongBreakInterval !== settings.pomodoroLongBreakInterval ||
      form.pomodoroStartSound !== settings.pomodoroStartSound ||
      form.pomodoroCompletionSound !== settings.pomodoroCompletionSound
    );
  };

  const hasSyncChanges = () => {
    return form.syncEnabled !== settings.syncEnabled;
  };

  const handleSave = async () => {
    const syncChanged = hasSyncChanges();

    await updateSettings({
      pomodoroWorkDuration: form.pomodoroWorkDuration,
      pomodoroBreakDuration: form.pomodoroBreakDuration,
      pomodoroLongBreakDuration: form.pomodoroLongBreakDuration,
      pomodoroLongBreakInterval: form.pomodoroLongBreakInterval,
      pomodoroStartSound: form.pomodoroStartSound as NotificationSoundType,
      pomodoroCompletionSound: form.pomodoroCompletionSound as NotificationSoundType,
      pomodoroMusicEnabled: form.pomodoroMusicEnabled,
      pomodoroMusicAutoStart: form.pomodoroMusicAutoStart,
      pomodoroMusicPlayDuringBreaks: form.pomodoroMusicPlayDuringBreaks,
      enableNotifications: form.enableNotifications,
      syncEnabled: form.syncEnabled,
      showClock: form.showClock,
      timeFormat: form.timeFormat,
      enableGoalTransfer: form.enableGoalTransfer,
      goalTransferTime: form.goalTransferTime,
      focusModeEnabled: form.focusModeEnabled,
      focusModeImageCategory: form.focusModeImageCategory,
      focusModeShowQuote: form.focusModeShowQuote,
      focusModeAutoEnter: form.focusModeAutoEnter,
      quoteDisplayMode: form.quoteDisplayMode,
      quoteChangeInterval: form.quoteChangeInterval,
      enableQuoteAnimation: form.enableQuoteAnimation,
      focusPosition: form.focusPosition,
      logLevel: form.logLevel,
    });

    // If sync setting changed, reload the page to apply storage changes
    if (syncChanged) {
      window.location.reload();
      return;
    }

    // Reload Pomodoro settings if any pomodoro settings changed
    if (hasPomodoroChanges()) {
      await reloadPomodoroSettings();
    }

    onSaveComplete();
  };

  return {
    form,
    setField,
    setFields,
    handleSave,
    hasPomodoroChanges,
    hasSyncChanges,
  };
}
