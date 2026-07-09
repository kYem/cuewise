# Lottie assets

Bundled Lottie JSON used by the celebration overlay. Rendered with the
`lottie_light` build of `lottie-web` (no expression/`eval` support — required for
Manifest V3 CSP). Keep assets free of Lottie *expressions*.

## Files
- `confetti.json` — played on pomodoro completion and "all today's tasks done".

## Swapping in a richer asset
The overlay (`components/celebration/CelebrationOverlay.tsx`) imports a fixed
`confetti.json` filename, so any valid Lottie can be dropped in with **zero code
change**:

1. Generate one with the `text-to-lottie` skill, or download a free
   (expression-free) animation from https://lottiefiles.com.
2. Save it as `confetti.json` in this folder, overwriting the existing file.
3. Run `pnpm --filter @cuewise/browser-extension test -- confetti.test.ts` to
   confirm it still satisfies the structural checks.
