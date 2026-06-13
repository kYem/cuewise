---
"@cuewise/browser-extension": minor
---

Replace the goal-completion confetti with a satisfying animated tick checkbox

- New `AnimatedCheckbox` — a presentational, theme-aware SVG that plays a quick
  ring **spin** and then **draws** the checkmark on when you complete a task,
  with a subtle pop. It tints to the active theme (and a white `onImage` variant
  for the glass theme), respects `prefers-reduced-motion` (the check appears
  instantly, no spin), and never replays the animation for tasks that are
  already complete when they load
- Adopted across every interactive completion toggle: the Today's Focus tiles,
  backlog rows, and subtasks; the compact rows (the flag pill is now the standard
  animated ring); the focus-mode check; the all-goals list; upcoming tasks; and
  the goal detail task rows (which also gain a previously-missing accessible
  label)
- Removed the "all goals done" confetti celebration in favour of the per-checkbox
  tick — completing your last task of the day no longer triggers a random burst.
  The Pomodoro-completion confetti and the `celebrationsEnabled` setting are
  unchanged
