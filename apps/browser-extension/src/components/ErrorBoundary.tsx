import { logger } from '@cuewise/shared';
import { Button } from '@cuewise/ui';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught an error', error, {
      componentStack: errorInfo.componentStack,
    });
    this.props.onError?.(error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="rounded-full bg-red-500/10 p-4 mb-4">
            <AlertCircle className="h-12 w-12 text-red-600" />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-2">Something went wrong</h2>
          <p className="text-secondary mb-6 max-w-md">
            We encountered an unexpected error. Please try refreshing the page or contact support if
            the problem persists.
          </p>
          {this.state.error && (
            <details className="mb-6 text-left max-w-md w-full">
              <summary className="cursor-pointer text-sm text-secondary hover:text-primary mb-2">
                Error details
              </summary>
              <pre className="text-xs bg-surface-variant p-4 rounded-lg overflow-auto max-h-40 border border-border">
                {this.state.error.toString()}
                {this.state.error.stack && `\n\n${this.state.error.stack}`}
              </pre>
            </details>
          )}
          <div className="flex gap-3">
            <Button onClick={this.handleReset} variant="primary">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={() => window.location.reload()} variant="outline">
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
