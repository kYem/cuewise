import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

export interface AutocompleteProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  suggestions: string[];
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  /** Placeholder when no suggestions match */
  noResultsText?: string;
}

const Autocomplete = React.forwardRef<HTMLInputElement, AutocompleteProps>(
  (
    {
      className,
      suggestions,
      value,
      onChange,
      error,
      noResultsText = 'No matches found',
      onFocus,
      onBlur,
      onKeyDown,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Filter suggestions based on input value
    const filteredSuggestions = suggestions.filter((suggestion) =>
      suggestion.toLowerCase().includes(value.toLowerCase())
    );

    // Show dropdown when there are suggestions and input is focused
    const showDropdown = isOpen && value.length > 0 && filteredSuggestions.length > 0;

    // Handle click outside to close dropdown
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Reset highlighted index when suggestions change
    useEffect(() => {
      setHighlightedIndex(-1);
    }, [filteredSuggestions.length]);

    // Scroll highlighted item into view
    useEffect(() => {
      if (highlightedIndex >= 0 && listRef.current) {
        const highlightedItem = listRef.current.children[highlightedIndex] as HTMLElement;
        if (highlightedItem) {
          highlightedItem.scrollIntoView({ block: 'nearest' });
        }
      }
    }, [highlightedIndex]);

    const handleSelect = (suggestion: string) => {
      onChange(suggestion);
      setIsOpen(false);
      setHighlightedIndex(-1);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
      setIsOpen(true);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsOpen(true);
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // Delay closing to allow click on suggestion
      setTimeout(() => setIsOpen(false), 150);
      onBlur?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showDropdown) {
        onKeyDown?.(e);
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev < filteredSuggestions.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredSuggestions.length - 1));
          break;
        case 'Enter':
          if (highlightedIndex >= 0 && filteredSuggestions[highlightedIndex]) {
            e.preventDefault();
            handleSelect(filteredSuggestions[highlightedIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
        default:
          break;
      }

      onKeyDown?.(e);
    };

    return (
      <div ref={containerRef} className="relative">
        <input
          type="text"
          ref={ref}
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls="autocomplete-list"
          className={cn(
            'flex w-full rounded-lg border-2 bg-surface px-4 py-3',
            'text-primary placeholder:text-secondary',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-0',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error
              ? 'border-red-500 focus:border-red-600'
              : 'border-border focus:border-primary-500',
            className
          )}
          {...props}
        />

        {showDropdown && (
          <div
            ref={listRef}
            id="autocomplete-list"
            role="listbox"
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border-2 border-border bg-surface shadow-lg"
          >
            {filteredSuggestions.map((suggestion, index) => (
              <div
                key={suggestion}
                role="option"
                tabIndex={-1}
                aria-selected={highlightedIndex === index}
                onClick={() => handleSelect(suggestion)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleSelect(suggestion);
                  }
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  'cursor-pointer px-4 py-2 text-primary transition-colors',
                  highlightedIndex === index && 'bg-primary-100 dark:bg-primary-900/30'
                )}
              >
                {suggestion}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

Autocomplete.displayName = 'Autocomplete';

export { Autocomplete };
