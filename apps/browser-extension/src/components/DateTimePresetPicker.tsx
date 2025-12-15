import { createScheduledDate, type SuggestedTime } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import * as chrono from 'chrono-node';
import { Calendar, ChevronDown, ChevronUp, Clock, Sparkles } from 'lucide-react';
import type React from 'react';
import { useMemo, useRef, useState } from 'react';

interface DateTimePresetPickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  minDate?: Date;
  label?: string;
  required?: boolean;
  /** Optional suggested time based on user's completion patterns */
  suggestion?: SuggestedTime | null;
}

interface Preset {
  label: string;
  getDate: () => Date;
}

// Helper to round to nearest 5 minutes
const roundToNearestMinutes = (date: Date, minutes: number): Date => {
  const ms = 1000 * 60 * minutes;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
};

// Helper to set specific time on a date
const setTime = (date: Date, hours: number, minutes: number): Date => {
  const newDate = new Date(date);
  newDate.setHours(hours, minutes, 0, 0);
  return newDate;
};

// Get next occurrence of a weekday (0 = Sunday, 1 = Monday, etc.)
const getNextWeekday = (weekday: number, hours: number, minutes: number): Date => {
  const now = new Date();
  const date = new Date(now);
  const currentDay = date.getDay();
  const daysUntil = (weekday - currentDay + 7) % 7 || 7; // If today is that day, get next week
  date.setDate(date.getDate() + daysUntil);
  return setTime(date, hours, minutes);
};

// Generate presets based on current time
const generatePresets = (): Preset[] => {
  const now = new Date();

  return [
    {
      label: 'In 1 hour',
      getDate: () => roundToNearestMinutes(new Date(now.getTime() + 60 * 60 * 1000), 5),
    },
    {
      label: 'In 3 hours',
      getDate: () => roundToNearestMinutes(new Date(now.getTime() + 3 * 60 * 60 * 1000), 5),
    },
    {
      label: 'Tomorrow 9am',
      getDate: () => {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return setTime(tomorrow, 9, 0);
      },
    },
    {
      label: 'Tomorrow 6pm',
      getDate: () => {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return setTime(tomorrow, 18, 0);
      },
    },
    {
      label: 'Next Monday 9am',
      getDate: () => getNextWeekday(1, 9, 0),
    },
    {
      label: 'Next Saturday 10am',
      getDate: () => getNextWeekday(6, 10, 0),
    },
  ];
};

// Format date for display
const formatDateTime = (date: Date): string => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) {
    return `Today at ${timeStr}`;
  }
  if (isTomorrow) {
    return `Tomorrow at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${dateStr} at ${timeStr}`;
};

