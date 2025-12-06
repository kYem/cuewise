import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '../lib/utils';

// Chart configuration type
export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    color?: string;
    theme?: {
      light?: string;
      dark?: string;
    };
  };
};

// Theme modes for CSS variable generation
const THEMES = { light: '', dark: '.dark' } as const;

// Context for sharing config across chart components
const ChartContext = React.createContext<{
  config: ChartConfig;
} | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error('useChart must be used within <ChartContainer />');
  }

  return context;
}

// Component to inject CSS variables from chart config
function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([_, cfg]) => cfg.theme || cfg.color);

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) =>
              `${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .filter(Boolean)
  .join('\n')}
}`
          )
          .join('\n'),
      }}
    />
  );
}

// Chart Container
interface ChartContainerProps extends React.ComponentPropsWithoutRef<'div'> {
  config: ChartConfig;
  children: React.ReactElement;
  id?: string;
}

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ id, config, children, className, ...props }, ref) => {
    const uniqueId = React.useId();
    const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;

    return (
      <ChartContext.Provider value={{ config }}>
        <div
          data-chart={chartId}
          ref={ref}
          className={cn(
            'flex justify-center text-xs [&_.recharts-cartesian-grid_line[stroke="#ccc"]]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke="#ccc"]]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-surface-variant [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-surface-variant [&_.recharts-reference-line_[stroke="#ccc"]]:stroke-border',
            className
          )}
          {...props}
        >
          <ChartStyle id={chartId} config={config} />
          <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    );
  }
);
ChartContainer.displayName = 'ChartContainer';

// Chart Tooltip
const ChartTooltip = RechartsPrimitive.Tooltip;

// Chart Tooltip Content
interface ChartTooltipContentProps
  extends Omit<
      React.ComponentPropsWithoutRef<typeof RechartsPrimitive.Tooltip>,
      'content' | 'wrapperStyle' | 'contentStyle' | 'itemStyle' | 'labelStyle'
    >,
    Omit<React.ComponentPropsWithoutRef<'div'>, 'content'> {
  hideLabel?: boolean;
  hideIndicator?: boolean;
  hideName?: boolean;
  indicator?: 'line' | 'dot' | 'dashed';
  nameKey?: string;
  labelKey?: string;
}

const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
  (
    {
      active,
      payload,
      className,
      indicator = 'dot',
      hideLabel = false,
      hideIndicator = false,
      hideName = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref
  ) => {
    const { config } = useChart();

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null;
      }

      const [item] = payload;

      // If labelKey is provided, get the value directly from the payload data
      let value: React.ReactNode;
      if (labelKey && item.payload) {
        value = item.payload[labelKey];
      } else if (typeof label === 'string') {
        value = config[label]?.label || label;
      } else {
        const key = `${item.dataKey || item.name || 'value'}`;
        const itemConfig = config[key];
        value = itemConfig?.label;
      }

      if (labelFormatter) {
        return (
          <div className={cn('font-medium', labelClassName)}>{labelFormatter(value, payload)}</div>
        );
      }

      if (!value) {
        return null;
      }

      return <div className={cn('font-medium', labelClassName)}>{value}</div>;
    }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey]);

    if (!active || !payload?.length) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn(
          'grid min-w-[8rem] items-start gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2.5 text-xs shadow-xl',
          className
        )}
      >
        {!hideLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key = `${nameKey || item.name || item.dataKey || 'value'}`;
            const itemConfig = config[key];
            const indicatorColor = color || item.payload?.fill || item.color;

            return (
              <div
                key={`${item.dataKey}-${index}`}
                className={cn(
                  'flex w-full items-center justify-between gap-2',
                  indicator === 'dot' && 'items-center'
                )}
              >
                {(!hideIndicator || !hideName) && (
                  <div className="flex items-center gap-1.5">
                    {!hideIndicator && (
                      <div
                        className={cn(
                          'shrink-0 rounded-[2px]',
                          indicator === 'dot' && 'h-2.5 w-2.5',
                          indicator === 'line' && 'h-px w-4',
                          indicator === 'dashed' && 'h-px w-4 border-t-2 border-dashed'
                        )}
                        style={{
                          backgroundColor: indicator === 'dot' ? indicatorColor : undefined,
                          borderColor: indicator === 'dashed' ? indicatorColor : undefined,
                          background: indicator === 'line' ? indicatorColor : undefined,
                        }}
                      />
                    )}
                    {!hideName && (
                      <span className="text-secondary">{itemConfig?.label || item.name}</span>
                    )}
                  </div>
                )}
                <span className="font-mono font-medium tabular-nums text-primary">
                  {formatter && item.value !== undefined
                    ? formatter(
                        item.value,
                        item.name as Parameters<typeof formatter>[1],
                        item,
                        index,
                        item.payload
                      )
                    : item.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
ChartTooltipContent.displayName = 'ChartTooltipContent';

// Chart Legend
const ChartLegend = RechartsPrimitive.Legend;

// Chart Legend Content
interface ChartLegendContentProps
  extends React.ComponentPropsWithoutRef<'div'>,
    Pick<RechartsPrimitive.LegendProps, 'payload' | 'verticalAlign'> {
  hideIcon?: boolean;
  nameKey?: string;
}

const ChartLegendContent = React.forwardRef<HTMLDivElement, ChartLegendContentProps>(
  ({ className, hideIcon = false, payload, verticalAlign = 'bottom', nameKey }, ref) => {
    const { config } = useChart();

    if (!payload?.length) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-center gap-4',
          verticalAlign === 'top' ? 'pb-3' : 'pt-3',
          className
        )}
      >
        {payload.map((item) => {
          const key = `${nameKey || item.dataKey || 'value'}`;
          const itemConfig = config[key];

          return (
            <div
              key={item.value}
              className="flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-secondary"
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                !hideIcon && (
                  <div
                    className="h-2 w-2 shrink-0 rounded-[2px]"
                    style={{
                      backgroundColor: item.color,
                    }}
                  />
                )
              )}
              <span className="text-secondary">{itemConfig?.label || item.value}</span>
            </div>
          );
        })}
      </div>
    );
  }
);
ChartLegendContent.displayName = 'ChartLegendContent';

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent };
