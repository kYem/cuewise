# Cuewise

A cross-platform productivity suite with motivational quotes, goals, reminders, and productivity tracking. Built as a monorepo supporting browser extensions, web apps, and mobile apps.

## Features

### ✨ Currently Implemented (v1.1)
- **Motivational Quotes**: 100+ curated quotes across 10 categories
  - Inspiration, Learning, Productivity, Mindfulness, Success, Creativity, Resilience, Leadership, Health, Growth
  - Random quote display on each new tab
  - Favorite/hide quotes functionality
  - View count tracking
  - Countdown progress bar showing time until next quote
- **Custom Quote Creation**: Add your own inspiring quotes
  - Include author, category, source/reference
  - Add personal notes about why quotes are meaningful
  - Source field for book titles, URLs, or references
  - Custom quotes appear alongside curated ones
  - Floating action button for quick access
- **Daily Goals/Todos**: Simple, focused task management
  - Add goals for today with one click
  - Check off completed tasks
  - Progress bar showing completion status
  - Clear completed goals
  - Goals automatically organized by date
- **Reminders**: Smart reminder system with notifications
  - Create reminders with due dates
  - Browser notifications when reminders are due
  - Snooze functionality (5 min, 15 min, 1 hour, 1 day)
  - Recurring reminders (daily, weekly, monthly)
  - Mark reminders as completed
- **Dark Mode & Themes**: Beautiful theming system
  - Full dark mode support with smooth transitions
  - 6 color themes using OKLCH color space (Ocean Blue, Forest Green, Sunset Orange, Royal Purple, Rose Pink, Slate Gray)
  - Live theme preview sidebar with real-time feedback
  - Theme settings persist across sessions
- **Customization**: Personalize your experience
  - Unified density settings (compact/comfortable/spacious)
  - Visual density preview in settings
  - All spacing and layout adapts to your preference
- **Beautiful UI**: Clean, minimalist design with smooth animations
- **Live Clock**: Real-time display with personalized greetings (proper 12-hour format)
- **Category System**: Color-coded quote categories
- **Error Handling**: Toast notifications and graceful error boundaries

### 🚀 Planned Features
**Productivity Features:**
- Pomodoro timer (25/5 minute intervals)
- Insights dashboard with statistics
- Quote search and filtering
- Quote management page (browse, filter, bulk operations)

**Platform Expansion:**
- 📱 **Mobile App** (React Native) - Take your productivity on the go
- 🌐 **Web App** (Next.js) - Access from any browser without extension
- 🔄 **Cloud Sync** - Sync data across all platforms

## Tech Stack

### Monorepo Architecture
- **Package Manager**: pnpm with workspaces
- **Build Tool**: Turbo (turborepo) for efficient builds
- **Language**: TypeScript throughout

### Applications (`apps/`)
- `apps/browser-extension` - Browser extension (Chrome/Edge, Manifest V3)
- `apps/web` - Web application (Coming soon - Next.js)
- `apps/mobile` - Mobile app (Coming soon - React Native)

### Shared Packages (`packages/`)
- `packages/shared` - Shared business logic, types, utilities (platform-agnostic)
- `packages/storage` - Multi-platform storage adapters (Chrome Storage, localStorage, AsyncStorage)
- `packages/ui` - Shared UI components (currently web-focused, will support native)
- `packages/test-utils` - Shared testing utilities, factories, and mocks

### Technologies
- **Framework**: React 18+ with TypeScript (ES2022)
- **Build**: Vite with @crxjs/vite-plugin
- **UI**: Tailwind CSS 4 + custom components
- **State Management**: Zustand
- **Storage**: Chrome Storage API with abstraction layer
- **Testing**: Vitest + Testing Library + Fishery
- **Linting**: Biome (50x faster than ESLint)
- **Target**: Chrome/Edge (Manifest V3)

## Getting Started

### Prerequisites
- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Chrome or Edge browser

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd quote-app
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Build the extension**
   ```bash
   pnpm --filter @cuewise/browser-extension build
   ```

   Or use turbo to build all apps and packages:
   ```bash
   pnpm build
   ```

