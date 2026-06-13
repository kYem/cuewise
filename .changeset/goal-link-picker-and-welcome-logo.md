---
"@cuewise/browser-extension": patch
---

Fix the goal add-row "link to goal" button and show the Cuewise logo on the welcome screen

- The link button in the Today's Focus add-row did nothing: it's rendered via
  Radix `PopoverTrigger asChild`, but `GoalLinkButton` was a plain function
  component that didn't forward the trigger's ref/onClick to its `<button>`, so
  the picker never opened. It now uses `forwardRef` and spreads the trigger props.
- The welcome modal showed a generic sparkles icon; it now shows the actual
  Cuewise logo.
