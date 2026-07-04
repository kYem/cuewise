---
'@cuewise/browser-extension': minor
---

feat(pomodoro): pop the timer out into a floating, always-on-top mini window that stays visible while you work in other tabs. A pop-out button on the active-timer pill and the Pomodoro page opens a compact Document Picture-in-Picture float showing the session type, countdown, and pause/resume — it keeps ticking and shares state with the app, and survives navigating between Cuewise's own pages. The button is hidden on browsers without the Document PiP API.
