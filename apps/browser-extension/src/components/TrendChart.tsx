import { formatFocusTime } from '@cuewise/shared';
import type { ChartConfig } from '@cuewise/ui';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@cuewise/ui';
import { TrendingUp } from 'lucide-react';
import type React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';

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

const chartConfigs: Record<string, ChartConfig> = {
  goals: {
    goalsCompleted: {
      label: 'Goals Completed',
      color: '#8B5CF6',
    },
  },
  focus: {
    focusTime: {
      label: 'Focus Time',
      color: '#3B82F6',
    },
  },
  pomodoros: {
    pomodorosCompleted: {
      label: 'Pomodoros',
      color: '#EF4444',
    },
  },
};

export const TrendChart: React.FC<TrendChartProps> = ({ title, data, metric }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-surface rounded-xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-primary mb-6 flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-primary-600" />
          {title}
        </h2>
        <p className="text-secondary text-center py-8">No data available</p>
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
      default:
        return 0;
    }
  });

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

  // Get the data key based on metric
  const dataKey =
    metric === 'goals' ? 'goalsCompleted' : metric === 'focus' ? 'focusTime' : 'pomodorosCompleted';

  // Get the chart config for this metric
  const chartConfig = chartConfigs[metric];

  // Custom tooltip formatter
  const tooltipFormatter = (value: string | number | (string | number)[]) => {
    const numValue = typeof value === 'number' ? value : Number(value);
    return formatValue(numValue);
  };

  return (
    <div className="bg-surface rounded-xl shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-primary flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-primary-600" />
          {title}
        </h2>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <div className="text-secondary">Average</div>
            <div className="font-bold text-primary">{formatValue(Math.round(average))}</div>
          </div>
          <div className="text-center">
            <div className="text-secondary">Total</div>
            <div className="font-bold text-primary">{formatValue(total)}</div>
          </div>
          <div className="text-center">
            <div className="text-secondary">Trend</div>
            <div className={`font-bold ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend >= 0 ? '+' : ''}
              {formatValue(trend)}
            </div>
          </div>
        </div>
      </div>

      <ChartContainer config={chartConfig} className="h-64 min-h-[16rem] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
            <XAxis
              dataKey="label"
              angle={-45}
              textAnchor="end"
              height={100}
              className="text-xs"
              tick={{ fill: '#6B7280' }}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: '#6B7280' }}
              tickFormatter={(value) => (metric === 'focus' ? `${Math.round(value / 60)}m` : value)}
            />
            <ChartTooltip content={<ChartTooltipContent formatter={tooltipFormatter} />} />
            <Bar
              dataKey={dataKey}
              fill={chartConfig[dataKey].color}
              radius={[8, 8, 0, 0]}
              className="transition-all hover:opacity-80"
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};
