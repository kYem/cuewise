# Cuewise Development Roadmap

**Last Updated**: 2025-01-16
**Current Version**: v1.1 (Browser Extension with Dark Mode & Theme Customization)

---

## ✅ Recently Completed (v1.1)

### Dark Mode & Theme Customization
- [x] Full dark mode support with smooth transitions
- [x] 6 beautiful color themes using OKLCH color space:
  - Ocean Blue (default)
  - Forest Green
  - Sunset Orange
  - Royal Purple
  - Rose Pink
  - Slate Gray
- [x] Live theme preview sidebar with real-time visual feedback
- [x] Theme settings persist across sessions
- [x] All components fully themed (quotes, goals, pomodoro, insights)

### UI/UX Enhancements
- [x] Unified density customization (compact/comfortable/spacious)
  - Affects all spacing, padding, and layout density
  - Visual density preview in settings
  - Smooth transitions when changing density
- [x] Countdown progress bar on "New Quote" button
  - Shows remaining time until next auto-refresh
  - Smooth animation (100ms updates)
  - Only appears when auto-refresh is enabled
  - Resets on manual refresh and navigation
- [x] Fixed 12-hour time format (removed leading zero: "5:20 PM" not "05:20 PM")

### Technical Improvements
- [x] Fixed Vite 6.0.9+ CORS policy for dev mode
  - Added `skipWebSocketTokenCheck: true` in legacy config
  - Resolved development server connection issues
- [x] Migrated manifest to TypeScript configuration
  - Type-safe manifest configuration
  - Dynamic host_permissions based on environment
  - Better maintainability
- [x] Improved service worker reliability in development

### Code Quality
- [x] Consistent OKLCH color usage throughout theme system
- [x] Improved TypeScript typing for theme configuration
- [x] Better error handling in quote display
- [x] Optimized re-renders with proper React hooks usage

**Version Released**: January 16, 2025

---

## 🎯 Next Steps & Priorities

### Phase 1: Production Polish (1-2 weeks) 🚀

**Priority: HIGH - Get to market**

#### 1.1 Production Optimizations
- [ ] Remove console.logs from production build
  - Add Vite plugin to strip console statements
  - Keep error logging only
- [ ] Bundle size optimization
  - Add bundle analyzer (`rollup-plugin-visualizer`)
  - Lazy load Insights page components
  - Tree-shake unused code
  - Add compression (gzip)
- [ ] Performance audit
  - Lighthouse audit
  - Optimize re-renders
  - Check memory leaks

**Estimated effort**: 2-3 days

#### 1.2 Chrome Web Store Preparation
- [ ] Create store listing assets
  - Screenshots (1280x800, 640x400)
  - Promotional images
  - App icon in multiple sizes
  - Feature graphic
- [ ] Write store description
  - Feature list
  - Benefits
  - Usage instructions
- [ ] Add privacy policy
- [ ] Create promotional website/landing page
- [ ] Submit for review

---

### Phase 2: Feature Enhancement (1-2 months) ✨

**Priority: MEDIUM - Improve user experience**

#### 2.1 Quote Management Page
- [ ] Browse all quotes interface
  - Grid/list view toggle
  - Pagination or infinite scroll
- [ ] Filter quotes
  - By category
  - By favorite status
  - Custom vs curated
  - Hidden quotes view
- [ ] Search functionality
  - Search by text/author
  - Debounced input
  - Highlight matches
- [ ] Bulk operations
  - Unhide multiple quotes
  - Delete custom quotes
  - Export selected quotes
- [ ] Edit custom quotes
  - Edit form modal
  - Update quote details
  - Validation

**Estimated effort**: 5-7 days
**User value**: HIGH - Power users will love this

#### 2.2 Export/Import Data
- [ ] Export all data to JSON
  - Download as file
  - Include all quotes, goals, reminders, settings
  - Timestamped filename
