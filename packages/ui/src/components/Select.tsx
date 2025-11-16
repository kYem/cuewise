import { ChevronDown } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

export interface SelectOption<T = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  badge?: string;
  disabled?: boolean;
}

export interface SelectProps<T = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  className,
  disabled = false,
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setHighlightedIndex((prev) => {
            const nextIndex = prev + 1;
            return nextIndex >= options.length ? 0 : nextIndex;
          });
          break;
        case 'ArrowUp':
          event.preventDefault();
          setHighlightedIndex((prev) => {
            const prevIndex = prev - 1;
            return prevIndex < 0 ? options.length - 1 : prevIndex;
          });
          break;
        case 'Enter':
          event.preventDefault();
          if (options[highlightedIndex] && !options[highlightedIndex].disabled) {
            onChange(options[highlightedIndex].value);
            setIsOpen(false);
          }
          break;
        case 'Escape':
          event.preventDefault();
          setIsOpen(false);
          break;
        case 'Home':
          event.preventDefault();
          setHighlightedIndex(0);
          break;
        case 'End':
          event.preventDefault();
          setHighlightedIndex(options.length - 1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, highlightedIndex, options, onChange]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Reset highlighted index when opening
  useEffect(() => {
    if (isOpen) {
      const selectedIndex = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [isOpen, value, options]);

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  const handleSelect = (option: SelectOption<T>) => {
    if (!option.disabled) {
      onChange(option.value);
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className={cn(
          'flex items-center justify-between gap-2 px-4 py-2 rounded-lg',
          'border-2 border-gray-200 dark:border-gray-600',
          'bg-white dark:bg-gray-700',
          'text-gray-700 dark:text-gray-200',
          'font-medium',
          'transition-all duration-200',
          'hover:border-gray-300 dark:hover:border-gray-500',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent',
          isOpen && 'border-primary-500 dark:border-primary-400 ring-2 ring-primary-500/20',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedOption?.icon && (
            <div className="flex-shrink-0">{selectedOption.icon}</div>
          )}
          {selectedOption?.color && (
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: selectedOption.color }}
            />
          )}
          <span className={cn('truncate', !selectedOption && 'text-gray-400 dark:text-gray-500')}>
            {selectedOption?.label || placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="ml-auto px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 flex-shrink-0">
              {selectedOption.badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform duration-200 flex-shrink-0',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          role="listbox"
          className={cn(
            'absolute z-50 w-full mt-2 py-2',
            'bg-white dark:bg-gray-700',
            'border-2 border-gray-200 dark:border-gray-600',
            'rounded-lg shadow-lg',
            'max-h-64 overflow-y-auto',
            'animate-in fade-in-0 zoom-in-95 duration-200'
          )}
        >
          {options.map((option, index) => (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => handleSelect(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
              disabled={option.disabled}
              className={cn(
                'w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors',
                'text-gray-900 dark:text-gray-100',
                'focus:outline-none',
                option.value === value &&
                  'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium',
                highlightedIndex === index &&
                  option.value !== value &&
                  'bg-gray-100 dark:bg-gray-600',
                option.disabled
                  ? 'opacity-50 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600'
              )}
            >
              {option.icon && <div className="flex-shrink-0">{option.icon}</div>}
              {option.color && (
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: option.color }}
                />
              )}
              <span className="flex-1 truncate">{option.label}</span>
              {option.badge && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 flex-shrink-0">
                  {option.badge}
                </span>
              )}
              {option.value === value && (
                <svg
                  className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
