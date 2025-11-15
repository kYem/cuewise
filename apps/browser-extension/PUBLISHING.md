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

### Short Description (Required - Max 132 characters)
```
Turn every new tab into a moment of intention with daily wisdom, mindful goals, and focus tools.
```

### Detailed Description (Recommended)
```
What if every new tab could inspire you, focus you, and track your growth?

Cuewise transforms your browser into a companion for meaningful productivity. No overwhelming task lists. No artificial deadlines. Just wisdom, intention, and progress—beautifully designed to help you navigate your day with purpose.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ YOUR DAILY COMPASS

Every time you open a new tab, you're greeted with:

📖 WISDOM THAT RESONATES
• 100+ handpicked quotes across 10 life categories (Inspiration, Learning, Productivity, Mindfulness, Success, Creativity, Resilience, Leadership, Health, Growth)
• Add your own meaningful quotes from books, mentors, or experiences
• Save favorites and revisit them when you need them most
• Sources and personal notes for deeper reflection

🎯 GOALS THAT MATTER
• Simple, focused daily goals—no complexity, just clarity
• Visual progress tracking that celebrates small wins
• Archive completed tasks to see how far you've come
• Goals organized by date for easy weekly review

⏰ REMINDERS THAT ACTUALLY WORK
• Smart notifications that respect your attention
• Snooze options (5min, 15min, 1hr, 1 day) for real life
• Recurring reminders for habits and routines
• Countdown timers for approaching deadlines

🍅 FOCUS THAT FLOWS
• Built-in Pomodoro timer (25-minute focus, 5-minute breaks)
• Circular progress visualization keeps you in the zone
• Session history tracks your deep work streaks
• Customizable work and break durations

📊 INSIGHTS THAT INSPIRE
• Current and longest goal completion streaks
• Weekly, monthly, and all-time progress stats
• Quote category analytics—discover what resonates with you
• Pomodoro session tracking for focused work patterns

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎨 DESIGNED FOR CLARITY

Clean, minimalist interface that gets out of your way. Beautiful typography, soothing colors, and thoughtful spacing create a calm digital environment. Dark mode included.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔒 PRIVACY BY DESIGN

Your data never leaves your device. No accounts. No tracking. No cloud sync. No analytics. What you write, set, and achieve stays yours alone.

All data stored locally in your browser using Chrome's secure storage API. Export your data anytime. Delete everything with one click.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 WHO IS THIS FOR?

✓ Remote workers wanting to start each day with intention
✓ Students building sustainable study habits
✓ Professionals seeking balance between productivity and reflection
✓ Anyone tired of productivity apps that create more stress than they solve
✓ People who appreciate meaningful design and thoughtful tools

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌟 THE CUEWISE PHILOSOPHY

Productivity isn't about doing more—it's about moving forward with purpose. Every quote, goal, and completed session is a step on your journey.

We believe:
• Wisdom should be accessible in everyday moments
• Progress happens one mindful step at a time
• The best productivity tool respects your privacy and attention
• Beautiful design makes intentional living easier

Your new tab shouldn't just be functional—it should be a moment to breathe, refocus, and remember what matters.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 GET STARTED IN SECONDS

Install Cuewise, open a new tab, and start your journey. No setup. No tutorials. Just you, your goals, and the wisdom to guide you forward.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❓ FAQ

Q: Does this sync across devices?
A: No. All data stays local for privacy. Each browser has its own data.

Q: Can I export my data?
A: Yes! Export all your quotes, goals, and settings anytime (coming in v1.1).

Q: Will this slow down my browser?
A: No. Cuewise is lightweight and optimized for performance.

Q: Do you collect any data?
A: Absolutely not. Zero tracking, zero analytics, zero accounts.

Q: Can I customize the quote categories?
A: Categories are fixed, but you can add custom quotes in any category.

Q: What happens if I uninstall?
A: All local data is removed. Make sure to export first if you want to keep it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛠️ COMING SOON

• Data export/import
• Quote search and filtering
• Weekly review summaries
• More customization options
• Browser sync (optional, privacy-first)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Turn your day into a meaningful journey. Install Cuewise today.
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
