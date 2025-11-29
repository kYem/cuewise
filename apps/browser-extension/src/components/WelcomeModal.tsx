import { CheckCircle2, Sparkles, Target, Timer } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface QuickStartItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const QuickStartItem: React.FC<QuickStartItemProps> = ({ icon, title, description }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
    <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-primary-500/20">
      {icon}
    </div>
    <div>
      <h4 className="font-semibold text-primary">{title}</h4>
      <p className="text-sm text-secondary">{description}</p>
    </div>
  </div>
);

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop - semi-transparent so users can see the app behind */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
        onClick={onClose}
        aria-label="Close welcome modal"
        tabIndex={-1}
      />

      {/* Modal Content */}
      <div className="relative bg-surface-elevated rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-slide-up">
        {/* Header with gradient accent */}
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 flex items-center justify-center rounded-full bg-primary-500/20">
              <Sparkles className="w-7 h-7 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-primary">Welcome to Cuewise!</h2>
          <p className="mt-2 text-secondary">Your personal productivity companion</p>
        </div>

        {/* Quick Start Tips */}
        <div className="px-6 pb-4">
          <h3 className="text-sm font-semibold text-tertiary uppercase tracking-wide mb-3">
            Quick Start
          </h3>
          <div className="space-y-2">
            <QuickStartItem
              icon={<Target className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
              title="Add a goal"
              description="Type in the goals section and press Enter"
            />
            <QuickStartItem
              icon={<CheckCircle2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
              title="Browse quotes"
              description="Click the arrows or refresh for new inspiration"
            />
            <QuickStartItem
              icon={<Timer className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
              title="Start a Pomodoro"
              description="Click Pomodoro in the top-right to focus"
            />
          </div>
        </div>

        {/* Footer with CTA */}
        <div className="px-6 pb-6 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
};
