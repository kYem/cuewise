---
"@cuewise/browser-extension": patch
---

Fix the current streak collapsing to zero when a completed goal carries a future
date

`calculateStreak` is anchored to today, so a completed objective whose date is a
future due-date sorted ahead of today and reset the current streak to 0 — most
visibly on the Insights page. The streak now ignores future-dated entries at the
shared-utility level, so every caller (Insights and the new review prompt) stays
correct.