### Loading the Extension in Chrome

1. **Open Chrome Extensions page**
   - Navigate to `chrome://extensions/`
   - Or: Menu → More Tools → Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top right

3. **Load the extension**
   - Click "Load unpacked"
   - Navigate to `apps/browser-extension/dist`
   - Click "Select Folder"

4. **Test it!**
   - Open a new tab (Ctrl+T / Cmd+T)
   - You should see the motivational dashboard with a quote!

## Development

### Start development server
```bash
pnpm --filter @cuewise/browser-extension dev
```

This starts Vite in development mode with hot module replacement (HMR). The extension will automatically rebuild when you make changes.

### Build for production
```bash
pnpm build
```

### Linting and Formatting
```bash
# Check for linting and formatting issues
pnpm lint

# Auto-fix issues
pnpm lint:fix

# Format code
pnpm format
```

See [LINTING.md](./LINTING.md) for full linting documentation (we use **Biome** - 50x faster than ESLint!).

### Type checking
```bash
pnpm type-check
```

### Testing
```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @cuewise/browser-extension test

# Watch mode
pnpm --filter @cuewise/browser-extension test:watch

# Coverage report
pnpm --filter @cuewise/browser-extension test:coverage
```

### Clean build artifacts
```bash
pnpm clean
```

## Project Structure

```
cuewise/
├── apps/
│   ├── browser-extension/      # Browser extension (Chrome/Edge)
│   │   ├── src/
│   │   │   ├── components/     # React components
│   │   │   ├── stores/         # Zustand stores (with tests)
│   │   │   ├── data/           # Seed quotes data
│   │   │   ├── manifest.json   # Extension manifest
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── public/
│   │   ├── vitest.config.ts   # Test configuration
│   │   └── dist/              # Build output (load this in Chrome)
│   │
│   ├── web/                   # Web app (Coming soon)
│   └── mobile/                # React Native app (Coming soon)
│
├── packages/
│   ├── shared/               # Platform-agnostic business logic
│   │   └── src/
│   │       ├── types.ts      # Shared TypeScript types
│   │       ├── constants.ts  # Shared constants
│   │       └── utils.ts      # Shared utilities
│   │
│   ├── storage/              # Multi-platform storage
│   │   └── src/
│   │       ├── storage-interface.ts
│   │       ├── adapters/
│   │       │   ├── chrome-storage-adapter.ts  # For extension
│   │       │   ├── local-storage-adapter.ts   # For web
│   │       │   └── async-storage-adapter.ts   # For mobile
│   │       ├── chrome-storage.ts      # Legacy
│   │       └── storage-helpers.ts     # Legacy
│   │
│   ├── ui/                   # Shared UI components
│   │   └── src/
│   │       ├── components/   # React components
│   │       └── lib/          # UI utilities
│   │
│   └── test-utils/           # Shared testing utilities
│       └── src/
│           ├── factories/    # Type-safe test data factories (Fishery)
│           ├── mocks/        # Shared mocks (Chrome Storage, Zustand)
│           └── fixtures/     # Static test data
│
├── vitest.shared.ts          # Shared Vitest configuration
├── pnpm-workspace.yaml
├── turbo.json
├── biome.json
└── package.json
```

## Usage

### Refreshing Quotes
- Click the "New Quote" button to get a random quote
- The quote automatically updates on each new tab

### Favoriting Quotes
- Click the heart icon to add a quote to favorites
- Click again to remove from favorites

### Hiding Quotes
- Click the eye-off icon to hide a quote you don't want to see
- Hidden quotes won't appear in the random selection

### Managing Daily Goals
- **Add a goal**: Type in the input field and press Enter or click "Add"
- **Complete a goal**: Click the circle icon next to the goal text
- **Delete a goal**: Hover over a goal and click the trash icon
- **Track progress**: View the progress bar showing completed vs. total goals
- **Clear completed**: Remove all completed goals with one click
- Goals are automatically organized by date and reset daily

