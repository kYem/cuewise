# Lottie Celebrations Feature

**Spec ID:** 002
**Date:** 2026-06-09
**Status:** Accepted

---

## Summary

Add a lightweight, reusable Lottie animation foundation to the browser extension
and use it to ship a flagship **completion celebration** — a confetti/checkmark
burst at *meaningful* productivity moments. The same foundation is intended to be
reused later for empty-state illustrations and an onboarding sequence (both out of
scope here).

This work uses the `text-to-lottie` skill only as a *design-time asset generator*,
not as a runtime dependency. The skill's Skottie/canvaskit-wasm preview is its
authoring environment; the JSON it emits is standard Lottie and is rendered in the
extension by a light JS runtime.

---

## Decisions (locked during brainstorming)

| Decision | Choice |
|----------|--------|
| Animation categories of interest | Celebration/reward, functional feedback, onboarding (this spec covers celebration only) |
| First flagship moment | Goal/pomodoro **completion celebration** |
| Asset source | **Hybrid** — ship a polished free LottieFiles asset now; keep a pipeline so skill-generated/custom assets swap in later |
| Trigger policy | **Meaningful moments** — every pomodoro work completion + finishing all of today's goals (streak milestone deferred) |
| Runtime | **`lottie-react`** (wraps `lottie-web`), using the **`lottie_light`** build |
| Accessibility | Respect `prefers-reduced-motion`; settings toggle to disable |

### Streak-milestone trigger — deferred

The chosen "meaningful moments" policy nominally includes streak milestones, but
streak detection (computing streak before/after a completion and detecting a
crossing of 3/7/14/30/100) is the most complex trigger. **v1 ships pomodoro +
all-goals-done.** The trigger seam is built so streak drops in later as a single
added call with no refactor. Override this if streak is wanted in v1.

---

## Runtime rationale

The default `lottie-web` build evaluates Lottie *expressions* via `eval`/`Function`,
which Manifest V3's content security policy forbids. We import the **`lottie_light`**
build (`lottie-web/build/player/lottie_light`), which omits expression support and
avoids `eval`. Skottie-authored JSON uses a feature subset compatible with the light
build, so assets from the `text-to-lottie` skill render correctly.

Rejected alternatives:
- `@lottiefiles/dotlottie-react` — smaller `.lottie` assets but adds a WASM player
  and MV3 CSP friction.
- Skottie / `canvaskit-wasm` — ~6 MB WASM, CSP issues. This is the skill's preview
  environment only, never shipped.

---

## Architecture

A small trigger-bus + overlay, mirroring the existing `toast-store` / `ToastContainer`
pattern. The bus decouples *where a celebration is triggered* (deep in stores) from
*where it renders* (one top-level overlay).

### New files

```
apps/browser-extension/src/
  stores/celebration-store.ts                 # trigger bus
  components/celebration/
    LottiePlayer.tsx                           # thin lottie-react wrapper (light build)
    CelebrationOverlay.tsx                     # subscribes to bus, renders overlay
  assets/lottie/
    confetti.json                              # polished free LottieFiles asset
    README.md                                  # asset swap / skill pipeline docs
  stores/__fixtures__/celebration-store.fixtures.ts
  components/__fixtures__/celebration-overlay.fixtures.ts
```

### Modified files

```
apps/browser-extension/package.json                         # add lottie-react
apps/browser-extension/src/App.tsx                          # mount <CelebrationOverlay/>
apps/browser-extension/src/stores/pomodoro-store.ts         # fire celebrate('pomodoro')
apps/browser-extension/src/stores/goal-store.ts             # fire celebrate('allGoals')
packages/shared/src/types.ts                                # add Settings.celebrationsEnabled + CelebrationType
packages/shared/src/constants.ts                            # default celebrationsEnabled: true
apps/browser-extension/src/components/settings/NotificationsSettings.tsx  # add toggle (uses SettingsToggle)
```

---

## Components & contracts

### `celebration-store.ts`

