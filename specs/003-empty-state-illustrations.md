# Empty-State Illustrations Feature

**Spec ID:** 003
**Date:** 2026-06-09
**Status:** Draft

---

## Summary

Replace the plain Lucide-icon + text empty states on CueWise's highest-traffic
first-run surfaces with friendly, gently-looping Lottie illustrations, via a
reusable `<EmptyState>` component. Builds directly on the Lottie foundation from
[002 — Lottie Celebrations](./002-lottie-celebrations.md) (the `LottiePlayer`,
the `lottie_light` runtime, and the bundled-asset pipeline).

This is the second consumer of those primitives, so the spec includes two small,
in-scope refactors: extract the reduced-motion check into a shared util, and move
`LottiePlayer` out of the `celebration/` folder into a neutral `lottie/` home.

---

## Decisions (locked during brainstorming)

| Decision | Choice |
|----------|--------|
| Scope | **Focused high-traffic set** — 3 first-run empty states (today's tasks, goals, reminders widget) |
| Motion | **Gentle continuous loop**; under `prefers-reduced-motion`, a **static frame** (never hidden — it is the main visual) |
| Asset source | **Distinct illustration per context** (tasks / goals / reminders), same hybrid pipeline (bundled placeholders now, swappable) |
| Component | One reusable presentational `<EmptyState>` |

### Explicitly NOT in scope
- No-results / filtered empty states ("No quotes match your selected categories",
  "No quotes found matching your search") — those need a "clear filters"
  affordance, not an illustration.
- Onboarding / first-run sequence.
- The reminders **View-all modal** empty state (`ReminderWidget.tsx:306-312`) — it
  is effectively unreachable (the View-all button only renders when there are >3
  active reminders).
- Pomodoro timer motion and streak celebrations (separate future work).

---

## Architecture

A single presentational component (`EmptyState`) renders a looping Lottie
illustration plus title/description/actions. It reuses the `LottiePlayer` from 002,
which gains an `autoplay` prop so the same component can render a static frame under
reduced motion.

### Refactors (in scope — second consumer justifies them)

1. **Extract reduced-motion check.** Move the `prefersReducedMotion()` helper
   currently local to `CelebrationOverlay.tsx` into `utils/prefers-reduced-motion.ts`
   and import it from both `CelebrationOverlay` and `EmptyState`.
2. **Relocate `LottiePlayer`.** Move `components/celebration/LottiePlayer.tsx`
   (and its test) to `components/lottie/LottiePlayer.tsx`. Empty states are not
   celebrations; `LottiePlayer` is a shared primitive. Update the one import in
   `CelebrationOverlay.tsx`.

### New files
```
apps/browser-extension/src/
  utils/prefers-reduced-motion.ts            # shared matchMedia check
  utils/prefers-reduced-motion.test.ts
  components/EmptyState.tsx                   # reusable empty-state component
  components/EmptyState.test.tsx
  assets/lottie/empty/tasks.json             # looping illustration (today's tasks)
  assets/lottie/empty/goals.json             # looping illustration (goals)
  assets/lottie/empty/reminders.json         # looping illustration (reminders)
  assets/lottie/empty/empty-assets.test.ts   # structural + expression-free validity
  assets/lottie/empty/README.md              # swap path for these assets
```

### Moved files
```
components/celebration/LottiePlayer.tsx      -> components/lottie/LottiePlayer.tsx
components/celebration/LottiePlayer.test.tsx -> components/lottie/LottiePlayer.test.tsx
```

### Modified files
```
components/celebration/CelebrationOverlay.tsx   # import LottiePlayer from ../lottie; use shared prefersReducedMotion
components/lottie/LottiePlayer.tsx               # add `autoplay?: boolean` prop
components/GoalsList.tsx                         # home "No tasks for today" empty state
components/goals/GoalsSection.tsx                # "No goals yet" / "No active goals" empty state
components/ReminderWidget.tsx                    # expanded-panel "No active reminders" empty state
```

---

## Components & contracts

### `utils/prefers-reduced-motion.ts`
```typescript
export function prefersReducedMotion(): boolean
```
Returns `false` when `window` / `window.matchMedia` is unavailable (jsdom-safe);
otherwise `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. Identical
behavior to the helper currently inlined in `CelebrationOverlay`.

### `LottiePlayer` — new `autoplay` prop
```typescript
interface LottiePlayerProps {
  animationData: object;
  loop?: boolean;        // default false
  autoplay?: boolean;    // default true; false renders a static first frame
  onComplete?: () => void;
  className?: string;
}
```
The `autoplay` value is passed straight to `lottie.loadAnimation`. With
`autoplay: false`, `lottie_light` renders frame 0 without playing — the static
illustration used under reduced motion. Celebration usage is unchanged (it omits
`autoplay`, so it defaults to `true`).

### `EmptyState.tsx`
```typescript
interface EmptyStateProps {
  animationData: object;          // looping Lottie illustration for this context
  title: string;
  description?: string;
  size?: 'sm' | 'md';             // 'sm' for the small reminders panel; default 'md'
  children?: React.ReactNode;     // optional actions (e.g. a CTA button), rendered below
}
```
- Centered column: the illustration (sized by `size`), `title`, optional
  `description`, optional `children`.
- Illustration playback: `loop` is always `true`; `autoplay={!prefersReducedMotion()}`.
  So it loops gently, or shows a static frame when the user prefers reduced motion.
- Purely presentational — no store access. Each call site owns its copy and actions.
- Illustration sizes (Tailwind): `sm` ≈ `w-20 h-20`, `md` ≈ `w-40 h-40` (final values
  tuned during implementation to match each surface).

---

## Wiring (replace the current icon + text blocks; keep all existing copy & CTAs)

### Home — today's tasks (`GoalsList.tsx:116-132`)
The non-compact branch currently renders a `Circle` icon + "No tasks for today" +
a description that depends on `hasOtherGoals`. Replace that inner block with:
```tsx
<EmptyState
  animationData={tasksAnimation}
  title="No tasks for today"
  description={hasOtherGoals ? 'View incomplete tasks below' : 'Add your first task to get started!'}
/>
```
Keep the `viewMode === 'compact'` branch (renders `<GoalInput />`) unchanged.

### Goals page (`goals/GoalsSection.tsx:77-83`)
Replace the `Flag` icon + text block with:
```tsx
<EmptyState
  animationData={goalsAnimation}
  title={showCompleted ? 'No goals yet' : 'No active goals'}
  description="Create a goal to track what you want to achieve"
/>
```
Keep the "New Goal" button and the create-goal `Modal` that sit alongside it.

### Reminders widget (`ReminderWidget.tsx:215-221`)
The expanded panel is small (`w-80`), so use `size="sm"`. Replace the `Bell` icon +
text block with:
```tsx
<EmptyState
  size="sm"
  animationData={remindersAnimation}
  title="No active reminders"
  description="Add one to stay on track"
/>
```

---

## Assets (hybrid pipeline)

- Three bundled, **expression-free**, **looping** Lottie illustrations in
  `assets/lottie/empty/`: `tasks.json`, `goals.json`, `reminders.json`.
- Authored so frame 0 is a sensible complete still (it is what reduced-motion users
  see). Keep them small and expression-free (same `lottie_light` / MV3 CSP
  constraints as the confetti asset).
- `assets/lottie/empty/README.md` documents the swap path: generate with the
  `text-to-lottie` skill or download an expression-free LottieFiles asset, keep the
  filename, drop it in — zero code change. Mirrors the existing
  `assets/lottie/README.md`.
- Fallback if authoring three distinct illustrations proves costly: ship one shared
  `empty.json` referenced by all three sites. (Default is distinct.)

---

## Accessibility & edge cases

- Reduced motion: illustration still shows (static frame), copy unchanged. The
  completion/empty logic is unaffected.
- The `LottiePlayer` root stays `aria-hidden="true"` (decorative); the title and
  description carry the meaning for screen readers.
- Looping animations only run while the empty state is mounted (e.g. the reminders
  panel loops only while expanded), bounding CPU.
- No store/persistence involvement — purely presentational; no async failure paths
  (assets are statically imported).

---

## Testing

Vitest + React Testing Library, following the repo's conventions (braced ifs, no
non-null `!`, no try/catch in tests, `__fixtures__` where useful).

- `prefers-reduced-motion`: returns `false` when `matchMedia` is absent; reflects
  `matches` when present.
- `LottiePlayer`: existing tests plus a new case asserting `autoplay: false` is
  forwarded to `loadAnimation` (default remains `true`).
- `EmptyState`: renders `title`, `description`, and `children`; passes `loop: true`
  and `autoplay: true` to the player normally; passes `autoplay: false` under
  reduced motion (mock `matchMedia`); applies the `sm`/`md` sizing.
- `empty-assets.test.ts`: each of the three assets is valid (top-level Lottie
  fields, ≥1 layer) and expression-free (no string-valued `"x"`), mirroring
  `confetti.test.ts`.
- Per-site smoke: `GoalsList`, `GoalsSection`, and `ReminderWidget` still render
  their empty-state titles (e.g. "No tasks for today") via `EmptyState`, and the
  retained CTAs (GoalInput in compact mode, the "New Goal" button) are unaffected.
- Regression: `CelebrationOverlay` tests still pass after the `LottiePlayer` move and
  the shared `prefersReducedMotion` extraction.

---

## Out of scope (foundation reused later)
- Onboarding sequence (would reuse `LottiePlayer` + `EmptyState` patterns).
- No-results/filtered empty states.
- Pomodoro timer motion; streak-milestone celebration.
