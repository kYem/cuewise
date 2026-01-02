import { FOCUS_IMAGE_CATEGORIES, type FocusImageCategory } from '@cuewise/shared';
import { Maximize2 } from 'lucide-react';
import type React from 'react';
import type { SettingsFormState } from '../../hooks/useSettingsForm';
import { SettingsSection } from './SettingsSection';
import { SettingsSelect } from './SettingsSelect';
import { SettingsToggle } from './SettingsToggle';

interface FocusModeSettingsProps {
  form: SettingsFormState;
  setField: <K extends keyof SettingsFormState>(field: K, value: SettingsFormState[K]) => void;
}

/**
 * Focus Mode settings section.
 * Handles fullscreen focus mode with scenic backgrounds.
 */
export const FocusModeSettings: React.FC<FocusModeSettingsProps> = ({ form, setField }) => {
  return (
    <SettingsSection icon={Maximize2} title="Focus Mode">
      <SettingsToggle
        label="Enable focus mode"
        description="Show fullscreen button on Pomodoro timer with scenic backgrounds"
        checked={form.focusModeEnabled}
        onChange={(checked) => setField('focusModeEnabled', checked)}
      />

      {form.focusModeEnabled && (
        <>
          <SettingsSelect
            id="focus-image-category"
            label="Background Category"
            value={form.focusModeImageCategory}
            options={FOCUS_IMAGE_CATEGORIES}
            onChange={(value) => setField('focusModeImageCategory', value as FocusImageCategory)}
            description="High-quality photos from Unsplash"
          />

          <SettingsToggle
            label="Show quote"
            description="Display current quote in focus mode"
            checked={form.focusModeShowQuote}
            onChange={(checked) => setField('focusModeShowQuote', checked)}
          />

          <SettingsToggle
            label="Auto-enter on start"
            description="Automatically enter focus mode when starting a work session"
            checked={form.focusModeAutoEnter}
            onChange={(checked) => setField('focusModeAutoEnter', checked)}
          />
        </>
      )}
    </SettingsSection>
  );
};
