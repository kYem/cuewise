---
"@cuewise/browser-extension": patch
---

Fix the goal add-row overflowing the card in compact mode

The compact "Today's Focus" widget rendered the add-row with the boxed input
variant, whose `min-w-[280px]` plus the wide Add button pushed the row past the
400px card — truncating the placeholder and clipping the "Add" button off the
right edge. Compact mode now uses the soft-pill `widget` variant (already used by
full mode), so the input, link, and Add button fit within the card.
