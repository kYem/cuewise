import type { ChartConfig } from '@cuewise/ui';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@cuewise/ui';
import type { GoalCompletionRate } from '@cuewise/shared';
import { Target } from 'lucide-react';
import type React from 'react';
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';

interface GoalCompletionChartProps {
  data: GoalCompletionRate;
}

const chartConfig: ChartConfig = {
  overall: {
    label: 'Overall',
    color: '#10B981',
  },
  thisWeek: {
    label: 'This Week',
    color: '#3B82F6',
  },
  thisMonth: {
    label: 'This Month',
    color: '#8B5CF6',
  },
};

export const GoalCompletionChart: React.FC<GoalCompletionChartProps> = ({ data }) => {
  // Prepare data for radial charts
  const overallData = [
    {
      name: 'Overall',
      value: data.completionRate,
      fill: chartConfig.overall.color,
    },
  ];

  const weekData = [
    {
      name: 'This Week',
      value: data.thisWeek.completionRate,
      fill: chartConfig.thisWeek.color,
    },
  ];

  const monthData = [
    {
      name: 'This Month',
      value: data.thisMonth.completionRate,
      fill: chartConfig.thisMonth.color,
    },
  ];

  return (
    <div className="bg-surface rounded-xl shadow-lg p-8">
      <h2 className="text-2xl font-bold text-primary mb-6 flex items-center gap-3">
        <Target className="w-6 h-6 text-green-600" />
        Goal Completion Rate
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Overall Completion */}
        <div className="flex flex-col items-center">
          <ChartContainer config={chartConfig} className="h-48 min-h-[12rem] w-48">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={overallData}
                startAngle={90}
                endAngle={-270}
                innerRadius="70%"
                outerRadius="100%"
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar
                  background={{ fill: '#E5E7EB' }}
                  dataKey="value"
                  cornerRadius={10}
                  fill={chartConfig.overall.color}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${Number(value).toFixed(0)}%`}
                      hideLabel
                    />
                  }
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </ChartContainer>
          <div className="mt-4 text-center">
            <div className="text-4xl font-bold text-primary">
              {data.completionRate.toFixed(0)}%
            </div>
            <div className="text-sm text-secondary mt-1">Overall</div>
            <div className="text-sm text-secondary mt-2">
              {data.completedGoals} of {data.totalGoals} goals
            </div>
          </div>
        </div>

        {/* This Week */}
        <div className="flex flex-col items-center">
          <ChartContainer config={chartConfig} className="h-48 min-h-[12rem] w-48">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={weekData}
                startAngle={90}
                endAngle={-270}
                innerRadius="70%"
                outerRadius="100%"
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar
                  background={{ fill: '#E5E7EB' }}
                  dataKey="value"
                  cornerRadius={10}
                  fill={chartConfig.thisWeek.color}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${Number(value).toFixed(0)}%`}
                      hideLabel
                    />
                  }
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </ChartContainer>
          <div className="mt-4 text-center">
            <div className="text-4xl font-bold text-primary">
              {data.thisWeek.completionRate.toFixed(0)}%
            </div>
            <div className="text-sm text-secondary mt-1">This Week</div>
            <div className="text-sm text-secondary mt-2">
              {data.thisWeek.completedGoals} of {data.thisWeek.totalGoals} goals
            </div>
          </div>
        </div>

        {/* This Month */}
        <div className="flex flex-col items-center">
          <ChartContainer config={chartConfig} className="h-48 min-h-[12rem] w-48">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={monthData}
                startAngle={90}
                endAngle={-270}
                innerRadius="70%"
                outerRadius="100%"
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar
                  background={{ fill: '#E5E7EB' }}
                  dataKey="value"
                  cornerRadius={10}
                  fill={chartConfig.thisMonth.color}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${Number(value).toFixed(0)}%`}
                      hideLabel
                    />
                  }
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </ChartContainer>
          <div className="mt-4 text-center">
            <div className="text-4xl font-bold text-primary">
              {data.thisMonth.completionRate.toFixed(0)}%
            </div>
            <div className="text-sm text-secondary mt-1">This Month</div>
            <div className="text-sm text-secondary mt-2">
              {data.thisMonth.completedGoals} of {data.thisMonth.totalGoals} goals
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="mt-8 grid grid-cols-3 gap-4 pt-6 border-t border-border">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{data.totalGoals}</div>
          <div className="text-sm text-secondary">Total Goals</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{data.completedGoals}</div>
          <div className="text-sm text-secondary">Completed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-secondary">
            {data.totalGoals - data.completedGoals}
          </div>
          <div className="text-sm text-secondary">Remaining</div>
        </div>
      </div>
    </div>
  );
};
