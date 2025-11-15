import { Target } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';
import { useGoalStore } from '../stores/goal-store';
import { GoalInput } from './GoalInput';
import { GoalsList } from './GoalsList';

export const GoalsSection: React.FC = () => {
  const initialize = useGoalStore((state) => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

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
