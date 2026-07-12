---
'@cuewise/ui': patch
---

fix(ui): make Popover/dropdown content legible on the glass theme. The shared PopoverContent used a translucent `bg-surface` with no backdrop blur, so on the glass theme menu items (e.g. the calendar Disconnect menu) were see-through and content behind them bled through. It now uses `bg-surface-elevated` with `backdrop-blur-xl`, matching the app's other floating panels.
