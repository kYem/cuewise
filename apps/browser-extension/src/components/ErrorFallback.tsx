import { Button } from '@cuewise/ui';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type React from 'react';

interface ErrorFallbackProps {
  error?: string | null;
  title?: string;
  message?: string;
  onRetry?: () => void;
  showRetry?: boolean;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  title = 'Unable to load data',
  message = 'Something went wrong while loading this section. Please try again.',
  onRetry,
  showRetry = true,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[200px]">
      <div className="rounded-full bg-red-100 p-3 mb-4">
        <AlertCircle className="h-8 w-8 text-red-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-4 max-w-md">{error || message}</p>
      {showRetry && onRetry && (
        <Button onClick={onRetry} variant="primary" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      )}
    </div>
  );
};
