import { CheckCircle2, Target, Timer } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { WidgetPicker } from './widgets/WidgetPicker';

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
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
    }
  }, [isOpen]);

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
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Cuewise"
        className="relative flex flex-col bg-surface-elevated rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden animate-slide-up"
      >
        {/* Header with gradient accent */}
        <div className="flex-shrink-0 px-6 pt-6 pb-4 text-center">
          <div className="flex justify-center mb-3">
            <img
              src="/icons/icon.svg"
              alt="Cuewise logo"
              className="w-14 h-14 rounded-2xl shadow-sm"
            />
          </div>
          <h2 className="text-2xl font-bold text-primary">Welcome to Cuewise!</h2>
          <p className="mt-2 text-secondary">Your personal productivity companion</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          {step === 1 ? (
            <>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tertiary">
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
            </>
          ) : (
            <>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tertiary">
                Add to your home screen
              </h3>
              <WidgetPicker showPresets />
            </>
          )}
        </div>

        <div className="flex flex-shrink-0 gap-2 px-6 pb-6 pt-2">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-3 font-medium text-secondary transition-colors hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 rounded-lg bg-primary-600 px-4 py-3 font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Next
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-primary-600 px-4 py-3 font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
