import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@cuewise/ui';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';

const DATA = [
  { day: 'Mon', minutes: 95 },
  { day: 'Tue', minutes: 130 },
  { day: 'Wed', minutes: 80 },
  { day: 'Thu', minutes: 150 },
  { day: 'Fri', minutes: 115 },
  { day: 'Sat', minutes: 60 },
  { day: 'Sun', minutes: 40 },
];

const CONFIG = {
  minutes: { label: 'Focus minutes', color: 'var(--color-primary-600)' },
};

// ChartContainer wraps children in recharts' ResponsiveContainer. In the design
// bundle that container comes from the DS's own recharts copy, separate from the
// preview's — recharts 3 shares chart sizing via a store the other instance
// can't read, so the BarChart gets explicit width/height to render on its own.
export const FocusByDay = () => (
  <div style={{ width: 480, height: 260 }}>
    <ChartContainer config={CONFIG} style={{ width: '100%', height: '100%' }}>
      <BarChart
        width={460}
        height={248}
        data={DATA}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="minutes" fill="var(--color-primary-600)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartContainer>
  </div>
);