- [ ] Import from backup
  - File upload
  - Validation
  - Merge or replace options
  - Preview before import
- [ ] Export specific data types
  - Export only custom quotes
  - Export goals history
  - Export insights data

**Estimated effort**: 2-3 days
**User value**: MEDIUM - Important for migrations and backups

#### 2.3 Onboarding & Tutorials
- [ ] First-time user experience
  - Welcome modal
  - Sample data option
  - Quick tour
- [ ] Interactive tutorials
  - Tooltip walkthrough
  - Feature highlights
  - Keyboard shortcuts guide
- [ ] Help documentation
  - In-app help section
  - FAQ
  - Video tutorials

**Estimated effort**: 3-4 days
**User value**: HIGH - Reduces friction for new users

#### 2.4 Accessibility Improvements
- [ ] Keyboard navigation
  - Tab order optimization
  - Keyboard shortcuts
  - Focus indicators
- [ ] Screen reader support
  - ARIA labels
  - Semantic HTML
  - Alt text for icons
- [ ] Accessibility audit
  - axe DevTools
  - WAVE evaluation
  - Fix contrast issues

**Estimated effort**: 3-4 days
**User value**: HIGH - Inclusivity matters

**Total Phase 2**: 4-6 weeks

---

### Phase 3: Advanced Features (2-3 months) 📊

**Priority: MEDIUM - Differentiation**

#### 3.1 Advanced Analytics
- [ ] Visual charts and graphs
  - Install recharts or chart.js
  - Productivity trend lines
  - Goal completion rate chart
  - Pomodoro heatmap (productive hours)
  - Weekly/monthly comparisons
- [ ] Export reports
  - PDF export
  - CSV export
  - Email report (future)
- [ ] Custom date ranges
  - Filter insights by date
  - Compare time periods
- [ ] Goal categories
  - Tag goals by type
  - Category-based insights

**Estimated effort**: 7-10 days
**User value**: MEDIUM - Power users and productivity enthusiasts

#### 3.2 Quote Collections
- [ ] Create custom collections
  - Collection name and description
  - Add quotes to collections
  - Multiple collections per quote
- [ ] Collection management
  - Browse collections
  - Edit/delete collections
  - Reorder quotes
- [ ] Collection rotation
  - Show quotes from specific collection
  - Cycle through collection
- [ ] Share collections
  - Export collection as JSON
  - Import shared collections
  - Community collections marketplace

**Estimated effort**: 5-7 days
**User value**: MEDIUM - Great for themed quotes

#### 3.3 Smart Reminders
- [ ] Natural language input
  - "remind me tomorrow at 3pm"
  - "every Monday at 9am"
  - Parse with library (chrono-node)
- [ ] Reminder templates
  - Common reminder presets
  - Quick add buttons
- [ ] Task dependencies
  - Reminder after goal completion
  - Chained reminders
- [ ] Reminder statistics
  - Completion rate
  - Most common reminder times

**Estimated effort**: 4-5 days
**User value**: MEDIUM - Convenience feature

#### 3.4 Pomodoro Enhancements
- [ ] Long break system
  - Long break after N sessions
  - Configurable long break duration
- [ ] Task integration
  - Link Pomodoro to specific goal
  - Track time per goal
  - Goal-based insights
- [ ] Focus mode
  - Block distracting websites
  - Full-screen timer
  - Minimize distractions
- [ ] Sounds & Music
  - Tick-tock sound option
  - Completion sound
  - Ambient background music
  - Volume controls
- [ ] Advanced stats
  - Focus time per day/week/month
  - Most productive hours
  - Interruption tracking

**Estimated effort**: 7-10 days
**User value**: HIGH - Core productivity feature

#### 3.5 Customization Options
- [ ] Custom color themes
  - Theme builder
  - Save custom themes
  - Share themes
- [ ] Font options
  - Font size slider
  - Font family selection
  - Accessibility fonts
