import * as React from 'react';
import { cn } from '../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  showCount?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, showCount, maxLength, value, ...props }, ref) => {
    const currentLength = typeof value === 'string' ? value.length : 0;

    return (
      <div className="w-full">
        <textarea
          className={cn(
            'flex w-full rounded-lg border-2 bg-surface px-4 py-3',
            'text-primary placeholder:text-secondary',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-0',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'resize-none',
            error
              ? 'border-red-500 focus:border-red-600'
              : 'border-border focus:border-primary-500',
            className
          )}
          ref={ref}
          maxLength={maxLength}
          value={value}
          {...props}
        />
        {showCount && maxLength && (
          <p className="mt-1 text-xs text-secondary">
            {currentLength}/{maxLength} characters
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };
