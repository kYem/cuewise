# Chrome Web Store Assets

This directory contains all the required promotional images and screenshots for the Chrome Web Store listing.

## Directory Structure

```
store-assets/
├── screenshots/          # Product screenshots (1280x800) — generated locally, NOT committed
│   ├── 01-main-view.png      # Today's Focus (full goals view)
│   ├── 02-focus-view.png     # Distraction-free focus mode
│   ├── 03-pomodoro.png       # Pomodoro timer (active session)
│   ├── 04-insights.png       # Insights / analytics
│   └── 05-settings.png       # Settings (compact sidebar)
└── promo/               # Promotional tiles — generated locally, NOT committed
    ├── small-promo-tile-440x280.png    # focus view, downscaled 2x
    └── marquee-promo-tile-1400x560.png # focus view, wide banner
```

> **These images are not version-controlled.** Both `screenshots/` and `promo/`
> are gitignored — they're regenerable marketing assets (photographic PNGs that
> would bloat history). Regenerate them against the dev server on the glass theme
> at the sizes above, then upload to the Chrome Web Store listing manually. The
> lists above are the intended lineup, not tracked files.

## Chrome Web Store Requirements

### Screenshots (Required)
- **Size**: 1280x800 or 640x400 pixels
- **Format**: JPEG or 24-bit PNG (no alpha)
- **Minimum**: At least 1 required
- **Maximum**: Up to 5 screenshots

✅ **Our screenshots**: 5 images at 1280×800 (16:10 aspect ratio)

### Small Promo Tile (Optional)
- **Size**: 440×280 pixels
- **Format**: JPEG or 24-bit PNG (no alpha)

✅ **Our tile**: 440×280 PNG

### Marquee Promo Tile (Optional)
- **Size**: 1400×560 pixels
- **Format**: JPEG or 24-bit PNG (no alpha)

✅ **Our tile**: 1400×560 PNG

## Upload Instructions

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Select your extension or create new item
3. Navigate to "Store listing" tab
4. Upload screenshots from `screenshots/` folder (drag and drop in order)
5. Upload promo tiles from `promo/` folder

## Screenshot Descriptions (Suggested)

1. **Main View** - "Your new tab: Daily wisdom, goals, and reminders in one beautiful view"
2. **New Tab** - "Start each day with inspiring quotes across 10 categories"
3. **Pomodoro** - "Built-in Pomodoro timer to stay focused and productive"
4. **Insights** - "Track your progress with detailed insights and analytics"
5. **Quote Management** - "Manage your quotes, add custom ones, and organize favorites"

## Notes

- All images are 24-bit PNG without alpha channel (as required)
- Images maintain aspect ratios and are optimized for web
- Original source images are in `../screenshots/` directory
