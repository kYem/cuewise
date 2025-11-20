import type { PomodoroHeatmapData } from '@cuewise/shared';
import type { ChartConfig } from '@cuewise/ui';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@cuewise/ui';
import { Clock } from 'lucide-react';
import type React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts';

interface PomodoroHeatmapProps {
  data: PomodoroHeatmapData;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const chartConfig: ChartConfig = {
  count: {
    label: 'Pomodoros',
    color: '#8B5CF6',
  },
};

export const PomodoroHeatmap: React.FC<PomodoroHeatmapProps> = ({ data }) => {
  // Find max values for scaling
  const maxHourly = Math.max(...Object.values(data.hourlyDistribution), 1);
  const maxWeekday = Math.max(...Object.values(data.weekdayDistribution), 1);

  // Get color intensity based on value
  const getColorIntensity = (value: number, max: number): string => {
    if (value === 0) return '#F3F4F6'; // gray-100
    const intensity = (value / max) * 100;
    if (intensity < 25) return '#DDD6FE'; // purple-200
    if (intensity < 50) return '#C4B5FD'; // purple-300
    if (intensity < 75) return '#A78BFA'; // purple-400
    return '#8B5CF6'; // purple-600
  };

  // Format hour for display (12h format)
  const formatHour = (hour: number): string => {
    if (hour === 0) return '12am';
    if (hour < 12) return `${hour}am`;
    if (hour === 12) return '12pm';
    return `${hour - 12}pm`;
  };

  // Prepare hourly data for chart
  const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    hourLabel: formatHour(hour),
    count: data.hourlyDistribution[hour] || 0,
    isProductive: data.productiveHours.includes(hour),
  }));

  // Prepare weekday data for chart
  const weekdayData = Array.from({ length: 7 }, (_, day) => ({
    day: WEEKDAY_LABELS[day],
    count: data.weekdayDistribution[day] || 0,
  }));

  return (
    <div className="bg-surface rounded-xl shadow-lg p-8">
      <h2 className="text-2xl font-bold text-primary mb-6 flex items-center gap-3">
        <Clock className="w-6 h-6 text-primary-600" />
        Pomodoro Heatmap
      </h2>

      {/* Productive Hours Summary */}
      {data.productiveHours.length > 0 && (
        <div className="mb-6 p-4 bg-primary-600/10 border border-border rounded-lg">
          <p className="text-sm text-primary">
            <span className="font-bold">Most productive hours:</span>{' '}
            {data.productiveHours.map((hour) => formatHour(hour)).join(', ')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Hourly Distribution */}
        <div>
          <h3 className="text-lg font-semibold text-primary mb-4">By Hour of Day</h3>
          <ChartContainer config={chartConfig} className="h-80 min-h-[20rem] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 20, right: 10, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                <XAxis
                  dataKey="hour"
                  tickFormatter={formatHour}
                  className="text-xs"
                  tick={{ fill: '#6B7280' }}
                  interval={2}
                />
                <YAxis className="text-xs" tick={{ fill: '#6B7280' }} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => formatHour(Number(value))}
                      formatter={(value, _name, props) => {
                        const isProductive = props.payload?.isProductive;
                        return [
                          `${value} pomodoros${isProductive ? ' ⭐' : ''}`,
                          isProductive ? 'Peak productivity!' : 'Pomodoros',
                        ];
                      }}
                    />
                  }
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {hourlyData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getColorIntensity(entry.count, maxHourly)}
                      stroke={entry.isProductive ? '#FBBF24' : 'none'}
                      strokeWidth={entry.isProductive ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
          <div className="mt-4 flex items-center justify-between text-xs text-secondary">
            <span>Low activity</span>
            <div className="flex gap-1 items-center">
              <div className="w-4 h-4 bg-surface-variant border border-border rounded" />
              <div className="w-4 h-4 bg-primary-600/20 rounded" />
              <div className="w-4 h-4 bg-primary-600/40 rounded" />
              <div className="w-4 h-4 bg-primary-600/60 rounded" />
              <div className="w-4 h-4 bg-primary-600 rounded" />
              <span className="ml-2">⭐ Peak hours</span>
            </div>
            <span>High activity</span>
          </div>
        </div>

        {/* Weekday Distribution */}
        <div>
          <h3 className="text-lg font-semibold text-primary mb-4">By Day of Week</h3>
          <ChartContainer config={chartConfig} className="h-80 min-h-[20rem] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weekdayData}
                margin={{ top: 20, right: 10, left: -10, bottom: 20 }}
                layout="horizontal"
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                <XAxis type="number" className="text-xs" tick={{ fill: '#6B7280' }} />
                <YAxis
                  dataKey="day"
                  type="category"
                  className="text-xs"
                  tick={{ fill: '#6B7280' }}
                  width={50}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent formatter={(value) => [`${value} pomodoros`, 'Count']} />
                  }
                />
                <Bar dataKey="count" fill="#8B5CF6" radius={[0, 8, 8, 0]}>
                  {weekdayData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getColorIntensity(entry.count, maxWeekday)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      </div>

      {/* Total Sessions Summary */}
      <div className="mt-8 pt-6 border-t border-border">
        <div className="flex items-center justify-center gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-600">
              {Object.values(data.hourlyDistribution).reduce((sum, count) => sum + count, 0)}
            </div>
            <div className="text-sm text-secondary">Total Pomodoros</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-600">
              {Object.keys(data.dailyDistribution).length}
            </div>
            <div className="text-sm text-secondary">Active Days</div>
          </div>
        </div>
      </div>
    </div>
  );
};
