---
"@cuewise/browser-extension": minor
---

Add a gentle in-app store-review prompt (ENG-3)

Surfaces a dismissible "Enjoying Cuewise?" modal at a moment of delight — a 7-day
goal streak or 10 completed pomodoros — at a calm tab-open moment (never on
install, never during an active pomodoro). It's shown at most twice, spaced a
week apart; "Leave a review" opens the Chrome Web Store reviews tab and "Don't
ask again" stops it permanently. The trigger lives in a pure, unit-tested
`shouldShowReviewPrompt` helper, backed by three new persisted settings
(`reviewPromptDismissed`, `reviewPromptCount`, `reviewPromptLastShownAt`).
