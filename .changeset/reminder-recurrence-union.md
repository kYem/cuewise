---
"@cuewise/shared": patch
"@cuewise/browser-extension": patch
---

Internal type-safety: model `Reminder.recurring` as a discriminated union so an interval cadence always carries `intervalMinutes` and calendar cadences never do — removing defensive fallbacks. No behavior change.
