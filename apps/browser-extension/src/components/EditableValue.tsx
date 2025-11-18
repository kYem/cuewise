import { Select } from '@cuewise/ui';
import type React from 'react';
import { useState } from 'react';

interface EditableValueProps {
  value: number;
  unit: string;
  presets?: number[];
  onChange: (value: number) => void;
  className?: string;
}

export const EditableValue: React.FC<EditableValueProps> = ({
  value,
  unit,
  presets,
  onChange,
  className = '',
}) => {
  const [isEditing, setIsEditing] = useState(false);

  const handleClick = () => {
    setIsEditing(true);
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`text-primary-600 hover:text-primary-700 font-semibold underline decoration-dotted underline-offset-2 cursor-pointer transition-colors ${className}`}
        title="Click to edit"
      >
        {value} {unit}
      </button>
    );
  }

  // Show select dropdown with presets only
  if (presets) {
    return (
      <span className="inline-block min-w-[120px] align-middle">
        <Select
          value={value.toString()}
          onChange={(val) => {
            onChange(Number.parseInt(val, 10));
            setIsEditing(false);
          }}
          options={presets.map((preset) => ({
            value: preset.toString(),
            label: `${preset} ${unit}`,
          }))}
          className="text-xs [&>button]:py-1 [&>button]:px-2 [&>button]:min-h-0 [&>button]:h-auto"
        />
      </span>
    );
  }

  // Fallback (should not happen if presets are always provided)
  return (
    <span className={`text-primary-600 font-semibold ${className}`}>
      {value} {unit}
    </span>
  );
};
