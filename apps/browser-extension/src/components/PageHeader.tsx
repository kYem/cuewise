import { cn } from '@cuewise/ui';
import { ArrowLeft, BarChart3, BookText, Clock } from 'lucide-react';
import type React from 'react';

type Page = 'quotes' | 'insights' | 'pomodoro';

interface PageHeaderProps {
  currentPage: Page;
  title: string;
  subtitle?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ currentPage, title, subtitle }) => {
  const handleBackToHome = () => {
    window.location.hash = '';
  };

  const handleNavigateTo = (page: Page) => {
    window.location.hash = page;
  };

  const navItems: Array<{ page: Page; label: string; icon: React.ReactNode }> = [
    { page: 'quotes', label: 'Quotes', icon: <BookText className="w-4 h-4" /> },
    { page: 'insights', label: 'Insights', icon: <BarChart3 className="w-4 h-4" /> },
    { page: 'pomodoro', label: 'Pomodoro', icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <header className="bg-surface/95 backdrop-blur-sm border-b border-border sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          {/* Left: Back Button + Title */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleBackToHome}
              className="flex items-center gap-2 text-secondary hover:text-primary transition-colors group"
              title="Back to home"
            >
              <div className="p-2 hover:bg-surface-variant rounded-full transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </div>
              <span className="hidden sm:inline text-sm font-medium">Back to Home</span>
            </button>

            <div className="h-6 w-px bg-divider hidden sm:block" aria-hidden="true" />

            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-primary">{title}</h1>
              {subtitle && <p className="text-xs sm:text-sm text-secondary">{subtitle}</p>}
            </div>
          </div>

          {/* Right: Quick Navigation Tabs */}
          <nav
            aria-label="Page navigation"
            className="flex items-center gap-1 bg-surface-variant rounded-lg p-1"
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