- [ ] Layout preferences
  - Compact/spacious modes
  - Reorder sections
  - Hide/show sections
- [ ] Background customization
  - Upload custom image
  - Gradient backgrounds
  - Unsplash integration

**Estimated effort**: 5-7 days
**User value**: MEDIUM - Personalization

**Total Phase 3**: 8-12 weeks

---

### Phase 4: Platform Expansion (3-6 months) 🌍

**Priority: HIGH - Strategic growth**

#### 4.1 Web App (Next.js)
- [ ] Set up Next.js 14+ in `apps/web`
  - App Router
  - TypeScript
  - Tailwind CSS
- [ ] Configure LocalStorage adapter
  - Already exists in `packages/storage`
  - Wire up to Next.js app
- [ ] Reuse shared packages
  - `@cuewise/shared` - All business logic ✅
  - `@cuewise/storage` - LocalStorage adapter ✅
  - `@cuewise/ui` - All components ✅
- [ ] Add web-specific features
  - Next.js routing
  - SEO optimization
  - Landing page
  - Authentication (optional)
- [ ] Progressive Web App (PWA)
  - Service worker
  - Offline support
  - Install prompt
- [ ] Deploy to Vercel
  - CI/CD pipeline
  - Preview deployments
  - Production deployment

**Estimated effort**: 2-3 weeks
**User value**: VERY HIGH - Reaches non-extension users
**Code reuse**: ~90% (monorepo advantage!)

#### 4.2 Cloud Sync Backend
- [ ] Choose backend stack
  - **Option A**: tRPC + Prisma + PostgreSQL
  - **Option B**: Supabase (fastest)
  - **Option C**: Firebase
- [ ] Design database schema
  - Users
  - Quotes
  - Goals
  - Reminders
  - Pomodoro sessions
  - Settings
- [ ] Create CloudStorageAdapter
  - Implement StorageAdapter interface
  - Offline fallback
  - Conflict resolution
- [ ] Authentication
  - Email/password
  - OAuth (Google, GitHub)
  - Session management
- [ ] Sync logic
  - Real-time sync
  - Batch sync
  - Last-write-wins or CRDT
- [ ] API endpoints
  - CRUD operations
  - Bulk operations
  - Data export

**Estimated effort**: 4-6 weeks
**User value**: VERY HIGH - Cross-device sync

#### 4.3 Mobile App (React Native)
- [ ] Set up React Native with Expo
  - Create `apps/mobile`
  - Configure Expo
  - TypeScript setup
- [ ] Configure AsyncStorage adapter
  - Already exists in `packages/storage`
  - Test on iOS/Android
- [ ] Reuse shared packages
  - `@cuewise/shared` - All business logic ✅
  - `@cuewise/storage` - AsyncStorage adapter ✅
- [ ] Create native UI components
  - **Option A**: Create `packages/ui-native`
  - **Option B**: Use Tamagui/NativeWind
  - **Option C**: Use Gluestack UI
- [ ] Native features
  - Push notifications (expo-notifications)
  - Widgets (iOS/Android)
  - Quick capture shortcuts
  - Haptic feedback
- [ ] Navigation
  - React Navigation
  - Tab bar
  - Stack navigation
- [ ] Deploy to stores
  - Apple App Store
  - Google Play Store
  - TestFlight/Internal testing

**Estimated effort**: 6-8 weeks
**User value**: VERY HIGH - Mobile-first users
**Code reuse**: ~70-80%

**Total Phase 4**: 12-17 weeks

---

## 🐛 Technical Debt & Maintenance

### Current Issues

#### Code Quality
- [ ] Remove console.logs from production
  - Currently in 10+ files
  - Add Vite plugin to strip in build
- [ ] Reduce `any` types
  - Audit TypeScript for loose typing
  - Enable stricter TypeScript flags
- [ ] Add JSDoc comments
  - Document complex functions
  - Add examples for utilities

