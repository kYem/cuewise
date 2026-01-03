---
"@cuewise/browser-extension": minor
"@cuewise/shared": patch
---

## Smart Ticker Animation

Add slot-machine style animation for author name and category badge when quotes change, using the `@tombcato/smart-ticker` library.

### Features

- **Animated category badge**: Category name scrolls through characters when transitioning
- **Animated author name**: Author name uses slot-machine animation on quote changes
- **Settings toggle**: Enable/disable animation via Settings → Quote Change Interval → "Animate quote transitions"
- **Disabled by default**: Animation is opt-in to avoid CPU usage on lower-end devices

### New Components

- `AuthorTicker`: Animated author name display with character-level scrolling
- `CategoryTicker`: Animated category badge with smooth transitions

### Settings

- Added `enableQuoteAnimation` setting (default: `false`)
- Animation only affects category badge and author name, not the quote text itself
