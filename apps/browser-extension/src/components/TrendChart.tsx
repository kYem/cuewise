import { formatFocusTime } from '@cuewise/shared';
import type { ChartConfig } from '@cuewise/ui';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@cuewise/ui';
import { format, parseISO } from 'date-fns';
import { TrendingUp } from 'lucide-react';
import type React from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

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
      color: 'var(--chart-1)',
    },
  },
  focus: {
    focusTime: {
      label: 'Focus Time',
      color: 'var(--chart-2)',
    },
  },
  pomodoros: {
    pomodorosCompleted: {
      label: 'Pomodoros',
      color: 'var(--chart-3)',
    },
  },
};

// Format date to abbreviated form for chart labels (e.g., "Nov 9")
const formatChartDate = (dateStr: string): string => {
  try {
    return format(parseISO(dateStr), 'MMM d');
  } catch {
    return dateStr;
  }
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
        <BarChart
          data={data}
          margin={{ top: 20, right: 20, left: 10, bottom: 20 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} className="stroke-border" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={formatChartDate}
            className="text-xs fill-secondary"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) =>
              metric === 'focus' ? `${Math.round(value / 60)}m` : String(value)
            }
            className="text-xs fill-secondary"
          />
          <ChartTooltip content={<ChartTooltipContent formatter={tooltipFormatter} />} />
          <Bar dataKey={dataKey} fill={`var(--color-${dataKey})`} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
};
