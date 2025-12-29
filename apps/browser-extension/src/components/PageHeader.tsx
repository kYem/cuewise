import { cn } from '@cuewise/ui';
import { ArrowLeft, BarChart3, BookText, Clock, Flag } from 'lucide-react';
import type React from 'react';

type Page = 'quotes' | 'insights' | 'pomodoro' | 'goals';

interface PageHeaderProps {
  currentPage: Page;
  title: string;
  subtitle?: string;
  transparent?: boolean;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  currentPage,
  title,
  subtitle,
  transparent = false,
}) => {
  const handleBackToHome = () => {
    window.location.hash = '';
  };

  const handleNavigateTo = (page: Page) => {
    window.location.hash = page;
  };

  const navItems: Array<{ page: Page; label: string; icon: React.ReactNode }> = [
    { page: 'goals', label: 'Goals', icon: <Flag className="w-4 h-4" /> },
    { page: 'quotes', label: 'Quotes', icon: <BookText className="w-4 h-4" /> },
    { page: 'insights', label: 'Insights', icon: <BarChart3 className="w-4 h-4" /> },
    { page: 'pomodoro', label: 'Pomodoro', icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-colors',
        transparent
          ? 'bg-transparent'
          : 'bg-surface/95 backdrop-blur-sm border-b border-border shadow-sm'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          {/* Left: Back Button + Title */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleBackToHome}
              className={cn(
                'flex items-center gap-2 transition-colors group',
                transparent ? 'text-white/80 hover:text-white' : 'text-secondary hover:text-primary'
              )}
              title="Back to home"
            >
              <div
                className={cn(
                  'p-2 rounded-full transition-colors',
                  transparent ? 'hover:bg-white/20' : 'hover:bg-surface-variant'
                )}
              >
                <ArrowLeft className="w-5 h-5" />
              </div>
              <span className="hidden sm:inline text-sm font-medium">Back to Home</span>
            </button>

            <div
              className={cn('h-6 w-px hidden sm:block', transparent ? 'bg-white/30' : 'bg-divider')}
              aria-hidden="true"
            />

            <div>
              <h1
                className={cn(
                  'text-xl sm:text-2xl font-bold',
                  transparent ? 'text-white' : 'text-primary'
                )}
              >
                {title}
              </h1>
              {subtitle && (
                <p
                  className={cn(
                    'text-xs sm:text-sm',
                    transparent ? 'text-white/70' : 'text-secondary'
                  )}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Right: Quick Navigation Tabs */}
          <nav
            aria-label="Page navigation"
            className={cn(
              'flex items-center gap-1 rounded-lg p-1',
              transparent ? 'bg-white/10 backdrop-blur-sm' : 'bg-surface-variant'
            )}
          >
            {navItems.map((item) => (
              <button
                key={item.page}
                type="button"
                onClick={() => handleNavigateTo(item.page)}
                aria-current={currentPage === item.page ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                  currentPage === item.page
                    ? 'bg-primary-600 text-white shadow-sm'
                    : transparent
                      ? 'text-white/80 hover:text-white hover:bg-white/20'
                      : 'text-secondary hover:text-primary hover:bg-surface'
                )}
                title={`Go to ${item.label}`}
              >
                {item.icon}
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
};