#### Performance
- [ ] Bundle size audit
  - Currently no analysis
  - Add rollup-plugin-visualizer
- [ ] Lazy load heavy components
  - Insights page charts
  - Settings modal
  - Quote management (future)
- [ ] Optimize re-renders
  - Check unnecessary re-renders
  - Use React.memo where needed
  - Optimize Zustand selectors

#### Testing
- [ ] Zero test coverage currently
- [ ] Add unit tests (target: 70%+ coverage)
- [ ] Add component tests (critical paths)
- [ ] Add E2E tests (Playwright)
- [ ] Set up CI/CD

#### Documentation
- [x] CLAUDE.md - Complete ✅
- [x] ARCHITECTURE.md - Complete ✅
- [x] README.md - Complete ✅
- [x] LINTING.md - Complete ✅
- [x] ROADMAP.md - This file ✅
- [ ] API documentation (JSDoc → TypeDoc)
- [ ] Component storybook (optional)

---

## 📦 Potential New Features (Backlog)

### User-Requested Features (collect from feedback)
- [ ] Multi-language support (i18n)
- [ ] Calendar integration (Google Calendar sync)
- [ ] Quote of the week email
- [ ] Social sharing (share quotes)
- [ ] Collaborative goals (team mode)
- [ ] Gamification (achievements, badges)
- [ ] AI-powered quote recommendations
- [ ] Voice input for goals/reminders
- [ ] Browser extension for Firefox/Safari
- [ ] Desktop app (Electron)

### Integration Ideas
- [ ] Notion integration
- [ ] Todoist sync
- [ ] Google Tasks sync
- [ ] Slack notifications
- [ ] Discord bot
- [ ] API for third-party integrations

---

## 🎯 Recommended Priorities (My Opinion)

### If Priority is **Getting to Market** 🚀
1. **Week 1-2**: Production polish + Chrome Web Store prep
2. **Week 3**: Submit to Chrome Web Store
3. **Week 4**: Gather user feedback, fix critical bugs
4. **Month 2**: Implement top user requests

### If Priority is **Best User Experience** ✨
1. **Week 1-2**: Quote Management Page
2. **Week 3**: Export/Import + Onboarding
3. **Week 4-5**: Accessibility improvements
4. **Week 6+**: Advanced analytics

### If Priority is **Platform Growth** 🌍
1. **Month 1**: Production polish + Chrome Web Store
2. **Month 2**: Web App (Next.js)
3. **Month 3**: Cloud Sync Backend
4. **Month 4-5**: Mobile App
5. **Month 6**: Cross-platform launch

---

## 📈 Success Metrics

### Extension Adoption
- Chrome Web Store installs
- Daily active users (DAU)
- User retention rate
- Average session time

### Engagement
- Quotes viewed per day
- Goals created per user
- Pomodoro sessions completed
- Custom quotes created

### Quality
- Bug reports
- User ratings
- Feature requests
- Support tickets

---

## 🔄 Review Schedule

- **Weekly**: Review completed tasks, plan next week
- **Monthly**: Assess roadmap priorities, gather user feedback
- **Quarterly**: Strategic review, adjust long-term goals

---

## 📝 Notes

### Architecture Strengths
- ✅ Monorepo structure enables 90% code reuse for web/mobile
- ✅ Storage adapter pattern ready for multi-platform
- ✅ Shared business logic is platform-agnostic
- ✅ TypeScript throughout ensures type safety
- ✅ Modern tech stack (React 18, Vite, Zustand)

### Current Limitations
- Single-platform (browser extension only)
- No cloud sync (local storage only)
- No user accounts
- No cross-device synchronization
- Limited analytics (client-side only)

### Future Opportunities
- Premium features (cloud sync, advanced analytics)
- Team/collaborative features
- AI-powered productivity insights
- Integration marketplace
- White-label productivity suite

---

**Version History**
- v1.0.0 (2025-01-15) - Initial roadmap after MVP completion
