import type { GoalCompletionRate } from '@cuewise/shared';
import { Target } from 'lucide-react';
import type React from 'react';

interface GoalCompletionChartProps {
  data: GoalCompletionRate;
}

export const GoalCompletionChart: React.FC<GoalCompletionChartProps> = ({ data }) => {
  // Calculate circle positions for donut chart
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const completionOffset = circumference - (data.completionRate / 100) * circumference;
  const weekOffset = circumference - (data.thisWeek.completionRate / 100) * circumference;
  const monthOffset = circumference - (data.thisMonth.completionRate / 100) * circumference;

  return (
    <div className="bg-white rounded-xl shadow-lg p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
        <Target className="w-6 h-6 text-green-600" />
        Goal Completion Rate
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Overall Completion */}
        <div className="flex flex-col items-center">
          <div className="relative w-48 h-48">
            <svg className="transform -rotate-90 w-48 h-48" aria-label="Overall completion rate">
              {/* Background circle */}
              <circle cx="96" cy="96" r={radius} stroke="#E5E7EB" strokeWidth="16" fill="none" />
              {/* Progress circle */}
              <circle
                cx="96"
                cy="96"
                r={radius}
                stroke="#10B981"
                strokeWidth="16"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={completionOffset}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl font-bold text-gray-800">
                {data.completionRate.toFixed(0)}%
              </div>
              <div className="text-sm text-gray-500">Overall</div>
            </div>
          </div>
          <div className="mt-4 text-center">
            <div className="text-sm text-gray-600">
              {data.completedGoals} of {data.totalGoals} goals
            </div>
          </div>
        </div>

        {/* This Week */}
        <div className="flex flex-col items-center">
          <div className="relative w-48 h-48">
            <svg className="transform -rotate-90 w-48 h-48" aria-label="This week completion rate">
              {/* Background circle */}
              <circle cx="96" cy="96" r={radius} stroke="#E5E7EB" strokeWidth="16" fill="none" />
              {/* Progress circle */}
              <circle
                cx="96"
                cy="96"
                r={radius}
                stroke="#3B82F6"
                strokeWidth="16"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={weekOffset}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl font-bold text-gray-800">
                {data.thisWeek.completionRate.toFixed(0)}%
              </div>
              <div className="text-sm text-gray-500">This Week</div>
            </div>
          </div>
          <div className="mt-4 text-center">
            <div className="text-sm text-gray-600">
              {data.thisWeek.completedGoals} of {data.thisWeek.totalGoals} goals
            </div>
          </div>
        </div>

        {/* This Month */}
        <div className="flex flex-col items-center">
          <div className="relative w-48 h-48">
            <svg className="transform -rotate-90 w-48 h-48" aria-label="This month completion rate">
              {/* Background circle */}
              <circle cx="96" cy="96" r={radius} stroke="#E5E7EB" strokeWidth="16" fill="none" />
              {/* Progress circle */}
              <circle
                cx="96"
                cy="96"
                r={radius}
                stroke="#8B5CF6"
                strokeWidth="16"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={monthOffset}
                strokeLinecap="round"
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl font-bold text-gray-800">
                {data.thisMonth.completionRate.toFixed(0)}%
              </div>
              <div className="text-sm text-gray-500">This Month</div>
            </div>
          </div>
          <div className="mt-4 text-center">
            <div className="text-sm text-gray-600">
              {data.thisMonth.completedGoals} of {data.thisMonth.totalGoals} goals
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="mt-8 grid grid-cols-3 gap-4 pt-6 border-t border-gray-200">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{data.totalGoals}</div>
          <div className="text-sm text-gray-600">Total Goals</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{data.completedGoals}</div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-600">
            {data.totalGoals - data.completedGoals}
          </div>
          <div className="text-sm text-gray-600">Remaining</div>
        </div>
      </div>
    </div>
  );
};
