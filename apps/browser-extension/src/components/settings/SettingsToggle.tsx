import type React from 'react';

interface SettingsToggleProps {
  id?: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * A reusable toggle switch component for settings.
 * Provides consistent styling for boolean settings.
 */
export const SettingsToggle: React.FC<SettingsToggleProps> = ({
  id,
  label,
  description,
  checked,
  onChange,
}) => {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div className="relative">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-divider peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-surface after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600" />
      </div>
      <div>
        <span className="text-sm font-medium text-primary">{label}</span>
        {description && <p className="text-xs text-secondary">{description}</p>}
      </div>
    </label>
  );
};
