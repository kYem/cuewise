import { Target } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';
import { useGoalStore } from '../stores/goal-store';
import { ErrorFallback } from './ErrorFallback';
import { GoalInput } from './GoalInput';
import { GoalsList } from './GoalsList';

export const GoalsSection: React.FC = () => {
  const { initialize, isLoading, error } = useGoalStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-gray-200">
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-gray-200">
          <ErrorFallback error={error} title="Failed to load goals" onRetry={initialize} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-gray-200 min-h-[400px] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Target className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-gray-800">Today's Focus</h2>
            <p className="text-sm text-gray-500">What matters most today?</p>
          </div>
        </div>

        {/* Goal Input */}
        <div className="mb-6">
          <GoalInput />
        </div>

        {/* Goals List */}
        <div className="flex-1">
          <GoalsList />
        </div>
      </div>
    </div>
  );
};