// Format date for native inputs
const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const formatTimeForInput = (date: Date): string => {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

export const DateTimePresetPicker: React.FC<DateTimePresetPickerProps> = ({
  value,
  onChange,
  minDate,
  label = 'When',
  required = false,
  suggestion,
}) => {
  const [naturalInput, setNaturalInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');

  // Stable reference for minDate - default to now if not provided
  const minDateRef = useRef(minDate ?? new Date());
  const effectiveMinDate = minDate ?? minDateRef.current;

  const presets = generatePresets();

  const handleSuggestionClick = () => {
    if (suggestion) {
      const date = createScheduledDate(suggestion.hour, suggestion.minute);
      onChange(date);
      setNaturalInput('');
      setShowCustom(false);
    }
  };

  // Parse natural language input - memoized to avoid re-renders
  const parsedPreview = useMemo(() => {
    if (!naturalInput.trim()) {
      return null;
    }
    const parsed = chrono.parseDate(naturalInput, new Date(), { forwardDate: true });
    if (parsed && parsed > effectiveMinDate) {
      return parsed;
    }
    return null;
  }, [naturalInput, effectiveMinDate]);

  // Sync custom inputs when value changes - use controlled approach
  const syncedCustomDate = value ? formatDateForInput(value) : customDate;
  const syncedCustomTime = value ? formatTimeForInput(value) : customTime;

  // Update local state only when switching to custom mode
  const handleShowCustom = () => {
    if (value) {
      setCustomDate(formatDateForInput(value));
      setCustomTime(formatTimeForInput(value));
    }
    setShowCustom(true);
  };

  const handlePresetClick = (preset: Preset) => {
    const date = preset.getDate();
    onChange(date);
    setNaturalInput('');
    setShowCustom(false);
  };

  const handleNaturalInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && parsedPreview) {
      e.preventDefault();
      onChange(parsedPreview);
      setNaturalInput('');
    }
  };

  const handleApplyParsed = () => {
    if (parsedPreview) {
      onChange(parsedPreview);
      setNaturalInput('');
    }
  };

  const handleCustomDateChange = (newDate: string) => {
    setCustomDate(newDate);
    const timeToUse = customTime || syncedCustomTime;
    if (newDate && timeToUse) {
      const combined = new Date(`${newDate}T${timeToUse}`);
      if (combined > effectiveMinDate) {
        onChange(combined);
      }
    }
  };

  const handleCustomTimeChange = (newTime: string) => {
    setCustomTime(newTime);
    const dateToUse = customDate || syncedCustomDate;
    if (dateToUse && newTime) {
      const combined = new Date(`${dateToUse}T${newTime}`);
      if (combined > effectiveMinDate) {
        onChange(combined);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Label */}
      <span className="block text-sm font-medium text-primary">
        {label} {required && <span className="text-red-500">*</span>}
      </span>

      {/* Selected Value Display */}
      {value && (
        <div className="flex items-center gap-2 px-4 py-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border-2 border-primary-200 dark:border-primary-800">
          <Clock className="w-5 h-5 text-primary-600" />
          <span className="font-medium text-primary">{formatDateTime(value)}</span>
        </div>
      )}

      {/* Suggested Time (Context-Aware) */}
      {suggestion && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-secondary">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>
              Suggested based on your completion patterns
              {suggestion.confidence === 'high' && ' (strong pattern)'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSuggestionClick}
            className={cn(
              'w-full px-4 py-3 text-sm font-medium rounded-lg transition-all',
              'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30',
              'text-amber-800 dark:text-amber-300',
              'border-2 border-amber-200 dark:border-amber-800 hover:border-amber-300 dark:hover:border-amber-700',
              'flex items-center justify-center gap-2'
            )}
          >
            <Clock className="w-4 h-4" />
            <span>Use suggested time: {suggestion.formatted}</span>
          </button>
        </div>
      )}

      {/* Quick Presets */}
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => handlePresetClick(preset)}
            className={cn(
              'px-3 py-2 text-sm font-medium rounded-lg transition-all',
              'bg-surface-variant hover:bg-primary-100 dark:hover:bg-primary-900/30',
              'text-secondary hover:text-primary',
              'border border-border hover:border-primary-300'
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Natural Language Input */}
      <div className="space-y-2">
        <div className="relative">
          <input
            type="text"
            value={naturalInput}
            onChange={(e) => setNaturalInput(e.target.value)}
            onKeyDown={handleNaturalInputKeyDown}
            placeholder='Or type: "friday 2pm", "in 30 minutes", "dec 25 noon"'
            className="w-full px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary placeholder:text-tertiary text-sm"
          />
        </div>

        {/* Parsed Preview */}
        {parsedPreview && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <Calendar className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-700 dark:text-green-400 flex-1">
              {formatDateTime(parsedPreview)}
            </span>
            <button
              type="button"
              onClick={handleApplyParsed}
              className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              Apply
            </button>
          </div>
        )}

        {/* Invalid input feedback */}
        {naturalInput.trim() && !parsedPreview && (
          <p className="text-xs text-tertiary">
            Try: "tomorrow 3pm", "next friday", "in 2 hours", "jan 15 10am"
          </p>
        )}
      </div>

      {/* Custom Date/Time Picker (Collapsible) */}
      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={showCustom ? () => setShowCustom(false) : handleShowCustom}
          className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors"
        >
          {showCustom ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span>Pick exact date & time</span>
        </button>

        {showCustom && (
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label
                htmlFor="custom-date"
                className="block text-xs font-medium text-secondary mb-1"
              >
                Date
              </label>
              <input
                id="custom-date"
                type="date"
                value={customDate || syncedCustomDate}
                onChange={(e) => handleCustomDateChange(e.target.value)}
                min={formatDateForInput(effectiveMinDate)}
                className="w-full px-3 py-2 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="custom-time"
                className="block text-xs font-medium text-secondary mb-1"
              >
                Time
              </label>
              <input
                id="custom-time"
                type="time"
                value={customTime || syncedCustomTime}
                onChange={(e) => handleCustomTimeChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary text-sm"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
