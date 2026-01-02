import type React from 'react';

interface SettingsSliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
  description?: string;
}

/**
 * A reusable slider with number input component for settings.
 * Provides consistent styling for numeric range settings.
 */
export const SettingsSlider: React.FC<SettingsSliderProps> = ({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  formatValue,
  onChange,
  description,
}) => {
  const displayValue = formatValue ? formatValue(value) : `${value}${unit ? ` ${unit}` : ''}`;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-primary mb-2">
        {label}: <span className="text-primary-600 font-semibold">{displayValue}</span>
      </label>
      <div className="flex items-center gap-4">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
        />
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 px-2 py-1 text-sm text-primary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      {description && <p className="text-xs text-secondary mt-2">{description}</p>}
    </div>
  );
};
