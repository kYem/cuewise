import type React from 'react';
import { useEffect, useRef, useState } from 'react';

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
  const selectRef = useRef<HTMLSelectElement>(null);

  // Focus select when editing starts
  useEffect(() => {
    if (isEditing && selectRef.current) {
      selectRef.current.focus();
    }
  }, [isEditing]);

  const handleClick = () => {
    setIsEditing(true);
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const numValue = Number.parseInt(e.target.value, 10);
    onChange(numValue);
    setIsEditing(false);
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`text-purple-600 hover:text-purple-700 font-semibold underline decoration-dotted underline-offset-2 cursor-pointer transition-colors ${className}`}
        title="Click to edit"
      >
        {value} {unit}
      </button>
    );
  }

  // Show select dropdown with presets only
  if (presets) {
    return (
      <select
        ref={selectRef}
        value={value}
        onChange={handleSelectChange}
        onBlur={handleBlur}
        className="inline-block px-2 py-1 text-sm text-purple-600 font-semibold bg-white border-2 border-purple-400 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
      >
        {presets.map((preset) => (
          <option key={preset} value={preset}>
            {preset} {unit}
          </option>
        ))}
      </select>
    );
  }

  // Fallback (should not happen if presets are always provided)
  return (
    <span className={`text-purple-600 font-semibold ${className}`}>
      {value} {unit}
    </span>
  );
};
