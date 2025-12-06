import type { PomodoroHeatmapData } from '@cuewise/shared';
import type { ChartConfig } from '@cuewise/ui';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@cuewise/ui';
import { Clock } from 'lucide-react';
import type React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';

interface PomodoroHeatmapProps {
  data: PomodoroHeatmapData;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const chartConfig: ChartConfig = {
  count: {
    label: 'Pomodoros',
    color: 'var(--chart-1)',
  },
};

// Color intensity levels for heatmap (using CSS custom properties)
const INTENSITY_COLORS = {
  none: 'var(--color-surface-variant)',
  low: 'var(--color-primary-200)',
  medium: 'var(--color-primary-300)',
  high: 'var(--color-primary-400)',
  peak: 'var(--color-primary-600)',
} as const;

export const PomodoroHeatmap: React.FC<PomodoroHeatmapProps> = ({ data }) => {
  // Find max values for scaling
  const maxHourly = Math.max(...Object.values(data.hourlyDistribution), 1);
  const maxWeekday = Math.max(...Object.values(data.weekdayDistribution), 1);

  // Get color intensity based on value
  const getColorIntensity = (value: number, max: number): string => {
    if (value === 0) {
      return INTENSITY_COLORS.none;
    }
    const intensity = (value / max) * 100;
    if (intensity < 25) {
      return INTENSITY_COLORS.low;
    }
    if (intensity < 50) {
      return INTENSITY_COLORS.medium;
    }
    if (intensity < 75) {
      return INTENSITY_COLORS.high;
    }
    return INTENSITY_COLORS.peak;
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
            <BarChart
              data={hourlyData}
              margin={{ top: 20, right: 10, left: 0, bottom: 20 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} className="stroke-border" />
              <XAxis
                dataKey="hour"
                tickFormatter={formatHour}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={2}
                className="text-xs fill-secondary"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs fill-secondary"
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelKey="hourLabel"
                    hideIndicator
                    hideName
                    formatter={(value, _name, props) => {
                      const isProductive = props.payload?.isProductive;
                      const count = Number(value);
                      return `${count} pomodoro${count !== 1 ? 's' : ''}${isProductive ? ' ⭐' : ''}`;
                    }}
                  />
                }
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {hourlyData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getColorIntensity(entry.count, maxHourly)}
                    stroke={entry.isProductive ? 'var(--color-warning)' : 'none'}
                    strokeWidth={entry.isProductive ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
          <div className="mt-4 flex items-center justify-between text-xs text-secondary">
            <span>Low activity</span>
            <div className="flex gap-1 items-center">
              <div
                className="w-4 h-4 rounded border border-border"
                style={{ backgroundColor: INTENSITY_COLORS.none }}
              />
              <div className="w-4 h-4 rounded" style={{ backgroundColor: INTENSITY_COLORS.low }} />
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: INTENSITY_COLORS.medium }}
              />
              <div className="w-4 h-4 rounded" style={{ backgroundColor: INTENSITY_COLORS.high }} />
              <div className="w-4 h-4 rounded" style={{ backgroundColor: INTENSITY_COLORS.peak }} />
              <span className="ml-2">⭐ Peak hours</span>
            </div>
            <span>High activity</span>
          </div>
        </div>

        {/* Weekday Distribution */}
        <div>
          <h3 className="text-lg font-semibold text-primary mb-4">By Day of Week</h3>
          <ChartContainer config={chartConfig} className="h-80 min-h-[20rem] w-full">
            <BarChart
              data={weekdayData}
              margin={{ top: 20, right: 10, left: 0, bottom: 20 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} className="stroke-border" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs fill-secondary"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs fill-secondary"
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelKey="day"
                    hideIndicator
                    hideName
                    formatter={(value) => {
                      const count = Number(value);
                      return `${count} pomodoro${count !== 1 ? 's' : ''}`;
                    }}
                  />
                }
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {weekdayData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getColorIntensity(entry.count, maxWeekday)} />
                ))}
              </Bar>
            </BarChart>
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