```typescript
type CelebrationType = 'pomodoro' | 'allGoals'; // 'streak' added in fast-follow

interface CelebrationState {
  active: CelebrationType | null;
  celebrate: (type: CelebrationType) => void;  // ignored if already active (debounce)
  dismiss: () => void;                          // called by overlay on animation complete
}
```

- **Debounce:** `celebrate()` is a no-op when `active !== null`. Prevents stacking
  when one action satisfies two triggers (e.g. finishing a pomodoro that also
  completes the last goal fires once).
- The store is the *only* coupling point stores need — they import
  `useCelebrationStore.getState().celebrate(...)`, exactly like the toast pattern.

### `LottiePlayer.tsx`

- Thin wrapper over `lottie-react` using the `lottie_light` build.
- Props: `animationData`, `loop` (default `false`), `onComplete`, size className.
- Plays once by default and calls `onComplete` when the animation finishes.

### `CelebrationOverlay.tsx`

- Subscribes to `celebration-store` and `settings-store`.
- Renders nothing when: `active === null`, `celebrationsEnabled === false`, or
  `matchMedia('(prefers-reduced-motion: reduce)').matches`.
- When active: full-screen, `pointer-events-none` layer above page content; plays the
  asset for `active` once; on `onComplete` calls `dismiss()`.
- Mounted once in `App.tsx` next to `<ToastContainer>` so it floats over every page.

---

## Trigger wiring

- **Pomodoro** — in `pomodoro-store.completeSession()`, after a session of
  `sessionType === 'work'` is recorded, call `celebrate('pomodoro')`. Break/longBreak
  completions do not celebrate.
- **All goals done** — in `goal-store.toggleTask()`, after toggling a task *to*
  completed, if `todayTasks.length > 0` and every today task is completed, call
  `celebrate('allGoals')`. Fires only on the transition *into* "all done"; never on
  un-checking a task.
- **Streak (deferred)** — seam: compute streak before/after completion in
  `goal-store`; if it crosses a milestone, `celebrate('streak')`. Not implemented in
  v1.

---

## Settings & accessibility

- Add `celebrationsEnabled: boolean` to `Settings` (default `true`) in
  `packages/shared/src/types.ts` and `constants.ts`.
- Add a toggle to `NotificationsSettings.tsx` using the existing `SettingsToggle`
  component (alongside the other `*Enabled` toggles).
- `prefers-reduced-motion` is checked at render time in the overlay — when reduced,
  the completion logic still runs normally; only the animation is skipped.

---

## Edge cases

- Already-active celebration → new triggers ignored (debounce).
- Un-checking a completed task → never celebrates.
- Store hydration / initial load setting `completed` state → must not celebrate
  (triggers live in user-action methods `toggleTask` / `completeSession`, not in load).
- Assets are statically imported and bundled → no async-load failure path.
- `prefers-reduced-motion` evaluated per-trigger (can change at runtime).

---

## Asset pipeline (hybrid)

- v1 bundles a vetted free LottieFiles confetti JSON at
  `src/assets/lottie/confetti.json`.
- `src/assets/lottie/README.md` documents the swap path: generate JSON with the
  `text-to-lottie` skill (or any source), keep the `confetti.json` filename, drop it
  in the folder → zero code change. This is how the linked skill plugs in for
  custom/branded assets later.

---

## Testing

Vitest + React Testing Library, following the repo's `__fixtures__` convention.

- `celebration-store`: `celebrate` sets `active`; `dismiss` clears it; second
  `celebrate` while active is a no-op (debounce).
- `pomodoro-store`: completing a `work` session calls `celebrate('pomodoro')`;
  break completion does not.
- `goal-store`: toggling the last incomplete task calls `celebrate('allGoals')`;
  toggling when other tasks remain does not; un-checking does not.
- `CelebrationOverlay`: renders and auto-dismisses on complete; renders nothing when
  `celebrationsEnabled === false`; renders nothing under reduced-motion.

---

## Out of scope (foundation reused later)

- Empty-state illustrations.
- Onboarding / first-run animated sequence.
- Streak-milestone celebration (deferred fast-follow on the built seam).
- Ambient/background animation.
