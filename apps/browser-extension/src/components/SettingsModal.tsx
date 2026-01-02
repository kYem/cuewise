import { RotateCcw } from 'lucide-react';
import type React from 'react';
import { useSettingsForm } from '../hooks/useSettingsForm';
import { usePomodoroStore } from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { useSoundsStore } from '../stores/sounds-store';
import { Modal } from './Modal';
import {
  ChromeSyncSettings,
  ClockTimeSettings,
  DebugSettings,
  FocusModeSettings,
  FocusMusicSettings,
  GoalTransferSettings,
  NotificationSoundsSettings,
  NotificationsSettings,
  PomodoroSettings,
  QuoteIntervalSettings,
} from './settings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, resetToDefaults } = useSettingsStore();
  const reloadPomodoroSettings = usePomodoroStore((state) => state.reloadSettings);
  const openSoundsPanel = useSoundsStore((state) => state.openPanel);

  // Use the settings form hook for state management
  const { form, setField, handleSave } = useSettingsForm({
    settings,
    updateSettings,
    reloadPomodoroSettings,
    onSaveComplete: onClose,
  });

  // Handle reset to defaults
  const handleReset = async () => {
    if (window.confirm('Reset all settings to default values?')) {
      await resetToDefaults();
      await reloadPomodoroSettings();
    }
  };

  // Handle opening sounds panel
  const handleOpenSoundsPanel = () => {
    openSoundsPanel();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="space-y-8">
        {/* Pomodoro Timer Settings */}
        <PomodoroSettings form={form} setField={setField} />

        {/* Notification Sounds Settings */}
        <NotificationSoundsSettings form={form} setField={setField} />

        {/* Focus Music Settings */}
        <FocusMusicSettings
          form={form}
          setField={setField}
          onOpenSoundsPanel={handleOpenSoundsPanel}
        />

        {/* Notifications Settings */}
        <NotificationsSettings form={form} setField={setField} />

        {/* Chrome Sync Settings */}
        <ChromeSyncSettings form={form} setField={setField} />

        {/* Clock & Time Settings */}
        <ClockTimeSettings form={form} setField={setField} />

        {/* Goal Transfer Settings */}
        <GoalTransferSettings form={form} setField={setField} />

        {/* Focus Mode Settings */}
        <FocusModeSettings form={form} setField={setField} />

        {/* Debug Settings */}
        <DebugSettings form={form} setField={setField} />

        {/* Quote Change Interval Settings */}
        <QuoteIntervalSettings form={form} setField={setField} />

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
