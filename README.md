# Cuewise

**Your personal productivity companion.** A beautiful browser extension that combines motivational quotes, goal tracking, Pomodoro timer, and productivity insights in your new tab.

**Current Version:** 1.1.0 | **Status:** Feature-complete for Chrome/Edge

---

## ✨ Features

### 📝 Smart Goal Management
- **Daily Focus**: Add and track today's goals with visual progress
- **Goal History**: View all past, present, and future goals organized by date
- **Flexible Actions**: Edit, complete, delete, or move goals between days
- **Filter by Status**: View all, completed, or incomplete goals
- **Auto-Transfer**: Move incomplete goals to tomorrow with one click

### 💭 Motivational Quotes
- **100+ Curated Quotes**: Across 10 categories (Inspiration, Learning, Productivity, and more)
- **Custom Quotes**: Add your own with author, category, source, and personal notes
- **Smart Features**: Favorite, hide, view count tracking, and quote history navigation
- **Category Colors**: Beautiful OKLCH-based color coding for each category

### ⏱️ Pomodoro Timer
- **Classic Technique**: 25-minute work sessions, 5-minute breaks, 15-minute long breaks
- **Customizable**: Adjust all durations and intervals to your preference
- **Ambient Sounds**: Focus with optional background audio
- **Session Tracking**: Complete history of all Pomodoro sessions
- **Widget Access**: Quick timer control from any page

### 📊 Insights & Analytics
- **Productivity Stats**: Goals completed, focus time, Pomodoro sessions
- **Streak Tracking**: Current and longest goal completion streaks
- **Advanced Analytics**: Daily, weekly, and monthly trends
- **Visual Charts**: Goal completion rates and Pomodoro heatmaps
- **Data Export**: Download your data as JSON or CSV

### 🎨 Beautiful Customization
- **Dark Mode**: Seamless light/dark/auto theme switching
- **3 Color Themes**: Purple, Forest Green, and Rose Pink
- **3 Density Modes**: Compact, Comfortable, and Spacious layouts
- **Live Preview**: See theme changes in real-time before applying
- **Persistent Settings**: All preferences saved locally

### 🔔 Smart Reminders
- **Flexible Scheduling**: Set reminders with specific dates and times
- **Browser Notifications**: Never miss what matters
- **Snooze Options**: 5 min, 15 min, 1 hour, or 1 day
- **Recurring Support**: Daily, weekly, or monthly reminders
- **Quick Management**: Mark complete or delete with one click

### 💾 Storage Management
- **Usage Tracking**: Monitor Chrome storage usage with visual indicators
- **Warning System**: Alerts when approaching storage limits
- **Hybrid Strategy**: Seed quotes in local storage, custom data in sync storage
- **Cross-Device Sync**: Enable Chrome Sync to share data across devices

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Chrome or Edge browser

### Installation

```bash
# Clone and install
git clone <repository-url>
cd cuewise
pnpm install

# Build the extension
pnpm --filter @cuewise/browser-extension build
```

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select `apps/browser-extension/dist` folder
5. Open a new tab to see your productivity dashboard! 🎉

---

## 🛠️ Development

```bash
# Start dev server with HMR
pnpm --filter @cuewise/browser-extension dev

# Run linting and type check
pnpm lint
pnpm type-check

# Run tests
pnpm --filter @cuewise/browser-extension test
pnpm --filter @cuewise/browser-extension test:watch

# Build for production
pnpm build

# Clean build artifacts
pnpm clean
```

### Development URLs
- **Extension**: Load `dist/` folder in Chrome
- **Dev Server**: `http://localhost:5173/` (for rapid testing without extension reload)

---

## 📦 Tech Stack

### Monorepo Architecture
- **Package Manager**: pnpm with workspaces
- **Build Tool**: Turbo for efficient caching
- **Linting**: Biome (50x faster than ESLint)

### Frontend
- **Framework**: React 18 + TypeScript (ES2022)
- **Build**: Vite with @crxjs/vite-plugin for HMR
- **Styling**: Tailwind CSS 4 with OKLCH colors
- **State**: Zustand stores with persistence
- **Icons**: Lucide React
- **Testing**: Vitest + Testing Library + Fishery factories

