---
'@cuewise/browser-extension': minor
'@cuewise/shared': minor
---

feat(pomodoro): tap any timer value to open a compact mini-settings popover with one-tap rhythm presets (Classic, Deep work 50/10, Quick sprint) and inline duration editing — no trip to Settings. Pomodoro durations are now clamped to valid ranges whenever settings are saved (shared `POMODORO_DURATION_BOUNDS` + `clampPomodoroDurations`).
