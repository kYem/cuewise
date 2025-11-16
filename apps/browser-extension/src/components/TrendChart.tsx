import { formatFocusTime } from '@cuewise/shared';
import { TrendingUp } from 'lucide-react';
import type React from 'react';

interface DataPoint {
  label: string;
  goalsCompleted: number;
  focusTime: number;
  pomodorosCompleted: number;
}

interface TrendChartProps {
  title: string;
  data: DataPoint[];
  metric: 'goals' | 'focus' | 'pomodoros';
}

export const TrendChart: React.FC<TrendChartProps> = ({ title, data, metric }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-purple-600" />
          {title}
        </h2>
        <p className="text-gray-500 text-center py-8">No data available</p>
      </div>
    );
  }

  // Get the metric values
  const values = data.map((d) => {
    switch (metric) {
      case 'goals':
        return d.goalsCompleted;
      case 'focus':
        return d.focusTime;
      case 'pomodoros':
        return d.pomodorosCompleted;
    }
  });

  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values);

  // Calculate statistics
  const total = values.reduce((sum, v) => sum + v, 0);
  const average = total / values.length;
  const trend = values.length > 1 ? values[values.length - 1] - values[0] : 0;

  // Format value for display
  const formatValue = (value: number): string => {
    if (metric === 'focus') {
      return formatFocusTime(value);
    }
    return value.toString();
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-purple-600" />
          {title}
        </h2>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <div className="text-gray-500">Average</div>
            <div className="font-bold text-gray-800">{formatValue(Math.round(average))}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Total</div>
            <div className="font-bold text-gray-800">{formatValue(total)}</div>
          </div>
          <div className="text-center">
            <div className="text-gray-500">Trend</div>
            <div
              className={`font-bold ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
              {trend >= 0 ? '+' : ''}
              {formatValue(trend)}
            </div>
          </div>
        </div>
      </div>

      {/* Simple line chart */}
      <div className="relative h-64 flex items-end gap-1 border-b border-l border-gray-200 pb-1 pl-1">
        {data.map((point, index) => {
          const value = values[index];
          const heightPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;

          return (
            <div key={index} className="flex-1 flex flex-col items-center group relative">
              {/* Bar */}
              <div className="w-full flex items-end justify-center">
                <div
                  className="w-full bg-gradient-to-t from-purple-600 to-purple-400 rounded-t-md transition-all hover:opacity-80 relative"
                  style={{ height: `${heightPercent}%` }}
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                      <div className="font-semibold">{point.label}</div>
                      <div className="text-gray-300">Value: {formatValue(value)}</div>
                      {metric === 'goals' && (
                        <>
                          <div className="text-gray-300">
                            Pomodoros: {point.pomodorosCompleted}
                          </div>
                          <div className="text-gray-300">
                            Focus: {formatFocusTime(point.focusTime)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Label */}
              <div className="text-xs text-gray-600 mt-2 transform -rotate-45 origin-top-left whitespace-nowrap">
                {point.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Y-axis labels */}
      <div className="absolute left-0 top-16 bottom-12 flex flex-col justify-between text-xs text-gray-500 pr-2">
        <div>{formatValue(maxValue)}</div>
        <div>{formatValue(Math.round(maxValue / 2))}</div>
        <div>{formatValue(minValue)}</div>
      </div>
    </div>
  );
};