### Structure
```
cuewise/
├── apps/
│   └── browser-extension/    # Chrome/Edge extension (30 components, 11 stores)
├── packages/
│   ├── shared/               # Platform-agnostic types, utils, constants
│   ├── storage/              # Multi-platform storage adapters
│   ├── ui/                   # Shared UI components (Toast, Modal, etc.)
│   └── test-utils/           # Testing factories and mocks
```

---

## 📚 Key Features Explained

### Goal History View
Access past and future goals even when today's list is empty:
- **Always Accessible**: "View All Goals" button never disappears
- **Date Grouping**: Goals organized with relative dates (Today, Yesterday, Tomorrow)
- **Smart Filtering**: Toggle between All, Completed, or Incomplete
- **Move to Today**: One-click to bring back past goals
- **Transfer Forward**: Move incomplete goals to tomorrow

### Pomodoro Integration
Full-featured timer with ambient sounds and tracking:
- **Flexible Settings**: Customize work/break durations
- **Auto-Start**: Optional auto-transition between intervals
- **Sound Options**: Multiple ambient soundscapes
- **Sticky Widget**: Access timer from any page
- **Complete Analytics**: Heatmaps show your most productive hours

### Storage Strategy
Smart hybrid approach for performance and sync:
- **Local Storage**: 99 seed quotes (fast, no sync needed)
- **Sync Storage**: Custom quotes and user data (syncs across devices)
- **Visual Indicators**: Real-time storage usage with color-coded warnings
- **Efficient**: Optimized to stay well under Chrome's limits

---

## 🎯 Usage Tips

### Goals
- **Add**: Type and press Enter
- **Complete**: Click the circle checkbox
- **Edit**: Click the goal text
- **Move to Today**: Expand history, click move button on past goals
- **Transfer**: Hover and click arrow to move to tomorrow (after 8 PM)
- **Clear**: Bulk remove completed goals with one click

### Quotes
- **New Quote**: Click refresh button or open a new tab
- **Navigate**: Use arrow buttons to browse quote history
- **Favorite**: Click heart icon (favorites never appear as random)
- **Hide**: Click eye icon (hidden quotes never appear)
- **Custom Quote**: Click floating "+" button to add your own

### Pomodoro
- **Quick Start**: Click "Pomodoro" in top-right corner
- **Customize**: Open settings (⚙️) → Pomodoro section
- **Ambient Sound**: Select from multiple options and adjust volume
- **Track Progress**: View session history and analytics in Insights

### Theme Customization
- **Live Preview**: Enable theme switcher sidebar to test instantly
- **Density**: Choose Compact (minimal), Comfortable (balanced), or Spacious (relaxed)
- **Dark Mode**: Auto-syncs with system preferences or set manually
- **Persistence**: All settings saved automatically

---

## 🔮 Planned Enhancements

### Near-Term (v1.2)
- Chrome Web Store publication
- Export/import data backup
- Onboarding tutorial for new users
- Accessibility improvements (ARIA labels, keyboard navigation)

### Future Platforms
- 🌐 **Web App** (Next.js) - Use without browser extension
- 📱 **Mobile App** (React Native) - iOS and Android support
- ☁️ **Cloud Sync** - Backend service for cross-platform data sync

---

## 🤝 Contributing

Contributions welcome! Please:
- Write tests for new features
- Follow TypeScript strict mode (no `any` types)
- Use Biome for linting (auto-fix with `pnpm lint:fix`)
- Keep components focused and under 300 lines
- Add JSDoc comments for public APIs

See [CLAUDE.md](./CLAUDE.md) for architecture details and [LINTING.md](./LINTING.md) for code style.

---

## 🐛 Troubleshooting

**Extension not loading**
- Verify you selected the `dist/` folder
- Rebuild: `pnpm --filter @cuewise/browser-extension build`
- Check Chrome DevTools console for errors

**Data not syncing**
- Enable Chrome Sync in settings
- Check storage usage in Insights page
- Ensure you're signed into Chrome on all devices

**Build errors**
```bash
# Clear everything and reinstall
rm -rf node_modules packages/*/node_modules apps/*/node_modules
pnpm install
pnpm build
```

---

## 📄 License

MIT License - See LICENSE file for details

---

**Stay motivated. Stay productive. Stay focused.** ✨

Made with ❤️ using React, TypeScript, and Tailwind CSS
