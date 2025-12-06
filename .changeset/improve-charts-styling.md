---
"@cuewise/browser-extension": patch
"@cuewise/ui": patch
---

Improve charts with shadcn/Recharts best practices

- Add CSS variable injection for theme-aware chart colors
- Fix tooltip styling for dark mode compatibility
- Add `hideName` prop to ChartTooltipContent for cleaner tooltips
- Remove dashed grid lines, use clean horizontal lines
- Make X-axis labels horizontal and abbreviated
- Convert weekday chart to vertical bar layout for consistency
- Add forest and rose theme chart color variants
