import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface EditableValueProps {
  value: number;
  unit: string;
  presets?: number[];
  min: number;
  max: number;
  onChange: (value: number) => void;
  className?: string;
}

export const EditableValue: React.FC<EditableValueProps> = ({
  value,
  unit,
  presets,
  min,
  max,
  onChange,
  className = '',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  // Update input value when prop value changes
  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing) {
      if (presets && selectRef.current) {
        selectRef.current.focus();
      } else if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  }, [isEditing, presets]);

  const handleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    saveValue();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveValue();
    } else if (e.key === 'Escape') {
      setInputValue(value.toString());
      setIsEditing(false);
    }
  };

  const saveValue = () => {
    const numValue = Number.parseInt(inputValue, 10);

    // Validate
    if (!Number.isNaN(numValue) && numValue >= min && numValue <= max) {
      onChange(numValue);
    } else {
      // Reset to original value if invalid
      setInputValue(value.toString());
    }

    setIsEditing(false);
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const numValue = Number.parseInt(e.target.value, 10);
    if (e.target.value === 'custom') {
      // Switch to input mode
      setIsEditing(true);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 0);
    } else {
      onChange(numValue);
      setIsEditing(false);
    }
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`text-purple-600 hover:text-purple-700 font-semibold underline decoration-dotted underline-offset-2 cursor-pointer transition-colors ${className}`}
        title={`Click to edit (${min}-${max} ${unit})`}
      >
        {value} {unit}
      </button>
    );
  }

  // Show select dropdown if presets are provided
  if (presets) {
    const hasCurrentValue = presets.includes(value);

    return (
      <select
        ref={selectRef}
        value={hasCurrentValue ? value : 'custom'}
        onChange={handleSelectChange}
        onBlur={handleBlur}
        className="inline-block px-2 py-1 text-sm text-purple-600 font-semibold bg-white border-2 border-purple-400 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
      >
        {presets.map((preset) => (
          <option key={preset} value={preset}>
            {preset} {unit}
          </option>
        ))}
        <option value="custom">Custom...</option>
      </select>
    );
  }

  // Show input field for custom values
  return (
    <input
      ref={inputRef}
      type="number"
      min={min}
      max={max}
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="inline-block w-20 px-2 py-1 text-sm text-purple-600 font-semibold bg-white border-2 border-purple-400 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
    />
  );
};
