import { ArrowLeft } from 'lucide-react';
import type React from 'react';
import { PomodoroTimer } from './PomodoroTimer';

export const PomodoroPage: React.FC = () => {
  const handleBackToHome = () => {
    window.location.hash = '';
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100">
      <div className="w-full max-w-2xl mx-auto">
        {/* Back Button */}
        <button
          type="button"
          onClick={handleBackToHome}
          className="mb-8 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Home</span>
        </button>

        {/* Pomodoro Timer - Centered */}
        <div className="flex justify-center">
          <PomodoroTimer />
        </div>
      </div>
    </div>
  );
};
