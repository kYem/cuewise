# Chrome Web Store Assets

This directory contains all the required promotional images and screenshots for the Chrome Web Store listing.

## Directory Structure

```
store-assets/
├── screenshots/          # Product screenshots (1280x800)
│   ├── 01-main-view.png
│   ├── 02-new-tab.png
│   ├── 03-pomodoro.png
│   ├── 04-insights.png
│   └── 05-quote-management.png
└── promo/               # Promotional tiles
    ├── small-promo-tile-440x280.png
    └── marquee-promo-tile-1400x560.png
```

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
