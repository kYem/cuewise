---
"@cuewise/browser-extension": patch
---

Reminders: if a reminder saves but its alarm can't be scheduled (e.g. the browser's alarm limit), show a distinct "saved, but we couldn't schedule its alert" warning instead of a generic failure — and never revert the saved reminder over a scheduling error.
