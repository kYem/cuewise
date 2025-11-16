# Chrome Web Store Publishing Guide

## 🚀 Quick Start

### Build Store Package
```bash
# Build and create store package
pnpm --filter @cuewise/browser-extension build:store
```

**Output**: `apps/browser-extension/build/cuewise-extension-1.0.0.zip`

## 📸 Store Assets (`store-assets/`)

**Screenshots** (5 × 1280×800px): Main view, Quote display, Pomodoro, Insights, Quote management
**Promo Tiles**: Small (440×280px), Marquee (1400×560px)

## 📝 Store Listing

**Name**: Cuewise
**Category**: Productivity
**Short Description** (132 chars max):
```
Turn every new tab into a moment of intention with daily wisdom, mindful goals, and focus tools.
```

See full description in `DESCRIPTION.md` (copy-paste ready for Chrome Web Store)

## 🔐 Privacy & Permissions

**Single Purpose**: Productivity enhancement via new tab replacement with quotes, goals, reminders, and Pomodoro timer.

### Permission Justifications

**Storage**: Save quotes, goals, reminders, Pomodoro preferences, and progress locally. No cloud storage.

**Notifications**: Alert users for reminders and Pomodoro session completions. User-triggered only.

**Alarms**: Schedule reminders, Pomodoro intervals, and quote auto-refresh. All locally managed.

### Privacy Summary
- **Collected**: Nothing. Zero tracking.
- **Stored**: All data local only (`chrome.storage.local`)
- **Shared**: Never. No external services.
- **Deletable**: Yes, anytime via settings or uninstall.

## 🌐 Publishing Steps

1. **Developer Account**: [Chrome Web Store Dashboard](https://chrome.google.com/webstore/devconsole) ($5 one-time fee)
2. **Upload**: Click "New Item" → Upload `build/cuewise-extension-1.0.0.zip`
3. **Store Listing**: Add name, description, screenshots, promo tiles, icon
4. **Privacy**: Add single purpose, permission justifications (see above)
5. **Distribution**: Select regions, set visibility to Public
6. **Submit**: Review → Submit for review (1-3 business days)

## 🔄 Updating

1. Bump version in `package.json` and `src/manifest.json`
2. Run `pnpm build:store`
3. Upload new zip to existing item in dashboard

## 📚 Resources

- [Developer Documentation](https://developer.chrome.com/docs/webstore/)
- [Program Policies](https://developer.chrome.com/docs/webstore/program_policies/)
