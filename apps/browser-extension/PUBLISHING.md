# Chrome Web Store Publishing Guide

## 📦 Package Status: Ready for Upload

- **Package file**: `cuewise-extension-1.0.0.zip` (389 KB)
- **Version**: 1.0.0
- **Manifest**: V3 ✓
- **Icons**: All sizes included (16, 48, 128) ✓
- **Screenshots**: 5 images ready ✓
- **Promo tiles**: Small + Marquee ready ✓

## 🚀 Quick Start

### Build and Package
```bash
# Build and create store package in one command
pnpm --filter @cuewise/browser-extension build:store

# Or separately:
pnpm --filter @cuewise/browser-extension build
pnpm --filter @cuewise/browser-extension package
```

The zip file will be created at: `apps/browser-extension/cuewise-extension-1.0.0.zip`

## 📸 Store Assets

All required assets are in `store-assets/`:

### Screenshots (Required)
Location: `store-assets/screenshots/`
- **01-main-view.png** (1280×800) - Main new tab view
- **02-new-tab.png** (1280×800) - Quote display
- **03-pomodoro.png** (1280×800) - Pomodoro timer
- **04-insights.png** (1280×800) - Analytics dashboard
- **05-quote-management.png** (1280×800) - Quote library

### Promotional Tiles (Optional but Recommended)
Location: `store-assets/promo/`
- **small-promo-tile-440x280.png** - For store listing
- **marquee-promo-tile-1400x560.png** - For featured placement

## 📝 Store Listing Information

### Basic Info
- **Name**: Cuewise
- **Tagline**: Turn your day into a meaningful journey
- **Description**: Daily wisdom, mindful goals, and progress tracking.

### Extended Description (Suggested)
```
Transform your daily productivity into a meaningful journey with Cuewise.

✨ FEATURES

Daily Wisdom
• 100+ curated quotes across 10 categories
• Add your own custom quotes
• Save favorites for later

Mindful Goals
• Simple, focused task management
• Track daily progress
• Celebrate completions

Smart Reminders
• Browser notifications when due
• Snooze functionality
• Recurring reminders

Focus Timer
• Built-in Pomodoro timer
• Track completed sessions
• Stay in the zone

Progress Insights
• View your productivity trends
• Track streaks and achievements
• See your favorite quote categories

🎯 WHY CUEWISE?

Every new tab becomes a moment of intention. Start your day with wisdom, 
stay focused with your goals, and track your journey with insights.

Perfect for:
• Remote workers seeking balance
• Students building better habits
• Anyone wanting mindful productivity

🔒 PRIVACY FIRST

All your data stays local on your device. No accounts, no tracking, 
no cloud sync. Your journey is yours alone.
```

### Category
- **Primary**: Productivity
- **Tags**: goals, quotes, motivation, reminders, pomodoro, productivity

### Permission Justifications

**Storage**
- Store user's quotes, goals, reminders, and settings locally
- No data leaves the device

**Notifications**
- Alert users when reminders are due
- Notify when Pomodoro sessions complete

**Alarms**
- Schedule recurring reminders
- Manage Pomodoro timer intervals

### Screenshots Descriptions

1. **Main View**: "Your new tab: Daily wisdom, goals, and reminders in one beautiful view"
2. **Quote Display**: "Start each day with inspiring quotes across 10 categories"
3. **Pomodoro Timer**: "Built-in Pomodoro timer to stay focused and productive"
4. **Insights**: "Track your progress with detailed insights and analytics"
5. **Quote Management**: "Manage your quotes, add custom ones, and organize favorites"

## 🌐 Publishing Steps

### 1. Create Developer Account
- Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- Pay one-time $5 registration fee
- Complete developer profile

### 2. Create New Item
1. Click "New Item"
2. Upload `cuewise-extension-1.0.0.zip`
3. Wait for upload to complete

### 3. Complete Store Listing
1. **Store listing tab**:
   - Fill in name, description, category
   - Upload screenshots (drag in order)
   - Upload promotional tiles
   - Add icon (use `public/icons/icon-128.png`)

2. **Privacy tab**:
   - Single purpose description: "Productivity enhancement with quotes, goals, and focus tools"
   - Justify permissions (see above)
   - Privacy policy URL (if you have one)

3. **Distribution tab**:
   - Select countries/regions
   - Choose visibility (Public recommended)

### 4. Submit for Review
1. Review all information
2. Click "Submit for review"
3. Wait for Google's review (typically 1-3 business days)

### 5. After Approval
- Extension will be published automatically
- Users can install from Chrome Web Store
- Monitor reviews and ratings

## 🔄 Updating the Extension

### Version Bump
1. Update version in `package.json`
2. Update version in `src/manifest.json`
3. Rebuild: `pnpm build:store`
4. Upload new zip to existing item in dashboard

### Update Checklist
- [ ] Version bumped in both files
- [ ] Build successful
- [ ] Tests passing
- [ ] Changelog updated
- [ ] New screenshots if UI changed
- [ ] Upload zip to dashboard

## 📊 Post-Launch

### Monitor
- User reviews and ratings
- Installation metrics
- Crash reports (if any)

### Respond
- Reply to user reviews
- Address issues quickly
- Gather feature requests

### Update
- Regular updates with new features
- Bug fixes based on user feedback
- Keep screenshots current

## 🆘 Troubleshooting

### Upload Rejected
- Check manifest.json format
- Ensure all permissions are justified
- Verify icon sizes are correct

### Review Taking Long
- Be patient (can take up to 7 days)
- Don't resubmit unless necessary

### Permissions Warning
- Clearly explain why each permission is needed
- Consider if all permissions are essential

## 📚 Resources

- [Chrome Web Store Developer Documentation](https://developer.chrome.com/docs/webstore/)
- [Extension Publishing Best Practices](https://developer.chrome.com/docs/webstore/best_practices/)
- [Program Policies](https://developer.chrome.com/docs/webstore/program_policies/)
- [Branding Guidelines](https://developer.chrome.com/docs/webstore/branding/)

---

**Last Updated**: 2025-11-15
**Version**: 1.0.0
**Status**: Ready for submission
