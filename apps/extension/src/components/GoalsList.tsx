import React from 'react';
import { CheckCircle2, Circle, Trash2 } from 'lucide-react';
import { useGoalStore } from '../stores/goal-store';
import { cn } from '@productivity-extension/ui';

export const GoalsList: React.FC = () => {
  const { todayGoals, toggleGoal, deleteGoal, isLoading } = useGoalStore();

  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500">
        Loading goals...
      </div>
    );
  }

  if (todayGoals.length === 0) {
    return (
      <div className="text-center py-12">
        <Circle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
        <p className="text-lg text-gray-500 mb-2">No goals for today</p>
        <p className="text-sm text-gray-400">Add your first goal to get started!</p>
      </div>
    );
  }

  const completedCount = todayGoals.filter((g) => g.completed).length;
  const totalCount = todayGoals.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      {totalCount > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Progress</span>
            <span className="font-medium">
              {completedCount} of {totalCount} completed
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-600 transition-all duration-500 ease-out rounded-full"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Goals List */}
      <div className="space-y-2">
        {todayGoals.map((goal) => (
          <div
            key={goal.id}
            className={cn(
              'group flex items-center gap-3 p-3 rounded-lg border-2 transition-all',
              goal.completed
                ? 'bg-gray-50 border-gray-200'
                : 'bg-white border-gray-200 hover:border-primary-300'
            )}
          >
            {/* Checkbox */}
            <button
              onClick={() => toggleGoal(goal.id)}
              className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-full"
              aria-label={goal.completed ? 'Mark as incomplete' : 'Mark as complete'}
            >
              {goal.completed ? (
                <CheckCircle2 className="w-6 h-6 text-primary-600" />
              ) : (
                <Circle className="w-6 h-6 text-gray-400 group-hover:text-primary-500 transition-colors" />
              )}
            </button>

            {/* Goal Text */}
            <span
              className={cn(
                'flex-1 text-base transition-all',
                goal.completed
                  ? 'text-gray-400 line-through'
                  : 'text-gray-800'
              )}
            >
              {goal.text}
            </span>

            {/* Delete Button */}
            <button
              onClick={() => deleteGoal(goal.id)}
              className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded"
              aria-label="Delete goal"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Clear Completed Button */}
      {completedCount > 0 && (
        <button
          onClick={() => useGoalStore.getState().clearCompleted()}
          className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Clear {completedCount} completed {completedCount === 1 ? 'goal' : 'goals'}
        </button>
      )}
    </div>
  );
};
