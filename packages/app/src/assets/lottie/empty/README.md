# Empty-state Lottie assets

Looping illustrations rendered by `EmptyState` via the `lottie_light` build (no
expressions / no eval — MV3 CSP-safe). Each loops gently; under
`prefers-reduced-motion` `EmptyState` shows frame 0 statically, so author frame 0
as a sensible still.

## Files
- `tasks.json` — home "No tasks for today"
- `goals.json` — Goals page "No goals yet"
- `reminders.json` — reminders widget "No active reminders"

These ship as simple pulsing shapes (placeholders). To swap in richer
illustrations with zero code change (consumers import by fixed filename):

1. Generate one with the `text-to-lottie` skill, or download an expression-free
   animation from https://lottiefiles.com.
2. Save it over the matching file here.
3. Run `pnpm --filter @cuewise/browser-extension test -- empty-assets.test.ts`.
