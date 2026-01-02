import type React from 'react';

interface SettingsSelectOption {
  value: string;
  label: string;
}

interface SettingsSelectProps {
  id: string;
  label: string;
  value: string;
  options: SettingsSelectOption[] | Record<string, string>;
  onChange: (value: string) => void;
  description?: string;
}

/**
 * A reusable select dropdown component for settings.
 * Accepts either an array of options or a Record object.
 */
export const SettingsSelect: React.FC<SettingsSelectProps> = ({
  id,
  label,
  value,
  options,
  onChange,
  description,
}) => {
  // Normalize options to array format
  const optionsArray: SettingsSelectOption[] = Array.isArray(options)
    ? options
    : Object.entries(options).map(([key, label]) => ({ value: key, label }));

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-primary mb-2">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {optionsArray.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {description && <p className="text-xs text-secondary mt-1">{description}</p>}
    </div>
  );
};
