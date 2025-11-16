import type { PomodoroHeatmapData } from '@cuewise/shared';
import { Clock } from 'lucide-react';
import type React from 'react';

interface PomodoroHeatmapProps {
  data: PomodoroHeatmapData;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const PomodoroHeatmap: React.FC<PomodoroHeatmapProps> = ({ data }) => {
  // Find max values for scaling
  const maxHourly = Math.max(...Object.values(data.hourlyDistribution), 1);
  const maxWeekday = Math.max(...Object.values(data.weekdayDistribution), 1);

  // Get color intensity based on value
  const getColorIntensity = (value: number, max: number): string => {
    if (value === 0) return 'bg-gray-100';
    const intensity = (value / max) * 100;
    if (intensity < 25) return 'bg-purple-200';
    if (intensity < 50) return 'bg-purple-400';
    if (intensity < 75) return 'bg-purple-600';
    return 'bg-purple-800';
  };

  // Format hour for display (12h format)
  const formatHour = (hour: number): string => {
    if (hour === 0) return '12am';
    if (hour < 12) return `${hour}am`;
    if (hour === 12) return '12pm';
    return `${hour - 12}pm`;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
        <Clock className="w-6 h-6 text-purple-600" />
        Pomodoro Heatmap
      </h2>

      {/* Productive Hours Summary */}
      {data.productiveHours.length > 0 && (
        <div className="mb-6 p-4 bg-purple-50 rounded-lg">
          <p className="text-sm text-gray-700">
            <span className="font-bold">Most productive hours:</span>{' '}
            {data.productiveHours.map((hour) => formatHour(hour)).join(', ')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Hourly Distribution */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-4">By Hour of Day</h3>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 24 }, (_, hour) => {
              const count = data.hourlyDistribution[hour] || 0;
              const color = getColorIntensity(count, maxHourly);
              const isProductive = data.productiveHours.includes(hour);

              return (
                <div key={hour} className="group relative">
                  <div
                    className={`${color} rounded-md h-12 flex items-center justify-center text-xs font-medium transition-all hover:scale-110 cursor-pointer ${
                      isProductive ? 'ring-2 ring-yellow-400' : ''
                    }`}
                    title={`${formatHour(hour)}: ${count} pomodoros`}
                  >
                    <span className="text-gray-700">{hour}</span>
                  </div>
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                      <div className="font-semibold">{formatHour(hour)}</div>
                      <div className="text-gray-300">{count} pomodoros</div>
                      {isProductive && (
                        <div className="text-yellow-300 text-xs mt-1">Most productive!</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
            <span>Low activity</span>
            <div className="flex gap-1">
              <div className="w-4 h-4 bg-gray-100 rounded" />
              <div className="w-4 h-4 bg-purple-200 rounded" />
              <div className="w-4 h-4 bg-purple-400 rounded" />
              <div className="w-4 h-4 bg-purple-600 rounded" />
              <div className="w-4 h-4 bg-purple-800 rounded" />
            </div>
            <span>High activity</span>
          </div>
        </div>

        {/* Weekday Distribution */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-4">By Day of Week</h3>
          <div className="space-y-3">
            {Array.from({ length: 7 }, (_, day) => {
              const count = data.weekdayDistribution[day] || 0;
              const widthPercent = maxWeekday > 0 ? (count / maxWeekday) * 100 : 0;

              return (
                <div key={day} className="flex items-center gap-3">
                  <div className="w-12 text-sm font-medium text-gray-700">
                    {WEEKDAY_LABELS[day]}
                  </div>
                  <div className="flex-1 h-10 bg-gray-100 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-lg transition-all duration-500"
                      style={{ width: `${widthPercent}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-end pr-3">
                      <span className="text-sm font-semibold text-gray-700">{count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Total Sessions Summary */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600">
              {Object.values(data.hourlyDistribution).reduce((sum, count) => sum + count, 0)}
            </div>
            <div className="text-sm text-gray-600">Total Pomodoros</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">
              {Object.keys(data.dailyDistribution).length}
            </div>
            <div className="text-sm text-gray-600">Active Days</div>
          </div>
        </div>
      </div>
    </div>
  );
};