### Creating Custom Quotes
- **Open the form**: Click the floating "+" button in the bottom-right corner
- **Fill in details**:
  - Quote text (required, up to 500 characters)
  - Author (required)
  - Category (select from 10 categories)
  - Source (optional) - Book title, URL, or reference
  - Personal notes (optional, up to 300 characters) - Why this quote matters to you
- **Save**: Click "Add Quote" to save
- **View**: Your custom quotes appear randomly alongside curated quotes
- **Identify**: Custom quotes show source and notes when displayed

### Managing Reminders
- **Add a reminder**: Click the reminders icon in the top navigation
- **Set details**:
  - Reminder text (what to remember)
  - Due date and time
  - Optional: Enable recurring (daily, weekly, monthly)
- **Receive notifications**: Browser notifications when reminders are due
- **Snooze**: Postpone reminders for 5 min, 15 min, 1 hour, or 1 day
- **Complete**: Mark reminders as done when finished

## Customization

### Adding More Quotes

Edit `apps/browser-extension/src/data/seed-quotes.ts` to add new quotes:

```typescript
const NEW_CATEGORY_QUOTES = [
  { text: "Your quote here", author: "Author Name" },
  // Add more quotes...
];
```

### Changing Colors

Edit the Tailwind config in `apps/browser-extension/tailwind.config.js`:

```javascript
colors: {
  primary: {
    // Change these values
    500: '#8b5cf6',
    600: '#7c3aed',
    // ...
  }
}
```

## Testing

The project includes comprehensive testing infrastructure:

### Test Coverage
- ✅ **Quote Store**: 11 tests covering initialization, favorites, custom quotes, hiding, view tracking
- ✅ **Goal Store**: 10 tests covering CRUD operations, completion tracking, date filtering
- 🚧 **Component Tests**: Coming soon
- 🚧 **Storage Adapters**: Coming soon

### Writing Tests
Use the shared test utilities for consistent, type-safe test data:

```typescript
import { quoteFactory, goalFactory } from '@cuewise/test-utils/factories';
import { createChromeStorageMock, resetAllStores } from '@cuewise/test-utils/mocks';

// Generate test data
const quotes = quoteFactory.buildList(5);
const customQuote = customQuoteFactory.build({ author: 'Test Author' });
const goals = goalFactory.buildList(3, { date: '2025-01-15' });
```

See test files in `apps/browser-extension/src/stores/*.test.ts` for examples.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Guidelines
- Write tests for new features using Vitest
- Follow the existing code style (enforced by Biome)
- Use TypeScript strictly (no `any` types)
- Keep components small and focused
- Use shared packages for cross-platform code

### Future Development Priorities
1. **Production Polish** (Chrome Web Store preparation)
   - Remove console.logs from production build
   - Bundle size optimization and performance audit
   - Store listing assets and promotional materials
2. **Quote Management Page**
   - Browse all quotes with grid/list view
   - Filter by category, favorite status, custom vs curated
   - Search functionality and bulk operations
3. **Pomodoro Timer Integration**
   - 25/5 minute work/break intervals
   - Session tracking and statistics
4. **Insights Dashboard**
   - Visual charts and graphs
   - Productivity trends and goal completion rates
   - Advanced analytics
5. **Enhanced Features**
   - Export/import data functionality
   - Onboarding tutorials for new users
   - Accessibility improvements
6. **Platform Expansion**
   - Web app (Next.js) implementation
   - Cloud sync backend
   - Mobile app (React Native)

## License

MIT License - see LICENSE file for details

## Troubleshooting

### Extension not loading
- Make sure you selected the `apps/browser-extension/dist` folder
- Check that the build completed successfully
- Try rebuilding: `pnpm --filter @cuewise/browser-extension build`

### Quotes not displaying
- Open Chrome DevTools (F12) and check for errors
- Check Chrome Storage: DevTools → Application → Storage → Local Storage

### Build errors
- Clear node_modules: `rm -rf node_modules packages/*/node_modules`
- Reinstall: `pnpm install`
- Rebuild: `pnpm build`

## Support

If you encounter any issues or have suggestions, please open an issue on GitHub.

---

**Enjoy staying motivated and productive!** 🚀
